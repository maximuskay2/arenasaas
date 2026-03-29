import crypto from 'crypto';
import { pool } from '../db.js';

export const REFRESH_COOKIE = 'arena_refresh';
const TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_MS || 30 * 864e5);

export function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

export function parseCookie(req, name) {
  const raw = req.headers.cookie || '';
  const part = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  if (!part) return '';
  return decodeURIComponent(part.slice(name.length + 1));
}

export async function replaceRefreshSession(userId, res) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + TTL_MS);
  await pool.query(`DELETE FROM user_refresh_tokens WHERE user_id = $1`, [userId]);
  await pool.query(
    `INSERT INTO user_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: TTL_MS,
    path: '/',
  });
  return expiresAt;
}

/** Validates cookie, rotates refresh row + cookie, returns user id or null. */
export async function rotateRefreshFromRequest(req, res) {
  const raw = parseCookie(req, REFRESH_COOKIE);
  if (!raw) return null;
  const tokenHash = hashRefreshToken(raw);
  const del = await pool.query(
    `DELETE FROM user_refresh_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id`,
    [tokenHash]
  );
  const userId = del.rows[0]?.user_id;
  if (!userId) return null;
  await replaceRefreshSession(userId, res);
  return userId;
}

export function clearRefreshCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure });
}

export async function revokeRefreshForUser(userId) {
  await pool.query(`DELETE FROM user_refresh_tokens WHERE user_id = $1`, [userId]);
}

/** Remove the refresh row for the cookie on this request (logout when access JWT is expired). */
export async function revokeRefreshByCookie(req) {
  const raw = parseCookie(req, REFRESH_COOKIE);
  if (!raw) return;
  const tokenHash = hashRefreshToken(raw);
  await pool.query(`DELETE FROM user_refresh_tokens WHERE token_hash = $1`, [tokenHash]);
}

export function refreshCookiesEnabled() {
  return process.env.REFRESH_COOKIE_ENABLED === 'true';
}
