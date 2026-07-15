/**
 * OAuth CSRF state store — Redis when REDIS_URL is set, else in-memory (dev).
 */
import crypto from 'crypto';

const mem = new Map();
const TTL_SEC = Number(process.env.OAUTH_STATE_TTL_SEC || 600);

let redis = null;
let redisReady = false;

async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redisReady && redis) return redis;
  if (redis) return redis;
  try {
    const { createClient } = await import('redis');
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', (e) => console.error('[oauth-state] redis', e?.message || e));
    await redis.connect();
    redisReady = true;
    return redis;
  } catch (e) {
    console.warn('[oauth-state] redis unavailable, using memory', e?.message || e);
    return null;
  }
}

function memGc() {
  const now = Date.now();
  for (const [k, v] of mem) {
    if (v.exp < now) mem.delete(k);
  }
}

/**
 * @param {{ userId: string, provider: string, returnTo?: string }} payload
 * @returns {Promise<string>} state token
 */
export async function mintOAuthState(payload) {
  const state = crypto.randomBytes(24).toString('hex');
  const body = {
    userId: String(payload.userId),
    provider: String(payload.provider).toLowerCase(),
    returnTo: payload.returnTo || '',
    exp: Date.now() + TTL_SEC * 1000,
  };
  const r = await getRedis();
  if (r) {
    await r.setEx(`arena:oauth:state:${state}`, TTL_SEC, JSON.stringify(body));
  } else {
    memGc();
    mem.set(state, body);
  }
  return state;
}

/**
 * One-time consume.
 * @returns {Promise<{ userId: string, provider: string, returnTo: string } | null>}
 */
export async function consumeOAuthState(state) {
  const key = String(state || '').trim();
  if (!key) return null;
  const r = await getRedis();
  if (r) {
    const raw = await r.get(`arena:oauth:state:${key}`);
    if (!raw) return null;
    await r.del(`arena:oauth:state:${key}`);
    try {
      const parsed = JSON.parse(raw);
      if (parsed.exp && parsed.exp < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  memGc();
  const row = mem.get(key);
  mem.delete(key);
  if (!row || row.exp < Date.now()) return null;
  return row;
}
