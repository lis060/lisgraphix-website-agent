import { describe, expect, it } from 'vitest';
import { IMAGE_CAPTION, pickImages, validateManifest, type LibraryImage } from '../src/images/library';
import { buildSiteSpec } from '../src/templates/site-spec';
import { renderSiteHtml } from '../src/templates/render';
import type { BusinessCandidate } from '../src/domain/types';

const good = { file: 'salon/chairs-01.jpg', template: 'salon', alt: 'Styling chairs', license: 'own' };

describe('validateManifest', () => {
  it('accepts a valid entry', () => {
    const r = validateManifest([good]);
    expect(r.images).toHaveLength(1);
    expect(r.problems).toEqual([]);
  });

  it('rejects path traversal, URLs and wrong extensions', () => {
    const bad = ['../secret.jpg', 'salon/../x.jpg', 'https://evil.example/a.jpg', 'salon/a.svg', '/etc/passwd'];
    const r = validateManifest(bad.map((file) => ({ ...good, file })));
    expect(r.images).toEqual([]);
    expect(r.problems).toHaveLength(bad.length);
  });

  it('requires alt text, the own licence, a matching folder, and no duplicates', () => {
    const r = validateManifest([
      { ...good, alt: ' ' },
      { ...good, license: 'stock' },
      { ...good, file: 'restaurant/x.jpg' },
      good,
      good,
    ]);
    expect(r.images).toHaveLength(1);
    expect(r.problems).toHaveLength(4);
  });

  it('rejects a manifest that is not an array', () => {
    expect(validateManifest({}).problems[0]).toMatch(/array/);
  });
});

describe('pickImages', () => {
  const lib: LibraryImage[] = ['a', 'b', 'c'].map((n) => ({
    file: `salon/${n}.jpg`, template: 'salon', alt: n, license: 'own',
  }));

  it('is stable for the same business and limited to the right template', () => {
    expect(pickImages(lib, 'salon', 2, 'Shop A')).toEqual(pickImages(lib, 'salon', 2, 'Shop A'));
    expect(pickImages(lib, 'restaurant', 2, 'Shop A')).toEqual([]);
  });

  it('never returns more images than exist or than requested', () => {
    expect(pickImages(lib, 'salon', 10, 'x')).toHaveLength(3);
    expect(pickImages(lib, 'salon', 0, 'x')).toEqual([]);
  });
});

describe('rendering with library images', () => {
  const biz: BusinessCandidate = {
    name: 'Example Beauty Studio', category: 'Beauty salon', city: 'Accra',
    socialUrls: [], operational: true, sourceUrls: [], discoveredAt: '2026-11-10T00:00:00Z',
  };
  const library = validateManifest([good]).images;
  const html = renderSiteHtml(buildSiteSpec(biz, { library }));

  it('shows the image with alt text and the illustrative caption', () => {
    expect(html).toContain('<img src="library/salon/chairs-01.jpg"');
    expect(html).toContain('alt="Styling chairs"');
    expect(html).toContain(IMAGE_CAPTION);
  });

  it('only uses local library paths, never external image URLs', () => {
    const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) expect(src).toMatch(/^library\//);
  });

  it('falls back to placeholders when the library has no matching images', () => {
    const plain = renderSiteHtml(buildSiteSpec({ ...biz, category: 'Restaurant' }, { library }));
    expect(plain).not.toContain('<img');
    expect(plain).toContain('Photo placeholder');
  });
});
