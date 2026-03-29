-- ============================================================
-- ArenaSaaS - Full PostgreSQL Database Schema
-- Generated: 2026-03-28
-- Compatible with: Railway PostgreSQL, Supabase, Neon
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending', 'cancelled')),
  owner_email TEXT NOT NULL,
  logo_url TEXT DEFAULT 'https://mails.bybata.com/logomail.png',
  custom_domain TEXT,
  region TEXT DEFAULT 'us' CHECK (region IN ('us', 'eu', 'asia', 'africa', 'latam')),
  payment_provider TEXT DEFAULT 'stripe' CHECK (payment_provider IN ('stripe', 'paystack', 'flutterwave')),
  max_tournaments INTEGER DEFAULT 5,
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- TENANT CONFIG (white-label branding per tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  logo_url TEXT DEFAULT 'https://mails.bybata.com/logomail.png',
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#00d4ff',
  secondary_color TEXT DEFAULT '#0a0e1a',
  accent_color TEXT DEFAULT '#ff4655',
  custom_domain TEXT,
  display_font TEXT DEFAULT 'Orbitron',
  discord_webhook_url TEXT,
  stripe_account_id TEXT,
  stripe_customer_id TEXT,
  social_links JSONB DEFAULT '{}',
  payout_settings JSONB DEFAULT '{}',
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- TENANT ENTITLEMENTS (subscription features)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'trial', 'one_shot')),
  one_shot_credits INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  plan_type TEXT NOT NULL DEFAULT 'monthly' CHECK (plan_type IN ('monthly', 'one_shot')),
  single_tournament_remaining INTEGER NOT NULL DEFAULT 0,
  subscription_expires_at TIMESTAMPTZ,
  max_teams_per_tournament INTEGER DEFAULT 8,
  max_admins INTEGER DEFAULT 1,
  features JSONB DEFAULT '[]',
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  subscription_provider TEXT,
  subscription_external_reference TEXT,
  subscription_status TEXT,
  subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  trial_ends_at TIMESTAMPTZ,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- Idempotent forfeit / job delivery (§5.4 / G4)
CREATE TABLE IF NOT EXISTS processed_forfeit_jobs (
  idempotency_key TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stripe webhook idempotency (§8.1)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB
);

CREATE TABLE IF NOT EXISTS paystack_webhook_events (
  reference TEXT PRIMARY KEY,
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB
);

CREATE TABLE IF NOT EXISTS flutterwave_webhook_events (
  external_id TEXT PRIMARY KEY,
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB
);

-- ============================================================
-- TENANT WALLET
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT NOT NULL UNIQUE,
  balance NUMERIC(12, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  total_earned NUMERIC(12, 2) DEFAULT 0,
  total_withdrawn NUMERIC(12, 2) DEFAULT 0,
  stripe_account_id TEXT,
  payout_schedule TEXT DEFAULT 'manual' CHECK (payout_schedule IN ('manual', 'weekly', 'monthly')),
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- PLAYER USER WALLETS (internal balance per currency)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);

-- ============================================================
-- USER ACCOLADES (tournament placements / badges)
-- ============================================================
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

-- ============================================================
-- LEAGUE STANDINGS (round-robin / swiss — points: win 3, draw 1)
-- ============================================================
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

-- ============================================================
-- WITHDRAWAL REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  stripe_account_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  aml_status TEXT NOT NULL DEFAULT 'none' CHECK (aml_status IN ('none', 'review', 'cleared', 'sar_flagged')),
  notes TEXT,
  processed_at TIMESTAMPTZ,
  -- Player vault withdrawal (tenant wallet requests leave null).
  beneficiary_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_beneficiary ON withdrawal_requests (beneficiary_user_id);

-- ============================================================
-- PAYMENT LEDGER
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT NOT NULL,
  tournament_id TEXT,
  type TEXT CHECK (type IN ('entry_fee', 'prize_payout', 'withdrawal', 'refund', 'platform_fee')),
  amount NUMERIC(12, 2) NOT NULL,
  amount_minor BIGINT,
  currency TEXT DEFAULT 'USD',
  provider TEXT DEFAULT 'stripe',
  held BOOLEAN NOT NULL DEFAULT FALSE,
  reference TEXT,
  description TEXT,
  beneficiary_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- Idempotent prize payout lines (multi-worker); application always sets reference for prize_payout.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_ledger_reference_unique
  ON payment_ledger (reference)
  WHERE reference IS NOT NULL AND btrim(reference) <> '';

