import React from 'react';
const { useState, useEffect, useRef, useCallback, useMemo } = React;
const createElement = React.createElement;
import { AudioButton, MOCK_DICT, SaveButton, fetchKanjiSvg, getVocabMeaning, sanitizeHTML, searchJisho, searchKanji, searchMockDict, t, translateText, translateToEnglishQuery } from './01-core.jsx';

/* =================================================================
   JLPT Master — Dictionary & Saved words
   Part of the app, split from the original app.js for readability.
   Uses React 18 via CDN (React.createElement, no JSX/build step).
   All components share the global scope and load in order (see index.html).
   ================================================================= */

/* -----------------------------------------------------------------
   KanjiBreakdown Component
   ----------------------------------------------------------------- */
function KanjiBreakdown(props) {
    var _kanjiData = useState([]);
    var kanjiData = _kanjiData[0], setKanjiData = _kanjiData[1];
    var _loading = useState(false);
    var loading = _loading[0], setLoading = _loading[1];

    useEffect(function () {
        var kanjis = props.word.match(/[一-龯]/g);
        if (!kanjis) return;
        
        var fetchAll = async function() {
            setLoading(true);
            // Remove duplicates
            var uniqueKanjis = kanjis.filter(function(item, pos) {
                return kanjis.indexOf(item) === pos;
            });
            // Fetch every kanji in parallel, and run the data + SVG
            // requests for each kanji concurrently rather than sequentially.
            var promises = uniqueKanjis.map(async function (k) {
                var svgPromise = fetchKanjiSvg(k);
                var data = await searchKanji(k);
                var svg = await svgPromise;
                if (svg || data) {
                    return { kanji: k, svg: svg, data: data };
                }
                return null;
            });
            var results = (await Promise.all(promises)).filter(function (r) { return r !== null; });
            setKanjiData(results);
            setLoading(false);
        };
        fetchAll();
    }, [props.word]);

    if (!kanjiData.length && !loading) return null;

    if (loading) {
        return createElement('div', { className: 'kanji-breakdown loading' }, 
            createElement('div', { className: 'spinner-small' }), ' Loading Kanji...'
        );
    }

    var els = kanjiData.map(function(k, idx) {
        var details = [];
        if (k.data) {
            if (k.data.meanings && k.data.meanings.length) details.push(createElement('div', { key: 'm', className: 'k-meaning' }, k.data.meanings.join(', ')));
            if (k.data.kun_readings && k.data.kun_readings.length) details.push(createElement('div', { key: 'kun', className: 'k-kun' }, 'Kun: ' + k.data.kun_readings.join(', ')));
            if (k.data.on_readings && k.data.on_readings.length) details.push(createElement('div', { key: 'on', className: 'k-on' }, 'On: ' + k.data.on_readings.join(', ')));
            if (k.data.jlpt) details.push(createElement('div', { key: 'jlpt', className: 'k-jlpt' }, 'JLPT N' + k.data.jlpt));
        }
        
        return createElement('div', { key: idx, className: 'kanji-card' },
            k.svg ? createElement('div', { className: 'k-svg', dangerouslySetInnerHTML: { __html: sanitizeHTML(k.svg) } }) : createElement('div', { className: 'k-char' }, k.kanji),
            createElement('div', { className: 'k-details' }, details)
        );
    });

    return createElement('div', { className: 'kanji-breakdown' },
        createElement('h4', { className: 'kanji-breakdown-title' }, 'Kanji Breakdown'),
        createElement('div', { className: 'kanji-list' }, els)
    );
}

