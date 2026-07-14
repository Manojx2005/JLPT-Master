import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatedCounter, AudioButton, SaveButton, fetchKanjiSvg, getVocabMeaning, playAudio, sanitizeHTML, searchDictionary, searchKanji, searchMockDict, shuffleArray, t, translateToEnglishQuery } from './01-core.jsx';
import { FuriganaText } from './05-exams.jsx';
import { HandwritingInput } from './10-handwriting.jsx';
import { SRS, PROGRESS, CONJUGATION, GRAMMAR_DATA, AUTH, LEADERBOARD_API } from './features.js';

/* =================================================================
   JLPT Master — Study tools (Kanji, Leaderboard, Dashboard, Flashcards, Conjugation, Grammar)
   Part of the app, split from the original app.js for readability.
   All components share the global scope and load in order (see index.html).
   ================================================================= */

/* -----------------------------------------------------------------
   KanjiTab — Dedicated Kanji search interface
   Uses kanjiapi.dev to show stroke count, JLPT level, grade, and readings
   ----------------------------------------------------------------- */
function KanjiTab(props) {
    var _query = useState('');
    var query = _query[0], setQuery = _query[1];

    var _results = useState([]);
    var results = _results[0], setResults = _results[1];

    var _loading = useState(false);
    var loading = _loading[0], setLoading = _loading[1];

    var _error = useState('');
    var error = _error[0], setError = _error[1];

    var _showDraw = useState(false);
    var showDraw = _showDraw[0], setShowDraw = _showDraw[1]; // Handwriting panel visibility

    var _replayKey = useState(0);
    var replayKey = _replayKey[0], setReplayKey = _replayKey[1]; // Bump to restart stroke-order animation on tap

    var KANJI_RE = /[\u4e00-\u9faf\u3400-\u4dbf]/g;

    // Pull every kanji character out of a Japanese word string.
    function extractKanji(str) {
        return (str || '').match(KANJI_RE) || [];
    }

    var doSearch = useCallback(async function () {
        var q = query.trim();
        if (!q) return;

        setLoading(true);
        setError('');
        setResults([]);

        // Extract all Kanji characters using regex
        var kanjiMatches = q.match(KANJI_RE);

        // No kanji typed \u2192 treat the query as a word/meaning in ANY language.
        // Translate it to English (handles Vietnamese, Burmese, etc.), find
        // matching Japanese words in the dictionary, then collect their kanji.
        if (!kanjiMatches || kanjiMatches.length === 0) {
            var enQuery = await translateToEnglishQuery(q);
            var dictResults = await searchDictionary(enQuery);
            // Retry online with the original term if translation found nothing.
            if ((!dictResults || dictResults.length === 0) && enQuery !== q) {
                dictResults = await searchDictionary(q);
            }
            if (!dictResults || dictResults.length === 0) {
                dictResults = searchMockDict(enQuery);
            }
            var collected = [];
            (dictResults || []).forEach(function (r) {
                extractKanji(r.word || r.kanji).forEach(function (k) {
                    if (collected.indexOf(k) === -1) collected.push(k);
                });
            });
            kanjiMatches = collected.slice(0, 8); // cap so a phrase doesn't flood results
            if (kanjiMatches.length === 0) {
                setError(t('No kanji found for that word. Try a Japanese word or a kanji character.', props.appLang));
                setLoading(false);
                return;
            }
        }

        // Remove duplicates
        var uniqueKanji = [];
        for (var i = 0; i < kanjiMatches.length; i++) {
            if (uniqueKanji.indexOf(kanjiMatches[i]) === -1) {
                uniqueKanji.push(kanjiMatches[i]);
            }
        }

        var promises = uniqueKanji.map(async function (k) {
            // Kick off both requests concurrently instead of waiting for
            // the kanji data before starting the stroke-order SVG fetch.
            var svgPromise = fetchKanjiSvg(k);
            var data = await searchKanji(k);
            if (!data) return null;
            data.svg = await svgPromise;
            return data;
        });
        var dataArray = await Promise.all(promises);

        var validData = dataArray.filter(function (d) { return d !== null; });

        if (validData.length > 0) {
            setResults(validData);
        } else {
            setError('No detailed Kanji information found for the entered characters.');
        }
        setLoading(false);
    }, [query]);

    var handleKey = function (e) { if (e.key === 'Enter') doSearch(); };

    var resultEls = results.map(function (res, idx) {
        // Meanings
        var meaningsEl = res.meanings.map(function (m, i) {
            return <span key={i} className='kanji-meaning-tag'>{m}</span>;
        });

        // Onyomi
        var onEl = null;
        if (res.on_readings && res.on_readings.length > 0) {
            onEl = <div className='dict-result__row'><span className='dict-result__label'>Onyomi</span><span>{res.on_readings.join(', ')}</span></div>;
        }

        // Kunyomi
        var kunEl = null;
        if (res.kun_readings && res.kun_readings.length > 0) {
            kunEl = <div className='dict-result__row'><span className='dict-result__label'>Kunyomi</span><span>{res.kun_readings.join(', ')}</span></div>;
        }

        var jlptEl = null;
        if (res.jlpt !== null) {
            jlptEl = <span className='result-meta-tag'>{'JLPT N' + res.jlpt}</span>;
        }

        var gradeEl = null;
        if (res.grade !== null) {
            gradeEl = <span className='result-meta-tag'>{'Grade ' + res.grade}</span>;
        }

        var strokesEl = <span className='result-meta-tag'>{res.stroke_count + ' strokes'}</span>;

        // Check if saved
        var isSaved = props.savedWords ? props.savedWords.some(function (w) { return w.word === res.kanji; }) : false;

        return <div key={idx} className='dict-result' style={{
  marginBottom: '16px'
}}><div style={{
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start',
    flexWrap: 'wrap'
  }}>
    <div className='kanji-large-display' style={{
      position: 'relative',
      cursor: 'pointer'
    }} onClick={() => {
      playAudio(res.kanji);
      setReplayKey(function (n) {
        return n + 1;
      });
    }} title={t('Tap to replay', props.appLang)}>{res.svg ? <div key={replayKey} dangerouslySetInnerHTML={{
        __html: sanitizeHTML(res.svg)
      }} className='kanji-svg-container' /> : res.kanji}<div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}><AudioButton text={res.kanji} />{props.toggleSavedWord ? <SaveButton isSaved={isSaved} onToggle={() => {
          props.toggleSavedWord({
            word: res.kanji,
            reading: res.kun_readings && res.kun_readings.length > 0 ? res.kun_readings[0] : res.on_readings && res.on_readings.length > 0 ? res.on_readings[0] : '',
            correct: res.meanings.join(', '),
            level: res.jlpt !== null ? 'N' + res.jlpt : 'None'
          });
        }} /> : null}</div></div>
    <div style={{
      flex: 1,
      minWidth: '200px'
    }}><div style={{
        marginBottom: '16px'
      }}>{meaningsEl}</div>{onEl}{kunEl}<div className='result-panel__meta' style={{
        justifyContent: 'flex-start',
        marginTop: '16px'
      }}>{jlptEl}{gradeEl}{strokesEl}</div></div></div></div>;
    });

    var errorEl = null;
    if (error) {
        errorEl = <div className='dict-result dict-result--error'><p style={{
    color: 'var(--accent-red)'
  }}>{error}</p></div>;
    }

    return <div className='glass-card' key='kanji'><h2 className='section-title'>{t('Kanji Search', props.appLang)}</h2><p className='section-desc'>{t('Enter a kanji, a Japanese word, or a word in your language (e.g. "water") to see details for every kanji involved.', props.appLang)}</p><div className='input-row'><input className='input-field' type='text' placeholder='e.g. 食べる, 水, water, eau...' value={query} onChange={e => {
      setQuery(e.target.value);
    }} onKeyDown={handleKey} /><button className='btn btn--outline' title='Draw a kanji to search' onClick={() => {
      setShowDraw(!showDraw);
    }}>✍️</button><button className='btn btn--primary' onClick={doSearch} disabled={loading}>{loading ? t('Searching\u2026', props.appLang) : t('Search', props.appLang)}</button></div>{showDraw ? <HandwritingInput onSelect={char => {
    setQuery(function (q) {
      return q + char;
    });
  }} onClose={() => {
    setShowDraw(false);
  }} /> : null}{resultEls.length > 0 ? <div>{resultEls}</div> : null}{errorEl}</div>;
}

