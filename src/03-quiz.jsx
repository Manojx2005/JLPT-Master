import React from 'react';
const { useState, useEffect, useRef, useCallback, useMemo } = React;
const createElement = React.createElement;
import { AudioButton, SaveButton, Toast, formatTime, generateOptions, getVocabMeaning, playAudio, shuffleArray, t } from './01-core.jsx';
import { FuriganaText } from './05-exams.jsx';

/* =================================================================
   JLPT Master — Quiz (selectors, ExampleReveal, QuizTab, CustomTab)
   Part of the app, split from the original app.js for readability.
   Uses React 18 via CDN (React.createElement, no JSX/build step).
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

        return createElement('button', {
            key: lv,
            className: 'level-btn' + (isActive ? ' level-btn--active' : ''),
            onClick: function () { props.onSelect(lv); },
        },
            createElement('span', { className: 'level-btn__label' }, lv),
            createElement('span', { className: 'level-btn__count' }, count)
        );
    });
    return createElement('div', { className: 'level-selector' }, btns);
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
        return createElement('button', {
            key: m.id,
            className: 'mode-btn' + (isActive ? ' mode-btn--active' : ''),
            onClick: function () { props.onSelect(m.id); },
        },
            createElement('span', { className: 'mode-btn__icon' }, m.label),
            createElement('span', { className: 'mode-btn__desc' }, m.desc)
        );
    });

    return createElement('div', { className: 'mode-selector' }, btns);
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
        return createElement('button', {
            key: c,
            className: 'count-btn' + (isActive ? ' count-btn--active' : '') + (isDisabled ? ' count-btn--disabled' : ''),
            onClick: function () { if (!isDisabled) props.onSelect(c); },
            disabled: isDisabled,
        }, c);
    });
    return createElement('div', { className: 'count-selector' }, btns);
}

/* -----------------------------------------------------------------
   ExampleReveal — Post-answer example sentence card
   Shows after answering each question with the context, example, etc.
   ----------------------------------------------------------------- */
