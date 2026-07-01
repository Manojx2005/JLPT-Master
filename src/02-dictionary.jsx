import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AudioButton, MOCK_DICT, SaveButton, fetchKanjiSvg, getVocabMeaning, sanitizeHTML, searchDictionary, searchKanji, searchMockDict, t, translateText, translateToEnglishQuery } from './01-core.jsx';
import { installDict, getInstalledInfo, getExamples } from './dict-local.jsx';
import { HandwritingInput } from './10-handwriting.jsx';
import { CUSTOM_DICT, SEARCH_HISTORY, DAILY_WORD } from './features.js';

/* =================================================================
   JLPT Master — Dictionary & Saved words
   Part of the app, split from the original app.js for readability.
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
        return <div className='kanji-breakdown loading'><div className='spinner-small' />{' Loading Kanji...'}</div>;
    }

    var els = kanjiData.map(function(k, idx) {
        var details = [];
        if (k.data) {
            if (k.data.meanings && k.data.meanings.length) details.push(<div key='m' className='k-meaning'>{k.data.meanings.join(', ')}</div>);
            if (k.data.kun_readings && k.data.kun_readings.length) details.push(<div key='kun' className='k-kun'>{'Kun: ' + k.data.kun_readings.join(', ')}</div>);
            if (k.data.on_readings && k.data.on_readings.length) details.push(<div key='on' className='k-on'>{'On: ' + k.data.on_readings.join(', ')}</div>);
            if (k.data.jlpt) details.push(<div key='jlpt' className='k-jlpt'>{'JLPT N' + k.data.jlpt}</div>);
        }
        
        return <div key={idx} className='kanji-card'>{k.svg ? <div className='k-svg' dangerouslySetInnerHTML={{
    __html: sanitizeHTML(k.svg)
  }} /> : <div className='k-char'>{k.kanji}</div>}<div className='k-details'>{details}</div></div>;
    });

    return <div className='kanji-breakdown'><h4 className='kanji-breakdown-title'>Kanji Breakdown</h4><div className='kanji-list'>{els}</div></div>;
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

    var _showDraw = useState(false);
    var showDraw = _showDraw[0], setShowDraw = _showDraw[1]; // Handwriting panel visibility

    // Offline full-dictionary install state. 'checking' until we know whether
    // the user has already installed it; then 'not-installed' | 'installing' |
    // 'ready' | 'error'. Nothing is downloaded unless the user opts in.
    var _dictState = useState('checking');
    var dictState = _dictState[0], setDictState = _dictState[1];
    var _dictProgress = useState(0);     // 0..1 during install
    var dictProgress = _dictProgress[0], setDictProgress = _dictProgress[1];
    var _dictCount = useState(0);        // installed entry count
    var dictCount = _dictCount[0], setDictCount = _dictCount[1];

    // On mount: read install status (no network) and subscribe to progress.
    useEffect(function () {
        var alive = true;
        getInstalledInfo().then(function (info) {
            if (!alive) return;
            if (info.installed) { setDictState('ready'); setDictCount(info.count); }
            else setDictState('not-installed');
        });
        function onProgress(e) {
            if (!alive || !e.detail) return;
            var d = e.detail;
            if (d.status === 'installing') {
                setDictState('installing');
                setDictProgress(d.total > 0 ? d.loaded / d.total : 0);
            } else if (d.status === 'ready') {
                setDictState('ready');
                setDictProgress(1);
                if (d.total > 0) setDictCount(d.total);
            } else if (d.status === 'error') {
                setDictState('error');
            }
        }
        window.addEventListener('jlpt-dict-progress', onProgress);
        return function () { alive = false; window.removeEventListener('jlpt-dict-progress', onProgress); };
    }, []);

    // User opted in to the full offline dictionary — start the ~20 MB download.
    var handleDownloadDict = function () {
        setDictState('installing');
        setDictProgress(0);
        installDict().catch(function () { setDictState('error'); });
    };

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
                var apiResults = await searchDictionary(apiQuery);
                // If the translated query found nothing, retry with the user's
                // original term across all sources. Jotoba/Jisho handle
                // Japanese, romaji, and English directly, so this recovers
                // words the translation step mangled.
                if ((!apiResults || apiResults.length === 0) && apiQuery !== q) {
                    apiResults = await searchDictionary(q);
                }
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
                        setSearchSource(filteredApi[0] && filteredApi[0].source === 'local' ? 'local' : 'jisho');
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
            } else if ((res.source === 'jisho' || res.source === 'local') && props.appLang !== 'en') {
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
                return <div key={i} className='dict-result__meaning-item'><span className='dict-result__meaning-num'>{i + 1 + '.'}</span><span>{m}</span></div>;
            }).filter(Boolean);

            // Show "...and X more meanings" if collapsed and there are more
            var moreCount = finalMeanings.length - 2;
            if (!isExpanded && moreCount > 0) {
                meaningEls.push(
                    <div key='more' className='dict-result__more-meanings'>{'+ ' + moreCount + ' more meaning' + (moreCount > 1 ? 's' : '')}</div>
                );
            }

            // Render part-of-speech tags (e.g., "Noun", "Ichidan verb")
            var tagEls = (res.tags || []).map(function (t, i) {
                return <span key={i} className='dict-result__tag'>{t}</span>;
            });

            // Other forms section
            var otherFormsEl = null;
            if (isExpanded && res.otherForms && res.otherForms.length > 0) {
                var formEls = res.otherForms.map(function (f, i) {
                    return <span key={i} className='dict-result__other-form'>{f.word + (f.reading && f.word !== f.reading ? ' 【' + f.reading + '】' : '')}</span>;
                });
                otherFormsEl = <div className='dict-result__other-forms'><span className='dict-result__label'>Other forms</span><div className='dict-result__forms-list'>{formEls}</div></div>;
            }

            // Render nuance/context if available (offline data)
            var nuanceEl = null;
            if (isExpanded && res.nuance) {
                nuanceEl = <div className='dict-result__nuance'><span className='dict-result__nuance-label'>💡 Context</span><span>{res.nuance}</span></div>;
            }

            // Lazy-load an example sentence on expand for results that don't
            // already carry one (e.g. online Jisho results). Uses the offline
            // examples store; a no-op when the offline data isn't installed.
            if (isExpanded && !res.example && !res._exampleTried) {
                res._exampleTried = true;
                getExamples(res.word).then(function (list) {
                    if (list && list.length) {
                        res.example = list[0].jp;
                        res.exampleEn = list[0].en;
                        setResults(function (prev) { return prev ? [].concat(prev) : prev; });
                    }
                });
            }

            // Render example sentence if available (offline data)
            var exampleEl = null;
            if (isExpanded && res.example) {
                exampleEl = <div className='dict-result__example'><div className='dict-result__example-jp'>{res.example}</div>{res.exampleEn ? <div className='dict-result__example-en'>{res.exampleEn}</div> : null}</div>;
            }
            
            // Render Kanji Breakdown if expanded
            var kanjiBreakdownEl = isExpanded ? <KanjiBreakdown word={res.word} /> : null;

            // Determine if word is saved
            var isSaved = props.savedWords ? props.savedWords.some(function (w) { return w.word === res.word; }) : false;

            // Build badges row (Common, JLPT)
            var badgeEls = [];
            if (res.isCommon) {
                badgeEls.push(<span key='common' className='dict-result__badge dict-result__badge--common'>★ Common</span>);
            }
            if (res.jlpt) {
                badgeEls.push(<span key='jlpt' className='dict-result__badge dict-result__badge--jlpt'>{res.jlpt}</span>);
            }

            // Compose a single result card
            return <div key={idx} className={'dict-result' + (isExpanded ? ' dict-result--expanded' : ' dict-result--collapsed')} onClick={() => {
  if (!isExpanded) setExpandedIdx(idx);
}} style={!isExpanded ? {
  cursor: 'pointer'
} : {}}>

  <div className='dict-result__header'><div className='dict-result__word-group'><span className={'dict-result__word' + (isExpanded ? '' : ' dict-result__word--compact')}>{res.word}</span>{res.reading && res.reading !== res.word ? <span className='dict-result__reading'>{res.reading}</span> : null}{badgeEls.length > 0 ? <div className='dict-result__badges'>{badgeEls}</div> : null}</div><div className='dict-result__actions'><AudioButton text={res.word} audioUrl={res.audioUrl} />{props.toggleSavedWord ? <SaveButton isSaved={isSaved} onToggle={() => {
        props.toggleSavedWord(res);
      }} /> : null}{isExpanded && results.length > 1 ? <button className='dict-result__collapse-btn' onClick={e => {
        e.stopPropagation();
        setExpandedIdx(-1);
      }} title='Collapse'>▲</button> : null}</div></div>
  <div className='dict-result__meanings'>{meaningEls}</div>{
  // Tags (shown when expanded)
  isExpanded && tagEls.length > 0 ? <div className='dict-result__tags-row'>{tagEls}</div> : null}{
  // Other forms
  otherFormsEl}{
  // Nuance (offline)
  nuanceEl}{
  // Example (offline)
  exampleEl}</div>;
        });

        // Result count header
        var sourceLabel = searchSource === 'jisho'
            ? t('Results from online dictionaries', props.appLang)
            : searchSource === 'local'
                ? t('Results from offline dictionary', props.appLang)
                : searchSource === 'mixed'
                    ? t('Results from Local & online dictionaries', props.appLang)
                    : t('Results from offline dictionary', props.appLang) + ' (' + MOCK_DICT.length + ')';

        resultEls = <div className='dict-results-container'><div className='dict-results__header'><span className='dict-results__count'>{results.length + ' result' + (results.length > 1 ? 's' : '') + ' found'}</span><span className='dict-results__source'>{sourceLabel}</span></div><div className='dict-results__list'>{cards}</div></div>;
    }

    // Error display (e.g., "Word not found")
    var errorEl = null;
    if (error) {
        errorEl = <div className='dict-result dict-result--error'><div className='dict-error__icon'>🔍</div><p className='dict-error__text'>{error}</p><p className='dict-error__hint'>Try searching in Japanese (hiragana, katakana, or kanji) or English.</p></div>;
    }

    // Loading skeleton
    var loadingEl = null;
    if (loading) {
        loadingEl = <div className='dict-loading'><div className='dict-loading__spinner' /><span className='dict-loading__text'>Searching dictionaries…</span></div>;
    }

    // --- Daily Word ---
    var dailyWord = DAILY_WORD.get();
    var dailyWordEl = null;
    if (dailyWord && !results && !loading) {
        dailyWordEl = <div className='daily-word-card'><div className='daily-word-card__header'><span className='daily-word-card__label'>{t('Word of the Day', props.appLang)}</span><AudioButton text={dailyWord.word} /></div><div className='daily-word-card__word'>{dailyWord.word}</div>{dailyWord.reading ? <div className='daily-word-card__reading'>{dailyWord.reading}</div> : null}<div className='daily-word-card__meaning'>{getVocabMeaning(dailyWord, props.appLang)}</div>{dailyWord.level ? <span className='dict-result__badge dict-result__badge--jlpt'>{dailyWord.level}</span> : null}</div>;
    }

    // --- Search History ---
    var historyEls = null;
    var history = SEARCH_HISTORY.get();
    if (history.length > 0 && !results && !loading) {
        var chips = history.slice(0, 10).map(function (h, i) {
            return <button key={i} className='search-history-chip' onClick={() => {
  setQuery(h);
}}>{h}</button>;
        });
        historyEls = <div className='search-history'><div className='search-history__header'><span>🕐 Recent Searches</span><button className='search-history__clear' onClick={() => {
      SEARCH_HISTORY.clear();
    }}>Clear</button></div><div className='search-history__chips'>{chips}</div></div>;
    }

    // Contextual nudge shown under results when the offline dictionary isn't
    // installed: example sentences and instant lookups need it.
    var offlineTipEl = null;
    if (dictState === 'not-installed' && results && results.length > 0) {
        offlineTipEl = <div className='dict-offline-tip' onClick={handleDownloadDict} role='button' tabIndex={0}><span className='dict-offline-tip__icon'>💡</span><span>{t('Tip: download the offline dictionary to see example sentences and search instantly, even without internet.', props.appLang)}</span></div>;
    }

    // --- Offline dictionary banner (opt-in download / progress / installed) ---
    var dictOfflineEl = null;
    if (dictState === 'not-installed') {
        dictOfflineEl = <div className='dict-offline dict-offline--prompt'><div className='dict-offline__info'><span className='dict-offline__icon'>⚡</span><div><div className='dict-offline__title'>{t('Recommended: download the offline dictionary', props.appLang)}</div><div className='dict-offline__sub'>{t('Get the full dictionary (218,000+ words, ~20 MB) for the best experience — instant results with no internet, plus example sentences on every word. Without it, search relies on online services that can be slower or unavailable. WiFi recommended.', props.appLang)}</div></div></div><button className='btn btn--primary dict-offline__btn' onClick={handleDownloadDict}>{'⬇️ ' + t('Download', props.appLang) + ' (20 MB)'}</button></div>;
    } else if (dictState === 'installing') {
        var known = dictProgress > 0;
        var pct = Math.round(dictProgress * 100);
        dictOfflineEl = <div className='dict-offline dict-offline--installing'><div className='dict-offline__title'>{known ? t('Building offline dictionary…', props.appLang) + ' ' + pct + '%' : t('Downloading offline dictionary…', props.appLang)}</div><div className={'dict-offline__bar' + (known ? '' : ' dict-offline__bar--indeterminate')}><div className='dict-offline__fill' style={known ? {
      width: pct + '%'
    } : null} /></div></div>;
    } else if (dictState === 'ready') {
        dictOfflineEl = <div className='dict-offline dict-offline--ready'><span className='dict-offline__icon'>✓</span><span>{t('Offline dictionary ready', props.appLang) + (dictCount ? ' — ' + dictCount.toLocaleString() + ' ' + t('words', props.appLang) : '')}</span></div>;
    } else if (dictState === 'error') {
        dictOfflineEl = <div className='dict-offline dict-offline--error'><span>{t('Couldn’t download the offline dictionary.', props.appLang)}</span><button className='btn btn--outline btn--small' onClick={handleDownloadDict}>{t('Retry', props.appLang)}</button></div>;
    }

    // --- Render the Dictionary Tab ---
    return <div className='glass-card' key='dict'><h2 className='section-title'>{t('Dictionary Search', props.appLang)}</h2><p className='section-desc'>{t('Search any Japanese word in English, kanji, hiragana, or katakana — powered by Jotoba.', props.appLang) + ' ' + MOCK_DICT.length + ' ' + t('words available offline.', props.appLang)}</p>
  <div className='input-row'><input id='dict-search-input' className='input-field' type='text' placeholder='e.g. water, 猫, たべる, 経済, love, カタカナ...' value={query} onChange={e => {
      setQuery(e.target.value);
    }} onKeyDown={handleKey} />{
    // One-tap clear: wipes the typed word and any results, then refocuses
    // the field. Only shown when there's something to clear.
    query ? <button className='btn btn--outline dict-clear-btn' title='Clear' aria-label='Clear search' onClick={() => {
      setQuery('');
      setResults(null);
      var el = document.getElementById('dict-search-input');
      if (el) el.focus();
    }}>✕</button> : null}<button className='btn btn--outline' title='Draw a kanji to search' onClick={() => {
      setShowDraw(!showDraw);
    }}>✍️</button><button id='dict-search-btn' className='btn btn--primary' onClick={doSearch} disabled={loading}>{loading ? 'Searching\u2026' : 'Search'}</button></div>{showDraw ? <HandwritingInput onSelect={char => {
    setQuery(function (q) {
      return q + char;
    });
  }} onClose={() => {
    setShowDraw(false);
  }} /> : null}{dictOfflineEl}{
  // Offline dictionary: download prompt / progress / installed
  historyEls}{
  // Search history chips
  loadingEl}{
  // Loading indicator
  dailyWordEl}{
  // Daily word card
  resultEls}{offlineTipEl}{
  // Search results (or null)
  errorEl // Error message (or null)
  }</div>;
}

/* -----------------------------------------------------------------
   SavedTab — Displays all saved words with import/export
   ----------------------------------------------------------------- */
