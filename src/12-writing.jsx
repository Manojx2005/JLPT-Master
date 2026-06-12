import React from 'react';
const { useState, useEffect, useRef } = React;
const createElement = React.createElement;
import { fetchKanjiSvg, playAudio, sanitizeHTML, searchKanji, shuffleArray, t } from './01-core.jsx';
import { recognizeStrokes } from './10-handwriting.jsx';

/* =================================================================
   JLPT Master — Kanji writing practice
   A drill where the learner draws a kanji on a canvas and the app
   checks it. Two prompt modes (Recall: write from meaning/reading;
   Trace: copy a faint guide) and two ways to be marked correct
   (auto-check via the same Google handwriting recognizer used for
   search, plus a self-grade override). Reuses fetchKanjiSvg for the
   stroke-order answer and searchKanji for the prompt details.
   ================================================================= */

var KANJI_RE = /[一-龯㐀-䶿]/g;
var PAD_SIZE = 300;
var INK_COLOR = '#1a1a1a';
var INK_WIDTH = 5;

/* -----------------------------------------------------------------
   WritingPad — a drawing surface that records strokes in the format
   the recognizer expects ([[x...],[y...],[t...]] per stroke).
   • props.onStrokes(strokes)  — called whenever the strokes change
   • props.clearSignal         — bump this number to wipe the pad
   • props.guideSvg            — optional faint kanji shown behind ink
   ----------------------------------------------------------------- */
