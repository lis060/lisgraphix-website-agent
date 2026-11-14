import { mkdirSync, writeFileSync } from 'node:fs';
import { buildPrompt } from './images/generate';
import { generatorFromEnv } from './images/from-env';

/**
 * `npm run image:try` makes ONE generic image to check your image key works.
 * Uses one image of your daily allowance. Prints only success or the error.
 */
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file: rely on the real environment */
}

const generator = generatorFromEnv(process.env);
if (!generator) {
  console.log('No image provider is set. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to .env.');
  process.exit(1);
}
try {
  const out = await generator.generate(buildPrompt('restaurant', 0));
  mkdirSync('demo-output', { recursive: true });
  const file = `demo-output/image-try.${out.ext ?? 'png'}`;
  writeFileSync(file, out.bytes);
  console.log(`OK: made one image (${Math.round(out.bytes.length / 1024)} KB), saved to ${file}`);
} catch (err) {
  console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
