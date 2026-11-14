import { describe, expect, it } from 'vitest';
import { buildDemo, checkDemoHtml } from '../src/demo/build';
import type { BusinessCandidate } from '../src/domain/types';

const biz = (o: Partial<BusinessCandidate> = {}): BusinessCandidate => ({
  name: 'Glow Salon', category: 'Beauty salon', city: 'Accra', address: 'Osu, Accra', phone: '024 123 4567',
  description: 'Hair, nails and bridal styling in central Accra for over a decade.',
  socialUrls: [], operational: true, sourceUrls: [], discoveredAt: '2026-11-14T09:30:00Z', ...o,
});
const failed = (html: string, name = 'Glow Salon') => checkDemoHtml(html, name).filter((c) => !c.passed).map((c) => c.name);

describe('buildDemo', () => {
  it('passes every check for each template', () => {
    for (const category of ['Beauty salon', 'Barbershop', 'Restaurant', 'Fashion boutique', 'Guesthouse', 'Car rental']) {
      const d = buildDemo(biz({ category }));
      expect(d.checks.filter((c) => !c.passed)).toEqual([]);
      expect(d.ok).toBe(true);
      expect(d.checks).toHaveLength(10);
    }
  });

  it('passes with awkward but harmless names, and with library images', () => {
    expect(buildDemo(biz({ name: `Ama & Kofi's "Best" <Salon>` })).ok).toBe(true);
    const d = buildDemo(biz(), { library: [{ file: 'salon/a.jpg', template: 'salon', alt: 'Chairs', license: 'own' }] });
    expect(d.ok).toBe(true);
    expect(d.html).toContain('src="library/salon/a.jpg"');
  });

  it('counts placeholders so a thin demo is visible', () => {
    const full = buildDemo(biz());
    const thin = buildDemo(biz({ description: undefined, address: undefined, phone: undefined }));
    expect(thin.placeholders).toBeGreaterThan(full.placeholders);
    expect(thin.ok).toBe(true);
  });
});

describe('checkDemoHtml catches unsafe pages', () => {
  const good = buildDemo(biz()).html;

  it('accepts the page as built', () => expect(failed(good)).toEqual([]));

  it('fails when the unofficial notice or noindex is removed', () => {
    expect(failed(good.replace(/Unofficial website concept/g, 'Official website'))).toContain('Unofficial notice');
    expect(failed(good.replace('noindex, nofollow', 'index'))).toContain('Hidden from search engines');
  });

  it('fails on scripts, event handlers and outside files', () => {
    expect(failed(good.replace('</body>', '<script>1</script></body>'))).toContain('No scripts');
    expect(failed(good.replace('<h2>', '<h2 onclick="x()">'))).toContain('No scripts');
    expect(failed(good.replace('</body>', '<img src="https://evil.example/x.png" alt="x"></body>'))).toContain('No outside files');
    expect(failed(good.replace('</head>', '<link rel="stylesheet" href="https://x.example/a.css"></head>'))).toEqual(expect.arrayContaining(['No outside files', 'Safe links only']));
  });

  it('fails on links that are not page sections or a Ghana WhatsApp number', () => {
    expect(failed(good.replace('href="#contact"', 'href="https://phish.example"'))).toContain('Safe links only');
    expect(failed(good.replace(/https:\/\/wa\.me\/233\d{9}/, 'https://wa.me/15551234567'))).toContain('Safe links only');
  });

  it('fails on reviews, undescribed images and a wrong heading', () => {
    expect(failed(good.replace('</body>', '<p>Rated 5 stars in reviews</p></body>'))).toContain('No invented reviews or prices');
    expect(failed(good.replace('</body>', '<img src="library/salon/a.jpg"></body>'))).toContain('Images described');
    expect(failed(good, 'Some Other Name')).toContain('One main heading');
  });
});
