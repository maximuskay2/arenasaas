/**
 * Run once: schema + patches + RLS. Uses DATABASE_ADMIN_URL or DATABASE_URL (owner/superuser).
 * Use: npm run migrate (from server/)
 */
import './loadEnv.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootSchema = join(__dirname, '../../src/db/schema.sql');
const rlsSchema = join(__dirname, 'rls/002_rls.sql');

function pgEscapeLiteral(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

async function main() {
  const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DATABASE_ADMIN_URL is required');
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    // Before full schema.sql: existing DBs may have old tables without columns that
    // schema.sql indexes expect (CREATE TABLE IF NOT EXISTS does not add columns).
    await pool.query(`
      DO $pre$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawal_requests') THEN
          ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS beneficiary_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_ledger') THEN
          ALTER TABLE payment_ledger ADD COLUMN IF NOT EXISTS beneficiary_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END
      $pre$;
    `);
    const sql = readFileSync(rootSchema, 'utf8');
    await pool.query(sql);
    await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin', 'moderator', 'super_admin'));
    CREATE TABLE IF NOT EXISTS platform_integration_secrets (
      key_name TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform_integration_secrets TO arena_app;
    CREATE TABLE IF NOT EXISTS dev_todos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
      category TEXT,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS platform_hwid_bans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hwid_norm TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL DEFAULT '',
      created_by_email TEXT,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform_hwid_bans TO arena_app;
    CREATE OR REPLACE FUNCTION public.is_hwid_platform_banned(p_hwid TEXT)
    RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM platform_hwid_bans b
        WHERE b.hwid_norm = lower(trim(both from COALESCE(p_hwid, '')))
          AND length(trim(both from COALESCE(p_hwid, ''))) > 0
      );
    $$;
    GRANT EXECUTE ON FUNCTION public.is_hwid_platform_banned(TEXT) TO arena_app;
    ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_aml_status_check;
    ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS aml_status TEXT NOT NULL DEFAULT 'none';
    UPDATE withdrawal_requests SET aml_status = 'none' WHERE aml_status IS NULL OR aml_status = '';
    ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_aml_status_check
      CHECK (aml_status IN ('none', 'review', 'cleared', 'sar_flagged'));
    ALTER TABLE prize_payments DROP CONSTRAINT IF EXISTS prize_payments_aml_status_check;
    ALTER TABLE prize_payments ADD COLUMN IF NOT EXISTS aml_status TEXT NOT NULL DEFAULT 'none';
    UPDATE prize_payments SET aml_status = 'none' WHERE aml_status IS NULL OR aml_status = '';
    ALTER TABLE prize_payments ADD CONSTRAINT prize_payments_aml_status_check
      CHECK (aml_status IN ('none', 'review', 'cleared', 'sar_flagged'));
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'monthly';
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS single_tournament_remaining INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
    ALTER TABLE tenant_entitlements DROP CONSTRAINT IF EXISTS tenant_entitlements_plan_type_check;
    ALTER TABLE tenant_entitlements ADD CONSTRAINT tenant_entitlements_plan_type_check
      CHECK (plan_type IN ('monthly', 'one_shot'));
    UPDATE tenant_entitlements SET
      is_active = (status IN ('active', 'trial', 'one_shot')),
      plan_type = CASE WHEN status = 'one_shot' THEN 'one_shot' ELSE 'monthly' END;
    UPDATE tenant_entitlements SET single_tournament_remaining = GREATEST(COALESCE(one_shot_credits, 0), 0)
      WHERE status = 'one_shot';
    UPDATE tenant_entitlements SET single_tournament_remaining = 0 WHERE status IS DISTINCT FROM 'one_shot';
    CREATE TABLE IF NOT EXISTS processed_forfeit_jobs (
      idempotency_key TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    GRANT SELECT, INSERT, DELETE ON processed_forfeit_jobs TO arena_app;
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id TEXT PRIMARY KEY,
      type TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload_json JSONB
    );
    GRANT SELECT, INSERT ON stripe_webhook_events TO arena_app;
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS subscription_status TEXT;
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS paystack_webhook_events (
      reference TEXT PRIMARY KEY,
      event_type TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload_json JSONB
    );
    GRANT SELECT, INSERT ON paystack_webhook_events TO arena_app;
    CREATE TABLE IF NOT EXISTS flutterwave_webhook_events (
      external_id TEXT PRIMARY KEY,
      event_type TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload_json JSONB
    );
    GRANT SELECT, INSERT ON flutterwave_webhook_events TO arena_app;
    CREATE TABLE IF NOT EXISTS user_tenants (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      role_in_tenant TEXT NOT NULL DEFAULT 'member',
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_tenants_role_check CHECK (role_in_tenant IN ('organizer', 'admin', 'staff', 'member')),
      UNIQUE (user_id, tenant_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_tenants TO arena_app;
    ALTER TABLE payment_ledger ADD COLUMN IF NOT EXISTS amount_minor BIGINT;
    ALTER TABLE payment_ledger ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'stripe';
    ALTER TABLE payment_ledger ADD COLUMN IF NOT EXISTS held BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE payment_ledger SET amount_minor = ROUND((amount::numeric) * 100)::bigint WHERE amount_minor IS NULL AND amount IS NOT NULL;
    CREATE TABLE IF NOT EXISTS user_refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_user ON user_refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_hash ON user_refresh_tokens(token_hash);
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_refresh_tokens TO arena_app;
    ALTER TABLE tenant_configs ADD COLUMN IF NOT EXISTS payout_settings JSONB DEFAULT '{}'::jsonb;
    CREATE OR REPLACE FUNCTION public.arena_tenant_by_custom_host(p_host TEXT)
    RETURNS JSONB
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT to_jsonb(sub.*) FROM (
        SELECT tc.tenant_id, tc.tenant_name, tc.logo_url, t.slug
        FROM tenant_configs tc
        INNER JOIN tenants t ON t.id::text = tc.tenant_id
        WHERE NULLIF(TRIM(LOWER(COALESCE(tc.custom_domain, ''))), '') = TRIM(LOWER(COALESCE(p_host, '')))
        LIMIT 1
      ) sub;
    $$;
    REVOKE ALL ON FUNCTION public.arena_tenant_by_custom_host(TEXT) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.arena_tenant_by_custom_host(TEXT) TO arena_app;
    CREATE TABLE IF NOT EXISTS tournament_join_idempotency (
      idempotency_key TEXT PRIMARY KEY,
      user_sub TEXT NOT NULL,
      response_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    GRANT SELECT, INSERT ON tournament_join_idempotency TO arena_app;
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
      type IN (
        'tournament_started',
        'match_scheduled',
        'score_reported',
        'score_disputed',
        'invite',
        'prize_payout',
        'tournament_registered'
      )
    );
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS subscription_provider TEXT;
    ALTER TABLE tenant_entitlements ADD COLUMN IF NOT EXISTS subscription_external_reference TEXT;
    CREATE TABLE IF NOT EXISTS user_fcm_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'web',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, token)
    );
    CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user ON user_fcm_tokens (user_id);
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_fcm_tokens TO arena_app;

    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'FREE';
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS payout_config JSONB DEFAULT '{}'::jsonb;
    UPDATE tournaments SET entry_type = CASE WHEN COALESCE(entry_fee, 0) > 0 THEN 'PAID' ELSE 'FREE' END
      WHERE entry_type IS NULL OR trim(COALESCE(entry_type, '')) = '';
    ALTER TABLE tournaments ALTER COLUMN entry_type SET DEFAULT 'FREE';
    ALTER TABLE tournaments ALTER COLUMN entry_type SET NOT NULL;
    ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_entry_type_check;
    ALTER TABLE tournaments ADD CONSTRAINT tournaments_entry_type_check CHECK (entry_type IN ('FREE', 'PAID'));

    CREATE TABLE IF NOT EXISTS user_wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'USD',
      balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
      updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, currency)
    );
    CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_wallets TO arena_app;

    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_structure JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_disclosure_tbd BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS payout_job_status TEXT DEFAULT 'idle';
    UPDATE tournaments SET payout_job_status = 'idle' WHERE payout_job_status IS NULL;
    ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_payout_job_status_check;
    ALTER TABLE tournaments ADD CONSTRAINT tournaments_payout_job_status_check
      CHECK (payout_job_status IN ('idle', 'queued', 'running', 'completed', 'failed'));

    ALTER TABLE match_reports ADD COLUMN IF NOT EXISTS team_id TEXT;
    ALTER TABLE match_reports ADD COLUMN IF NOT EXISTS pov_link TEXT;

    CREATE TABLE IF NOT EXISTS user_accolades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      tournament_title TEXT,
      rank INTEGER NOT NULL,
      badge_id TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, tournament_id, rank)
    );
    CREATE INDEX IF NOT EXISTS idx_user_accolades_user ON user_accolades(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_accolades_tournament ON user_accolades(tournament_id);
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_accolades TO arena_app;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_cleared BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE payment_ledger ADD COLUMN IF NOT EXISTS beneficiary_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS tournament_league_standings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      team_name TEXT,
      played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tournament_id, team_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tls_tournament ON tournament_league_standings(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tls_tenant ON tournament_league_standings(tenant_id);
    GRANT SELECT, INSERT, UPDATE, DELETE ON tournament_league_standings TO arena_app;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS achievements JSONB NOT NULL DEFAULT '[]'::jsonb;
    UPDATE users SET achievements = '[]'::jsonb WHERE achievements IS NULL;

    ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS beneficiary_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_withdrawal_beneficiary ON withdrawal_requests (beneficiary_user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_ledger_reference_unique
      ON payment_ledger (reference)
      WHERE reference IS NOT NULL AND btrim(reference) <> '';

    CREATE OR REPLACE FUNCTION public.sync_user_achievements_mirror()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      UPDATE users
      SET achievements = COALESCE(achievements, '[]'::jsonb)
          || jsonb_build_array(
               jsonb_build_object(
                 'tournament_id', NEW.tournament_id,
                 'rank', NEW.rank,
                 'badge_id', NEW.badge_id,
                 'tournament_title', NEW.tournament_title,
                 'metadata', COALESCE(NEW.metadata, '{}'::jsonb),
                 'mirrored_at', to_jsonb(NOW())
               )
             ),
          updated_date = NOW()
      WHERE id = NEW.user_id;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS trg_user_accolades_mirror_achievements ON user_accolades;
    CREATE TRIGGER trg_user_accolades_mirror_achievements
      AFTER INSERT ON user_accolades
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_user_achievements_mirror();
  `);
    const rls = readFileSync(rlsSchema, 'utf8');
    await pool.query(rls);
    const pw = process.env.ARENA_APP_PASSWORD || 'arena_app_dev';
    await pool.query(`ALTER ROLE arena_app WITH LOGIN PASSWORD ${pgEscapeLiteral(pw)}`);
    console.log('Migration OK (schema + RLS, arena_app password from ARENA_APP_PASSWORD or default)');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  if (e.code === 'ECONNREFUSED' || e?.errors?.some((x) => x.code === 'ECONNREFUSED')) {
    console.error(
      '\nCould not reach PostgreSQL. Start the DB (e.g. from repo root: docker compose up -d).\n' +
        'This project maps Postgres to host port 5433 in docker-compose.yml. If your container uses 5432 instead ' +
        '(older run or another compose file), use localhost:5432 in DATABASE_URL or recreate: docker compose down && docker compose up -d\n'
    );
  }
  if (e.code === '28000' && /role .* does not exist/i.test(String(e.message))) {
    console.error(
      '\nThe database user in DATABASE_URL is not defined on the server you connected to.\n' +
        'You are probably hitting a different Postgres than this repo’s Docker service (user `arena`, db `arena_dev`).\n' +
        'From the repo root run: docker compose up -d\n' +
        'Then check the host port: docker port arena-postgres\n' +
        'Use that port in DATABASE_URL (often 5433 per docker-compose.yml).\n'
    );
  }
  process.exit(1);
});
