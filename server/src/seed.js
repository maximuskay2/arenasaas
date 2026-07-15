/**
 * Optional API seed (idempotent). Uses platform-admin RLS context.
 *
 * Env (startup via index.js):
 * - SEED_OPTIONAL=true        → dev admin + platform_config + game_templates + dev_todos + **dev tenant (below)**
 * - SEED_DEV_USER=true        → dev admin + platform_config + **dev tenant + organizer@arena.local** (dashboard login)
 * - SEED_REFERENCE_DATA=true  → game_templates + dev_todos only (still uses admin RLS)
 * - SEED_DEV_TENANT=true      → **fake tenant + organizer only** (no platform admin / templates unless combined)
 *
 * CLI: `npm run seed` (from server/) — full pack (force), including dev tenant + organizer + **demo scenario** (3 leagues, tournaments, players).
 *
 * Demo seed (also runs when `SEED_DEMO_SCENARIO=true`):
 *   Organizers: organizer-alpha@demo.arena.local, organizer-beta@demo.arena.local, organizer-gamma@demo.arena.local
 *   Players: player1-demo@arena.local … player6-demo@arena.local (password `demo123` or DEMO_SEED_PASSWORD)
 *
 * Test player + team on **dev-league** (`npm run seed:test-player` or `SEED_TEST_PLAYER=true`):
 *   Email:    player-test@arena.local     TEST_PLAYER_EMAIL
 *   Password: testplayer123               TEST_PLAYER_PASSWORD
 *   Valorant handle (game_handles): TestPlayer#0001   TEST_PLAYER_GAME_HANDLE
 *   Team tag: DEVTEST1 on tournament "Dev League — Test Cup" (or first open registration tournament)
 *
 * ---------------------------------------------------------------------------
 * Seeded credentials (override with env vars on the right)
 * ---------------------------------------------------------------------------
 * Platform super-admin (role `admin`, for admin.* / SystemAdmin):
 *   Email:    admin@arena.local     DEV_ADMIN_EMAIL
 *   Password: admin123            DEV_ADMIN_PASSWORD
 *
 * Dev organizer (role `user`, for organizer portal /login + dashboard):
 *   Email:    organizer@arena.local    DEV_ORGANIZER_EMAIL
 *   Password: organizer123             DEV_ORGANIZER_PASSWORD
 *   Tenant:   slug `dev-league`, name "Dev League (seeded)"
 *
 * The UI resolves tenant context via TenantConfig when no `tenant_id` is on the user;
 * newest config wins — this seed runs late so `dev-league` is typically picked first.
 * ---------------------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import { pool, adminPool } from './db.js';
import { runWithRls } from './rls/transaction.js';

const PLATFORM_DEFAULTS = [
  ['withdrawal_fee_percent', '5'],
  ['withdrawal_fee_fixed', '0'],
  ['min_withdrawal_amount', '25'],
  ['entry_platform_fee_percent', '5'],
  ['saas_monthly_amount_usd', '29'],
  ['saas_monthly_amount_ngn', '15000'],
  ['saas_one_shot_amount_usd', '79'],
  ['saas_one_shot_amount_ngn', '45000'],
  ['platform_maintenance', '0'],
  ['manual_reporting_mode', '0'],
  ['platform_name', 'Arena SaaS'],
  ['support_email', 'support@arenasaas.com'],
];

const GAME_TEMPLATES = [
  {
    title: 'Valorant',
    roster_size: 5,
    scoring_mode: 'best_of_3',
    map_pool: ['Ascent', 'Bind', 'Haven', 'Split'],
    rules_json: null,
  },
  {
    title: 'Counter-Strike 2',
    roster_size: 5,
    scoring_mode: 'best_of_3',
    map_pool: ['Mirage', 'Inferno', 'Nuke', 'Ancient'],
    rules_json: null,
  },
  {
    title: 'League of Legends',
    roster_size: 5,
    scoring_mode: 'best_of_5',
    map_pool: [],
    rules_json: null,
  },
  {
    title: 'Generic / Custom',
    roster_size: 10,
    scoring_mode: 'best_of_1',
    map_pool: [],
    rules_json: null,
  },
];

const DEV_TODOS = [
  {
    title: 'Wire Stripe Connect (prod)',
    description: 'Set STRIPE_SECRET_KEY and test Connect onboarding.',
    priority: 'high',
    status: 'pending',
    category: 'payments',
  },
  {
    title: 'Smoke-test RLS with arena_app',
    description: 'Confirm DATABASE_RUNTIME_URL uses arena_app; tenant isolation on CRUD.',
    priority: 'medium',
    status: 'pending',
    category: 'security',
  },
  {
    title: 'Configure production domains',
    description: 'Point www / app / admin DNS; set VITE_* origins.',
    priority: 'low',
    status: 'pending',
    category: 'deploy',
  },
];

const DEV_TENANT_SLUG = 'dev-league';
const DEV_TENANT_NAME = 'Dev League (seeded)';
const TEST_PLAYER_TOURNAMENT_NAME = 'Dev League — Test Cup';
const TEST_PLAYER_TEAM_TAG = 'DEVTEST1';

/**
 * One login-capable player, tenant membership, optional tournament, and one roster row — all on dev-league.
 * Idempotent (team keyed by tournament + tag; user by email).
 */
