/**
 * Atomic tournament join — FOR UPDATE, team count, optional payment_ledger proof, idempotency, post-commit FCM + in-app notification.
 */
import express from 'express';
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { requireAuth } from '../middleware/auth.js';
import { emitTournamentSlotsUpdated } from '../realtime.js';
import { invalidateTournamentCatalogCache } from './tournamentCatalogRoutes.js';
import { enqueueFcmNotificationJob } from '../jobs/fcmNotificationQueue.js';
import { subscribeFcmTokenToTopics } from '../notifications/fcmAdmin.js';
import { fcmTopicTournament } from '../notifications/fcmTopics.js';
import { effectiveEntryFee, tournamentRequiresEntryPayment } from '../lib/tournamentEntryFee.js';
import { creditTenantWalletEntryFeeNet } from '../payments/entryPlatformFeeSplit.js';

const router = express.Router();

class JoinHttpError extends Error {
  constructor(status, body) {
    super(typeof body?.error === 'string' ? body.error : 'join failed');
    this.status = status;
    this.body = body;
  }
}

function normTag(tag) {
  return String(tag || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5) || 'TEAM';
}

function soloDefaultsFromEmail(email) {
  const e = String(email || '').toLowerCase();
  const local = e.split('@')[0] || 'player';
  const name = `${local.charAt(0).toUpperCase()}${local.slice(1)}`.slice(0, 40) || 'Solo';
  const tag = normTag(local.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'SOLO');
  return { team_name: `${name} (Solo)`, tag };
}

function resolveGameTitleKey(t, gameTemplateTitle) {
  return String(t?.game_title || gameTemplateTitle || '').trim();
}

function linkedGameHandle(gameHandles, titleKey) {
  if (!titleKey || !gameHandles || typeof gameHandles !== 'object') return '';
  if (gameHandles[titleKey]) return String(gameHandles[titleKey]).trim();
  const low = titleKey.toLowerCase();
  for (const k of Object.keys(gameHandles)) {
    if (String(k).toLowerCase() === low) return String(gameHandles[k] || '').trim();
  }
  return '';
}

/** Build roster + validate game_id when roster_size > 1. */
function normalizeAndValidateRoster({
  mode,
  rosterArr,
  rosterSize,
  captainEmail,
  captainGameId,
}) {
  const cap = String(captainEmail || '').trim().toLowerCase();
  const rs = Number(rosterSize) || 1;
  const arr = Array.isArray(rosterArr) ? [...rosterArr] : [];

  if (mode === 'solo' || rs <= 1) {
    const soloRow = {
      player_email: cap,
      player_name: cap.split('@')[0] || 'Player',
      game_id: captainGameId != null && String(captainGameId).trim() ? String(captainGameId).trim() : '',
    };
    return { rosterJson: [soloRow] };
  }

  const needTeammates = Math.max(0, rs - 1);
  if (arr.length < needTeammates) {
    throw new JoinHttpError(400, {
      error: `Roster must include at least ${needTeammates} teammate(s) for this format (${rs}-player teams)`,
      code: 'roster_too_small',
    });
  }

  const normalized = arr.slice(0, needTeammates).map((row, idx) => {
    const player_email = String(row?.player_email || row?.email || '').trim().toLowerCase();
    if (!player_email) {
      throw new JoinHttpError(400, { error: `Roster slot ${idx + 1}: player_email required`, code: 'roster_invalid' });
    }
    const game_id = row?.game_id != null ? String(row.game_id).trim() : '';
    if (!game_id) {
      throw new JoinHttpError(400, {
        error: `Roster slot ${idx + 1}: linked game ID required for team events`,
        code: 'game_id_required',
      });
    }
    return {
      player_email,
      player_name: String(row?.player_name || player_email.split('@')[0] || '').trim() || player_email.split('@')[0],
      role: row?.role || '',
      game_id,
    };
  });

  return { rosterJson: normalized };
}

