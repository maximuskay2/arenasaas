import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import {
  derivePlacements,
  computeSettlementAmounts,
  normalizePrizeStructure,
  findFinalMatch,
  findDoubleElimGrandFinalMatch,
} from './prizeCalculator.js';
import { enqueueFcmNotificationJob } from '../jobs/fcmNotificationQueue.js';
import { recomputeLeagueStandings } from './leagueStandings.js';

async function captainUserIdForTeam(client, teamId) {
  const { rows } = await client.query(`SELECT captain_email FROM teams WHERE id::text = $1 LIMIT 1`, [String(teamId)]);
  const email = rows[0]?.captain_email ? String(rows[0].captain_email).trim().toLowerCase() : '';
  if (!email) return null;
  const u = await client.query(`SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`, [email]);
  return u.rows[0]?.id || null;
}

async function grantParticipationAccolades(client, tournament, tenantId, badgeId) {
  const tourId = String(tournament.id);
  const title = String(tournament.name || 'Tournament');
  const { rows: teams } = await client.query(`SELECT captain_email, roster FROM teams WHERE tournament_id::text = $1`, [
    tourId,
  ]);
  const emails = new Set();
  for (const t of teams) {
    if (t.captain_email) emails.add(String(t.captain_email).trim().toLowerCase());
    const roster = Array.isArray(t.roster) ? t.roster : [];
    for (const p of roster) {
      const e = p?.player_email;
      if (e) emails.add(String(e).trim().toLowerCase());
    }
  }
  if (!emails.size) return;
  const { rows: users } = await client.query(`SELECT id FROM users WHERE lower(email) = ANY($1::text[])`, [
    [...emails],
  ]);
  const meta = JSON.stringify({ kind: 'participation', tournament_id: tourId });
  for (const u of users) {
    await client.query(
      `INSERT INTO user_accolades (user_id, tenant_id, tournament_id, tournament_title, rank, badge_id, metadata)
       VALUES ($1::uuid, $2, $3, $4, 0, $5, $6::jsonb)
       ON CONFLICT (user_id, tournament_id, rank) DO NOTHING`,
      [u.id, tenantId, tourId, title, badgeId, meta]
    );
  }
}

/**
 * @param {string} tournamentId
 * @param {string} tenantId
 */
