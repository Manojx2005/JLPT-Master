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

/* =================================================================
   JLPT Master — Root App component, ErrorBoundary, and mount logic
   Part of the app, split from the original app.js for readability.
   Uses React 18 via CDN (React.createElement, no JSX/build step).
   All components share the global scope and load in order (see index.html).
   ================================================================= */


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

    // Persist custom questions so they survive page reloads
    useEffect(function () {
        try { localStorage.setItem('jlpt_custom_questions', JSON.stringify(customQs)); } catch (e) {}
    }, [customQs]);

    var _isLightMode = useState(function () {
        return localStorage.getItem('jlpt_theme') === 'light';
    });
    var isLightMode = _isLightMode[0], setIsLightMode = _isLightMode[1];

    var _savedWords = useState(function () {
        return loadJSON('jlpt_saved', []);
    });
    var savedWords = _savedWords[0], setSavedWords = _savedWords[1];

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
        localStorage.setItem('jlpt_saved', JSON.stringify(savedWords));
    }, [savedWords]);

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
            createElement('span', { className: 'nav-tab__icon' }, tabItem.label),
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
    if (tab === 'leader') activeTab = createElement(LeaderboardTab, { appLang: appLang });
    if (tab === 'saved') activeTab = createElement(SavedTab, {
        savedWords: savedWords,
        toggleSavedWord: toggleSavedWord,
        onExport: exportSavedWords,
        onImport: importSavedWords,
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
                    item.label,
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
                    createElement('span', { className: 'more-sheet__icon' }, tabItem.label),
                    createElement('span', { className: 'more-sheet__label' }, t(tabItem.full, appLang))
                );
            })
        )
    );

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
            // Header with controls
            createElement('header', { className: 'app-header' },
                createElement('div', { className: 'app-controls-bar' },
                    currentStreak > 0
                        ? createElement('div', { className: 'desktop-only' },
                            createElement('span', { className: 'app-controls-bar__streak-badge' },
                                '🔥 ' + currentStreak + ' day streak'))
                        : null,
                    createElement('div', { className: 'app-controls-bar__actions' },
                        createElement('button', {
                            className: 'ctrl-btn' + (showFurigana ? ' ctrl-btn--active' : ''),
                            onClick: function () { setShowFurigana(!showFurigana); },
                            title: 'Furigana ' + (showFurigana ? 'ON' : 'OFF')
                        }, 'あ'),
                        createElement('button', {
                            className: 'ctrl-btn',
                            onClick: function () { setAutoPronounce(!autoPronounce); },
                            title: 'Auto-Pronounce ' + (autoPronounce ? 'ON' : 'OFF')
                        }, autoPronounce ? '🔊' : '🔇'),
                        createElement(LanguageSelector, {
                            value: appLang,
                            onChange: function (newLang) { setAppLang(newLang); }
                        }),
                        createElement(ThemeToggle, { isLight: isLightMode, onToggle: toggleTheme }),
                        createElement(HeaderLoginWidget, null)
                    )
                ),
                createElement('div', { className: 'desktop-only', style: { paddingBottom: '8px' } },
                    createElement('h1', { className: 'app-header__title', style: { margin: '0' } }, 'JLPT Master'),
                    createElement('p', { className: 'app-header__sub', style: { margin: '0' } }, 'Your Premium Japanese Study Companion \u2022 ' + JLPT_VOCAB.length + ' Words')
                )
            ),
            // Active tab content with transition
            createElement('div', { className: 'tab-content ' + tabAnim }, activeTab)
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