function WritingPad(props) {
    var canvasRef = useRef(null);
    var strokesRef = useRef([]);
    var currentRef = useRef(null);
    var startRef = useRef(0);
    var drawingRef = useRef(false);

    function getCtx() {
        var c = canvasRef.current;
        return c ? c.getContext('2d') : null;
    }

    function clear() {
        var c = canvasRef.current, ctx = getCtx();
        if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    }

    function redraw() {
        var ctx = getCtx();
        if (!ctx) return;
        clear();
        ctx.strokeStyle = INK_COLOR;
        ctx.lineWidth = INK_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokesRef.current.forEach(function (s) {
            var xs = s[0], ys = s[1];
            if (xs.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(xs[0], ys[0]);
            for (var i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
            ctx.stroke();
        });
    }

    // Wipe whenever the parent bumps clearSignal (also runs on mount).
    useEffect(function () {
        strokesRef.current = [];
        currentRef.current = null;
        clear();
    }, [props.clearSignal]);

    function emit() {
        if (props.onStrokes) props.onStrokes(strokesRef.current.slice());
    }

    // Convert pointer coords to canvas space, scaling for CSS resize
    // so drawing stays aligned on small/phone screens.
    function pos(e) {
        var c = canvasRef.current;
        var rect = c.getBoundingClientRect();
        return {
            x: Math.round((e.clientX - rect.left) * (c.width / rect.width)),
            y: Math.round((e.clientY - rect.top) * (c.height / rect.height))
        };
    }

    function down(e) {
        e.preventDefault();
        if (canvasRef.current && e.pointerId !== undefined) {
            try { canvasRef.current.setPointerCapture(e.pointerId); } catch (err) {}
        }
        drawingRef.current = true;
        if (strokesRef.current.length === 0) startRef.current = Date.now();
        var p = pos(e);
        currentRef.current = [[p.x], [p.y], [Date.now() - startRef.current]];
        var ctx = getCtx();
        if (ctx) {
            ctx.strokeStyle = INK_COLOR; ctx.lineWidth = INK_WIDTH;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(p.x, p.y);
        }
    }

    function move(e) {
        if (!drawingRef.current || !currentRef.current) return;
        e.preventDefault();
        var p = pos(e);
        var s = currentRef.current;
        s[0].push(p.x); s[1].push(p.y); s[2].push(Date.now() - startRef.current);
        var ctx = getCtx();
        if (ctx) { ctx.lineTo(p.x, p.y); ctx.stroke(); }
    }

    function up(e) {
        if (!drawingRef.current) return;
        e.preventDefault();
        drawingRef.current = false;
        if (currentRef.current && currentRef.current[0].length > 0) {
            strokesRef.current.push(currentRef.current);
        }
        currentRef.current = null;
        emit();
    }

    function undo() {
        strokesRef.current = strokesRef.current.slice(0, -1);
        redraw();
        emit();
    }

    function wipe() {
        strokesRef.current = [];
        currentRef.current = null;
        clear();
        emit();
    }

    return createElement('div', { style: { display: 'inline-flex', flexDirection: 'column', gap: 10, alignItems: 'center' } },
        createElement('div', { className: 'writing-pad', style: { width: PAD_SIZE, height: PAD_SIZE, maxWidth: '100%' } },
            props.guideSvg ? createElement('div', {
                className: 'writing-guide', dangerouslySetInnerHTML: { __html: sanitizeHTML(props.guideSvg) }
            }) : null,
            createElement('canvas', {
                ref: canvasRef, width: PAD_SIZE, height: PAD_SIZE,
                className: 'writing-pad__canvas',
                onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerLeave: up
            })
        ),
        createElement('div', { style: { display: 'flex', gap: 8 } },
            createElement('button', { className: 'btn btn--small btn--outline', onClick: undo }, '↩ ' + t('Undo', props.appLang)),
            createElement('button', { className: 'btn btn--small btn--outline', onClick: wipe }, '🗑 ' + t('Clear', props.appLang))
        )
    );
}

/* -----------------------------------------------------------------
   KanjiWritingTab — the practice drill.
   ----------------------------------------------------------------- */
function KanjiWritingTab(props) {
    var _level = useState('N5');
    var level = _level[0], setLevel = _level[1];

    var _mode = useState('recall'); // 'recall' | 'trace'
    var mode = _mode[0], setMode = _mode[1];

    var _phase = useState('setup'); // 'setup' | 'loading' | 'active' | 'result'
    var phase = _phase[0], setPhase = _phase[1];

    var _items = useState([]);
    var items = _items[0], setItems = _items[1];

    var _index = useState(0);
    var index = _index[0], setIndex = _index[1];

    var _score = useState(0);
    var score = _score[0], setScore = _score[1];

    var _strokes = useState([]);
    var strokes = _strokes[0], setStrokes = _strokes[1];

    var _check = useState('idle'); // 'idle' | 'checking' | 'correct' | 'wrong'
    var check = _check[0], setCheck = _check[1];

    var _revealed = useState(false);
    var revealed = _revealed[0], setRevealed = _revealed[1];

    var _clearSignal = useState(0);
    var clearSignal = _clearSignal[0], setClearSignal = _clearSignal[1];

    // Build a shuffled pool of unique kanji from the chosen source.
    function buildPool() {
        var words;
        if (level === 'Saved') words = (props.savedWords || []).map(function (w) { return w.word; });
        else if (level === 'All') words = JLPT_VOCAB.map(function (w) { return w.word; });
        else words = JLPT_VOCAB.filter(function (w) { return w.level === level; }).map(function (w) { return w.word; });

        var out = [], seen = {};
        words.forEach(function (w) {
            var ks = (w || '').match(KANJI_RE) || [];
            ks.forEach(function (k) { if (!seen[k]) { seen[k] = true; out.push(k); } });
        });
        return shuffleArray(out);
    }

    function resetItem() {
        setStrokes([]);
        setCheck('idle');
        setRevealed(false);
        setClearSignal(function (s) { return s + 1; });
    }

    async function start() {
        var pool = buildPool().slice(0, 10);
        if (pool.length === 0) {
            alert(t('No kanji available for this selection. Try another level.', props.appLang));
            return;
        }
        setPhase('loading');
        var loaded = await Promise.all(pool.map(async function (k) {
            var svgP = fetchKanjiSvg(k);
            var data = await searchKanji(k);
            var svg = await svgP;
            return {
                kanji: k,
                meanings: (data && data.meanings) || [],
                kun: (data && data.kun_readings) || [],
                on: (data && data.on_readings) || [],
                svg: svg || ''
            };
        }));
        setItems(loaded);
        setIndex(0);
        setScore(0);
        resetItem();
        setPhase('active');
    }

    var item = items[index];

    async function runCheck() {
        if (!strokes.length || check === 'checking') return;
        setCheck('checking');
        var cands = await recognizeStrokes(strokes).catch(function () { return []; });
        if (cands.indexOf(item.kanji) !== -1) {
            setScore(function (s) { return s + 1; });
            setCheck('correct');
            setRevealed(true);
            playAudio(item.kanji);
        } else {
            setCheck('wrong');
        }
    }

    // Self-grade override: the recognizer missed it but the user knows
    // they wrote it correctly. Only credits once.
    function gradeRight() {
        if (check !== 'correct') setScore(function (s) { return s + 1; });
        setCheck('correct');
        setRevealed(true);
    }

    function next() {
        if (index + 1 >= items.length) { setPhase('result'); return; }
        setIndex(function (i) { return i + 1; });
        resetItem();
    }

    /* ---------- Result screen ---------- */
    if (phase === 'result') {
        var pct = Math.round((score / items.length) * 100);
        return createElement('div', { className: 'glass-card' },
            createElement('div', { className: 'result-panel' },
                createElement('div', { className: 'result-panel__emoji' }, pct >= 70 ? '🎉' : '✍️'),
                createElement('div', { className: 'result-panel__title' }, pct >= 70 ? t('Great Job!', props.appLang) : t('Keep Practicing!', props.appLang)),
                createElement('div', { style: { fontSize: '2rem', fontWeight: 700, margin: '16px 0' } }, pct + '%'),
                createElement('div', { style: { color: 'var(--text-secondary)' } }, score + ' / ' + items.length + ' ' + t('correct', props.appLang)),
                createElement('button', { className: 'btn btn--primary', onClick: function () { setPhase('setup'); }, style: { marginTop: 20 } }, '↻ ' + t('Try Again', props.appLang))
            )
        );
    }

    /* ---------- Loading ---------- */
    if (phase === 'loading') {
        return createElement('div', { className: 'glass-card' },
            createElement('div', { style: { textAlign: 'center', padding: 60, fontSize: '1.1rem', color: 'var(--text-muted)' } },
                t('Preparing your writing set…', props.appLang))
        );
    }

    /* ---------- Active drill ---------- */
    if (phase === 'active' && item) {
        var readings = item.kun.concat(item.on).slice(0, 4).join('、');
        var meaningStr = item.meanings.slice(0, 4).join(', ');
        var showGuide = mode === 'trace'; // faint guide only in trace mode

        var statusEl = null;
        if (check === 'checking') statusEl = createElement('div', { className: 'writing-status' }, t('Checking…', props.appLang));
        else if (check === 'correct') statusEl = createElement('div', { className: 'writing-status writing-status--ok' }, '✓ ' + t('Correct!', props.appLang));
        else if (check === 'wrong') statusEl = createElement('div', { className: 'writing-status writing-status--bad' }, '✗ ' + t('Not recognized — try again or reveal the answer.', props.appLang));

        // The animated stroke-order answer, shown after reveal/correct.
        var answerEl = (revealed && item.svg) ? createElement('div', { className: 'writing-answer' },
            createElement('div', { className: 'kanji-large-display', style: { margin: '0 auto', cursor: 'pointer' }, onClick: function () { playAudio(item.kanji); } },
                createElement('div', { className: 'kanji-svg-container', dangerouslySetInnerHTML: { __html: sanitizeHTML(item.svg) } })
            ),
            createElement('div', { style: { textAlign: 'center', marginTop: 6, fontSize: '0.85rem', color: 'var(--text-muted)' } }, meaningStr)
        ) : null;

        // Action buttons depend on the check state.
        var actions;
        if (check === 'correct') {
            actions = createElement('button', { className: 'btn btn--primary btn--full', onClick: next, style: { marginTop: 14 } },
                index + 1 >= items.length ? t('View Results', props.appLang) + ' →' : t('Next', props.appLang) + ' →');
        } else if (check === 'wrong') {
            actions = createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 } },
                !revealed ? createElement('button', { className: 'btn btn--outline', onClick: function () { setRevealed(true); } }, '👁 ' + t('Reveal answer', props.appLang)) : null,
                revealed ? createElement('button', { className: 'btn btn--outline', onClick: gradeRight }, '✓ ' + t('I wrote it right', props.appLang)) : null,
                createElement('button', { className: 'btn btn--primary', onClick: next }, index + 1 >= items.length ? t('View Results', props.appLang) + ' →' : t('Skip', props.appLang) + ' →')
            );
        } else {
            actions = createElement('button', {
                className: 'btn btn--primary btn--full', onClick: runCheck,
                disabled: !strokes.length, style: { marginTop: 14 }
            }, '✓ ' + t('Check', props.appLang));
        }

        return createElement('div', { className: 'glass-card' },
            createElement('div', { className: 'flashcard-header' },
                createElement('button', { className: 'quiz-bar__back', onClick: function () { setPhase('setup'); } }, '←'),
                createElement('span', null, (index + 1) + ' / ' + items.length),
                createElement('span', null, score + ' ✓')
            ),
            createElement('div', { className: 'progress-track' },
                createElement('div', { className: 'progress-fill', style: { width: ((index + 1) / items.length * 100) + '%' } })
            ),

            // Prompt: what to write
            createElement('div', { className: 'writing-prompt' },
                createElement('div', { className: 'writing-prompt__label' }, mode === 'trace' ? t('Trace this kanji', props.appLang) : t('Write the kanji for:', props.appLang)),
                createElement('div', { className: 'writing-prompt__meaning' }, meaningStr || '—'),
                readings ? createElement('div', { className: 'writing-prompt__reading', lang: 'ja' }, readings) : null
            ),

            createElement('div', { style: { textAlign: 'center', marginTop: 16 } },
                createElement(WritingPad, { onStrokes: setStrokes, clearSignal: clearSignal, guideSvg: showGuide ? item.svg : null, appLang: props.appLang })
            ),

            statusEl,
            answerEl,
            actions
        );
    }

    /* ---------- Setup ---------- */
    var levels = ['N5', 'N4', 'N3', 'N2', 'N1', 'All'];
    if (props.savedWords && props.savedWords.length > 0) levels.push('Saved');

    var levelBtns = levels.map(function (lv) {
        return createElement('button', {
            key: lv,
            className: 'level-btn' + (level === lv ? ' level-btn--active' : ''),
            onClick: function () { setLevel(lv); }
        }, lv === 'Saved' ? t('Saved', props.appLang) : lv);
    });

    var modeBtns = [
        { id: 'recall', label: '🧠 ' + t('Recall', props.appLang) },
        { id: 'trace', label: '✏️ ' + t('Trace', props.appLang) }
    ].map(function (m) {
        return createElement('button', {
            key: m.id,
            className: 'mode-btn' + (mode === m.id ? ' mode-btn--active' : ''),
            onClick: function () { setMode(m.id); }
        }, m.label);
    });

    return createElement('div', { className: 'glass-card', key: 'writing' },
        createElement('h2', { className: 'section-title' }, t('Kanji Writing Practice', props.appLang)),
        createElement('p', { className: 'section-desc' }, t('Draw kanji by hand and get instant feedback. Recall mode hides the character; Trace mode shows a guide to copy.', props.appLang)),

        createElement('h3', { className: 'setup-label' }, t('Select Level', props.appLang)),
        createElement('div', { className: 'level-selector' }, levelBtns),

        createElement('h3', { className: 'setup-label' }, t('Mode', props.appLang)),
        createElement('div', { className: 'mode-selector' }, modeBtns),

        createElement('div', { className: 'setup-center' },
            createElement('button', { className: 'btn btn--primary btn--large btn--glow', onClick: start, style: { marginTop: 20 } }, '▶  ' + t('Start Practice', props.appLang))
        )
    );
}

export { KanjiWritingTab };
