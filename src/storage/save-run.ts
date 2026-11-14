import { normalizeBusinessName, normalizePhone } from '../dedupe/dedupe';
import type { RankedLead } from '../domain/types';
import type { PipelineReport } from '../workflow/pipeline';

/**
 * Saves a finished run to the database.
 *
 * Place-ID-only rule: for a business found through Google Places, only the
 * place ID, the category and city we searched for, and our own results
 * (website status, confidence, score, reasons) are stored. Names, addresses,
 * phone numbers, websites and links from Google are never written. The
 * database enforces the same rule.
 */

/** Minimal database interface. Both `pg` and the in-memory test database fit it. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class RunInProgressError extends Error {
  constructor() { super('A run is already in progress.'); }
}

const STALE_AFTER = '2 hours';

/**
 * Marks the start of a run. Only one run can be in progress at a time.
 * A run left "running" for over two hours is treated as crashed and closed.
 */
export async function startExecution(db: Db, trigger: 'schedule' | 'manual'): Promise<string> {
  await db.query(
    `update automation_executions set status = 'failed', finished_at = now(),
       error = 'Marked failed: no result after ${STALE_AFTER}.'
     where status = 'running' and started_at < now() - interval '${STALE_AFTER}'`,
  );
  try {
    const r = await db.query<{ id: string }>(
      `insert into automation_executions (trigger) values ($1) returning id`, [trigger],
    );
    return r.rows[0]!.id;
  } catch (err) {
    if (/duplicate key|unique/i.test(String(err))) throw new RunInProgressError();
    throw err;
  }
}

async function upsertBusiness(db: Db, lead: RankedLead, nowIso: string): Promise<string> {
  const c = lead.candidate;
  if (c.source === 'google_places') {
    const r = await db.query<{ id: string }>(
      `insert into businesses (source, external_id, category, city, discovered_at, last_verified_at)
       values ('google_places', $1, $2, $3, $4, $4)
       on conflict (external_id) where external_id is not null
       do update set last_verified_at = excluded.last_verified_at
       returning id`,
      [c.externalId, c.category, c.city, nowIso],
    );
    return r.rows[0]!.id;
  }
  const r = await db.query<{ id: string }>(
    `insert into businesses (source, external_id, name, normalized_name, category, city, address, phone, phone_key,
       email, social_urls, maps_url, website_url, description, operational, discovered_at, last_verified_at)
     values ('manual', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     on conflict (normalized_name, lower(city))
     do update set last_verified_at = excluded.last_verified_at
     returning id`,
    [c.externalId ?? null, c.name, normalizeBusinessName(c.name), c.category, c.city, c.address ?? null,
     c.phone ?? null, normalizePhone(c.phone), c.email ?? null, c.socialUrls, c.mapsUrl ?? null,
     c.websiteUrl ?? null, c.description ?? null, c.operational, c.discoveredAt, nowIso],
  );
  return r.rows[0]!.id;
}

/** What may be stored about a lead in the saved report. No Google content. */
function storedLead(lead: RankedLead, selected: Set<RankedLead>) {
  const google = lead.candidate.source === 'google_places';
  return {
    placeId: google ? lead.candidate.externalId : undefined,
    name: google ? undefined : lead.candidate.name,
    category: lead.candidate.category, city: lead.candidate.city,
    websiteStatus: lead.verification.status,
    confidencePct: Math.round(lead.verification.confidence * 100),
    score: lead.score.total, recommendation: lead.score.websiteRecommendation,
    demoSelected: selected.has(lead),
  };
}

export interface SaveRunResult { status: 'succeeded' | 'partial'; businessesSaved: number }

export async function saveRun(
  db: Db,
  executionId: string,
  run: PipelineReport,
  opts: { apiUsage?: Record<string, number>; extraFailures?: number } = {},
): Promise<SaveRunResult> {
  const failureCount = run.failures.length + (opts.extraFailures ?? 0);
  const status = failureCount > 0 ? 'partial' : 'succeeded';
  try {
    await db.query('begin');
    for (const lead of run.ranked) {
      const google = lead.candidate.source === 'google_places';
      const businessId = await upsertBusiness(db, lead, run.generatedAt);
      // Evidence keeps our own notes. Links and addresses from Google are dropped.
      const evidence = lead.verification.evidence.map((e) =>
        google ? { kind: e.kind, detail: e.detail, observedAt: e.observedAt } : e,
      );
      const v = await db.query<{ id: string }>(
        `insert into website_verifications (business_id, status, confidence, website_url, evidence, notes, verified_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7) returning id`,
        [businessId, lead.verification.status, lead.verification.confidence,
         google ? null : lead.verification.websiteUrl ?? null,
         JSON.stringify(evidence), lead.verification.notes, run.generatedAt],
      );
      await db.query(
        `insert into lead_scores (business_id, verification_id, total, factors, prioritized, decision_reason, website_recommendation, scored_at)
         values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [businessId, v.rows[0]!.id, lead.score.total, JSON.stringify(lead.score.factors), lead.score.prioritized,
         lead.score.decisionReason, lead.score.websiteRecommendation, run.generatedAt],
      );
    }

    const selected = new Set(run.demoSelections);
    const stats = {
      discovered: run.discovered, verified: run.verified, qualified: run.qualifiedOpportunities,
      shortlisted: run.shortlisted.length, demosSelected: run.demoSelections.length,
      duplicatesDropped: run.duplicatesDropped.length, failures: failureCount,
    };
    await db.query(
      `insert into daily_reports (execution_id, body) values ($1, $2::jsonb)`,
      [executionId, JSON.stringify({
        generatedAt: run.generatedAt, ...stats,
        leads: run.shortlisted.map((l) => storedLead(l, selected)),
      })],
    );
    await db.query(
      `update automation_executions set status = $2, finished_at = now(), stats = $3::jsonb, api_usage = $4::jsonb where id = $1`,
      [executionId, status, JSON.stringify(stats), JSON.stringify(opts.apiUsage ?? {})],
    );
    await db.query('commit');
    return { status, businessesSaved: run.ranked.length };
  } catch (err) {
    await db.query('rollback').catch(() => {});
    await db.query(
      `update automation_executions set status = 'failed', finished_at = now(), error = $2 where id = $1`,
      [executionId, 'Saving the run failed.'],
    ).catch(() => {});
    throw err;
  }
}
