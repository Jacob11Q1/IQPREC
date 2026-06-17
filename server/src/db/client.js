/* ============================================================
   IQPREC — db/client.js
   PostgreSQL connection pool (node-postgres / pg).
   Single Pool instance shared across all services.
   ============================================================ */

import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

let pool = null;

if (env.DATABASE_URL) {
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    console.error('[db] unexpected pool error:', err.message);
  });
} else {
  console.warn('[db] DATABASE_URL not configured — DB features disabled.');
}

export function hasDb() {
  return pool !== null;
}

export { pool };
export default pool;
