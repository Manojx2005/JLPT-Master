/**
 * JLPT Master — Offline dictionary builder
 *
 * Downloads the latest `jmdict-eng` release from jmdict-simplified
 * (https://github.com/scriptin/jmdict-simplified) and transforms the full
 * JMdict (~200k entries) into a compact JSON the browser loads once into
 * IndexedDB. This is what lets dictionary search work with ZERO network calls
 * after first load — no Jotoba, no Jisho, no CORS proxy.
 *
 * Output (gitignored, regenerated on every `npm run build`):
 *   public/dict/jmdict.json  — compact entry array
 *   public/dict/meta.json    — version, entry count, POS tag map, attribution
 *
 * Run: node scripts/build-dict.mjs   (invoked automatically by `npm run build`)
 *
 * JMdict data is © the Electronic Dictionary Research and Development Group,
 * licensed CC BY-SA 4.0. Attribution is surfaced in the app (see src/09-legal.jsx).
 */

import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'dict');
const RELEASES_API = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest';

/** Max meanings/senses kept per entry — trims long technical entries. */
const MAX_SENSES = 6;

async function main() {
  // Skip the (slow) rebuild if data already exists, unless --force is passed.
  // Keeps incremental local builds fast; CI/deploy can pass --force.
  const force = process.argv.includes('--force');
  if (!force && existsSync(resolve(OUT_DIR, 'jmdict.json'))) {
    console.log('[build-dict] public/dict/jmdict.json already exists — skipping (use --force to rebuild).');
    return;
  }

  console.log('[build-dict] Resolving latest jmdict-eng release…');
  const asset = await findEngAsset();
  console.log(`[build-dict] Downloading ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)…`);

  const tgz = Buffer.from(await fetchBuffer(asset.browser_download_url));
  console.log('[build-dict] Decompressing…');
  const json = JSON.parse(extractSingleFileFromTgz(tgz));

  console.log(`[build-dict] Source: JMdict v${json.version}, ${json.words.length} entries. Transforming…`);
  const entries = json.words.map(transformEntry).filter(Boolean);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, 'jmdict.json'), JSON.stringify(entries));
  await writeFile(
    resolve(OUT_DIR, 'meta.json'),
    JSON.stringify({
      version: json.version,
      dictDate: json.dictDate,
      count: entries.length,
      tags: json.tags || {},
      attribution: 'JMdict © EDRDG, CC BY-SA 4.0 — via jmdict-simplified',
      builtAt: new Date().toISOString(),
    })
  );

  const bytes = JSON.stringify(entries).length;
  console.log(`[build-dict] Wrote ${entries.length} entries → public/dict/jmdict.json (${(bytes / 1048576).toFixed(1)} MB)`);
}

/**
 * Transforms one jmdict-simplified entry into the app's compact record.
 * Short keys keep the shipped file small:
 *   k=word, r=reading, m=meanings[], p=pos tags[], c=isCommon(0|1), f=other forms[]
 */
function transformEntry(w) {
  const kanji = w.kanji || [];
  const kana = w.kana || [];
  const headword = (kanji[0] && kanji[0].text) || (kana[0] && kana[0].text) || '';
  if (!headword) return null;

  const reading = kanji[0] ? (kana[0] && kana[0].text) || '' : '';
  const isCommon =
    kanji.some((x) => x.common) || kana.some((x) => x.common) ? 1 : 0;

  const meanings = [];
  const pos = [];
  const senses = w.sense || [];
  for (let i = 0; i < Math.min(senses.length, MAX_SENSES); i++) {
    const s = senses[i];
    const glosses = (s.gloss || []).map((g) => g.text).filter(Boolean);
    if (glosses.length) meanings.push(glosses.join('; '));
    for (const p of s.partOfSpeech || []) {
      if (pos.indexOf(p) === -1) pos.push(p);
    }
  }
  if (!meanings.length) return null;

  // Alternate written forms beyond the headword (extra kanji + non-primary kana).
  const otherForms = [];
  for (let i = 1; i < kanji.length; i++) {
    if (kanji[i].text) otherForms.push(kanji[i].text);
  }
  for (let i = kanji[0] ? 0 : 1; i < kana.length; i++) {
    const t = kana[i] && kana[i].text;
    if (t && t !== reading && otherForms.indexOf(t) === -1) otherForms.push(t);
  }

  const rec = { k: headword, r: reading, m: meanings, p: pos, c: isCommon };
  if (otherForms.length) rec.f = otherForms.slice(0, 8);
  return rec;
}

/** Finds the jmdict-eng (full English, not -common) .tgz asset in the latest release. */
async function findEngAsset() {
  const res = await fetch(RELEASES_API, {
    headers: { 'User-Agent': 'jlpt-master-build', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const release = await res.json();
  const asset = (release.assets || []).find(
    (a) => /^jmdict-eng-.*\.json\.tgz$/.test(a.name)
  );
  if (!asset) throw new Error('Could not find jmdict-eng .tgz asset in latest release.');
  return asset;
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'jlpt-master-build' } });
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
  return res.arrayBuffer();
}

/**
 * Extracts the single JSON file from a gzipped tar (.tgz) without a tar library.
 * The release archive holds exactly one file; we read its size from the tar
 * header (octal at offset 124) and slice the content that follows the 512-byte
 * header block.
 */
function extractSingleFileFromTgz(tgz) {
  const tar = gunzipSync(tgz);
  const sizeOctal = tar.toString('ascii', 124, 136).replace(/\0/g, '').trim();
  const size = parseInt(sizeOctal, 8);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Unexpected tar header — could not read file size.');
  }
  return tar.toString('utf8', 512, 512 + size);
}

main().catch((err) => {
  console.error('[build-dict] FAILED:', err.message);
  process.exit(1);
});
