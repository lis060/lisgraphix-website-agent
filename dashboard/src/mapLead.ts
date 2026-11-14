import type { Lead, SettingsView, Stage } from './data';

/** Shapes returned by the Supabase queries in live.ts. */
export interface BusinessRow {
  id: string; name: string | null; source?: string; external_id?: string | null; category: string; city: string;
  phone: string | null; email: string | null; discovered_at: string; client_status: string;
  website_verifications: { status: string; confidence: number | string; verified_at: string }[];
  lead_scores: { total: number; scored_at: string }[];
  generated_demos: {
    status: string; created_at: string;
    deployments: { status: string; deployment_url: string | null; url_reachable: boolean | null; created_at: string }[];
  }[];
}

const STATUS_LABEL: Record<string, string> = {
  no_official_website_identified: 'No official website identified',
  website_exists: 'Website exists',
  social_media_only: 'Social media only',
  uncertain: 'Uncertain',
  website_broken_or_outdated: 'Website appears broken or outdated',
  needs_manual_verification: 'Needs manual verification',
};

function latest<T>(rows: T[] | null | undefined, key: keyof T): T | undefined {
  return [...(rows ?? [])].sort((a, b) => String(b[key]).localeCompare(String(a[key])))[0];
}

export function mapLead(row: BusinessRow): Lead {
  const v = latest(row.website_verifications, 'verified_at');
  const s = latest(row.lead_scores, 'scored_at');
  const d = latest(row.generated_demos, 'created_at');
  const dep = latest(d?.deployments, 'created_at');
  const contact = [row.phone && 'Phone', row.email && 'Email'].filter(Boolean).join(', ') || 'None';
  const demo: Lead['demo'] =
    !d ? 'None' : d.status === 'failed' ? 'Failed' : d.status === 'archived' ? 'Archived' : 'Ready';
  // A link is only shown when the database says the URL is real and was reachable.
  const live = dep && dep.status === 'ready' && dep.url_reachable === true && dep.deployment_url;
  const demoUrl = live && /^https:\/\//.test(live) ? live : undefined;
  // Google leads are stored by place ID only, so there is no saved name.
  const google = row.source === 'google_places' && !!row.external_id;
  const mapsUrl = google
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.category} ${row.city}`)}&query_place_id=${encodeURIComponent(row.external_id!)}`
    : undefined;
  return {
    mapsUrl,
    id: row.id, name: row.name ?? (google ? 'Google listing' : 'Unnamed'), category: row.category, city: row.city,
    websiteStatus: v ? STATUS_LABEL[v.status] ?? v.status : 'Not verified yet',
    confidence: v ? Math.round(Number(v.confidence) * 100) : null,
    score: s ? s.total : null,
    contact, discovered: row.discovered_at.slice(0, 10), demo, stage: row.client_status as Stage, demoUrl,
  };
}

export function mapSettings(
  rows: { key: string; value: unknown }[],
  schedules: { cron: string; timezone: string; enabled: boolean }[],
  categories: string[],
): SettingsView {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const str = (v: unknown) => (v === undefined || v === null ? 'Not set' : String(v));
  const sch = schedules[0];
  const src = get('image_source');
  return {
    cities: Array.isArray(get('cities')) ? (get('cities') as unknown[]).map(String) : [],
    categories,
    dailyDiscoveryLimit: str(get('daily_discovery_limit')), shortlist: str(get('shortlist_limit')),
    dailyDemoLimit: str(get('daily_demo_limit')), minScore: str(get('min_opportunity_score')),
    schedule: sch ? `${sch.cron} (${sch.timezone}), ${sch.enabled ? 'switched on' : 'switched off'}` : 'No schedule',
    imageSource: src === 'generated' ? `AI-generated (daily cap ${str(get('max_generated_images_per_day'))})` : str(src),
  };
}
