import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MOCK_DICT, ThemeToggle, _localDataMissing, loadJSON, t } from './01-core.jsx';
import { SRS, PROGRESS, CLOUD_SYNC_API, GRAMMAR_DATA, DAILY_WORD } from './features.js';
import { DictionaryTab, SavedTab } from './02-dictionary.jsx';
import { CustomTab, QuizTab } from './03-quiz.jsx';
import { ConjugationTab, DashboardTab, FlashcardTab, GrammarTab, KanjiTab, LeaderboardTab } from './04-study.jsx';
import { GrammarQuizTab, HeaderLoginWidget, LanguageSelector, MockExamTab, PDFExamTab } from './05-exams.jsx';
import { MultiplayerTab } from './06-multiplayer.jsx';
import { ReviewsTab } from './08-reviews.jsx';
import { PrivacyTab } from './09-legal.jsx';
import { KanaTab } from './11-kana.jsx';
import { KanjiWritingTab } from './12-writing.jsx';

/* =================================================================
   JLPT Master — Root App component, ErrorBoundary, and mount logic
   Part of the app, split from the original app.js for readability.
   All components share the global scope and load in order (see index.html).
   ================================================================= */


/* Navigation icons: inline monochrome stroke SVGs (Lucide-style).
   Replaces emoji icons for consistent weight and theming via currentColor. */
