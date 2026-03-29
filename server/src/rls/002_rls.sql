-- Row Level Security (run as table owner / superuser during migrate)
-- App must connect as arena_app (NOBYPASSRLS) + set_config(..., true) per transaction.

CREATE OR REPLACE FUNCTION public.arena_tenant_id_by_slug(p_slug TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id::text FROM tenants WHERE slug = p_slug LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.arena_tenant_id_by_slug(TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arena_app') THEN
    CREATE ROLE arena_app LOGIN PASSWORD 'arena_app_dev_change_me' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS NOREPLICATION;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO arena_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO arena_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO arena_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arena_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO arena_app;
GRANT EXECUTE ON FUNCTION public.arena_tenant_id_by_slug(TEXT) TO arena_app;

-- ---------- tenants ----------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_select ON tenants;
DROP POLICY IF EXISTS tenants_insert ON tenants;
DROP POLICY IF EXISTS tenants_update ON tenants;
DROP POLICY IF EXISTS tenants_delete ON tenants;

CREATE POLICY tenants_select ON tenants FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR id::text = NULLIF(current_setting('app.tenant_id', true), '')
  OR slug = NULLIF(current_setting('app.public_tenant_slug', true), '')
);
CREATE POLICY tenants_insert ON tenants FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.allow_bootstrap_tenant', true), '') = '1'
);
CREATE POLICY tenants_update ON tenants FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR id::text = NULLIF(current_setting('app.tenant_id', true), '')
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR id::text = NULLIF(current_setting('app.tenant_id', true), '')
);
CREATE POLICY tenants_delete ON tenants FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- macro: tenant-scoped tables ----------
-- tenant_configs, tenant_entitlements, tenant_wallets, withdrawal_requests, payment_ledger,
-- tournaments, teams, matches, match_reports, reschedule_requests, match_highlights,
-- feed_posts, sponsors, prize_payments, merchandise_items, merchandise_orders
-- player_stats: no tenant_id — policies join tournaments / matches

ALTER TABLE tenant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_configs_sel ON tenant_configs;
DROP POLICY IF EXISTS tenant_configs_ins ON tenant_configs;
DROP POLICY IF EXISTS tenant_configs_upd ON tenant_configs;
DROP POLICY IF EXISTS tenant_configs_del ON tenant_configs;
CREATE POLICY tenant_configs_sel ON tenant_configs FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tenant_configs_ins ON tenant_configs FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tenant_configs_upd ON tenant_configs FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tenant_configs_del ON tenant_configs FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE tenant_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entitlements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS te_sel ON tenant_entitlements;
DROP POLICY IF EXISTS te_ins ON tenant_entitlements;
DROP POLICY IF EXISTS te_upd ON tenant_entitlements;
DROP POLICY IF EXISTS te_del ON tenant_entitlements;
CREATE POLICY te_sel ON tenant_entitlements FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY te_ins ON tenant_entitlements FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY te_upd ON tenant_entitlements FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY te_del ON tenant_entitlements FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE tenant_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_wallets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tw_sel ON tenant_wallets;
DROP POLICY IF EXISTS tw_ins ON tenant_wallets;
DROP POLICY IF EXISTS tw_upd ON tenant_wallets;
DROP POLICY IF EXISTS tw_del ON tenant_wallets;
CREATE POLICY tw_sel ON tenant_wallets FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tw_ins ON tenant_wallets FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tw_upd ON tenant_wallets FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tw_del ON tenant_wallets FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wr_sel ON withdrawal_requests;
DROP POLICY IF EXISTS wr_ins ON withdrawal_requests;
DROP POLICY IF EXISTS wr_upd ON withdrawal_requests;
DROP POLICY IF EXISTS wr_del ON withdrawal_requests;
CREATE POLICY wr_sel ON withdrawal_requests FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY wr_ins ON withdrawal_requests FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  OR (
    beneficiary_user_id IS NOT NULL
    AND beneficiary_user_id::text = NULLIF(current_setting('app.user_id', true), '')
    AND tenant_id IS NOT NULL
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY wr_upd ON withdrawal_requests FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY wr_del ON withdrawal_requests FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uw_sel ON user_wallets;
DROP POLICY IF EXISTS uw_ins ON user_wallets;
DROP POLICY IF EXISTS uw_upd ON user_wallets;
DROP POLICY IF EXISTS uw_del ON user_wallets;
CREATE POLICY uw_sel ON user_wallets FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR user_id::text = NULLIF(current_setting('app.user_id', true), '')
);
CREATE POLICY uw_ins ON user_wallets FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR user_id::text = NULLIF(current_setting('app.user_id', true), '')
  OR COALESCE(current_setting('app.system_prize_worker', true), '') = 'true'
);
CREATE POLICY uw_upd ON user_wallets FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR user_id::text = NULLIF(current_setting('app.user_id', true), '')
  OR COALESCE(current_setting('app.system_prize_worker', true), '') = 'true'
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR user_id::text = NULLIF(current_setting('app.user_id', true), '')
  OR COALESCE(current_setting('app.system_prize_worker', true), '') = 'true'
);
CREATE POLICY uw_del ON user_wallets FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

