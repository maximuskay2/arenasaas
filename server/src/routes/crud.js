import express from 'express';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { ENTITY_TO_TABLE } from '../entityTables.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';
import { assertCanCreateTournament, decrementOneShotCredit, EntitlementError } from '../entitlements.js';
import { assertTenantActiveForWrites } from '../tenantStatusGuard.js';
import { emitMatchUpdated, emitMatchReady, emitLiveTickerForMatch, emitMatchLobbyMessage } from '../realtime.js';
import { assertPrizeStructureSaveRules } from '../lib/prizeCalculator.js';
import { assertPrizeWithdrawalKycAllowed } from '../lib/prizePayoutKyc.js';

const router = express.Router();

function truthyTbd(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function assertPrizeStructureIfNeeded(body) {
  if (!body || typeof body !== 'object') return;
  if (truthyTbd(body.prize_disclosure_tbd)) return;
  const ps = body.prize_structure;
  if (!ps || typeof ps !== 'object' || !Object.keys(ps).length) return;
  assertPrizeStructureSaveRules(ps);
}

/** Normalize entry_type / entry_fee for tournaments (hybrid monetization). */
function normalizeTournamentCreateBody(body) {
  let et = String(body.entry_type ?? '')
    .trim()
    .toUpperCase();
  if (et !== 'FREE' && et !== 'PAID') {
    et = Number(body.entry_fee) > 0 ? 'PAID' : 'FREE';
  }
  body.entry_type = et;
  if (et === 'FREE') {
    body.entry_fee = 0;
  }
  if (et === 'PAID') {
    const ef = Number(body.entry_fee);
    if (!Number.isFinite(ef) || ef <= 0) {
      const err = new Error('PAID tournaments require entry_fee > 0');
      err.statusCode = 400;
      err.code = 'entry_fee_required';
      throw err;
    }
  }
  if (body.payout_config != null && typeof body.payout_config !== 'object') {
    delete body.payout_config;
  }
  if (body.prize_structure != null && typeof body.prize_structure !== 'object') {
    delete body.prize_structure;
  }
  assertPrizeStructureIfNeeded(body);
}

function normalizeTournamentPatchBody(body) {
  if (body.entry_type != null) {
    const et = String(body.entry_type).trim().toUpperCase();
    if (et === 'FREE') {
      body.entry_type = 'FREE';
      body.entry_fee = 0;
    } else if (et === 'PAID') {
      body.entry_type = 'PAID';
      if (body.entry_fee !== undefined) {
        const ef = Number(body.entry_fee);
        if (!Number.isFinite(ef) || ef <= 0) {
          const err = new Error('PAID tournaments require entry_fee > 0');
          err.statusCode = 400;
          err.code = 'entry_fee_required';
          throw err;
        }
      }
    }
  } else if (body.entry_fee !== undefined) {
    const ef = Number(body.entry_fee);
    if (Number.isFinite(ef) && ef <= 0) {
      body.entry_type = 'FREE';
      body.entry_fee = 0;
    } else if (Number.isFinite(ef) && ef > 0) {
      body.entry_type = 'PAID';
    }
  }
  if (body.payout_config != null && typeof body.payout_config !== 'object') {
    delete body.payout_config;
  }
  if (body.prize_structure != null && typeof body.prize_structure !== 'object') {
    delete body.prize_structure;
  }
  if (body.prize_structure != null || body.prize_disclosure_tbd !== undefined) {
    assertPrizeStructureIfNeeded(body);
  }
}

/** JSON clients often send "" for unset optional fields; PostgreSQL rejects '' for timestamptz/numeric. */
function omitEmptyStringFields(obj) {
  const o = { ...obj };
  for (const k of Object.keys(o)) {
    if (o[k] === '') delete o[k];
  }
  return o;
}

function nullifyEmptyStringFields(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === '') obj[k] = null;
  }
  return obj;
}

function notifyMatchSockets(prevStatus, row) {
  if (!row?.tournament_id) return;
  emitMatchUpdated(row);
  if (row.status === 'check_in_open' && prevStatus !== 'check_in_open') {
    emitMatchReady(row);
  }
  emitLiveTickerForMatch(prevStatus, row);
}