/* =================================================================
   LEADERBOARDTAB — Global mock leaderboard
   ================================================================= */
function LeaderboardTab(props) {
    var _state = useState({ users: [], loading: true, error: null, myRank: -1 });
    var state = _state[0], setState = _state[1];
    
    var _profile = useState(function() { return typeof LEADERBOARD_API !== 'undefined' ? LEADERBOARD_API.getProfile() : null; });
    var profile = _profile[0], setProfile = _profile[1];

    var _isEditing = useState(false);
    var isEditing = _isEditing[0], setIsEditing = _isEditing[1];

    var _syncState = useState('idle'); // 'idle' | 'syncing' | 'done' | 'error'
    var syncState = _syncState[0], setSyncState = _syncState[1];

    function handleSyncNow() {
        if (!props.onSync || syncState === 'syncing') return;
        setSyncState('syncing');
        Promise.resolve(props.onSync()).then(function (status) {
            setSyncState(status === 'ok' ? 'done' : 'error');
            loadData();
            setTimeout(function () { setSyncState('idle'); }, 2500);
        });
    }

    var _editName = useState(profile ? profile.name : '');
    var editName = _editName[0], setEditName = _editName[1];

    var _editAvatar = useState(profile ? (profile.customPhoto || profile.avatar || '👤') : '👤');
    var editAvatar = _editAvatar[0], setEditAvatar = _editAvatar[1];

    var fileRef = useRef(null);

    var AVATAR_EMOJIS = ['🦊', '🐯', '🐼', '🐻', '🐶', '🐱', '🐰', '🦁', '🐸', '🐵', '🐧', '🦉', '🐲', '🌸', '⛩️', '🍣', '🗻', '🎌', '👻', '👤'];

    // Open the editor, seeding the fields from the current profile.
    function openEditor() {
        var p = LEADERBOARD_API.getProfile();
        setEditName(p.name || '');
        setEditAvatar(p.customPhoto || p.avatar || '👤');
        setIsEditing(true);
    }

    // Read an uploaded image, center-crop to a square and downscale to a
    // tiny data URL so the leaderboard avatar stays small.
    function handleAvatarUpload(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            var img = new Image();
            img.onload = function () {
                var size = 96;
                var canvas = document.createElement('canvas');
                canvas.width = size; canvas.height = size;
                var ctx = canvas.getContext('2d');
                var min = Math.min(img.width, img.height);
                ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
                setEditAvatar(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Revert a signed-in user to their real Google name + photo.
    function handleResetIdentity() {
        if (typeof LEADERBOARD_API.resetIdentity !== 'function') return;
        LEADERBOARD_API.resetIdentity();
        var p = LEADERBOARD_API.getProfile();
        setProfile(p);
        setEditName(p.name || '');
        setEditAvatar(p.customPhoto || p.photoURL || p.avatar || '👤');
        setIsEditing(false);
        loadData();
    }

    function loadData() {
        if (typeof LEADERBOARD_API === 'undefined') return;
        // Always compare against the CURRENT profile id. The state value
        // captured in this closure goes stale after Google sign-in/out,
        // which made "Your Rank" track the old anonymous id.
        var freshProfile = LEADERBOARD_API.getProfile();
        setState({ users: [], loading: true, error: null, myRank: -1 });
        LEADERBOARD_API.fetchLeaderboard().then(function(users) {
            var myRank = -1;
            users.forEach(function(u, idx) {
                u.rank = idx + 1;
                if (freshProfile && u.id === freshProfile.id) {
                    u.isMe = true;
                    myRank = u.rank;
                }
            });
            // If the user isn't in the list yet, add them to the bottom visually
            if (myRank === -1 && freshProfile) {
                var myXp = PROGRESS.getTotalStats().xp || 0;
                var me = { id: freshProfile.id, name: freshProfile.name, avatar: freshProfile.photoURL || freshProfile.avatar, xp: myXp, isMe: true, rank: users.length + 1 };
                users.push(me);
                myRank = me.rank;
            }
            setState({ users: users, loading: false, error: null, myRank: myRank });
        }).catch(function(err) {
            setState({ users: [], loading: false, error: err.message, myRank: -1 });
        });
    }

    useEffect(function() {
        if (typeof LEADERBOARD_API !== 'undefined') {
            // Wait for our own score write to land, then fetch the list —
            // fetching in parallel raced the write and showed stale XP/rank.
            var sync = LEADERBOARD_API.syncScore(PROGRESS.getTotalStats().xp || 0);
            if (sync && typeof sync.then === 'function') {
                sync.then(loadData, loadData);
            } else {
                loadData();
            }
        }

        // Listen for Auth profile updates
        var handleProfileUpdate = function() {
            setProfile(LEADERBOARD_API.getProfile());
            loadData();
        };
        window.addEventListener('profileUpdate', handleProfileUpdate);
        
        // Expose a global dispatch for features.js to call
        window.dispatchProfileUpdate = function() {
            var event = new Event('profileUpdate');
            window.dispatchEvent(event);
        };

        return function() { window.removeEventListener('profileUpdate', handleProfileUpdate); };
    }, []);

    function saveProfile() {
        if (!editName.trim()) return;
        LEADERBOARD_API.updateProfile(editName.trim(), editAvatar);
        setProfile(LEADERBOARD_API.getProfile());
        setIsEditing(false);
        loadData();
    }

    function handleGoogleLogin() {
        if (typeof AUTH !== 'undefined') {
            AUTH.signIn().catch(function(e) { alert("Login failed: " + e.message); });
        }
    }

    function handleGoogleLogout() {
        if (typeof AUTH !== 'undefined') {
            AUTH.signOut();
        }
    }

    function renderAvatar(avatar) {
        // Render real images (Google photo URL or uploaded data URL); emojis as text.
        if (avatar && (avatar.startsWith('http') || avatar.startsWith('data:'))) {
            return <img src={avatar} style={{
  width: '100%',
  height: '100%',
  borderRadius: '50%',
  objectFit: 'cover'
}} />;
        }
        return avatar || '👤';
    }

    var top3 = state.users.slice(0, 3);
    var rest = state.users.slice(3, 100);

    // Profile render helper
    var isGoogleLinked = profile && profile.id && !profile.id.startsWith('user_');
    var effAvatar = profile ? (typeof LEADERBOARD_API.effectiveAvatar === 'function' ? LEADERBOARD_API.effectiveAvatar(profile) : (profile.customPhoto || profile.photoURL || profile.avatar)) : null;
    var profileImg = renderAvatar(effAvatar);
    var hasCustomIdentity = profile && (profile.nameLocked || profile.customPhoto);

    return <div className='glass-card leaderboard-container'><div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px'
  }}><h2 className='section-title' style={{
      margin: 0
    }}>{t('Global Leaderboard', props.appLang)}</h2><button className='btn btn--outline' onClick={loadData} disabled={state.loading}>{state.loading ? '↻ Loading...' : '↻ Refresh'}</button></div>
  <div style={{
    padding: '15px',
    background: 'rgba(0,0,0,0.1)',
    borderRadius: '12px',
    marginBottom: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  }}>{isEditing ? <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      flex: 1,
      width: '100%'
    }}>
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}><div style={{
          width: '56px',
          height: '56px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          background: '#fff',
          borderRadius: '50%',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>{renderAvatar(editAvatar)}</div><input type='text' className='search-input' value={editName} onChange={e => {
          setEditName(e.target.value);
        }} style={{
          flex: 1,
          padding: '10px',
          minWidth: '160px'
        }} placeholder={t('Display name', props.appLang)} maxLength={24} /></div>
      <div><div style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          marginBottom: '6px'
        }}>{t('Choose an avatar', props.appLang)}</div><div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px'
        }}>{AVATAR_EMOJIS.map(function (em) {
            return <button key={em} onClick={() => {
              setEditAvatar(em);
            }} className={'avatar-pick' + (editAvatar === em ? ' avatar-pick--active' : '')}>{em}</button>;
          })}
          <button className='avatar-pick' title={t('Upload photo', props.appLang)} onClick={() => {
            if (fileRef.current) fileRef.current.click();
          }}>📷</button>{
          // Use Google photo (only if signed in and one exists)
          isGoogleLinked && profile.photoURL ? <button className={'avatar-pick' + (editAvatar === profile.photoURL ? ' avatar-pick--active' : '')} title={t('Use Google photo', props.appLang)} onClick={() => {
            setEditAvatar(profile.photoURL);
          }} style={{
            padding: 0,
            overflow: 'hidden'
          }}><img src={profile.photoURL} style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} /></button> : null}</div><input ref={fileRef} type='file' accept='image/*' style={{
          display: 'none'
        }} onChange={handleAvatarUpload} /></div>
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap'
      }}><button className='btn btn--primary' onClick={saveProfile}>{t('Save', props.appLang)}</button><button className='btn btn--outline' onClick={() => {
          setIsEditing(false);
          setEditName(profile.name);
        }}>{t('Cancel', props.appLang)}</button>{isGoogleLinked && hasCustomIdentity ? <button className='btn btn--outline' onClick={handleResetIdentity} title={t('Show your real Google name and photo again', props.appLang)}>{'↺ ' + t('Reset to Google', props.appLang)}</button> : null}</div>{isGoogleLinked ? <div style={{
        fontSize: '0.78rem',
        color: 'var(--text-muted)'
      }}>{t('Your custom name and photo are shown publicly instead of your Google identity.', props.appLang)}</div> : null}</div> : <div style={{
      display: 'flex',
      gap: '15px',
      alignItems: 'center',
      flex: 1,
      flexWrap: 'wrap'
    }}><div style={{
        fontSize: '2.5rem',
        background: '#fff',
        borderRadius: '50%',
        width: '60px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>{profileImg}</div><div style={{
        flex: 1,
        minWidth: '120px'
      }}><div style={{
          fontSize: '1.2rem',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>{profile.name}{isGoogleLinked && <span title='Verified Google Account' style={{
            fontSize: '1rem'
          }}>✅</span>}</div><div style={{
          color: 'var(--primary)',
          fontWeight: 'bold'
        }}>{(PROGRESS.getTotalStats().xp || 0).toLocaleString() + ' XP'}</div></div><div style={{
        display: 'flex',
        gap: '10px',
        marginLeft: 'auto',
        flexWrap: 'wrap'
      }}>{isGoogleLinked && props.onSync ? <button className='btn btn--outline' onClick={handleSyncNow} disabled={syncState === 'syncing'} title='Sync progress and saved words now'>{syncState === 'syncing' ? '↻ Syncing…' : syncState === 'done' ? '✓ Synced' : syncState === 'error' ? '⚠ Retry Sync' : '☁ Sync Now'}</button> : null}<button className='btn btn--outline' onClick={openEditor}>{'✎ ' + t('Edit Profile', props.appLang)}</button>{isGoogleLinked ? <button className='btn btn--outline' onClick={handleGoogleLogout}>{t('Sign Out', props.appLang)}</button> : <button className='btn btn--primary' onClick={handleGoogleLogin} style={{
          background: '#4285F4',
          color: '#fff',
          border: 'none'
        }}>{t('Sign in with Google', props.appLang)}</button>}</div></div>}</div>{state.error ? <div style={{
    color: 'var(--danger)',
    padding: '20px',
    textAlign: 'center'
  }}>{'Error loading leaderboard: ' + state.error}</div> : null}{state.loading && state.users.length === 0 ? <div style={{
    textAlign: 'center',
    padding: '50px',
    fontSize: '1.2rem'
  }}>Loading top players...</div> : null}{state.users.length > 0 && <div className='podium-container'>{top3[1] && <div className='podium-item podium-silver'><div className='podium-avatar'>{renderAvatar(top3[1].avatar)}</div><div className='podium-name'>{top3[1].name}</div><div className='podium-xp'>{top3[1].xp.toLocaleString() + ' XP'}</div><div className='podium-step'><span>2</span></div></div>}{top3[0] && <div className='podium-item podium-gold'><div className='podium-avatar'>{renderAvatar(top3[0].avatar)}</div><div className='podium-name'>{top3[0].name}</div><div className='podium-xp'>{top3[0].xp.toLocaleString() + ' XP'}</div><div className='podium-step'><span>1</span></div></div>}{top3[2] && <div className='podium-item podium-bronze'><div className='podium-avatar'>{renderAvatar(top3[2].avatar)}</div><div className='podium-name'>{top3[2].name}</div><div className='podium-xp'>{top3[2].xp.toLocaleString() + ' XP'}</div><div className='podium-step'><span>3</span></div></div>}</div>}{state.myRank > 3 && <div className='my-rank-banner'><div className='my-rank-info'><span className='my-rank-number'>{'#' + state.myRank}</span><span className='my-rank-text'>{t('Your Rank', props.appLang) || 'Your Rank'}</span></div><div className='my-rank-xp'>{(PROGRESS.getTotalStats().xp || 0).toLocaleString() + ' XP'}</div></div>}{state.users.length > 0 && <div className='leaderboard-list'>{rest.map(function (u) {
      return <div key={u.id} className={'leaderboard-row' + (u.isMe ? ' leaderboard-row--me' : '')}><div className='leaderboard-row__rank'>{u.rank}</div><div className='leaderboard-row__avatar'>{renderAvatar(u.avatar)}</div><div className='leaderboard-row__name'>{u.name + (u.isMe ? ' (You)' : '')}</div><div className='leaderboard-row__xp'>{u.xp.toLocaleString() + ' XP'}</div></div>;
    })}</div>}</div>;
}