ALTER TABLE payment_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pl_sel ON payment_ledger;
DROP POLICY IF EXISTS pl_ins ON payment_ledger;
DROP POLICY IF EXISTS pl_upd ON payment_ledger;
DROP POLICY IF EXISTS pl_del ON payment_ledger;
CREATE POLICY pl_sel ON payment_ledger FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  OR (
    beneficiary_user_id IS NOT NULL
    AND beneficiary_user_id::text = NULLIF(current_setting('app.user_id', true), '')
  )
);
CREATE POLICY pl_ins ON payment_ledger FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY pl_upd ON payment_ledger FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY pl_del ON payment_ledger FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tr_sel ON tournaments;
DROP POLICY IF EXISTS tr_ins ON tournaments;
DROP POLICY IF EXISTS tr_upd ON tournaments;
DROP POLICY IF EXISTS tr_del ON tournaments;
CREATE POLICY tr_sel ON tournaments FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  OR (
    COALESCE(current_setting('app.allow_public_directory_read', true), '') = '1'
    AND status IS NOT NULL
    AND status NOT IN ('draft', 'cancelled')
  )
);
CREATE POLICY tr_ins ON tournaments FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tr_upd ON tournaments FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tr_del ON tournaments FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tm_sel ON teams;
DROP POLICY IF EXISTS tm_ins ON teams;
DROP POLICY IF EXISTS tm_upd ON teams;
DROP POLICY IF EXISTS tm_del ON teams;
CREATE POLICY tm_sel ON teams FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tm_ins ON teams FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tm_upd ON teams FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tm_del ON teams FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

