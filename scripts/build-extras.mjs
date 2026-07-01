/**
 * JLPT Master — Extras builder (example sentences + extra JLPT vocab)
 *
 * Produces three gitignored files under public/dict/ (regenerated each build):
 *
 *   examples.json    — { headword: [[jp, en], ...] } from the Tanaka/Tatoeba
 *                      example corpus. Loaded (opt-in) into IndexedDB alongside
 *                      the offline dictionary; powers example sentences on
 *                      dictionary search results.
 *   vocab-fixes.json — { word: { example, exampleEn } } authoritative corpus
 *                      sentences that OVERRIDE the machine-generated (and often
 *                      wrong / mixed-language) examples shipped in data.js for
 *                      the quiz + flashcards. Merged at bootstrap (small).
 *   jlpt-extra.json  — [{ word, reading, correct, level, example, exampleEn }]
 *                      new N5–N1 words NOT already in JLPT_VOCAB, so the quiz
 *                      pool grows. Merged into window.JLPT_VOCAB at bootstrap.
 *
 * Data sources (both fetched at build time, both fail gracefully so a build
 * never breaks if the network or a source is unavailable):
 *   - Tanaka corpus: http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz
 *     © Tatoeba Project, CC-BY 2.0 FR. (Attribution surfaced in src/09-legal.jsx.)
 *   - JLPT word lists: jamsinclair/open-anki-jlpt-decks (CSV per level).
 *
 * Run: node scripts/build-extras.mjs   (invoked automatically before build/dev)
 */

import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'dict');
const DATA_JS = resolve(__dirname, '..', 'public', 'data.js');

const TANAKA_URL = 'http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz';
const JLPT_BASE = 'https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/master/src/';

const MAX_EX_PER_HEAD = 3;   // examples kept per headword in examples.json
const MAX_JP_LEN = 48;       // prefer short, learnable sentences
const HAS_KANJI = /[一-龯々]/;
const JP_ONLY_TOKEN = /^[ぁ-んァ-ヶー一-龯々]+$/;

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'jlpt-master-build' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'jlpt-master-build' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

/* ---- Tanaka corpus → examples-by-headword ---------------------------- */

/**
 * Parses the Tanaka corpus. Each example is two lines:
 *   A: 日本語文\tEnglish gloss#ID=...
 *   B: 頭語(よみ)[sense]{表層} 頭語2 ...   (space-separated indexed words)
 * We key each [jp, en] pair by every headword listed on the B line.
 */
