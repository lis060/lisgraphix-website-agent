/**
 * Core domain types for the Lisgraphix Client Finder.
 *
 * Everything here is plain data. Business information comes from public
 * sources and is treated as untrusted until validated (see discovery/manual-import.ts).
 */

export type WebsiteStatus =
  | 'no_official_website_identified'
  | 'website_exists'
  | 'social_media_only'
  | 'uncertain'
  | 'website_broken_or_outdated'
  | 'needs_manual_verification';

export type EvidenceKind =
  | 'listing_website'
  | 'search_result'
  | 'social_link'
  | 'domain_check'
  | 'manual';

export interface Evidence {
  kind: EvidenceKind;
  detail: string;
  sourceUrl?: string;
  observedAt: string; // ISO 8601
}

/** A business as found by a discovery source. Missing fields stay undefined. */
export interface BusinessCandidate {
  /** Stable id from the source, e.g. a Google place id. */
  externalId?: string;
  name: string;
  category: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  socialUrls: string[];
  mapsUrl?: string;
  websiteUrl?: string;
  description?: string;
  /** Whether the source shows the business as operating. null = unknown. */
  operational: boolean | null;
  sourceUrls: string[];
  discoveredAt: string; // ISO 8601
  lastVerifiedAt?: string; // ISO 8601
}

/** What the verification step found. Each field is a fact, not a guess. */
export interface VerificationInput {
  /** Website URL shown on the business listing, if any. */
  listingWebsiteUrl?: string;
  /** Whether the listing was checked at all. */
  listingChecked: boolean;
  /** Whether web search results were checked for an official site. */
  searchChecked: boolean;
  /** Domains that search results associated with this business name. */
  searchDomains: string[];
  /** Whether the business's social profiles were checked. */
  socialChecked: boolean;
  /** Domains that social profiles link to. */
  socialLinkedDomains: string[];
  /** Whether the candidate domain belongs to this business. null = not yet known. */
  domainBelongsToBusiness: boolean | null;
  /** Whether the candidate domain answered an HTTP request. null = not checked. */
  domainReachable: boolean | null;
  /** Source URLs and short notes that support the findings. */
  evidence: Evidence[];
}

export interface VerificationResult {
  status: WebsiteStatus;
  /** 0 to 1. Confidence in the status, never absolute proof. */
  confidence: number;
  /** The candidate website URL or domain the status is based on, if any. */
  websiteUrl?: string;
  evidence: Evidence[];
  notes: string[];
}

export interface ScoreFactor {
  label: string;
  points: number;
  maxPoints: number;
  reason: string;
}

export interface LeadScore {
  /** 0 to 100 */
  total: number;
  factors: ScoreFactor[];
  /** True only when the lead may be auto-prioritized for a demo. */
  prioritized: boolean;
  /** Why the lead is or is not prioritized. */
  decisionReason: string;
  websiteRecommendation: string;
}

export interface RankedLead {
  candidate: BusinessCandidate;
  verification: VerificationResult;
  score: LeadScore;
}
