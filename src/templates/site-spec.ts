import type { BusinessCandidate } from '../domain/types';
import { normalizePhone } from '../dedupe/dedupe';

/**
 * Builds a demo website specification for one business.
 *
 * Content rules (from the project spec):
 * - Only verified facts from the business record are shown as facts.
 * - Anything unknown becomes a clearly labelled placeholder, or the section is omitted.
 * - No reviews, prices, histories or endorsements are invented.
 * - Sample service or menu lists are labelled as demonstration content.
 */

export const UNOFFICIAL_NOTICE =
  'Unofficial website concept created by Lisgraphix for demonstration purposes.';

export type TemplateId = 'restaurant' | 'salon' | 'boutique' | 'guesthouse' | 'generic';

export interface ListItem {
  title: string;
  detail?: string;
}

export interface VerifiedPrice {
  name: string;
  price: string;
}

export type Section =
  | { kind: 'hero'; headline: string; subheadline: string; ctaLabel: string }
  | { kind: 'about'; heading: string; body: string; isPlaceholder: boolean }
  | { kind: 'list'; heading: string; items: ListItem[]; note: string }
  | { kind: 'pricing'; heading: string; items: VerifiedPrice[] }
  | { kind: 'gallery'; heading: string; slots: number; note: string }
  | { kind: 'location'; heading: string; address: string | null }
  | { kind: 'enquiry'; heading: string; body: string; ctaLabel: string; whatsappUrl: string | null }
  | { kind: 'contact'; heading: string; phone: string | null; email: string | null; address: string | null };

export interface SiteSpec {
  templateId: TemplateId;
  businessName: string;
  city: string;
  category: string;
  notice: string;
  sections: Section[];
}

export interface SpecOptions {
  /** Only supply prices the business has confirmed. Omitted means no pricing section. */
  verifiedPrices?: VerifiedPrice[];
}

export function templateFor(category: string): TemplateId {
  const c = category.toLowerCase();
  if (/restaurant|food/.test(c)) return 'restaurant';
  if (/salon|barber/.test(c)) return 'salon';
  if (/boutique|fashion/.test(c)) return 'boutique';
  if (/guesthouse|hotel/.test(c)) return 'guesthouse';
  return 'generic';
}

/** WhatsApp link for Ghanaian numbers. Returns null if no usable number exists. */
export function whatsappUrlFor(phone: string | undefined): string | null {
  const last9 = normalizePhone(phone);
  return last9 ? `https://wa.me/233${last9}` : null;
}

const SAMPLE = 'Demonstration content, not the business’s actual offering.';

function aboutSection(c: BusinessCandidate): Section {
  const text = c.description?.trim();
  if (text && text.length >= 20) {
    return { kind: 'about', heading: 'About', body: text, isPlaceholder: false };
  }
  return {
    kind: 'about',
    heading: 'About',
    body: '[About text to be confirmed with the business owner]',
    isPlaceholder: true,
  };
}

function contactSection(c: BusinessCandidate): Section {
  return {
    kind: 'contact',
    heading: 'Contact',
    phone: c.phone?.trim() || null,
    email: c.email?.trim() || null,
    address: c.address?.trim() || null,
  };
}

function locationSection(c: BusinessCandidate): Section {
  return { kind: 'location', heading: 'Find us', address: c.address?.trim() || null };
}

