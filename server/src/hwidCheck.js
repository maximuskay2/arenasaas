import { pool } from './db.js';

const MAX_LEN = 256;

export function normalizeClientHwid(raw) {
  if (raw == null) return '';
  const s = String(raw).trim().toLowerCase().slice(0, MAX_LEN);
  return s;
}

/**
 * Throws { code: 'hwid_banned' } if the normalized HWID is on the platform list.
 * No-op when HWID is empty (clients that do not send a device id are not blocked).
 */
export async function assertHwidNotBanned(dbPool, rawHwid) {
  const hwid = normalizeClientHwid(rawHwid);
  if (!hwid) return;
  const { rows } = await dbPool.query('SELECT public.is_hwid_platform_banned($1) AS banned', [hwid]);
  if (rows[0]?.banned) {
    const err = new Error('HWID banned');
    err.code = 'hwid_banned';
    throw err;
  }
}

/** For routes that already use `pool` from db.js */
export async function assertHwidNotBannedDefault(rawHwid) {
  return assertHwidNotBanned(pool, rawHwid);
}