async function auditTenantPayoutSettingsPatch(req, table, row, body) {
  const tid = String(row?.tenant_id || '').trim();
  if (!tid || body?.payout_settings === undefined) return;
  try {
    await runWithRls(
      pool,
      { ...baseCrudContext(req, table), tenantId: tid },
      (client) =>
        client.query(
          `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_email, actor_role, details)
           VALUES ($1, 'tenant_payout_settings_saved', 'tenant_configs', $2, $3, $4, $5)`,
          [
            tid,
            String(row.id),
            String(req.user?.email || 'unknown'),
            String(req.user?.role || 'user'),
            JSON.stringify({
              payout_keys: Object.keys(body.payout_settings && typeof body.payout_settings === 'object' ? body.payout_settings : {}),
            }),
          ]
        )
    );
  } catch (e) {
    console.error('[audit tenant payout]', e);
  }
}

const columnCache = new Map();

async function allowedColumns(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const set = new Set(r.rows.map((x) => x.column_name));
  columnCache.set(table, set);
  return set;
}

function parseOrder(sort) {
  if (!sort || typeof sort !== 'string') return { col: 'created_date', dir: 'DESC' };
  const desc = sort.startsWith('-');
  const col = desc ? sort.slice(1) : sort;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) return { col: 'created_date', dir: 'DESC' };
  return { col, dir: desc ? 'DESC' : 'ASC' };
}

/** Public GET allowlist (no auth) — tenant marketing pages */
const PUBLIC_GET_TABLES = new Set([
  'tenants',
  'tenant_configs',
  'tournaments',
  'teams',
  'matches',
  'game_templates',
  /** Recruitment directory — RLS allows reads with app.allow_public_directory_read for anonymous clients. */
  'free_agents',
]);

function canReadUnauthenticated(table) {
  return PUBLIC_GET_TABLES.has(table);
}

function tenantSlugFromRequest(req) {
  const q = req.query || {};
  const h = req.headers || {};
  return String(q.tenant_slug || q.slug || h['x-tenant-slug'] || h['X-Tenant-Slug'] || '').trim();
}

async function tenantIdForCrud(req) {
  const h = req.headers || {};
  const header = String(h['x-tenant-id'] || h['X-Tenant-ID'] || '').trim();
  if (header) return header;
  const slug = tenantSlugFromRequest(req);
  if (slug) {
    const { rows } = await pool.query('SELECT arena_tenant_id_by_slug($1) AS tid', [slug]);
    const tid = rows[0]?.tid || '';
    if (tid) return tid;
  }
  /** Match rlsContextFromRequest: primary tenant from JWT when X-Tenant-ID / slug absent; keeps app.tenant_id aligned with game_templates.tenant_id injection. */
  const u = req.user;
  if (u?.tenant_id != null && String(u.tenant_id).trim() !== '') return String(u.tenant_id).trim();
  return '';
}

function baseCrudContext(req, table) {
  const publicCatalog = !req.user && canReadUnauthenticated(table);
  return rlsContextFromRequest(req, { publicCatalog });
}

