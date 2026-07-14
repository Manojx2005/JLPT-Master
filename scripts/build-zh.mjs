/**
 * JLPT Master — Chinese (Simplified) translation builder.
 *
 * Bakes Simplified-Chinese meanings so the app's OFFLINE vocabulary and grammar
 * work in Chinese with no network calls (matching the vn/my baked meanings that
 * ship in data.js). Two committed maps are produced under public/i18n/:
 *
 *   vocab-zh.json    — { "<word>": "<中文>" }  keyed by JLPT_VOCAB headword
 *                      (base data.js vocab + dict/jlpt-extra.json when present).
 *   grammar-zh.json  — { "<pattern>": "<中文>" } keyed by GRAMMAR_DATA pattern.
 *
 * At runtime main.jsx loads these into window.VOCAB_ZH / window.GRAMMAR_ZH and
 * getVocabMeaning / getGrammarMeaning read them for lang === 'zh' (falling back
 * to the live Google-Translate cache for anything not baked, e.g. JMdict).
 *
 * Two translation engines:
 *   --engine=llm   Claude (official @anthropic-ai/sdk) — context-aware, natural
 *                  Chinese that understands grammar terminology (助词, not 粒子).
 *                  Needs credentials (ANTHROPIC_API_KEY or an `ant auth login`
 *                  profile). Model defaults to claude-opus-4-8; override with
 *                  ZH_MODEL (e.g. ZH_MODEL=claude-haiku-4-5 for far lower cost
 *                  on a bulk translation task).
 *   google (default) Google's free translate endpoint (no key). Used by CI.
 * If the LLM engine can't get credentials it falls back to Google.
 *
 * Output is COMMITTED (not gitignored) so the offline data ships in the bundle
 * without depending on CI reaching an API. Resumable + non-fatal: existing
 * translations are kept, only missing keys are fetched, progress is flushed
 * periodically, and any failure leaves partial output (runtime live-translation
 * covers the rest). Re-run with --force to fill in whatever is still missing.
 *
 * Run: node scripts/build-zh.mjs                    (Google, skips if exists)
 *      node scripts/build-zh.mjs --force            (Google, fill missing)
 *      node scripts/build-zh.mjs --force --engine=llm   (Claude, fill missing)
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'i18n');
const DATA_JS = resolve(__dirname, '..', 'public', 'data.js');
const FEATURES_JS = resolve(__dirname, '..', 'src', 'features.js');
const EXTRA_JSON = resolve(__dirname, '..', 'public', 'dict', 'jlpt-extra.json');
const VOCAB_OUT = resolve(OUT_DIR, 'vocab-zh.json');
const GRAMMAR_OUT = resolve(OUT_DIR, 'grammar-zh.json');

const GT_TL = 'zh-CN';        // Google target code for Simplified Chinese
const LLM_MODEL = process.env.ZH_MODEL || 'claude-opus-4-8';
const GOOGLE_BATCH = 40;      // texts per Google request
const LLM_BATCH = 50;         // items per Claude request
const DELAY_MS = 250;         // pause between requests
const FLUSH_EVERY = 15;       // write partial output every N batches
const MAX_RETRY = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Extract the committed JLPT_VOCAB array (valid JSON) from data.js ---- */
async function loadBaseVocab() {
  const src = await readFile(DATA_JS, 'utf8');
  const start = src.indexOf('[', src.indexOf('var JLPT_VOCAB'));
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

/* ---- Regex-extract [pattern, meaning] pairs from GRAMMAR_DATA (JS literal) ---- */
function unescapeJs(s) {
  return s.replace(/\\(['"\\])/g, '$1');
}
async function loadGrammarPairs() {
  const src = await readFile(FEATURES_JS, 'utf8');
  const block = src.slice(src.indexOf('var GRAMMAR_DATA'));
  const re = /pattern:\s*'((?:[^'\\]|\\.)*)'\s*,\s*meaning:\s*'((?:[^'\\]|\\.)*)'/g;
  const pairs = [];
  let m;
  while ((m = re.exec(block))) pairs.push([unescapeJs(m[1]), unescapeJs(m[2])]);
  return pairs;
}

async function readJsonSafe(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function withRetry(fn) {
  let lastErr;
  for (let a = 0; a < MAX_RETRY; a++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await sleep(500 * (a + 1)); }
  }
  throw lastErr;
}

/* ================= Google engine ================= */

async function googleBatch(texts) {
  const q = encodeURIComponent(texts.join('\n'));
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${GT_TL}&dt=t&q=${q}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'jlpt-master-build' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  let out = '';
  if (data && data[0]) for (const seg of data[0]) if (seg && seg[0]) out += seg[0];
  const parts = out.split('\n');
  if (parts.length === texts.length) return parts.map((p) => p.trim());
  return null; // count mismatch — caller falls back to per-item
}

// Returns Chinese for a slice of items (aligned by index). Uses the English
// gloss as the source; on a line-count mismatch, translates each item alone.
function makeGoogleTranslator() {
  return async function translate(items) {
    const texts = items.map((it) => it.en);
    const parts = await withRetry(() => googleBatch(texts));
    if (parts) return parts.map((p, j) => p || items[j].en);
    const out = [];
    for (const it of items) {
      const one = await withRetry(() => googleBatch([it.en]));
      out.push(one ? one[0] || it.en : it.en);
    }
    return out;
  };
}

/* ================= LLM engine (Claude) ================= */

const ZH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { i: { type: 'integer' }, zh: { type: 'string' } },
        required: ['i', 'zh'],
      },
    },
  },
  required: ['translations'],
};