function DictionaryTab(props) {
    // --- State ---
    var _query = useState('');
    var query = _query[0], setQuery = _query[1];       // Current search input value

    var _results = useState(null);
    var results = _results[0], setResults = _results[1]; // Array of search results (or null)

    var _loading = useState(false);
    var loading = _loading[0], setLoading = _loading[1]; // Loading spinner state

    var _error = useState('');
    var error = _error[0], setError = _error[1];         // Error message (empty = no error)

    var _expandedIdx = useState(0);
    var expandedIdx = _expandedIdx[0], setExpandedIdx = _expandedIdx[1]; // Which result card is expanded

    var _searchSource = useState('');
    var searchSource = _searchSource[0], setSearchSource = _searchSource[1]; // 'jisho' or 'offline'

    /**
     * Performs the dictionary search.
     * 1. Tries the online Jisho API via CORS proxies
     * 2. Falls back to the local MOCK_DICT if API fails
     * 3. Shows an error if no results found in either source
     */
    var doSearch = useCallback(async function () {
        var q = query.trim();
        if (!q) return;

        setLoading(true);
        setError('');
        setResults(null);
        setExpandedIdx(0);

        // Save to search history
        SEARCH_HISTORY.add(q);

        var convertedMock = [];
        var mockResults = searchMockDict(q);
        if (mockResults.length > 0) {
            convertedMock = mockResults.map(function (item) {
                return {
                    word: item.kanji,
                    reading: item.kana,
                    meanings: [item.english],
                    originalItem: item,
                    tags: [],
                    jlpt: item.level || '',
                    source: 'offline',
                    nuance: item.nuance || '',
                    example: item.example || '',
                    exampleEn: item.exampleEn || '',
                    otherForms: [],
                    isCommon: false,
                };
            });
            setResults(convertedMock);
            setSearchSource(navigator.onLine ? 'mixed' : 'offline');
            setLoading(false);
        }

        if (navigator.onLine) {
            try {
                var apiQuery = await translateToEnglishQuery(q);
                var apiResults = await searchJisho(apiQuery);
                if (apiResults && apiResults.length > 0) {
                    var filteredApi = apiResults.filter(function(apiItem) {
                        return !convertedMock.some(function(mItem) {
                            return mItem.word === apiItem.word || mItem.reading === apiItem.word;
                        });
                    });
                    
                    if (filteredApi.length > 0 && typeof CUSTOM_DICT !== 'undefined') {
                        filteredApi.forEach(function(item) {
                            CUSTOM_DICT.save({
                                kanji: item.word,
                                kana: item.reading || '',
                                english: item.meanings ? item.meanings.join('; ') : '',
                                level: 'Custom',
                                nuance: item.tags ? item.tags.join(', ') : ''
                            });
                        });
                    }
                    
                    if (convertedMock.length > 0) {
                        setResults(convertedMock.concat(filteredApi));
                    } else {
                        setResults(filteredApi);
                        setSearchSource('jisho');
                        setLoading(false);
                    }
                } else if (convertedMock.length === 0) {
                    setError('Word not found. Try a different search term or check your spelling.');
                    setLoading(false);
                }
            } catch (err) {
                console.warn("Jisho API failed.", err);
                if (convertedMock.length === 0) {
                    setError('Word not found. Try a different search term or check your spelling.');
                    setLoading(false);
                }
            }
        } else if (convertedMock.length === 0) {
            setError('Word not found. Try a different search term or check your spelling.');
            setLoading(false);
        }
    }, [query]);

    // Trigger search on Enter key press
    var handleKey = function (e) { if (e.key === 'Enter') doSearch(); };

    // --- Build Result Cards ---
    var resultEls = null;
    if (results && results.length > 0) {
        var cards = results.map(function (res, idx) {
            var isExpanded = expandedIdx === idx;

            var finalMeanings = res.meanings;
            var needsTranslation = false;
            var sourceToTranslate = res.meanings;

            if (res.source === 'offline' && res.originalItem) {
                var meaningStr = getVocabMeaning(res.originalItem, props.appLang);
                finalMeanings = [meaningStr];
                
                if (props.appLang !== 'en' && (meaningStr === res.originalItem.english || meaningStr === res.originalItem.correct)) {
                    needsTranslation = true;
                    sourceToTranslate = [meaningStr];
                }
            } else if (res.source === 'jisho' && props.appLang !== 'en') {
                needsTranslation = true;
                sourceToTranslate = res.meanings;
            }

            if (needsTranslation) {
                var allCached = true;
                finalMeanings = sourceToTranslate.map(function(m) {
                    var ck = props.appLang + '___' + m;
                    if (window.TRANSLATION_CACHE && window.TRANSLATION_CACHE[ck]) {
                        return window.TRANSLATION_CACHE[ck];
                    }
                    allCached = false;
                    return m; 
                });
                
                if (!allCached && !res._isTranslating) {
                    res._isTranslating = true;
                    Promise.all(sourceToTranslate.map(function(m) {
                        return translateText(m, props.appLang);
                    })).then(function() {
                        res._isTranslating = false;
                        setResults([].concat(results));
                    });
                }
            }

            // Render numbered meaning list (e.g., "1. to eat", "2. to consume")
            var meaningEls = finalMeanings.map(function (m, i) {
                // In collapsed mode, show only first 2 meanings
                if (!isExpanded && i >= 2) return null;
                return createElement('div', { key: i, className: 'dict-result__meaning-item' },
                    createElement('span', { className: 'dict-result__meaning-num' }, (i + 1) + '.'),
                    createElement('span', null, m)
                );
            }).filter(Boolean);

            // Show "...and X more meanings" if collapsed and there are more
            var moreCount = finalMeanings.length - 2;
            if (!isExpanded && moreCount > 0) {
                meaningEls.push(
                    createElement('div', { key: 'more', className: 'dict-result__more-meanings' },
                        '+ ' + moreCount + ' more meaning' + (moreCount > 1 ? 's' : '')
                    )
                );
            }

            // Render part-of-speech tags (e.g., "Noun", "Ichidan verb")
            var tagEls = (res.tags || []).map(function (t, i) {
                return createElement('span', { key: i, className: 'dict-result__tag' }, t);
            });

            // Other forms section
            var otherFormsEl = null;
            if (isExpanded && res.otherForms && res.otherForms.length > 0) {
                var formEls = res.otherForms.map(function (f, i) {
                    return createElement('span', { key: i, className: 'dict-result__other-form' },
                        f.word + (f.reading && f.word !== f.reading ? ' 【' + f.reading + '】' : '')
                    );
                });
                otherFormsEl = createElement('div', { className: 'dict-result__other-forms' },
                    createElement('span', { className: 'dict-result__label' }, 'Other forms'),
                    createElement('div', { className: 'dict-result__forms-list' }, formEls)
                );
            }

            // Render nuance/context if available (offline data)
            var nuanceEl = null;
            if (isExpanded && res.nuance) {
                nuanceEl = createElement('div', { className: 'dict-result__nuance' },
                    createElement('span', { className: 'dict-result__nuance-label' }, '💡 Context'),
                    createElement('span', null, res.nuance)
                );
            }

            // Render example sentence if available (offline data)
            var exampleEl = null;
            if (isExpanded && res.example) {
                exampleEl = createElement('div', { className: 'dict-result__example' },
                    createElement('div', { className: 'dict-result__example-jp' }, res.example),
                    res.exampleEn ? createElement('div', { className: 'dict-result__example-en' }, res.exampleEn) : null
                );
            }
            
            // Render Kanji Breakdown if expanded
            var kanjiBreakdownEl = isExpanded ? createElement(KanjiBreakdown, { word: res.word }) : null;

            // Determine if word is saved
            var isSaved = props.savedWords ? props.savedWords.some(function (w) { return w.word === res.word; }) : false;

            // Build badges row (Common, JLPT)
            var badgeEls = [];
            if (res.isCommon) {
                badgeEls.push(createElement('span', { key: 'common', className: 'dict-result__badge dict-result__badge--common' }, '★ Common'));
            }
            if (res.jlpt) {
                badgeEls.push(createElement('span', { key: 'jlpt', className: 'dict-result__badge dict-result__badge--jlpt' }, res.jlpt));
            }

            // Compose a single result card
            return createElement('div', {
                key: idx,
                className: 'dict-result' + (isExpanded ? ' dict-result--expanded' : ' dict-result--collapsed'),
                onClick: function () { if (!isExpanded) setExpandedIdx(idx); },
                style: !isExpanded ? { cursor: 'pointer' } : {},
            },
                // Top row: word + reading + actions
                createElement('div', { className: 'dict-result__header' },
                    createElement('div', { className: 'dict-result__word-group' },
                        createElement('span', { className: 'dict-result__word' + (isExpanded ? '' : ' dict-result__word--compact') }, res.word),
                        res.reading && res.reading !== res.word ? createElement('span', { className: 'dict-result__reading' }, res.reading) : null,
                        badgeEls.length > 0 ? createElement('div', { className: 'dict-result__badges' }, badgeEls) : null
                    ),
                    createElement('div', { className: 'dict-result__actions' },
                        createElement(AudioButton, { text: res.word, audioUrl: res.audioUrl }),
                        props.toggleSavedWord ? createElement(SaveButton, { isSaved: isSaved, onToggle: function () { props.toggleSavedWord(res); } }) : null,
                        isExpanded && results.length > 1 ? createElement('button', {
                            className: 'dict-result__collapse-btn',
                            onClick: function (e) { e.stopPropagation(); setExpandedIdx(-1); },
                            title: 'Collapse',
                        }, '▲') : null
                    )
                ),
                // Meanings
                createElement('div', { className: 'dict-result__meanings' }, meaningEls),
                // Tags (shown when expanded)
                isExpanded && tagEls.length > 0 ? createElement('div', { className: 'dict-result__tags-row' }, tagEls) : null,
                // Other forms
                otherFormsEl,
                // Nuance (offline)
                nuanceEl,
                // Example (offline)
                exampleEl
            );
        });

        // Result count header
        var sourceLabel = searchSource === 'jisho'
            ? 'Results from Jisho.org'
            : searchSource === 'mixed'
                ? 'Results from Local & Jisho.org'
                : 'Results from offline dictionary (' + MOCK_DICT.length + ' words)';

        resultEls = createElement('div', { className: 'dict-results-container' },
            createElement('div', { className: 'dict-results__header' },
                createElement('span', { className: 'dict-results__count' }, results.length + ' result' + (results.length > 1 ? 's' : '') + ' found'),
                createElement('span', { className: 'dict-results__source' }, sourceLabel)
            ),
            createElement('div', { className: 'dict-results__list' }, cards)
        );
    }

    // Error display (e.g., "Word not found")
    var errorEl = null;
    if (error) {
        errorEl = createElement('div', { className: 'dict-result dict-result--error' },
            createElement('div', { className: 'dict-error__icon' }, '🔍'),
            createElement('p', { className: 'dict-error__text' }, error),
            createElement('p', { className: 'dict-error__hint' },
                'Try searching in Japanese (hiragana, katakana, or kanji) or English.'
            )
        );
    }

    // Loading skeleton
    var loadingEl = null;
    if (loading) {
        loadingEl = createElement('div', { className: 'dict-loading' },
            createElement('div', { className: 'dict-loading__spinner' }),
            createElement('span', { className: 'dict-loading__text' }, 'Searching dictionaries…')
        );
    }

    // --- Daily Word ---
    var dailyWord = DAILY_WORD.get();
    var dailyWordEl = null;
    if (dailyWord && !results && !loading) {
        dailyWordEl = createElement('div', { className: 'daily-word-card' },
            createElement('div', { className: 'daily-word-card__header' },
                createElement('span', { className: 'daily-word-card__label' }, t('Word of the Day', props.appLang)),
                createElement(AudioButton, { text: dailyWord.word })
            ),
            createElement('div', { className: 'daily-word-card__word' }, dailyWord.word),
            dailyWord.reading ? createElement('div', { className: 'daily-word-card__reading' }, dailyWord.reading) : null,
            createElement('div', { className: 'daily-word-card__meaning' }, getVocabMeaning(dailyWord, props.appLang)),
            dailyWord.level ? createElement('span', { className: 'dict-result__badge dict-result__badge--jlpt' }, dailyWord.level) : null
        );
    }

    // --- Search History ---
    var historyEls = null;
    var history = SEARCH_HISTORY.get();
    if (history.length > 0 && !results && !loading) {
        var chips = history.slice(0, 10).map(function (h, i) {
            return createElement('button', {
                key: i,
                className: 'search-history-chip',
                onClick: function () { setQuery(h); }
            }, h);
        });
        historyEls = createElement('div', { className: 'search-history' },
            createElement('div', { className: 'search-history__header' },
                createElement('span', null, '🕐 Recent Searches'),
                createElement('button', {
                    className: 'search-history__clear',
                    onClick: function () { SEARCH_HISTORY.clear(); }
                }, 'Clear')
            ),
            createElement('div', { className: 'search-history__chips' }, chips)
        );
    }

    // --- Render the Dictionary Tab ---
    return createElement('div', { className: 'glass-card', key: 'dict' },
        createElement('h2', { className: 'section-title' }, t('Dictionary Search', props.appLang)),
        createElement('p', { className: 'section-desc' },
            'Search any Japanese word in English, Kanji, Hiragana, or Katakana. Powered by Jisho.org with ' + MOCK_DICT.length + ' words available offline.'
        ),
        // Search input row (text field + search button)
        createElement('div', { className: 'input-row' },
            createElement('input', {
                id: 'dict-search-input',
                className: 'input-field',
                type: 'text',
                placeholder: 'e.g. water, 猫, たべる, 経済, love, カタカナ...',
                value: query,
                onChange: function (e) { setQuery(e.target.value); },
                onKeyDown: handleKey,
            }),
            createElement('button', {
                id: 'dict-search-btn',
                className: 'btn btn--primary',
                onClick: doSearch,
                disabled: loading,
            }, loading ? 'Searching\u2026' : 'Search')
        ),
        historyEls,  // Search history chips
        loadingEl,   // Loading indicator
        dailyWordEl, // Daily word card
        resultEls,   // Search results (or null)
        errorEl      // Error message (or null)
    );
}

