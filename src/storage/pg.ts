import pg from 'pg';
import type { Db } from './save-run';

/**
 * Connects to the Supabase Postgres database with DATABASE_URL.
 * The connection string contains the database password: keep it in .env only.
 * Not yet verified against the live database.
 */
export async function connect(databaseUrl: string): Promise<Db & { close: () => Promise<void> }> {
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: true } });
  await client.connect();
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const r = await client.query(sql, params as unknown[]);
      return { rows: r.rows as T[] };
    },
    close: () => client.end(),
  };
}
