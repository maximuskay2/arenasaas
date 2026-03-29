/**
 * Must be imported before any module that reads DATABASE_* (e.g. db.js).
 * ES modules evaluate static imports before other statements in the entry file,
 * so dotenv cannot run in index.js body after `import … from './routes/auth'`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Do not override existing vars so Docker / CI env wins over server/.env (e.g. REDIS_URL=redis://redis:6379).
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const raw = process.env.DATABASE_RUNTIME_URL || process.env.DATABASE_URL;
if (!raw) {
  console.warn('[db] DATABASE_RUNTIME_URL / DATABASE_URL not set');
} else {
  try {
    const u = new URL(raw);
    const db = u.pathname.replace(/^\//, '') || '(default)';
    console.info(`[db] using ${u.hostname}:${u.port || 5432} / ${db}`);
  } catch {
    console.warn('[db] could not parse database URL');
  }
}
