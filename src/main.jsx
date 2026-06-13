import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { App, ErrorBoundary } from './07-app.jsx';
import { _localDataMissing } from './01-core.jsx';
const createElement = React.createElement;

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
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
}

var root = ReactDOM.createRoot(document.getElementById('root'));

function mountApp() {
    root.render(createElement(ErrorBoundary, null, createElement(App, null)));
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
        if (typeof CUSTOM_DICT !== 'undefined') {
            window.MOCK_DICT = window.MOCK_DICT.concat(CUSTOM_DICT.load());
        }
        mountApp();
    }).catch(function(e) {
        console.error("Firebase fallback failed:", e);
        if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
        mountApp();
    });
} else {
    mountApp();
}