var NAV_ICON_PATHS = {
    dict: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
    kanji: ['m5 8 6 6', 'm4 14 6-6 2-3', 'M2 5h12', 'M7 2h1', 'm22 22-5-10-5 10', 'M14 18h6'],
    kana: ['M4 5h16', 'M9 3v2', 'M7 9c0 4-1 8-4 10', 'M7 9c2 0 6 .5 6 4 0 2-1 3-2.5 3S8 18 8 16.5c0-2 2-3 5-3 3 0 5 1.5 5 4', 'M20 9h-5'],
    writing: ['M12 19l7-7 3 3-7 7-3-3z', 'M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z', 'M2 2l7.586 7.586', 'M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
    grammar: ['m6 16 6-12 6 12', 'M8 12h8', 'm16 20 2 2 4-4'],
    grammarquiz: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v4a2 2 0 0 0 2 2h4', 'm9 15 2 2 4-4'],
    quiz: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z', 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
    pdfexam: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
    mockexam: ['M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z', 'M22 10v6', 'M6 12.5V16a6 3 0 0 0 12 0v-3.5'],
    flash: ['M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z', 'm22 12.18-9.17 4.16a2 2 0 0 1-1.66 0L2 12.18', 'm22 17.18-9.17 4.16a2 2 0 0 1-1.66 0L2 17.18'],
    conj: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M3 21v-5h5'],
    multi: ['M14.5 17.5 3 6V3h3l11.5 11.5', 'm13 19 6-6', 'm16 16 4 4', 'm19 21 2-2', 'M9.5 6.5 21 18v3h-3L6.5 9.5', 'm5 14-3 3 3 3', 'm3 21 2-2'],
    dash: ['M3 3v16a2 2 0 0 0 2 2h16', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
    leader: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2z'],
    saved: ['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
    reviews: ['M7.9 20A9 9 0 1 0 4 16.1L2 22z'],
    custom: ['M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.4 2.6a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4z'],
    privacy: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01']
};

function navIcon(id, size) {
    var paths = NAV_ICON_PATHS[id];
    if (!paths) return null;
    return <svg width={size || 18} height={size || 18} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round' aria-hidden={true} style={{
  display: 'block'
}}>{paths.map(function (d, i) {
    return <path key={i} d={d} />;
  })}</svg>;
}

/* PWA install helper. Shown only in a browser (never in the native app or
   when already installed/standalone). On Android it captures the
   beforeinstallprompt event and offers a real Install button; on iOS Safari —
   which has no programmatic install — it shows the Share→Add to Home Screen
   instruction. Dismissible, and the choice is remembered. */
function InstallPrompt() {
    var _d = useState(null), deferred = _d[0], setDeferred = _d[1];
    var _show = useState(false), show = _show[0], setShow = _show[1];
    var _ios = useState(false), ios = _ios[0], setIos = _ios[1];

    useEffect(function () {
        try { if (localStorage.getItem('jlpt_install_hide') === '1') return; } catch (e) {}
        var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true;
        var isNative = !!(window.NativeUX && window.NativeUX.isNative);
        if (standalone || isNative) return; // already installed, or in the native app

        var ua = (window.navigator.userAgent || '').toLowerCase();
        var isIOS = /iphone|ipad|ipod/.test(ua);
        if (isIOS) { setIos(true); setShow(true); return; }

        function onBIP(e) { e.preventDefault(); setDeferred(e); setShow(true); }
        function onInstalled() { setShow(false); }
        window.addEventListener('beforeinstallprompt', onBIP);
        window.addEventListener('appinstalled', onInstalled);
        return function () {
            window.removeEventListener('beforeinstallprompt', onBIP);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    function dismiss() {
        setShow(false);
        try { localStorage.setItem('jlpt_install_hide', '1'); } catch (e) {}
    }
    function install() {
        if (!deferred) return;
        deferred.prompt();
        deferred.userChoice.then(function () { setShow(false); setDeferred(null); });
    }

    if (!show) return null;

    return <div className='install-banner'><img className='install-banner__icon' src='./icon.svg' alt='' /><div className='install-banner__text'><strong>Install JLPT Master</strong><span>{ios ? 'Tap the Share icon below, then “Add to Home Screen”.' : 'Add it to your home screen for the full app.'}</span></div>{ios ? null : <button className='install-banner__btn' onClick={install}>Install</button>}<button className='install-banner__close' onClick={dismiss} aria-label='Dismiss'>✕</button></div>;
}

function App() {
    // --- State ---
    var _tab = useState('dict');
    var tab = _tab[0], setTab = _tab[1];              // Active tab

    var _tabHistory = useState([]);
    var tabHistory = _tabHistory[0], setTabHistory = _tabHistory[1]; // Stack of visited tabs for the Back button

    var _isSidebarExpanded = useState(true);
    var isSidebarExpanded = _isSidebarExpanded[0], setIsSidebarExpanded = _isSidebarExpanded[1];

    var _customQs = useState(function () {
        return loadJSON('jlpt_custom_questions', []);
    });
    var customQs = _customQs[0], setCustomQs = _customQs[1]; // User-added custom questions
    var customQsRef = useRef(customQs);

    // Persist custom questions and keep cloud in sync
    useEffect(function () {
        customQsRef.current = customQs;
        try { localStorage.setItem('jlpt_custom_questions', JSON.stringify(customQs)); } catch (e) {}
        if (typeof CLOUD_SYNC_API !== 'undefined' && CLOUD_SYNC_API.isLoggedIn()) {
            CLOUD_SYNC_API.uploadCustomQs(customQs);
        }
    }, [customQs]);

    var _isLightMode = useState(function () {
        return localStorage.getItem('jlpt_theme') === 'light';
    });
    var isLightMode = _isLightMode[0], setIsLightMode = _isLightMode[1];

    var _savedWords = useState(function () {
        return loadJSON('jlpt_saved', []);
    });
    var savedWords = _savedWords[0], setSavedWords = _savedWords[1];
    // Ref so auth-listener closure always sees the latest list without re-registering
    var savedWordsRef = useRef(savedWords);

    var _appLang = useState(function () {
        return localStorage.getItem('jlpt_lang') || 'en';
    });
    var appLang = _appLang[0], setAppLang = _appLang[1];

    useEffect(function () {
        localStorage.setItem('jlpt_lang', appLang);
    }, [appLang]);

    var _autoPronounce = useState(function () {
        return localStorage.getItem('jlpt_auto_pronounce') === 'true';
    });
    var autoPronounce = _autoPronounce[0], setAutoPronounce = _autoPronounce[1];

    useEffect(function () {
        localStorage.setItem('jlpt_auto_pronounce', autoPronounce);
    }, [autoPronounce]);

    var _showFurigana = useState(function () {
        var stored = localStorage.getItem('jlpt_show_furigana');
        return stored === null ? true : stored === 'true';
    });
    var showFurigana = _showFurigana[0], setShowFurigana = _showFurigana[1];

    useEffect(function () {
        localStorage.setItem('jlpt_show_furigana', showFurigana);
    }, [showFurigana]);

    var _tabAnim = useState('');
    var tabAnim = _tabAnim[0], setTabAnim = _tabAnim[1];

    var _moreSheetOpen = useState(false);
    var moreSheetOpen = _moreSheetOpen[0], setMoreSheetOpen = _moreSheetOpen[1];

    var _navScrollState = useState({ canScrollLeft: false, canScrollRight: true });
    var navScrollState = _navScrollState[0], setNavScrollState = _navScrollState[1];

    var _indicatorStyle = useState({ left: 0, width: 0, opacity: 0 });
    var indicatorStyle = _indicatorStyle[0], setIndicatorStyle = _indicatorStyle[1];

    var navScrollRef = useRef(null);
    var mainRef = useRef(null);   // <main> scroll container — used to jump back to top
    var islandExpandRef = useRef(null); // More-tabs panel — height animated to exact px
    var isDown = useRef(false);
    var startX = useRef(0);
    var scrollLeft = useRef(0);
    var didDrag = useRef(false);

    function handleMouseDown(e) {
        isDown.current = true;
        didDrag.current = false;
        navScrollRef.current.classList.add('nav-tabs--active-drag');
        startX.current = e.pageX - navScrollRef.current.offsetLeft;
        scrollLeft.current = navScrollRef.current.scrollLeft;
    }

    function handleMouseLeave() {
        isDown.current = false;
        if (navScrollRef.current) navScrollRef.current.classList.remove('nav-tabs--active-drag');
    }

    function handleMouseUp() {
        isDown.current = false;
        if (navScrollRef.current) navScrollRef.current.classList.remove('nav-tabs--active-drag');
    }

    function handleMouseMove(e) {
        if (!isDown.current) return;
        e.preventDefault();
        var x = e.pageX - navScrollRef.current.offsetLeft;
        if (Math.abs(x - startX.current) > 3) {
            didDrag.current = true;
        }
        var walk = (x - startX.current) * 2;
        navScrollRef.current.scrollLeft = scrollLeft.current - walk;
    }

    function checkNavScroll() {
        if (!navScrollRef.current) return;
        var el = navScrollRef.current;
        var canLeft = el.scrollLeft > 5;
        var canRight = Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 5;
        setNavScrollState({ canScrollLeft: canLeft, canScrollRight: canRight });
    }

    useEffect(function () {
        if (!navScrollRef.current) return;
        var updateIndicator = function() {
            var activeBtn = navScrollRef.current.querySelector('.nav-tab--active');
            if (activeBtn) {
                setIndicatorStyle({
                    left: activeBtn.offsetLeft,
                    width: activeBtn.offsetWidth,
                    opacity: 1
                });
            }
        };
        updateIndicator();

        var observer = new ResizeObserver(function() {
            updateIndicator();
        });
        observer.observe(navScrollRef.current);
        var btns = navScrollRef.current.querySelectorAll('.nav-tab');
        for (var i = 0; i < btns.length; i++) {
            observer.observe(btns[i]);
        }

        return function () { observer.disconnect(); };
    }, [tab, appLang]);

    useEffect(function () {
        checkNavScroll();
        window.addEventListener('resize', checkNavScroll);
        return function () { window.removeEventListener('resize', checkNavScroll); };
    }, []);

    function scrollNav(direction) {
        if (navScrollRef.current) {
            var amount = 150;
            navScrollRef.current.scrollBy({ left: direction * amount, behavior: 'smooth' });
        }
    }

    useEffect(function () {
        if (isLightMode) {
            document.documentElement.classList.add('light-mode');
            localStorage.setItem('jlpt_theme', 'light');
        } else {
            document.documentElement.classList.remove('light-mode');
            localStorage.setItem('jlpt_theme', 'dark');
        }
        // Keep the native status bar in sync with the theme (no-op on web).
        if (window.NativeUX) window.NativeUX.setStatusBarTheme(isLightMode);
    }, [isLightMode]);

    // Animate the island's More panel to its EXACT measured height so the
    // grow/shrink reads as one smooth motion (max-height easing is uneven
    // because the target rarely equals the real content height).
    useEffect(function () {
        var el = islandExpandRef.current;
        if (!el) return;
        el.style.height = moreSheetOpen ? (el.scrollHeight + 'px') : '0px';
    }, [moreSheetOpen]);

    useEffect(function () {
        savedWordsRef.current = savedWords;
        localStorage.setItem('jlpt_saved', JSON.stringify(savedWords));
        if (typeof CLOUD_SYNC_API !== 'undefined' && CLOUD_SYNC_API.isLoggedIn()) {
            CLOUD_SYNC_API.uploadSavedWords(savedWords);
        }
    }, [savedWords]);

    // On login: pull all cloud data, merge with local, push merged result back up.
    // onLogin guarantees the UID is captured before this runs (no observer race)
    // and fires immediately if the user is already authenticated on page load —
    // which is the case for returning users.
    useEffect(function () {
        if (typeof CLOUD_SYNC_API === 'undefined') return;
        CLOUD_SYNC_API.onLogin(function () {
            CLOUD_SYNC_API.syncOnLogin(
                { savedWords: savedWordsRef.current, customQs: customQsRef.current },
                { setSavedWords: setSavedWords, setCustomQs: setCustomQs }
            );
        });
    }, []); // register once — refs give access to current values

    // --- Keyboard Shortcuts ---
    useEffect(function () {
        // Same order as the sidebar so '1'..'9' matches what the user sees
        var tabIds = ['dict', 'kanji', 'grammar', 'grammarquiz', 'quiz', 'pdfexam', 'mockexam', 'flash', 'conj'];
        function handleKeyDown(e) {
            // Don't trigger shortcuts when typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return; // don't hijack browser shortcuts

            // Number keys 1-9 for tabs
            var num = parseInt(e.key);
            if (num >= 1 && num <= 9 && num <= tabIds.length) {
                e.preventDefault();
                switchTab(tabIds[num - 1]);
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return function () { window.removeEventListener('keydown', handleKeyDown); };
    }, []);

    function switchTab(newTab, skipHistory) {
        if (newTab === tab) { scrollToTop(); return; } // re-tapping current tab → jump to top
        // Subtle native tap feedback on navigation (no-op on web).
        if (window.NativeUX) window.NativeUX.haptic('light');
        // Remember where we came from so the Back button can return there.
        if (!skipHistory) setTabHistory(function (h) { return h.concat([tab]); });
        var oldIdx = TAB_ORDER.indexOf(tab);
        var newIdx = TAB_ORDER.indexOf(newTab);
        var goingRight = newIdx > oldIdx;
        setTabAnim(goingRight ? 'tab-exit' : 'tab-exit tab-exit--right');
        setTimeout(function () {
            setTab(newTab);
            setTabAnim(goingRight ? 'tab-enter' : 'tab-enter tab-enter--left');
            setTimeout(function () { setTabAnim(''); }, 300);
            scrollToTop();
        }, 150);
    }

    // Pop the history stack and return to the previous tab.
    function goBack() {
        if (tabHistory.length === 0) return;
        var prev = tabHistory[tabHistory.length - 1];
        setTabHistory(function (h) { return h.slice(0, -1); });
        switchTab(prev, true); // skipHistory: don't re-push when going back
    }

    // Smoothly scroll the main content back to the top.
    function scrollToTop() {
        if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function toggleTheme() {
        setIsLightMode(function (prev) { return !prev; });
    }

    function toggleSavedWord(wordObj) {
        setSavedWords(function (prev) {
            var exists = prev.some(function (w) { return w.word === wordObj.word; });
            if (exists) {
                return prev.filter(function (w) { return w.word !== wordObj.word; });
            } else {
                return prev.concat([wordObj]);
            }
        });
    }

    // Merge built-in vocabulary with user's custom questions
    var allQuestions = JLPT_VOCAB.concat(customQs);

    // Tab order — used for directional slide transitions
    var TAB_ORDER = ['dict', 'kanji', 'kana', 'grammar', 'grammarquiz', 'quiz', 'pdfexam', 'mockexam', 'flash', 'writing', 'conj', 'multi', 'dash', 'leader', 'saved', 'reviews', 'custom'];

    // SRS due count for Flashcards badge
    var srsDueCount = useMemo(function () {
        return SRS.dueWords(JLPT_VOCAB).length;
    }, []);

    // Current streak for sidebar and controls bar
    var currentStreak = useMemo(function () {
        return PROGRESS.getStreak();
    }, []);

    // Manual cloud sync — pulls + merges + pushes everything (progress + saved words).
    // Returns a promise so the button can show progress; resolves to a status string.
    function cloudSyncNow() {
        if (typeof CLOUD_SYNC_API === 'undefined' || !CLOUD_SYNC_API.isLoggedIn()) {
            return Promise.resolve('not-logged-in');
        }
        var result = CLOUD_SYNC_API.syncOnLogin(
            { savedWords: savedWordsRef.current, customQs: customQsRef.current },
            { setSavedWords: setSavedWords, setCustomQs: setCustomQs }
        );
        var done = (result && typeof result.then === 'function') ? result : Promise.resolve();
        return done.then(function () { return 'ok'; }).catch(function () { return 'error'; });
    }

    // Manual sync for saved words only (used by the button in the Saved tab).
    // Downloads + merges + uploads; resolves to a status string for the UI.
    function syncSavedWordsNow() {
        if (typeof CLOUD_SYNC_API === 'undefined' || !CLOUD_SYNC_API.isLoggedIn()) {
            return Promise.resolve('not-logged-in');
        }
        return CLOUD_SYNC_API.syncSavedWords(savedWordsRef.current)
            .then(function (merged) {
                setSavedWords(merged);
                return 'ok';
            })
            .catch(function () { return 'error'; });
    }

    function addQuestion(q) {
        setCustomQs(function (prev) { return prev.concat([q]); });
    }

    function deleteQuestion(idx) {
        setCustomQs(function (prev) { return prev.filter(function (_, i) { return i !== idx; }); });
    }

    // --- Import/Export ---
    function exportSavedWords() {
        var dataStr = JSON.stringify(savedWords, null, 2);
        var blob = new Blob([dataStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'jlpt-master-saved-words.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportSavedWordsPDF() {
        if (savedWords.length === 0) return;

        var rows = savedWords.map(function (w, i) {
            var meaning = w.correct || w.english || (w.meanings && w.meanings.join(', ')) || '';
            var reading = w.reading || '';
            var level = w.level || w.jlpt || '';
            var word = w.word || '';
            return '<tr>' +
                '<td style="color:#999;width:36px">' + (i + 1) + '</td>' +
                '<td class="jp">' + word + '</td>' +
                '<td class="jp">' + reading + '</td>' +
                '<td><span class="tag">' + level + '</span></td>' +
                '<td>' + meaning + '</td>' +
                '</tr>';
        }).join('');

        var html = '<!DOCTYPE html><html lang="ja"><head>' +
            '<meta charset="utf-8">' +
            '<title>JLPT Master — Saved Words</title>' +
            '<link rel="preconnect" href="https://fonts.googleapis.com">' +
            '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">' +
            '<style>' +
            'body{font-family:"Noto Sans JP",sans-serif;padding:32px;color:#1a1a1a;background:#fff}' +
            'h1{font-size:1.3rem;font-weight:700;margin:0 0 4px}' +
            '.meta{color:#666;font-size:.85rem;margin-bottom:24px}' +
            'table{width:100%;border-collapse:collapse;font-size:.9rem}' +
            'th{background:#f3f4f6;text-align:left;padding:9px 12px;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:2px solid #e5e7eb}' +
            'td{padding:8px 12px;border-bottom:1px solid #f0f0f0;vertical-align:top}' +
            'tr:nth-child(even) td{background:#fafafa}' +
            '.jp{font-size:1.15rem}' +
            '.tag{display:inline-block;padding:1px 7px;border-radius:4px;background:#e8f4fd;color:#1a6fa8;font-size:.75rem;font-weight:700}' +
            '@media print{body{padding:0}@page{margin:20mm}}' +
            '</style></head><body>' +
            '<h1>JLPT Master — Saved Words</h1>' +
            '<div class="meta">' + savedWords.length + ' word' + (savedWords.length !== 1 ? 's' : '') + ' &nbsp;&middot;&nbsp; Exported ' + new Date().toLocaleDateString() + '</div>' +
            '<table><thead><tr>' +
            '<th>#</th><th>Word</th><th>Reading</th><th>JLPT</th><th>Meaning</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>' +
            '<script>window.onload=function(){window.print();}<\/script>' +
            '</body></html>';

        var win = window.open('', '_blank');
        if (win) {
            win.document.write(html);
            win.document.close();
        }
    }

    function importSavedWords(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (evt) {
            try {
                var imported = JSON.parse(evt.target.result);
                if (Array.isArray(imported)) {
                    setSavedWords(function (prev) {
                        var merged = prev.slice();
                        for (var i = 0; i < imported.length; i++) {
                            var exists = merged.some(function (w) { return w.word === imported[i].word; });
                            if (!exists) merged.push(imported[i]);
                        }
                        return merged;
                    });
                }
            } catch (err) {
                alert('Invalid file format. Please select a valid JSON file.');
            }
        };
        reader.readAsText(file);
    }

    // Tab configuration — grouped into categories
    var tabs = [
        { header: 'Study', id: 'header_study' },
        { id: 'dict', label: '📖', full: 'Dictionary' },
        { id: 'kanji', label: '✍️', full: 'Kanji' },
        { id: 'kana', label: 'あ', full: 'Hiragana & Katakana' },
        { id: 'grammar', label: '📐', full: 'Grammar' },
        { header: 'Tests', id: 'header_tests' },
        { id: 'grammarquiz', label: '📝', full: 'Grammar Test' },
        { id: 'quiz', label: '🎯', full: 'Vocab Test' },
        { id: 'pdfexam', label: '📄', full: 'PDF Exam' },
        { id: 'mockexam', label: '🎓', full: 'Mock Exam' },
        { header: 'Practice', id: 'header_practice' },
        { id: 'flash', label: '🃏', full: 'Flashcards' },
        { id: 'writing', label: '🖌️', full: 'Kanji Writing Practice' },
        { id: 'conj', label: '🔄', full: 'Conjugation' },
        { id: 'multi', label: '⚔️', full: 'Multiplayer' },
        { header: 'Track', id: 'header_track' },
        { id: 'dash', label: '📊', full: 'Dashboard' },
        { id: 'leader', label: '🏆', full: 'Leaderboard' },
        { id: 'saved', label: '⭐', full: 'Saved' },
        { id: 'reviews', label: '💬', full: 'Reviews' },
        { id: 'custom', label: '✏️', full: 'Add' },
    ];

    // Render navigation tab buttons
    var tabBtns = tabs.map(function (tabItem) {
        if (tabItem.header) {
            return <div key={tabItem.id} className='sidebar-nav-header'>{t(tabItem.header, appLang)}</div>;
        }
        var hasBadge = tabItem.id === 'flash' && srsDueCount > 0;
        var badge = hasBadge
            ? <span className='nav-tab__badge'>{srsDueCount > 99 ? '99+' : srsDueCount}</span>
            : null;

        return <button key={tabItem.id} className={'nav-tab' + (tab === tabItem.id ? ' nav-tab--active' : '')} onClick={e => {
  if (didDrag.current) return;
  switchTab(tabItem.id);
  if (window.innerWidth <= 800) {
    setIsSidebarExpanded(false);
  }
}} title={t(tabItem.full, appLang)} data-tooltip={t(tabItem.full, appLang)}><span className='nav-tab__icon'>{navIcon(tabItem.id) || tabItem.label}</span><span className='nav-tab__text'>{t(tabItem.full, appLang)}</span>{badge}</button>;
    });

    // Conditionally render the active tab's component
    var activeTab = null;
    if (tab === 'dict') activeTab = <DictionaryTab savedWords={savedWords} toggleSavedWord={toggleSavedWord} appLang={appLang} />;
    if (tab === 'kanji') activeTab = <KanjiTab savedWords={savedWords} toggleSavedWord={toggleSavedWord} appLang={appLang} />;
    if (tab === 'flash') activeTab = <FlashcardTab savedWords={savedWords} toggleSavedWord={toggleSavedWord} autoPronounce={autoPronounce} appLang={appLang} showFurigana={showFurigana} />;
    if (tab === 'kana') activeTab = <KanaTab appLang={appLang} />;
    if (tab === 'writing') activeTab = <KanjiWritingTab appLang={appLang} savedWords={savedWords} />;
    if (tab === 'conj') activeTab = <ConjugationTab appLang={appLang} />;
    if (tab === 'grammar') activeTab = <GrammarTab appLang={appLang} />;
    if (tab === 'dash') activeTab = <DashboardTab setTab={switchTab} appLang={appLang} />;
    if (tab === 'leader') activeTab = <LeaderboardTab appLang={appLang} onSync={cloudSyncNow} />;
    if (tab === 'saved') activeTab = <SavedTab savedWords={savedWords} toggleSavedWord={toggleSavedWord} onExport={exportSavedWords} onExportPDF={exportSavedWordsPDF} onImport={importSavedWords} onSyncSaved={syncSavedWordsNow} appLang={appLang} />;
    if (tab === 'quiz') activeTab = <QuizTab questions={allQuestions} savedWords={savedWords} toggleSavedWord={toggleSavedWord} autoPronounce={autoPronounce} showFurigana={showFurigana} appLang={appLang} />;
    if (tab === 'grammarquiz') activeTab = <GrammarQuizTab questions={GRAMMAR_DATA} showFurigana={showFurigana} appLang={appLang} />;
    if (tab === 'pdfexam') activeTab = <PDFExamTab appLang={appLang} />;
    if (tab === 'mockexam') activeTab = <MockExamTab appLang={appLang} />;
    if (tab === 'multi') activeTab = <MultiplayerTab questions={allQuestions} appLang={appLang} />;
    if (tab === 'reviews') activeTab = <ReviewsTab appLang={appLang} />;
    if (tab === 'privacy') activeTab = <PrivacyTab appLang={appLang} />;

    if (tab === 'custom') activeTab = <CustomTab onAdd={addQuestion} customQuestions={customQs} onDelete={deleteQuestion} />;

    // Daily Word
    var dailyWord = DAILY_WORD.get();

    var fadeClass = '';
    if (navScrollState.canScrollLeft && navScrollState.canScrollRight) fadeClass = 'nav-container--fade-both';
    else if (navScrollState.canScrollLeft) fadeClass = 'nav-container--fade-left';
    else if (navScrollState.canScrollRight) fadeClass = 'nav-container--fade-right';

    // Mobile bottom nav — primary 4 tabs + More button
    var BOTTOM_PRIMARY = ['dict', 'flash', 'quiz', 'dash'];
    var BOTTOM_NAV_ITEMS = [
        { id: 'dict',  label: '📖', short: 'Dict' },
        { id: 'flash', label: '🃏', short: 'Cards' },
        { id: 'quiz',  label: '🎯', short: 'Quiz' },
        { id: 'dash',  label: '📊', short: 'Track' },
        { id: 'more',  label: '⋯',  short: 'More' },
    ];

    var moreTabs = tabs.filter(function (t) {
        return !t.header && BOTTOM_PRIMARY.indexOf(t.id) === -1;
    });

    // Which slot the sliding "Dynamic Island" blob sits under. -1 means the
    // current tab isn't one of the bottom items (a hidden/More tab) and the
    // sheet is closed, so the blob hides instead of pointing at the wrong slot.
    var bottomActiveIdx = moreSheetOpen ? (BOTTOM_NAV_ITEMS.length - 1) : -1;
    if (!moreSheetOpen) {
        for (var bi = 0; bi < BOTTOM_NAV_ITEMS.length; bi++) {
            if (BOTTOM_NAV_ITEMS[bi].id === tab) { bottomActiveIdx = bi; break; }
        }
    }

    var bottomNav = <nav className={'bottom-nav' + (bottomActiveIdx < 0 ? ' bottom-nav--noblob' : '')} aria-label='Navigation' style={{
  '--nav-active': bottomActiveIdx < 0 ? 0 : bottomActiveIdx,
  '--nav-count': BOTTOM_NAV_ITEMS.length
}}><span className='bottom-nav__blob' aria-hidden={true} />{BOTTOM_NAV_ITEMS.map(function (item) {
    var isMore = item.id === 'more';
    var isActive = isMore ? moreSheetOpen : tab === item.id;
    var showBadge = item.id === 'flash' && srsDueCount > 0;
    return <button key={item.id} className={'bottom-nav__item' + (isActive ? ' bottom-nav__item--active' : '')} onClick={() => {
      if (isMore) {
        setMoreSheetOpen(function (prev) {
          return !prev;
        });
      } else {
        setMoreSheetOpen(false);
        switchTab(item.id);
      }
    }} aria-label={item.short}><span className='bottom-nav__icon'>{navIcon(item.id, 20) || item.label}{showBadge ? <span className='bottom-nav__badge'>{srsDueCount > 9 ? '9+' : srsDueCount}</span> : null}</span><span className='bottom-nav__label'>{item.short}</span></button>;
  })}</nav>;

    var moreSheetBackdrop = <div className={'more-sheet-backdrop' + (moreSheetOpen ? ' more-sheet-backdrop--open' : '')} onClick={() => {
  setMoreSheetOpen(false);
}} />;

    // The "More" tabs live INSIDE the island capsule. When open, the capsule
    // grows to reveal this grid (one morphing element), then shrinks back —
    // the authentic Dynamic Island behavior, not a separate sheet.
    var moreExpand = <div className='island-expand' ref={islandExpandRef} aria-hidden={!moreSheetOpen}><div className='more-sheet__grid'>{moreTabs.map(function (tabItem) {
      return <button key={tabItem.id} className={'more-sheet__item' + (tab === tabItem.id ? ' more-sheet__item--active' : '')} onClick={() => {
        switchTab(tabItem.id);
        setMoreSheetOpen(false);
      }}><span className='more-sheet__icon'>{navIcon(tabItem.id, 22) || tabItem.label}</span><span className='more-sheet__label'>{t(tabItem.full, appLang)}</span></button>;
    })}</div></div>;

    // Title shown in the page header for the active tab
    var activeTabMeta = { full: 'JLPT Master' };
    for (var ti = 0; ti < tabs.length; ti++) {
        if (tabs[ti].id === tab) { activeTabMeta = tabs[ti]; break; }
    }
    if (tab === 'privacy') activeTabMeta = { full: 'Privacy Policy' };

    // --- Render the App Shell ---
    return <div className='app-wrapper'> // PWA install banner (browser-only; hidden in the native app).
  <InstallPrompt />{
  // Backdrop closes the expanded island on outside tap.
  moreSheetBackdrop} // The island dock: the expandable More grid sits above the persistent
  // pill row, all in one capsule that grows/shrinks as a single element.
  <div className={'island-dock' + (moreSheetOpen ? ' island-dock--open' : '')}>{moreExpand}{bottomNav}</div> // Sidebar Navigation
  <aside className={'sidebar' + (!isSidebarExpanded ? ' sidebar--collapsed' : '')}><div className='sidebar-header'><div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: 0
      }}><div className='sidebar-title'>JLPT Master</div>{currentStreak > 0 ? <div className='sidebar-streak'>{'🔥 '}{currentStreak}{' day streak'}</div> : null}</div><button className='sidebar-toggle-btn desktop-only' onClick={() => {
        setIsSidebarExpanded(!isSidebarExpanded);
      }} title={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'} style={{
        flexShrink: 0
      }}><svg width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><polyline points='11 4 5 8 11 12' /></svg></button></div><nav className='sidebar-nav'>{tabBtns}</nav></aside> // Main Content Area
  <main className='app-main' ref={mainRef}> // Slim contextual page header: page title left, controls right.
    <header className='page-header'><div className='page-header__heading' style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>{tabHistory.length > 0 ? <button className='page-header__back' onClick={goBack} title={t('Back', appLang)} aria-label={t('Back', appLang)}><svg width={18} height={18} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round'><path d='m15 18-6-6 6-6' /></svg></button> : null}<div style={{
          minWidth: 0
        }}> // Clicking the title scrolls the current tab back to the top.
          <h1 className='page-header__title' onClick={scrollToTop} style={{
            cursor: 'pointer'
          }} title={t('Scroll to top', appLang)}>{t(activeTabMeta.full, appLang)}</h1><p className='page-header__sub'>{'JLPT Master \u00b7 ' + JLPT_VOCAB.length + ' words' + (currentStreak > 0 ? ' \u00b7 ' + currentStreak + ' day streak' : '')}</p></div></div><div className='app-controls-bar__actions page-header__actions'><button className={'ctrl-btn' + (showFurigana ? ' ctrl-btn--active' : '')} onClick={() => {
          setShowFurigana(!showFurigana);
        }} title={'Furigana ' + (showFurigana ? 'ON' : 'OFF')}>あ</button><button className={'ctrl-btn' + (autoPronounce ? ' ctrl-btn--active' : '')} onClick={() => {
          setAutoPronounce(!autoPronounce);
        }} title={'Auto-Pronounce ' + (autoPronounce ? 'ON' : 'OFF')}>{autoPronounce ? '\uD83D\uDD0A' : '\uD83D\uDD07'}</button><LanguageSelector value={appLang} onChange={newLang => {
          setAppLang(newLang);
        }} /><ThemeToggle isLight={isLightMode} onToggle={toggleTheme} /><HeaderLoginWidget /></div></header> // Active tab content with transition
    <div className={'tab-content ' + tabAnim}>{activeTab}</div> // Footer: brand close + legal links
    <footer className='app-footer'><span className='app-footer__copy'>{'\u00a9 ' + new Date().getFullYear() + ' JLPT Master'}</span><nav className='app-footer__links' aria-label='Legal'><button className='app-footer__link' onClick={() => {
          switchTab('privacy');
        }}>Privacy Policy</button><span className='app-footer__dot'>·</span><button className='app-footer__link' onClick={() => {
          switchTab('privacy');
        }}>Terms of Use</button></nav><span className='app-footer__jp' lang='ja'>日本語能力試験対策</span></footer></main></div>;
}

/* =================================================================
   RENDER — Mount the React app to the DOM
   Uses React 18's createRoot API for concurrent features.
   The #root div is defined in index.html.
   ================================================================= */
/* -----------------------------------------------------------------
   ErrorBoundary — catches render errors so a single broken component
   shows a recoverable message instead of a blank white screen.
   ----------------------------------------------------------------- */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error: error };
    }
    componentDidCatch(error, info) {
        console.error('App crashed:', error, info);
    }
    render() {
        if (this.state.error) {
            return <div style={{
  padding: '40px',
  textAlign: 'center',
  color: 'var(--text-primary, #fff)'
}}><h2>⚠️ Something went wrong</h2><p style={{
    opacity: 0.7,
    margin: '12px 0 20px'
  }}>{String(this.state.error && this.state.error.message || this.state.error)}</p><button className='btn btn--primary' onClick={() => {
    window.location.reload();
  }} style={{
    padding: '10px 24px',
    borderRadius: '12px',
    cursor: 'pointer'
  }}>Reload App</button></div>;
        }
        return this.props.children;
    }
}


export { App, ErrorBoundary };
