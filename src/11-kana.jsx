import React, { useState, useEffect, useRef } from 'react';
import { fetchKanjiSvg, playAudio, sanitizeHTML, shuffleArray, t } from './01-core.jsx';

/* =================================================================
   JLPT Master — Hiragana & Katakana learning
   Three things in one tab:
     1. Interactive goj�on charts (tap a kana to hear it + see how
        to write it via animated KanjiVG stroke order).
     2. A "How to write" detail panel (stroke order + audio).
     3. A practice quiz (see a kana, pick the romaji).
   KanjiVG is indexed by Unicode codepoint, so the same stroke-order
   fetch used for kanji works for kana too � no extra data needed.
   ================================================================= */

/* Each cell: [romaji, hiragana, katakana]. Empty string = gap in the
   classic goj�on grid (e.g. yi/ye/wu never existed as distinct kana). */
var GOJUON = [
    ['a', 'あ', 'ア'], ['i', 'い', 'イ'], ['u', 'う', 'ウ'], ['e', 'え', 'エ'], ['o', 'お', 'オ'],
    ['ka', 'か', 'カ'], ['ki', 'き', 'キ'], ['ku', 'く', 'ク'], ['ke', 'け', 'ケ'], ['ko', 'こ', 'コ'],
    ['sa', 'さ', 'サ'], ['shi', 'し', 'シ'], ['su', 'す', 'ス'], ['se', 'せ', 'セ'], ['so', 'そ', 'ソ'],
    ['ta', 'た', 'タ'], ['chi', 'ち', 'チ'], ['tsu', 'つ', 'ツ'], ['te', 'て', 'テ'], ['to', 'と', 'ト'],
    ['na', 'な', 'ナ'], ['ni', 'に', 'ニ'], ['nu', 'ぬ', 'ヌ'], ['ne', 'ね', 'ネ'], ['no', 'の', 'ノ'],
    ['ha', 'は', 'ハ'], ['hi', 'ひ', 'ヒ'], ['fu', 'ふ', 'フ'], ['he', 'へ', 'ヘ'], ['ho', 'ほ', 'ホ'],
    ['ma', 'ま', 'マ'], ['mi', 'み', 'ミ'], ['mu', 'む', 'ム'], ['me', 'め', 'メ'], ['mo', 'も', 'モ'],
    ['ya', 'や', 'ヤ'], ['', '', ''], ['yu', 'ゆ', 'ユ'], ['', '', ''], ['yo', 'よ', 'ヨ'],
    ['ra', 'ら', 'ラ'], ['ri', 'り', 'リ'], ['ru', 'る', 'ル'], ['re', 'れ', 'レ'], ['ro', 'ろ', 'ロ'],
    ['wa', 'わ', 'ワ'], ['', '', ''], ['', '', ''], ['', '', ''], ['wo', 'を', 'ヲ'],
    ['n', 'ん', 'ン'], ['', '', ''], ['', '', ''], ['', '', ''], ['', '', '']
];

/* Dakuten / handakuten (voiced) rows. */
var DAKUTEN = [
    ['ga', 'が', 'ガ'], ['gi', 'ぎ', 'ギ'], ['gu', 'ぐ', 'グ'], ['ge', 'げ', 'ゲ'], ['go', 'ご', 'ゴ'],
    ['za', 'ざ', 'ザ'], ['ji', 'じ', 'ジ'], ['zu', 'ず', 'ズ'], ['ze', 'ぜ', 'ゼ'], ['zo', 'ぞ', 'ゾ'],
    ['da', 'だ', 'ダ'], ['ji', 'ぢ', 'ヂ'], ['zu', 'づ', 'ヅ'], ['de', 'で', 'デ'], ['do', 'ど', 'ド'],
    ['ba', 'ば', 'バ'], ['bi', 'び', 'ビ'], ['bu', 'ぶ', 'ブ'], ['be', 'べ', 'ベ'], ['bo', 'ぼ', 'ボ'],
    ['pa', 'ぱ', 'パ'], ['pi', 'ぴ', 'ピ'], ['pu', 'ぷ', 'プ'], ['pe', 'ぺ', 'ペ'], ['po', 'ぽ', 'ポ']
];