-- ---------- tournament_league_standings ----------
ALTER TABLE tournament_league_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_league_standings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tls_sel ON tournament_league_standings;
DROP POLICY IF EXISTS tls_ins ON tournament_league_standings;
DROP POLICY IF EXISTS tls_upd ON tournament_league_standings;
DROP POLICY IF EXISTS tls_del ON tournament_league_standings;
CREATE POLICY tls_sel ON tournament_league_standings FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tls_ins ON tournament_league_standings FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tls_upd ON tournament_league_standings FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY tls_del ON tournament_league_standings FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mt_sel ON matches;
DROP POLICY IF EXISTS mt_ins ON matches;
DROP POLICY IF EXISTS mt_upd ON matches;
DROP POLICY IF EXISTS mt_del ON matches;
CREATE POLICY mt_sel ON matches FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mt_ins ON matches FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mt_upd ON matches FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mt_del ON matches FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE match_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mr_sel ON match_reports;
DROP POLICY IF EXISTS mr_ins ON match_reports;
DROP POLICY IF EXISTS mr_upd ON match_reports;
DROP POLICY IF EXISTS mr_del ON match_reports;
CREATE POLICY mr_sel ON match_reports FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mr_ins ON match_reports FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mr_upd ON match_reports FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mr_del ON match_reports FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE reschedule_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reschedule_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rr_sel ON reschedule_requests;
DROP POLICY IF EXISTS rr_ins ON reschedule_requests;
DROP POLICY IF EXISTS rr_upd ON reschedule_requests;
DROP POLICY IF EXISTS rr_del ON reschedule_requests;
CREATE POLICY rr_sel ON reschedule_requests FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY rr_ins ON reschedule_requests FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY rr_upd ON reschedule_requests FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY rr_del ON reschedule_requests FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE match_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_highlights FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mh_sel ON match_highlights;
DROP POLICY IF EXISTS mh_ins ON match_highlights;
DROP POLICY IF EXISTS mh_upd ON match_highlights;
DROP POLICY IF EXISTS mh_del ON match_highlights;
CREATE POLICY mh_sel ON match_highlights FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mh_ins ON match_highlights FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mh_upd ON match_highlights FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mh_del ON match_highlights FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ps_sel ON player_stats;
DROP POLICY IF EXISTS ps_ins ON player_stats;
DROP POLICY IF EXISTS ps_upd ON player_stats;
DROP POLICY IF EXISTS ps_del ON player_stats;
-- player_stats has no tenant_id; scope via tournament_id and/or match -> tournament
CREATE POLICY ps_sel ON player_stats FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = player_stats.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
  OR EXISTS (
    SELECT 1 FROM matches m
    INNER JOIN tournaments x ON x.id::text = m.tournament_id
    WHERE m.id::text = player_stats.match_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY ps_ins ON player_stats FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = player_stats.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
  OR EXISTS (
    SELECT 1 FROM matches m
    INNER JOIN tournaments x ON x.id::text = m.tournament_id
    WHERE m.id::text = player_stats.match_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY ps_upd ON player_stats FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = player_stats.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
  OR EXISTS (
    SELECT 1 FROM matches m
    INNER JOIN tournaments x ON x.id::text = m.tournament_id
    WHERE m.id::text = player_stats.match_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = player_stats.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
  OR EXISTS (
    SELECT 1 FROM matches m
    INNER JOIN tournaments x ON x.id::text = m.tournament_id
    WHERE m.id::text = player_stats.match_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY ps_del ON player_stats FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = player_stats.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
  OR EXISTS (
    SELECT 1 FROM matches m
    INNER JOIN tournaments x ON x.id::text = m.tournament_id
    WHERE m.id::text = player_stats.match_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);

ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fp_sel ON feed_posts;
DROP POLICY IF EXISTS fp_ins ON feed_posts;
DROP POLICY IF EXISTS fp_upd ON feed_posts;
DROP POLICY IF EXISTS fp_del ON feed_posts;
CREATE POLICY fp_sel ON feed_posts FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY fp_ins ON feed_posts FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY fp_upd ON feed_posts FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY fp_del ON feed_posts FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sp_sel ON sponsors;
DROP POLICY IF EXISTS sp_ins ON sponsors;
DROP POLICY IF EXISTS sp_upd ON sponsors;
DROP POLICY IF EXISTS sp_del ON sponsors;
CREATE POLICY sp_sel ON sponsors FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY sp_ins ON sponsors FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY sp_upd ON sponsors FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY sp_del ON sponsors FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE prize_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pp_sel ON prize_payments;
DROP POLICY IF EXISTS pp_ins ON prize_payments;
DROP POLICY IF EXISTS pp_upd ON prize_payments;
DROP POLICY IF EXISTS pp_del ON prize_payments;
CREATE POLICY pp_sel ON prize_payments FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY pp_ins ON prize_payments FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY pp_upd ON prize_payments FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY pp_del ON prize_payments FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE merchandise_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchandise_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mi_sel ON merchandise_items;
DROP POLICY IF EXISTS mi_ins ON merchandise_items;
DROP POLICY IF EXISTS mi_upd ON merchandise_items;
DROP POLICY IF EXISTS mi_del ON merchandise_items;
CREATE POLICY mi_sel ON merchandise_items FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mi_ins ON merchandise_items FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mi_upd ON merchandise_items FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mi_del ON merchandise_items FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

ALTER TABLE merchandise_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchandise_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mo_sel ON merchandise_orders;
DROP POLICY IF EXISTS mo_ins ON merchandise_orders;
DROP POLICY IF EXISTS mo_upd ON merchandise_orders;
DROP POLICY IF EXISTS mo_del ON merchandise_orders;
CREATE POLICY mo_sel ON merchandise_orders FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mo_ins ON merchandise_orders FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mo_upd ON merchandise_orders FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY mo_del ON merchandise_orders FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

-- ---------- audit_logs ----------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS al_sel ON audit_logs;
DROP POLICY IF EXISTS al_ins ON audit_logs;
DROP POLICY IF EXISTS al_upd ON audit_logs;
DROP POLICY IF EXISTS al_del ON audit_logs;
CREATE POLICY al_sel ON audit_logs FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY al_ins ON audit_logs FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY al_upd ON audit_logs FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);
CREATE POLICY al_del ON audit_logs FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
);

-- ---------- feed_comments (tournament-scoped) ----------
ALTER TABLE feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fc_sel ON feed_comments;
DROP POLICY IF EXISTS fc_ins ON feed_comments;
DROP POLICY IF EXISTS fc_upd ON feed_comments;
DROP POLICY IF EXISTS fc_del ON feed_comments;
CREATE POLICY fc_sel ON feed_comments FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = feed_comments.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY fc_ins ON feed_comments FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = feed_comments.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY fc_upd ON feed_comments FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = feed_comments.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY fc_del ON feed_comments FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = feed_comments.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);

-- ---------- chat_messages ----------
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cm_sel ON chat_messages;
DROP POLICY IF EXISTS cm_ins ON chat_messages;
DROP POLICY IF EXISTS cm_upd ON chat_messages;
DROP POLICY IF EXISTS cm_del ON chat_messages;
CREATE POLICY cm_sel ON chat_messages FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = chat_messages.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY cm_ins ON chat_messages FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = chat_messages.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY cm_upd ON chat_messages FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = chat_messages.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY cm_del ON chat_messages FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = chat_messages.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);