function parseTanaka(text) {
  const lines = text.split('\n');
  const byHead = new Map(); // headword → array of [jp, en]
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i][0] !== 'A') continue;
    const aBody = lines[i].slice(3);
    const tab = aBody.indexOf('\t');
    if (tab === -1) continue;
    const jp = aBody.slice(0, tab).trim();
    let en = aBody.slice(tab + 1);
    const hash = en.indexOf('#');
    if (hash !== -1) en = en.slice(0, hash);
    en = en.trim();
    if (!jp || !en) continue;

    const bLine = lines[i + 1];
    if (!bLine || bLine[0] !== 'B') continue;
    const tokens = bLine.slice(3).trim().split(/\s+/);
    const seen = new Set();
    for (const tok of tokens) {
      // headword = leading part before any of ( [ { ~ markers
      const head = tok.split(/[([{~|]/)[0];
      if (!head || seen.has(head)) continue;
      seen.add(head);
      let arr = byHead.get(head);
      if (!arr) { arr = []; byHead.set(head, arr); }
      arr.push([jp, en]);
    }
  }
  return byHead;
}

/** Picks up to `max` best examples for a headword: shortest first, prefer kanji. */
function bestExamples(list, max) {
  return list
    .slice()
    .sort((a, b) => {
      const ak = HAS_KANJI.test(a[0]) ? 0 : 1;
      const bk = HAS_KANJI.test(b[0]) ? 0 : 1;
      if (ak !== bk) return ak - bk;
      return a[0].length - b[0].length;
    })
    .filter((e) => e[0].length <= MAX_JP_LEN)
    .slice(0, max);
}

/* ---- data.js → existing JLPT_VOCAB (for dedup + fixes) --------------- */

async function loadExistingVocab() {
  const src = await readFile(DATA_JS, 'utf8');
  const marker = 'var JLPT_VOCAB';
  const start = src.indexOf('[', src.indexOf(marker));
  if (start === -1) throw new Error('JLPT_VOCAB array not found in data.js');
  // Bracket-count to find the matching close bracket.
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('JLPT_VOCAB array not terminated');
  return JSON.parse(src.slice(start, end + 1));
}

/* ---- JLPT CSV lists → extra leveled vocab --------------------------- */

/** Minimal RFC-4180-ish CSV row parser (handles quoted fields with commas). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** True for a clean single-word quiz entry (kanji/kana only, no markup). */
function isQuizWord(word, reading) {
  if (!word || !reading) return false;
  if (word.length > 8) return false;
  if (!JP_ONLY_TOKEN.test(word)) return false;   // rejects ~, (), spaces, latin
  if (!JP_ONLY_TOKEN.test(reading)) return false;
  return true;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const force = process.argv.includes('--force');
  if (!force && existsSync(resolve(OUT_DIR, 'examples.json')) &&
      existsSync(resolve(OUT_DIR, 'jlpt-extra.json'))) {
    console.log('[build-extras] outputs exist — skipping (use --force to rebuild).');
    return;
  }

  // 1) Tanaka corpus → examples-by-headword (graceful).
  let byHead = new Map();
  try {
    console.log('[build-extras] Downloading Tanaka example corpus…');
    const gz = await fetchBuffer(TANAKA_URL);
    const text = gunzipSync(gz).toString('utf8');
    byHead = parseTanaka(text);
    console.log(`[build-extras] Parsed examples for ${byHead.size} headwords.`);
  } catch (err) {
    console.warn('[build-extras] Example corpus unavailable — writing empty examples:', err.message);
  }

  // examples.json — capped map for the offline dictionary search.
  const examplesOut = {};
  for (const [head, list] of byHead) {
    const best = bestExamples(list, MAX_EX_PER_HEAD);
    if (best.length) examplesOut[head] = best;
  }
  await writeFile(resolve(OUT_DIR, 'examples.json'), JSON.stringify(examplesOut));
  console.log(`[build-extras] Wrote examples.json (${Object.keys(examplesOut).length} headwords).`);

  // Helper: single best example for a headword (kanji preferred, shortest).
  const oneExample = (head) => {
    const list = byHead.get(head);
    if (!list) return null;
    const best = bestExamples(list, 1);
    return best.length ? best[0] : null;
  };

  // 2) vocab-fixes.json — override existing examples with corpus sentences.
  let existing = [];
  try {
    existing = await loadExistingVocab();
  } catch (err) {
    console.warn('[build-extras] Could not read JLPT_VOCAB from data.js:', err.message);
  }
  const existingSet = new Set(existing.map((v) => v.word));
  const fixes = {};
  for (const v of existing) {
    const ex = oneExample(v.word);
    if (ex) fixes[v.word] = { example: ex[0], exampleEn: ex[1] };
  }
  await writeFile(resolve(OUT_DIR, 'vocab-fixes.json'), JSON.stringify(fixes));
  console.log(`[build-extras] Wrote vocab-fixes.json (${Object.keys(fixes).length} corrections).`);

  // 3) jlpt-extra.json — new leveled words not already in JLPT_VOCAB.
  const levels = ['n5', 'n4', 'n3', 'n2', 'n1'];
  const extra = [];
  const added = new Set();
  for (const lv of levels) {
    let rows;
    try {
      rows = parseCsv(await fetchText(JLPT_BASE + lv + '.csv'));
    } catch (err) {
      console.warn(`[build-extras] ${lv}.csv unavailable:`, err.message);
      continue;
    }
    const level = lv.toUpperCase(); // n5 → N5
    for (let i = 1; i < rows.length; i++) {           // skip header
      const [word, reading, meaning] = rows[i];
      if (!isQuizWord(word, reading)) continue;
      if (existingSet.has(word) || added.has(word)) continue; // easiest level wins
      added.add(word);
      const ex = oneExample(word);
      extra.push({
        word,
        reading,
        correct: (meaning || '').trim(),
        level,
        example: ex ? ex[0] : '',
        exampleEn: ex ? ex[1] : '',
      });
    }
  }
  await writeFile(resolve(OUT_DIR, 'jlpt-extra.json'), JSON.stringify(extra));
  console.log(`[build-extras] Wrote jlpt-extra.json (${extra.length} new words).`);
}

main().catch((err) => {
  console.error('[build-extras] failed:', err);
  // Non-fatal: don't block the build if extras can't be generated.
  process.exit(0);
});