/* Y�on (contracted) combinations. */
var YOON = [
    ['kya', 'きゃ', 'キャ'], ['kyu', 'きゅ', 'キュ'], ['kyo', 'きょ', 'キョ'],
    ['sha', 'しゃ', 'シャ'], ['shu', 'しゅ', 'シュ'], ['sho', 'しょ', 'ショ'],
    ['cha', 'ちゃ', 'チャ'], ['chu', 'ちゅ', 'チュ'], ['cho', 'ちょ', 'チョ'],
    ['nya', 'にゃ', 'ニャ'], ['nyu', 'にゅ', 'ニュ'], ['nyo', 'にょ', 'ニョ'],
    ['hya', 'ひゃ', 'ヒャ'], ['hyu', 'ひゅ', 'ヒュ'], ['hyo', 'ひょ', 'ヒョ'],
    ['mya', 'みゃ', 'ミャ'], ['myu', 'みゅ', 'ミュ'], ['myo', 'みょ', 'ミョ'],
    ['rya', 'りゃ', 'リャ'], ['ryu', 'りゅ', 'リュ'], ['ryo', 'りょ', 'リョ'],
    ['gya', 'ぎゃ', 'ギャ'], ['gyu', 'ぎゅ', 'ギュ'], ['gyo', 'ぎょ', 'ギョ'],
    ['ja', 'じゃ', 'ジャ'], ['ju', 'じゅ', 'ジュ'], ['jo', 'じょ', 'ジョ'],
    ['bya', 'びゃ', 'ビャ'], ['byu', 'びゅ', 'ビュ'], ['byo', 'びょ', 'ビョ'],
    ['pya', 'ぴゃ', 'ピャ'], ['pyu', 'ぴゅ', 'ピュ'], ['pyo', 'ぴょ', 'ピョ']
];

/* All real (non-gap) cells for the chosen script � used to build the quiz pool. */
function flatCells(script) {
    var idx = script === 'katakana' ? 2 : 1;
    var all = GOJUON.concat(DAKUTEN).concat(YOON);
    var out = [];
    for (var i = 0; i < all.length; i++) {
        if (all[i][idx]) out.push({ romaji: all[i][0], kana: all[i][idx] });
    }
    // De-duplicate kana (ji/zu appear twice in the syllabary).
    var seen = {};
    return out.filter(function (c) {
        if (seen[c.kana]) return false;
        seen[c.kana] = true;
        return true;
    });
}

/* -----------------------------------------------------------------
   StrokeViewer � fetches and renders the animated KanjiVG stroke
   order for a single kana. Replays the animation on demand by
   re-keying the SVG container so the CSS animation restarts.
   ----------------------------------------------------------------- */
function StrokeViewer(props) {
    var _svg = useState('');
    var svg = _svg[0], setSvg = _svg[1];

    var _loading = useState(true);
    var loading = _loading[0], setLoading = _loading[1];

    var _replay = useState(0);
    var replay = _replay[0], setReplay = _replay[1];

    useEffect(function () {
        var alive = true;
        setLoading(true);
        setSvg('');
        fetchKanjiSvg(props.kana).then(function (s) {
            if (!alive) return;
            setSvg(s || '');
            setLoading(false);
        });
        return function () { alive = false; };
    }, [props.kana]);

    return <div style={{
  textAlign: 'center'
}}><div className='kanji-large-display' style={{
    margin: '0 auto',
    position: 'relative',
    cursor: 'pointer'
  }} onClick={() => {
    playAudio(props.kana);
    setReplay(function (r) {
      return r + 1;
    });
  }} title='Tap to replay'>{loading ? <span style={{
      fontSize: '0.8rem',
      color: 'var(--text-muted)'
    }}>…</span> : svg ? <div key={replay} className='kanji-svg-container' dangerouslySetInnerHTML={{
      __html: sanitizeHTML(svg)
    }} /> : <span>{props.kana}</span>}</div><div style={{
    marginTop: 8,
    fontSize: '1.1rem',
    fontWeight: 700,
    letterSpacing: '0.05em'
  }}>{props.romaji}</div><div style={{
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12
  }}><button className='btn btn--outline btn--small' onClick={() => {
      setReplay(function (r) {
        return r + 1;
      });
    }}>↺ Replay strokes</button><button className='btn btn--outline btn--small' onClick={() => {
      playAudio(props.kana);
    }}>🔊 Sound</button></div></div>;
}