function ExampleReveal(props) {
    if (!props.visible || !props.question) return null;
    var q = props.question;

    var children = [];

    // Show correct answer badge
    children.push(
        createElement('div', { key: 'badge', className: 'example-reveal__badge' + (props.wasCorrect ? ' example-reveal__badge--correct' : ' example-reveal__badge--wrong') },
            props.wasCorrect ? '\u2714 Correct!' : '\u2718 Incorrect'
        )
    );

    // Word and Actions
    children.push(
        createElement('div', { key: 'word-actions', style: { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', marginTop: 12 } },
            createElement('strong', { style: { fontSize: '1.4rem' } }, q.word),
            createElement(AudioButton, { text: q.word }),
            props.onToggleSave ? createElement(SaveButton, { isSaved: props.isSaved, onToggle: props.onToggleSave }) : null
        )
    );

    // Show correct answer if the user got it wrong
    if (!props.wasCorrect) {
        children.push(
            createElement('div', { key: 'answer', className: 'example-reveal__correct-answer' },
                'Correct answer: ',
                createElement('strong', null, getVocabMeaning(q, props.appLang))
            )
        );
    }

    // Nuance / context
    if (q.nuance) {
        children.push(
            createElement('div', { key: 'nuance', className: 'example-reveal__nuance' },
                createElement('span', { className: 'example-reveal__label' }, '\uD83D\uDCA1 '),
                q.nuance
            )
        );
    }

    // Example sentence
    if (q.example) {
        children.push(
            createElement('div', { key: 'example', className: 'example-reveal__sentence' },
                createElement('div', { className: 'example-reveal__jp' }, 
                    createElement(FuriganaText, { text: q.example, show: props.showFurigana })
                ),
                q.exampleEn ? createElement('div', { className: 'example-reveal__en' }, q.exampleEn) : null
            )
        );
    }

    return createElement('div', { className: 'example-reveal', key: 'example-reveal' }, children);
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
        return createElement('div', { className: 'glass-card', key: 'quiz-setup' },
            createElement('h2', { className: 'section-title' }, '\uD83C\uDFAF ' + t('Vocab Test', props.appLang)),
            createElement('p', { className: 'section-desc' }, 'Configure your exam, then test your knowledge under time pressure.'),

            // Level filter buttons
            createElement('h3', { className: 'setup-label' }, 'Select Level'),
            createElement(LevelSelector, {
                selected: selectedLevel,
                onSelect: setSelectedLevel,
                questions: questions,
                allCount: questions.length,
                savedWords: props.savedWords,
            }),

            // Quiz mode selector
            createElement('h3', { className: 'setup-label' }, 'Quiz Mode'),
            createElement(ModeSelector, {
                selected: quizMode,
                onSelect: setQuizMode,
                appLang: props.appLang
            }),

            // Question count selector
            createElement('h3', { className: 'setup-label' }, 'Questions'),
            createElement(CountSelector, {
                selected: questionCount,
                onSelect: setQuestionCount,
                maxAvailable: availableQuestions.length,
            }),

            // Exam info and start button
            createElement('div', { className: 'setup-center' },
                createElement('div', { className: 'setup-stats' },
                    createElement('div', { className: 'setup-stat' },
                        createElement('span', { className: 'setup-stat__value' }, NUM_QUESTIONS),
                        createElement('span', { className: 'setup-stat__label' }, 'Questions')
                    ),
                    createElement('div', { className: 'setup-stat' },
                        createElement('span', { className: 'setup-stat__value' }, Math.ceil(EXAM_DURATION / 60) + ' min'),
                        createElement('span', { className: 'setup-stat__label' }, 'Time Limit')
                    ),
                    createElement('div', { className: 'setup-stat' },
                        createElement('span', { className: 'setup-stat__value' }, selectedLevel === 'All' ? 'All' : selectedLevel),
                        createElement('span', { className: 'setup-stat__label' }, 'Level')
                    )
                ),
                createElement('button', {
                    id: 'start-exam-btn',
                    className: 'btn btn--primary btn--large btn--glow',
                    onClick: startQuiz,
                    disabled: availableQuestions.length === 0,
                }, '\u25B6  START EXAM'),
                // Warning if no questions available
                availableQuestions.length === 0 ? createElement('p', {
                    style: { marginTop: 12, color: 'var(--accent-red)', fontSize: '0.9rem' }
                }, 'No questions available for this level/mode combination.') : null
            )
        );
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

                return createElement('div', { key: i, className: 'wrong-review-item' },
                    createElement('div', { className: 'wrong-review-item__top', style: { display: 'flex', gap: 8, alignItems: 'center' } },
                        createElement('span', { className: 'wrong-review-item__word', style: { fontSize: '1.2rem', fontWeight: 'bold' } }, a.question.word),
                        createElement(AudioButton, { text: a.question.word }),
                        props.toggleSavedWord ? createElement(SaveButton, {
                            isSaved: props.savedWords ? props.savedWords.some(function (w) { return w.word === a.question.word; }) : false,
                            onToggle: function () { props.toggleSavedWord(a.question); }
                        }) : null,
                        a.question.reading ? createElement('span', { className: 'wrong-review-item__reading', style: { marginLeft: 'auto' } }, '(' + a.question.reading + ')') : null,
                        (a.question.level || a.question.jlpt) ? createElement('span', { className: 'quiz-level-tag' }, (a.question.level || a.question.jlpt)) : null
                    ),
                    createElement('div', { className: 'wrong-review-item__answers' },
                        createElement('div', { className: 'wrong-review-item__your-answer' },
                            createElement('span', { className: 'wrong-review-item__label' }, 'Your answer:'),
                            createElement('span', { className: 'wrong-review-item__value wrong-review-item__value--wrong' }, userAnsDisplay)
                        ),
                        createElement('div', { className: 'wrong-review-item__correct-answer' },
                            createElement('span', { className: 'wrong-review-item__label' }, 'Correct:'),
                            createElement('span', { className: 'wrong-review-item__value wrong-review-item__value--correct' }, correctAnsDisplay)
                        )
                    ),
                    a.question.nuance ? createElement('div', { className: 'wrong-review-item__nuance' },
                        '\uD83D\uDCA1 ', a.question.nuance
                    ) : null,
                    a.question.example ? createElement('div', { className: 'wrong-review-item__example' },
                        createElement('div', { className: 'wrong-review-item__example-jp' }, a.question.example),
                        a.question.exampleEn ? createElement('div', { className: 'wrong-review-item__example-en' }, a.question.exampleEn) : null
                    ) : null
                );
            });

            wrongReviewEl = createElement('div', { className: 'wrong-review' },
                createElement('h3', { className: 'wrong-review__title' }, '\uD83D\uDD0D Review Wrong Answers (' + wrongAnswers.length + ')'),
                wrongItems
            );
        }

        // Score ring visual
        var circumference = 2 * Math.PI * 54;
        var strokeDashoffset = circumference - (pct / 100) * circumference;
        var scoreRingColor = pct >= 70 ? 'var(--accent-green)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-red)';

        return createElement('div', { className: 'glass-card', key: 'quiz-result' },
            createElement('div', { className: 'result-panel' },
                createElement('div', { className: 'result-panel__emoji' }, emoji),
                createElement('div', { className: 'result-panel__title' }, timedOut ? "\u23F0 Time's Up!" : msg),

                // Score ring
                createElement('div', { className: 'score-ring-container' },
                    createElement('svg', { width: 140, height: 140, viewBox: '0 0 120 120', className: 'score-ring' },
                        createElement('circle', { cx: 60, cy: 60, r: 54, fill: 'none', stroke: 'rgba(255,255,255,0.08)', strokeWidth: 8 }),
                        createElement('circle', {
                            cx: 60, cy: 60, r: 54, fill: 'none',
                            stroke: scoreRingColor, strokeWidth: 8,
                            strokeDasharray: circumference,
                            strokeDashoffset: strokeDashoffset,
                            strokeLinecap: 'round',
                            transform: 'rotate(-90 60 60)',
                            style: { transition: 'stroke-dashoffset 1.5s ease-out' }
                        })
                    ),
                    createElement('div', { className: 'score-ring__text' },
                        createElement('div', { className: 'score-ring__pct' }, pct + '%'),
                        createElement('div', { className: 'score-ring__count' }, score + '/' + answeredCount)
                    )
                ),

                createElement('div', { className: 'result-panel__meta' },
                    createElement('span', { className: 'result-meta-tag' }, levelLabel),
                    createElement('span', { className: 'result-meta-tag' }, modeLabel + ' Mode'),
                    timedOut ? createElement('span', { className: 'result-meta-tag result-meta-tag--warn' },
                        'Answered ' + answeredCount + ' of ' + total
                    ) : null
                ),

                createElement('button', {
                    id: 'retry-exam-btn',
                    className: 'btn btn--primary',
                    onClick: resetQuiz,
                    style: { marginTop: 20 }
                }, '\u21BB  Try Again')
            ),
            wrongReviewEl
        );
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
                optContent = createElement('span', null, 
                    opt, 
                    createElement('span', { style: { fontSize: '0.8em', marginLeft: '6px', opacity: 0.8 } }, '(' + matchedItem.reading + ')')
                );
            }
        }

        return createElement('button', {
            key: qIndex + '-' + i,
            className: cls,
            onClick: function () { handleAnswer(opt); },
            disabled: !canAnswer || showExample,
            style: optStyle,
        }, optContent);
    });

    return createElement('div', { className: 'glass-card', key: 'quiz-active' },
        // Top bar: back button + question counter + JLPT level tag + countdown timer
        createElement('div', { className: 'quiz-bar' },
            createElement('button', {
                className: 'quiz-bar__back',
                onClick: resetQuiz,
                title: 'Back to Setup',
            }, '\u2190'),
            createElement('div', { className: 'quiz-bar__info' },
                'Question ',
                createElement('strong', null, qIndex + 1),
                ' / ' + quiz.length,
                (q.level || q.jlpt) ? createElement('span', { className: 'quiz-level-tag' }, (q.level || q.jlpt)) : null
            ),
            createElement('div', { className: timerClass }, formatTime(timeLeft))
        ),
        // Progress bar
        createElement('div', { className: 'progress-track' },
            createElement('div', { className: 'progress-fill', style: { width: progress + '%' } })
        ),
        // Question display
        createElement('div', { className: 'quiz-question' },
            createElement('span', {
                className: 'quiz-question__word',
                style: quizMode === 'reverse' ? { fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontFamily: 'var(--font-main)' } : {}
            }, questionWord),
            questionReading && props.showFurigana ? createElement('span', { className: 'quiz-question__reading' }, '(' + questionReading + ')') : null,
            createElement('span', { className: 'quiz-question__prompt' }, questionPrompt)
        ),
        // Answer options grid
        createElement('div', { className: 'quiz-options' }, optionEls),
        // Example reveal card (shown after answering)
        createElement(ExampleReveal, {
            visible: showExample,
            question: q,
            wasCorrect: wasCorrect,
            isSaved: props.savedWords ? props.savedWords.some(function (w) { return w.word === q.word; }) : false,
            onToggleSave: props.toggleSavedWord ? function () { props.toggleSavedWord(q); } : null,
            showFurigana: props.showFurigana,
            appLang: props.appLang
        }),
        // Next button (shown after answering)
        showExample ? createElement('button', {
            className: 'btn btn--primary btn--full btn--next',
            onClick: nextQuestion,
        }, qIndex + 1 >= quiz.length ? 'View Results \u2192' : 'Next Question \u2192') : null
    );
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
            return createElement('div', { className: 'custom-q-item', key: idx },
                createElement('span', { className: 'custom-q-item__word' }, cq.word),
                createElement('span', { className: 'custom-q-item__meaning' }, '\u2192 ' + getVocabMeaning(cq, props.appLang)),
                createElement('span', { className: 'quiz-level-tag', style: { fontSize: '0.75rem' } }, cq.level),
                createElement('button', {
                    className: 'custom-q-item__delete',
                    onClick: function () { props.onDelete(idx); },
                    title: 'Remove',
                }, '\u2715')
            );
        });

        customListEl = createElement('div', { className: 'custom-q-list' },
            createElement('h3', { style: { fontSize: '1.1rem', marginBottom: 12, color: 'var(--text-secondary)' } },
                'Your Custom Questions (' + props.customQuestions.length + ')'
            ),
            items
        );
    }

    function makeFormGroup(label, value, setter, placeholder, required) {
        return createElement('div', { className: 'form-group' },
            createElement('label', { className: 'form-label' + (required ? ' form-label--required' : '') }, label),
            createElement('input', {
                className: 'input-field',
                type: 'text',
                value: value,
                onChange: function (e) { setter(e.target.value); },
                placeholder: placeholder,
            })
        );
    }

    var levelBtns = ['N5', 'N4', 'N3', 'N2', 'N1'].map(function (lv) {
        return createElement('button', {
            key: lv,
            className: 'level-btn level-btn--sm' + (level === lv ? ' level-btn--active' : ''),
            onClick: function () { setLevel(lv); },
        }, lv);
    });

    // --- Render the Custom Questions Tab ---
    return createElement('div', { className: 'glass-card', key: 'custom' },
        createElement('h2', { className: 'section-title' }, '\u270F\uFE0F ' + t('Add Custom Questions', props.appLang)),
        createElement('p', { className: 'section-desc' }, "Add your own vocabulary to the exam pool. They'll appear in the next quiz."),

        makeFormGroup('Japanese Word (Kanji)', word, setWord, 'e.g. \u52C9\u5F37', true),
        makeFormGroup('Reading (Hiragana)', reading, setReading, 'e.g. \u3079\u3093\u304D\u3087\u3046', false),
        makeFormGroup('Correct English Meaning', correct, setCorrect, 'e.g. study', true),
        makeFormGroup('Wrong Option 1', w1, setW1, 'Distractor 1...', true),
        makeFormGroup('Wrong Option 2', w2, setW2, 'Distractor 2...', true),
        makeFormGroup('Wrong Option 3', w3, setW3, 'Distractor 3...', true),

        createElement('div', { className: 'form-group' },
            createElement('label', { className: 'form-label' }, 'JLPT Level'),
            createElement('div', { className: 'level-selector level-selector--compact' }, levelBtns)
        ),

        createElement('button', {
            id: 'add-question-btn',
            className: 'btn btn--primary btn--full',
            onClick: handleSubmit,
            style: { marginTop: 8 },
        }, '\uFF0B Add to Exam Pool'),

        customListEl,
        createElement(Toast, { message: '\u2713 Question added to exam pool!', visible: toast })
    );
}



export { LevelSelector, ModeSelector, CountSelector, ExampleReveal, QuizTab, CustomTab };