async function seedTestPlayerDevLeague(client, summary) {
  const playerEmail = (process.env.TEST_PLAYER_EMAIL || 'player-test@arena.local').toLowerCase();
  const playerPassword = process.env.TEST_PLAYER_PASSWORD || 'testplayer123';
  const gameHandle = process.env.TEST_PLAYER_GAME_HANDLE || 'TestPlayer#0001';

  const { rows: tRows } = await client.query(`SELECT id FROM tenants WHERE slug = $1`, [DEV_TENANT_SLUG]);
  if (!tRows.length) {
    summary.push('test-player:skipped (no dev-league tenant)');
    return;
  }
  const tidStr = String(tRows[0].id);

  let userId;
  const exU = await client.query(`SELECT id, game_handles FROM users WHERE email = $1`, [playerEmail]);
  if (exU.rowCount) {
    userId = exU.rows[0].id;
    const gh = exU.rows[0].game_handles;
    const empty = gh == null || (typeof gh === 'object' && Object.keys(gh).length === 0);
    if (empty) {
      await client.query(`UPDATE users SET game_handles = $2::jsonb WHERE id = $1`, [
        userId,
        JSON.stringify({ Valorant: gameHandle }),
      ]);
      summary.push(`test-player:${playerEmail} (game_handles set)`);
    } else {
      summary.push(`test-player:${playerEmail} (exists)`);
    }
  } else {
    const hash = await bcrypt.hash(playerPassword, 10);
    const ins = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, game_handles)
       VALUES ($1, $2, 'Test Player', 'user', $3::jsonb) RETURNING id`,
      [playerEmail, hash, JSON.stringify({ Valorant: gameHandle })]
    );
    userId = ins.rows[0].id;
    summary.push(`test-player:${playerEmail}`);
  }

  await client.query(
    `INSERT INTO user_tenants (user_id, tenant_id, role_in_tenant)
     VALUES ($1::uuid, $2, 'member')
     ON CONFLICT (user_id, tenant_id) DO NOTHING`,
    [userId, tidStr]
  );

  await client.query(
    `INSERT INTO user_wallets (user_id, currency, balance) VALUES ($1::uuid, 'USD', 250)
     ON CONFLICT (user_id, currency) DO UPDATE SET
       balance = GREATEST(user_wallets.balance, EXCLUDED.balance),
       updated_date = NOW()`,
    [userId]
  );
  summary.push('test-player:wallet-usd');

  let tourId;
  const namedTour = await client.query(
    `SELECT id FROM tournaments WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
    [tidStr, TEST_PLAYER_TOURNAMENT_NAME]
  );
  if (namedTour.rows.length) {
    tourId = namedTour.rows[0].id;
    summary.push('test-player:tournament(named)');
  } else {
    const openTour = await client.query(
      `SELECT id FROM tournaments WHERE tenant_id = $1 AND status = 'registration_open' ORDER BY created_date DESC LIMIT 1`,
      [tidStr]
    );
    if (openTour.rows.length) {
      tourId = openTour.rows[0].id;
      summary.push('test-player:tournament(open registration)');
    } else {
      const { rows: gtRows } = await client.query(
        `SELECT id::text AS id FROM game_templates WHERE title = 'Valorant' LIMIT 1`
      );
      const gameTemplateId = gtRows[0]?.id || null;
      const start = new Date();
      start.setDate(start.getDate() + 14);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const regDeadline = new Date();
      regDeadline.setDate(regDeadline.getDate() + 10);
      const tIns = await client.query(
        `INSERT INTO tournaments (
           tenant_id, name, game_template_id, game_title, format, status, description, banner_url,
           max_teams, registered_teams, prize_pool, currency, entry_fee, start_date, end_date, registration_deadline, check_in_duration_minutes, seeding_method
         ) VALUES (
           $1, $2, $3, 'Valorant', 'single_elimination', 'registration_open',
           'Seeded test cup for local QA (player-test @ dev-league).',
           'https://mails.bybata.com/logomail.png',
           16, 0, 100, 'USD', 0, $4, $5, $6, 15, 'random'
         ) RETURNING id`,
        [tidStr, TEST_PLAYER_TOURNAMENT_NAME, gameTemplateId, start.toISOString(), end.toISOString(), regDeadline.toISOString()]
      );
      tourId = tIns.rows[0].id;
      summary.push('test-player:tournament(created)');
    }
  }

  const tourIdStr = String(tourId);
  const exTeam = await client.query(
    `SELECT id FROM teams WHERE tournament_id::text = $1 AND tag = $2 LIMIT 1`,
    [tourIdStr, TEST_PLAYER_TEAM_TAG]
  );
  if (exTeam.rows.length) {
    summary.push('test-player:team(exists)');
  } else {
    const roster = [
      {
        player_name: playerEmail.split('@')[0],
        player_email: playerEmail,
        role: 'captain',
        game_id: `${TEST_PLAYER_TEAM_TAG}-1`,
      },
    ];
    await client.query(
      `INSERT INTO teams (tenant_id, tournament_id, name, tag, captain_email, roster, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'registered')`,
      [tidStr, tourIdStr, 'Test Squad (seeded)', TEST_PLAYER_TEAM_TAG, playerEmail, JSON.stringify(roster)]
    );
    summary.push('test-player:team(created)');
  }

  const { rows: tc } = await client.query(
    `SELECT COUNT(*)::int AS c FROM teams WHERE tournament_id::text = $1`,
    [tourIdStr]
  );
  await client.query(`UPDATE tournaments SET registered_teams = $1 WHERE id::text = $2`, [tc[0].c, tourIdStr]);

  summary.push('test-player:complete');
}