router.get('/:entity', optionalAuth, async (req, res) => {
  const table = ENTITY_TO_TABLE[req.params.entity];
  if (!table) return res.status(404).json({ error: 'Unknown entity' });
  if (!req.user && !canReadUnauthenticated(table)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const cols = await allowedColumns(table);
    const { order, limit: limitQ, ...filters } = req.query;
    const { col: orderCol, dir } = parseOrder(order);
    if (!cols.has(orderCol)) {
      return res.status(400).json({ error: 'Invalid order column' });
    }

    const conditions = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === '') continue;
      if (!cols.has(k)) continue;
      conditions.push(`"${k}" = $${i}`);
      values.push(v);
      i += 1;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim = Math.min(parseInt(limitQ, 10) || 100, 500);
    const sql = `SELECT * FROM ${table} ${where} ORDER BY "${orderCol}" ${dir} LIMIT ${lim}`;

    const tenantId = await tenantIdForCrud(req);
    const slug = tenantSlugFromRequest(req);
    const publicTenantSlug = !req.user && table === 'tenants' ? slug : '';

    const rows = await runWithRls(
      pool,
      {
        ...baseCrudContext(req, table),
        tenantId,
        publicTenantSlug,
      },
      (client) => client.query(sql, values).then((r) => r.rows)
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/:entity', optionalAuth, async (req, res) => {
  const table = ENTITY_TO_TABLE[req.params.entity];
  if (!table) return res.status(404).json({ error: 'Unknown entity' });
  const open = new Set(['tenants', 'tenant_configs', 'otp_records']);
  if (!req.user && !open.has(table)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const cols = await allowedColumns(table);
    const body = omitEmptyStringFields({ ...req.body });
    delete body.id;
    if (table === 'tournaments') {
      try {
        normalizeTournamentCreateBody(body);
      } catch (e) {
        if (e.statusCode === 400) {
          return res.status(400).json({ error: e.message, code: e.code });
        }
        throw e;
      }
    }
    if (table === 'game_templates' && req.user) {
      const platformAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
      if (!platformAdmin) {
        let tid = String((await tenantIdForCrud(req)) || '').trim();
        if (!tid && req.user.tenant_id != null) tid = String(req.user.tenant_id).trim();
        if (!tid) {
          return res.status(400).json({
            error: 'Tenant context required (sign in with a league host account and X-Tenant-ID) to create a game template',
            code: 'tenant_context_required',
          });
        }
        body.tenant_id = tid;
      } else if (body.tenant_id === '' || body.tenant_id === undefined) {
        body.tenant_id = null;
      }
    }
    const keys = Object.keys(body).filter((k) => cols.has(k));
    if (!keys.length) return res.status(400).json({ error: 'No valid columns' });
    const placeholders = keys.map((_, j) => `$${j + 1}`).join(', ');
    const quoted = keys.map((k) => `"${k}"`).join(', ');
    const vals = keys.map((k) => body[k]);
    const sql = `INSERT INTO ${table} (${quoted}) VALUES (${placeholders}) RETURNING *`;

    const tenantId = await tenantIdForCrud(req);
    const effectiveTid = String(body.tenant_id || tenantId || '').trim();
    if (req.user && req.user.role !== 'admin' && table !== 'tenants' && table !== 'otp_records' && effectiveTid) {
      await assertTenantActiveForWrites(effectiveTid, req.user.role);
    }

    const slug = tenantSlugFromRequest(req);
    const publicTenantSlug = !req.user && table === 'tenants' ? slug : '';
    const allowBootstrapTenant = !req.user && table === 'tenants';
    const otpSessionEmail =
      !req.user && table === 'otp_records' && body.email
        ? String(body.email).toLowerCase()
        : '';

    const row = await runWithRls(
      pool,
      {
        ...baseCrudContext(req, table),
        tenantId,
        publicTenantSlug,
        allowBootstrapTenant,
        otpSessionEmail,
      },
      async (client) => {
        if (table === 'tournaments' && req.user && req.user.role !== 'admin') {
          const tid = String(body.tenant_id || tenantId || '');
          await assertCanCreateTournament(client, tid, req.user.role);
        }
        if (table === 'withdrawal_requests' && req.user?.sub) {
          const bi = keys.indexOf('beneficiary_user_id');
          if (bi >= 0 && String(vals[bi] ?? '') === String(req.user.sub)) {
            await assertPrizeWithdrawalKycAllowed(client, req.user.sub);
          }
        }
        const r = await client.query(sql, vals);
        const inserted = r.rows[0];
        if (table === 'tournaments' && inserted && req.user?.role !== 'admin') {
          const tid = String(inserted.tenant_id || '');
          const ent = await client.query(
            `SELECT plan_type FROM tenant_entitlements WHERE tenant_id = $1 LIMIT 1`,
            [tid]
          );
          if (ent.rows[0]?.plan_type === 'one_shot') {
            await decrementOneShotCredit(client, tid);
          }
        }

        // Emit match-scoped lobby chat so only users in the match lobby UI
        // get the realtime message push.
        if (table === 'chat_messages' && inserted?.match_id) {
          emitMatchLobbyMessage(inserted);
        }
        return inserted;
      }
    );
    res.status(201).json(row);
  } catch (e) {
    if (e instanceof EntitlementError) {
      return res.status(e.statusCode).json({ error: e.message, code: e.code });
    }
    if (e.statusCode === 403 && e.code === 'withdrawal_kyc_required') {
      return res.status(403).json({ error: e.message, code: e.code });
    }
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.patch('/:entity/:id', requireAuth, async (req, res) => {
  const table = ENTITY_TO_TABLE[req.params.entity];
  if (!table) return res.status(404).json({ error: 'Unknown entity' });
  const { id } = req.params;
  try {
    const cols = await allowedColumns(table);
    const body = nullifyEmptyStringFields({ ...req.body });
    const tenantId = await tenantIdForCrud(req);

    if (table === 'tournaments') {
      try {
        normalizeTournamentPatchBody(body);
      } catch (e) {
        if (e.statusCode === 400) {
          return res.status(400).json({ error: e.message, code: e.code });
        }
        throw e;
      }
    }

    if (req.user && req.user.role !== 'admin' && tenantId) {
      await assertTenantActiveForWrites(tenantId, req.user.role);
    }

    if (table === 'matches') {
      const evRaw = body.expected_version;
      const useLock = evRaw !== undefined && evRaw !== null && evRaw !== '';
      if (useLock) {
        const expectedV = Number(evRaw);
        if (Number.isNaN(expectedV)) {
          return res.status(400).json({ error: 'expected_version must be a number' });
        }
        const expectedStatusRaw = body.expected_status;
        delete body.expected_version;
        delete body.expected_status;
        delete body.id;
        const keys = Object.keys(body).filter((k) => k !== 'version' && cols.has(k));
        if (!keys.length) return res.status(400).json({ error: 'No valid columns (besides expected_version)' });
        const sets = [];
        const vals = [];
        let idx = 1;
        for (const k of keys) {
          sets.push(`"${k}" = $${idx++}`);
          vals.push(body[k]);
        }
        sets.push(`"version" = COALESCE(version, 1) + 1`);
        vals.push(id, expectedV);
        let sql;
        if (expectedStatusRaw !== undefined && expectedStatusRaw !== null && expectedStatusRaw !== '') {
          vals.push(String(expectedStatusRaw));
          sql = `UPDATE matches SET ${sets.join(', ')} WHERE id = $${idx} AND version = $${idx + 1} AND status = $${idx + 2} RETURNING *`;
        } else {
          sql = `UPDATE matches SET ${sets.join(', ')} WHERE id = $${idx} AND version = $${idx + 1} RETURNING *`;
        }

        const { row, prevStatus } = await runWithRls(
          pool,
          { ...baseCrudContext(req, table), tenantId },
          async (client) => {
            const ps = await client.query(`SELECT status FROM matches WHERE id = $1`, [id]);
            const prevStatus = ps.rows[0]?.status ?? null;
            const r = await client.query(sql, vals);
            return { row: r.rows[0], prevStatus };
          }
        );
        if (!row) {
          const code =
            expectedStatusRaw !== undefined && expectedStatusRaw !== null && expectedStatusRaw !== ''
              ? 'state_conflict'
              : 'optimistic_lock';
          return res.status(409).json({
            error:
              code === 'state_conflict'
                ? 'Match status changed — refresh and retry'
                : 'Concurrent update — refresh and retry',
            code,
          });
        }
        notifyMatchSockets(prevStatus, row);
        return res.json(row);
      }
    }

    const keys = Object.keys(body).filter(
      (k) => k !== 'id' && k !== 'expected_version' && k !== 'expected_status' && cols.has(k)
    );
    if (!keys.length) return res.status(400).json({ error: 'No valid columns' });
    const sets = keys.map((k, j) => `"${k}" = $${j + 1}`).join(', ');
    const vals = keys.map((k) => body[k]);
    vals.push(id);
    const sql = `UPDATE ${table} SET ${sets} WHERE id = $${vals.length} RETURNING *`;

    const { row, prevStatus } = await runWithRls(
      pool,
      { ...baseCrudContext(req, table), tenantId },
      async (client) => {
        let prevStatus = null;
        if (table === 'matches') {
          const ps = await client.query(`SELECT status FROM matches WHERE id = $1`, [id]);
          prevStatus = ps.rows[0]?.status ?? null;
        }
        const result = await client.query(sql, vals);
        return { row: result.rows[0], prevStatus };
      }
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (table === 'matches') notifyMatchSockets(prevStatus, row);
    if (table === 'tournaments' && String(row.status) === 'in_progress') {
      const tid = String(row.tenant_id || tenantId || '');
      if (tid) {
        void runWithRls(pool, { ...rlsContextFromRequest(req), tenantId: tid }, (client) =>
          client.query(
            `UPDATE user_predictions SET locked = TRUE, updated_date = NOW() WHERE tournament_id::text = $1 AND tenant_id = $2`,
            [String(row.id), tid]
          )
        ).catch((err) => console.error('[pickem lock]', err));
      }
    }
    if (table === 'tenant_configs' && body.payout_settings !== undefined) {
      auditTenantPayoutSettingsPatch(req, table, row, body);
    }
    res.json(row);
  } catch (e) {
    if (e instanceof EntitlementError) {
      return res.status(e.statusCode).json({ error: e.message, code: e.code });
    }
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.delete('/:entity/:id', requireAuth, async (req, res) => {
  const table = ENTITY_TO_TABLE[req.params.entity];
  if (!table) return res.status(404).json({ error: 'Unknown entity' });
  try {
    const tenantId = await tenantIdForCrud(req);
    if (req.user && req.user.role !== 'admin' && tenantId) {
      await assertTenantActiveForWrites(tenantId, req.user.role);
    }
    if (table === 'tournaments') {
      const blocked = await runWithRls(pool, { ...baseCrudContext(req, table), tenantId }, async (client) => {
        const { rows } = await client.query(`SELECT status FROM tournaments WHERE id = $1 LIMIT 1`, [req.params.id]);
        return rows[0]?.status === 'completed';
      });
      if (blocked) {
        return res.status(400).json({
          error: 'Completed tournaments are archived and cannot be deleted',
          code: 'tournament_archived',
        });
      }
    }
    const deleted = await runWithRls(
      pool,
      { ...baseCrudContext(req, table), tenantId },
      (client) =>
        client
          .query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id])
          .then((r) => r.rowCount > 0)
    );
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof EntitlementError) {
      return res.status(e.statusCode).json({ error: e.message, code: e.code });
    }
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/:entity/bulk', requireAuth, async (req, res) => {
  const table = ENTITY_TO_TABLE[req.params.entity];
  if (!table) return res.status(404).json({ error: 'Unknown entity' });
  const items = req.body.items || req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected items array' });
  try {
    const cols = await allowedColumns(table);
    const tenantId = await tenantIdForCrud(req);
    const out = await runWithRls(pool, { ...baseCrudContext(req, table), tenantId }, async (client) => {
      const acc = [];
      for (const body of items) {
        const row = omitEmptyStringFields({ ...body });
        delete row.id;
        const eff = String(row.tenant_id || tenantId || '').trim();
        if (req.user && req.user.role !== 'admin' && table !== 'tenants' && eff) {
          await assertTenantActiveForWrites(eff, req.user.role);
        }
        if (table === 'tournaments' && req.user && req.user.role !== 'admin') {
          const tid = String(row.tenant_id || tenantId || '');
          await assertCanCreateTournament(client, tid, req.user.role);
        }
        const keys = Object.keys(row).filter((k) => cols.has(k));
        if (!keys.length) continue;
        const placeholders = keys.map((_, j) => `$${j + 1}`).join(', ');
        const quoted = keys.map((k) => `"${k}"`).join(', ');
        const vals = keys.map((k) => row[k]);
        const sql = `INSERT INTO ${table} (${quoted}) VALUES (${placeholders}) RETURNING *`;
        const r = await client.query(sql, vals);
        const inserted = r.rows[0];
        acc.push(inserted);
        if (table === 'tournaments' && inserted && req.user?.role !== 'admin') {
          const tid = String(inserted.tenant_id || '');
          const ent = await client.query(
            `SELECT plan_type FROM tenant_entitlements WHERE tenant_id = $1 LIMIT 1`,
            [tid]
          );
          if (ent.rows[0]?.plan_type === 'one_shot') {
            await decrementOneShotCredit(client, tid);
          }
        }
      }
      return acc;
    });
    res.status(201).json(out);
  } catch (e) {
    if (e instanceof EntitlementError) {
      return res.status(e.statusCode).json({ error: e.message, code: e.code });
    }
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