/* -----------------------------------------------------------------
   SavedTab — Displays all saved words with import/export
   ----------------------------------------------------------------- */
function SavedTab(props) {
    var words = props.savedWords || [];
    var _render = useState(0);
    var render = _render[0], setRender = _render[1];

    var listEls = words.map(function (w, idx) {
        if (props.appLang && props.appLang !== 'en') {
            var rawMeanings = (w.meanings && Array.isArray(w.meanings) && w.meanings.length > 0) ? w.meanings : [];
            if (rawMeanings.length === 0 && (w.correct || w.english)) {
                rawMeanings = [w.correct || w.english];
            }
            var needsTranslation = false;
            rawMeanings.forEach(function(m) {
                if (m && window.TRANSLATION_CACHE && !window.TRANSLATION_CACHE[props.appLang + '___' + m]) {
                    needsTranslation = true;
                }
            });
            if (needsTranslation && !w._isTranslating) {
                w._isTranslating = true;
                Promise.all(rawMeanings.map(function(m) { return translateText(m, props.appLang); }))
                    .then(function() { 
                        w._isTranslating = false;
                        setRender(function(r) { return r + 1; }); 
                    });
            }
        }

        return createElement('div', { key: idx, className: 'dict-result', style: { marginBottom: '16px' } },
            createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' } },
                createElement('div', { className: 'dict-result__word', style: { marginBottom: 0 } }, w.word),
                createElement('div', null,
                    createElement(AudioButton, { text: w.word }),
                    createElement(SaveButton, { isSaved: true, onToggle: function () { props.toggleSavedWord(w); } })
                )
            ),
            w.reading ? createElement('div', { className: 'dict-result__row' },
                createElement('span', { className: 'dict-result__label' }, 'Reading'),
                createElement('span', null, w.reading)
            ) : null,
            (w.level || w.jlpt) ? createElement('div', { className: 'dict-result__row' },
                createElement('span', { className: 'dict-result__label' }, 'JLPT'),
                createElement('span', { className: 'dict-result__tag' }, (w.level || w.jlpt))
            ) : null,
            createElement('div', { className: 'dict-result__row', style: { marginTop: 12 } },
                createElement('span', { className: 'dict-result__label' }, 'Meaning'),
                createElement('span', null, getVocabMeaning(w, props.appLang))
            )
        );
    });

    if (words.length === 0) {
        listEls = createElement('div', { className: 'dict-result', style: { textAlign: 'center', padding: '40px 20px' } },
            createElement('p', { style: { fontSize: '1.2rem', color: 'var(--text-secondary)' } }, 'You havent saved any words yet!'),
            createElement('p', { style: { marginTop: '8px', color: 'var(--text-muted)' } }, 'Search for words in the Dictionary or Kanji tab and click the star icon to save them.')
        );
    }

    // Import file input (hidden)
    var fileInputRef = React.useRef(null);

    return createElement('div', { className: 'glass-card', key: 'saved' },
        createElement('h2', { className: 'section-title' }, t('Saved Words', props.appLang)),
        createElement('p', { className: 'section-desc' }, 'Review your starred vocabulary. ' + words.length + ' word' + (words.length !== 1 ? 's' : '') + ' saved.'),

        // Import/Export toolbar
        words.length > 0 || props.onImport ? createElement('div', { className: 'saved-toolbar' },
            words.length > 0 && props.onExport ? createElement('button', {
                className: 'btn btn--small btn--outline',
                onClick: props.onExport
            }, '📥 Export JSON') : null,
            words.length > 0 && props.onExportPDF ? createElement('button', {
                className: 'btn btn--small btn--outline',
                onClick: props.onExportPDF
            }, '📄 Export PDF') : null,
            props.onImport ? createElement('button', {
                className: 'btn btn--small btn--outline',
                onClick: function () { if (fileInputRef.current) fileInputRef.current.click(); }
            }, '📤 Import JSON') : null,
            props.onImport ? createElement('input', {
                ref: fileInputRef,
                type: 'file',
                accept: '.json',
                style: { display: 'none' },
                onChange: props.onImport
            }) : null
        ) : null,

        createElement('div', { style: { marginTop: '24px' } }, listEls)
    );
}



export { KanjiBreakdown, DictionaryTab, SavedTab };