-- ---------- fan_votes ----------
ALTER TABLE fan_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_votes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fv_sel ON fan_votes;
DROP POLICY IF EXISTS fv_ins ON fan_votes;
DROP POLICY IF EXISTS fv_upd ON fan_votes;
DROP POLICY IF EXISTS fv_del ON fan_votes;
CREATE POLICY fv_sel ON fan_votes FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = fan_votes.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY fv_ins ON fan_votes FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = fan_votes.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY fv_upd ON fan_votes FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = fan_votes.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY fv_del ON fan_votes FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR EXISTS (
    SELECT 1 FROM tournaments x
    WHERE x.id::text = fan_votes.tournament_id
      AND x.tenant_id IS NOT NULL
      AND x.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);

-- ---------- users ----------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS u_sel ON users;
DROP POLICY IF EXISTS u_ins ON users;
DROP POLICY IF EXISTS u_upd ON users;
DROP POLICY IF EXISTS u_del ON users;
CREATE POLICY u_sel ON users FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR id::text = NULLIF(current_setting('app.user_id', true), '')
  OR lower(email) = lower(NULLIF(current_setting('app.auth_login_email', true), ''))
);
CREATE POLICY u_ins ON users FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.allow_user_register', true), '') = '1'
);
CREATE POLICY u_upd ON users FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR id::text = NULLIF(current_setting('app.user_id', true), '')
);
CREATE POLICY u_del ON users FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- otp_records ----------
ALTER TABLE otp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS otp_sel ON otp_records;
DROP POLICY IF EXISTS otp_ins ON otp_records;
DROP POLICY IF EXISTS otp_upd ON otp_records;
DROP POLICY IF EXISTS otp_del ON otp_records;
CREATE POLICY otp_sel ON otp_records FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR lower(email) = lower(NULLIF(current_setting('app.otp_session_email', true), ''))
);
CREATE POLICY otp_ins ON otp_records FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR lower(email) = lower(NULLIF(current_setting('app.otp_session_email', true), ''))
);
CREATE POLICY otp_upd ON otp_records FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR lower(email) = lower(NULLIF(current_setting('app.otp_session_email', true), ''))
);
CREATE POLICY otp_del ON otp_records FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR lower(email) = lower(NULLIF(current_setting('app.otp_session_email', true), ''))
);

