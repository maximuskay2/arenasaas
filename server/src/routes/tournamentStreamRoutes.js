/**
 * Multi-stream CRUD for organizers (main + co-streams / languages / VODs).
 */
import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';
import { clientSafeErrorMessage } from '../clientSafeError.js';

const router = express.Router();
router.use(express.json());

function detectProvider(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('twitch.tv') || u.includes('twitch.com')) return 'twitch';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('kick.com')) return 'kick';
  return 'other';
}

async function assertCanManageTournament(client, req, tournamentId) {
  const { rows } = await client.query(
    `SELECT id, tenant_id, created_by FROM tournaments WHERE id::text = $1 LIMIT 1`,
    [String(tournamentId)]
  );
  const t = rows[0];
  if (!t) {
    const err = new Error('Tournament not found');
    err.status = 404;
    throw err;
  }
  const role = String(req.user?.role || '');
  if (role === 'admin' || role === 'super_admin' || role === 'organizer' || role === 'referee') {
    return t;
  }
  const email = String(req.user?.email || '').toLowerCase();
  if (email && String(t.created_by || '').toLowerCase() === email) return t;
  const err = new Error('Not allowed to manage streams for this tournament');
  err.status = 403;
  throw err;
}

/** List streams for a tournament (public-ish via optional auth). */
router.get('/tournaments/:tournamentId/streams', async (req, res) => {
  const tournamentId = String(req.params.tournamentId || '').trim();
  if (!tournamentId) return res.status(400).json({ error: 'tournamentId required' });
  try {
    const rows = await runWithRls(pool, rlsContextFromRequest(req) || { isPlatformAdmin: true }, async (client) => {
      const r = await client.query(
        `SELECT id, tournament_id, match_id, tenant_id, label, stream_url, provider, sort_order, is_primary, created_date
         FROM tournament_streams
         WHERE tournament_id::text = $1
         ORDER BY is_primary DESC, sort_order ASC, created_date ASC`,
        [tournamentId]
      );
      return r.rows;
    });
    res.json({ streams: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/tournaments/:tournamentId/streams', requireAuth, async (req, res) => {
  const tournamentId = String(req.params.tournamentId || '').trim();
  const label = String(req.body?.label || 'Stream').trim().slice(0, 80) || 'Stream';
  const stream_url = String(req.body?.stream_url || '').trim();
  const match_id = req.body?.match_id != null ? String(req.body.match_id).trim() : null;
  const sort_order = Number.isFinite(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 0;
  const is_primary = !!req.body?.is_primary;
  if (!tournamentId || !stream_url) {
    return res.status(400).json({ error: 'tournamentId and stream_url required' });
  }
  try {
    const row = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const t = await assertCanManageTournament(client, req, tournamentId);
      if (is_primary) {
        await client.query(`UPDATE tournament_streams SET is_primary = FALSE WHERE tournament_id::text = $1`, [
          tournamentId,
        ]);
      }
      const { rows } = await client.query(
        `INSERT INTO tournament_streams (tournament_id, match_id, tenant_id, label, stream_url, provider, sort_order, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          tournamentId,
          match_id || null,
          String(t.tenant_id || ''),
          label,
          stream_url,
          req.body?.provider || detectProvider(stream_url),
          sort_order,
          is_primary,
        ]
      );
      return rows[0];
    });
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.patch('/streams/:streamId', requireAuth, async (req, res) => {
  const streamId = String(req.params.streamId || '').trim();
  if (!streamId) return res.status(400).json({ error: 'streamId required' });
  try {
    const row = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const { rows: existing } = await client.query(`SELECT * FROM tournament_streams WHERE id::text = $1 LIMIT 1`, [
        streamId,
      ]);
      const cur = existing[0];
      if (!cur) {
        const err = new Error('Stream not found');
        err.status = 404;
        throw err;
      }
      await assertCanManageTournament(client, req, cur.tournament_id);
      const label = req.body?.label != null ? String(req.body.label).trim().slice(0, 80) : cur.label;
      const stream_url =
        req.body?.stream_url != null ? String(req.body.stream_url).trim() : cur.stream_url;
      const match_id =
        req.body?.match_id !== undefined
          ? req.body.match_id
            ? String(req.body.match_id).trim()
            : null
          : cur.match_id;
      const sort_order =
        req.body?.sort_order != null && Number.isFinite(Number(req.body.sort_order))
          ? Number(req.body.sort_order)
          : cur.sort_order;
      const is_primary = req.body?.is_primary != null ? !!req.body.is_primary : cur.is_primary;
      if (is_primary) {
        await client.query(
          `UPDATE tournament_streams SET is_primary = FALSE WHERE tournament_id::text = $1 AND id::text <> $2`,
          [String(cur.tournament_id), streamId]
        );
      }
      const { rows } = await client.query(
        `UPDATE tournament_streams SET
           label = $2, stream_url = $3, match_id = $4, sort_order = $5, is_primary = $6,
           provider = COALESCE($7, provider)
         WHERE id::text = $1 RETURNING *`,
        [
          streamId,
          label,
          stream_url,
          match_id,
          sort_order,
          is_primary,
          req.body?.provider || (req.body?.stream_url ? detectProvider(stream_url) : null),
        ]
      );
      return rows[0];
    });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.delete('/streams/:streamId', requireAuth, async (req, res) => {
  const streamId = String(req.params.streamId || '').trim();
  if (!streamId) return res.status(400).json({ error: 'streamId required' });
  try {
    await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const { rows: existing } = await client.query(`SELECT * FROM tournament_streams WHERE id::text = $1 LIMIT 1`, [
        streamId,
      ]);
      const cur = existing[0];
      if (!cur) {
        const err = new Error('Stream not found');
        err.status = 404;
        throw err;
      }
      await assertCanManageTournament(client, req, cur.tournament_id);
      await client.query(`DELETE FROM tournament_streams WHERE id::text = $1`, [streamId]);
    });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
