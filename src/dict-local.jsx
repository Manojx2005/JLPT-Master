/* =================================================================
   JLPT Master — Offline full-dictionary store (IndexedDB)

   Loads the compact JMdict file (public/dict/jmdict.json, ~218k entries,
   built by scripts/build-dict.mjs) into IndexedDB ONCE, then answers every
   dictionary search locally — no Jotoba, no Jisho, no CORS proxy.

   The full dictionary is OPT-IN: nothing is downloaded until the user taps
   "Download offline dictionary". searchLocal() uses the DB only once it has
   been installed; otherwise it returns [] and online sources handle the query.

   Public API:
     getInstalledInfo() → Promise<{installed, count, version}> — NO network.
     installDict()      → downloads ~20 MB + imports into IndexedDB (the heavy,
                          opt-in step). Idempotent. Emits 'jlpt-dict-progress'.
     searchLocal(query) → Promise<Array> of result objects matching the shape
                          used by searchJisho() in 01-core.jsx ([] if not installed).
     getDictStatus()    → 'idle' | 'not-installed' | 'installing' | 'ready' | 'error'

   The browser caches the file (service worker) and the DB persists, so once
   installed, later sessions open instantly and work fully offline.
   ================================================================= */

var DB_NAME = 'jlpt-dict';
var DB_VERSION = 1;
var STORE = 'entries';
var META_STORE = 'meta';
var CHUNK = 2000; // records per write transaction — keeps the UI responsive

var _status = 'idle';
var _openPromise = null;    // DB open + installed-status check (no network)
var _installPromise = null; // the heavy download + import (opt-in)
var _installedInfo = { installed: false, count: 0, version: null };
var _db = null;
var _tagMap = {}; // POS code → readable label, from meta.json

function getDictStatus() { return _status; }

function emitProgress(loaded, total) {
    try {
        window.dispatchEvent(new CustomEvent('jlpt-dict-progress', {
            detail: { loaded: loaded, total: total, status: _status }
        }));
    } catch (e) { /* no-op */ }
}

/** Promisified IDBRequest. */
function reqPromise(req) {
    return new Promise(function (resolve, reject) {
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
    });
}

function openDB() {
    return new Promise(function (resolve, reject) {
        var open = indexedDB.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = function () {
            var db = open.result;
            if (!db.objectStoreNames.contains(STORE)) {
                var store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('k', 'k', { unique: false });        // headword (kanji/kana)
                store.createIndex('r', 'r', { unique: false });        // reading (kana)
                store.createIndex('t', 't', { unique: false, multiEntry: true }); // english tokens
            }
            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE, { keyPath: 'key' });
            }
        };
        open.onsuccess = function () { resolve(open.result); };
        open.onerror = function () { reject(open.error); };
    });
}

/** Lowercase English tokens (len >= 2) drawn from an entry's meanings. */
function tokenize(meanings) {
    var seen = {};
    var out = [];
    for (var i = 0; i < meanings.length; i++) {
        var parts = String(meanings[i]).toLowerCase().split(/[^a-z0-9]+/);
        for (var j = 0; j < parts.length; j++) {
            var tk = parts[j];
            if (tk.length >= 2 && !seen[tk]) { seen[tk] = 1; out.push(tk); }
        }
    }
    return out;
}

/** Resolves the base path for public assets (honours Vite's relative base). */
function dictUrl(file) {
    var base = '';
    try { base = import.meta.env.BASE_URL || ''; } catch (e) { base = ''; }
    if (base && base.slice(-1) !== '/') base += '/';
    return base + 'dict/' + file;
}

function txDone(tx) {
    return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
    });
}

/**
 * Opens the DB and reads the install status from the meta store. Does NOT
 * touch the network and never downloads the dictionary. Idempotent.
 * @returns {Promise<{installed:boolean, count:number, version:string|null}>}
 */