/**
 * Idempotent: tenant `dev-league`, config, entitlement, wallet, and organizer user.
 */
async function seedDevTenantOrganizer(client, summary) {
  const orgEmail = (process.env.DEV_ORGANIZER_EMAIL || 'organizer@arena.local').toLowerCase();
  const orgPassword = process.env.DEV_ORGANIZER_PASSWORD || 'organizer123';

  let tid;
  const existingT = await client.query(`SELECT id FROM tenants WHERE slug = $1`, [DEV_TENANT_SLUG]);
  if (existingT.rows.length) {
    tid = existingT.rows[0].id;
    summary.push(`tenant:${DEV_TENANT_SLUG} (exists)`);
  } else {
    const ins = await client.query(
      `INSERT INTO tenants (name, slug, plan, status, owner_email, logo_url)
       VALUES ($1, $2, 'pro', 'active', $3, $4)
       RETURNING id`,
      [DEV_TENANT_NAME, DEV_TENANT_SLUG, orgEmail, 'https://mails.bybata.com/logomail.png']
    );
    tid = ins.rows[0].id;
    summary.push(`tenant:${DEV_TENANT_SLUG}`);
  }
  const tidStr = String(tid);

  const cfg = await client.query(`SELECT id FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`, [tidStr]);
  if (!cfg.rowCount) {
    await client.query(
      `INSERT INTO tenant_configs (tenant_id, tenant_name, logo_url, primary_color, secondary_color, accent_color, display_font)
       VALUES ($1, $2, $3, '#00d4ff', '#0a0e1a', '#ff4655', 'Orbitron')`,
      [tidStr, DEV_TENANT_NAME, 'https://mails.bybata.com/logomail.png']
    );
    summary.push('tenant_config(dev-league)');
  }

  const ent = await client.query(`SELECT id FROM tenant_entitlements WHERE tenant_id = $1 LIMIT 1`, [tidStr]);
  if (!ent.rowCount) {
    await client.query(
      `INSERT INTO tenant_entitlements (tenant_id, plan, status, max_teams_per_tournament, max_admins, is_active, plan_type, single_tournament_remaining)
       VALUES ($1, 'pro', 'active', 32, 5, TRUE, 'monthly', 0)`,
      [tidStr]
    );
    summary.push('tenant_entitlement(dev-league)');
  }

  const w = await client.query(`SELECT id FROM tenant_wallets WHERE tenant_id = $1`, [tidStr]);
  if (!w.rowCount) {
    await client.query(`INSERT INTO tenant_wallets (tenant_id, balance, currency) VALUES ($1, 0, 'USD')`, [tidStr]);
    summary.push('tenant_wallet(dev-league)');
  }

  const u = await client.query(`SELECT id FROM users WHERE email = $1`, [orgEmail]);
  if (!u.rowCount) {
    const hash = await bcrypt.hash(orgPassword, 10);
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, 'Dev Organizer', 'user')`,
      [orgEmail, hash]
    );
    summary.push(`organizer:${orgEmail}`);
  } else {
    summary.push(`organizer:${orgEmail} (exists)`);
  }

  const orgUser = await client.query(`SELECT id FROM users WHERE email = $1`, [orgEmail]);
  const orgId = orgUser.rows[0]?.id;
  if (orgId) {
    const ut = await client.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role_in_tenant)
       VALUES ($1, $2, 'organizer')
       ON CONFLICT (user_id, tenant_id) DO NOTHING
       RETURNING id`,
      [orgId, tidStr]
    );
    if (ut.rowCount) summary.push('user_tenant(dev-league organizer)');
    const insUw = await client.query(
      `INSERT INTO user_wallets (user_id, currency, balance) VALUES ($1::uuid, 'USD', 0)
       ON CONFLICT (user_id, currency) DO NOTHING
       RETURNING id`,
      [orgId]
    );
    if (insUw.rowCount) summary.push('organizer:user_wallet(usd)');
  }
}