/* =================================================================
   DASHBOARDTAB — Progress Dashboard with stats, streaks, charts
   ================================================================= */
function DashboardTab(props) {
    var streak = PROGRESS.getStreak();
    var todayStats = PROGRESS.getTodayStats();
    var totalStats = PROGRESS.getTotalStats();
    var srsStats = SRS.stats();
    var weeklyData = PROGRESS.getWeeklyData();
    var quizHistory = PROGRESS.getQuizHistory(8);
    var rankInfo = PROGRESS.getRank();
    var quests = PROGRESS.getDailyQuests();

    // Weekly chart - find max for scaling
    var maxReviews = 1;
    for (var i = 0; i < weeklyData.length; i++) {
        if (weeklyData[i].reviews > maxReviews) maxReviews = weeklyData[i].reviews;
    }

    var chartBars = weeklyData.map(function (d, i) {
        var height = maxReviews > 0 ? Math.max(4, (d.reviews / maxReviews) * 120) : 4;
        var isToday = i === 6;
        return <div key={i} className='chart-bar-wrapper'><div className='chart-bar-value'>{d.reviews > 0 ? d.reviews : ''}</div><div className={'chart-bar' + (isToday ? ' chart-bar--today' : '')} style={{
    height: height + 'px'
  }} /><div className='chart-bar-label'>{d.label}</div></div>;
    });

    // Quiz history cards
    var quizCards = quizHistory.map(function (q, i) {
        var d = new Date(q.date);
        var dateStr = (d.getMonth() + 1) + '/' + d.getDate();
        return <div key={i} className='quiz-history-card'><div className='quiz-history-card__score'>{q.pct + '%'}</div><div className='quiz-history-card__detail'>{q.score + '/' + q.total + ' · ' + q.level}</div><div className='quiz-history-card__date'>{dateStr}</div></div>;
    });

    // SRS distribution
    var srsTotal = srsStats.newCount + srsStats.learning + srsStats.mature;
    var srsParts = [
        { label: 'New', count: srsStats.newCount, color: 'var(--primary)' },
        { label: 'Learning', count: srsStats.learning, color: 'var(--accent-amber)' },
        { label: 'Mature', count: srsStats.mature, color: 'var(--accent-green)' }
    ];

    var srsBarEls = srsParts.map(function (p, i) {
        var pct = srsTotal > 0 ? (p.count / srsTotal) * 100 : 0;
        return <div key={i} className='srs-bar-segment' style={{
  width: pct + '%',
  background: p.color
}} />;
    });

    var srsLabelEls = srsParts.map(function (p, i) {
        return <div key={i} className='srs-label'><span className='srs-label__dot' style={{
    background: p.color
  }} /><span>{p.label + ': ' + p.count}</span></div>;
    });

    // Rank Progress Bar
    var xpProgress = 100;
    var nextRankLabel = '';
    if (rankInfo.next) {
        var range = rankInfo.next.minXP - rankInfo.current.minXP;
        var progressIntoRank = rankInfo.xp - rankInfo.current.minXP;
        xpProgress = (progressIntoRank / range) * 100;
        nextRankLabel = 'Next: ' + rankInfo.next.name + ' (' + rankInfo.next.minXP + ' XP)';
    } else {
        nextRankLabel = 'Max Rank Achieved!';
    }

    var rankCard = <div className='dash-rank-card'><div className='dash-rank-title'>{rankInfo.current.name}</div><div className='dash-rank-xp'><AnimatedCounter value={rankInfo.xp} />{' XP / ' + (rankInfo.next ? rankInfo.next.minXP : '∞') + ' XP'}</div><div className='xp-bar-container'><div className='xp-bar-fill' style={{
      width: xpProgress + '%'
    }} /></div><div style={{
    fontSize: '0.8rem',
    color: 'var(--text-muted)'
  }}>{nextRankLabel}</div></div>;

    // Daily Quests
    var questCards = quests.map(function (q, i) {
        var targetTab = '';
        if (q.type === 'reviews' || q.id === 'q2') targetTab = 'flash';
        else if (q.type === 'quizzes' || q.type === 'correct' || q.id === 'q1' || q.id === 'q3') targetTab = 'quiz';

        var clickable = targetTab && !q.completed;
        var cls = 'quest-card';
        if (q.completed) cls += ' quest-card--completed';
        if (clickable) cls += ' hover-scale'; // Adding a hover effect class

        var actionBtn = null;
        if (clickable) {
            actionBtn = <button className='btn btn--primary' style={{
  marginLeft: 'auto',
  padding: '0.4rem 1rem',
  fontSize: '0.9rem'
}} onClick={e => {
  e.stopPropagation();
  if (props.setTab) props.setTab(targetTab);
}}>{targetTab === 'saved' ? 'Go to Saved' : targetTab === 'flash' ? 'Go to Flashcards' : 'Go to Quiz'}</button>;
        }

        return <div key={i} className={cls} onClick={() => {
  if (clickable && props.setTab) {
    props.setTab(targetTab);
  }
}} style={clickable ? {
  cursor: 'pointer',
  transition: 'transform 0.2s'
} : {}}><div className='quest-icon'>{q.completed ? '✓' : '🎯'}</div><div className='quest-details'><div className='quest-title'>{q.title}</div><div className='quest-progress'>{Math.min(q.current, q.target) + ' / ' + q.target}</div></div>{actionBtn}</div>;
    });

    var questsSection = <div className='dash-section'><h3 className='dash-section__title'>Daily Quests</h3><div className='daily-quests-grid'>{questCards}</div></div>;

    // AI Insights Section
    var insights = PROGRESS.analyzeWeaknesses();
    var insightsSection = null;
    if (!insights.hasEnoughData) {
        insightsSection = <div className='dash-section insights-section'><h3 className='dash-section__title'>🧠 AI Insights</h3><div className='insights-card insights-card--empty' style={{
    padding: '20px',
    background: 'var(--bg-secondary)',
    borderRadius: '12px',
    textAlign: 'center',
    fontStyle: 'italic',
    color: 'var(--text-muted)'
  }}>Take at least 3 quizzes to unlock personalized study recommendations!</div></div>;
    } else {
        var weaknessCards = insights.weaknesses.map(function(w, i) {
            return <div key={i} className='insight-item' style={{
  background: 'var(--bg-primary)',
  padding: '16px',
  borderRadius: '12px',
  borderLeft: '4px solid ' + (w.pct < 50 ? 'var(--danger)' : 'var(--accent-amber)')
}}><div className='insight-item__header' style={{
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px'
  }}><strong style={{
      fontSize: '1.1rem'
    }}>{w.level + ' ' + w.mode}</strong><span className='insight-item__pct' style={{
      fontWeight: 'bold',
      color: w.pct < 50 ? 'var(--danger)' : 'var(--accent-amber)'
    }}>{w.pct + '% Accuracy'}</span></div><div className='insight-item__desc' style={{
    fontSize: '0.9rem',
    color: 'var(--text-muted)'
  }}>{'You have answered ' + w.totalQuestions + ' questions in this category. Focusing your practice here will maximize your score improvement.'}</div></div>;
        });

        insightsSection = <div className='dash-section insights-section'><h3 className='dash-section__title'>🎯 Target Areas for Improvement</h3><div className='insights-grid' style={{
    display: 'grid',
    gap: '15px'
  }}>{weaknessCards}</div></div>;
    }

    return <div className='glass-card'><h2 className='section-title'>{t('Dashboard', props.appLang)}</h2>{insightsSection}{rankCard}{questsSection}
  <div className='dash-stats-grid'><div className='dash-stat-card dash-stat-card--streak'><div className='dash-stat-card__icon'>{streak > 0 ? '🔥' : '❄️'}</div><div className='dash-stat-card__value'>{streak}</div><div className='dash-stat-card__label'>Day Streak</div></div><div className='dash-stat-card'><div className='dash-stat-card__icon'>📝</div><div className='dash-stat-card__value'>{todayStats.wordsReviewed}</div><div className='dash-stat-card__label'>Reviews Today</div></div><div className='dash-stat-card'><div className='dash-stat-card__icon'>🎯</div><div className='dash-stat-card__value'>{todayStats.quizzesTaken}</div><div className='dash-stat-card__label'>Quizzes Today</div></div><div className='dash-stat-card'><div className='dash-stat-card__icon'>⏰</div><div className='dash-stat-card__value'>{srsStats.dueToday}</div><div className='dash-stat-card__label'>Due for Review</div></div></div>
  <div className='dash-section'><h3 className='dash-section__title'>SRS Progress</h3><div className='srs-bar'>{srsBarEls}</div><div className='srs-labels'>{srsLabelEls}</div></div>
  <div className='dash-section'><h3 className='dash-section__title'>Weekly Activity</h3><div className='weekly-chart'>{chartBars}</div></div>{
  // Quiz History
  quizCards.length > 0 ? <div className='dash-section'><h3 className='dash-section__title'>Recent Quizzes</h3><div className='quiz-history-grid'>{quizCards}</div></div> : null}
  <div className='dash-totals'><span>{'📅 ' + totalStats.daysActive + ' days active'}</span><span>{'📖 ' + totalStats.totalReviews + ' total reviews'}</span><span>{'📝 ' + totalStats.totalQuizzes + ' quizzes taken'}</span></div></div>;
}


