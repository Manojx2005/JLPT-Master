import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AudioButton, SaveButton, Toast, formatTime, generateOptions, getVocabMeaning, playAudio, shuffleArray, t } from './01-core.jsx';
import { FuriganaText } from './05-exams.jsx';
import { PROGRESS } from './features.js';

/* =================================================================
   JLPT Master — Quiz (selectors, ExampleReveal, QuizTab, CustomTab)
   Part of the app, split from the original app.js for readability.
   All components share the global scope and load in order (see index.html).
   ================================================================= */

/* -----------------------------------------------------------------
   LevelSelector — JLPT level filter button group
   Renders buttons for "All", "N5", "N4", "N3", "N2", "N1".
   Each button shows the level name and the count of available questions.
   The active level is highlighted with a different style.
   ----------------------------------------------------------------- */
function LevelSelector(props) {
    var levels = ['All', 'N5', 'N4', 'N3', 'N2', 'N1'];
    if (props.savedWords && props.savedWords.length > 0) {
        levels.push('Saved');
    }

    var btns = levels.map(function (lv) {
        var isActive = props.selected === lv;
        // Count questions for this level (or show total for "All")
        var count;
        if (lv === 'All') count = props.allCount;
        else if (lv === 'Saved') count = props.savedWords.length;
        else count = props.questions.filter(function (q) { return q.level === lv; }).length;

        return <button key={lv} className={'level-btn' + (isActive ? ' level-btn--active' : '')} onClick={() => {
  props.onSelect(lv);
}}><span className='level-btn__label'>{lv}</span><span className='level-btn__count'>{count}</span></button>;
    });
    return <div className='level-selector'>{btns}</div>;
}

/* -----------------------------------------------------------------
   ModeSelector — Quiz mode toggle buttons
   Three modes:
   - meaning: Show Kanji → pick English (default)
   - reverse: Show English → pick Kanji
   - reading: Show Kanji → pick correct Reading
   ----------------------------------------------------------------- */
function ModeSelector(props) {
    var langStr = 'EN';
    if (props.appLang === 'vn') langStr = 'VN';
    else if (props.appLang === 'my') langStr = 'MY';
    else if (props.appLang === 'ja') langStr = 'JA';

    var defaultModes = [
        { id: 'meaning', label: '\uD83C\uDDEF\uD83C\uDDF5 \u2192 ' + langStr, desc: 'Meaning' },
        { id: 'reverse', label: langStr + ' \u2192 \uD83C\uDDEF\uD83C\uDDF5', desc: 'Reverse' },
        { id: 'reading', label: '\u6F22\u5B57 \u2192 \u304B\u306A', desc: 'Reading' },
    ];

    var modes = props.modes || defaultModes;
    
    // If modes were passed in, let's also attempt to dynamically replace 'EN' with the lang string
    if (props.modes) {
        modes = modes.map(function(m) {
            return Object.assign({}, m, {
                label: m.label.replace('EN', langStr)
            });
        });
    }

    var btns = modes.map(function (m) {
        var isActive = props.selected === m.id;
        return <button key={m.id} className={'mode-btn' + (isActive ? ' mode-btn--active' : '')} onClick={() => {
  props.onSelect(m.id);
}}><span className='mode-btn__icon'>{m.label}</span><span className='mode-btn__desc'>{m.desc}</span></button>;
    });

    return <div className='mode-selector'>{btns}</div>;
}

/* -----------------------------------------------------------------
   CountSelector — Question count picker
   Lets users choose how many questions per quiz session
   ----------------------------------------------------------------- */
function CountSelector(props) {
    var counts = [10, 20, 30, 50];
    var btns = counts.map(function (c) {
        var isActive = props.selected === c;
        var isDisabled = c > props.maxAvailable;
        return <button key={c} className={'count-btn' + (isActive ? ' count-btn--active' : '') + (isDisabled ? ' count-btn--disabled' : '')} onClick={() => {
  if (!isDisabled) props.onSelect(c);
}} disabled={isDisabled}>{c}</button>;
    });
    return <div className='count-selector'>{btns}</div>;
}

/* -----------------------------------------------------------------
   ExampleReveal — Post-answer example sentence card
   Shows after answering each question with the context, example, etc.
   ----------------------------------------------------------------- */
