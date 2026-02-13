import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL is not set. Database queries will fail until it is configured.');
}

const shouldUseSsl = process.env.PGSSLMODE === 'require' || process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
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