/* =================================================================
   FLASHCARDTAB — Flip cards with SRS integration
   ================================================================= */
function FlashcardTab(props) {
    var _level = useState('All');
    var level = _level[0], setLevel = _level[1];

    var _mode = useState('all'); // 'all', 'due', 'new'
    var mode = _mode[0], setMode = _mode[1];

    var _cards = useState([]);
    var cards = _cards[0], setCards = _cards[1];

    var _index = useState(0);
    var index = _index[0], setIndex = _index[1];

    var _flipped = useState(false);
    var flipped = _flipped[0], setFlipped = _flipped[1];

    var _sessionActive = useState(false);
    var sessionActive = _sessionActive[0], setSessionActive = _sessionActive[1];

    var _sessionStats = useState({ total: 0, again: 0, hard: 0, good: 0, easy: 0 });
    var sessionStats = _sessionStats[0], setSessionStats = _sessionStats[1];

    function startSession() {
        var pool;
        if (level === 'Saved') {
            pool = props.savedWords || [];
        } else if (level === 'All') {
            pool = window.JLPT_VOCAB;
        } else {
            pool = window.JLPT_VOCAB.filter(function (w) { return w.level === level; });
        }

        if (mode === 'due') {
            pool = SRS.dueWords(pool);
        }

        // Shuffle
        var shuffled = pool.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = temp;
        }

        var selected = shuffled.slice(0, 20);
        if (selected.length === 0) return;

        setCards(selected);
        setIndex(0);
        setFlipped(false);
        setSessionActive(true);
        setSessionStats({ total: 0, again: 0, hard: 0, good: 0, easy: 0 });
    }

    function handleGrade(quality) {
        var card = cards[index];
        SRS.grade(card.word, quality);

        var isNew = !SRS.getCard(card.word) || SRS.getCard(card.word).reviewCount <= 1;
        PROGRESS.recordReview(isNew);

        var key = quality < 3 ? 'again' : quality === 3 ? 'hard' : quality === 4 ? 'good' : 'easy';
        setSessionStats(function (prev) {
            var next = Object.assign({}, prev);
            next[key]++;
            next.total++;
            return next;
        });

        // Next card
        if (index + 1 >= cards.length) {
            setSessionActive(false);
            if (window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        } else {
            setIndex(function (i) { return i + 1; });
            setFlipped(false);
        }
    }

    // Auto-pronounce
    useEffect(function () {
        if (flipped && props.autoPronounce && sessionActive && cards[index]) {
            playAudio(cards[index].word);
        }
    }, [flipped, index, sessionActive, props.autoPronounce, cards]);

    // Session complete screen
    if (!sessionActive && sessionStats.total > 0) {
        return <div className='glass-card'><div className='flashcard-complete'><div className='flashcard-complete__icon'>🎉</div><h2>Session Complete!</h2><p>{'You reviewed ' + sessionStats.total + ' cards'}</p><div className='flashcard-complete__stats'><span className='fc-stat fc-stat--again'>{'🔄 Again: ' + sessionStats.again}</span><span className='fc-stat fc-stat--hard'>{'😓 Hard: ' + sessionStats.hard}</span><span className='fc-stat fc-stat--good'>{'👍 Good: ' + sessionStats.good}</span><span className='fc-stat fc-stat--easy'>{'🌟 Easy: ' + sessionStats.easy}</span></div><button className='btn btn--primary' onClick={() => {
      setSessionStats({
        total: 0,
        again: 0,
        hard: 0,
        good: 0,
        easy: 0
      });
    }} style={{
      marginTop: 20
    }}>Start New Session</button></div></div>;
    }

    // Active flashcard
    if (sessionActive && cards.length > 0) {
        var card = cards[index];
        var progress = ((index + 1) / cards.length) * 100;

        return <div className='glass-card'><div className='flashcard-header'><button className='quiz-bar__back' onClick={() => {
      setSessionActive(false);
      setSessionStats({
        total: 0,
        again: 0,
        hard: 0,
        good: 0,
        easy: 0
      });
    }}>←</button><span>{'Card ' + (index + 1) + ' / ' + cards.length}</span><span className='quiz-level-tag'>{card.level || ''}</span></div><div className='progress-track'><div className='progress-fill' style={{
      width: progress + '%'
    }} /></div><div className={'flashcard-container' + (flipped ? ' flashcard--flipped' : '')} onClick={() => {
    if (!flipped) setFlipped(true);
  }}><div className='flashcard-inner'><div className='flashcard-front'><div className='flashcard-word'>{card.word}</div>{card.reading && props.showFurigana ? <div className='flashcard-reading'>{card.reading}</div> : null}<div className='flashcard-hint'>Tap to reveal</div></div><div className='flashcard-back'><div className='flashcard-word' style={{
          fontSize: '1.5rem'
        }}>{card.word}</div>{card.reading ? <div className='flashcard-reading'>{card.reading}</div> : null}<div className='flashcard-meaning'>{getVocabMeaning(card, props.appLang)}</div>{card.nuance ? <div className='flashcard-nuance'>{'💡 ' + card.nuance}</div> : null}{card.example ? <div className='flashcard-example'><div><FuriganaText text={card.example} show={props.showFurigana} /></div>{card.exampleEn ? <div style={{
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            fontStyle: 'italic',
            marginTop: 4
          }}>{card.exampleEn}</div> : null}</div> : null}</div></div></div>{flipped ? <div className='srs-grade-buttons'><button className='srs-btn srs-btn--again' onClick={() => {
      handleGrade(1);
    }}>🔄 Again</button><button className='srs-btn srs-btn--hard' onClick={() => {
      handleGrade(3);
    }}>😓 Hard</button><button className='srs-btn srs-btn--good' onClick={() => {
      handleGrade(4);
    }}>👍 Good</button><button className='srs-btn srs-btn--easy' onClick={() => {
      handleGrade(5);
    }}>🌟 Easy</button></div> : null}</div>;
    }

    // Setup screen
    var levels = ['All', 'N5', 'N4', 'N3', 'N2', 'N1'];
    if (props.savedWords && props.savedWords.length > 0) levels.push('Saved');

    var levelBtns = levels.map(function (lv) {
        return <button key={lv} className={'level-btn' + (level === lv ? ' level-btn--active' : '')} onClick={() => {
  setLevel(lv);
}}>{lv}</button>;
    });

    var modeBtns = [
        { id: 'all', label: '🃏 All Cards' },
        { id: 'due', label: '⏰ Due for Review' }
    ].map(function (m) {
        return <button key={m.id} className={'mode-btn' + (mode === m.id ? ' mode-btn--active' : '')} onClick={() => {
  setMode(m.id);
}}>{m.label}</button>;
    });

    var dueCount = SRS.stats().dueToday;

    return <div className='glass-card'><h2 className='section-title'>{'🃏 ' + t('Flashcards', props.appLang)}</h2><p className='section-desc'>{t('Review vocabulary with spaced repetition. Cards you struggle with appear more often.', props.appLang)}</p><h3 className='setup-label'>{t('Select Level', props.appLang)}</h3><div className='level-selector'>{levelBtns}</div><h3 className='setup-label'>{t('Mode', props.appLang)}</h3><div className='mode-selector'>{modeBtns}</div>{dueCount > 0 ? <p style={{
    textAlign: 'center',
    color: 'var(--accent-amber)',
    marginTop: 12
  }}>{'⏰ ' + dueCount + ' cards due for review!'}</p> : null}<div className='setup-center'><button className='btn btn--primary btn--large btn--glow' onClick={startSession} style={{
      marginTop: 20
    }}>▶  Start Flashcards</button></div></div>;
}


