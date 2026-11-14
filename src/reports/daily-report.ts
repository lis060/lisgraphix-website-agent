import type { PipelineReport } from '../workflow/pipeline';

/**
 * The daily report. Built only from what the run actually produced.
 * A preview link appears only when a deployment was verified as reachable.
 */

export const REPORT_TITLE = 'LISGRAPHIX DAILY WEBSITE OPPORTUNITY REPORT';

export interface DeploymentOutcome {
  businessName: string;
  url?: string;
  /** True only when the URL was fetched and answered successfully. */
  verified: boolean;
  error?: string;
}

export interface ReportLead {
  name: string; category: string; city: string;
  websiteStatus: string; confidencePct: number; score: number;
  recommendation: string; sourceUrls: string[];
  demoSelected: boolean; previewUrl: string | null;
}

export interface DailyReport {
  title: string; generatedAt: string;
  discovered: number; qualified: number; demosSelected: number; successfulDeployments: number;
  failures: string[]; leads: ReportLead[]; nextActions: string[];
}

export function buildDailyReport(run: PipelineReport, deployments: DeploymentOutcome[] = []): DailyReport {
  const verifiedUrl = new Map(
    deployments.filter((d) => d.verified && d.url).map((d) => [d.businessName, d.url as string]),
  );
  const selected = new Set(run.demoSelections.map((d) => d.candidate.name));

  const leads: ReportLead[] = run.shortlisted.map((l) => ({
    name: l.candidate.name, category: l.candidate.category, city: l.candidate.city,
    websiteStatus: l.verification.status,
    confidencePct: Math.round(l.verification.confidence * 100),
    score: l.score.total, recommendation: l.score.websiteRecommendation,
    sourceUrls: l.candidate.sourceUrls,
    demoSelected: selected.has(l.candidate.name),
    previewUrl: verifiedUrl.get(l.candidate.name) ?? null,
  }));

  const failures = [
    ...run.failures.map((f) => `${f.name}: ${f.step} failed (${f.message})`),
    ...deployments.filter((d) => !d.verified).map((d) => `${d.businessName}: deployment not verified${d.error ? ` (${d.error})` : ''}`),
  ];

  const nextActions: string[] = [];
  const live = leads.filter((l) => l.previewUrl).length;
  if (live > 0) nextActions.push(`Review ${live} live demo${live > 1 ? 's' : ''} and approve the outreach drafts you want to send.`);
  if (run.duplicatesFlagged.length > 0) nextActions.push(`Check ${run.duplicatesFlagged.length} possible duplicate(s) that share a phone number.`);
  if (failures.length > 0) nextActions.push(`Look at ${failures.length} failed operation(s).`);
  if (leads.length === 0) nextActions.push('No qualified opportunities today. No demos were created.');

  return {
    title: REPORT_TITLE, generatedAt: run.generatedAt,
    discovered: run.discovered, qualified: run.qualifiedOpportunities,
    demosSelected: run.demoSelections.length, successfulDeployments: verifiedUrl.size,
    failures, leads, nextActions,
  };
}

/** Plain-text version for the notification email. */
export function renderReportText(r: DailyReport, dashboardUrl?: string): string {
  const lines = [
    r.title, `Date and time: ${r.generatedAt}`, '',
    `Businesses discovered: ${r.discovered}`, `Qualified opportunities: ${r.qualified}`,
    `Demos selected: ${r.demosSelected}`, `Successful deployments: ${r.successfulDeployments}`,
    `Failed operations: ${r.failures.length}`, '',
  ];
  for (const l of r.leads) {
    lines.push(`- ${l.name} (${l.category}, ${l.city})`);
    lines.push(`  Website status: ${l.websiteStatus} at ${l.confidencePct}% confidence. Score: ${l.score}/100`);
    lines.push(`  Recommendation: ${l.recommendation}`);
    if (l.sourceUrls.length) lines.push(`  Sources: ${l.sourceUrls.join(', ')}`);
    lines.push(`  Preview: ${l.previewUrl ?? (l.demoSelected ? 'selected, no verified link yet' : 'not selected for a demo')}`);
  }
  if (r.failures.length) lines.push('', 'Failures:', ...r.failures.map((f) => `- ${f}`));
  if (r.nextActions.length) lines.push('', 'Suggested next actions:', ...r.nextActions.map((a) => `- ${a}`));
  if (dashboardUrl) lines.push('', `Dashboard: ${dashboardUrl}`);
  return lines.join('\n');
}

/** Business text is untrusted. Neutralize spreadsheet formulas and quote every cell. */
export function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function reportToCsv(r: DailyReport): string {
  const header = ['Business', 'Category', 'City', 'Website status', 'Confidence %', 'Score', 'Recommendation', 'Sources', 'Demo selected', 'Preview URL'];
  const rows = r.leads.map((l) => [
    l.name, l.category, l.city, l.websiteStatus, l.confidencePct, l.score, l.recommendation,
    l.sourceUrls.join(' '), l.demoSelected ? 'yes' : 'no', l.previewUrl ?? '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
