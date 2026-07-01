/**
 * JLPT Master — Extras builder (example sentences + extra JLPT vocab)
 *
 * Produces three gitignored files under public/dict/ (regenerated each build):
 *
 *   examples.json    — { key: [[jp, en], ...] } from the Tatoeba/Tanaka example
 *                      corpus, keyed by BOTH headword and reading. `jp` carries
 *                      inline 漢字（かな）furigana reconstructed from the corpus
 *                      B-line so <FuriganaText> can render ruby. Loaded (opt-in)
 *                      into IndexedDB; powers example sentences on dictionary
 *                      results (multiple per word).
 *   vocab-fixes.json — { word: { example, exampleEn } } authoritative corpus
 *                      sentences (furigana-annotated) that OVERRIDE the
 *                      machine-generated (often wrong / mixed-language) examples
 *                      shipped in data.js for the quiz + flashcards.
 *   jlpt-extra.json  — [{ word, reading, correct, level, example, exampleEn }]
 *                      new N5–N1 words NOT already in JLPT_VOCAB.
 *
 * Data sources (fetched at build time, both fail gracefully):
 *   - Tanaka corpus: http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz
 *     © Tatoeba Project, CC-BY 2.0 FR. (Attribution in src/09-legal.jsx.)
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

const MAX_EX_PER_HEAD = 4;   // examples kept per key in examples.json
const MAX_JP_LEN = 48;       // prefer short, learnable sentences (plain length)
const KANJI = /[一-龯々]/;
const KANJI_ONLY = /^[一-龯々]+$/;
const KANA = /[ぁ-んァ-ヶー]/;
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

/* ---- Furigana reconstruction --------------------------------------- */

function isKana(ch) { return KANA.test(ch); }

/**
 * Annotates a single word with inline furigana in the 漢字（かな）form that
 * <FuriganaText> understands. Handles pure-kanji words (時間→時間（じかん）) and
 * a single kanji-run with okurigana (忙しい→忙（いそが）しい) by trimming the
 * kana that surface and reading share. Anything trickier (multiple kanji runs,
 * conjugated surfaces) falls back to the plain surface — never garbled.
 */
function annotateWord(surface, reading) {
  if (!surface || !reading || !KANJI.test(surface)) return surface;
  let s = surface, r = reading, suf = '', pre = '';
  // shared okurigana suffix
  while (s.length && r.length && s[s.length - 1] === r[r.length - 1] && isKana(s[s.length - 1])) {
    suf = s[s.length - 1] + suf;
    s = s.slice(0, -1); r = r.slice(0, -1);
  }
  // shared prefix (e.g. お-)
  while (s.length && r.length && s[0] === r[0] && isKana(s[0])) {
    pre += s[0]; s = s.slice(1); r = r.slice(1);
  }
  if (s && r && KANJI_ONLY.test(s) && !KANJI.test(r)) {
    return pre + s + '（' + r + '）' + suf;
  }
  return surface; // couldn't cleanly align — leave plain
}

/** Parses one B-line token into { surface, reading }. */
function parseToken(tok) {
  const head = tok.split(/[([{~|]/)[0];
  const rm = tok.match(/\(([^)]+)\)/);
  const reading = rm && rm[1][0] !== '#' ? rm[1] : '';   // (#12345) is a xref, not a reading
  const sm = tok.match(/\{([^}]+)\}/);
  const surface = sm ? sm[1] : head;
  return { head, reading, surface };
}

/**
 * Rebuilds the Japanese sentence with inline furigana by walking the plain
 * A-line and annotating each B-line word where it occurs, in order.
 */
function annotateSentence(jp, tokens) {
  let out = '', cursor = 0;
  for (const t of tokens) {
    if (!t.surface) continue;
    const pos = jp.indexOf(t.surface, cursor);
    if (pos === -1) continue;
    out += jp.slice(cursor, pos) + annotateWord(t.surface, t.reading);
    cursor = pos + t.surface.length;
  }
  out += jp.slice(cursor);
  return out;
}

/* ---- Tanaka corpus → examples-by-key ------------------------------- */

/**
 * Parses the Tanaka corpus into two maps (headword→examples, reading→examples).
 * Each example is { j: furigana-annotated jp, e: english, L: plain jp length }.
 */
function parseTanaka(text) {
  const lines = text.split('\n');
  const byHead = new Map();
  const byRead = new Map();
  const push = (map, key, entry) => {
    if (!key) return;
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push(entry);
  };
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
    const tokens = bLine.slice(3).trim().split(/\s+/).map(parseToken);
    const annotated = annotateSentence(jp, tokens);
    const entry = { j: annotated, e: en, L: jp.length };

    const seenH = new Set(), seenR = new Set();
    for (const t of tokens) {
      if (t.head && !seenH.has(t.head)) { seenH.add(t.head); push(byHead, t.head, entry); }
      if (t.reading && t.reading !== t.head && !seenR.has(t.reading)) {
        seenR.add(t.reading); push(byRead, t.reading, entry);
      }
    }
  }
  return { byHead, byRead };
}