/* =================================================================
   CONJUGATIONTAB — Verb conjugation drill
   ================================================================= */
function ConjugationTab(props) {
    var _selectedForms = useState(['te', 'nai', 'past']);
    var selectedForms = _selectedForms[0], setSelectedForms = _selectedForms[1];

    var _level = useState('All');
    var level = _level[0], setLevel = _level[1];

    var _questions = useState([]);
    var questions = _questions[0], setQuestions = _questions[1];

    var _qIndex = useState(0);
    var qIndex = _qIndex[0], setQIndex = _qIndex[1];

    var _userAnswer = useState('');
    var userAnswer = _userAnswer[0], setUserAnswer = _userAnswer[1];

    var _showAnswer = useState(false);
    var showAnswer = _showAnswer[0], setShowAnswer = _showAnswer[1];

    var _score = useState(0);
    var score = _score[0], setScore = _score[1];

    var _phase = useState('setup');
    var phase = _phase[0], setPhase = _phase[1];

    function toggleForm(formId) {
        setSelectedForms(function (prev) {
            if (prev.indexOf(formId) !== -1) {
                return prev.filter(function (f) { return f !== formId; });
            }
            return prev.concat([formId]);
        });
    }

    function startDrill() {
        if (selectedForms.length === 0) return;
        var qs = CONJUGATION.generateQuestions(15, selectedForms, level);
        if (qs.length === 0) {
            alert('No verbs found for the selected level (the vocabulary list for this level might only contain nouns). Please select a different level.');
            return;
        }
        setQuestions(qs);
        setQIndex(0);
        setScore(0);
        setUserAnswer('');
        setShowAnswer(false);
        setPhase('active');
    }

    function checkAnswer() {
        var q = questions[qIndex];
        var ans = userAnswer.trim();
        var isCorrect = ans === q.answer.hiragana || ans === q.answer.kanji;
        if (isCorrect) setScore(function (s) { return s + 1; });
        setShowAnswer(true);
    }

    function nextQuestion() {
        if (qIndex + 1 >= questions.length) {
            setPhase('result');
        } else {
            setQIndex(function (i) { return i + 1; });
            setUserAnswer('');
            setShowAnswer(false);
        }
    }

    if (phase === 'result') {
        var pct = Math.round((score / questions.length) * 100);
        return <div className='glass-card'><div className='result-panel'><div className='result-panel__emoji'>{pct >= 70 ? '🎉' : '📚'}</div><div className='result-panel__title'>{pct >= 70 ? 'Great Job!' : 'Keep Practicing!'}</div><div style={{
      fontSize: '2rem',
      fontWeight: 700,
      margin: '16px 0'
    }}>{pct + '%'}</div><div style={{
      color: 'var(--text-secondary)'
    }}>{score + ' / ' + questions.length + ' correct'}</div><button className='btn btn--primary' onClick={() => {
      setPhase('setup');
    }} style={{
      marginTop: 20
    }}>↻ Try Again</button></div></div>;
    }

    if (phase === 'active') {
        var q = questions[qIndex];
        var ans = userAnswer.trim();
        var isCorrect = showAnswer && (ans === q.answer.hiragana || ans === q.answer.kanji);

        return <div className='glass-card'><div className='flashcard-header'><button className='quiz-bar__back' onClick={() => {
      setPhase('setup');
    }}>←</button><span>{qIndex + 1 + ' / ' + questions.length}</span><span>{score + ' ✓'}</span></div><div className='progress-track'><div className='progress-fill' style={{
      width: (qIndex + 1) / questions.length * 100 + '%'
    }} /></div><div className='conjugation-question'><div className='conjugation-word'>{q.word}</div><div className='conjugation-reading'>{q.reading}</div><div className='conjugation-prompt'>{'Conjugate to: '}<strong>{q.formLabel}</strong></div><div style={{
      color: 'var(--text-muted)',
      fontSize: '0.9rem'
    }}>{'(' + q.meaning + ')'}</div></div>{!showAnswer ? <div className='input-row' style={{
    marginTop: 20
  }}><input className='input-field' type='text' value={userAnswer} onChange={e => {
      setUserAnswer(e.target.value);
    }} onKeyDown={e => {
      if (e.key === 'Enter') checkAnswer();
    }} placeholder='Type the conjugated form...' autoFocus={true} style={{
      fontFamily: 'var(--font-jp)',
      fontSize: '1.2rem'
    }} /><button className='btn btn--primary' onClick={checkAnswer}>Check</button></div> : null}{showAnswer ? <div className='conjugation-answer'><div className={'conjugation-answer__badge' + (isCorrect ? ' conjugation-answer__badge--correct' : ' conjugation-answer__badge--wrong')}>{isCorrect ? '✔ Correct!' : '✘ Incorrect'}</div>{!isCorrect ? <div className='conjugation-answer__your'>{'Your answer: '}<span style={{
        color: 'var(--accent-red)'
      }}>{userAnswer || '(empty)'}</span></div> : null}<div className='conjugation-answer__correct'>{'Answer: '}<strong style={{
        fontSize: '1.3rem'
      }}>{q.answer.kanji !== q.answer.hiragana ? q.answer.kanji + ' (' + q.answer.hiragana + ')' : q.answer.hiragana}</strong></div><div style={{
      marginTop: 8,
      color: 'var(--text-muted)',
      fontSize: '0.9rem'
    }}>{'Verb type: ' + q.verbType + ' · Form: ' + q.formLabel}</div><button className='btn btn--primary btn--full' onClick={nextQuestion} style={{
      marginTop: 16
    }}>{qIndex + 1 >= questions.length ? 'View Results →' : 'Next →'}</button></div> : null}</div>;
    }

    // Setup
    var formCheckboxes = CONJUGATION.FORMS.map(function (f) {
        var isSelected = selectedForms.indexOf(f.id) !== -1;
        return <button key={f.id} className={'form-check' + (isSelected ? ' form-check--active' : '')} onClick={() => {
  toggleForm(f.id);
}}><span className='form-check__box'>{isSelected ? '☑' : '☐'}</span><span>{f.label}</span><span className='form-check__desc'>{f.desc}</span></button>;
    });

    var levelBtns = ['All', 'N5', 'N4', 'N3', 'N2', 'N1'].map(function (lv) {
        return <button key={lv} className={'level-btn' + (level === lv ? ' level-btn--active' : '')} onClick={() => {
  setLevel(lv);
}}>{lv}</button>;
    });

    return <div className='glass-card'><h2 className='section-title'>{t('Conjugation Practice', props.appLang)}</h2><p className='section-desc'>{t('Master Japanese verb conjugations. Select forms to practice and test yourself.', props.appLang)}</p><h3 className='setup-label'>{t('Level', props.appLang)}</h3><div className='level-selector'>{levelBtns}</div><h3 className='setup-label'>Select Forms to Practice</h3><div className='form-check-grid'>{formCheckboxes}</div><div className='setup-center'><button className='btn btn--primary btn--large btn--glow' onClick={startDrill} disabled={selectedForms.length === 0} style={{
      marginTop: 24
    }}>▶  Start Drill</button></div></div>;
}