export async function runTournamentPrizePayout(tournamentId, tenantId) {
  const tid = String(tenantId || '').trim();
  const tourId = String(tournamentId || '').trim();
  if (!tid || !tourId) return;

  await runWithRls(
    pool,
    { tenantId: tid, systemPrizeWorker: true, userId: '', userEmail: '', isPlatformAdmin: false },
    async (client) => {
      await client.query(
        `UPDATE tournaments SET payout_job_status = 'running', updated_date = NOW() WHERE id::text = $1 AND tenant_id = $2`,
        [tourId, tid]
      );

      const { rows: trows } = await client.query(`SELECT * FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`, [
        tourId,
        tid,
      ]);
      const tournament = trows[0];
      if (!tournament) {
        await client.query(`UPDATE tournaments SET payout_job_status = 'failed', updated_date = NOW() WHERE id::text = $1`, [tourId]);
        return;
      }

      const { rows: mrows } = await client.query(
        `SELECT * FROM matches WHERE tournament_id::text = $1 ORDER BY round ASC, match_number ASC`,
        [tourId]
      );

      const fmt = String(tournament.format || '');
      const finalMatchForMeta =
        fmt === 'double_elimination' ? findDoubleElimGrandFinalMatch(mrows) : findFinalMatch(mrows);
      let standingsRows = [];
      if (fmt === 'round_robin' || fmt === 'swiss') {
        await recomputeLeagueStandings(client, tourId, tid, fmt);
        const { rows: sr } = await client.query(
          `SELECT * FROM tournament_league_standings WHERE tournament_id::text = $1 AND tenant_id = $2`,
          [tourId, tid]
        );
        standingsRows = sr;
      }

      const placements = derivePlacements(mrows, { format: fmt, standingsRows });
      if (!placements.length) {
        const ps0 = normalizePrizeStructure(tournament.prize_structure);
        if (ps0?.participation_badge) {
          await grantParticipationAccolades(client, tournament, tid, ps0.participation_badge);
        }
        await client.query(
          `UPDATE tournaments SET payout_job_status = 'completed', updated_date = NOW() WHERE id::text = $1`,
          [tourId]
        );
        return;
      }

      let settlement;
      try {
        settlement = await computeSettlementAmounts({
          client,
          tournament,
          placements,
        });
      } catch (e) {
        console.error('[prizePayout]', tourId, e);
        await client.query(`UPDATE tournaments SET payout_job_status = 'failed', updated_date = NOW() WHERE id::text = $1`, [tourId]);
        return;
      }

      console.info(
        '[prizePayout] settlement',
        JSON.stringify({
          tournament_id: tourId,
          tenant_id: tid,
          format: fmt,
          payout_lines: settlement.lines.length,
          sum: settlement.sum,
          net_pot: settlement.netPot,
        })
      );

      const title = String(tournament.name || 'Tournament');
      const tourKey = String(tournament.id);

      for (const line of settlement.lines) {
        const userId = await captainUserIdForTeam(client, line.team_id);
        if (!userId) {
          console.warn('[prizePayout] no captain user for team', line.team_id);
          continue;
        }

        const ref = `prize_payout:${tourKey}:${line.rank}:${userId}`;
        const amountMinor = Math.round(Number(line.amount) * 100);
        const cur = String(line.currency || 'USD').toUpperCase().slice(0, 8);

        const ledgerIns = await client.query(
          `INSERT INTO payment_ledger (tenant_id, tournament_id, type, amount, amount_minor, currency, provider, held, reference, description, beneficiary_user_id, status)
           VALUES ($1, $2, 'prize_payout', $3::numeric, $4, $5, 'internal', FALSE, $6, $7, $8::uuid, 'completed')
           ON CONFLICT (reference) WHERE (reference IS NOT NULL AND btrim(reference) <> '') DO NOTHING
           RETURNING id`,
          [
            tid,
            tourKey,
            line.amount,
            amountMinor,
            cur,
            ref,
            `Prize rank ${line.rank} — ${title}`,
            userId,
          ]
        );
        if (!ledgerIns.rowCount) continue;

        await client.query(
          `INSERT INTO user_wallets (user_id, currency, balance, updated_date)
           VALUES ($1::uuid, $2, $3::numeric, NOW())
           ON CONFLICT (user_id, currency) DO UPDATE SET
             balance = user_wallets.balance + EXCLUDED.balance,
             updated_date = NOW()`,
          [userId, cur, line.amount]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_email, actor_role, details, tournament_id)
           VALUES ($1, 'prize_credit', 'user_wallet', $2, 'system@arena', 'system', $3, $4)`,
          [
            tid,
            String(userId),
            `[System] Credited ${cur} ${Number(line.amount).toFixed(2)} to user (rank ${line.rank}) — ${title}`,
            tourKey,
          ]
        );

        let finalOpponentTeamId = null;
        if (finalMatchForMeta && (line.rank === 1 || line.rank === 2)) {
          const wid = String(line.team_id);
          const ta = String(finalMatchForMeta.team_a_id || '');
          const tb = String(finalMatchForMeta.team_b_id || '');
          if (wid === ta) finalOpponentTeamId = tb || null;
          else if (wid === tb) finalOpponentTeamId = ta || null;
        }
        const meta = {
          tournament_name: title,
          date: new Date().toISOString().slice(0, 10),
          rank: line.rank,
          badge_id: line.badge_id,
          team_id: line.team_id,
          final_opponent_team_id: finalOpponentTeamId,
        };
        await client.query(
          `INSERT INTO user_accolades (user_id, tenant_id, tournament_id, tournament_title, rank, badge_id, metadata)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (user_id, tournament_id, rank) DO NOTHING`,
          [userId, tid, tourKey, title, line.rank, line.badge_id, JSON.stringify(meta)]
        );

        await client.query(
          `INSERT INTO feed_posts (tournament_id, tenant_id, author_email, author_name, role, content, pinned)
           VALUES ($1, $2, 'system@arena', 'Arena', 'organizer', $3, FALSE)`,
          [
            tourKey,
            tid,
            `Victory achieved — a champion claimed ${ordinal(line.rank)} place in ${title}!`,
          ]
        );

        enqueueFcmNotificationJob({
          user_id: String(userId),
          title: 'Victory confirmed',
          body: `${cur} ${Number(line.amount).toFixed(2)} credited to your vault for ${title}.`,
        });
      }

      const psDone = normalizePrizeStructure(tournament.prize_structure);
      if (psDone?.participation_badge) {
        await grantParticipationAccolades(client, tournament, tid, psDone.participation_badge);
      }

      await client.query(
        `UPDATE tournaments SET payout_job_status = 'completed', updated_date = NOW() WHERE id::text = $1`,
        [tourId]
      );
    }
  );
}

function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}