async function verifyEntryFeePaid(client, { tournamentId, tenantId, fee, userEmail, proof }) {
  const ref = String(proof?.reference || '').trim();
  if (!ref) {
    throw new JoinHttpError(402, {
      error: 'Entry fee requires a completed payment — pass payment_proof.reference from your checkout provider',
      code: 'payment_required',
      amount: fee,
    });
  }
  const provider = String(proof?.provider || 'stripe').toLowerCase();
  const emailLower = String(userEmail || '').toLowerCase();

  const { rows } = await client.query(
    `SELECT id, amount, currency, provider, reference, description, created_by
     FROM payment_ledger
     WHERE tournament_id::text = $1
       AND tenant_id::text = $2::text
       AND type = 'entry_fee'
       AND status = 'completed'
       AND reference = $3
       AND COALESCE(amount, 0) >= $4
       AND (
         lower(COALESCE(created_by, '')) = $5
         OR lower(COALESCE(description, '')) LIKE '%' || $5 || '%'
       )
     LIMIT 1`,
    [tournamentId, tenantId, ref, fee, emailLower]
  );

  const row = rows[0];
  if (!row) {
    throw new JoinHttpError(402, {
      error: 'No matching completed entry_fee ledger row for this reference and account',
      code: 'payment_not_verified',
      amount: fee,
    });
  }
  if (provider !== 'ledger' && row.provider && String(row.provider).toLowerCase() !== provider) {
    throw new JoinHttpError(402, {
      error: 'Payment provider does not match ledger record',
      code: 'payment_provider_mismatch',
    });
  }
}

async function debitInternalWalletForEntry(client, { userSub, userEmail, captainEmail, tournament, fee, idempotencyKey }) {
  const cap = String(captainEmail || '')
    .trim()
    .toLowerCase();
  const uem = String(userEmail || '')
    .trim()
    .toLowerCase();
  if (cap !== uem) {
    throw new JoinHttpError(403, {
      error: 'Paying from your wallet requires you to be the team captain.',
      code: 'wallet_captain_only',
    });
  }

  const tid = String(tournament.tenant_id || '').trim();
  if (!tid) {
    throw new JoinHttpError(500, { error: 'Tournament missing tenant', code: 'bad_tournament' });
  }

  const cur = String(tournament.currency || 'USD').trim().toUpperCase() || 'USD';
  const walletRef = idempotencyKey
    ? `wallet:${String(idempotencyKey).slice(0, 180)}`
    : `wallet:${userSub}:${String(tournament.id)}:${Date.now()}`;

  const dupLedger = await client.query(
    `SELECT id FROM payment_ledger WHERE tournament_id::text = $1 AND type = 'entry_fee' AND reference = $2 LIMIT 1`,
    [String(tournament.id), walletRef]
  );
  if (dupLedger.rowCount) {
    throw new JoinHttpError(409, {
      error: 'This wallet payment reference was already used',
      code: 'wallet_already_applied',
    });
  }

  await client.query(
    `INSERT INTO user_wallets (user_id, currency, balance) VALUES ($1::uuid, $2, 0)
     ON CONFLICT (user_id, currency) DO NOTHING`,
    [userSub, cur]
  );

  const w = await client.query(
    `SELECT id, balance FROM user_wallets WHERE user_id = $1::uuid AND upper(trim(currency)) = upper(trim($2)) FOR UPDATE`,
    [userSub, cur]
  );
  if (!w.rows.length) {
    throw new JoinHttpError(402, {
      error: 'No wallet for this currency — fund your wallet first.',
      code: 'insufficient_wallet',
      balance: 0,
      required: fee,
      currency: cur,
    });
  }
  const bal = Number(w.rows[0].balance);
  if (bal + 1e-9 < fee) {
    throw new JoinHttpError(402, {
      error: 'Insufficient wallet balance for this entry fee.',
      code: 'insufficient_wallet',
      balance: bal,
      required: fee,
      currency: cur,
    });
  }

  await client.query(
    `UPDATE user_wallets SET balance = balance - $1::numeric, updated_date = NOW() WHERE id = $2`,
    [fee, w.rows[0].id]
  );

  const amountMinor = Math.round(Number(fee) * 100);
  await client.query(
    `INSERT INTO payment_ledger (tenant_id, tournament_id, type, amount, amount_minor, currency, provider, held, reference, description, status, created_by)
     VALUES ($1, $2, 'entry_fee', $3, $4, $5, 'internal_wallet', FALSE, $6, $7, 'completed', $8)`,
    [tid, String(tournament.id), fee, amountMinor, cur, walletRef, 'Tournament entry (internal wallet)', uem]
  );

  await creditTenantWalletEntryFeeNet(client, {
    tenantId: tid,
    tournamentId: String(tournament.id),
    grossMajor: fee,
    currency: cur,
    ledgerReferenceBase: walletRef,
  });
}

