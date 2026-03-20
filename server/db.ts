import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env.local'), override: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL is not set. Database queries will fail until it is configured.');
}

const pgSslMode = String(process.env.PGSSLMODE || '').toLowerCase();
const shouldUseSsl = pgSslMode === 'require' || pgSslMode === 'verify-ca' || pgSslMode === 'verify-full';
const shouldRejectUnauthorized = pgSslMode === 'verify-ca' || pgSslMode === 'verify-full';

export const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl ? { rejectUnauthorized: shouldRejectUnauthorized } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error', err);
});

export async function query<T = any>(text: string, params: any[] = []) {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error('Database query error', { text, error });
    throw error;
  }
}