const SYSTEM_VOCAB =
  'You translate Japanese JLPT vocabulary into Simplified Chinese for a study app. ' +
  'For each numbered item you get the Japanese word and its English gloss. Return the ' +
  'concise, natural Simplified-Chinese meaning only — dictionary-style, no pinyin, no ' +
  'explanations, no English. Use the Japanese word to disambiguate the sense.';

const SYSTEM_GRAMMAR =
  'You translate Japanese JLPT grammar points into Simplified Chinese for a study app. ' +
  'For each numbered item you get the grammar pattern and its English meaning. Return a ' +
  'short, natural Simplified-Chinese gloss using correct linguistic terminology ' +
  '(e.g. 助词 for "particle", 助动词, 接续 — never 粒子). No pinyin, no English, no explanations.';

async function getAnthropicClient() {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    console.warn('[build-zh] @anthropic-ai/sdk not installed — falling back to Google.');
    return null;
  }
  try {
    // Zero-arg client resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
    // `ant auth login` profile. A tiny probe confirms credentials work.
    const client = new Anthropic();
    await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return client;
  } catch (e) {
    console.warn(`[build-zh] Claude unavailable (${e.message}) — falling back to Google.`);
    return null;
  }
}

function makeLlmTranslator(client, kind) {
  const system = kind === 'grammar' ? SYSTEM_GRAMMAR : SYSTEM_VOCAB;
  return async function translate(items) {
    const lines = items
      .map((it, i) => `${i}\t${it.head}\t${it.en}`)
      .join('\n');
    const prompt =
      'Translate each item to Simplified Chinese. Columns are: index, ' +
      (kind === 'grammar' ? 'pattern' : 'Japanese word') +
      ', English meaning.\n\n' + lines;

    const parse = async () => {
      const resp = await client.messages.create({
        model: LLM_MODEL,
        max_tokens: 4096,
        system,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ZH_SCHEMA } },
        messages: [{ role: 'user', content: prompt }],
      });
      const block = resp.content.find((b) => b.type === 'text');
      const data = JSON.parse(block.text);
      const byIndex = {};
      for (const t of data.translations) byIndex[t.i] = t.zh;
      return byIndex;
    };

    const byIndex = await withRetry(parse);
    // Any index the model dropped falls back to the English gloss for now
    // (a later --force run retries only the still-missing keys).
    return items.map((it, i) => (byIndex[i] && byIndex[i].trim()) || it.en);
  };
}

/* ================= Shared driver ================= */

/**
 * Fills `out` with Chinese for every item whose key is missing, using
 * `translate` (a function slice→[zh...]). Returns true if it finished cleanly,
 * false if it stopped early on error (partial progress is already flushed).
 */
