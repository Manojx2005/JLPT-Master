import React from 'react';
import ReactDOM from 'react-dom/client';
// Import features first — this runs the SRS/PROGRESS/etc. module code and
// assigns everything to window.* so legacy global reads still work.
import { CUSTOM_DICT } from './features.js';
import './styles.css';
import { App, ErrorBoundary } from './07-app.jsx';
import { _localDataMissing } from './01-core.jsx';

// Service worker policy differs by platform:
//  - Web/PWA (prod): register sw.js for installability + offline.
//  - Native (Capacitor): NEVER register. Assets are already bundled and served
//    locally, so a SW adds nothing — but it caches features.js/index.html under
//    a fixed key and shadows every new build after a reinstall (the WebView
//    profile, hence the SW, survives APK reinstalls). That stale cache is why
//    code changes appeared to do nothing on device. Proactively unregister any
//    SW + delete any caches left behind by older builds so the WebView always
//    runs the freshly-bundled code.
var isNativeShell = !!(window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform());

if (isNativeShell) {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
            .then(function (regs) { regs.forEach(function (r) { r.unregister(); }); })
            .catch(function () {});
    }
    if (window.caches && caches.keys) {
        caches.keys()
            .then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); })
            .catch(function () {});
    }
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
    // Auto-update: each deploy stamps a new cache name (scripts/stamp-sw.mjs),
    // so the new SW activates (skipWaiting + clients.claim) and fires
    // 'controllerchange'. Reload once then so the user gets fresh assets with
    // no manual hard refresh. Guarded by an existing controller so the very
    // first install (no prior controller) doesn't trigger a reload loop.
    if (navigator.serviceWorker.controller) {
        var _swRefreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (_swRefreshing) return;
            _swRefreshing = true;
            window.location.reload();
        });
    }
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').then(function (reg) {
            // Check for a newer SW on every load so updates land promptly.
            reg.update().catch(function () {});
        }).catch(function () {});
    });
}

var root = ReactDOM.createRoot(document.getElementById('root'));

function mountApp() {
    root.render(<ErrorBoundary><App /></ErrorBoundary>);
}

/**
 * Merges the build-time extras into the in-memory vocabulary:
 *   dict/vocab-fixes.json → authoritative example sentences that OVERRIDE the
 *      machine-generated (often wrong / mixed-language) examples in data.js.
 *   dict/jlpt-extra.json  → additional N5–N1 words appended to the quiz pool.
 * Runs in the background (never blocks first paint) and is idempotent. Failure
 * is non-fatal — the app simply uses the shipped data.js vocabulary.
 */
function applyVocabExtras() {
    if (window.__vocabExtrasApplied) return Promise.resolve();
    window.__vocabExtrasApplied = true;
    var base = '';
    try { base = import.meta.env.BASE_URL || ''; } catch (e) { base = ''; }
    if (base && base.slice(-1) !== '/') base += '/';

    var getJson = function (file) {
        return fetch(base + 'dict/' + file).then(function (r) {
            return r.ok ? r.json() : null;
        }).catch(function () { return null; });
    };

    return Promise.all([getJson('vocab-fixes.json'), getJson('jlpt-extra.json')])
        .then(function (res) {
            var fixes = res[0], extra = res[1];
            if (!Array.isArray(window.JLPT_VOCAB)) return;

            // Apply corrected example sentences in place.
            if (fixes) {
                window.JLPT_VOCAB.forEach(function (v) {
                    var fix = fixes[v.word];
                    if (fix) { v.example = fix.example; v.exampleEn = fix.exampleEn; }
                });
            }

            // Append new leveled words not already present.
            if (Array.isArray(extra) && extra.length) {
                var have = {};
                window.JLPT_VOCAB.forEach(function (v) { have[v.word] = 1; });
                extra.forEach(function (w) {
                    if (!have[w.word]) { window.JLPT_VOCAB.push(w); have[w.word] = 1; }
                });
            }
        });
}

