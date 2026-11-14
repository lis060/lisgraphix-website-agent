/**
 * Writes one sample demo per template to demo-output/:  npm run demo:samples
 *
 * The businesses below are FICTIONAL. They exist only to show what a demo
 * looks like. Nothing is deployed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildDemo } from './demo/build';
import type { BusinessCandidate } from './domain/types';

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

mkdirSync('demo-output', { recursive: true });
let failed = 0;
for (const s of SAMPLES) {
  const demo = buildDemo(s);
  const file = `demo-output/sample-${demo.spec.templateId}.html`;
  writeFileSync(file, demo.html);
  const bad = demo.checks.filter((c) => !c.passed);
  failed += bad.length;
  console.log(`${demo.ok ? 'PASS' : 'FAIL'}  ${file}  (${demo.checks.length - bad.length}/${demo.checks.length} checks, ${demo.placeholders} placeholders)`);
  for (const c of bad) console.log(`      - ${c.name}: ${c.detail}`);
}
process.exit(failed ? 1 : 0);