function ExampleReveal(props) {
    var _render = useState(0);
    var render = _render[0], setRender = _render[1];

    if (!props.visible || !props.question) return null;
    var q = props.question;

    if (props.appLang && props.appLang !== 'en') {
        var rawMeanings = (q.meanings && Array.isArray(q.meanings) && q.meanings.length > 0) ? q.meanings : [];
        if (rawMeanings.length === 0 && (q.correct || q.english)) rawMeanings = [q.correct || q.english];
        var needsTranslation = false;
        rawMeanings.forEach(function(m) {
            if (m && window.TRANSLATION_CACHE && !window.TRANSLATION_CACHE[props.appLang + '___' + m]) {
                needsTranslation = true;
            }
        });
        if (needsTranslation && !q._isTranslatingExample) {
            q._isTranslatingExample = true;
            Promise.all(rawMeanings.map(function(m) { return translateText(m, props.appLang); }))
                .then(function() { 
                    q._isTranslatingExample = false;
                    setRender(function(r) { return r + 1; }); 
                });
        }
    }

    var children = [];

    // Show correct answer badge
    children.push(
        <div key='badge' className={'example-reveal__badge' + (props.wasCorrect ? ' example-reveal__badge--correct' : ' example-reveal__badge--wrong')}>{props.wasCorrect ? '\u2714 Correct!' : '\u2718 Incorrect'}</div>
    );

    // Word and Actions
    children.push(
        <div key='word-actions' style={{
  display: 'flex',
  gap: 8,
  marginBottom: 4,
  alignItems: 'center',
  marginTop: 12
}}><strong style={{
    fontSize: '1.4rem'
  }}>{q.word}</strong><AudioButton text={q.word} />{props.onToggleSave ? <SaveButton isSaved={props.isSaved} onToggle={props.onToggleSave} /> : null}</div>
    );

    // Reading
    if (q.reading && q.reading !== q.word) {
        children.push(
            <div key='reading' style={{
  fontSize: '1rem',
  color: 'var(--text-muted)',
  marginBottom: 8
}}>{'(' + q.reading + ')'}</div>
        );
    }

    // Meaning (always show for context)
    children.push(
        <div key='meaning' style={{
  fontSize: '1.1rem',
  marginBottom: 12
}}>{getVocabMeaning(q, props.appLang)}</div>
    );

    // Nuance / context
    if (q.nuance) {
        children.push(
            <div key='nuance' className='example-reveal__nuance'><span className='example-reveal__label'>{'\uD83D\uDCA1 '}</span>{q.nuance}</div>
        );
    }

    // Example sentence
    if (q.example) {
        children.push(
            <div key='example' className='example-reveal__sentence'><div className='example-reveal__jp'><FuriganaText text={q.example} show={props.showFurigana} /></div>{q.exampleEn ? <div className='example-reveal__en'>{q.exampleEn}</div> : null}</div>
        );
    }

    return <div className='example-reveal' key='example-reveal'>{children}</div>;
}

/* -----------------------------------------------------------------
   QuizTab — Enhanced timed multiple-choice exam component

   Three Phases:
   1. SETUP  — Level selection, mode selection, question count
   2. ACTIVE — Question display with countdown timer + example reveal
   3. RESULT — Score summary with wrong answer breakdown

   Props:
   - questions: Array — Combined pool of built-in + custom questions
   ----------------------------------------------------------------- */