function ensureOpen() {
    if (_openPromise) return _openPromise;
    if (typeof indexedDB === 'undefined') {
        _status = 'error';
        _openPromise = Promise.resolve(_installedInfo);
        return _openPromise;
    }
    _openPromise = openDB()
        .then(function (db) {
            _db = db;
            var tx = db.transaction(META_STORE, 'readonly');
            return reqPromise(tx.objectStore(META_STORE).get('build'));
        })
        .then(function (storedMeta) {
            if (storedMeta && storedMeta.count > 0) {
                if (storedMeta.tags) _tagMap = storedMeta.tags;
                _installedInfo = { installed: true, count: storedMeta.count, version: storedMeta.version };
                if (_status === 'idle') _status = 'ready';
            } else {
                _installedInfo = { installed: false, count: 0, version: null };
                if (_status === 'idle') _status = 'not-installed';
            }
            return _installedInfo;
        })
        .catch(function (err) {
            _status = 'error';
            console.warn('Offline dictionary open failed:', err && err.message);
            return _installedInfo;
        });
    return _openPromise;
}

/** Install status without downloading anything (safe to call on mount). */
function getInstalledInfo() { return ensureOpen(); }

/** Fetches the small shipped meta.json (version + total + POS tag map). */
async function fetchShippedMeta() {
    try {
        var res = await fetch(dictUrl('meta.json'), { cache: 'no-cache' });
        if (res.ok) return await res.json();
    } catch (e) { /* offline — fall back to stored */ }
    return null;
}

/**
 * Downloads the full dictionary (~20 MB) and imports it into IndexedDB. This
 * is the heavy, OPT-IN step — only invoked when the user taps the download
 * button. Idempotent; emits 'jlpt-dict-progress' as records are written.
 */
function installDict() {
    if (_installPromise) return _installPromise;
    _installPromise = (async function () {
        var info = await ensureOpen();
        if (!_db) throw new Error('IndexedDB unavailable');

        var meta = await fetchShippedMeta();
        if (meta && meta.tags) _tagMap = meta.tags;

        // Already installed and current → nothing to download.
        if (info.installed && (!meta || info.version === meta.version)) {
            _status = 'ready';
            emitProgress(info.count, info.count);
            return;
        }

        _status = 'installing';
        emitProgress(0, 0);

        var res = await fetch(dictUrl('jmdict.json'));
        if (!res.ok) throw new Error('dictionary fetch failed: ' + res.status);
        var entries = await res.json();
        var total = entries.length;

        // Clear any stale data first (covers a version bump re-import).
        var clearTx = _db.transaction(STORE, 'readwrite');
        clearTx.objectStore(STORE).clear();
        await txDone(clearTx);

        for (var start = 0; start < total; start += CHUNK) {
            var tx = _db.transaction(STORE, 'readwrite');
            var store = tx.objectStore(STORE);
            var end = Math.min(start + CHUNK, total);
            for (var i = start; i < end; i++) {
                var e = entries[i];
                e.t = tokenize(e.m || []);
                store.put(e);
            }
            await txDone(tx);
            emitProgress(end, total);
        }

        var saveTx = _db.transaction(META_STORE, 'readwrite');
        saveTx.objectStore(META_STORE).put({
            key: 'build',
            version: meta ? meta.version : 'unknown',
            count: total,
            tags: _tagMap,
        });
        await txDone(saveTx);

        _installedInfo = { installed: true, count: total, version: meta ? meta.version : 'unknown' };
        _status = 'ready';
        emitProgress(total, total);
    })().catch(function (err) {
        _status = 'error';
        _installPromise = null; // allow a retry
        emitProgress(0, 0);
        console.warn('Offline dictionary install failed:', err && err.message);
        throw err;
    });
    return _installPromise;
}

/** Collects up to `limit` records from an index for an exact or prefix key. */
function queryIndex(indexName, value, prefix, limit, sink) {
    return new Promise(function (resolve) {
        var tx = _db.transaction(STORE, 'readonly');
        var index = tx.objectStore(STORE).index(indexName);
        var range = prefix
            ? IDBKeyRange.bound(value, value + '￿')
            : IDBKeyRange.only(value);
        var cursorReq = index.openCursor(range);
        cursorReq.onsuccess = function () {
            var cursor = cursorReq.result;
            if (!cursor || sink.count >= limit) { resolve(); return; }
            var rec = cursor.value;
            if (!sink.ids[rec.id]) { sink.ids[rec.id] = 1; sink.records.push(rec); sink.count++; }
            cursor.continue();
        };
        cursorReq.onerror = function () { resolve(); };
    });
}

var POS_FALLBACK = {
    n: 'Noun', v1: 'Ichidan verb', v5: 'Godan verb', 'adj-i': 'I-adjective',
    'adj-na': 'Na-adjective', adv: 'Adverb', exp: 'Expression', vt: 'Transitive',
    vi: 'Intransitive', vs: 'Suru verb', prt: 'Particle', int: 'Interjection',
};