-- ---------- platform_config ----------
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pc_sel ON platform_config;
DROP POLICY IF EXISTS pc_ins ON platform_config;
DROP POLICY IF EXISTS pc_upd ON platform_config;
DROP POLICY IF EXISTS pc_del ON platform_config;
CREATE POLICY pc_sel ON platform_config FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.user_id', true), '') <> ''
  OR COALESCE(current_setting('app.allow_public_platform_config_read', true), '') = '1'
);
CREATE POLICY pc_ins ON platform_config FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY pc_upd ON platform_config FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY pc_del ON platform_config FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- game_templates ----------
ALTER TABLE game_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gt_sel ON game_templates;
DROP POLICY IF EXISTS gt_ins ON game_templates;
DROP POLICY IF EXISTS gt_upd ON game_templates;
DROP POLICY IF EXISTS gt_del ON game_templates;
CREATE POLICY gt_sel ON game_templates FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.allow_game_template_read', true), '') = '1'
);
CREATE POLICY gt_ins ON game_templates FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY gt_upd ON game_templates FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY gt_del ON game_templates FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- free_agents ----------
ALTER TABLE free_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_agents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fa_sel ON free_agents;
DROP POLICY IF EXISTS fa_ins ON free_agents;
DROP POLICY IF EXISTS fa_upd ON free_agents;
DROP POLICY IF EXISTS fa_del ON free_agents;
CREATE POLICY fa_sel ON free_agents FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.allow_public_directory_read', true), '') = '1'
  OR COALESCE(current_setting('app.user_id', true), '') <> ''
);
CREATE POLICY fa_ins ON free_agents FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.user_id', true), '') <> ''
);
CREATE POLICY fa_upd ON free_agents FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.user_id', true), '') <> ''
);
CREATE POLICY fa_del ON free_agents FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.user_id', true), '') <> ''
);

-- ---------- notifications ----------
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS n_sel ON notifications;
DROP POLICY IF EXISTS n_ins ON notifications;
DROP POLICY IF EXISTS n_upd ON notifications;
DROP POLICY IF EXISTS n_del ON notifications;
CREATE POLICY n_sel ON notifications FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR lower(user_email) = lower(NULLIF(current_setting('app.auth_user_email', true), ''))
);
CREATE POLICY n_ins ON notifications FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR lower(user_email) = lower(NULLIF(current_setting('app.auth_user_email', true), ''))
  OR COALESCE(current_setting('app.allow_internal_notification', true), '') = '1'
);
CREATE POLICY n_upd ON notifications FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR lower(user_email) = lower(NULLIF(current_setting('app.auth_user_email', true), ''))
);
CREATE POLICY n_del ON notifications FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR lower(user_email) = lower(NULLIF(current_setting('app.auth_user_email', true), ''))
);

