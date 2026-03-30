import express from 'express';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';
import { emitMatchUpdated, emitMatchCenterFeed } from '../realtime.js';
import { applyForfeitTransition } from '../forfeitApply.js';
import { recomputeLeagueStandings } from '../lib/leagueStandings.js';
import { applyMatchEloUpdate } from '../lib/matchEloHook.js';

const router = express.Router();
router.use(express.json());

/**
 * G4 — Idempotent forfeit (or other terminal transition) under at-least-once job delivery.
 */
router.post('/forfeit', requireAuth, async (req, res) => {
  const {
    match_id: matchId,
    idempotency_key: idemKey,
    expected_version: ev,
    from_status: fromStatus,
    new_status: newStatus,
    patch = {},
  } = req.body || {};
  if (!matchId || !idemKey || ev === undefined || ev === null || !fromStatus || !newStatus) {
    return res.status(400).json({ error: 'match_id, idempotency_key, expected_version, from_status, new_status required' });
  }
  const tenantId = String(req.headers['x-tenant-id'] || req.headers['X-Tenant-ID'] || '').trim();
  if (!tenantId) return res.status(400).json({ error: 'X-Tenant-ID required' });

  try {
    const expectedV = Number(ev);
    if (Number.isNaN(expectedV)) return res.status(400).json({ error: 'expected_version must be a number' });

    const row = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const out = await applyForfeitTransition(client, {
        idempotencyKey: idemKey,
        matchId,
        tenantId,
        expectedVersion: expectedV,
        fromStatus,
        newStatus,
        patch,
      });
      if (out?.match) {
        const m = out.match;
        const terminal = ['completed', 'forfeited', 'no_show'].includes(String(m.status || ''));
        if (terminal && m.winner_id && m.team_a_id && m.team_b_id) {
          try {
            await applyMatchEloUpdate(client, m);
          } catch (e) {
            console.error('[forfeit] elo', e);
          }
        }
        if (terminal && m.tournament_id) {
          try {
            const { rows: tr } = await client.query(
              `SELECT format FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
              [String(m.tournament_id), tenantId]
            );
            await recomputeLeagueStandings(client, String(m.tournament_id), tenantId, String(tr[0]?.format || ''));
          } catch (e) {
            console.error('[forfeit] league standings', e);
          }
        }
      }
      return out;
    });

    if (row?.duplicate) return res.json({ ok: true, duplicate: true });
    if (row?.conflict) return res.status(409).json({ error: 'Match state changed — retry', code: 'optimistic_lock' });
    if (row?.match) {
      emitMatchUpdated(row.match);
      const m = row.match;
      const terminal = ['completed', 'forfeited', 'no_show'].includes(String(m.status || ''));
      if (terminal && m.winner_id) {
        emitMatchCenterFeed(String(m.id), {
          type: 'result',
          headline: `${m.winner_name || 'Winner'} wins`,
          body: `Match resolved (${String(m.status)})`,
          matchId: String(m.id),
        });
      }
      return res.json({ ok: true, match: row.match });
    }
    return res.status(500).json({ error: 'Unexpected' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
