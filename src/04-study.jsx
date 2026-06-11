import React from 'react';
const { useState, useEffect, useRef, useCallback, useMemo } = React;
const createElement = React.createElement;
import { AnimatedCounter, AudioButton, SaveButton, fetchKanjiSvg, getVocabMeaning, playAudio, sanitizeHTML, searchKanji, shuffleArray, t } from './01-core.jsx';

/* =================================================================
   JLPT Master — Study tools (Kanji, Leaderboard, Dashboard, Flashcards, Conjugation, Grammar)
   Part of the app, split from the original app.js for readability.
   Uses React 18 via CDN (React.createElement, no JSX/build step).
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

    var doSearch = useCallback(async function () {
        var q = query.trim();
        if (!q) return;

        // Extract all Kanji characters using regex
        var kanjiMatches = q.match(/[\u4e00-\u9faf\u3400-\u4dbf]/g);
        if (!kanjiMatches || kanjiMatches.length === 0) {
            setError('Please enter a word containing at least one Kanji character.');
            setResults([]);
            return;
        }

        // Remove duplicates
        var uniqueKanji = [];
        for (var i = 0; i < kanjiMatches.length; i++) {
            if (uniqueKanji.indexOf(kanjiMatches[i]) === -1) {
                uniqueKanji.push(kanjiMatches[i]);
            }
        }

        setLoading(true);
        setError('');
        setResults([]);

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
            return createElement('span', { key: i, className: 'kanji-meaning-tag' }, m);
        });

        // Onyomi
        var onEl = null;
        if (res.on_readings && res.on_readings.length > 0) {
            onEl = createElement('div', { className: 'dict-result__row' },
                createElement('span', { className: 'dict-result__label' }, 'Onyomi'),
                createElement('span', null, res.on_readings.join(', '))
            );
        }

        // Kunyomi
        var kunEl = null;
        if (res.kun_readings && res.kun_readings.length > 0) {
            kunEl = createElement('div', { className: 'dict-result__row' },
                createElement('span', { className: 'dict-result__label' }, 'Kunyomi'),
                createElement('span', null, res.kun_readings.join(', '))
            );
        }

        var jlptEl = null;
        if (res.jlpt !== null) {
            jlptEl = createElement('span', { className: 'result-meta-tag' }, 'JLPT N' + res.jlpt);
        }

        var gradeEl = null;
        if (res.grade !== null) {
            gradeEl = createElement('span', { className: 'result-meta-tag' }, 'Grade ' + res.grade);
        }

        var strokesEl = createElement('span', { className: 'result-meta-tag' }, res.stroke_count + ' strokes');

        // Check if saved
        var isSaved = props.savedWords ? props.savedWords.some(function (w) { return w.word === res.kanji; }) : false;

        return createElement('div', { key: idx, className: 'dict-result', style: { marginBottom: '16px' } },
            createElement('div', { style: { display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' } },
                // Large Character Display
                createElement('div', { className: 'kanji-large-display', style: { position: 'relative' } },
                    res.svg ? createElement('div', { dangerouslySetInnerHTML: { __html: sanitizeHTML(res.svg) }, className: 'kanji-svg-container' }) : res.kanji,
                    createElement('div', { style: { position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4 } },
                        createElement(AudioButton, { text: res.kanji }),
                        props.toggleSavedWord ? createElement(SaveButton, {
                            isSaved: isSaved,
                            onToggle: function () {
                                props.toggleSavedWord({
                                    word: res.kanji,
                                    reading: res.kun_readings && res.kun_readings.length > 0 ? res.kun_readings[0] : (res.on_readings && res.on_readings.length > 0 ? res.on_readings[0] : ''),
                                    correct: res.meanings.join(', '),
                                    level: res.jlpt !== null ? 'N' + res.jlpt : 'None'
                                });
                            }
                        }) : null
                    )
                ),

                // Details
                createElement('div', { style: { flex: 1, minWidth: '200px' } },
                    createElement('div', { style: { marginBottom: '16px' } }, meaningsEl),
                    onEl,
                    kunEl,
                    createElement('div', { className: 'result-panel__meta', style: { justifyContent: 'flex-start', marginTop: '16px' } },
                        jlptEl, gradeEl, strokesEl
                    )
                )
            )
        );
    });

    var errorEl = null;
    if (error) {
        errorEl = createElement('div', { className: 'dict-result dict-result--error' },
            createElement('p', { style: { color: 'var(--accent-red)' } }, error)
        );
    }

    return createElement('div', { className: 'glass-card', key: 'kanji' },
        createElement('h2', { className: 'section-title' }, t('Kanji Search', props.appLang)),
        createElement('p', { className: 'section-desc' }, 'Enter a Kanji or a Japanese word to see detailed information for all Kanji used in it.'),

        createElement('div', { className: 'input-row' },
            createElement('input', {
                className: 'input-field',
                type: 'text',
                placeholder: 'e.g. 食べる, 水, 飛行機...',
                value: query,
                onChange: function (e) { setQuery(e.target.value); },
                onKeyDown: handleKey,
            }),
            createElement('button', {
                className: 'btn btn--primary',
                onClick: doSearch,
                disabled: loading,
            }, loading ? 'Searching\u2026' : 'Search')
        ),
        resultEls.length > 0 ? createElement('div', null, resultEls) : null,
        errorEl
    );
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
    
    var _editName = useState(profile ? profile.name : '');
    var editName = _editName[0], setEditName = _editName[1];

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
        LEADERBOARD_API.updateProfile(editName.trim(), profile.avatar);
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
        if (avatar && avatar.startsWith('http')) {
            return createElement('img', { src: avatar, style: { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' } });
        }
        return avatar || '👤';
    }

    var top3 = state.users.slice(0, 3);
    var rest = state.users.slice(3, 100);

    // Profile render helper
    var isGoogleLinked = profile && profile.id && !profile.id.startsWith('user_');
    var profileImg = renderAvatar(profile ? profile.photoURL || profile.avatar : null);

    return createElement('div', { className: 'glass-card leaderboard-container' },
        createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' } },
            createElement('h2', { className: 'section-title', style: { margin: 0 } }, t('Global Leaderboard', props.appLang)),
            createElement('button', { className: 'btn btn--outline', onClick: loadData, disabled: state.loading }, state.loading ? '↻ Loading...' : '↻ Refresh')
        ),
        
        // Profile Edit Section
        createElement('div', { style: { padding: '15px', background: 'rgba(0,0,0,0.1)', borderRadius: '12px', marginBottom: '30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            isEditing ? createElement('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flex: 1, flexWrap: 'wrap' } },
                createElement('div', { style: { width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', background: '#fff', borderRadius: '50%' } }, profileImg),
                createElement('input', { type: 'text', className: 'search-input', value: editName, onChange: function(e) { setEditName(e.target.value); }, style: { flex: 1, padding: '8px', minWidth: '150px' }, placeholder: 'Your Name', disabled: isGoogleLinked }),
                !isGoogleLinked && createElement('button', { className: 'btn btn--primary', onClick: saveProfile }, 'Save'),
                createElement('button', { className: 'btn', onClick: function() { setIsEditing(false); setEditName(profile.name); } }, 'Cancel')
            ) : createElement('div', { style: { display: 'flex', gap: '15px', alignItems: 'center', flex: 1, flexWrap: 'wrap' } },
                createElement('div', { style: { fontSize: '2.5rem', background: '#fff', borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', overflow: 'hidden' } }, profileImg),
                createElement('div', { style: { flex: 1, minWidth: '120px' } },
                    createElement('div', { style: { fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' } }, 
                        profile.name,
                        isGoogleLinked && createElement('span', { title: 'Verified Google Account', style: { fontSize: '1rem' } }, '✅')
                    ),
                    createElement('div', { style: { color: 'var(--primary)', fontWeight: 'bold' } }, (PROGRESS.getTotalStats().xp || 0).toLocaleString() + ' XP')
                ),
                createElement('div', { style: { display: 'flex', gap: '10px', marginLeft: 'auto' } },
                    isGoogleLinked 
                        ? createElement('button', { className: 'btn btn--outline', onClick: handleGoogleLogout }, 'Sign Out')
                        : createElement('button', { className: 'btn btn--primary', onClick: handleGoogleLogin, style: { background: '#4285F4', color: '#fff', border: 'none' } }, 'Sign in with Google'),
                    !isGoogleLinked && createElement('button', { className: 'btn btn--outline', onClick: function() { setIsEditing(true); } }, 'Edit Local Profile')
                )
            )
        ),
        
        state.error ? createElement('div', { style: { color: 'var(--danger)', padding: '20px', textAlign: 'center' } }, 'Error loading leaderboard: ' + state.error) : null,
        state.loading && state.users.length === 0 ? createElement('div', { style: { textAlign: 'center', padding: '50px', fontSize: '1.2rem' } }, 'Loading top players...') : null,
        
        state.users.length > 0 && createElement('div', { className: 'podium-container' },
            top3[1] && createElement('div', { className: 'podium-item podium-silver' },
                createElement('div', { className: 'podium-avatar' }, renderAvatar(top3[1].avatar)),
                createElement('div', { className: 'podium-name' }, top3[1].name),
                createElement('div', { className: 'podium-xp' }, top3[1].xp.toLocaleString() + ' XP'),
                createElement('div', { className: 'podium-step' }, createElement('span', null, '2'))
            ),
            top3[0] && createElement('div', { className: 'podium-item podium-gold' },
                createElement('div', { className: 'podium-avatar' }, renderAvatar(top3[0].avatar)),
                createElement('div', { className: 'podium-name' }, top3[0].name),
                createElement('div', { className: 'podium-xp' }, top3[0].xp.toLocaleString() + ' XP'),
                createElement('div', { className: 'podium-step' }, createElement('span', null, '1'))
            ),
            top3[2] && createElement('div', { className: 'podium-item podium-bronze' },
                createElement('div', { className: 'podium-avatar' }, top3[2].avatar),
                createElement('div', { className: 'podium-name' }, top3[2].name),
                createElement('div', { className: 'podium-xp' }, top3[2].xp.toLocaleString() + ' XP'),
                createElement('div', { className: 'podium-step' }, createElement('span', null, '3'))
            )
        ),
        
        state.myRank > 3 && createElement('div', { className: 'my-rank-banner' },
            createElement('div', { className: 'my-rank-info' },
                createElement('span', { className: 'my-rank-number' }, '#' + state.myRank),
                createElement('span', { className: 'my-rank-text' }, t('Your Rank', props.appLang) || 'Your Rank')
            ),
            createElement('div', { className: 'my-rank-xp' }, (PROGRESS.getTotalStats().xp || 0).toLocaleString() + ' XP')
        ),
        
        state.users.length > 0 && createElement('div', { className: 'leaderboard-list' },
            rest.map(function(u) {
                return createElement('div', { key: u.id, className: 'leaderboard-row' + (u.isMe ? ' leaderboard-row--me' : '') },
                    createElement('div', { className: 'leaderboard-row__rank' }, u.rank),
                    createElement('div', { className: 'leaderboard-row__avatar' }, renderAvatar(u.avatar)),
                    createElement('div', { className: 'leaderboard-row__name' }, u.name + (u.isMe ? ' (You)' : '')),
                    createElement('div', { className: 'leaderboard-row__xp' }, u.xp.toLocaleString() + ' XP')
                );
            })
        )
    );
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
        return createElement('div', { key: i, className: 'chart-bar-wrapper' },
            createElement('div', { className: 'chart-bar-value' }, d.reviews > 0 ? d.reviews : ''),
            createElement('div', {
                className: 'chart-bar' + (isToday ? ' chart-bar--today' : ''),
                style: { height: height + 'px' }
            }),
            createElement('div', { className: 'chart-bar-label' }, d.label)
        );
    });

    // Quiz history cards
    var quizCards = quizHistory.map(function (q, i) {
        var d = new Date(q.date);
        var dateStr = (d.getMonth() + 1) + '/' + d.getDate();
        return createElement('div', { key: i, className: 'quiz-history-card' },
            createElement('div', { className: 'quiz-history-card__score' }, q.pct + '%'),
            createElement('div', { className: 'quiz-history-card__detail' },
                q.score + '/' + q.total + ' · ' + q.level
            ),
            createElement('div', { className: 'quiz-history-card__date' }, dateStr)
        );
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
        return createElement('div', { key: i, className: 'srs-bar-segment', style: { width: pct + '%', background: p.color } });
    });

    var srsLabelEls = srsParts.map(function (p, i) {
        return createElement('div', { key: i, className: 'srs-label' },
            createElement('span', { className: 'srs-label__dot', style: { background: p.color } }),
            createElement('span', null, p.label + ': ' + p.count)
        );
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

    var rankCard = createElement('div', { className: 'dash-rank-card' },
        createElement('div', { className: 'dash-rank-title' }, rankInfo.current.name),
        createElement('div', { className: 'dash-rank-xp' },
            createElement(AnimatedCounter, { value: rankInfo.xp }),
            ' XP / ' + (rankInfo.next ? rankInfo.next.minXP : '∞') + ' XP'),
        createElement('div', { className: 'xp-bar-container' },
            createElement('div', { className: 'xp-bar-fill', style: { width: xpProgress + '%' } })
        ),
        createElement('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } }, nextRankLabel)
    );

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
            actionBtn = createElement('button', {
                className: 'btn btn--primary',
                style: { marginLeft: 'auto', padding: '0.4rem 1rem', fontSize: '0.9rem' },
                onClick: function(e) {
                    e.stopPropagation();
                    if (props.setTab) props.setTab(targetTab);
                }
            }, targetTab === 'saved' ? 'Go to Saved' : (targetTab === 'flash' ? 'Go to Flashcards' : 'Go to Quiz'));
        }

        return createElement('div', { 
            key: i, 
            className: cls,
            onClick: function() { 
                if (clickable && props.setTab) {
                    props.setTab(targetTab);
                }
            },
            style: clickable ? { cursor: 'pointer', transition: 'transform 0.2s' } : {}
        },
            createElement('div', { className: 'quest-icon' }, q.completed ? '✓' : '🎯'),
            createElement('div', { className: 'quest-details' },
                createElement('div', { className: 'quest-title' }, q.title),
                createElement('div', { className: 'quest-progress' }, Math.min(q.current, q.target) + ' / ' + q.target)
            ),
            actionBtn
        );
    });

    var questsSection = createElement('div', { className: 'dash-section' },
        createElement('h3', { className: 'dash-section__title' }, 'Daily Quests'),
        createElement('div', { className: 'daily-quests-grid' }, questCards)
    );

    // AI Insights Section
    var insights = PROGRESS.analyzeWeaknesses();
    var insightsSection = null;
    if (!insights.hasEnoughData) {
        insightsSection = createElement('div', { className: 'dash-section insights-section' },
            createElement('h3', { className: 'dash-section__title' }, '🧠 AI Insights'),
            createElement('div', { className: 'insights-card insights-card--empty', style: { padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px', textAlign: 'center', fontStyle: 'italic', color: 'var(--text-muted)' } },
                'Take at least 3 quizzes to unlock personalized study recommendations!'
            )
        );
    } else {
        var weaknessCards = insights.weaknesses.map(function(w, i) {
            return createElement('div', { key: i, className: 'insight-item', style: { background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid ' + (w.pct < 50 ? 'var(--danger)' : 'var(--accent-amber)') } },
                createElement('div', { className: 'insight-item__header', style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' } },
                    createElement('strong', { style: { fontSize: '1.1rem' } }, w.level + ' ' + w.mode),
                    createElement('span', { className: 'insight-item__pct', style: { fontWeight: 'bold', color: w.pct < 50 ? 'var(--danger)' : 'var(--accent-amber)' } }, w.pct + '% Accuracy')
                ),
                createElement('div', { className: 'insight-item__desc', style: { fontSize: '0.9rem', color: 'var(--text-muted)' } }, 'You have answered ' + w.totalQuestions + ' questions in this category. Focusing your practice here will maximize your score improvement.')
            );
        });

        insightsSection = createElement('div', { className: 'dash-section insights-section' },
            createElement('h3', { className: 'dash-section__title' }, '🎯 Target Areas for Improvement'),
            createElement('div', { className: 'insights-grid', style: { display: 'grid', gap: '15px' } }, weaknessCards)
        );
    }

    return createElement('div', { className: 'glass-card' },
        createElement('h2', { className: 'section-title' }, t('Dashboard', props.appLang)),

        insightsSection,
        rankCard,
        questsSection,

        // Streak & Today stats
        createElement('div', { className: 'dash-stats-grid' },
            createElement('div', { className: 'dash-stat-card dash-stat-card--streak' },
                createElement('div', { className: 'dash-stat-card__icon' }, streak > 0 ? '🔥' : '❄️'),
                createElement('div', { className: 'dash-stat-card__value' }, streak),
                createElement('div', { className: 'dash-stat-card__label' }, 'Day Streak')
            ),
            createElement('div', { className: 'dash-stat-card' },
                createElement('div', { className: 'dash-stat-card__icon' }, '📝'),
                createElement('div', { className: 'dash-stat-card__value' }, todayStats.wordsReviewed),
                createElement('div', { className: 'dash-stat-card__label' }, 'Reviews Today')
            ),
            createElement('div', { className: 'dash-stat-card' },
                createElement('div', { className: 'dash-stat-card__icon' }, '🎯'),
                createElement('div', { className: 'dash-stat-card__value' }, todayStats.quizzesTaken),
                createElement('div', { className: 'dash-stat-card__label' }, 'Quizzes Today')
            ),
            createElement('div', { className: 'dash-stat-card' },
                createElement('div', { className: 'dash-stat-card__icon' }, '⏰'),
                createElement('div', { className: 'dash-stat-card__value' }, srsStats.dueToday),
                createElement('div', { className: 'dash-stat-card__label' }, 'Due for Review')
            )
        ),

        // SRS Distribution
        createElement('div', { className: 'dash-section' },
            createElement('h3', { className: 'dash-section__title' }, 'SRS Progress'),
            createElement('div', { className: 'srs-bar' }, srsBarEls),
            createElement('div', { className: 'srs-labels' }, srsLabelEls)
        ),

        // Weekly Activity Chart
        createElement('div', { className: 'dash-section' },
            createElement('h3', { className: 'dash-section__title' }, 'Weekly Activity'),
            createElement('div', { className: 'weekly-chart' }, chartBars)
        ),

        // Quiz History
        quizCards.length > 0 ? createElement('div', { className: 'dash-section' },
            createElement('h3', { className: 'dash-section__title' }, 'Recent Quizzes'),
            createElement('div', { className: 'quiz-history-grid' }, quizCards)
        ) : null,

        // Totals
        createElement('div', { className: 'dash-totals' },
            createElement('span', null, '📅 ' + totalStats.daysActive + ' days active'),
            createElement('span', null, '📖 ' + totalStats.totalReviews + ' total reviews'),
            createElement('span', null, '📝 ' + totalStats.totalQuizzes + ' quizzes taken')
        )
    );
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
            pool = JLPT_VOCAB;
        } else {
            pool = JLPT_VOCAB.filter(function (w) { return w.level === level; });
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
        return createElement('div', { className: 'glass-card' },
            createElement('div', { className: 'flashcard-complete' },
                createElement('div', { className: 'flashcard-complete__icon' }, '🎉'),
                createElement('h2', null, 'Session Complete!'),
                createElement('p', null, 'You reviewed ' + sessionStats.total + ' cards'),
                createElement('div', { className: 'flashcard-complete__stats' },
                    createElement('span', { className: 'fc-stat fc-stat--again' }, '🔄 Again: ' + sessionStats.again),
                    createElement('span', { className: 'fc-stat fc-stat--hard' }, '😓 Hard: ' + sessionStats.hard),
                    createElement('span', { className: 'fc-stat fc-stat--good' }, '👍 Good: ' + sessionStats.good),
                    createElement('span', { className: 'fc-stat fc-stat--easy' }, '🌟 Easy: ' + sessionStats.easy)
                ),
                createElement('button', {
                    className: 'btn btn--primary',
                    onClick: function () { setSessionStats({ total: 0, again: 0, hard: 0, good: 0, easy: 0 }); },
                    style: { marginTop: 20 }
                }, 'Start New Session')
            )
        );
    }

    // Active flashcard
    if (sessionActive && cards.length > 0) {
        var card = cards[index];
        var progress = ((index + 1) / cards.length) * 100;

        return createElement('div', { className: 'glass-card' },
            createElement('div', { className: 'flashcard-header' },
                createElement('button', {
                    className: 'quiz-bar__back',
                    onClick: function () { setSessionActive(false); setSessionStats({ total: 0, again: 0, hard: 0, good: 0, easy: 0 }); }
                }, '←'),
                createElement('span', null, 'Card ' + (index + 1) + ' / ' + cards.length),
                createElement('span', { className: 'quiz-level-tag' }, card.level || '')
            ),
            createElement('div', { className: 'progress-track' },
                createElement('div', { className: 'progress-fill', style: { width: progress + '%' } })
            ),

            createElement('div', {
                className: 'flashcard-container' + (flipped ? ' flashcard--flipped' : ''),
                onClick: function () { if (!flipped) setFlipped(true); }
            },
                createElement('div', { className: 'flashcard-inner' },
                    createElement('div', { className: 'flashcard-front' },
                        createElement('div', { className: 'flashcard-word' }, card.word),
                        (card.reading && props.showFurigana) ? createElement('div', { className: 'flashcard-reading' }, card.reading) : null,
                        createElement('div', { className: 'flashcard-hint' }, 'Tap to reveal')
                    ),
                    createElement('div', { className: 'flashcard-back' },
                        createElement('div', { className: 'flashcard-word', style: { fontSize: '1.5rem' } }, card.word),
                        card.reading ? createElement('div', { className: 'flashcard-reading' }, card.reading) : null,
                        createElement('div', { className: 'flashcard-meaning' }, getVocabMeaning(card, props.appLang)),
                        card.nuance ? createElement('div', { className: 'flashcard-nuance' }, '💡 ' + card.nuance) : null,
                        card.example ? createElement('div', { className: 'flashcard-example' },
                            createElement('div', null, card.example),
                            card.exampleEn ? createElement('div', { style: { color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', marginTop: 4 } }, card.exampleEn) : null
                        ) : null
                    )
                )
            ),

            flipped ? createElement('div', { className: 'srs-grade-buttons' },
                createElement('button', { className: 'srs-btn srs-btn--again', onClick: function () { handleGrade(1); } }, '🔄 Again'),
                createElement('button', { className: 'srs-btn srs-btn--hard', onClick: function () { handleGrade(3); } }, '😓 Hard'),
                createElement('button', { className: 'srs-btn srs-btn--good', onClick: function () { handleGrade(4); } }, '👍 Good'),
                createElement('button', { className: 'srs-btn srs-btn--easy', onClick: function () { handleGrade(5); } }, '🌟 Easy')
            ) : null
        );
    }

    // Setup screen
    var levels = ['All', 'N5', 'N4', 'N3', 'N2', 'N1'];
    if (props.savedWords && props.savedWords.length > 0) levels.push('Saved');

    var levelBtns = levels.map(function (lv) {
        return createElement('button', {
            key: lv,
            className: 'level-btn' + (level === lv ? ' level-btn--active' : ''),
            onClick: function () { setLevel(lv); }
        }, lv);
    });

    var modeBtns = [
        { id: 'all', label: '🃏 All Cards' },
        { id: 'due', label: '⏰ Due for Review' }
    ].map(function (m) {
        return createElement('button', {
            key: m.id,
            className: 'mode-btn' + (mode === m.id ? ' mode-btn--active' : ''),
            onClick: function () { setMode(m.id); }
        }, m.label);
    });

    var dueCount = SRS.stats().dueToday;

    return createElement('div', { className: 'glass-card' },
        createElement('h2', { className: 'section-title' }, '🃏 ' + t('Flashcards', props.appLang)),
        createElement('p', { className: 'section-desc' }, 'Review vocabulary with spaced repetition. Cards you struggle with appear more often.'),

        createElement('h3', { className: 'setup-label' }, 'Select Level'),
        createElement('div', { className: 'level-selector' }, levelBtns),

        createElement('h3', { className: 'setup-label' }, 'Mode'),
        createElement('div', { className: 'mode-selector' }, modeBtns),

        dueCount > 0 ? createElement('p', { style: { textAlign: 'center', color: 'var(--accent-amber)', marginTop: 12 } },
            '⏰ ' + dueCount + ' cards due for review!'
        ) : null,

        createElement('div', { className: 'setup-center' },
            createElement('button', {
                className: 'btn btn--primary btn--large btn--glow',
                onClick: startSession,
                style: { marginTop: 20 }
            }, '▶  Start Flashcards')
        )
    );
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
        return createElement('div', { className: 'glass-card' },
            createElement('div', { className: 'result-panel' },
                createElement('div', { className: 'result-panel__emoji' }, pct >= 70 ? '🎉' : '📚'),
                createElement('div', { className: 'result-panel__title' }, pct >= 70 ? 'Great Job!' : 'Keep Practicing!'),
                createElement('div', { style: { fontSize: '2rem', fontWeight: 700, margin: '16px 0' } }, pct + '%'),
                createElement('div', { style: { color: 'var(--text-secondary)' } }, score + ' / ' + questions.length + ' correct'),
                createElement('button', {
                    className: 'btn btn--primary',
                    onClick: function () { setPhase('setup'); },
                    style: { marginTop: 20 }
                }, '↻ Try Again')
            )
        );
    }

    if (phase === 'active') {
        var q = questions[qIndex];
        var ans = userAnswer.trim();
        var isCorrect = showAnswer && (ans === q.answer.hiragana || ans === q.answer.kanji);

        return createElement('div', { className: 'glass-card' },
            createElement('div', { className: 'flashcard-header' },
                createElement('button', { className: 'quiz-bar__back', onClick: function () { setPhase('setup'); } }, '←'),
                createElement('span', null, (qIndex + 1) + ' / ' + questions.length),
                createElement('span', null, score + ' ✓')
            ),
            createElement('div', { className: 'progress-track' },
                createElement('div', { className: 'progress-fill', style: { width: ((qIndex + 1) / questions.length * 100) + '%' } })
            ),

            createElement('div', { className: 'conjugation-question' },
                createElement('div', { className: 'conjugation-word' }, q.word),
                createElement('div', { className: 'conjugation-reading' }, q.reading),
                createElement('div', { className: 'conjugation-prompt' },
                    'Conjugate to: ',
                    createElement('strong', null, q.formLabel)
                ),
                createElement('div', { style: { color: 'var(--text-muted)', fontSize: '0.9rem' } }, '(' + q.meaning + ')')
            ),

            !showAnswer ? createElement('div', { className: 'input-row', style: { marginTop: 20 } },
                createElement('input', {
                    className: 'input-field',
                    type: 'text',
                    value: userAnswer,
                    onChange: function (e) { setUserAnswer(e.target.value); },
                    onKeyDown: function (e) { if (e.key === 'Enter') checkAnswer(); },
                    placeholder: 'Type the conjugated form...',
                    autoFocus: true,
                    style: { fontFamily: 'var(--font-jp)', fontSize: '1.2rem' }
                }),
                createElement('button', { className: 'btn btn--primary', onClick: checkAnswer }, 'Check')
            ) : null,

            showAnswer ? createElement('div', { className: 'conjugation-answer' },
                createElement('div', {
                    className: 'conjugation-answer__badge' + (isCorrect ? ' conjugation-answer__badge--correct' : ' conjugation-answer__badge--wrong')
                }, isCorrect ? '✔ Correct!' : '✘ Incorrect'),
                !isCorrect ? createElement('div', { className: 'conjugation-answer__your' },
                    'Your answer: ', createElement('span', { style: { color: 'var(--accent-red)' } }, userAnswer || '(empty)')
                ) : null,
                createElement('div', { className: 'conjugation-answer__correct' },
                    'Answer: ', createElement('strong', { style: { fontSize: '1.3rem' } }, q.answer.kanji !== q.answer.hiragana ? (q.answer.kanji + ' (' + q.answer.hiragana + ')') : q.answer.hiragana)
                ),
                createElement('div', { style: { marginTop: 8, color: 'var(--text-muted)', fontSize: '0.9rem' } },
                    'Verb type: ' + q.verbType + ' · Form: ' + q.formLabel
                ),
                createElement('button', {
                    className: 'btn btn--primary btn--full',
                    onClick: nextQuestion,
                    style: { marginTop: 16 }
                }, qIndex + 1 >= questions.length ? 'View Results →' : 'Next →')
            ) : null
        );
    }

    // Setup
    var formCheckboxes = CONJUGATION.FORMS.map(function (f) {
        var isSelected = selectedForms.indexOf(f.id) !== -1;
        return createElement('button', {
            key: f.id,
            className: 'form-check' + (isSelected ? ' form-check--active' : ''),
            onClick: function () { toggleForm(f.id); }
        },
            createElement('span', { className: 'form-check__box' }, isSelected ? '☑' : '☐'),
            createElement('span', null, f.label),
            createElement('span', { className: 'form-check__desc' }, f.desc)
        );
    });

    var levelBtns = ['All', 'N5', 'N4', 'N3', 'N2', 'N1'].map(function (lv) {
        return createElement('button', {
            key: lv,
            className: 'level-btn' + (level === lv ? ' level-btn--active' : ''),
            onClick: function () { setLevel(lv); }
        }, lv);
    });

    return createElement('div', { className: 'glass-card' },
        createElement('h2', { className: 'section-title' }, t('Conjugation Practice', props.appLang)),
        createElement('p', { className: 'section-desc' }, 'Master Japanese verb conjugations. Select forms to practice and test yourself.'),

        createElement('h3', { className: 'setup-label' }, 'Level'),
        createElement('div', { className: 'level-selector' }, levelBtns),

        createElement('h3', { className: 'setup-label' }, 'Select Forms to Practice'),
        createElement('div', { className: 'form-check-grid' }, formCheckboxes),

        createElement('div', { className: 'setup-center' },
            createElement('button', {
                className: 'btn btn--primary btn--large btn--glow',
                onClick: startDrill,
                disabled: selectedForms.length === 0,
                style: { marginTop: 24 }
            }, '▶  Start Drill')
        )
    );
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
        var matchMeaning = g.meaning || '';
        if (props.appLang === 'vn' && g.meaning_vn) matchMeaning = g.meaning_vn;
        if (props.appLang === 'my' && g.meaning_my) matchMeaning = g.meaning_my;
        return g.pattern.toLowerCase().indexOf(q) !== -1 ||
            matchMeaning.toLowerCase().indexOf(q) !== -1;
    });

    var levelBtns = ['N5', 'N4', 'N3', 'N2', 'N1'].map(function (lv) {
        var count = GRAMMAR_DATA.filter(function (g) { return g.level === lv; }).length;
        return createElement('button', {
            key: lv,
            className: 'level-btn' + (level === lv ? ' level-btn--active' : ''),
            onClick: function () { setLevel(lv); setExpandedIdx(-1); }
        },
            createElement('span', { className: 'level-btn__label' }, lv),
            createElement('span', { className: 'level-btn__count' }, count)
        );
    });

    var grammarCards = filtered.map(function (g, idx) {
        var isExpanded = expandedIdx === idx;

        var exampleEls = null;
        if (g.examples && g.examples.length > 0) {
            exampleEls = g.examples.map(function (ex, i) {
                var exText = ex.en;
                if (props.appLang === 'vn' && ex.vn) exText = ex.vn;
                if (props.appLang === 'my' && ex.my) exText = ex.my;
                return createElement('div', { key: i, className: 'grammar-example' },
                    createElement('div', { className: 'grammar-example__jp' }, ex.jp),
                    createElement('div', { className: 'grammar-example__en' }, exText)
                );
            });
        }

        var displayMeaning = g.meaning;
        if (props.appLang === 'vn' && g.meaning_vn) displayMeaning = g.meaning_vn;
        if (props.appLang === 'my' && g.meaning_my) displayMeaning = g.meaning_my;

        return createElement('div', {
            key: idx,
            className: 'grammar-card' + (isExpanded ? ' grammar-card--expanded' : ''),
            onClick: function () { setExpandedIdx(isExpanded ? -1 : idx); }
        },
            createElement('div', { className: 'grammar-card__header' },
                createElement('div', { className: 'grammar-card__pattern' }, g.pattern),
                createElement('div', { className: 'grammar-card__meaning' }, displayMeaning),
                createElement('span', { className: 'grammar-card__arrow' }, isExpanded ? '▲' : '▼')
            ),
            isExpanded ? createElement('div', { className: 'grammar-card__body' },
                createElement('div', { className: 'grammar-card__structure' },
                    createElement('span', { className: 'dict-result__label' }, 'Structure'),
                    createElement('code', null, g.structure)
                ),
                exampleEls.length > 0 ? createElement('div', { className: 'grammar-card__examples' },
                    createElement('span', { className: 'dict-result__label', style: { display: 'block', marginBottom: 8 } }, 'Examples'),
                    exampleEls
                ) : null,
                g.notes ? createElement('div', { className: 'grammar-card__notes' },
                    '💡 ', g.notes
                ) : null
            ) : null
        );
    });

    return createElement('div', { className: 'glass-card' },
        createElement('h2', { className: 'section-title' }, t('Grammar Reference', props.appLang)),
        createElement('p', { className: 'section-desc' }, 'Essential Japanese grammar points organized by JLPT level.'),

        createElement('div', { className: 'level-selector' }, levelBtns),

        createElement('div', { style: { marginTop: 16, marginBottom: 16 } },
            createElement('input', {
                className: 'input-field',
                type: 'text',
                placeholder: 'Search grammar patterns...',
                value: searchQ,
                onChange: function (e) { setSearchQ(e.target.value); setExpandedIdx(-1); }
            })
        ),

        createElement('div', { className: 'grammar-list' },
            grammarCards.length > 0 ? grammarCards : createElement('p', { style: { textAlign: 'center', color: 'var(--text-muted)', padding: 40 } }, 'No grammar points found.')
        )
    );
}

function getGrammarMeaning(q, lang) {
    if (lang === 'vn' && q.meaning_vn) return q.meaning_vn;
    if (lang === 'my' && q.meaning_my) return q.meaning_my;
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