function SavedTab(props) {
    var words = props.savedWords || [];
    var _render = useState(0);
    var render = _render[0], setRender = _render[1];

    var _syncState = useState('idle'); // 'idle' | 'syncing' | 'done' | 'error' | 'not-logged-in'
    var syncState = _syncState[0], setSyncState = _syncState[1];

    function handleSyncSaved() {
        if (!props.onSyncSaved || syncState === 'syncing') return;
        setSyncState('syncing');
        Promise.resolve(props.onSyncSaved()).then(function (status) {
            setSyncState(status === 'ok' ? 'done' : status === 'not-logged-in' ? 'not-logged-in' : 'error');
            setTimeout(function () { setSyncState('idle'); }, 3000);
        });
    }

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

        return <div key={idx} className='dict-result' style={{
  marginBottom: '16px'
}}><div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px'
  }}><div className='dict-result__word' style={{
      marginBottom: 0
    }}>{w.word}</div><div><AudioButton text={w.word} /><SaveButton isSaved={true} onToggle={() => {
        props.toggleSavedWord(w);
      }} /></div></div>{w.reading ? <div className='dict-result__row'><span className='dict-result__label'>Reading</span><span>{w.reading}</span></div> : null}{w.level || w.jlpt ? <div className='dict-result__row'><span className='dict-result__label'>JLPT</span><span className='dict-result__tag'>{w.level || w.jlpt}</span></div> : null}<div className='dict-result__row' style={{
    marginTop: 12
  }}><span className='dict-result__label'>Meaning</span><span>{getVocabMeaning(w, props.appLang)}</span></div></div>;
    });

    if (words.length === 0) {
        listEls = <div className='dict-result' style={{
  textAlign: 'center',
  padding: '40px 20px'
}}><p style={{
    fontSize: '1.2rem',
    color: 'var(--text-secondary)'
  }}>You havent saved any words yet!</p><p style={{
    marginTop: '8px',
    color: 'var(--text-muted)'
  }}>Search for words in the Dictionary or Kanji tab and click the star icon to save them.</p></div>;
    }

    // Import file input (hidden)
    var fileInputRef = React.useRef(null);

    return <div className='glass-card' key='saved'><h2 className='section-title'>{t('Saved Words', props.appLang)}</h2><p className='section-desc'>{'Review your starred vocabulary. ' + words.length + ' word' + (words.length !== 1 ? 's' : '') + ' saved.'}</p>{
  // Import/Export toolbar
  words.length > 0 || props.onImport || props.onSyncSaved ? <div className='saved-toolbar'>{props.onSyncSaved ? <button className='btn btn--small btn--primary' onClick={handleSyncSaved} disabled={syncState === 'syncing'} title='Download saved words from your account on other devices'>{syncState === 'syncing' ? '↻ Syncing…' : syncState === 'done' ? '✓ Synced' : syncState === 'not-logged-in' ? '⚠ Sign in first' : syncState === 'error' ? '⚠ Retry' : '☁ Sync Saved Words'}</button> : null}{words.length > 0 && props.onExport ? <button className='btn btn--small btn--outline' onClick={props.onExport}>📥 Export JSON</button> : null}{words.length > 0 && props.onExportPDF ? <button className='btn btn--small btn--outline' onClick={props.onExportPDF}>📄 Export PDF</button> : null}{props.onImport ? <button className='btn btn--small btn--outline' onClick={() => {
      if (fileInputRef.current) fileInputRef.current.click();
    }}>📤 Import JSON</button> : null}{props.onImport ? <input ref={fileInputRef} type='file' accept='.json' style={{
      display: 'none'
    }} onChange={props.onImport} /> : null}</div> : null}<div style={{
    marginTop: '24px'
  }}>{listEls}</div></div>;
}



export { KanjiBreakdown, DictionaryTab, SavedTab };
