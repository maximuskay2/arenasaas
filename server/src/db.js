import pg from 'pg';

const { Pool } = pg;

/** Runtime queries: use arena_app (NOBYPASSRLS). Falls back to DATABASE_URL if unset (dev: superuser bypasses RLS). */
const runtimeUrl = process.env.DATABASE_RUNTIME_URL || process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: runtimeUrl,
  max: 20,
  idleTimeoutMillis: 30000,
});

/**
 * Optional read replica for heavy analytics (Super Admin pulse). Falls back to primary when unset.
 * Set DATABASE_READ_REPLICA_URL to point at a replica; keep writes on `pool` only.
 */
const replicaUrl = process.env.DATABASE_READ_REPLICA_URL;
export const readPool =
  replicaUrl && replicaUrl !== runtimeUrl
    ? new Pool({
        connectionString: replicaUrl,
        max: 10,
        idleTimeoutMillis: 30000,
      })
    : null;

if (readPool) {
  readPool.on('error', (err) => {
    console.error('[pg read replica]', err);
  });
}

/** Use for SELECT-only dashboards; never for writes. */
export function getReadPool() {
  return readPool || pool;
}

/** Migrations / seed bypass: owner or superuser. Omit in prod if migrate runs separately. */
export const adminPool =
  process.env.DATABASE_ADMIN_URL && process.env.DATABASE_ADMIN_URL !== runtimeUrl
    ? new Pool({
        connectionString: process.env.DATABASE_ADMIN_URL,
        max: 5,
        idleTimeoutMillis: 30000,
      })
    : null;

pool.on('error', (err) => {
  console.error('[pg] unexpected error', err);
});

if (adminPool) {
  adminPool.on('error', (err) => {
    console.error('[pg admin] unexpected error', err);
  });
}