/* =================================================================
   GRAMMARTAB — Grammar reference with N5-N3 points
   ================================================================= */
function GrammarTab(props) {
    var _level = useState('N5');
    var level = _level[0], setLevel = _level[1];

    var _searchQ = useState('');
    var searchQ = _searchQ[0], setSearchQ = _searchQ[1];

    var _expandedIdx = useState(-1);
    var expandedIdx = _expandedIdx[0], setExpandedIdx = _expandedIdx[1];

    var filtered = GRAMMAR_DATA.filter(function (g) {
        var matchLevel = g.level === level;
        if (!matchLevel) return false;
        if (!searchQ.trim()) return true;
        var q = searchQ.toLowerCase();
        var matchMeaning = getGrammarMeaning(g, props.appLang) || '';
        return g.pattern.toLowerCase().indexOf(q) !== -1 ||
            matchMeaning.toLowerCase().indexOf(q) !== -1;
    });

    var levelBtns = ['N5', 'N4', 'N3', 'N2', 'N1'].map(function (lv) {
        var count = GRAMMAR_DATA.filter(function (g) { return g.level === lv; }).length;
        return <button key={lv} className={'level-btn' + (level === lv ? ' level-btn--active' : '')} onClick={() => {
  setLevel(lv);
  setExpandedIdx(-1);
}}><span className='level-btn__label'>{lv}</span><span className='level-btn__count'>{count}</span></button>;
    });

    var grammarCards = filtered.map(function (g, idx) {
        var isExpanded = expandedIdx === idx;

        var exampleEls = null;
        if (g.examples && g.examples.length > 0) {
            exampleEls = g.examples.map(function (ex, i) {
                var exText = ex.en;
                if (props.appLang === 'vn' && ex.vn) exText = ex.vn;
                if (props.appLang === 'my' && ex.my) exText = ex.my;
                return <div key={i} className='grammar-example'><div className='grammar-example__jp'>{ex.jp}</div><div className='grammar-example__en'>{exText}</div></div>;
            });
        }

        var displayMeaning = getGrammarMeaning(g, props.appLang);

        return <div key={idx} className={'grammar-card' + (isExpanded ? ' grammar-card--expanded' : '')} onClick={() => {
  setExpandedIdx(isExpanded ? -1 : idx);
}}><div className='grammar-card__header'><div className='grammar-card__pattern'>{g.pattern}</div><div className='grammar-card__meaning'>{displayMeaning}</div><span className='grammar-card__arrow'>{isExpanded ? '▲' : '▼'}</span></div>{isExpanded ? <div className='grammar-card__body'><div className='grammar-card__structure'><span className='dict-result__label'>Structure</span><code>{g.structure}</code></div>{exampleEls.length > 0 ? <div className='grammar-card__examples'><span className='dict-result__label' style={{
        display: 'block',
        marginBottom: 8
      }}>Examples</span>{exampleEls}</div> : null}{g.notes ? <div className='grammar-card__notes'>{'💡 '}{g.notes}</div> : null}</div> : null}</div>;
    });

    return <div className='glass-card'><h2 className='section-title'>{t('Grammar Reference', props.appLang)}</h2><p className='section-desc'>{t('Essential Japanese grammar points organized by JLPT level.', props.appLang)}</p><div className='level-selector'>{levelBtns}</div><div style={{
    marginTop: 16,
    marginBottom: 16
  }}><input className='input-field' type='text' placeholder='Search grammar patterns...' value={searchQ} onChange={e => {
      setSearchQ(e.target.value);
      setExpandedIdx(-1);
    }} /></div><div className='grammar-list'>{grammarCards.length > 0 ? grammarCards : <p style={{
      textAlign: 'center',
      color: 'var(--text-muted)',
      padding: 40
    }}>No grammar points found.</p>}</div></div>;
}