/* -----------------------------------------------------------------
   KanaChart � renders one grid section (goj�on / dakuten / y�on).
   ----------------------------------------------------------------- */
function KanaChart(props) {
    var idx = props.script === 'katakana' ? 2 : 1;
    var cols = props.cols || 5;

    var cells = props.rows.map(function (row, i) {
        var kana = row[idx];
        var romaji = row[0];
        if (!kana) {
            return <div key={i} className='kana-cell kana-cell--empty' />;
        }
        var isActive = props.selected === kana;
        return <button key={i} className={'kana-cell' + (isActive ? ' kana-cell--active' : '')} onClick={() => {
  props.onPick(kana, romaji);
}}><span className='kana-cell__char' lang='ja'>{kana}</span><span className='kana-cell__romaji'>{romaji}</span></button>;
    });

    return <div className='kana-section'>{props.title ? <h3 className='setup-label'>{props.title}</h3> : null}<div className='kana-grid' style={{
    gridTemplateColumns: 'repeat(' + cols + ', 1fr)'
  }}>{cells}</div></div>;
}

/* -----------------------------------------------------------------
   KanaQuiz � shows a kana, the learner picks the matching romaji.
   Grading note: we compare on romaji (not the kana itself) because
   several kana share a romaji (じ/ぢ = "ji", ず/づ = "zu"). Comparing
   the picked option's romaji to the prompt's romaji marks both
   readings correct, which is what a learner expects.
   ----------------------------------------------------------------- */
function KanaQuiz(props) {
    var QUESTION_COUNT = 12;

    function buildQuestions() {
        var pool = flatCells(props.script);
        var picked = shuffleArray(pool).slice(0, QUESTION_COUNT);
        return picked.map(function (q) {
            var distractors = shuffleArray(pool.filter(function (c) { return c.romaji !== q.romaji; }))
                .slice(0, 3)
                .map(function (c) { return c.romaji; });
            return { kana: q.kana, romaji: q.romaji, options: shuffleArray([q.romaji].concat(distractors)) };
        });
    }

    var _questions = useState(buildQuestions);
    var questions = _questions[0], setQuestions = _questions[1];

    var _idx = useState(0);
    var idx = _idx[0], setIdx = _idx[1];

    var _picked = useState(null);
    var picked = _picked[0], setPicked = _picked[1];

    var _score = useState(0);
    var score = _score[0], setScore = _score[1];

    var _done = useState(false);
    var done = _done[0], setDone = _done[1];

    function restart() {
        setQuestions(buildQuestions());
        setIdx(0); setPicked(null); setScore(0); setDone(false);
    }

    function choose(opt) {
        if (picked !== null) return;
        setPicked(opt);
        if (opt === questions[idx].romaji) setScore(function (s) { return s + 1; });
        playAudio(questions[idx].kana);
    }

    function next() {
        if (idx + 1 >= questions.length) { setDone(true); return; }
        setIdx(function (i) { return i + 1; });
        setPicked(null);
    }

    if (done) {
        var pct = Math.round((score / questions.length) * 100);
        return <div className='result-panel'><div className='result-panel__emoji'>{pct >= 70 ? '🎉' : '📚'}</div><div className='result-panel__title'>{pct >= 70 ? t('Great Job!', props.appLang) : t('Keep Practicing!', props.appLang)}</div><div style={{
    fontSize: '2rem',
    fontWeight: 700,
    margin: '16px 0'
  }}>{pct + '%'}</div><div style={{
    color: 'var(--text-secondary)'
  }}>{score + ' / ' + questions.length + ' ' + t('correct', props.appLang)}</div><button className='btn btn--primary' onClick={restart} style={{
    marginTop: 20
  }}>{'↻ ' + t('Try Again', props.appLang)}</button></div>;
    }

    var q = questions[idx];
    var optionBtns = q.options.map(function (opt) {
        var cls = 'btn btn--outline kana-quiz__option';
        if (picked !== null) {
            if (opt === q.romaji) cls += ' kana-quiz__option--correct';
            else if (opt === picked) cls += ' kana-quiz__option--wrong';
        }
        return <button key={opt} className={cls} onClick={() => {
  choose(opt);
}}>{opt}</button>;
    });

    return <div><div className='flashcard-header'><button className='quiz-bar__back' onClick={props.onExit}>←</button><span>{idx + 1 + ' / ' + questions.length}</span><span>{score + ' ✓'}</span></div><div className='progress-track'><div className='progress-fill' style={{
      width: (idx + 1) / questions.length * 100 + '%'
    }} /></div><div className='kana-quiz__prompt' lang='ja'>{q.kana}</div><div className='kana-quiz__options'>{optionBtns}</div>{picked !== null ? <button className='btn btn--primary btn--full' onClick={next} style={{
    marginTop: 16
  }}>{idx + 1 >= questions.length ? t('View Results', props.appLang) + ' →' : t('Next', props.appLang) + ' →'}</button> : null}</div>;
}

