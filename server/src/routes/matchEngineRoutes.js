import express from 'express';
import multer from 'multer';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';
import { emitMatchUpdated, emitMatchCenterFeed } from '../realtime.js';
import { advanceWinnerToNextMatch } from '../lib/matchBracketServer.js';
import { applyMatchEloUpdate } from '../lib/matchEloHook.js';
import { insertTournamentArchive } from '../lib/tournamentArchive.js';
import { scorePickEmPredictions } from '../lib/pickemScore.js';
import {
  buildPrizeSummary,
  derivePlacements,
  computeSettlementAmounts,
  normalizePrizeStructure,
} from '../lib/prizeCalculator.js';
import { enqueuePrizePayoutJob } from '../jobs/prizePayoutQueue.js';
import { recomputeLeagueStandings } from '../lib/leagueStandings.js';
import { notifyTenantStaffScoreDisputed } from '../lib/tenantStaffNotifications.js';

const router = express.Router();
const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function refreshLeagueStandingsIfNeeded(client, matchRow) {
  const tourId = String(matchRow?.tournament_id || '').trim();
  const ten = String(matchRow?.tenant_id || '').trim();
  if (!tourId || !ten) return;
  const { rows } = await client.query(
    `SELECT format FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
    [tourId, ten]
  );
  await recomputeLeagueStandings(client, tourId, ten, String(rows[0]?.format || ''));
}

async function applyEloForCompletedMatch(client, completed) {
  try {
    await applyMatchEloUpdate(client, completed);
  } catch (e) {
    console.error('[match-engine] elo update', e);
  }
}

function tenantHeader(req) {
  return String(req.headers['x-tenant-id'] || req.headers['X-Tenant-ID'] || '').trim();
}

async function assertStaff(client, userId, tenantId) {
  const { rows } = await client.query(
    `SELECT 1 FROM user_tenants
     WHERE user_id = $1::uuid AND tenant_id = $2
       AND role_in_tenant IN ('organizer', 'admin', 'staff')
     LIMIT 1`,
    [userId, tenantId]
  );
  return rows.length > 0;
}

function userOnTeam(team, email) {
  const e = String(email || '').toLowerCase();
  if (!e) return false;
  if (String(team.captain_email || '').toLowerCase() === e) return true;
  const roster = team.roster;
  if (!Array.isArray(roster)) return false;
  return roster.some((p) => String(p?.player_email || '').toLowerCase() === e);
}

/** Latest pending report per team_id for a match */
async function loadReportsByTeam(client, matchId) {
  const { rows } = await client.query(
    `SELECT * FROM match_reports WHERE match_id::text = $1 AND status = 'pending' ORDER BY created_date DESC`,
    [String(matchId)]
  );
  const map = new Map();
  for (const r of rows) {
    const key = String(r.team_id || r.submitted_by || '');
    if (!key || map.has(key)) continue;
    map.set(key, r);
  }
  return [...map.values()];
}

router.post('/matches/:matchId/evidence', requireAuth, evidenceUpload.array('screenshots', 8), async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  const matchId = String(req.params.matchId || '');
  const files = req.files;
  if (!Array.isArray(files) || !files.length) {
    return res.status(400).json({ error: 'screenshots required (multipart field "screenshots")' });
  }
  try {
    const urls = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const { rows: mrows } = await client.query(
        `SELECT * FROM matches WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
        [matchId, tenantId]
      );
      const match = mrows[0];
      if (!match) return null;
      const { rows: teams } = await client.query(`SELECT * FROM teams WHERE id::text = ANY($1::text[])`, [
        [String(match.team_a_id), String(match.team_b_id)],
      ]);
      const teamA = teams.find((t) => String(t.id) === String(match.team_a_id));
      const teamB = teams.find((t) => String(t.id) === String(match.team_b_id));
      if (!teamA || !teamB) return { bad: 'Teams not found' };

      const email = String(req.user.email || '').toLowerCase();
      let ok = userOnTeam(teamA, email) || userOnTeam(teamB, email);
      if (!ok && req.user.role === 'admin') ok = true;
      if (!ok) return { bad: 'Not a roster member of either team' };

      return files.slice(0, 8).map((f) => {
        const b64 = f.buffer.toString('base64');
        const mime = f.mimetype || 'application/octet-stream';
        return `data:${mime};base64,${b64}`;
      });
    });
    if (urls === null) return res.status(404).json({ error: 'Match not found' });
    if (urls && typeof urls === 'object' && !Array.isArray(urls) && urls.bad) {
      return res.status(urls.bad === 'Teams not found' ? 400 : 403).json({ error: urls.bad });
    }
    if (!Array.isArray(urls)) return res.status(500).json({ error: 'Unexpected upload response' });
    res.json({ urls, message: 'Dev: data URLs; swap for object storage in production' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.use(express.json({ limit: '2mb' }));

router.get('/disputes', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  try {
    const out = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const okStaff = await assertStaff(client, req.user.sub, tenantId);
      if (!okStaff && req.user.role !== 'admin') return { forbidden: true, rows: [] };
      const { rows } = await client.query(
        `SELECT m.*, t.name AS tournament_name,
           (SELECT COUNT(*)::int FROM match_reports mr WHERE mr.match_id::text = m.id::text AND mr.status = 'disputed') AS disputed_report_count
         FROM matches m
         INNER JOIN tournaments t ON t.id::text = m.tournament_id::text AND t.tenant_id = m.tenant_id
         WHERE m.tenant_id = $1
           AND (
             m.status = 'under_dispute'
             OR EXISTS (
               SELECT 1 FROM match_reports mr2
               WHERE mr2.match_id::text = m.id::text AND mr2.status = 'disputed'
             )
           )
         ORDER BY m.updated_date DESC NULLS LAST
         LIMIT 100`,
        [tenantId]
      );
      return { rows };
    });
    if (out.forbidden) return res.status(403).json({ error: 'Forbidden' });
    res.json({ disputes: out.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/tournaments/:id/prize-preview', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  try {
    const row = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const { rows } = await client.query(`SELECT * FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`, [
        req.params.id,
        tenantId,
      ]);
      return rows[0] || null;
    });
    if (!row) return res.status(404).json({ error: 'Tournament not found' });
    res.json({ prize_summary: buildPrizeSummary(row) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/matches/:matchId/report-result', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  const matchId = String(req.params.matchId || '');
  const { score_a: sa, score_b: sb, screenshot_urls: shots, pov_link: pov } = req.body || {};
  const scoreA = Number(sa);
  const scoreB = Number(sb);
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA < 0 || scoreB < 0) {
    return res.status(400).json({ error: 'score_a and score_b must be non-negative numbers' });
  }

  try {
    const result = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const { rows: mrows } = await client.query(
        `SELECT * FROM matches WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
        [matchId, tenantId]
      );
      const match = mrows[0];
      if (!match) return { error: 'Match not found', status: 404 };
      if (match.status === 'under_dispute') return { error: 'Match is under dispute', status: 409 };
      if (match.status === 'completed') return { error: 'Match already completed', status: 409 };
      if (!match.team_a_id || !match.team_b_id) return { error: 'Match teams not set', status: 400 };

      const { rows: teams } = await client.query(`SELECT * FROM teams WHERE id::text = ANY($1::text[])`, [
        [String(match.team_a_id), String(match.team_b_id)],
      ]);
      const teamA = teams.find((t) => String(t.id) === String(match.team_a_id));
      const teamB = teams.find((t) => String(t.id) === String(match.team_b_id));
      if (!teamA || !teamB) return { error: 'Teams not found', status: 400 };

      const email = String(req.user.email || '').toLowerCase();
      let sideTeam = null;
      if (userOnTeam(teamA, email)) sideTeam = teamA;
      else if (userOnTeam(teamB, email)) sideTeam = teamB;
      else return { error: 'Not a roster member of either team', status: 403 };

      const teamId = String(sideTeam.id);
      const urls = Array.isArray(shots) ? shots.map((u) => String(u)).filter(Boolean).slice(0, 8) : [];

      await client.query(`DELETE FROM match_reports WHERE match_id::text = $1 AND team_id::text = $2 AND status = 'pending'`, [
        matchId,
        teamId,
      ]);

      await client.query(
        `INSERT INTO match_reports (match_id, tournament_id, tenant_id, submitted_by, team_id, reported_score_a, reported_score_b, screenshot_urls, notes, status, pov_link)
         VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6, $7, $8::text[], $9, 'pending', $10)`,
        [
          matchId,
          String(match.tournament_id),
          tenantId,
          String(req.user.sub),
          teamId,
          scoreA,
          scoreB,
          urls,
          null,
          pov ? String(pov).slice(0, 2000) : null,
        ]
      );

      const byTeam = await loadReportsByTeam(client, matchId);
      const teamIds = new Set(byTeam.map((r) => String(r.team_id || r.submitted_by)));
      if (teamIds.size < 2) {
        const { rows: updated } = await client.query(`SELECT * FROM matches WHERE id::text = $1 LIMIT 1`, [matchId]);
        return { ok: true, match: updated[0], resolved: false };
      }

      const rA = byTeam.find((r) => String(r.team_id) === String(match.team_a_id));
      const rB = byTeam.find((r) => String(r.team_id) === String(match.team_b_id));
      if (!rA || !rB) {
        const { rows: updated } = await client.query(`SELECT * FROM matches WHERE id::text = $1 LIMIT 1`, [matchId]);
        return { ok: true, match: updated[0], resolved: false };
      }

      const same =
        Number(rA.reported_score_a) === Number(rB.reported_score_a) &&
        Number(rA.reported_score_b) === Number(rB.reported_score_b);

      if (!same) {
        await client.query(`UPDATE match_reports SET status = 'disputed', updated_date = NOW() WHERE match_id::text = $1`, [matchId]);
        const v = Number(match.version) || 1;
        await client.query(
          `UPDATE matches SET status = 'under_dispute', version = version + 1, updated_date = NOW()
           WHERE id::text = $1 AND version = $2`,
          [matchId, v]
        );
        const { rows: updated } = await client.query(`SELECT * FROM matches WHERE id::text = $1 LIMIT 1`, [matchId]);
        return { ok: true, match: updated[0], resolved: false, disputed: true };
      }

      const canonA = Number(rA.reported_score_a);
      const canonB = Number(rA.reported_score_b);

      const winnerId =
        canonA > canonB ? String(match.team_a_id) : canonB > canonA ? String(match.team_b_id) : null;
      const winnerName =
        canonA > canonB ? String(match.team_a_name || '') : canonB > canonA ? String(match.team_b_name || '') : '';

      if (!winnerId) {
        await client.query(`UPDATE match_reports SET status = 'disputed', updated_date = NOW() WHERE match_id::text = $1`, [matchId]);
        const v = Number(match.version) || 1;
        await client.query(
          `UPDATE matches SET status = 'under_dispute', version = version + 1, updated_date = NOW()
           WHERE id::text = $1 AND version = $2`,
          [matchId, v]
        );
        const { rows: updated } = await client.query(`SELECT * FROM matches WHERE id::text = $1 LIMIT 1`, [matchId]);
        return { ok: true, match: updated[0], disputed: true };
      }

      await client.query(`UPDATE match_reports SET status = 'approved', updated_date = NOW() WHERE match_id::text = $1`, [matchId]);

      const v = Number(match.version) || 1;
      const { rows: done } = await client.query(
        `UPDATE matches SET
           score_a = $2::int,
           score_b = $3::int,
           winner_id = $4::text,
           winner_name = $5::text,
           status = 'completed',
           version = version + 1,
           updated_date = NOW()
         WHERE id::text = $1 AND version = $6
         RETURNING *`,
        [matchId, canonA, canonB, winnerId, winnerName, v]
      );
      const completed = done[0];
      if (!completed) return { error: 'Concurrent match update — retry', status: 409 };

      const next = await advanceWinnerToNextMatch(client, completed);
      if (next) emitMatchUpdated(next);
      emitMatchUpdated(completed);
      await refreshLeagueStandingsIfNeeded(client, completed);
      await applyEloForCompletedMatch(client, completed);

      return { ok: true, match: completed, resolved: true, advanced_to: next || null };
    });

    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    if (result.disputed && result.match) {
      void notifyTenantStaffScoreDisputed(pool, tenantId, result.match).catch((err) =>
        console.error('[match-engine] staff dispute notify', err)
      );
    }
    if (result.match?.status === 'completed' && result.resolved) {
      const c = result.match;
      emitMatchCenterFeed(String(c.id), {
        type: 'score',
        headline: `${c.winner_name || 'Winner'} takes the map`,
        body: `Final score ${c.score_a}-${c.score_b}`,
        matchId: String(c.id),
      });
      if (result.advanced_to) {
        emitMatchCenterFeed(String(c.id), {
          type: 'bracket',
          headline: `${c.winner_name || 'Winner'} advances`,
          body: 'Bracket slot updated',
        });
        const nx = result.advanced_to;
        emitMatchCenterFeed(String(nx.id), {
          type: 'bracket',
          headline: 'Next slot filled',
          body: `${nx.team_a_name || 'TBD'} vs ${nx.team_b_name || 'TBD'}`,
          matchId: String(nx.id),
        });
      }
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/matches/:matchId/reports', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  try {
    const rows = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const { rows: mrows } = await client.query(
        `SELECT id FROM matches WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
        [req.params.matchId, tenantId]
      );
      if (!mrows[0]) return null;
      const { rows: r } = await client.query(
        `SELECT * FROM match_reports WHERE match_id::text = $1 ORDER BY created_date DESC`,
        [req.params.matchId]
      );
      return r;
    });
    if (rows === null) return res.status(404).json({ error: 'Match not found' });
    res.json({ reports: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.patch('/matches/:matchId/resolve-dispute', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  const matchId = String(req.params.matchId || '');
  const { score_a: sa, score_b: sb, review_notes: notes } = req.body || {};
  const scoreA = Number(sa);
  const scoreB = Number(sb);
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
    return res.status(400).json({ error: 'score_a and score_b required' });
  }

  try {
    const result = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const okStaff = await assertStaff(client, req.user.sub, tenantId);
      if (!okStaff && req.user.role !== 'admin') return { error: 'Forbidden', status: 403 };

      const { rows: mrows } = await client.query(
        `SELECT * FROM matches WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
        [matchId, tenantId]
      );
      const match = mrows[0];
      if (!match) return { error: 'Match not found', status: 404 };

      const winnerId =
        scoreA > scoreB ? String(match.team_a_id) : scoreB > scoreA ? String(match.team_b_id) : null;
      const winnerName =
        scoreA > scoreB ? String(match.team_a_name || '') : scoreB > scoreA ? String(match.team_b_name || '') : '';
      if (!winnerId) return { error: 'Draw not supported — pick a winner', status: 400 };

      await client.query(
        `UPDATE match_reports SET status = 'approved', review_notes = $2, reviewed_by = $3, updated_date = NOW()
         WHERE match_id::text = $1`,
        [matchId, notes ? String(notes).slice(0, 2000) : null, String(req.user.sub)]
      );

      const v = Number(match.version) || 1;
      const { rows: done } = await client.query(
        `UPDATE matches SET
           score_a = $2::int,
           score_b = $3::int,
           winner_id = $4::text,
           winner_name = $5::text,
           status = 'completed',
           version = version + 1,
           updated_date = NOW()
         WHERE id::text = $1 AND version = $6
         RETURNING *`,
        [matchId, scoreA, scoreB, winnerId, winnerName, v]
      );
      const completed = done[0];
      if (!completed) return { error: 'Concurrent match update', status: 409 };

      const next = await advanceWinnerToNextMatch(client, completed);
      if (next) emitMatchUpdated(next);
      emitMatchUpdated(completed);
      await refreshLeagueStandingsIfNeeded(client, completed);
      await applyEloForCompletedMatch(client, completed);
      return { ok: true, match: completed, advanced_to: next || null };
    });

    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    if (result.match?.status === 'completed') {
      const c = result.match;
      emitMatchCenterFeed(String(c.id), {
        type: 'dispute_resolved',
        headline: `${c.winner_name || 'Winner'} confirmed`,
        body: `Score ${c.score_a}-${c.score_b}`,
        matchId: String(c.id),
      });
      if (result.advanced_to) {
        emitMatchCenterFeed(String(c.id), {
          type: 'bracket',
          headline: `${c.winner_name || 'Winner'} advances`,
          body: 'Bracket slot updated',
        });
        const nx = result.advanced_to;
        emitMatchCenterFeed(String(nx.id), {
          type: 'bracket',
          headline: 'Next slot filled',
          body: `${nx.team_a_name || 'TBD'} vs ${nx.team_b_name || 'TBD'}`,
          matchId: String(nx.id),
        });
      }
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

function isPlatformAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

router.post('/tournaments/:id/finalize', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  const tourId = String(req.params.id || '');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const finalizeOverride =
    body.finalize_override === true || body.finalize_override === 'true' || body.finalize_override === 1;
  if (finalizeOverride && !isPlatformAdminRole(req.user.role)) {
    return res.status(403).json({ error: 'finalize_override is restricted to platform administrators', code: 'finalize_override_forbidden' });
  }

  try {
    const result = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const okStaff = await assertStaff(client, req.user.sub, tenantId);
      if (!okStaff && !isPlatformAdminRole(req.user.role)) return { error: 'Forbidden', status: 403 };

      const { rows: trows } = await client.query(`SELECT * FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`, [
        tourId,
        tenantId,
      ]);
      const tournament = trows[0];
      if (!tournament) return { error: 'Tournament not found', status: 404 };
      const payoutSt = String(tournament.payout_job_status || 'idle');
      if (
        String(tournament.status) === 'completed' &&
        tournament.finalized_at &&
        ['queued', 'running', 'completed'].includes(payoutSt)
      ) {
        return { error: 'Tournament already finalized', status: 409 };
      }

      const { rows: mrows } = await client.query(`SELECT * FROM matches WHERE tournament_id::text = $1`, [tourId]);
      if (mrows.length === 0) return { error: 'No matches to verify', status: 400 };

      if (!finalizeOverride) {
        const bad = mrows.some((m) => !['completed', 'forfeited', 'no_show'].includes(String(m.status)));
        if (bad) return { error: 'All matches must be completed, forfeited, or no-show', status: 400 };

        const disputed = mrows.some((m) => String(m.status) === 'under_dispute');
        if (disputed) return { error: 'Resolve disputed matches before finalize', status: 400 };

        const { rows: pend } = await client.query(
          `SELECT 1 FROM match_reports mr
           INNER JOIN matches m ON m.id::text = mr.match_id::text
           WHERE m.tournament_id::text = $1 AND mr.status = 'disputed' LIMIT 1`,
          [tourId]
        );
        if (pend.rowCount) return { error: 'Open disputed reports remain', status: 400 };
      } else {
        await client.query(
          `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_email, actor_role, details, tournament_id)
           VALUES ($1, 'finalize_override', 'tournament', $2, $3, $4, $5, $2)`,
          [
            tenantId,
            tourId,
            String(req.user.email || ''),
            String(req.user.role || ''),
            JSON.stringify({
              note: 'Skipped match terminal + dispute integrity checks; prize validation still applied.',
            }),
          ]
        );
      }

      const ps = normalizePrizeStructure(tournament.prize_structure);
      if (!ps || !ps.ranks?.length) {
        await client.query(
          `UPDATE tournaments SET
             status = 'completed',
             finalized_at = NOW(),
             payout_job_status = 'completed',
             updated_date = NOW()
           WHERE id::text = $1`,
          [tourId]
        );
        try {
          await insertTournamentArchive(client, tourId, tenantId);
        } catch (e) {
          console.error('[finalize] archive', e);
        }
        return {
          ok: true,
          tournament_id: tourId,
          payout_job: 'skipped_no_structure',
          finalize_override_applied: finalizeOverride,
        };
      }

      const fmt = String(tournament.format || '');
      let standingsRows = [];
      if (fmt === 'round_robin' || fmt === 'swiss') {
        await recomputeLeagueStandings(client, tourId, tenantId, fmt);
        const { rows: sr } = await client.query(
          `SELECT * FROM tournament_league_standings WHERE tournament_id::text = $1 AND tenant_id = $2`,
          [tourId, tenantId]
        );
        standingsRows = sr;
      }

      const placements = derivePlacements(mrows, { format: fmt, standingsRows });
      try {
        await computeSettlementAmounts({ client, tournament, placements });
      } catch (e) {
        return { error: e.message || 'Prize validation failed', status: 400 };
      }

      await client.query(
        `UPDATE tournaments SET
           status = 'completed',
           finalized_at = NOW(),
           payout_job_status = 'queued',
           updated_date = NOW()
         WHERE id::text = $1`,
        [tourId]
      );

      try {
        await insertTournamentArchive(client, tourId, tenantId);
      } catch (e) {
        console.error('[finalize] archive', e);
      }

      return {
        ok: true,
        tournament_id: tourId,
        payout_job: 'queued',
        finalize_override_applied: finalizeOverride,
      };
    });

    if (result.error) return res.status(result.status || 400).json({ error: result.error });

    try {
      await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
        await scorePickEmPredictions(client, tourId, tenantId);
      });
    } catch (e) {
      console.error('[finalize] pickem settle', e);
    }

    if (result.payout_job === 'queued') {
      await enqueuePrizePayoutJob({ tournament_id: tourId, tenant_id: tenantId });
    }
    res.json({
      ok: true,
      tournament_id: tourId,
      payout_job: result.payout_job,
      finalize_override_applied: !!result.finalize_override_applied,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/tournaments/:id/finalize-status', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  try {
    const row = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const { rows } = await client.query(
        `SELECT id, status, finalized_at, payout_job_status FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
        [req.params.id, tenantId]
      );
      return rows[0] || null;
    });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Pick'Em: open while status is registration_closed (before in_progress). */
router.get('/tournaments/:id/pickem', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  const tourId = String(req.params.id || '');
  try {
    const out = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const { rows: trows } = await client.query(
        `SELECT id, name, status FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
        [tourId, tenantId]
      );
      const tournament = trows[0];
      if (!tournament) return { notfound: true };
      const windowOpen = String(tournament.status) === 'registration_closed';
      const { rows: matches } = await client.query(
        `SELECT id, round, match_number, team_a_id, team_b_id, team_a_name, team_b_name, winner_id, status
         FROM matches WHERE tournament_id::text = $1 ORDER BY round ASC, match_number ASC`,
        [tourId]
      );
      const { rows: pred } = await client.query(
        `SELECT * FROM user_predictions WHERE tournament_id::text = $1 AND user_id = $2::uuid LIMIT 1`,
        [tourId, req.user.sub]
      );
      const { rows: leaders } = await client.query(
        `SELECT p.user_id, p.pickem_score, p.correct_picks, p.pickem_settled
         FROM user_predictions p
         WHERE p.tournament_id::text = $1 AND p.tenant_id = $2
         ORDER BY p.pickem_score DESC NULLS LAST, p.updated_date ASC
         LIMIT 25`,
        [tourId, tenantId]
      );
      return { tournament, windowOpen, matches, prediction: pred[0] || null, leaderboard: leaders };
    });
    if (out.notfound) return res.status(404).json({ error: 'Tournament not found' });
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.put('/tournaments/:id/pickem', requireAuth, async (req, res) => {
  const tenantId = tenantHeader(req);
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });
  const tourId = String(req.params.id || '');
  const raw = req.body?.bracket_picks;
  const bracket_picks = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!bracket_picks) return res.status(400).json({ error: 'bracket_picks object required (matchId -> teamId)' });
  try {
    const out = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId, userId: String(req.user.sub) }, async (client) => {
      const { rows: trows } = await client.query(
        `SELECT id, status FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
        [tourId, tenantId]
      );
      const tournament = trows[0];
      if (!tournament) return { notfound: true };
      if (String(tournament.status) !== 'registration_closed') {
        return { bad: 'Pick’Em is only open when registration is closed and play has not started', status: 400 };
      }
      const { rows: existing } = await client.query(
        `SELECT id, locked FROM user_predictions WHERE tournament_id::text = $1 AND user_id = $2::uuid LIMIT 1`,
        [tourId, req.user.sub]
      );
      if (existing[0]?.locked) return { bad: 'Predictions are locked', status: 400 };

      let row;
      if (existing[0]?.id) {
        const up = await client.query(
          `UPDATE user_predictions SET bracket_picks = $1::jsonb, updated_date = NOW()
           WHERE id = $2::uuid AND locked = FALSE RETURNING *`,
          [JSON.stringify(bracket_picks), existing[0].id]
        );
        if (!up.rows[0]) return { bad: 'Predictions are locked', status: 400 };
        row = up.rows[0];
      } else {
        const ins = await client.query(
          `INSERT INTO user_predictions (user_id, tournament_id, tenant_id, bracket_picks)
           VALUES ($1::uuid, $2, $3, $4::jsonb) RETURNING *`,
          [req.user.sub, tourId, tenantId, JSON.stringify(bracket_picks)]
        );
        row = ins.rows[0];
      }
      return { prediction: row };
    });
    if (out.notfound) return res.status(404).json({ error: 'Tournament not found' });
    if (out.bad) return res.status(out.status || 400).json({ error: out.bad });
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