function QuizTab(props) {
    var questions = props.questions;

    // --- State Variables ---
    var _phase = useState('setup');
    var phase = _phase[0], setPhase = _phase[1];              // Current quiz phase

    var _selectedLevel = useState('All');
    var selectedLevel = _selectedLevel[0], setSelectedLevel = _selectedLevel[1]; // JLPT level filter

    var _quizMode = useState('meaning');
    var quizMode = _quizMode[0], setQuizMode = _quizMode[1]; // Quiz mode

    var _questionCount = useState(20);
    var questionCount = _questionCount[0], setQuestionCount = _questionCount[1]; // # of questions

    var _quiz = useState([]);
    var quiz = _quiz[0], setQuiz = _quiz[1];                  // Array of questions for this session

    var _qIndex = useState(0);
    var qIndex = _qIndex[0], setQIndex = _qIndex[1];          // Current question index

    var _score = useState(0);
    var score = _score[0], setScore = _score[1];              // Number of correct answers

    var _timeLeft = useState(300);
    var timeLeft = _timeLeft[0], setTimeLeft = _timeLeft[1];  // Seconds remaining

    var _canAnswer = useState(true);
    var canAnswer = _canAnswer[0], setCanAnswer = _canAnswer[1]; // Can click an answer

    var _selected = useState(null);
    var selected = _selected[0], setSelected = _selected[1];  // The option the user selected

    var _shuffledOpts = useState([]);
    var shuffledOpts = _shuffledOpts[0], setShuffledOpts = _shuffledOpts[1]; // Randomized options

    var _timedOut = useState(false);
    var timedOut = _timedOut[0], setTimedOut = _timedOut[1];  // Timer expired

    var _showExample = useState(false);
    var showExample = _showExample[0], setShowExample = _showExample[1]; // Show example reveal

    var _wasCorrect = useState(false);
    var wasCorrect = _wasCorrect[0], setWasCorrect = _wasCorrect[1]; // Last answer correct?

    var _answerHistory = useState([]);
    var answerHistory = _answerHistory[0], setAnswerHistory = _answerHistory[1]; // Track all answers

    var timerRef = useRef(null); // Holds the setInterval ID for cleanup

    // Filter the question pool by the selected JLPT level
    var filteredQuestions = useMemo(function () {
        if (selectedLevel === 'All') return questions;
        if (selectedLevel === 'Saved') return props.savedWords || [];
        return questions.filter(function (q) { return q.level === selectedLevel; });
    }, [questions, selectedLevel, props.savedWords]);

    // For reading mode, filter out entries without readings
    var availableQuestions = useMemo(function () {
        if (quizMode === 'reading') {
            return filteredQuestions.filter(function (q) { return q.reading && q.reading.length > 0; });
        }
        return filteredQuestions;
    }, [filteredQuestions, quizMode]);

    // Actual number of questions (capped by available)
    var NUM_QUESTIONS = Math.min(availableQuestions.length, questionCount);

    // Scale exam duration: 30 seconds per question, min 3 min, max 15 min
    var EXAM_DURATION = Math.max(180, Math.min(NUM_QUESTIONS * 30, 900));

    /**
     * Initializes and starts a new quiz session.
     * Picks random questions, generates dynamic options, resets all state.
     */
    function startQuiz() {
        if (availableQuestions.length === 0) return;
        var picked = shuffleArray(availableQuestions).slice(0, NUM_QUESTIONS);
        setQuiz(picked);
        setQIndex(0);
        setScore(0);
        setTimeLeft(EXAM_DURATION);
        setCanAnswer(true);
        setSelected(null);
        setTimedOut(false);
        setShowExample(false);
        setWasCorrect(false);
        setAnswerHistory([]);
        // Generate dynamic options for the first question
        setShuffledOpts(generateOptions(picked[0], questions, quizMode, props.appLang));
        setPhase('active');
    }

    // --- Timer Effect ---
    useEffect(function () {
        if (phase !== 'active') {
            clearInterval(timerRef.current);
            return;
        }
        timerRef.current = setInterval(function () {
            setTimeLeft(function (prev) {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    setTimedOut(true);
                    setCanAnswer(false);
                    setPhase('result');
                    PROGRESS.recordQuiz(score, Math.min(qIndex + 1, quiz.length), selectedLevel, quizMode);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return function () { clearInterval(timerRef.current); };
    }, [phase]);

    /**
     * Get the correct answer for the current question based on mode
     */
    function getCorrectAnswer(q) {
        if (quizMode === 'reverse') return q.word;
        if (quizMode === 'reading') return q.reading;
        return getVocabMeaning(q, props.appLang);
    }

    /**
     * Handles a user clicking on an answer option.
     */
    function handleAnswer(opt) {
        if (!canAnswer) return;
        setCanAnswer(false);
        setSelected(opt);

        var correctAnswer = getCorrectAnswer(quiz[qIndex]);
        var isCorrect = opt === correctAnswer;
        if (isCorrect) {
            setScore(function (s) { return s + 1; });
            if (props.autoPronounce) playAudio(quiz[qIndex].word);
        }
        setWasCorrect(isCorrect);

        // Record answer history
        setAnswerHistory(function (prev) {
            return prev.concat([{
                question: quiz[qIndex],
                userAnswer: opt,
                correctAnswer: correctAnswer,
                isCorrect: isCorrect,
            }]);
        });

        // Show example sentence after answering
        setShowExample(true);
    }

    /**
     * Advances to the next question after viewing the example.
     */
    function nextQuestion() {
        setShowExample(false);
        var nextIdx = qIndex + 1;
        if (nextIdx >= quiz.length) {
            clearInterval(timerRef.current);
            setPhase('result');
            var finalScore = score + (wasCorrect ? 1 : 0);
            PROGRESS.recordQuiz(finalScore, quiz.length, selectedLevel, quizMode);
            if (window.confetti && finalScore === quiz.length) {
                window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
            }
        } else {
            setQIndex(nextIdx);
            setShuffledOpts(generateOptions(quiz[nextIdx], questions, quizMode, props.appLang));
            setCanAnswer(true);
            setSelected(null);
        }
    }

    // Keyboard shortcut for Next Question
    var nextQuestionRef = useRef(nextQuestion);
    nextQuestionRef.current = nextQuestion;
    useEffect(function() {
        function handleKeyDown(e) {
            if (e.key === 'Enter' && showExample) {
                nextQuestionRef.current();
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return function() { window.removeEventListener('keydown', handleKeyDown); };
    }, [showExample]);

    /**
     * Resets the quiz back to the setup phase.
     */
    function resetQuiz() {
        clearInterval(timerRef.current);
        setPhase('setup');
    }

    // =============== PHASE: SETUP ===============
    if (phase === 'setup') {
        return <div className='glass-card' key='quiz-setup'><h2 className='section-title'>{t('Vocab Test', props.appLang)}</h2><p className='section-desc'>Configure your exam, then test your knowledge under time pressure.</p> // Level filter buttons
  <h3 className='setup-label'>Select Level</h3><LevelSelector selected={selectedLevel} onSelect={setSelectedLevel} questions={questions} allCount={questions.length} savedWords={props.savedWords} /> // Quiz mode selector
  <h3 className='setup-label'>Quiz Mode</h3><ModeSelector selected={quizMode} onSelect={setQuizMode} appLang={props.appLang} /> // Question count selector
  <h3 className='setup-label'>Questions</h3><CountSelector selected={questionCount} onSelect={setQuestionCount} maxAvailable={availableQuestions.length} /> // Exam info and start button
  <div className='setup-center'><div className='setup-stats'><div className='setup-stat'><span className='setup-stat__value'>{NUM_QUESTIONS}</span><span className='setup-stat__label'>Questions</span></div><div className='setup-stat'><span className='setup-stat__value'>{Math.ceil(EXAM_DURATION / 60) + ' min'}</span><span className='setup-stat__label'>Time Limit</span></div><div className='setup-stat'><span className='setup-stat__value'>{selectedLevel === 'All' ? 'All' : selectedLevel}</span><span className='setup-stat__label'>Level</span></div></div><button id='start-exam-btn' className='btn btn--primary btn--large btn--glow' onClick={startQuiz} disabled={availableQuestions.length === 0}>▶  START EXAM</button>{
    // Warning if no questions available
    availableQuestions.length === 0 ? <p style={{
      marginTop: 12,
      color: 'var(--accent-red)',
      fontSize: '0.9rem'
    }}>No questions available for this level/mode combination.</p> : null}</div></div>;
    }

    // =============== PHASE: RESULT ===============
    if (phase === 'result') {
        var total = quiz.length;
        var answeredCount = answerHistory.length;
        var pct = answeredCount > 0 ? Math.round((score / answeredCount) * 100) : 0;

        // Select feedback emoji and message based on score percentage
        var emoji, msg;
        if (pct >= 90) { emoji = '\uD83C\uDFC6'; msg = 'Outstanding!'; }
        else if (pct >= 70) { emoji = '\uD83C\uDF89'; msg = 'Great job!'; }
        else if (pct >= 50) { emoji = '\uD83D\uDC4D'; msg = 'Not bad!'; }
        else { emoji = '\uD83D\uDCDA'; msg = 'Keep studying!'; }

        var levelLabel = selectedLevel === 'All' ? 'All Levels' : selectedLevel;
        var modeLabel = quizMode === 'meaning' ? 'Meaning' : quizMode === 'reverse' ? 'Reverse' : 'Reading';

        // Build wrong answers breakdown
        var wrongAnswers = answerHistory.filter(function (a) { return !a.isCorrect; });
        var wrongReviewEl = null;

        if (wrongAnswers.length > 0) {
            var wrongItems = wrongAnswers.map(function (a, i) {
                var userAnsDisplay = a.userAnswer;
                var correctAnsDisplay = a.correctAnswer;
                if (quizMode === 'reverse') {
                    var userMatch = questions.find(function(q) { return q.word === a.userAnswer; });
                    if (userMatch && userMatch.reading) userAnsDisplay += ' (' + userMatch.reading + ')';
                    var correctMatch = questions.find(function(q) { return q.word === a.correctAnswer; });
                    if (correctMatch && correctMatch.reading) correctAnsDisplay += ' (' + correctMatch.reading + ')';
                }

                return <div key={i} className='wrong-review-item'><div className='wrong-review-item__top' style={{
    display: 'flex',
    gap: 8,
    alignItems: 'center'
  }}><span className='wrong-review-item__word' style={{
      fontSize: '1.2rem',
      fontWeight: 'bold'
    }}>{a.question.word}</span><AudioButton text={a.question.word} />{props.toggleSavedWord ? <SaveButton isSaved={props.savedWords ? props.savedWords.some(function (w) {
      return w.word === a.question.word;
    }) : false} onToggle={() => {
      props.toggleSavedWord(a.question);
    }} /> : null}{a.question.reading ? <span className='wrong-review-item__reading' style={{
      marginLeft: 'auto'
    }}>{'(' + a.question.reading + ')'}</span> : null}{a.question.level || a.question.jlpt ? <span className='quiz-level-tag'>{a.question.level || a.question.jlpt}</span> : null}</div><div className='wrong-review-item__answers'><div className='wrong-review-item__your-answer'><span className='wrong-review-item__label'>Your answer:</span><span className='wrong-review-item__value wrong-review-item__value--wrong'>{userAnsDisplay}</span></div><div className='wrong-review-item__correct-answer'><span className='wrong-review-item__label'>Correct:</span><span className='wrong-review-item__value wrong-review-item__value--correct'>{correctAnsDisplay}</span></div></div>{a.question.nuance ? <div className='wrong-review-item__nuance'>{'\uD83D\uDCA1 '}{a.question.nuance}</div> : null}{a.question.example ? <div className='wrong-review-item__example'><div className='wrong-review-item__example-jp'>{a.question.example}</div>{a.question.exampleEn ? <div className='wrong-review-item__example-en'>{a.question.exampleEn}</div> : null}</div> : null}</div>;
            });

            wrongReviewEl = <div className='wrong-review'><h3 className='wrong-review__title'>{'\uD83D\uDD0D Review Wrong Answers (' + wrongAnswers.length + ')'}</h3>{wrongItems}</div>;
        }

        // Score ring visual
        var circumference = 2 * Math.PI * 54;
        var strokeDashoffset = circumference - (pct / 100) * circumference;
        var scoreRingColor = pct >= 70 ? 'var(--accent-green)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-red)';

        return <div className='glass-card' key='quiz-result'><div className='result-panel'><div className='result-panel__emoji'>{emoji}</div><div className='result-panel__title'>{timedOut ? "\u23F0 Time's Up!" : msg}</div> // Score ring
    <div className='score-ring-container'><svg width={140} height={140} viewBox='0 0 120 120' className='score-ring'><circle cx={60} cy={60} r={54} fill='none' stroke='rgba(255,255,255,0.08)' strokeWidth={8} /><circle cx={60} cy={60} r={54} fill='none' stroke={scoreRingColor} strokeWidth={8} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap='round' transform='rotate(-90 60 60)' style={{
          transition: 'stroke-dashoffset 1.5s ease-out'
        }} /></svg><div className='score-ring__text'><div className='score-ring__pct'>{pct + '%'}</div><div className='score-ring__count'>{score + '/' + answeredCount}</div></div></div><div className='result-panel__meta'><span className='result-meta-tag'>{levelLabel}</span><span className='result-meta-tag'>{modeLabel + ' Mode'}</span>{timedOut ? <span className='result-meta-tag result-meta-tag--warn'>{'Answered ' + answeredCount + ' of ' + total}</span> : null}</div><button id='retry-exam-btn' className='btn btn--primary' onClick={resetQuiz} style={{
      marginTop: 20
    }}>↻  Try Again</button></div>{wrongReviewEl}</div>;
    }

    // =============== PHASE: ACTIVE ===============
    var q = quiz[qIndex];
    var progress = ((qIndex + (showExample ? 1 : 0)) / quiz.length) * 100;

    // Timer color classes
    var timerClass = 'timer';
    if (timeLeft <= 15) timerClass += ' timer--danger';
    else if (timeLeft <= 60) timerClass += ' timer--warning';

    // Get the correct answer for highlighting
    var correctAnswer = getCorrectAnswer(q);

    // Determine question display based on mode
    var questionWord, questionReading, questionPrompt;
    if (quizMode === 'reverse') {
        questionWord = getVocabMeaning(q, props.appLang); // Show meaning
        questionReading = '';
        questionPrompt = 'Which Japanese word matches this meaning?';
    } else if (quizMode === 'reading') {
        questionWord = q.word;
        questionReading = '';
        questionPrompt = t('What is the correct reading of this word?', props.appLang);
    } else {
        questionWord = q.word;
        questionReading = q.reading;
        questionPrompt = t('What does this mean in English?', props.appLang);
    }

    // Render answer option buttons with correct/incorrect highlighting
    var optionEls = shuffledOpts.map(function (opt, i) {
        var cls = 'quiz-option';
        if (selected !== null) {
            if (opt === correctAnswer) cls += ' quiz-option--correct';
            else if (opt === selected && opt !== correctAnswer) cls += ' quiz-option--incorrect';
        }

        // Use Japanese font for reverse/reading mode options
        var optStyle = {};
        if (quizMode === 'reverse' || quizMode === 'reading') {
            optStyle.fontFamily = 'var(--font-jp)';
        }

        var optContent = opt;
        
        // Show furigana if user made a mistake and this is a kanji test (reverse mode)
        if (selected !== null && selected !== correctAnswer && quizMode === 'reverse' && props.showFurigana) {
            var matchedItem = questions.find(function(item) { return item.word === opt; });
            if (matchedItem && matchedItem.reading) {
                optContent = <span>{opt}<span style={{
    fontSize: '0.8em',
    marginLeft: '6px',
    opacity: 0.8
  }}>{'(' + matchedItem.reading + ')'}</span></span>;
            }
        }

        return <button key={qIndex + '-' + i} className={cls} onClick={() => {
  handleAnswer(opt);
}} disabled={!canAnswer || showExample} style={optStyle}>{optContent}</button>;
    });

    return <div className='glass-card' key='quiz-active'> // Top bar: back button + question counter + JLPT level tag + countdown timer
  <div className='quiz-bar'><button className='quiz-bar__back' onClick={resetQuiz} title='Back to Setup'>←</button><div className='quiz-bar__info'>{'Question '}<strong>{qIndex + 1}</strong>{' / ' + quiz.length}{q.level || q.jlpt ? <span className='quiz-level-tag'>{q.level || q.jlpt}</span> : null}</div><div className={timerClass}>{formatTime(timeLeft)}</div></div> // Progress bar
  <div className='progress-track'><div className='progress-fill' style={{
      width: progress + '%'
    }} /></div> // Question display
  <div className='quiz-question'><span className='quiz-question__word' style={quizMode === 'reverse' ? {
      fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
      fontFamily: 'var(--font-main)'
    } : {}}>{questionWord}</span>{questionReading && props.showFurigana ? <span className='quiz-question__reading'>{'(' + questionReading + ')'}</span> : null}<span className='quiz-question__prompt'>{questionPrompt}</span></div> // Answer options grid
  <div className='quiz-options'>{optionEls}</div> // Example reveal card (shown after answering)
  <ExampleReveal visible={showExample} question={q} wasCorrect={wasCorrect} isSaved={props.savedWords ? props.savedWords.some(function (w) {
    return w.word === q.word;
  }) : false} onToggleSave={props.toggleSavedWord ? function () {
    props.toggleSavedWord(q);
  } : null} showFurigana={props.showFurigana} appLang={props.appLang} />{
  // Next button (shown after answering)
  showExample ? <button className='btn btn--primary btn--full btn--next' onClick={nextQuestion}>{qIndex + 1 >= quiz.length ? 'View Results \u2192' : 'Next Question \u2192'}</button> : null}</div>;
}

/* -----------------------------------------------------------------
   CustomTab — Add custom vocabulary questions
   ----------------------------------------------------------------- */
function CustomTab(props) {
    // --- Form Field State ---
    var _word = useState(''); var word = _word[0], setWord = _word[1];
    var _reading = useState(''); var reading = _reading[0], setReading = _reading[1];
    var _correct = useState(''); var correct = _correct[0], setCorrect = _correct[1];
    var _w1 = useState(''); var w1 = _w1[0], setW1 = _w1[1];
    var _w2 = useState(''); var w2 = _w2[0], setW2 = _w2[1];
    var _w3 = useState(''); var w3 = _w3[0], setW3 = _w3[1];
    var _level = useState('N5'); var level = _level[0], setLevel = _level[1];
    var _toast = useState(false); var toast = _toast[0], setToast = _toast[1];

    function handleSubmit() {
        if (!word || !correct || !w1 || !w2 || !w3) {
            alert('Please fill in all required fields.');
            return;
        }
        props.onAdd({
            word: word,
            reading: reading,
            correct: correct,
            options: [correct, w1, w2, w3],
            level: level,
        });
        setWord(''); setReading(''); setCorrect(''); setW1(''); setW2(''); setW3('');
        setToast(true);
        setTimeout(function () { setToast(false); }, 2500);
    }

    // --- Custom Questions List ---
    var customListEl = null;
    if (props.customQuestions.length > 0) {
        var items = props.customQuestions.map(function (cq, idx) {
            return <div className='custom-q-item' key={idx}><span className='custom-q-item__word'>{cq.word}</span><span className='custom-q-item__meaning'>{'\u2192 ' + getVocabMeaning(cq, props.appLang)}</span><span className='quiz-level-tag' style={{
    fontSize: '0.75rem'
  }}>{cq.level}</span><button className='custom-q-item__delete' onClick={() => {
    props.onDelete(idx);
  }} title='Remove'>✕</button></div>;
        });

        customListEl = <div className='custom-q-list'><h3 style={{
    fontSize: '1.1rem',
    marginBottom: 12,
    color: 'var(--text-secondary)'
  }}>{'Your Custom Questions (' + props.customQuestions.length + ')'}</h3>{items}</div>;
    }

    function makeFormGroup(label, value, setter, placeholder, required) {
        return <div className='form-group'><label className={'form-label' + (required ? ' form-label--required' : '')}>{label}</label><input className='input-field' type='text' value={value} onChange={e => {
    setter(e.target.value);
  }} placeholder={placeholder} /></div>;
    }

    var levelBtns = ['N5', 'N4', 'N3', 'N2', 'N1'].map(function (lv) {
        return <button key={lv} className={'level-btn level-btn--sm' + (level === lv ? ' level-btn--active' : '')} onClick={() => {
  setLevel(lv);
}}>{lv}</button>;
    });

    // --- Render the Custom Questions Tab ---
    return <div className='glass-card' key='custom'><h2 className='section-title'>{'\u270F\uFE0F ' + t('Add Custom Questions', props.appLang)}</h2><p className='section-desc'>Add your own vocabulary to the exam pool. They'll appear in the next quiz.</p>{makeFormGroup('Japanese Word (Kanji)', word, setWord, 'e.g. \u52C9\u5F37', true)}{makeFormGroup('Reading (Hiragana)', reading, setReading, 'e.g. \u3079\u3093\u304D\u3087\u3046', false)}{makeFormGroup('Correct English Meaning', correct, setCorrect, 'e.g. study', true)}{makeFormGroup('Wrong Option 1', w1, setW1, 'Distractor 1...', true)}{makeFormGroup('Wrong Option 2', w2, setW2, 'Distractor 2...', true)}{makeFormGroup('Wrong Option 3', w3, setW3, 'Distractor 3...', true)}<div className='form-group'><label className='form-label'>JLPT Level</label><div className='level-selector level-selector--compact'>{levelBtns}</div></div><button id='add-question-btn' className='btn btn--primary btn--full' onClick={handleSubmit} style={{
    marginTop: 8
  }}>＋ Add to Exam Pool</button>{customListEl}<Toast message='\u2713 Question added to exam pool!' visible={toast} /></div>;
}



export { LevelSelector, ModeSelector, CountSelector, ExampleReveal, QuizTab, CustomTab };