-- ============================================================
-- GAME TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS game_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  logo_url TEXT,
  roster_size INTEGER NOT NULL,
  scoring_mode TEXT NOT NULL CHECK (scoring_mode IN ('best_of_1', 'best_of_3', 'best_of_5', 'points')),
  map_pool TEXT[] DEFAULT '{}',
  rules_json TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- TOURNAMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  name TEXT NOT NULL,
  game_template_id TEXT,
  game_title TEXT,
  format TEXT NOT NULL CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin', 'swiss')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled')),
  description TEXT,
  banner_url TEXT,
  max_teams INTEGER NOT NULL,
  registered_teams INTEGER DEFAULT 0,
  prize_pool NUMERIC(12, 2),
  currency TEXT DEFAULT 'USD',
  entry_type TEXT NOT NULL DEFAULT 'FREE' CHECK (entry_type IN ('FREE', 'PAID')),
  entry_fee NUMERIC(12, 2) DEFAULT 0,
  payout_config JSONB DEFAULT '{}'::jsonb,
  prize_structure JSONB DEFAULT '{}'::jsonb,
  prize_disclosure_tbd BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at TIMESTAMPTZ,
  payout_job_status TEXT DEFAULT 'idle' CHECK (payout_job_status IN ('idle', 'queued', 'running', 'completed', 'failed')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  registration_deadline TIMESTAMPTZ,
  check_in_duration_minutes INTEGER DEFAULT 15,
  seeding_method TEXT DEFAULT 'random' CHECK (seeding_method IN ('manual', 'by_rank', 'random')),
  rules TEXT,
  stream_url TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  logo_url TEXT,
  captain_email TEXT,
  roster JSONB DEFAULT '[]',  -- [{player_name, player_email, role, game_id}]
  seed INTEGER,
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'eliminated', 'winner')),
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  elo NUMERIC(8, 2) DEFAULT 1000,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- MATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  tournament_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  bracket_position TEXT,
  team_a_id TEXT,
  team_a_name TEXT,
  team_b_id TEXT,
  team_b_name TEXT,
  score_a INTEGER DEFAULT 0,
  score_b INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'check_in_open', 'checked_in', 'in_progress', 'under_dispute', 'completed', 'forfeited', 'no_show')),
  winner_id TEXT,
  winner_name TEXT,
  next_match_id TEXT,
  scheduled_time TIMESTAMPTZ,
  check_in_deadline TIMESTAMPTZ,
  team_a_checked_in BOOLEAN DEFAULT FALSE,
  team_b_checked_in BOOLEAN DEFAULT FALSE,
  version INTEGER DEFAULT 1,
  maps_played JSONB DEFAULT '[]',  -- [{map_name, score_a, score_b}]
  stream_url TEXT,
  notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- MATCH REPORTS (score submissions with evidence)
-- ============================================================
CREATE TABLE IF NOT EXISTS match_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id TEXT NOT NULL,
  tournament_id TEXT,
  tenant_id TEXT,
  submitted_by TEXT NOT NULL,
  team_id TEXT,
  pov_link TEXT,
  reported_score_a INTEGER,
  reported_score_b INTEGER,
  screenshot_urls TEXT[] DEFAULT '{}',
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disputed')),
  reviewed_by TEXT,
  review_notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- RESCHEDULE REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS reschedule_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id TEXT NOT NULL,
  tournament_id TEXT,
  tenant_id TEXT,
  requested_by_email TEXT NOT NULL,
  requested_by_team TEXT,
  proposed_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  review_notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- MATCH HIGHLIGHTS
-- ============================================================
CREATE TABLE IF NOT EXISTS match_highlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id TEXT,
  match_id TEXT NOT NULL,
  tenant_id TEXT,
  type TEXT CHECK (type IN ('kill', 'objective', 'match_end', 'manual_clip')),
  title TEXT NOT NULL,
  description TEXT,
  player_email TEXT,
  player_name TEXT,
  team_id TEXT,
  team_name TEXT,
  clip_url TEXT,
  timestamp BIGINT,
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_by TEXT,
  likes INTEGER DEFAULT 0,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- PLAYER STATS
-- ============================================================
CREATE TABLE IF NOT EXISTS player_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_email TEXT NOT NULL,
  player_name TEXT,
  match_id TEXT NOT NULL,
  tournament_id TEXT,
  team_id TEXT,
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  won BOOLEAN DEFAULT FALSE,
  game_title TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- FREE AGENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS free_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  preferred_games TEXT[] DEFAULT '{}',
  rank TEXT,
  region TEXT DEFAULT 'NA' CHECK (region IN ('NA', 'EU', 'LATAM', 'ASIA', 'OCE', 'AF', 'ME')),
  roles TEXT[] DEFAULT '{}',
  availability TEXT DEFAULT 'anytime' CHECK (availability IN ('weekdays', 'weekends', 'anytime', 'limited')),
  discord_handle TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  wins INTEGER DEFAULT 0,
  tournaments_played INTEGER DEFAULT 0,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- FEED POSTS (tournament social feed)
-- ============================================================
CREATE TABLE IF NOT EXISTS feed_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id TEXT NOT NULL,
  tenant_id TEXT,
  author_email TEXT NOT NULL,
  author_name TEXT,
  role TEXT DEFAULT 'player' CHECK (role IN ('organizer', 'player', 'spectator')),
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video', 'clip')),
  match_id TEXT,
  likes INTEGER DEFAULT 0,
  fire INTEGER DEFAULT 0,
  claps INTEGER DEFAULT 0,
  party INTEGER DEFAULT 0,
  pinned BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- FEED COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS feed_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id TEXT NOT NULL,
  tournament_id TEXT,
  author_email TEXT NOT NULL,
  author_name TEXT,
  content TEXT NOT NULL,
  role TEXT DEFAULT 'player' CHECK (role IN ('organizer', 'player', 'spectator')),
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id TEXT NOT NULL,
  tournament_id TEXT,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  content TEXT NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- FAN VOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS fan_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  voter_email TEXT NOT NULL,
  vote_type TEXT CHECK (vote_type IN ('player', 'team')),
  target_email TEXT,
  target_id TEXT,
  target_name TEXT NOT NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- SPONSORS