/**
 * @param {{ force?: boolean }} opts
 * @returns {Promise<{ skipped?: boolean, summary: string[] }>}
 */
export async function runOptionalApiSeeds(opts = {}) {
  const force = opts.force === true;
  const optional = process.env.SEED_OPTIONAL === 'true';
  const wantAdmin = force || optional || process.env.SEED_DEV_USER === 'true';
  const wantRef = force || optional || process.env.SEED_REFERENCE_DATA === 'true';
  const wantDevTenant =
    force ||
    optional ||
    process.env.SEED_DEV_TENANT === 'true' ||
    process.env.SEED_DEV_USER === 'true';
  const wantDemoScenario = force || process.env.SEED_DEMO_SCENARIO === 'true';
  const wantTestPlayer = process.env.SEED_TEST_PLAYER === 'true';

  if (!wantAdmin && !wantRef && !wantDevTenant && !wantDemoScenario && !wantTestPlayer) {
    return { skipped: true, summary: [] };
  }

  const seedPool = adminPool || pool;
  const summary = [];

  await runWithRls(seedPool, { isPlatformAdmin: true }, async (client) => {
    if (wantAdmin) {
      const email = process.env.DEV_ADMIN_EMAIL || 'admin@arena.local';
      const password = process.env.DEV_ADMIN_PASSWORD || 'admin123';
      const exists = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
      if (!exists.rowCount) {
        const hash = await bcrypt.hash(password, 10);
        await client.query(
          `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, 'Dev Admin', 'admin')`,
          [email, hash]
        );
        summary.push(`user:${email}`);
      } else {
        summary.push(`user:${email} (exists)`);
      }

      for (const [k, v] of PLATFORM_DEFAULTS) {
        await client.query(
          `INSERT INTO platform_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
          [k, v]
        );
      }
      summary.push('platform_config defaults');
    }

    if (wantRef) {
      const { rows: gc } = await client.query(`SELECT COUNT(*)::int AS c FROM game_templates`);
      if (gc[0].c === 0) {
        for (const g of GAME_TEMPLATES) {
          await client.query(
            `INSERT INTO game_templates (title, roster_size, scoring_mode, map_pool, rules_json)
             VALUES ($1, $2, $3, $4, $5)`,
            [g.title, g.roster_size, g.scoring_mode, g.map_pool, g.rules_json]
          );
        }
        summary.push(`game_templates:${GAME_TEMPLATES.length}`);
      } else {
        summary.push(`game_templates (${gc[0].c} existing)`);
      }

      const { rows: dc } = await client.query(`SELECT COUNT(*)::int AS c FROM dev_todos`);
      if (dc[0].c === 0) {
        for (const t of DEV_TODOS) {
          await client.query(
            `INSERT INTO dev_todos (title, description, priority, status, category) VALUES ($1, $2, $3, $4, $5)`,
            [t.title, t.description, t.priority, t.status, t.category]
          );
        }
        summary.push(`dev_todos:${DEV_TODOS.length}`);
      } else {
        summary.push(`dev_todos (${dc[0].c} existing)`);
      }
    }

    if (wantDevTenant || wantTestPlayer) {
      await seedDevTenantOrganizer(client, summary);
    }

    if (wantTestPlayer) {
      await seedTestPlayerDevLeague(client, summary);
    }

    if (wantDemoScenario) {
      await seedDemoScenario(client, summary);
    }
  });

  return { summary };
}

/** Three demo organizers, tournaments, and player accounts — idempotent by slug / email. */
async function seedDemoScenario(client, summary) {
  const demoPassword = process.env.DEMO_SEED_PASSWORD || 'demo123';
  const pwHash = await bcrypt.hash(demoPassword, 10);

  const { rows: gtRows } = await client.query(
    `SELECT id::text AS id FROM game_templates WHERE title = 'Valorant' LIMIT 1`
  );
  const gameTemplateId = gtRows[0]?.id || null;

  const organizers = [
    {
      slug: 'alpha-esports',
      name: 'Alpha Esports (demo)',
      email: 'organizer-alpha@demo.arena.local',
      tName: 'Alpha Spring Open',
    },
    {
      slug: 'beta-gaming',
      name: 'Beta Gaming (demo)',
      email: 'organizer-beta@demo.arena.local',
      tName: 'Beta Weekly Cup',
    },
    {
      slug: 'gamma-league',
      name: 'Gamma League (demo)',
      email: 'organizer-gamma@demo.arena.local',
      tName: 'Gamma Invitational',
    },
  ];

  const playerEmails = [
    'player1-demo@arena.local',
    'player2-demo@arena.local',
    'player3-demo@arena.local',
    'player4-demo@arena.local',
    'player5-demo@arena.local',
    'player6-demo@arena.local',
  ];

  for (const pe of playerEmails) {
    const ex = await client.query(`SELECT id FROM users WHERE email = $1`, [pe]);
    if (!ex.rowCount) {
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'user')`,
        [pe, pwHash, pe.split('@')[0]]
      );
      summary.push(`demo-player:${pe}`);
    }
    const { rows: pwRows } = await client.query(`SELECT id FROM users WHERE email = $1`, [pe]);
    const pid = pwRows[0]?.id;
    if (pid) {
      const insW = await client.query(
        `INSERT INTO user_wallets (user_id, currency, balance) VALUES ($1::uuid, 'USD', 0)
         ON CONFLICT (user_id, currency) DO NOTHING
         RETURNING id`,
        [pid]
      );
      if (insW.rowCount) summary.push(`demo-player-wallet:${pe}`);
    }
  }

  const start = new Date();
  start.setDate(start.getDate() + 10);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  const regDeadline = new Date();
  regDeadline.setDate(regDeadline.getDate() + 7);

  let oi = 0;
  for (const org of organizers) {
    oi += 1;
    let tid;
    const existingT = await client.query(`SELECT id FROM tenants WHERE slug = $1`, [org.slug]);
    if (existingT.rows.length) {
      tid = existingT.rows[0].id;
      summary.push(`demo-tenant:${org.slug} (exists)`);
    } else {
      const ins = await client.query(
        `INSERT INTO tenants (name, slug, plan, status, owner_email, logo_url)
         VALUES ($1, $2, 'pro', 'active', $3, $4)
         RETURNING id`,
        [org.name, org.slug, org.email, 'https://mails.bybata.com/logomail.png']
      );
      tid = ins.rows[0].id;
      summary.push(`demo-tenant:${org.slug}`);
    }
    const tidStr = String(tid);

    const cfg = await client.query(`SELECT id FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`, [tidStr]);
    if (!cfg.rowCount) {
      await client.query(
        `INSERT INTO tenant_configs (tenant_id, tenant_name, logo_url, primary_color, secondary_color, accent_color, display_font)
         VALUES ($1, $2, $3, '#00d4ff', '#0a0e1a', '#ff4655', 'Orbitron')`,
        [tidStr, org.name, 'https://mails.bybata.com/logomail.png']
      );
    }

    const ent = await client.query(`SELECT id FROM tenant_entitlements WHERE tenant_id = $1 LIMIT 1`, [tidStr]);
    if (!ent.rowCount) {
      await client.query(
        `INSERT INTO tenant_entitlements (tenant_id, plan, status, max_teams_per_tournament, max_admins, is_active, plan_type, single_tournament_remaining)
         VALUES ($1, 'pro', 'active', 32, 5, TRUE, 'monthly', 0)`,
        [tidStr]
      );
    }

    const w = await client.query(`SELECT id FROM tenant_wallets WHERE tenant_id = $1`, [tidStr]);
    if (!w.rowCount) {
      await client.query(`INSERT INTO tenant_wallets (tenant_id, balance, currency) VALUES ($1, 0, 'USD')`, [tidStr]);
    }

    const orgUser = await client.query(`SELECT id FROM users WHERE email = $1`, [org.email]);
    let orgId = orgUser.rows[0]?.id;
    if (!orgId) {
      const u = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'user') RETURNING id`,
        [org.email, pwHash, org.name.replace(' (demo)', '')]
      );
      orgId = u.rows[0].id;
      summary.push(`demo-organizer:${org.email}`);
    }
    await client.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role_in_tenant) VALUES ($1::uuid, $2, 'organizer')
       ON CONFLICT (user_id, tenant_id) DO NOTHING`,
      [orgId, tidStr]
    );

    let tourId;
    const exTour = await client.query(`SELECT id FROM tournaments WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [
      tidStr,
      org.tName,
    ]);
    if (exTour.rows.length) {
      tourId = exTour.rows[0].id;
    } else {
      const tIns = await client.query(
        `INSERT INTO tournaments (
           tenant_id, name, game_template_id, game_title, format, status, description, banner_url,
           max_teams, registered_teams, prize_pool, currency, entry_fee, start_date, end_date, registration_deadline, check_in_duration_minutes, seeding_method
         ) VALUES (
           $1, $2, $3, 'Valorant', 'single_elimination', 'registration_open',
           'Seeded demo tournament for UX testing — teams and players are sample data.',
           'https://mails.bybata.com/logomail.png',
           16, 0, 500, 'USD', 0, $4, $5, $6, 15, 'random'
         ) RETURNING id`,
        [tidStr, org.tName, gameTemplateId, start.toISOString(), end.toISOString(), regDeadline.toISOString()]
      );
      tourId = tIns.rows[0].id;
      summary.push(`demo-tournament:${org.tName}`);
    }
    const tourIdStr = String(tourId);

    const b = (oi - 1) * 2;
    const teams = [
      {
        name: `Thunder Squad ${oi}`,
        tag: `TH${oi}A`,
        cap: playerEmails[b % playerEmails.length],
        mate: playerEmails[(b + 1) % playerEmails.length],
      },
      {
        name: `Storm Unit ${oi}`,
        tag: `ST${oi}B`,
        cap: playerEmails[(b + 2) % playerEmails.length],
        mate: playerEmails[(b + 3) % playerEmails.length],
      },
    ];

    let reg = 0;
    for (const tm of teams) {
      const exTeam = await client.query(
        `SELECT id FROM teams WHERE tournament_id::text = $1 AND tag = $2 LIMIT 1`,
        [tourIdStr, tm.tag]
      );
      if (exTeam.rows.length) {
        reg += 1;
        continue;
      }
      const roster = [
        {
          player_name: tm.cap.split('@')[0],
          player_email: tm.cap,
          role: 'captain',
          game_id: `${tm.tag}-1`,
        },
        {
          player_name: tm.mate.split('@')[0],
          player_email: tm.mate,
          role: 'player',
          game_id: `${tm.tag}-2`,
        },
      ];
      await client.query(
        `INSERT INTO teams (tenant_id, tournament_id, name, tag, captain_email, roster, status)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'registered')`,
        [tidStr, tourIdStr, tm.name, tm.tag, tm.cap, JSON.stringify(roster)]
      );
      reg += 1;
      summary.push(`demo-team:${tm.tag}`);
    }

    await client.query(`UPDATE tournaments SET registered_teams = $1 WHERE id::text = $2`, [reg, tourIdStr]);
  }

  summary.push('demo-scenario:complete');

  // Populate free agents, community, Elo, live matches from registered users (not fake names)
  await seedMarketplaceFromRegisteredAccounts(client, summary);
}

/**
 * Idempotent marketplace content tied to **real registered users** already in the DB:
 * free-agent listings, global community posts, team Elo prestige, live matches + streams.
 */
async function seedMarketplaceFromRegisteredAccounts(client, summary) {
  // ── Profile region + game handles for players ──
  const { rows: players } = await client.query(
    `SELECT id, email, full_name, game_handles FROM users
     WHERE role <> 'admin' AND email NOT ILIKE 'admin@%'
     ORDER BY email`
  );

  const regions = ['NA', 'EU', 'LATAM', 'ASIA', 'OCE', 'AF', 'ME'];
  const games = ['Valorant', 'Counter-Strike 2', 'League of Legends', 'Apex Legends'];
  const ranks = ['Immortal', 'Diamond', 'Platinum', 'Gold', 'Radiant', 'Challenger'];
  const availability = ['anytime', 'weekends', 'weekdays', 'limited'];

  let fa = 0;
  let i = 0;
  for (const p of players) {
    const email = String(p.email || '').toLowerCase();
    if (!email) continue;
    const display =
      String(p.full_name || '').trim() ||
      email.split('@')[0].replace(/[-_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const region = regions[i % regions.length];
    const game = games[i % games.length];
    const rank = ranks[i % ranks.length];
    const avail = availability[i % availability.length];
    const handle = `${display.replace(/\s+/g, '')}#${String(1000 + (i % 9000))}`;

    // Update profile passport (real account fields)
    const gh =
      p.game_handles && typeof p.game_handles === 'object' && !Array.isArray(p.game_handles)
        ? { ...p.game_handles }
        : {};
    if (!gh[game]) gh[game] = handle;
    await client.query(
      `UPDATE users SET
         profile_region = COALESCE(NULLIF(TRIM(COALESCE(profile_region, '')), ''), $2),
         game_handles = COALESCE(game_handles, '{}'::jsonb) || $3::jsonb,
         full_name = COALESCE(NULLIF(TRIM(full_name), ''), $4),
         updated_date = NOW()
       WHERE id = $1::uuid`,
      [p.id, region.toLowerCase() === 'na' ? 'us' : region.toLowerCase(), JSON.stringify(gh), display]
    );

    const existsFa = await client.query(
      `SELECT id FROM free_agents WHERE lower(player_email) = $1 LIMIT 1`,
      [email]
    );
    if (!existsFa.rowCount) {
      await client.query(
        `INSERT INTO free_agents (
           player_email, display_name, bio, preferred_games, rank, region, roles, availability,
           discord_handle, is_active, wins, tournaments_played, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $1)`,
        [
          email,
          display,
          `Registered competitor looking for a serious ${game} roster. Available ${avail}. Region ${region}.`,
          [game, games[(i + 1) % games.length]],
          rank,
          region,
          i % 2 === 0 ? ['IGL', 'entry'] : ['flex', 'support'],
          avail,
          `${email.split('@')[0]}#arena`,
          2 + (i % 12),
          1 + (i % 8),
        ]
      );
      fa += 1;
    }
    i += 1;
  }
  if (fa) summary.push(`free_agents:${fa}`);

  // ── Community posts from real user ids ──
  let posts = 0;
  const postBodies = [
    {
      type: 'announcement',
      title: 'Welcome to the Arena war room',
      content:
        'This feed is live. Organizers pin official updates; players share strats and recruitment. Sign in to post and like.',
      pinned: true,
    },
    {
      type: 'recruitment',
      title: 'LF entry fragger for ranked 5-stack',
      content:
        'Looking for a consistent entry who can IGL mid-round. Prefer Immortal+. Drop your game ID + availability.',
      pinned: false,
    },
    {
      type: 'strategy',
      title: 'Check-in window tip',
      content:
        'Always open match lobby 10 minutes early — forfeit worker is live on overdue check_in_open matches.',
      pinned: false,
    },
    {
      type: 'recruitment',
      title: 'Free agent market is open',
      content: 'Browse /free-agents and invite players who already registered accounts on this platform.',
      pinned: false,
    },
  ];

  for (let pi = 0; pi < postBodies.length && pi < players.length; pi += 1) {
    const author = players[pi];
    const body = postBodies[pi];
    const ex = await client.query(
      `SELECT id FROM community_posts WHERE author_id = $1::uuid AND title = $2 AND deleted_at IS NULL LIMIT 1`,
      [author.id, body.title]
    );
    if (ex.rowCount) continue;
    await client.query(
      `INSERT INTO community_posts (tenant_id, author_id, title, content, post_type, pinned, like_count)
       VALUES (NULL, $1::uuid, $2, $3, $4, $5, $6)`,
      [author.id, body.title, body.content, body.type, body.pinned, 3 + pi]
    );
    posts += 1;
  }
  if (posts) summary.push(`community_posts:${posts}`);

  // ── Elo from existing teams (prestige ladder) ──
  const { rows: teamRows } = await client.query(
    `SELECT id::text AS id, tenant_id, name, tag, elo FROM teams ORDER BY created_date ASC LIMIT 40`
  );
  let eloN = 0;
  for (const t of teamRows) {
    const link = await client.query(`SELECT elo_entity_id FROM team_elo_links WHERE team_id::text = $1`, [t.id]);
    if (link.rowCount) continue;
    const base = Number(t.elo) > 0 ? Number(t.elo) : 1180 + (eloN % 20) * 12;
    const wins = 1 + (eloN % 9);
    const losses = eloN % 6;
    const ins = await client.query(
      `INSERT INTO elo_entities (tenant_id, display_name, tag, elo, wins, losses, entity_kind)
       VALUES ($1, $2, $3, $4, $5, $6, 'team') RETURNING id`,
      [String(t.tenant_id || 'platform'), t.name, t.tag || 'TAG', base, wins, losses]
    );
    await client.query(`INSERT INTO team_elo_links (team_id, elo_entity_id) VALUES ($1, $2)`, [
      t.id,
      ins.rows[0].id,
    ]);
    await client.query(`UPDATE teams SET elo = $1 WHERE id::text = $2`, [base, t.id]);
    eloN += 1;
  }
  if (eloN) summary.push(`elo_entities_teams:${eloN}`);

  // Player Elo for first few registered users
  let pElo = 0;
  for (let j = 0; j < Math.min(6, players.length); j += 1) {
    const u = players[j];
    const plink = await client.query(`SELECT elo_entity_id FROM player_elo_links WHERE user_id = $1::uuid`, [
      u.id,
    ]);
    if (plink.rowCount) continue;
    const display =
      String(u.full_name || '').trim() || String(u.email || '').split('@')[0];
    const ins = await client.query(
      `INSERT INTO elo_entities (tenant_id, display_name, tag, elo, wins, losses, entity_kind)
       VALUES ('platform', $1, $2, $3, $4, $5, 'player') RETURNING id`,
      [display, String(u.email || 'PLR').split('@')[0].slice(0, 8).toUpperCase(), 1200 + j * 15, j + 1, j % 3]
    );
    try {
      await client.query(`INSERT INTO player_elo_links (user_id, elo_entity_id) VALUES ($1::uuid, $2)`, [
        u.id,
        ins.rows[0].id,
      ]);
      pElo += 1;
    } catch {
      /* table may lag migrate */
    }
  }
  if (pElo) summary.push(`elo_entities_players:${pElo}`);

  // ── Live matches + streams for Watch hub ──
  const { rows: tourOpen } = await client.query(
    `SELECT id::text AS id, tenant_id, name, stream_url FROM tournaments
     WHERE status IN ('registration_open', 'in_progress', 'registration_closed')
     ORDER BY created_date DESC LIMIT 5`
  );

  let liveM = 0;
  for (const tour of tourOpen) {
    const { rows: teamsT } = await client.query(
      `SELECT id::text AS id, name FROM teams WHERE tournament_id::text = $1 ORDER BY created_date LIMIT 4`,
      [tour.id]
    );
    if (teamsT.length < 2) continue;

    const mEx = await client.query(
      `SELECT id FROM matches WHERE tournament_id::text = $1 AND status = 'in_progress' LIMIT 1`,
      [tour.id]
    );
    let matchId;
    if (mEx.rowCount) {
      matchId = mEx.rows[0].id;
    } else {
      const insM = await client.query(
        `INSERT INTO matches (
           tenant_id, tournament_id, round, match_number, team_a_id, team_a_name, team_b_id, team_b_name,
           score_a, score_b, status, stream_url
         ) VALUES (
           $1, $2, 1, 1, $3, $4, $5, $6, 1, 0, 'in_progress',
           'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
         ) RETURNING id`,
        [
          String(tour.tenant_id),
          tour.id,
          teamsT[0].id,
          teamsT[0].name,
          teamsT[1].id,
          teamsT[1].name,
        ]
      );
      matchId = insM.rows[0].id;
      liveM += 1;
    }

    await client.query(
      `UPDATE tournaments SET
         status = CASE WHEN status = 'registration_open' THEN status ELSE 'in_progress' END,
         stream_url = COALESCE(NULLIF(TRIM(stream_url), ''), 'https://www.twitch.tv/valorant')
       WHERE id::text = $1`,
      [tour.id]
    );

    const sEx = await client.query(
      `SELECT id FROM tournament_streams WHERE tournament_id::text = $1 LIMIT 1`,
      [tour.id]
    );
    if (!sEx.rowCount) {
      await client.query(
        `INSERT INTO tournament_streams (tournament_id, match_id, tenant_id, label, stream_url, provider, sort_order, is_primary)
         VALUES ($1, $2, $3, 'Main broadcast', 'https://www.twitch.tv/valorant', 'twitch', 0, TRUE)`,
        [tour.id, String(matchId), String(tour.tenant_id)]
      );
      await client.query(
        `INSERT INTO tournament_streams (tournament_id, match_id, tenant_id, label, stream_url, provider, sort_order, is_primary)
         VALUES ($1, $2, $3, 'Co-stream EN', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 1, FALSE)`,
        [tour.id, String(matchId), String(tour.tenant_id)]
      );
    }
  }
  if (liveM) summary.push(`live_matches:${liveM}`);

  // Accolades for a couple players if none
  const { rows: acCount } = await client.query(`SELECT COUNT(*)::int AS c FROM user_accolades`);
  if ((acCount[0]?.c || 0) === 0 && players.length && tourOpen.length) {
    let acc = 0;
    const tenantForAccolade = String(tourOpen[0].tenant_id || '');
    for (let k = 0; k < Math.min(3, players.length); k += 1) {
      await client.query(
        `INSERT INTO user_accolades (user_id, tenant_id, badge_id, tournament_id, tournament_title, rank, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (user_id, tournament_id, rank) DO NOTHING`,
        [
          players[k].id,
          tenantForAccolade,
          k === 0 ? 'gold_champion' : k === 1 ? 'silver_finalist' : 'bronze_competitor',
          tourOpen[0].id,
          tourOpen[0].name || 'Seeded Open',
          k + 1,
          JSON.stringify({ source: 'seed_marketplace' }),
        ]
      );
      acc += 1;
    }
    if (acc) summary.push(`user_accolades:${acc}`);
  }

  summary.push('marketplace-from-registered:complete');
}