async function translateInto(out, items, label, batchSize, translate, flush) {
  const todo = items.filter((it) => it.en && !out[it.key]);
  if (todo.length === 0) { console.log(`[build-zh] ${label}: nothing missing.`); return true; }
  console.log(`[build-zh] ${label}: translating ${todo.length} of ${items.length}…`);
  let done = 0, batchNo = 0;
  for (let i = 0; i < todo.length; i += batchSize) {
    const slice = todo.slice(i, i + batchSize);
    try {
      const zh = await translate(slice);
      slice.forEach((s, j) => { out[s.key] = zh[j] || s.en; });
    } catch (e) {
      console.warn(`[build-zh] ${label}: stopping early at ${done}/${todo.length} — ${e.message}`);
      return false;
    }
    done += slice.length;
    if (++batchNo % FLUSH_EVERY === 0) { await flush(); process.stdout.write(`  …${done}/${todo.length}\n`); }
    await sleep(DELAY_MS);
  }
  console.log(`[build-zh] ${label}: done (${done} translated).`);
  return true;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const force = process.argv.includes('--force');
  const engineArg = (process.argv.find((a) => a.startsWith('--engine=')) || '').split('=')[1];
  const engine = engineArg || process.env.ZH_ENGINE || 'google';

  // --fresh regenerates from scratch (e.g. upgrading the Google baseline to
  // LLM quality); otherwise existing translations are kept and only missing
  // keys are filled.
  const fresh = process.argv.includes('--fresh');
  if (!force && existsSync(VOCAB_OUT) && existsSync(GRAMMAR_OUT)) {
    console.log('[build-zh] outputs exist — skipping (use --force to fill missing).');
    return;
  }

  const vocabOut = fresh ? {} : await readJsonSafe(VOCAB_OUT, {});
  const grammarOut = fresh ? {} : await readJsonSafe(GRAMMAR_OUT, {});
  const flush = async () => {
    await writeFile(VOCAB_OUT, JSON.stringify(vocabOut));
    await writeFile(GRAMMAR_OUT, JSON.stringify(grammarOut));
  };

  // Vocab items: base data.js + optional jlpt-extra.json, keyed by headword.
  const vocabItems = [];
  const seen = new Set();
  const pushVocab = (word, en) => {
    if (!word || !en || seen.has(word)) return;
    seen.add(word);
    vocabItems.push({ key: word, head: word, en: String(en).trim() });
  };
  try {
    for (const v of await loadBaseVocab()) {
      const en = v.correct || (Array.isArray(v.meanings) ? v.meanings.join('; ') : '') || v.english;
      pushVocab(v.word, en);
    }
  } catch (e) { console.warn('[build-zh] base vocab unavailable:', e.message); }
  const extra = await readJsonSafe(EXTRA_JSON, null);
  if (Array.isArray(extra)) for (const v of extra) pushVocab(v.word, v.correct);

  // Grammar items: pattern → meaning.
  let grammarItems = [];
  try {
    grammarItems = (await loadGrammarPairs()).map(([pattern, meaning]) => ({ key: pattern, head: pattern, en: meaning }));
  } catch (e) { console.warn('[build-zh] grammar unavailable:', e.message); }

  // Pick engine.
  let client = null;
  let useLlm = engine === 'llm';
  if (useLlm) {
    client = await getAnthropicClient();
    if (!client) useLlm = false; // fell back to Google
  }
  const batchSize = useLlm ? LLM_BATCH : GOOGLE_BATCH;
  const vocabTranslate = useLlm ? makeLlmTranslator(client, 'vocab') : makeGoogleTranslator();
  const grammarTranslate = useLlm ? makeLlmTranslator(client, 'grammar') : makeGoogleTranslator();
  console.log(`[build-zh] engine: ${useLlm ? 'Claude (' + LLM_MODEL + ')' : 'Google Translate'}`);

  await translateInto(vocabOut, vocabItems, 'vocab', batchSize, vocabTranslate, flush);
  await translateInto(grammarOut, grammarItems, 'grammar', batchSize, grammarTranslate, flush);
  await flush();
  console.log(`[build-zh] Wrote vocab-zh.json (${Object.keys(vocabOut).length}) + grammar-zh.json (${Object.keys(grammarOut).length}).`);
}

main().catch((err) => {
  console.error('[build-zh] failed:', err);
  process.exit(0); // non-fatal: never block the build
});