function readableTag(code) {
    var full = _tagMap[code];
    if (full) return full.length > 24 ? (POS_FALLBACK[code] || code) : full;
    return POS_FALLBACK[code] || code;
}

/** Maps a stored record to the app's dictionary result shape. */
function toResult(rec) {
    return {
        word: rec.k,
        reading: rec.r || '',
        meanings: rec.m || [],
        tags: (rec.p || []).map(readableTag),
        jlpt: '',
        source: 'local',
        otherForms: (rec.f || []).map(function (w) { return { word: w, reading: '' }; }),
        isCommon: !!rec.c,
        audioUrl: null,
    };
}

/** Ranks: common words first, then by fewest meanings (more specific entries). */
function rankRecords(records) {
    return records.sort(function (a, b) {
        if (!!b.c !== !!a.c) return (b.c ? 1 : 0) - (a.c ? 1 : 0);
        return (a.m ? a.m.length : 0) - (b.m ? b.m.length : 0);
    });
}

/**
 * Scores an entry against an English query: a gloss that *equals* the query
 * (e.g. "cat" → 猫) beats one that merely contains it as a word, the first
 * sense beats later senses, and common words beat rare ones.
 */
function scoreEnglish(rec, q) {
    var score = rec.c ? 8 : 0;
    var glosses = rec.m || [];
    for (var i = 0; i < glosses.length; i++) {
        var pieces = String(glosses[i]).toLowerCase().replace(/\([^)]*\)/g, '').split(/[;,]/);
        var senseWeight = i === 0 ? 2 : 1;
        for (var j = 0; j < pieces.length; j++) {
            var pc = pieces[j].trim();
            if (!pc) continue;
            if (pc === q) score += 6 * senseWeight;
            else if (pc.split(/\s+/).indexOf(q) !== -1) score += 2 * senseWeight;
        }
    }
    return score - glosses.length * 0.05; // slight nudge toward focused entries
}

var JP_RE = /[ぁ-んァ-ヶー一-龯々]/;

/**
 * Searches the offline dictionary. Japanese queries match headword/reading
 * (exact then prefix); English/romaji queries match glosses by token (AND
 * across query words). Returns up to 12 results in the standard shape.
 */
async function searchLocal(query) {
    var q = (query || '').trim();
    if (!q) return [];
    // Use the offline DB only if the user has installed it — never download here.
    var info = await ensureOpen();
    if (!info.installed || !_db) return [];

    var LIMIT = 12;

    if (JP_RE.test(q)) {
        // Two tiers: exact headword/reading matches always rank ABOVE prefix
        // matches (so 猫 beats 猫舌, 経済 beats 経済学), each tier ranked internally.
        var exact = { ids: {}, records: [], count: 0 };
        await queryIndex('k', q, false, LIMIT, exact);         // exact kanji/headword
        await queryIndex('r', q, false, LIMIT, exact);         // exact reading

        var prefix = { ids: Object.assign({}, exact.ids), records: [], count: 0 };
        if (exact.count < LIMIT) {
            await queryIndex('k', q, true, LIMIT, prefix);     // prefix kanji
            await queryIndex('r', q, true, LIMIT, prefix);     // prefix reading
        }
        var merged = rankRecords(exact.records).concat(rankRecords(prefix.records));
        return merged.slice(0, LIMIT).map(toResult);
    }

    // English / romaji: intersect entries containing every query token, then
    // rank by gloss-match quality (exact gloss > word-in-gloss > common).
    var tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 2; });
    if (tokens.length === 0) return [];

    // Gather candidate ids for the first (usually most specific) token, then
    // filter by the remaining tokens against each record's own token set.
    var first = { ids: {}, records: [], count: 0 };
    await queryIndex('t', tokens[0], false, 600, first);
    var ql = q.toLowerCase();
    var matched = first.records.filter(function (rec) {
        var set = rec.t || [];
        for (var i = 1; i < tokens.length; i++) {
            if (set.indexOf(tokens[i]) === -1) return false;
        }
        return true;
    });
    matched.sort(function (a, b) { return scoreEnglish(b, ql) - scoreEnglish(a, ql); });
    return matched.slice(0, LIMIT).map(toResult);
}

export { installDict, getInstalledInfo, searchLocal, getDictStatus };
