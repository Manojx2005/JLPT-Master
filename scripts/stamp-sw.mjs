/**
 * JLPT Master — Service-worker cache stamper (npm postbuild)
 *
 * Replaces the __SW_VERSION__ token in dist/sw.js with a unique build id so
 * every deploy produces a new cache name. The SW's activate handler then
 * deletes the previous cache, and the page auto-reloads on controllerchange
 * (see src/main.jsx) — returning visitors get fresh assets with no manual
 * hard refresh.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SW_PATH = resolve(__dirname, '..', 'dist', 'sw.js');

async function main() {
  let src;
  try {
    src = await readFile(SW_PATH, 'utf8');
  } catch (e) {
    console.warn('[stamp-sw] dist/sw.js not found — skipping (run after `vite build`).');
    return;
  }

  if (!src.includes('__SW_VERSION__')) {
    console.warn('[stamp-sw] no __SW_VERSION__ token in dist/sw.js — already stamped or template changed.');
    return;
  }

  // Unique, monotonic, human-readable: build timestamp.
  const version = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDhhmmss
  src = src.split('__SW_VERSION__').join(version);
  await writeFile(SW_PATH, src);
  console.log('[stamp-sw] dist/sw.js cache → jlpt-master-' + version);
}

main().catch((err) => {
  console.error('[stamp-sw] FAILED:', err.message);
  process.exit(1);
});
