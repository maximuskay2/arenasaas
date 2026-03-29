/**
 * Optional Redis for tournament catalog (REDIS_URL). Falls back to in-memory only when unset.
 */
import { createClient } from 'redis';

let _client;
let _connecting;

async function getClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (_client?.isOpen) return _client;
  if (_connecting) {
    await _connecting;
    return _client?.isOpen ? _client : null;
  }
  _connecting = (async () => {
    try {
      const c = createClient({ url });
      c.on('error', (err) => console.error('[redis catalog]', err.message));
      await c.connect();
      _client = c;
    } catch (e) {
      console.error('[redis catalog] connect failed', e.message);
      _client = null;
    } finally {
      _connecting = null;
    }
  })();
  await _connecting;
  return _client?.isOpen ? _client : null;
}

export async function catalogRedisGet(key) {
  const c = await getClient();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('[redis catalog] get', e.message);
    return null;
  }
}

export async function catalogRedisSet(key, body, ttlSec) {
  const c = await getClient();
  if (!c) return;
  try {
    await c.set(key, JSON.stringify(body), { EX: Math.max(1, ttlSec) });
  } catch (e) {
    console.error('[redis catalog] set', e.message);
  }
}

/** Best-effort clear catalog keys (prefix arena:tcatalog:). */
export async function catalogRedisInvalidate() {
  const c = await getClient();
  if (!c) return;
  try {
    for await (const k of c.scanIterator({ MATCH: 'arena:tcatalog:*', COUNT: 100 })) {
      await c.del(k);
    }
    for await (const k of c.scanIterator({ MATCH: 'arena:discovery:*', COUNT: 100 })) {
      await c.del(k);
    }
  } catch (e) {
    console.error('[redis catalog] invalidate', e.message);
  }
}