-- ---------- dev_todos ----------
ALTER TABLE dev_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_todos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dt_sel ON dev_todos;
DROP POLICY IF EXISTS dt_ins ON dev_todos;
DROP POLICY IF EXISTS dt_upd ON dev_todos;
DROP POLICY IF EXISTS dt_del ON dev_todos;
CREATE POLICY dt_sel ON dev_todos FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY dt_ins ON dev_todos FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY dt_upd ON dev_todos FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY dt_del ON dev_todos FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- platform_hwid_bans (platform admin only) ----------
ALTER TABLE platform_hwid_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_hwid_bans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phb_sel ON platform_hwid_bans;
DROP POLICY IF EXISTS phb_ins ON platform_hwid_bans;
DROP POLICY IF EXISTS phb_upd ON platform_hwid_bans;
DROP POLICY IF EXISTS phb_del ON platform_hwid_bans;
CREATE POLICY phb_sel ON platform_hwid_bans FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY phb_ins ON platform_hwid_bans FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY phb_upd ON platform_hwid_bans FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY phb_del ON platform_hwid_bans FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- platform_integration_secrets (vault; platform admin only) ----------
ALTER TABLE platform_integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_integration_secrets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pis_sel ON platform_integration_secrets;
DROP POLICY IF EXISTS pis_ins ON platform_integration_secrets;
DROP POLICY IF EXISTS pis_upd ON platform_integration_secrets;
DROP POLICY IF EXISTS pis_del ON platform_integration_secrets;
CREATE POLICY pis_sel ON platform_integration_secrets FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY pis_ins ON platform_integration_secrets FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY pis_upd ON platform_integration_secrets FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY pis_del ON platform_integration_secrets FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- processed_forfeit_jobs (G4 idempotency) ----------
ALTER TABLE processed_forfeit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_forfeit_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pfj_sel ON processed_forfeit_jobs;
DROP POLICY IF EXISTS pfj_ins ON processed_forfeit_jobs;
DROP POLICY IF EXISTS pfj_del ON processed_forfeit_jobs;
CREATE POLICY pfj_sel ON processed_forfeit_jobs FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
);
CREATE POLICY pfj_ins ON processed_forfeit_jobs FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
);
CREATE POLICY pfj_del ON processed_forfeit_jobs FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- stripe_webhook_events (server-only idempotency; platform admin read) ----------
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swe_sel ON stripe_webhook_events;
DROP POLICY IF EXISTS swe_ins ON stripe_webhook_events;
CREATE POLICY swe_sel ON stripe_webhook_events FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY swe_ins ON stripe_webhook_events FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- user_tenants (membership §4.4) ----------
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ut_sel ON user_tenants;
DROP POLICY IF EXISTS ut_ins ON user_tenants;
DROP POLICY IF EXISTS ut_upd ON user_tenants;
DROP POLICY IF EXISTS ut_del ON user_tenants;
CREATE POLICY ut_sel ON user_tenants FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR user_id::text = NULLIF(current_setting('app.user_id', true), '')
);
CREATE POLICY ut_ins ON user_tenants FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id::text = NULLIF(current_setting('app.user_id', true), '')
        AND u.role = 'super_admin'
    )
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY ut_upd ON user_tenants FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY ut_del ON user_tenants FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- paystack_webhook_events ----------
ALTER TABLE paystack_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE paystack_webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pwe_sel ON paystack_webhook_events;
DROP POLICY IF EXISTS pwe_ins ON paystack_webhook_events;
CREATE POLICY pwe_sel ON paystack_webhook_events FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY pwe_ins ON paystack_webhook_events FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- flutterwave_webhook_events ----------
ALTER TABLE flutterwave_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE flutterwave_webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fwe_sel ON flutterwave_webhook_events;
DROP POLICY IF EXISTS fwe_ins ON flutterwave_webhook_events;
CREATE POLICY fwe_sel ON flutterwave_webhook_events FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
CREATE POLICY fwe_ins ON flutterwave_webhook_events FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);

-- ---------- user_accolades ----------
ALTER TABLE user_accolades ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accolades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ua_sel ON user_accolades;
DROP POLICY IF EXISTS ua_ins ON user_accolades;
DROP POLICY IF EXISTS ua_upd ON user_accolades;
DROP POLICY IF EXISTS ua_del ON user_accolades;
CREATE POLICY ua_sel ON user_accolades FOR SELECT USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR user_id::text = NULLIF(current_setting('app.user_id', true), '')
  OR (
    tenant_id IS NOT NULL
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY ua_ins ON user_accolades FOR INSERT WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.system_prize_worker', true), '') = 'true'
  OR (
    tenant_id IS NOT NULL
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  )
);
CREATE POLICY ua_upd ON user_accolades FOR UPDATE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.system_prize_worker', true), '') = 'true'
) WITH CHECK (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
  OR COALESCE(current_setting('app.system_prize_worker', true), '') = 'true'
);
CREATE POLICY ua_del ON user_accolades FOR DELETE USING (
  COALESCE(current_setting('app.is_platform_admin', true), '') = 'true'
);
