/**
 * Writes one sample demo per template to demo-output/:  npm run demo:samples
 *
 * The businesses below are FICTIONAL. They exist only to show what a demo
 * looks like. Nothing is deployed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildDemo } from './demo/build';
import type { BusinessCandidate } from './domain/types';
import { generateImages, type ImageBudget } from './images/generate';
import { generatorFromEnv } from './images/from-env';
import type { LibraryImage } from './images/library';
import { templateFor } from './templates/site-spec';

const base = { socialUrls: [], operational: true, sourceUrls: [], discoveredAt: new Date().toISOString() };
const SAMPLES: BusinessCandidate[] = [
  { ...base, name: 'Sample Beauty Studio', category: 'Beauty salon', city: 'Accra', address: '12 Example Street, Osu, Accra', phone: '024 000 0000',
    description: 'A fictional salon used to show the Lisgraphix demo layout. Hair, nails and bridal styling.' },
  { ...base, name: 'Sample Kitchen', category: 'Restaurant', city: 'Kumasi', address: '5 Example Road, Adum, Kumasi', phone: '020 000 0000',
    description: 'A fictional restaurant used to show the Lisgraphix demo layout. Local dishes cooked fresh every day.' },
  { ...base, name: 'Sample Threads', category: 'Fashion boutique', city: 'Tema', phone: '027 000 0000' },
  { ...base, name: 'Sample Guest Lodge', category: 'Guesthouse', city: 'Accra', address: '8 Example Close, East Legon, Accra' },
  { ...base, name: 'Sample Cleaners', category: 'Cleaning service', city: 'Tema' },
];

/** Daily cap on generated images (same default as the main settings). */
const DAILY_IMAGE_CAP = 8;

/**
 * Options:  npm run demo:samples -- --images        (1 AI image per demo)
 *           npm run demo:samples -- --images=2      (up to 2 per demo, never more than the daily cap)
 * Without --images the demos keep clearly labelled colour placeholders.
 */
function imagesPerDemo(argv: string[]): number {
  const arg = argv.find((a) => a === '--images' || a.startsWith('--images='));
  if (!arg) return 0;
  const n = arg.includes('=') ? Number(arg.split('=')[1]) : 1;
  return Number.isInteger(n) && n > 0 && n <= 4 ? n : 1;
}

mkdirSync('demo-output', { recursive: true });
const perDemo = imagesPerDemo(process.argv.slice(2));
const generator = perDemo > 0 ? generatorFromEnv(process.env) : undefined;
if (perDemo > 0 && !generator) {
  console.log('No image provider is set (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env). Using placeholders.');
}
const budget: ImageBudget = { remaining: DAILY_IMAGE_CAP };

async function imagesFor(s: BusinessCandidate): Promise<LibraryImage[]> {
  if (!generator) return [];
  const result = await generateImages({
    template: templateFor(s.category),
    count: perDemo,
    generator,
    budget,
    save: async (rel, bytes) => {
      const path = join('demo-output', 'generated', rel);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    },
  });
  for (const f of result.failures) console.log(`      image problem for ${s.name}: ${f}. Using placeholders.`);
  return result.images;
}

let failed = 0;
for (const s of SAMPLES) {
  const library = await imagesFor(s);
  const demo = buildDemo(s, { library });
  const file = `demo-output/sample-${demo.spec.templateId}.html`;
  writeFileSync(file, demo.html);
  const bad = demo.checks.filter((c) => !c.passed);
  failed += bad.length;
  console.log(`${demo.ok ? 'PASS' : 'FAIL'}  ${file}  (${demo.checks.length - bad.length}/${demo.checks.length} checks, ${demo.placeholders} placeholders, ${library.length} AI images)`);
  for (const c of bad) console.log(`      - ${c.name}: ${c.detail}`);
}
process.exit(failed ? 1 : 0);
