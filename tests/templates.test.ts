import { describe, expect, it } from 'vitest';
import { buildSiteSpec, templateFor, whatsappUrlFor, UNOFFICIAL_NOTICE } from '../src/templates/site-spec';
import { renderSiteHtml, escapeHtml } from '../src/templates/render';
import type { BusinessCandidate } from '../src/domain/types';

function biz(overrides: Partial<BusinessCandidate> = {}): BusinessCandidate {
  return {
    name: 'Example Beauty Studio',
    category: 'Beauty salon',
    city: 'Accra',
    address: '12 Osu Oxford Street',
    phone: '024 123 4567',
    description: 'Hair, nails and bridal styling in central Accra for over a decade.',
    socialUrls: [],
    operational: true,
    sourceUrls: [],
    discoveredAt: '2026-11-10T00:00:00Z',
    ...overrides,
  };
}

const sectionKinds = (kinds: string[]) => kinds;

describe('templateFor', () => {
  it('maps categories to the right templates, including barbershops', () => {
    expect(templateFor('Restaurant')).toBe('restaurant');
    expect(templateFor('Barbershop')).toBe('salon');
    expect(templateFor('Fashion boutique')).toBe('boutique');
    expect(templateFor('Guesthouse')).toBe('guesthouse');
    expect(templateFor('Car rental')).toBe('generic');
  });
});

describe('buildSiteSpec section requirements', () => {
  it('restaurant includes menu, gallery, location and a WhatsApp enquiry', () => {
    const spec = buildSiteSpec(biz({ name: 'Mama Efua Kitchen', category: 'Restaurant' }));
    const headings = spec.sections.map((s) => ('heading' in s ? s.heading : s.kind));
    expect(headings).toEqual(expect.arrayContaining(['Menu categories', 'Food gallery', 'Find us', 'Order or reserve']));
    const enquiry = spec.sections.find((s) => s.kind === 'enquiry');
    expect(enquiry && enquiry.kind === 'enquiry' && enquiry.whatsappUrl).toBe('https://wa.me/233241234567');
  });

  it('salon includes services, portfolio, appointment enquiry and contact', () => {
    const spec = buildSiteSpec(biz());
    const headings = spec.sections.map((s) => ('heading' in s ? s.heading : s.kind));
    expect(headings).toEqual(expect.arrayContaining(['Services', 'Portfolio', 'Appointment enquiry', 'Contact']));
  });

  it('boutique includes collections, product gallery and WhatsApp shopping enquiry', () => {
    const headings = buildSiteSpec(biz({ category: 'Fashion boutique' })).sections.map((s) =>
      'heading' in s ? s.heading : s.kind,
    );
    expect(headings).toEqual(
      expect.arrayContaining(['Featured collections', 'Product gallery', 'WhatsApp shopping enquiry']),
    );
  });

  it('guesthouse includes room categories, facilities, gallery and booking enquiry', () => {
    const headings = buildSiteSpec(biz({ category: 'Guesthouse' })).sections.map((s) =>
      'heading' in s ? s.heading : s.kind,
    );
    expect(headings).toEqual(
      expect.arrayContaining(['Room categories', 'Facilities', 'Photo gallery', 'Booking enquiry']),
    );
  });
});

describe('content rules', () => {
  it('omits pricing unless prices were verified', () => {
    const kinds = buildSiteSpec(biz()).sections.map((s) => s.kind);
    expect(kinds).not.toContain('pricing');
    const withPrices = buildSiteSpec(biz(), { verifiedPrices: [{ name: 'Haircut', price: 'GH₵ 50' }] });
    expect(withPrices.sections.map((s) => s.kind)).toContain('pricing');
  });

  it('uses a labelled placeholder when there is no description', () => {
    const spec = buildSiteSpec(biz({ description: undefined }));
    const about = spec.sections.find((s) => s.kind === 'about');
    expect(about && about.kind === 'about' && about.isPlaceholder).toBe(true);
  });

  it('marks sample lists as demonstration content', () => {
    const spec = buildSiteSpec(biz({ category: 'Restaurant' }));
    const lists = spec.sections.filter((s) => s.kind === 'list');
    expect(lists.length).toBeGreaterThan(0);
    for (const l of lists) {
      if (l.kind === 'list') expect(l.note).toMatch(/Demonstration content/);
    }
  });

  it('does not generate a WhatsApp link without a usable number', () => {
    expect(whatsappUrlFor(undefined)).toBeNull();
    expect(whatsappUrlFor('12')).toBeNull();
  });
});

describe('renderSiteHtml', () => {
  const html = renderSiteHtml(buildSiteSpec(biz()));

  it('includes the unofficial notice and noindex', () => {
    expect(html).toContain(UNOFFICIAL_NOTICE);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('loads no external scripts, styles or images', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(html).not.toMatch(/<img/i);
  });

  it('escapes scraped text so it cannot inject markup', () => {
    const malicious = biz({
      name: '<script>alert(1)</script>',
      description: 'Nice place <img src=x onerror=alert(1)> and more words here',
    });
    const out = renderSiteHtml(buildSiteSpec(malicious));
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<img src=x');
  });

  it('escapeHtml handles all special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('does not invent reviews or endorsements', () => {
    expect(html.toLowerCase()).not.toMatch(/review|testimonial|rated|★/);
  });

  it('keeps section order sensible: hero first, contact last', () => {
    const spec = buildSiteSpec(biz());
    expect(spec.sections[0]?.kind).toBe('hero');
    expect(spec.sections[spec.sections.length - 1]?.kind).toBe('contact');
    expect(sectionKinds(spec.sections.map((s) => s.kind))).toContain('enquiry');
  });
});
