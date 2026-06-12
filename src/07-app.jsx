import React from 'react';
const { useState, useEffect, useRef, useCallback, useMemo } = React;
const createElement = React.createElement;
import { MOCK_DICT, ThemeToggle, _localDataMissing, loadJSON, t } from './01-core.jsx';
import { DictionaryTab, SavedTab } from './02-dictionary.jsx';
import { CustomTab, QuizTab } from './03-quiz.jsx';
import { ConjugationTab, DashboardTab, FlashcardTab, GrammarTab, KanjiTab, LeaderboardTab } from './04-study.jsx';
import { GrammarQuizTab, HeaderLoginWidget, LanguageSelector, MockExamTab, PDFExamTab } from './05-exams.jsx';
import { MultiplayerTab } from './06-multiplayer.jsx';
import { ReviewsTab } from './08-reviews.jsx';
import { PrivacyTab } from './09-legal.jsx';

/* =================================================================
   JLPT Master — Root App component, ErrorBoundary, and mount logic
   Part of the app, split from the original app.js for readability.
   Uses React 18 via CDN (React.createElement, no JSX/build step).
   All components share the global scope and load in order (see index.html).
   ================================================================= */


/* Navigation icons: inline monochrome stroke SVGs (Lucide-style).
   Replaces emoji icons for consistent weight and theming via currentColor. */
var NAV_ICON_PATHS = {
    dict: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
    kanji: ['m5 8 6 6', 'm4 14 6-6 2-3', 'M2 5h12', 'M7 2h1', 'm22 22-5-10-5 10', 'M14 18h6'],
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
    return createElement('svg', {
        width: size || 18, height: size || 18, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' }
    }, paths.map(function (d, i) {
        return createElement('path', { key: i, d: d });
    }));
}

