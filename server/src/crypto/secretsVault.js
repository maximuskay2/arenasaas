import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey() {
  const k = process.env.SECRETS_MASTER_KEY;
  if (!k || !/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('SECRETS_MASTER_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(k, 'hex');
}

export function encryptSecret(plain) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(b64) {
  const key = getKey();
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function isVaultConfigured() {
  const k = process.env.SECRETS_MASTER_KEY;
  return !!(k && /^[0-9a-fA-F]{64}$/.test(k));
}
