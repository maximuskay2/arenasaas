import express from 'express';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls } from '../rls/transaction.js';
import { subscribeFcmTokenToTopics } from '../notifications/fcmAdmin.js';
import { fcmTopicTournament, fcmTopicUser } from '../notifications/fcmTopics.js';

const router = express.Router();
router.use(express.json());

/**
 * Register a web/mobile FCM token; upserts row and subscribes to user + optional tournament topics.
 */
router.post('/fcm/register', requireAuth, async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'token required' });
  const tournamentId = String(req.body?.tournament_id || '').trim();
  const platform = String(req.body?.platform || 'web').trim().slice(0, 32) || 'web';
  const userSub = String(req.user.sub || '');
  if (!userSub) return res.status(400).json({ error: 'user id missing from session' });

  try {
    await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      await client.query(
        `INSERT INTO user_fcm_tokens (user_id, token, platform)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (user_id, token) DO UPDATE SET
           updated_at = NOW(),
           platform = EXCLUDED.platform`,
        [userSub, token, platform]
      );
    });

    const topics = [fcmTopicUser(userSub)];
    if (tournamentId) topics.push(fcmTopicTournament(tournamentId));
    const subscribe = await subscribeFcmTokenToTopics(token, topics);

    res.json({ ok: true, topics, subscribe });
  } catch (e) {
    console.error('[fcm/register]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