-- ============================================================
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  tournament_id TEXT,
  name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  tier TEXT DEFAULT 'silver' CHECK (tier IN ('title', 'gold', 'silver', 'bronze')),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- PRIZE PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS prize_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id TEXT NOT NULL,
  tenant_id TEXT,
  team_id TEXT NOT NULL,
  team_name TEXT,
  captain_email TEXT,
  placement INTEGER NOT NULL,
  prize_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  payment_method TEXT DEFAULT 'manual' CHECK (payment_method IN ('paypal', 'stripe', 'bank_transfer', 'manual')),
  payment_reference TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'confirmed', 'failed')),
  aml_status TEXT NOT NULL DEFAULT 'none' CHECK (aml_status IN ('none', 'review', 'cleared', 'sar_flagged')),
  notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- MERCHANDISE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS merchandise_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id TEXT,
  tenant_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('jersey', 'hat', 'hoodie', 'other')),
  image_url TEXT,
  price NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  stock INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- MERCHANDISE ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS merchandise_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id TEXT NOT NULL,
  tenant_id TEXT,
  buyer_email TEXT NOT NULL,
  buyer_name TEXT,
  team_id TEXT,
  is_team_order BOOLEAN DEFAULT FALSE,
  items JSONB DEFAULT '[]',  -- [{item_id, item_name, qty, price_each, size}]
  total_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  tracking_number TEXT,
  notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email TEXT NOT NULL,
  type TEXT CHECK (type IN ('tournament_started', 'match_scheduled', 'score_reported', 'score_disputed', 'invite', 'prize_payout', 'tournament_registered')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  tournament_id TEXT,
  match_id TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor_email TEXT NOT NULL,
  actor_role TEXT,
  details TEXT,
  previous_value TEXT,
  new_value TEXT,
  tournament_id TEXT,
  ip_address TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- OTP RECORDS (email verification)
-- ============================================================
CREATE TABLE IF NOT EXISTS otp_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- PLATFORM CONFIG (system-wide settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- ============================================================
-- USERS (extended profile, mirrors maxikay user)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator', 'super_admin')),
  game_handles JSONB DEFAULT '{}',  -- {Valorant: "handle", ...}
  stripe_customer_id TEXT,
  kyc_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  -- Denormalized mirror of placement/participation accolades (filled by trigger on user_accolades).
  achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  mfa_secret TEXT,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User ↔ tenant membership (§4.4); complements global users.role
CREATE TABLE IF NOT EXISTS user_tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  role_in_tenant TEXT NOT NULL DEFAULT 'member'
    CHECK (role_in_tenant IN ('organizer', 'admin', 'staff', 'member')),
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- Refresh sessions (httpOnly cookie) — optional; no RLS (server-only access via pool)
CREATE TABLE IF NOT EXISTS user_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_user ON user_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_hash ON user_refresh_tokens(token_hash);

-- Encrypted at rest (AES-256-GCM); values never exposed to browsers — use /api/system/platform-secrets
CREATE TABLE IF NOT EXISTS platform_integration_secrets (
  key_name TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform-wide hardware bans (enforced when clients send client_hwid on auth)
CREATE TABLE IF NOT EXISTS platform_hwid_bans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hwid_norm TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT '',
  created_by_email TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES (performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tournaments_tenant ON tournaments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_teams_captain ON teams(captain_email);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_match_reports_match ON match_reports(match_id);
CREATE INDEX IF NOT EXISTS idx_match_reports_status ON match_reports(status);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_email);
CREATE INDEX IF NOT EXISTS idx_player_stats_match ON player_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_tournament ON feed_posts(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fan_votes_match ON fan_votes(match_id, voter_email);
CREATE INDEX IF NOT EXISTS idx_otp_records_email ON otp_records(email, used);
CREATE INDEX IF NOT EXISTS idx_merch_orders_buyer ON merchandise_orders(buyer_email);

-- ============================================================
-- USER ACCOLADES → users.achievements mirror (SECURITY DEFINER)
-- ============================================================
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

-- ============================================================
-- AUTO-UPDATE updated_date TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_date = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants','tenant_configs','tenant_entitlements','tenant_wallets',
    'withdrawal_requests','payment_ledger','user_wallets','game_templates','tournaments',
    'tournament_league_standings','teams','matches','match_reports','reschedule_requests','match_highlights',
    'player_stats','free_agents','feed_posts','feed_comments','chat_messages',
    'fan_votes','sponsors','prize_payments','merchandise_items',
    'merchandise_orders','notifications','audit_logs','otp_records','platform_config'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_%1$s ON %1$s;
       CREATE TRIGGER trg_updated_%1$s BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION update_updated_date();', t
    );
  END LOOP;
END;
$$;