function getGrammarMeaning(q, lang) {
    if (lang === 'vn' && q.meaning_vn) return q.meaning_vn;
    if (lang === 'my' && q.meaning_my) return q.meaning_my;
    if (lang === 'zh') {
        if (q.meaning_zh) return q.meaning_zh;
        if (q.pattern && window.GRAMMAR_ZH && window.GRAMMAR_ZH[q.pattern]) return window.GRAMMAR_ZH[q.pattern];
    }
    return q.meaning;
}

/**
 * Generates options for Grammar Quiz
 */
function generateGrammarOptions(question, pool, mode, appLang) {
    var correct;
    var getFieldVal = function(q) {
        if (mode === 'pattern' || mode === 'fill') return q.pattern;
        return getGrammarMeaning(q, appLang);
    };

    correct = getFieldVal(question);

    var sameLevelPool = pool.filter(function (q) {
        return q.level === question.level && getFieldVal(q) !== correct;
    });

    if (sameLevelPool.length < 3) {
        sameLevelPool = pool.filter(function (q) {
            return getFieldVal(q) !== correct;
        });
    }

    var shuffled = shuffleArray(sameLevelPool);
    var distractors = [];
    var usedValues = {};
    usedValues[correct] = true;

    for (var i = 0; i < shuffled.length && distractors.length < 3; i++) {
        var val = getFieldVal(shuffled[i]);
        if (!usedValues[val] && val) {
            distractors.push(val);
            usedValues[val] = true;
        }
    }

    var options = [correct].concat(distractors);
    return shuffleArray(options);
}



export { KanjiTab, LeaderboardTab, DashboardTab, FlashcardTab, ConjugationTab, GrammarTab, getGrammarMeaning, generateGrammarOptions };