/* -----------------------------------------------------------------
   KanaTab � top-level tab: script toggle, chart/quiz views, and the
   stroke-order ("how to write") detail panel.
   ----------------------------------------------------------------- */
function KanaTab(props) {
    var _script = useState('hiragana'); // 'hiragana' | 'katakana'
    var script = _script[0], setScript = _script[1];

    var _view = useState('chart'); // 'chart' | 'quiz'
    var view = _view[0], setView = _view[1];

    var _detail = useState(null); // { kana, romaji } currently shown in stroke panel
    var detail = _detail[0], setDetail = _detail[1];

    function pick(kana, romaji) {
        setDetail({ kana: kana, romaji: romaji });
        playAudio(kana);
    }

    var scriptBtns = [
        { id: 'hiragana', label: 'あ ' + t('Hiragana', props.appLang) },
        { id: 'katakana', label: 'ア ' + t('Katakana', props.appLang) }
    ].map(function (s) {
        return <button key={s.id} className={'level-btn' + (script === s.id ? ' level-btn--active' : '')} onClick={() => {
  setScript(s.id);
  setDetail(null);
}}>{s.label}</button>;
    });

    var viewBtns = [
        { id: 'chart', label: '📋 ' + t('Chart', props.appLang) },
        { id: 'quiz', label: '🎯 ' + t('Quiz', props.appLang) }
    ].map(function (v) {
        return <button key={v.id} className={'mode-btn' + (view === v.id ? ' mode-btn--active' : '')} onClick={() => {
  setView(v.id);
  setDetail(null);
}}>{v.label}</button>;
    });

    var detailPanel = detail ? <div className='kana-detail glass-card'><div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  }}><strong style={{
      color: 'var(--text-secondary)'
    }}>{'✍️ ' + t('How to write', props.appLang)}</strong><button className='btn btn--small btn--outline' onClick={() => {
      setDetail(null);
    }}>✕</button></div><StrokeViewer kana={detail.kana} romaji={detail.romaji} /></div> : null;

    return <div className='glass-card' key='kana'><h2 className='section-title'>{t('Hiragana & Katakana', props.appLang)}</h2><p className='section-desc'>{t('Tap any character to hear it and see the stroke order. Switch to Quiz to test yourself.', props.appLang)}</p><div className='level-selector'>{scriptBtns}</div><div className='mode-selector' style={{
    marginTop: 12
  }}>{viewBtns}</div>{view === 'quiz' ? <div style={{
    marginTop: 20
  }}><KanaQuiz script={script} appLang={props.appLang} onExit={() => {
      setView('chart');
    }} /></div> : <div style={{
    marginTop: 20
  }}>{detailPanel}<KanaChart rows={GOJUON} script={script} cols={5} title={t('Basic (Gojŭon)', props.appLang)} onPick={pick} selected={detail && detail.kana} /><KanaChart rows={DAKUTEN} script={script} cols={5} title={t('Voiced (Dakuten)', props.appLang)} onPick={pick} selected={detail && detail.kana} /><KanaChart rows={YOON} script={script} cols={3} title={t('Combinations (Yōon)', props.appLang)} onPick={pick} selected={detail && detail.kana} /></div>}</div>;
}

export { KanaTab };