/**
 * Loads the baked Simplified-Chinese meaning maps (committed under
 * public/i18n/) into window.VOCAB_ZH (word → 中文) and window.GRAMMAR_ZH
 * (pattern → 中文). getVocabMeaning / getGrammarMeaning read these for the
 * 'zh' language, so offline vocab + grammar render in Chinese with no network.
 * Missing entries (e.g. JMdict results) fall back to live translation.
 * Failure is non-fatal — Chinese simply falls back to English/live-translate.
 */
function applyChineseMeanings() {
    if (window.__zhApplied) return Promise.resolve();
    window.__zhApplied = true;
    var base = '';
    try { base = import.meta.env.BASE_URL || ''; } catch (e) { base = ''; }
    if (base && base.slice(-1) !== '/') base += '/';

    var getJson = function (file) {
        return fetch(base + 'i18n/' + file).then(function (r) {
            return r.ok ? r.json() : null;
        }).catch(function () { return null; });
    };

    return Promise.all([getJson('vocab-zh.json'), getJson('grammar-zh.json')])
        .then(function (res) {
            if (res[0]) window.VOCAB_ZH = res[0];
            if (res[1]) window.GRAMMAR_ZH = res[1];
        });
}

// The active UI language decides whether the Chinese maps must be ready before
// first paint: a 'zh' user should see Chinese immediately, everyone else loads
// it lazily in the background (no cost to the common case).
function isChineseUI() {
    try { return localStorage.getItem('jlpt_lang') === 'zh'; } catch (e) { return false; }
}

// Kick off background vocab extras + Chinese map load, then mount — gating first
// paint on the Chinese maps only when the UI is actually in Chinese.
function bootstrapAndMount() {
    applyVocabExtras();
    var zh = applyChineseMeanings();
    if (isChineseUI()) { zh.finally(mountApp); } else { mountApp(); }
}

if (_localDataMissing && typeof firebase !== 'undefined' && firebase.database) {
    console.warn("Local data files (data.js / features.js data) missing or failed. Falling back to Firebase Realtime Database...");
    var db = firebase.database();
    
    // Create a simple loading screen in the DOM
    var loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center;background:var(--bg-app);color:white;z-index:9999;font-family:Outfit,sans-serif;font-size:1.2rem;';
    loadingDiv.innerHTML = '<div style="text-align:center;"><div style="margin-bottom:15px;width:40px;height:40px;border:4px solid rgba(255,255,255,0.2);border-top-color:white;border-radius:50%;animation:spin 1s linear infinite;"></div><div>Fetching cloud database...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
    document.body.appendChild(loadingDiv);

    var p1 = db.ref('global_jlpt_vocab').once('value').then(function(s) { 
        window.JLPT_VOCAB = s.val() || []; 
    });
    var p2 = db.ref('global_grammar').once('value').then(function(s) { 
        window.GRAMMAR_DATA = s.val() || []; 
    });

    Promise.all([p1, p2]).then(function() {
        if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
        // Re-initialize dependent variables
        window.MOCK_DICT = window.JLPT_VOCAB.map(function(q) {
            return {
                kanji: q.word, kana: q.reading, english: q.correct, meaning_vn: q.meaning_vn,
                meaning_my: q.meaning_my, level: q.level, nuance: q.nuance || '',
                example: q.example || '', exampleEn: q.exampleEn || ''
            };
        });
        window.MOCK_DICT = window.MOCK_DICT.concat(CUSTOM_DICT.load());
        bootstrapAndMount();
    }).catch(function(e) {
        console.error("Firebase fallback failed:", e);
        if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
        mountApp();
    });
} else {
    // Mount immediately for fast first paint; merge the vocab extras + Chinese
    // maps in the background (they land well before the user reaches the
    // quiz/flashcards). A Chinese UI waits for its maps so meanings aren't
    // momentarily English.
    bootstrapAndMount();
}