router.post('/tournaments/:id/join', requireAuth, async (req, res) => {
  const tournamentId = String(req.params.id || '').trim();
  const body = req.body || {};
  const mode = String(body.mode || 'team').toLowerCase() === 'solo' ? 'solo' : 'team';
  let { team_name, tag, captain_email, roster, payment_proof, captain_game_id } = body;
  const idempoKey = String(req.get('Idempotency-Key') || body.idempotency_key || '').trim();
  const userSub = String(req.user.sub || '');
  const userEmail = String(req.user.email || '').trim().toLowerCase();

  if (!tournamentId) return res.status(400).json({ error: 'tournament id required' });

  if (mode === 'solo') {
    const d = soloDefaultsFromEmail(userEmail);
    team_name = team_name != null && String(team_name).trim() ? String(team_name).trim() : d.team_name;
    tag = tag != null && String(tag).trim() ? tag : d.tag;
  }

  if (!team_name || !String(team_name).trim()) return res.status(400).json({ error: 'team_name required (or use mode: solo)' });
  if (!tag || !String(tag).trim()) return res.status(400).json({ error: 'tag required (or use mode: solo)' });

  const capEmail = String(captain_email || req.user.email || '').trim().toLowerCase();
  if (!capEmail) return res.status(400).json({ error: 'captain_email required' });

  try {
    const out = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      if (idempoKey) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [idempoKey]);
        const prev = await client.query(
          `SELECT user_sub, response_json FROM tournament_join_idempotency WHERE idempotency_key = $1`,
          [idempoKey]
        );
        if (prev.rows[0]) {
          if (String(prev.rows[0].user_sub) !== userSub) {
            throw new JoinHttpError(409, { error: 'Idempotency-Key already used by another user', code: 'idempotency_conflict' });
          }
          return { replay: true, payload: prev.rows[0].response_json };
        }
      }

      const lock = await client.query(`SELECT * FROM tournaments WHERE id::text = $1 FOR UPDATE`, [tournamentId]);
      const t = lock.rows[0];
      if (!t) throw new JoinHttpError(404, { error: 'Tournament not found' });
      if (t.status !== 'registration_open') {
        throw new JoinHttpError(400, { error: 'Registration is not open for this tournament' });
      }

      const clientHwid = String(body.client_hwid || '').trim();
      if (clientHwid) {
        const ban = await client.query(`SELECT is_hwid_platform_banned($1) AS banned`, [clientHwid]);
        if (ban.rows[0]?.banned === true) {
          throw new JoinHttpError(403, {
            error: 'This device is not allowed to register for tournaments',
            code: 'hwid_banned',
          });
        }
      }

      const { rows: cntRows } = await client.query(
        `SELECT COUNT(*)::int AS c FROM teams WHERE tournament_id::text = $1`,
        [String(t.id)]
      );
      const teamCount = cntRows[0]?.c ?? 0;
      const maxT = Number(t.max_teams || 0);
      if (maxT > 0 && teamCount >= maxT) {
        throw new JoinHttpError(409, { error: 'Tournament is full' });
      }

      const gt = await client.query(`SELECT roster_size, title FROM game_templates WHERE id::text = $1`, [
        t.game_template_id ? String(t.game_template_id) : '',
      ]);
      const rosterSize = gt.rows[0]?.roster_size != null ? Number(gt.rows[0].roster_size) : 1;

      if (mode === 'solo' && rosterSize > 1) {
        throw new JoinHttpError(400, {
          error: 'Solo quick-join is only for 1v1 tournaments — use team mode with a full roster for squad events',
          code: 'solo_not_allowed',
        });
      }

      const titleKey = resolveGameTitleKey(t, gt.rows[0]?.title);
      const needProfileHandle = Boolean(titleKey) && (mode === 'solo' || capEmail === userEmail);
      let profileGameId = '';
      if (needProfileHandle) {
        const urow = await client.query(`SELECT game_handles FROM users WHERE id::text = $1::text`, [userSub]);
        const gh = urow.rows[0]?.game_handles;
        profileGameId = linkedGameHandle(gh, titleKey);
        if (!profileGameId) {
          throw new JoinHttpError(400, {
            error: `Add your ${titleKey} game ID in Settings (game handles) before joining.`,
            code: 'game_handle_required',
            game_title: titleKey,
          });
        }
      }

      const effectiveCaptainGameId =
        captain_game_id != null && String(captain_game_id).trim()
          ? String(captain_game_id).trim()
          : profileGameId;

      let rosterJson;
      try {
        rosterJson = normalizeAndValidateRoster({
          mode,
          rosterArr: roster,
          rosterSize,
          captainEmail: capEmail,
          captainGameId: effectiveCaptainGameId,
        }).rosterJson;
      } catch (e) {
        if (e instanceof JoinHttpError) throw e;
        throw e;
      }

      const fee = effectiveEntryFee(t);
      const needsPay = tournamentRequiresEntryPayment(t);
      if (needsPay) {
        const proof = payment_proof;
        if (proof && String(proof.method || '').toLowerCase() === 'wallet') {
          await debitInternalWalletForEntry(client, {
            userSub,
            userEmail,
            captainEmail: capEmail,
            tournament: t,
            fee,
            idempotencyKey: idempoKey,
          });
        } else {
          await verifyEntryFeePaid(client, {
            tournamentId: String(t.id),
            tenantId: t.tenant_id,
            fee,
            userEmail: capEmail,
            proof: payment_proof,
          });
        }
      }

      const tagNorm = normTag(tag);
      const ins = await client.query(
        `INSERT INTO teams (tenant_id, tournament_id, name, tag, captain_email, roster, status)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'registered')
         RETURNING *`,
        [t.tenant_id, String(t.id), String(team_name).trim(), tagNorm, capEmail, JSON.stringify(rosterJson)]
      );

      await client.query(
        `UPDATE tournaments
         SET registered_teams = (SELECT COUNT(*)::int FROM teams WHERE tournament_id::text = $1),
             updated_date = NOW()
         WHERE id::text = $1`,
        [String(t.id)]
      );

      const fresh = await client.query(`SELECT * FROM tournaments WHERE id::text = $1`, [String(t.id)]);
      const team = ins.rows[0];
      const tournament = fresh.rows[0];

      const payload = { team, tournament };
      if (idempoKey) {
        await client.query(
          `INSERT INTO tournament_join_idempotency (idempotency_key, user_sub, response_json) VALUES ($1, $2, $3::jsonb)`,
          [idempoKey, userSub, JSON.stringify(payload)]
        );
      }
      return { replay: false, payload };
    });

    if (out.replay) {
      return res.status(200).json(out.payload);
    }

    const { team, tournament } = out.payload;

    invalidateTournamentCatalogCache();
    emitTournamentSlotsUpdated(tournament);

    enqueueFcmNotificationJob({
      kind: 'tournament_joined',
      user_sub: userSub,
      title: `Registered: ${tournament.name}`,
      body: `You joined as ${team.name} [${team.tag}]. Open the lobby when the bracket is ready.`,
      data: {
        tournament_id: String(tournament.id),
        team_id: String(team.id),
      },
      tournament_id: String(tournament.id),
      tournament_name: tournament.name,
      user_email: capEmail,
      team_id: team.id,
    });

    try {
      const { rows: tokRows } = await runWithRls(pool, { isPlatformAdmin: true }, (c) =>
        c.query(`SELECT token FROM user_fcm_tokens WHERE user_id = $1::uuid`, [userSub])
      );
      const tTopic = fcmTopicTournament(String(tournament.id));
      for (const row of tokRows) {
        if (row.token) await subscribeFcmTokenToTopics(row.token, [tTopic]);
      }
    } catch (e) {
      console.warn('[join] fcm tournament topic', e.message);
    }

    try {
      await runWithRls(pool, { userEmail: capEmail, tenantId: tournament.tenant_id || '' }, (nClient) =>
        nClient.query(
          `INSERT INTO notifications (user_email, type, title, body, link, tournament_id)
           VALUES ($1, 'tournament_registered', $2, $3, $4, $5)`,
          [
            capEmail,
            `Registered: ${tournament.name}`,
            `You joined as ${team.name} [${team.tag}]. Open the lobby when the bracket is ready.`,
            `/tournaments/${tournament.id}/lobby`,
            String(tournament.id),
          ]
        )
      );
    } catch (e) {
      console.error('[join] notification insert', e.message);
    }

    console.info('[join confirmation email stub]', {
      to: capEmail,
      tournament: tournament.name,
      tournament_id: String(tournament.id),
    });

    res.status(201).json({ team, tournament });
  } catch (e) {
    if (e instanceof JoinHttpError) {
      return res.status(e.status).json(e.body);
    }
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
