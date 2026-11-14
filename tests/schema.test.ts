import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const sql = readFileSync('supabase/migrations/20261114000000_initial_schema.sql', 'utf8');

async function rejects(query: string, match: RegExp) {
  await expect(db.query(query)).rejects.toThrow(match);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql);
});

const biz = (name: string, extra = '') =>
  `insert into businesses (name, normalized_name, category, city${extra ? ', ' + extra.split('|')[0] : ''})
   values ('${name}', lower('${name}'), 'Beauty salon', 'Accra'${extra ? ', ' + extra.split('|')[1] : ''}) returning id`;

describe('schema', () => {
  it('applies cleanly and seeds spec defaults, with the schedule disabled', async () => {
    const s = await db.query<{ enabled: boolean; cron: string; timezone: string }>('select * from automation_schedules');
    expect(s.rows[0]).toMatchObject({ cron: '30 9 * * *', timezone: 'Africa/Accra', enabled: false });
    const t = await db.query('select count(*)::int as n from templates');
    expect((t.rows[0] as { n: number }).n).toBe(5);
  });

  it('prevents duplicate businesses by name and city, ignoring case', async () => {
    await db.query(biz('Dup Salon'));
    await rejects(`insert into businesses (name, normalized_name, category, city) values ('X','dup salon','Salon','ACCRA')`, /duplicate key/);
  });

  it('prevents a second running execution', async () => {
    await db.query(`insert into automation_executions (trigger) values ('manual')`);
    await rejects(`insert into automation_executions (trigger) values ('schedule')`, /duplicate key/);
    await db.query(`update automation_executions set status='succeeded', finished_at=now()`);
    await db.query(`insert into automation_executions (trigger) values ('schedule')`); // allowed once the first finished
  });

  it('rejects invalid scores, confidences, statuses', async () => {
    const { rows } = await db.query<{ id: string }>(biz('Score Salon'));
    const id = rows[0]!.id;
    await rejects(`insert into lead_scores (business_id,total,decision_reason) values ('${id}',101,'x')`, /check/);
    await rejects(`insert into website_verifications (business_id,status,confidence) values ('${id}','uncertain',1.5)`, /check|numeric/);
    await rejects(`insert into website_verifications (business_id,status,confidence) values ('${id}','made_up',0.5)`, /check/);
  });

  it('refuses a ready deployment without a verified real URL', async () => {
    const { rows } = await db.query<{ id: string }>(biz('Deploy Salon'));
    const demo = await db.query<{ id: string }>(`insert into generated_demos (business_id, spec) values ('${rows[0]!.id}','{}') returning id`);
    const d = demo.rows[0]!.id;
    await rejects(`insert into deployments (demo_id,status) values ('${d}','ready')`, /ready_needs_verified_url/);
    await rejects(`insert into deployments (demo_id,status,deployment_url) values ('${d}','ready','https://x.example')`, /ready_needs_verified_url/);
    await db.query(`insert into deployments (demo_id,status,deployment_url,url_reachable) values ('${d}','ready','https://x.example',true)`);
  });

  it('refuses to mark outreach as sent without approval', async () => {
    const { rows } = await db.query<{ id: string }>(biz('Outreach Salon'));
    const b = rows[0]!.id;
    await rejects(`insert into outreach_drafts (business_id,body,status) values ('${b}','hi','sent')`, /sent_needs_approval/);
    await db.query(`insert into outreach_drafts (business_id,body) values ('${b}','hi')`); // draft by default
  });

  it('logs client status changes automatically', async () => {
    const { rows } = await db.query<{ id: string }>(biz('History Salon'));
    const b = rows[0]!.id;
    await db.query(`update businesses set client_status='Qualified' where id='${b}'`);
    const h = await db.query<{ from_status: string; to_status: string }>(`select from_status,to_status from client_status_history where business_id='${b}'`);
    expect(h.rows).toEqual([{ from_status: 'New Lead', to_status: 'Qualified' }]);
  });

  it('enables row level security on every table', async () => {
    const r = await db.query<{ relname: string }>(
      `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(r.rows).toEqual([]);
  });
});
