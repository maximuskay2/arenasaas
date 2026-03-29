/**
 * Payment API secrets: process.env first, then encrypted platform_integration_secrets (super admin vault).
 */
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import { decryptSecret, isVaultConfigured } from '../crypto/secretsVault.js';

const VAULT = {
  stripe: 'stripe_secret_key',
  paystack: 'paystack_secret_key',
  flutterwave: 'flutterwave_secret_key',
  flutterwave_hash: 'flutterwave_secret_hash',
};

async function readVault(keyName) {
  if (!isVaultConfigured()) return null;
  try {
    const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(`SELECT ciphertext FROM platform_integration_secrets WHERE key_name = $1`, [keyName])
    );
    const ct = rows[0]?.ciphertext;
    if (!ct) return null;
    return decryptSecret(ct);
  } catch (e) {
    console.warn('[paymentCredentials] vault read', keyName, e.message);
    return null;
  }
}

export async function getStripeSecretKey() {
  const env = process.env.STRIPE_SECRET_KEY?.trim();
  if (env) return env;
  return readVault(VAULT.stripe);
}

export async function getPaystackSecretKey() {
  const env = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (env) return env;
  return readVault(VAULT.paystack);
}

export async function getFlutterwaveSecretKey() {
  const env = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
  if (env) return env;
  return readVault(VAULT.flutterwave);
}

export async function getFlutterwaveSecretHash() {
  const env = process.env.FLUTTERWAVE_SECRET_HASH?.trim();
  if (env) return env;
  return readVault(VAULT.flutterwave_hash);
}

const DEFAULT_PG = {
  stripe_enabled: true,
  paystack_enabled: true,
  flutterwave_enabled: true,
  stripe_publishable_key: '',
  paystack_public_key: '',
  flutterwave_public_key: '',
};

export async function loadPaymentGatewaySettings() {
  try {
    const { rows } = await runWithRls(pool, { allowPublicPlatformConfigRead: true }, (client) =>
      client.query(`SELECT value FROM platform_config WHERE key = 'payment_gateway_settings' LIMIT 1`)
    );
    const raw = rows[0]?.value;
    if (!raw) return { ...DEFAULT_PG };
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...DEFAULT_PG, ...parsed };
  } catch {
    return { ...DEFAULT_PG };
  }
}