function App() {
    // --- State ---
    var _tab = useState('dict');
    var tab = _tab[0], setTab = _tab[1];              // Active tab

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
    }, [isLightMode]);

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

    function switchTab(newTab) {
        var oldIdx = TAB_ORDER.indexOf(tab);
        var newIdx = TAB_ORDER.indexOf(newTab);
        var goingRight = newIdx > oldIdx;
        setTabAnim(goingRight ? 'tab-exit' : 'tab-exit tab-exit--right');
        setTimeout(function () {
            setTab(newTab);
            setTabAnim(goingRight ? 'tab-enter' : 'tab-enter tab-enter--left');
            setTimeout(function () { setTabAnim(''); }, 300);
        }, 150);
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
    var TAB_ORDER = ['dict', 'kanji', 'grammar', 'grammarquiz', 'quiz', 'pdfexam', 'mockexam', 'flash', 'conj', 'multi', 'dash', 'leader', 'saved', 'reviews', 'custom'];

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
        { id: 'grammar', label: '📐', full: 'Grammar' },
        { header: 'Tests', id: 'header_tests' },
        { id: 'grammarquiz', label: '📝', full: 'Grammar Test' },
        { id: 'quiz', label: '🎯', full: 'Vocab Test' },
        { id: 'pdfexam', label: '📄', full: 'PDF Exam' },
        { id: 'mockexam', label: '🎓', full: 'Mock Exam' },
        { header: 'Practice', id: 'header_practice' },
        { id: 'flash', label: '🃏', full: 'Flashcards' },
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
            return createElement('div', { key: tabItem.id, className: 'sidebar-nav-header' }, t(tabItem.header, appLang));
        }
        var hasBadge = tabItem.id === 'flash' && srsDueCount > 0;
        var badge = hasBadge
            ? createElement('span', { className: 'nav-tab__badge' }, srsDueCount > 99 ? '99+' : srsDueCount)
            : null;

        return createElement('button', {
            key: tabItem.id,
            className: 'nav-tab' + (tab === tabItem.id ? ' nav-tab--active' : ''),
            onClick: function (e) {
                if (didDrag.current) return;
                switchTab(tabItem.id);
                if (window.innerWidth <= 800) {
                    setIsSidebarExpanded(false);
                }
            },
            title: t(tabItem.full, appLang),
            'data-tooltip': t(tabItem.full, appLang),
        },
            createElement('span', { className: 'nav-tab__icon' }, navIcon(tabItem.id) || tabItem.label),
            createElement('span', { className: 'nav-tab__text' }, t(tabItem.full, appLang)),
            badge
        );
    });

    // Conditionally render the active tab's component
    var activeTab = null;
    if (tab === 'dict') activeTab = createElement(DictionaryTab, {
        savedWords: savedWords,
        toggleSavedWord: toggleSavedWord,
        appLang: appLang
    });
    if (tab === 'kanji') activeTab = createElement(KanjiTab, {
        savedWords: savedWords,
        toggleSavedWord: toggleSavedWord,
        appLang: appLang
    });
    if (tab === 'flash') activeTab = createElement(FlashcardTab, {
        savedWords: savedWords,
        toggleSavedWord: toggleSavedWord,
        autoPronounce: autoPronounce,
        appLang: appLang,
        showFurigana: showFurigana
    });
    if (tab === 'conj') activeTab = createElement(ConjugationTab, { appLang: appLang });
    if (tab === 'grammar') activeTab = createElement(GrammarTab, { appLang: appLang });
    if (tab === 'dash') activeTab = createElement(DashboardTab, { setTab: switchTab, appLang: appLang });
    if (tab === 'leader') activeTab = createElement(LeaderboardTab, { appLang: appLang, onSync: cloudSyncNow });
    if (tab === 'saved') activeTab = createElement(SavedTab, {
        savedWords: savedWords,
        toggleSavedWord: toggleSavedWord,
        onExport: exportSavedWords,
        onExportPDF: exportSavedWordsPDF,
        onImport: importSavedWords,
        onSyncSaved: syncSavedWordsNow,
        appLang: appLang
    });
    if (tab === 'quiz') activeTab = createElement(QuizTab, {
        questions: allQuestions,
        savedWords: savedWords,
        toggleSavedWord: toggleSavedWord,
        autoPronounce: autoPronounce,
        showFurigana: showFurigana,
        appLang: appLang
    });
    if (tab === 'grammarquiz') activeTab = createElement(GrammarQuizTab, {
        questions: GRAMMAR_DATA,
        showFurigana: showFurigana,
        appLang: appLang
    });
    if (tab === 'pdfexam') activeTab = createElement(PDFExamTab, { appLang: appLang });
    if (tab === 'mockexam') activeTab = createElement(MockExamTab, { appLang: appLang });
    if (tab === 'multi') activeTab = createElement(MultiplayerTab, { questions: allQuestions, appLang: appLang });
    if (tab === 'reviews') activeTab = createElement(ReviewsTab, { appLang: appLang });
    if (tab === 'privacy') activeTab = createElement(PrivacyTab, { appLang: appLang });

    if (tab === 'custom') activeTab = createElement(CustomTab, {
        onAdd: addQuestion,
        customQuestions: customQs,
        onDelete: deleteQuestion,
    });

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

    var bottomNav = createElement('nav', { className: 'bottom-nav', 'aria-label': 'Navigation' },
        BOTTOM_NAV_ITEMS.map(function (item) {
            var isMore = item.id === 'more';
            var isActive = isMore ? moreSheetOpen : tab === item.id;
            var showBadge = item.id === 'flash' && srsDueCount > 0;
            return createElement('button', {
                key: item.id,
                className: 'bottom-nav__item' + (isActive ? ' bottom-nav__item--active' : ''),
                onClick: function () {
                    if (isMore) {
                        setMoreSheetOpen(function (prev) { return !prev; });
                    } else {
                        setMoreSheetOpen(false);
                        switchTab(item.id);
                    }
                },
                'aria-label': item.short,
            },
                createElement('span', { className: 'bottom-nav__icon' },
                    navIcon(item.id, 20) || item.label,
                    showBadge ? createElement('span', { className: 'bottom-nav__badge' },
                        srsDueCount > 9 ? '9+' : srsDueCount) : null
                ),
                createElement('span', { className: 'bottom-nav__label' }, item.short)
            );
        })
    );

    var moreSheetBackdrop = createElement('div', {
        className: 'more-sheet-backdrop' + (moreSheetOpen ? ' more-sheet-backdrop--open' : ''),
        onClick: function () { setMoreSheetOpen(false); }
    });

    var moreSheet = createElement('div', {
        className: 'more-sheet' + (moreSheetOpen ? ' more-sheet--open' : ''),
        'aria-hidden': !moreSheetOpen
    },
        createElement('div', { className: 'more-sheet__handle' }),
        createElement('div', { className: 'more-sheet__grid' },
            moreTabs.map(function (tabItem) {
                return createElement('button', {
                    key: tabItem.id,
                    className: 'more-sheet__item' + (tab === tabItem.id ? ' more-sheet__item--active' : ''),
                    onClick: function () {
                        switchTab(tabItem.id);
                        setMoreSheetOpen(false);
                    }
                },
                    createElement('span', { className: 'more-sheet__icon' }, navIcon(tabItem.id, 22) || tabItem.label),
                    createElement('span', { className: 'more-sheet__label' }, t(tabItem.full, appLang))
                );
            })
        )
    );

    // Title shown in the page header for the active tab
    var activeTabMeta = { full: 'JLPT Master' };
    for (var ti = 0; ti < tabs.length; ti++) {
        if (tabs[ti].id === tab) { activeTabMeta = tabs[ti]; break; }
    }
    if (tab === 'privacy') activeTabMeta = { full: 'Privacy Policy' };

    // --- Render the App Shell ---
    return createElement('div', { className: 'app-wrapper' },
        // Mobile bottom navigation (replaces mobile-header + sidebar-overlay on mobile)
        bottomNav,
        moreSheetBackdrop,
        moreSheet,
        // Sidebar Navigation
        createElement('aside', { className: 'sidebar' + (!isSidebarExpanded ? ' sidebar--collapsed' : '') },
            createElement('div', { className: 'sidebar-header' },
                createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
                    createElement('div', { className: 'sidebar-title' }, 'JLPT Master'),
                    currentStreak > 0
                        ? createElement('div', { className: 'sidebar-streak' },
                            '🔥 ', currentStreak, ' day streak')
                        : null
                ),
                createElement('button', {
                    className: 'sidebar-toggle-btn desktop-only',
                    onClick: function () { setIsSidebarExpanded(!isSidebarExpanded); },
                    title: isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar',
                    style: { flexShrink: 0 }
                },
                    createElement('svg', {
                        width: '16', height: '16', viewBox: '0 0 16 16',
                        fill: 'none', stroke: 'currentColor', strokeWidth: '2',
                        strokeLinecap: 'round', strokeLinejoin: 'round'
                    },
                        createElement('polyline', { points: '11 4 5 8 11 12' })
                    )
                )
            ),
            createElement('nav', { className: 'sidebar-nav' }, tabBtns)
        ),
        // Main Content Area
        createElement('main', { className: 'app-main' },
            // Slim contextual page header: page title left, controls right.
            createElement('header', { className: 'page-header' },
                createElement('div', { className: 'page-header__heading' },
                    createElement('h1', { className: 'page-header__title' },
                        t(activeTabMeta.full, appLang)),
                    createElement('p', { className: 'page-header__sub' },
                        'JLPT Master \u00b7 ' + JLPT_VOCAB.length + ' words' +
                        (currentStreak > 0 ? ' \u00b7 ' + currentStreak + ' day streak' : ''))
                ),
                createElement('div', { className: 'app-controls-bar__actions page-header__actions' },
                    createElement('button', {
                        className: 'ctrl-btn' + (showFurigana ? ' ctrl-btn--active' : ''),
                        onClick: function () { setShowFurigana(!showFurigana); },
                        title: 'Furigana ' + (showFurigana ? 'ON' : 'OFF')
                    }, '\u3042'),
                    createElement('button', {
                        className: 'ctrl-btn' + (autoPronounce ? ' ctrl-btn--active' : ''),
                        onClick: function () { setAutoPronounce(!autoPronounce); },
                        title: 'Auto-Pronounce ' + (autoPronounce ? 'ON' : 'OFF')
                    }, autoPronounce ? '\uD83D\uDD0A' : '\uD83D\uDD07'),
                    createElement(LanguageSelector, {
                        value: appLang,
                        onChange: function (newLang) { setAppLang(newLang); }
                    }),
                    createElement(ThemeToggle, { isLight: isLightMode, onToggle: toggleTheme }),
                    createElement(HeaderLoginWidget, null)
                )
            ),
            // Active tab content with transition
            createElement('div', { className: 'tab-content ' + tabAnim }, activeTab),
            // Footer: brand close + legal links
            createElement('footer', { className: 'app-footer' },
                createElement('span', { className: 'app-footer__copy' },
                    '\u00a9 ' + new Date().getFullYear() + ' JLPT Master'),
                createElement('nav', { className: 'app-footer__links', 'aria-label': 'Legal' },
                    createElement('button', {
                        className: 'app-footer__link',
                        onClick: function () { switchTab('privacy'); }
                    }, 'Privacy Policy'),
                    createElement('span', { className: 'app-footer__dot' }, '\u00b7'),
                    createElement('button', {
                        className: 'app-footer__link',
                        onClick: function () { switchTab('privacy'); }
                    }, 'Terms of Use')
                ),
                createElement('span', { className: 'app-footer__jp', lang: 'ja' }, '\u65e5\u672c\u8a9e\u80fd\u529b\u8a66\u9a13\u5bfe\u7b56')
            )
        )
    );
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
            return createElement('div', { style: { padding: '40px', textAlign: 'center', color: 'var(--text-primary, #fff)' } },
                createElement('h2', null, '\u26A0\uFE0F Something went wrong'),
                createElement('p', { style: { opacity: 0.7, margin: '12px 0 20px' } }, String(this.state.error && this.state.error.message || this.state.error)),
                createElement('button', {
                    className: 'btn btn--primary',
                    onClick: function () { window.location.reload(); },
                    style: { padding: '10px 24px', borderRadius: '12px', cursor: 'pointer' }
                }, 'Reload App')
            );
        }
        return this.props.children;
    }
}


export { App, ErrorBoundary };
