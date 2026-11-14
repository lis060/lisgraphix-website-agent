import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

// Supabase provides the "authenticated" role and auth.uid(). This stub
// reproduces them so the real policy file can be tested locally.
const SUPABASE_STUB = `
  create role authenticated nologin;
  create role anon nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
`;
const GRANTS = `
  grant usage on schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
`;
const OWNER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';

let db: PGlite;
let businessId: string;

/** Runs a query as a signed-in user, then returns to the server role. */
async function as<T>(uid: string, query: string) {
  await db.exec(`set request.jwt.claim.sub = '${uid}'; set role authenticated;`);
  try {
    return await db.query<T>(query);
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(readFileSync('supabase/migrations/20261114000000_initial_schema.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261114010000_auth_policies.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261114020000_harden_functions.sql', 'utf8'));
  await db.exec(GRANTS);
  await db.query(`insert into app_users (auth_user_id, email) values ('${OWNER}', 'owner@example.test')`);
  const r = await db.query<{ id: string }>(
    `insert into businesses (name, normalized_name, category, city) values ('Sample Salon','sample salon','Beauty salon','Accra') returning id`,
  );
  businessId = r.rows[0]!.id;
  await db.query(`insert into outreach_drafts (business_id, body) values ('${businessId}', 'hello')`);
});

describe('dashboard access rules', () => {
  it('lets an allowlisted user read data', async () => {
    expect((await as(OWNER, 'select id from businesses')).rows).toHaveLength(1);
    expect((await as(OWNER, 'select key from app_settings')).rows.length).toBeGreaterThan(0);
  });

  it('shows nothing to a signed-in user who is not on the allowlist', async () => {
    for (const table of ['businesses', 'app_users', 'outreach_drafts', 'app_settings', 'daily_reports']) {
      expect((await as(STRANGER, `select * from ${table}`)).rows).toEqual([]);
    }
  });

  it('stops a stranger changing anything', async () => {
    const r = await as(STRANGER, `update businesses set client_status='Won' returning id`);
    expect(r.rows).toEqual([]);
    const check = await db.query<{ client_status: string }>('select client_status from businesses');
    expect(check.rows[0]!.client_status).toBe('New Lead');
  });

  it('stops a stranger adding themselves to the allowlist', async () => {
    await expect(
      as(STRANGER, `insert into app_users (auth_user_id, email) values ('${STRANGER}', 'x@example.test')`),
    ).rejects.toThrow(/row-level security/);
  });

  it('lets the owner move a client stage and records who did it', async () => {
    await as(OWNER, `update businesses set client_status='Qualified' where id='${businessId}'`);
    const h = await db.query<{ to_status: string; email: string }>(
      `select h.to_status, u.email from client_status_history h join app_users u on u.id = h.changed_by`,
    );
    expect(h.rows).toEqual([{ to_status: 'Qualified', email: 'owner@example.test' }]);
  });

  it('does not let even the owner insert or delete records from the browser', async () => {
    await expect(
      as(OWNER, `insert into businesses (name, normalized_name, category, city) values ('X','x','Salon','Tema')`),
    ).rejects.toThrow(/row-level security/);
    expect((await as(OWNER, `delete from businesses returning id`)).rows).toEqual([]);
    await expect(
      as(OWNER, `insert into client_status_history (business_id, to_status) values ('${businessId}', 'Won')`),
    ).rejects.toThrow(/row-level security/);
  });

  it('leaves no access-check function callable in the public schema', async () => {
    const r = await db.query(`select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_app_user'`);
    expect(r.rows).toEqual([]);
    await expect(as(OWNER, 'select public.businesses_before_update()')).rejects.toThrow(/permission denied/);
  });

  it('still blocks marking outreach as sent without approval', async () => {
    await expect(as(OWNER, `update outreach_drafts set status='sent'`)).rejects.toThrow(/sent_needs_approval/);
  });
});
