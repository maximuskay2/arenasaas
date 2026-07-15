import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import admin from 'firebase-admin';

let initAttempted = false;

function parseServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isFcmConfigured() {
  return Boolean(parseServiceAccount());
}

function ensureFirebaseApp() {
  if (admin.apps.length) return true;
  if (initAttempted) return false;
  initAttempted = true;
  const cred = parseServiceAccount();
  if (!cred) return false;
  admin.initializeApp({ credential: admin.credential.cert(cred) });
  return true;
}

/**
 * @param {string} token
 * @param {string[]} topics
 */
export async function subscribeFcmTokenToTopics(token, topics) {
  if (!ensureFirebaseApp()) {
    return { configured: false, results: [] };
  }
  const messaging = admin.messaging();
  const results = [];
  for (const topic of topics) {
    if (!topic) continue;
    try {
      const r = await messaging.subscribeToTopic([token], topic);
      results.push({ topic, successCount: r.successCount, failureCount: r.failureCount, errors: r.errors || [] });
    } catch (e) {
      results.push({ topic, error: e.message || String(e) });
    }
  }
  return { configured: true, results };
}

async function tokensForUser(userSub) {
  return runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
    const { rows } = await client.query(`SELECT token FROM user_fcm_tokens WHERE user_id = $1::uuid`, [
      String(userSub),
    ]);
    return rows.map((r) => r.token).filter(Boolean);
  });
}

/**
 * Deliver one notification job payload (tokens, user_sub lookup, or topic).
 */
export async function deliverFcmNotification(payload = {}) {
  if (!ensureFirebaseApp()) {
    return {
      ok: false,
      reason: 'fcm_not_configured',
      payload_preview: typeof payload === 'object' && payload ? Object.keys(payload) : [],
    };
  }

  const title = String(payload.title || payload.kind || 'Arena').slice(0, 200);
  const body = String(payload.body || '').slice(0, 2000);
  const data = {};
  const rawData = payload.data && typeof payload.data === 'object' ? payload.data : {};
  for (const [k, v] of Object.entries(rawData)) {
    data[String(k).slice(0, 200)] = v == null ? '' : String(v).slice(0, 4000);
  }
  for (const k of ['kind', 'tournament_id', 'team_id', 'user_sub']) {
    if (payload[k] != null && data[k] == null) data[k] = String(payload[k]);
  }

  const messaging = admin.messaging();

  if (payload.topic && String(payload.topic).trim()) {
    await messaging.send({
      topic: String(payload.topic).trim(),
      notification: { title, body },
      data,
    });
    return { ok: true, channel: 'topic', topic: payload.topic };
  }

  let tokens = Array.isArray(payload.tokens) ? payload.tokens.map((t) => String(t).trim()).filter(Boolean) : [];
  const userKey = payload.user_sub || payload.user_id;
  if (!tokens.length && userKey) {
    tokens = await tokensForUser(userKey);
  }
  tokens = [...new Set(tokens)].slice(0, 500);
  if (!tokens.length) {
    return { ok: true, skipped: 'no_tokens' };
  }

  const resp = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
  });
  return {
    ok: true,
    channel: 'multicast',
    successCount: resp.successCount,
    failureCount: resp.failureCount,
  };
}
