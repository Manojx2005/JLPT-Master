import React from 'react';
const { useState, useEffect, useRef, useCallback, useMemo } = React;
const createElement = React.createElement;
import { generateOptions, getVocabMeaning, t } from './01-core.jsx';
import { CustomSelect } from './05-exams.jsx';

/* =================================================================
   JLPT Master — Multiplayer head-to-head quiz
   Part of the app, split from the original app.js for readability.
   Uses React 18 via CDN (React.createElement, no JSX/build step).
   All components share the global scope and load in order (see index.html).
   ================================================================= */

/* -----------------------------------------------------------------
   MultiplayerTab — Real-time Head-to-Head Quiz
   ----------------------------------------------------------------- */
function MultiplayerTab(props) {
    var _state = useState({ phase: 'lobby', code: '', isHost: false, room: null, error: '' });
    var state = _state[0], setState = _state[1];

    var _codeIn = useState('');
    var codeIn = _codeIn[0], setCodeIn = _codeIn[1];

    var _quizState = useState({
        qIndex: 0,
        score: 0,
        questions: [],
        options: []
    });
    var quizState = _quizState[0], setQuizState = _quizState[1];

    var _roomConfig = useState({ level: 'All', mode: 'meaning', count: 10 });
    var roomConfig = _roomConfig[0], setRoomConfig = _roomConfig[1];

    var _timeLeft = useState(5);
    var timeLeft = _timeLeft[0], setTimeLeft = _timeLeft[1];
    var handleAnswerRef = useRef(null);
    var hasPlayedRef = useRef(false);
    if (state.phase === 'playing' || state.phase === 'results') {
        hasPlayedRef.current = true;
    }

    var profile = typeof LEADERBOARD_API !== 'undefined' ? LEADERBOARD_API.getProfile() : null;

    useEffect(function() {
        if (state.room && state.room.state === 'playing' && state.phase === 'waiting') {
            // Generate deterministic questions from seed
            var seedStr = state.room.seed.toString();
            var h = 0;
            for (var i = 0; i < seedStr.length; i++) h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
            
            var config = state.room.config || { level: 'All', mode: 'meaning', count: 10 };
            var pool = props.questions.filter(function(q) {
                return config.level === 'All' ? true : q.level === config.level;
            });
            if (pool.length === 0) pool = props.questions;
            
            // pseudo-random shuffle based on seed
            var m = pool.length, t, j;
            while (m) {
                h = Math.imul(31, h) + 1 | 0;
                j = Math.abs(h) % m--;
                t = pool[m];
                pool[m] = pool[j];
                pool[j] = t;
            }
            var picked = pool.slice(0, 10);
            
            setState(function(s) { return Object.assign({}, s, { phase: 'playing' }); });
            setQuizState({
                qIndex: 0,
                score: 0,
                questions: picked,
                options: generateOptions(picked[0], props.questions, config.mode, props.appLang)
            });
        }
    }, [state.room, state.phase]);

    useEffect(function() {
        return function() {
            if (state.code && !hasPlayedRef.current) {
                MULTIPLAYER_API.stopListening(state.code);
                MULTIPLAYER_API.leaveRoom(state.code);
            }
        };
    }, [state.code]);

    useEffect(function() {
        if (state.phase === 'playing' && state.code) {
            if (MULTIPLAYER_API.markPlaying) MULTIPLAYER_API.markPlaying(state.code);
        }
    }, [state.phase, state.code]);

    useEffect(function() {
        if (state.phase === 'playing') {
            setTimeLeft(5);
            var timer = setInterval(function() {
                setTimeLeft(function(prev) {
                    if (prev <= 1) {
                        clearInterval(timer);
                        if (handleAnswerRef.current) handleAnswerRef.current(null);
                        return 5;
                    }
                    return prev - 1;
                });
            }, 1000);
            return function() { clearInterval(timer); };
        }
    }, [state.phase, quizState.qIndex]);

    useEffect(function() {
        if (state.phase === 'waiting' && state.room) {
            var players = state.room.players ? Object.keys(state.room.players).map(function(k) { return state.room.players[k]; }) : [];
            if (players.length >= 2 && players.every(function(p) { return p.ready; })) {
                MULTIPLAYER_API.startGame(state.code);
            }
        }
    }, [state.room, state.phase, state.code]);

    function handleCreate() {
        setState(Object.assign({}, state, { error: '', phase: 'creating' }));
        MULTIPLAYER_API.createRoom(roomConfig).then(function(code) {
            setState(Object.assign({}, state, { phase: 'waiting', code: code, isHost: true }));
            MULTIPLAYER_API.listenRoom(code, function(roomData) {
                setState(function(s) { return Object.assign({}, s, { room: roomData }); });
            });
        }).catch(function(e) {
            setState(Object.assign({}, state, { error: e.message, phase: 'lobby' }));
        });
    }

    function handleJoin() {
        if (!codeIn.trim()) return;
        setState(Object.assign({}, state, { error: '', phase: 'joining' }));
        MULTIPLAYER_API.joinRoom(codeIn.trim()).then(function(code) {
            setState(Object.assign({}, state, { phase: 'waiting', code: code, isHost: false }));
            MULTIPLAYER_API.listenRoom(code, function(roomData) {
                setState(function(s) { return Object.assign({}, s, { room: roomData }); });
            });
        }).catch(function(e) {
            setState(Object.assign({}, state, { error: e.message, phase: 'lobby' }));
        });
    }

    function handleFindMatch() {
        setState(Object.assign({}, state, { error: '', phase: 'joining' }));
        MULTIPLAYER_API.findPublicMatch(roomConfig).then(function(code) {
            setState(Object.assign({}, state, { phase: 'waiting', code: code }));
            MULTIPLAYER_API.listenRoom(code, function(roomData) {
                setState(function(s) { return Object.assign({}, s, { room: roomData, isHost: profile && roomData.hostId === profile.id }); });
            });
        }).catch(function(e) {
            setState(Object.assign({}, state, { error: e.message, phase: 'lobby' }));
        });
    }

    function handleReady() {
        MULTIPLAYER_API.setReady(state.code);
    }

    handleAnswerRef.current = handleAnswer;
    function handleAnswer(opt) {
        var config = state.room.config || { level: 'All', mode: 'meaning', count: 10 };
        var correct = config.mode === 'reading' ? quizState.questions[quizState.qIndex].reading : getVocabMeaning(quizState.questions[quizState.qIndex], props.appLang);
        var isCorrect = opt === correct;
        var newScore = quizState.score + (isCorrect ? 100 : 0);
        
        MULTIPLAYER_API.updateScore(state.code, newScore);
        
        var nextIdx = quizState.qIndex + 1;
        if (nextIdx >= quizState.questions.length) {
            MULTIPLAYER_API.setFinished(state.code, newScore);
            setState(function(s) { return Object.assign({}, s, { phase: 'results' }); });
        } else {
            setQuizState({
                qIndex: nextIdx,
                score: newScore,
                questions: quizState.questions,
                options: generateOptions(quizState.questions[nextIdx], props.questions, config.mode, props.appLang)
            });
        }
    }

    if (state.phase === 'lobby') {
        return createElement('div', { className: 'glass-card', style: { overflow: 'visible' } },
            createElement('h2', { className: 'section-title' }, '⚔️ Multiplayer Quiz'),
            createElement('p', { className: 'section-desc' }, 'Race against your friends or find a public match!'),
            state.error ? createElement('div', { style: { color: 'var(--accent-red)', marginBottom: 15 } }, state.error) : null,
            
            createElement('div', { style: { display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap', alignItems: 'flex-start', background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' } },
                createElement('div', { style: { flex: 1, minWidth: '180px' } },
                    createElement('strong', { style: { display: 'block', marginBottom: '10px', color: 'var(--text-secondary)' } }, 'Level:'),
                    createElement(CustomSelect, { 
                        width: '100%',
                        value: roomConfig.level, 
                        onChange: function(val) { setRoomConfig(Object.assign({}, roomConfig, { level: val })); },
                        options: [
                            { value: 'All', label: 'All Levels (Mixed)' },
                            { value: 'N5', label: 'JLPT N5 (Beginner)' },
                            { value: 'N4', label: 'JLPT N4 (Basic)' },
                            { value: 'N3', label: 'JLPT N3 (Intermediate)' },
                            { value: 'N2', label: 'JLPT N2 (Advanced)' },
                            { value: 'N1', label: 'JLPT N1 (Fluent)' }
                        ]
                    })
                ),
                createElement('div', { style: { flex: 1, minWidth: '180px' } },
                    createElement('strong', { style: { display: 'block', marginBottom: '10px', color: 'var(--text-secondary)' } }, 'Game Mode:'),
                    createElement(CustomSelect, { 
                        width: '100%',
                        value: roomConfig.mode, 
                        onChange: function(val) { setRoomConfig(Object.assign({}, roomConfig, { mode: val })); },
                        options: [
                            { value: 'meaning', label: '📖 Guess the Meaning' },
                            { value: 'reading', label: '🗣️ Guess the Reading' }
                        ]
                    })
                )
            ),

            createElement('div', { style: { display: 'flex', gap: 15, marginTop: 20, flexWrap: 'wrap' } },
                createElement('button', { className: 'btn btn--primary', onClick: handleFindMatch, style: { background: 'linear-gradient(135deg, #10b981, #3b82f6)' } }, '🌍 Find Public Match'),
                createElement('button', { className: 'btn btn--primary', onClick: handleCreate }, 'Create Private Room'),
                createElement('div', { style: { display: 'flex', gap: 10 } },
                    createElement('input', { className: 'input-field', placeholder: 'Enter 4-digit code', value: codeIn, onChange: function(e) { setCodeIn(e.target.value); } }),
                    createElement('button', { className: 'btn btn--outline', onClick: handleJoin }, 'Join')
                )
            )
        );
    }

    if (state.phase === 'waiting') {
        var players = state.room && state.room.players ? Object.keys(state.room.players).map(function(k) { return state.room.players[k]; }) : [];
        var isPublic = state.room && state.room.isPublic;
        var myPlayer = state.room && profile ? state.room.players[profile.id] : null;
        var isReady = myPlayer ? myPlayer.ready : false;

        return createElement('div', { className: 'glass-card' },
            createElement('h2', { className: 'section-title' }, isPublic ? 'Public Match' : 'Waiting Room: ' + state.code),
            createElement('p', { className: 'section-desc' }, isPublic ? 'Waiting for an opponent to join...' : 'Share this code with your friends.'),
            createElement('div', { style: { display: 'flex', gap: 15, flexWrap: 'wrap', margin: '20px 0' } },
                players.map(function(p, i) {
                    return createElement('div', { key: i, style: { background: 'rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 } },
                        createElement('span', null, p.avatar || '👤'),
                        createElement('strong', null, p.name),
                        p.ready ? createElement('span', { style: { color: 'var(--accent-green)' } }, '✓') : null
                    );
                })
            ),
            createElement('div', { style: { marginTop: 20 } },
                !isReady ? createElement('button', { className: 'btn btn--primary', onClick: handleReady }, 'Ready') 
                : createElement('p', { style: { color: 'var(--accent-green)', fontWeight: 'bold' } }, '✓ Ready! Waiting for others...')
            )
        );
    }

    if (state.phase === 'playing') {
        var players = state.room && state.room.players ? Object.keys(state.room.players).map(function(k) { return state.room.players[k]; }) : [];
        var currQ = quizState.questions[quizState.qIndex];
        
        var progressPct = (timeLeft / 5) * 100;
        var timerColor = timeLeft <= 2 ? 'var(--accent-red)' : 'var(--accent-green)';
        var timerEl = createElement('div', { style: { width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginBottom: '20px', overflow: 'hidden' } },
            createElement('div', { style: { width: progressPct + '%', height: '100%', background: timerColor, transition: 'width 1s linear, background-color 0.3s ease' } })
        );

        return createElement('div', { className: 'glass-card' },
            createElement('div', { style: { display: 'flex', gap: 15, marginBottom: 20, padding: 15, background: 'rgba(0,0,0,0.2)', borderRadius: 12, overflowX: 'auto' } },
                players.map(function(p, i) {
                    var isMe = p.name === profile.name;
                    return createElement('div', { key: i, style: { textAlign: 'center', opacity: p.finished ? 0.5 : 1 } },
                        createElement('div', { style: { fontSize: '1.5rem' } }, p.avatar),
                        createElement('div', { style: { fontWeight: isMe ? 'bold' : 'normal' } }, p.score),
                        p.finished ? createElement('div', { style: { fontSize: '0.7rem', color: 'var(--accent-green)' } }, 'Done') : null
                    );
                })
            ),

            createElement('div', { className: 'quiz-question' },
                timerEl,
                createElement('div', { className: 'quiz-question__word' }, currQ.word),
                (currQ.reading && state.room.config.mode !== 'reading' && !(state.room.config.mode === 'meaning' && ['N3', 'N2', 'N1'].includes(currQ.level))) ? createElement('div', { className: 'quiz-question__reading' }, currQ.reading) : null
            ),
            createElement('div', { className: 'quiz-options' },
                quizState.options.map(function(opt, i) {
                    return createElement('button', {
                        key: i,
                        className: 'quiz-option',
                        onClick: function() { handleAnswer(opt); }
                    }, opt);
                })
            )
        );
    }

    if (state.phase === 'results') {
        var players = state.room && state.room.players ? Object.keys(state.room.players).map(function(k) { return state.room.players[k]; }) : [];
        players.sort(function(a, b) { return b.score - a.score; });
        
        return createElement('div', { className: 'glass-card', style: { textAlign: 'center' } },
            createElement('h2', { className: 'section-title' }, 'Game Over!'),
            createElement('div', { style: { marginTop: 30, display: 'flex', flexDirection: 'column', gap: 15 } },
                players.map(function(p, i) {
                    var rankIcon = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👏';
                    return createElement('div', { key: i, style: { background: 'rgba(255,255,255,0.1)', padding: '15px 20px', borderRadius: 12, display: 'flex', justifyContent: 'space-between', fontSize: i === 0 ? '1.2rem' : '1rem', fontWeight: i === 0 ? 'bold' : 'normal' } },
                        createElement('span', null, rankIcon + ' ' + p.avatar + ' ' + p.name),
                        createElement('span', null, p.score + ' pts')
                    );
                })
            ),
            createElement('button', { className: 'btn btn--outline', style: { marginTop: 30 }, onClick: function() { 
                MULTIPLAYER_API.stopListening(state.code);
                setState({ phase: 'lobby', code: '', isHost: false, room: null, error: '' }); 
            } }, 'Back to Lobby')
        );
    }

    return null;
}


export { MultiplayerTab };
