import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import { decryptSecret, isVaultConfigured } from '../crypto/secretsVault.js';

const DEFAULT_SETTINGS = {
  provider: 'none',
  from_address: '',
  from_name: 'Arena',
  smtp: { host: '', port: 587, secure: false, user: '' },
};

async function readVaultSecret(keyName) {
  if (!isVaultConfigured()) return null;
  try {
    const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(`SELECT ciphertext FROM platform_integration_secrets WHERE key_name = $1`, [keyName])
    );
    const ct = rows[0]?.ciphertext;
    if (!ct) return null;
    return decryptSecret(ct);
  } catch {
    return null;
  }
}

export async function loadEmailSettings() {
  try {
    const { rows } = await runWithRls(pool, { allowPublicPlatformConfigRead: true }, (client) =>
      client.query(`SELECT value FROM platform_config WHERE key = 'email_settings' LIMIT 1`)
    );
    const raw = rows[0]?.value;
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      smtp: { ...DEFAULT_SETTINGS.smtp, ...(parsed.smtp || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function buildFromHeader(settings) {
  const name = String(settings.from_name || process.env.MAIL_FROM_NAME || 'Arena').trim();
  const addr = String(settings.from_address || process.env.MAIL_FROM || '').trim();
  if (!addr) throw new Error('from_address not configured (Central Station → email settings, or MAIL_FROM)');
  if (name) return `${name} <${addr}>`;
  return addr;
}

export async function getEmailTransportSummary() {
  const s = await loadEmailSettings();
  const provider = String(s.provider || 'none').toLowerCase();
  const resendKey = (await readVaultSecret('resend_api_key')) || process.env.RESEND_API_KEY?.trim();
  const smtpPass = await readVaultSecret('smtp_password');
  const hasResend = Boolean(resendKey);
  const hasSmtp = Boolean(s.smtp?.host && s.smtp?.user && smtpPass);
  let effective = 'none';
  if (provider === 'resend' && hasResend) effective = 'resend';
  else if (provider === 'smtp' && hasSmtp) effective = 'smtp';
  else if (provider === 'none' && hasResend && (s.from_address || process.env.MAIL_FROM)) effective = 'resend_env';
  const from = String(s.from_address || process.env.MAIL_FROM || '').trim() || '(not set)';
  return {
    provider: effective,
    from,
    configured: effective === 'resend' || effective === 'smtp' || effective === 'resend_env',
  };
}

async function sendViaResend({ apiKey, from, to, subject, html, text }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: html || undefined,
      text: text || undefined,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.message || data.name || `Resend HTTP ${r.status}`);
  }
  return data;
}

async function sendViaSmtp(settings, { to, subject, html, text }) {
  const password = await readVaultSecret('smtp_password');
  if (!password) throw new Error('smtp_password not set in vault');
  const host = String(settings.smtp?.host || '').trim();
  const user = String(settings.smtp?.user || '').trim();
  if (!host || !user) throw new Error('SMTP host/user not configured');
  const port = Number(settings.smtp?.port) || 587;
  const secure = Boolean(settings.smtp?.secure);
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
  });
  const from = buildFromHeader(settings);
  await transporter.sendMail({
    from,
    to,
    subject,
    html: html || undefined,
    text: text || (html ? html.replace(/<[^>]+>/g, ' ') : undefined),
  });
  return { ok: true };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {{ to: string, subject: string, html?: string, text?: string, body?: string }} opts
 */
export async function sendPlatformEmail(opts) {
  const to = String(opts.to || '')
    .trim()
    .toLowerCase();
  if (!to.includes('@')) throw new Error('valid to address required');
  const subject = String(opts.subject || '').trim() || 'Notification';
  let html = opts.html;
  const rawBody = opts.body != null ? String(opts.body) : '';
  if (!html && rawBody) {
    html = rawBody.includes('<') ? rawBody : `<pre style="font-family:sans-serif">${escapeHtml(rawBody)}</pre>`;
  }
  const text = opts.text || (html ? html.replace(/<[^>]+>/g, ' ').trim() : '');

  const settings = await loadEmailSettings();
  const provider = String(settings.provider || 'none').toLowerCase();
  const fromHeader = buildFromHeader(settings);

  if (provider === 'resend') {
    const apiKey = (await readVaultSecret('resend_api_key')) || process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error('resend_api_key not set (vault or RESEND_API_KEY)');
    return sendViaResend({ apiKey, from: fromHeader, to, subject, html, text });
  }

  if (provider === 'smtp') {
    return sendViaSmtp(settings, { to, subject, html, text });
  }

  /* Legacy: env-only Resend when provider not switched on yet */
  const envResend = process.env.RESEND_API_KEY?.trim();
  if (envResend && (settings.from_address || process.env.MAIL_FROM)) {
    const from = buildFromHeader(settings);
    return sendViaResend({ apiKey: envResend, from, to, subject, html, text });
  }

  console.info('[email] stub — configure Central Station → Email & notifications', { to, subject });
  return { stub: true, message: 'Email transport not configured' };
}