/** Picks up to `max` best examples: shortest first, prefer kanji, dedup. */
function bestExamples(list, max) {
  const seen = new Set();
  return list
    .slice()
    .sort((a, b) => {
      const ak = KANJI.test(a.j) ? 0 : 1;
      const bk = KANJI.test(b.j) ? 0 : 1;
      if (ak !== bk) return ak - bk;
      return a.L - b.L;
    })
    .filter((e) => {
      if (e.L > MAX_JP_LEN || seen.has(e.j)) return false;
      seen.add(e.j);
      return true;
    })
    .slice(0, max)
    .map((e) => [e.j, e.e]);
}

/* ---- data.js → existing JLPT_VOCAB (for dedup + fixes) --------------- */

async function loadExistingVocab() {
  const src = await readFile(DATA_JS, 'utf8');
  const marker = 'var JLPT_VOCAB';
  const start = src.indexOf('[', src.indexOf(marker));
  if (start === -1) throw new Error('JLPT_VOCAB array not found in data.js');
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

function isQuizWord(word, reading) {
  if (!word || !reading) return false;
  if (word.length > 8) return false;
  if (!JP_ONLY_TOKEN.test(word)) return false;
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

  // 1) Tanaka corpus → examples-by-key (graceful).
  let byHead = new Map(), byRead = new Map();
  try {
    console.log('[build-extras] Downloading Tanaka example corpus…');
    const gz = await fetchBuffer(TANAKA_URL);
    const text = gunzipSync(gz).toString('utf8');
    const parsed = parseTanaka(text);
    byHead = parsed.byHead; byRead = parsed.byRead;
    console.log(`[build-extras] Parsed examples for ${byHead.size} headwords / ${byRead.size} readings.`);
  } catch (err) {
    console.warn('[build-extras] Example corpus unavailable — writing empty examples:', err.message);
  }

  // examples.json — keyed by headword AND reading, multiple examples each.
  const examplesOut = {};
  for (const [head, list] of byHead) {
    const best = bestExamples(list, MAX_EX_PER_HEAD);
    if (best.length) examplesOut[head] = best;
  }
  for (const [read, list] of byRead) {
    if (examplesOut[read]) continue; // headword entry wins
    const best = bestExamples(list, MAX_EX_PER_HEAD);
    if (best.length) examplesOut[read] = best;
  }
  await writeFile(resolve(OUT_DIR, 'examples.json'), JSON.stringify(examplesOut));
  console.log(`[build-extras] Wrote examples.json (${Object.keys(examplesOut).length} keys).`);

  // Best single example for a word, trying headword then reading.
  const oneExample = (word, reading) => {
    let list = byHead.get(word);
    if (!list && reading) list = byRead.get(reading);
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
    const ex = oneExample(v.word, v.reading);
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
    const level = lv.toUpperCase();
    for (let i = 1; i < rows.length; i++) {
      const [word, reading, meaning] = rows[i];
      if (!isQuizWord(word, reading)) continue;
      if (existingSet.has(word) || added.has(word)) continue;
      added.add(word);
      const ex = oneExample(word, reading);
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
  process.exit(0); // non-fatal: never block the build
});