export function buildSiteSpec(candidate: BusinessCandidate, opts: SpecOptions = {}): SiteSpec {
  const templateId = templateFor(candidate.category);
  const whatsappUrl = whatsappUrlFor(candidate.phone);
  const subheadline = `${candidate.category} in ${candidate.city}`;
  const sections: Section[] = [];

  switch (templateId) {
    case 'restaurant':
      sections.push(
        { kind: 'hero', headline: candidate.name, subheadline, ctaLabel: 'Order or enquire on WhatsApp' },
        aboutSection(candidate),
        {
          kind: 'list',
          heading: 'Menu categories',
          items: [{ title: 'Sample: main dishes' }, { title: 'Sample: drinks' }, { title: 'Sample: desserts' }],
          note: SAMPLE,
        },
        { kind: 'gallery', heading: 'Food gallery', slots: 6, note: 'Photo placeholders. Use licensed photos only.' },
        locationSection(candidate),
        { kind: 'enquiry', heading: 'Order or reserve', body: 'Send us a message on WhatsApp.', ctaLabel: 'Chat on WhatsApp', whatsappUrl },
        contactSection(candidate),
      );
      break;

    case 'salon':
      sections.push(
        { kind: 'hero', headline: candidate.name, subheadline, ctaLabel: 'Book an appointment' },
        {
          kind: 'list',
          heading: 'Services',
          items: [{ title: 'Sample: haircut and styling' }, { title: 'Sample: treatment' }, { title: 'Sample: special occasion' }],
          note: SAMPLE,
        },
        ...(opts.verifiedPrices && opts.verifiedPrices.length > 0
          ? [{ kind: 'pricing' as const, heading: 'Pricing', items: opts.verifiedPrices }]
          : []),
        { kind: 'gallery', heading: 'Portfolio', slots: 6, note: 'Photo placeholders. Use licensed photos only.' },
        aboutSection(candidate),
        { kind: 'enquiry', heading: 'Appointment enquiry', body: 'Tell us the service and the day you prefer.', ctaLabel: 'Send an enquiry', whatsappUrl },
        contactSection(candidate),
      );
      break;

    case 'boutique':
      sections.push(
        { kind: 'hero', headline: candidate.name, subheadline, ctaLabel: 'Shop on WhatsApp' },
        {
          kind: 'list',
          heading: 'Featured collections',
          items: [{ title: 'Sample: new arrivals' }, { title: 'Sample: everyday wear' }],
          note: SAMPLE,
        },
        { kind: 'gallery', heading: 'Product gallery', slots: 8, note: 'Photo placeholders. Use licensed photos only.' },
        aboutSection(candidate),
        { kind: 'enquiry', heading: 'WhatsApp shopping enquiry', body: 'Message us about any item you like.', ctaLabel: 'Chat on WhatsApp', whatsappUrl },
        contactSection(candidate),
      );
      break;

    case 'guesthouse':
      sections.push(
        { kind: 'hero', headline: candidate.name, subheadline, ctaLabel: 'Send a booking enquiry' },
        {
          kind: 'list',
          heading: 'Room categories',
          items: [{ title: 'Sample: standard room' }, { title: 'Sample: family room' }],
          note: SAMPLE,
        },
        {
          kind: 'list',
          heading: 'Facilities',
          items: [{ title: 'Sample: Wi-Fi' }, { title: 'Sample: parking' }],
          note: SAMPLE,
        },
        { kind: 'gallery', heading: 'Photo gallery', slots: 6, note: 'Photo placeholders. Use licensed photos only.' },
        locationSection(candidate),
        { kind: 'enquiry', heading: 'Booking enquiry', body: 'Ask us about availability for your dates.', ctaLabel: 'Send an enquiry', whatsappUrl },
        contactSection(candidate),
      );
      break;

    case 'generic':
      sections.push(
        { kind: 'hero', headline: candidate.name, subheadline, ctaLabel: 'Get in touch' },
        {
          kind: 'list',
          heading: 'Services',
          items: [{ title: 'Sample: core service' }, { title: 'Sample: additional service' }],
          note: SAMPLE,
        },
        aboutSection(candidate),
        { kind: 'enquiry', heading: 'Enquiries', body: 'Send us your question.', ctaLabel: 'Contact us', whatsappUrl },
        contactSection(candidate),
      );
      break;
  }

  return {
    templateId,
    businessName: candidate.name,
    city: candidate.city,
    category: candidate.category,
    notice: UNOFFICIAL_NOTICE,
    sections,
  };
}
