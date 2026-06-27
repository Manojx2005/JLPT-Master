import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { formatTime, sanitizeHTML, shuffleArray, t } from './01-core.jsx';
import { CountSelector, LevelSelector, ModeSelector } from './03-quiz.jsx';
import { generateGrammarOptions, getGrammarMeaning } from './04-study.jsx';
import { PDF_EXAM, PROGRESS, LEADERBOARD_API, AUTH } from './features.js';

/* =================================================================
   JLPT Master — Exams (Grammar quiz, Shared/PDF exams, Mock exam, language & login widgets)
   Part of the app, split from the original app.js for readability.
   All components share the global scope and load in order (see index.html).
   ================================================================= */

/* =================================================================
   GRAMMARQUIZTAB — Dedicated test section for Grammar
   ================================================================= */
function GrammarQuizTab(props) {
    var questions = props.questions || [];

    var _phase = useState('setup');
    var phase = _phase[0], setPhase = _phase[1];

    var _selectedLevel = useState('All');
    var selectedLevel = _selectedLevel[0], setSelectedLevel = _selectedLevel[1];

    var _quizMode = useState('meaning');
    var quizMode = _quizMode[0], setQuizMode = _quizMode[1];

    var _questionCount = useState(10);
    var questionCount = _questionCount[0], setQuestionCount = _questionCount[1];

    var _quiz = useState([]);
    var quiz = _quiz[0], setQuiz = _quiz[1];

    var _qIndex = useState(0);
    var qIndex = _qIndex[0], setQIndex = _qIndex[1];

    var _score = useState(0);
    var score = _score[0], setScore = _score[1];

    var _canAnswer = useState(true);
    var canAnswer = _canAnswer[0], setCanAnswer = _canAnswer[1];

    var _selected = useState(null);
    var selected = _selected[0], setSelected = _selected[1];

    var _shuffledOpts = useState([]);
    var shuffledOpts = _shuffledOpts[0], setShuffledOpts = _shuffledOpts[1];

    var _showExample = useState(false);
    var showExample = _showExample[0], setShowExample = _showExample[1];

    var _wasCorrect = useState(false);
    var wasCorrect = _wasCorrect[0], setWasCorrect = _wasCorrect[1];

    var filteredQuestions = useMemo(function () {
        if (selectedLevel === 'All') return questions;
        return questions.filter(function (q) { return q.level === selectedLevel; });
    }, [questions, selectedLevel]);

    var NUM_QUESTIONS = Math.min(filteredQuestions.length, questionCount);

    function startQuiz() {
        if (filteredQuestions.length === 0) return;
        var picked = shuffleArray(filteredQuestions).slice(0, NUM_QUESTIONS);
        setQuiz(picked);
        setQIndex(0);
        setScore(0);
        setCanAnswer(true);
        setSelected(null);
        setShowExample(false);
        setWasCorrect(false);
        setShuffledOpts(generateGrammarOptions(picked[0], questions, quizMode, props.appLang));
        setPhase('active');
    }

    function getCorrectAnswer(q) {
        if (quizMode === 'pattern' || quizMode === 'fill') return q.pattern;
        return getGrammarMeaning(q, props.appLang);
    }

    function handleAnswer(opt) {
        if (!canAnswer) return;
        setCanAnswer(false);
        setSelected(opt);

        var correctAnswer = getCorrectAnswer(quiz[qIndex]);
        var isCorrect = opt === correctAnswer;
        if (isCorrect) setScore(function (s) { return s + 1; });
        setWasCorrect(isCorrect);
        setShowExample(true);
    }

    function nextQuestion() {
        setShowExample(false);
        var nextIdx = qIndex + 1;
        if (nextIdx >= quiz.length) {
            setPhase('result');
            var finalScore = score + (wasCorrect ? 1 : 0);
            if (window.confetti && finalScore === quiz.length) {
                window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
            }
        } else {
            setQIndex(nextIdx);
            setShuffledOpts(generateGrammarOptions(quiz[nextIdx], questions, quizMode, props.appLang));
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

    function resetQuiz() {
        setPhase('setup');
    }

    if (phase === 'setup') {
        return <div className='glass-card'><h2 className='section-title'>{t('Grammar Test', props.appLang)}</h2><p className='section-desc'>Test your grammar knowledge.</p><h3 className='setup-label'>Select Level</h3><LevelSelector selected={selectedLevel} onSelect={setSelectedLevel} questions={questions} allCount={questions.length} savedWords={[]} /><h3 className='setup-label'>Test Mode</h3><ModeSelector selected={quizMode} onSelect={setQuizMode} appLang={props.appLang} modes={[{
    id: 'meaning',
    label: '🇯🇵 → EN',
    desc: 'Meaning'
  }, {
    id: 'pattern',
    label: 'EN → 🇯🇵',
    desc: 'Pattern'
  }, {
    id: 'fill',
    label: '＿＿＿',
    desc: 'Fill-in-blank'
  }]} /><h3 className='setup-label'>Number of Questions</h3><CountSelector selected={questionCount} onSelect={setQuestionCount} maxAvailable={filteredQuestions.length} /><div className='setup-center' style={{
    marginTop: 32
  }}><button className='btn btn--primary btn--large btn--glow' onClick={startQuiz} disabled={filteredQuestions.length === 0}>{filteredQuestions.length > 0 ? '▶ START TEST' : 'No Grammar Points Available'}</button></div></div>;
    }

    if (phase === 'result') {
        return <div className='glass-card'><h2 className='section-title' style={{
    textAlign: 'center'
  }}>Test Complete!</h2><div className='quiz-score-circle'><span className='score-number'>{score + '/' + quiz.length}</span><span className='score-label'>Correct</span></div><button className='btn btn--primary btn--large' onClick={resetQuiz} style={{
    marginTop: 32,
    width: '100%'
  }}>↻ Test Again</button></div>;
    }

    // Active phase
    var currQ = quiz[qIndex];
    var correctAnswer = getCorrectAnswer(currQ);
    var currentMeaning = getGrammarMeaning(currQ, props.appLang);
    var promptText = '';
    var hintText = '';

    if (quizMode === 'meaning') {
        promptText = currQ.pattern;
        hintText = 'What does this pattern mean?';
    } else if (quizMode === 'pattern') {
        promptText = currentMeaning;
        hintText = 'Which pattern matches this meaning?';
    } else if (quizMode === 'fill') {
        if (currQ.examples && currQ.examples.length > 0) {
            // Remove parentheticals (both half-width and full-width, e.g. " (～い)" or "（さいご）")
            var rawPattern = currQ.pattern.replace(/\s?[\(（][^\)）]+[\)）]/g, '');
            var cleanPattern = rawPattern.replace(/～/g, ''); // remove tildes
            
            promptText = currQ.examples[0].jp.replace(cleanPattern, '[ ＿＿＿ ]');

            // Fallback if exact replace failed (e.g., due to conjugation or split patterns like ～ば～ほど)
            if (promptText === currQ.examples[0].jp) {
                var parts = rawPattern.split('～').filter(Boolean);
                var tempStr = currQ.examples[0].jp;
                var replacedAny = false;
                
                parts.forEach(function(part) {
                    if (part && tempStr.indexOf(part) !== -1) {
                        tempStr = tempStr.replace(part, '[ ＿＿＿ ]');
                        replacedAny = true;
                    }
                });
                
                if (replacedAny) {
                    promptText = tempStr;
                } else {
                    promptText = currQ.examples[0].jp + ' ([ ' + currentMeaning + ' ])';
                }
            }
            var exText = currQ.examples[0].en;
            if (props.appLang === 'vn' && currQ.examples[0].vn) exText = currQ.examples[0].vn;
            if (props.appLang === 'my' && currQ.examples[0].my) exText = currQ.examples[0].my;
            hintText = exText;
        } else {
            promptText = '[ ＿＿＿ ]';
            hintText = currentMeaning;
        }
    }

    var optionEls = shuffledOpts.map(function (opt, i) {
        var cls = 'quiz-option';
        if (selected !== null) {
            if (opt === correctAnswer) cls += ' quiz-option--correct';
            else if (opt === selected && opt !== correctAnswer) cls += ' quiz-option--incorrect';
        }

        var optStyle = { fontFamily: 'var(--font-jp)' };
        
        var optContent = opt;
        if (selected !== null && selected !== correctAnswer && props.showFurigana) {
            optContent = <FuriganaText text={opt} show={true} />;
        }

        return <button key={i} className={cls} onClick={() => {
  handleAnswer(opt);
}} disabled={!canAnswer} style={optStyle}>{optContent}</button>;
    });

    var exampleContent = currQ.examples && currQ.examples[0] ? <div className='example-reveal__sentence' style={{
  marginTop: 16
}}><div className='example-reveal__jp'><FuriganaText text={currQ.examples[0].jp} show={props.showFurigana} /></div><div className='example-reveal__en'>{currQ.examples[0].en}</div></div> : null;

    var selectedObj = null;
    if (showExample && !wasCorrect && selected) {
        selectedObj = questions.find(function(q) {
            if (quizMode === 'pattern' || quizMode === 'fill') return q.pattern === selected;
            return getGrammarMeaning(q, props.appLang) === selected;
        });
    }

    var resultReveal = showExample ? <div className='example-reveal'><div className={'example-reveal__badge' + (wasCorrect ? ' example-reveal__badge--correct' : ' example-reveal__badge--wrong')}>{wasCorrect ? '✔ Correct!' : '✘ Incorrect'}</div>{!wasCorrect ? <div className='example-reveal__correct-answer' style={{
    marginTop: 12
  }}>{'The answer is '}<strong>{correctAnswer}</strong></div> : null}{!wasCorrect && selectedObj ? <div className='grammar-explanation' style={{
    marginTop: 16,
    padding: '12px 16px',
    background: 'rgba(255, 107, 107, 0.1)',
    borderRadius: '12px',
    borderLeft: '4px solid var(--danger)',
    fontSize: '0.95rem',
    lineHeight: '1.5',
    textAlign: 'left'
  }}><div style={{
      marginBottom: 12
    }}><strong style={{
        color: 'var(--danger)'
      }}>Why your choice is wrong:</strong><br />{'You selected '}<strong>{selected}</strong>{' which means "'}{getGrammarMeaning(selectedObj, props.appLang)}{'". '}{selectedObj.notes ? <span style={{
        opacity: 0.8,
        fontStyle: 'italic'
      }}>{' (' + selectedObj.notes + ')'}</span> : ''}</div><div><strong style={{
        color: 'var(--success)'
      }}>Why the answer is correct:</strong><br />{'The correct answer is '}<strong>{correctAnswer}</strong>{' which means "'}{getGrammarMeaning(currQ, props.appLang)}{'". '}{currQ.notes ? <span style={{
        opacity: 0.8,
        fontStyle: 'italic'
      }}>{' (' + currQ.notes + ')'}</span> : ''}</div></div> : null}{exampleContent}<button className='btn btn--primary btn--large btn--glow' onClick={nextQuestion} style={{
    marginTop: 24,
    width: '100%'
  }}>{qIndex + 1 >= quiz.length ? 'View Results →' : 'Next Question →'}</button></div> : null;

    return <div className='glass-card' key='grammar-active'><div className='quiz-bar'><button className='quiz-bar__back' onClick={resetQuiz} title='Back to Setup'>←</button><div className='quiz-bar__info'>{'Question '}<strong>{qIndex + 1}</strong>{' / ' + quiz.length}{currQ.level ? <span className='quiz-level-tag'>{currQ.level}</span> : null}</div></div><div className='progress-track'><div className='progress-fill' style={{
      width: (qIndex + (showExample ? 1 : 0)) / quiz.length * 100 + '%'
    }} /></div><div className='quiz-question'><span className='quiz-question__word' style={{
      fontSize: 'clamp(1.5rem, 4vw, 2rem)',
      fontFamily: 'var(--font-jp)'
    }}><FuriganaText text={promptText} show={props.showFurigana} /></span><span className='quiz-question__prompt'>{hintText}</span></div><div className='quiz-options'>{optionEls}</div>{resultReveal}</div>;
}

/* =================================================================
   PDFEXAMTAB — Upload a PDF and take a real JLPT-style exam
   Supports: structured exam parsing (sections, passages, questions)
   and fallback vocab-matching mode for non-exam PDFs.
   ================================================================= */
function SharedExamTab(props) {
    var isMock = props.mode === 'mock';
    // Phase: upload → processing → preview → exam → review
    var _phase = useState('upload');
    var phase = _phase[0], setPhase = _phase[1];

    var _fileName = useState('');
    var fileName = _fileName[0], setFileName = _fileName[1];

    var _examData = useState(null);
    var examData = _examData[0], setExamData = _examData[1];

    var _currentSection = useState(0);
    var currentSection = _currentSection[0], setCurrentSection = _currentSection[1];

    var _currentQ = useState(0);
    var currentQ = _currentQ[0], setCurrentQ = _currentQ[1];

    // answers[sectionIdx][questionIdx] = selectedOptionIndex (0-3) or null
    var _answers = useState({});
    var answers = _answers[0], setAnswers = _answers[1];

    var _timer = useState(0);
    var timer = _timer[0], setTimer = _timer[1];

    var _timerActive = useState(false);
    var timerActive = _timerActive[0], setTimerActive = _timerActive[1];

    var _dragOver = useState(false);
    var dragOver = _dragOver[0], setDragOver = _dragOver[1];

    var _error = useState('');
    var error = _error[0], setError = _error[1];
    
    var _allExams = useState([]);
    var allExams = _allExams[0], setAllExams = _allExams[1];

    // Fallback vocab mode states
    var _vocabMatches = useState([]);
    var vocabMatches = _vocabMatches[0], setVocabMatches = _vocabMatches[1];

    var _vocabQuestions = useState([]);
    var vocabQuestions = _vocabQuestions[0], setVocabQuestions = _vocabQuestions[1];

    var _vocabQIndex = useState(0);
    var vocabQIndex = _vocabQIndex[0], setVocabQIndex = _vocabQIndex[1];

    var _vocabScore = useState(0);
    var vocabScore = _vocabScore[0], setVocabScore = _vocabScore[1];

    var _vocabSelected = useState(null);
    var vocabSelected = _vocabSelected[0], setVocabSelected = _vocabSelected[1];

    var _vocabShowAnswer = useState(false);
    var vocabShowAnswer = _vocabShowAnswer[0], setVocabShowAnswer = _vocabShowAnswer[1];


    var fileInputRef = React.useRef(null);
    var timerRef = React.useRef(null);

    // Mock Exam Auto-Load Effect
    useEffect(function () {
        if (props.mode === 'mock') {
            setPhase('processing');
            fetch('N2test.json')
                .then(function (res) {
                    if (!res.ok) throw new Error('Network error loading mock exam.');
                    return res.json();
                })
                .then(function (json) {
                    // Adapt new JSON format to internal examData format
                    var totalQ = 0;
                    var answerKey = {};
                    var mappedSections = json.sections.map(function(sec) {
                        totalQ += sec.questions.length;
                        var typeMap = { 'multiple_choice': 'vocabulary', 'grammar_ordering': 'grammar', 'reading_comprehension': 'reading' };
                        return {
                            title: sec.section_id,
                            type: typeMap[sec.question_type] || 'general',
                            instructions: sec.instruction,
                            passage: sec.passage || null, // Optional reading passage
                            questions: sec.questions.map(function(q) {
                                if (q.correct_option_id !== undefined) {
                                    answerKey[q.question_id] = q.correct_option_id;
                                }
                                // Convert [text] to <u>text</u> for display
                                var formattedText = q.text ? q.text.replace(/\[(.*?)\]/g, '<u>$1</u>') : "";
                                return {
                                    number: q.question_id,
                                    text: formattedText,
                                    options: q.options ? q.options.map(function(o) { return o.text; }) : [],
                                    subPassage: q.passage || null
                                };
                            })
                        };
                    });

                    var exam = {
                        title: json.test_id + ' - ' + json.title,
                        totalQuestions: totalQ,
                        answerKey: answerKey,
                        mode: 'exam',
                        sections: mappedSections
                    };

                    setFileName('N2test.json');
                    setExamData(exam);
                    setPhase('preview');
                })
                .catch(function (err) {
                    console.error(err);
                    setError('Failed to load mock exam automatically: ' + err.message + '. Please use a local server.');
                    setPhase('error');
                });
        }
    }, [props.mode]);



    // Timer effect
    useEffect(function () {
        if (timerActive) {
            timerRef.current = setInterval(function () {
                setTimer(function (t) { return t + 1; });
            }, 1000);
        }
        return function () { if (timerRef.current) clearInterval(timerRef.current); };
    }, [timerActive]);

    function formatTime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    async function handleFile(file) {
        if (!file) return;
        var isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        var isDocx = file.name.toLowerCase().endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        if (!isPdf && !isDocx) { setError('Please upload a PDF or DOCX file.'); return; }
        if (file.size > 50 * 1024 * 1024) { setError('File too large. Maximum 50MB.'); return; }

        setFileName(file.name);
        setError('');
        setPhase('processing');

        try {
            var text;
            if (isPdf) {
                var textData = await PDF_EXAM.extractText(file);
                text = textData.allText || textData;
            } else if (isDocx) {
                var arrayBuffer = await file.arrayBuffer();
                var result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, { styleMap: ["u => u"] });
                var html = result.value;
                // Convert block elements to newlines to simulate raw text layout
                html = html.replace(/<\/p>|<\/li>|<br\s*\/?>/gi, '\n');
                // Strip all HTML tags EXCEPT <u> and </u>
                text = html.replace(/<(?!u|\/u)[^>]+>/gi, '');
            }

            var examsArray = PDF_EXAM.parseExam(text);
            if (examsArray && examsArray.length > 0) {
                setAllExams(examsArray);
                if (examsArray.length > 1) {
                    setPhase('select_exam');
                } else {
                    setExamData(examsArray[0]);
                    setPhase('preview');
                }
                return;
            }

            if (isPdf || isDocx) {
                var vocabResults = PDF_EXAM.matchVocab(text);
                if (vocabResults.length > 0) {
                    setVocabMatches(vocabResults);
                    setExamData({ mode: 'vocab', matches: vocabResults });
                    setPhase('preview');
                    return;
                }
            }

            setError('Could not find structured exam questions in this file.');
            setPhase('upload');
        } catch (err) {
            setError('Failed to read file: ' + (err.message || 'Unknown error'));
            setPhase('upload');
        }
    }

    function startExam() {
        setCurrentSection(0);
        setCurrentQ(0);
        setAnswers({});
        setTimer(0);
        setTimerActive(true);
        setPhase('exam');
    }

    function startVocabQuiz() {
        var qs = PDF_EXAM.generateQuiz(vocabMatches, Math.min(20, vocabMatches.length));
        setVocabQuestions(qs);
        setVocabQIndex(0);
        setVocabScore(0);
        setVocabSelected(null);
        setVocabShowAnswer(false);
        setTimer(0);
        setTimerActive(true);
        setPhase('vocabquiz');
    }

    function selectAnswer(sIdx, qIdx, optIdx) {
        setAnswers(function (prev) {
            var next = Object.assign({}, prev);
            var key = sIdx + '-' + qIdx;
            next[key] = optIdx;
            return next;
        });
    }

    function getAnswer(sIdx, qIdx) {
        return answers[sIdx + '-' + qIdx];
    }

    function finishExam() {
        setTimerActive(false);
        setPhase('review');
    }

    function resetAll() {
        setPhase('upload');
        setExamData(null);
        setAllExams([]);
        setFileName('');
        setAnswers({});
        setTimer(0);
        setTimerActive(false);
        setCurrentSection(0);
        setCurrentQ(0);
        setVocabMatches([]);
        setVocabQuestions([]);
    }

    // ==== SECTION TYPE BADGES ====
    function sectionTypeBadge(type) {
        var icons = { vocabulary: '📝', grammar: '📐', reading: '📖', general: '📋' };
        var labels = { vocabulary: 'Vocabulary', grammar: 'Grammar', reading: 'Reading', general: 'General' };
        return <span className={'exam-type-badge exam-type-badge--' + type}>{(icons[type] || '📋') + ' ' + (labels[type] || type)}</span>;
    }

    // ==============================
    // VOCAB QUIZ MODE (fallback)
    // ==============================
    if (phase === 'vocabquiz' && vocabQuestions.length > 0) {
        var vq = vocabQuestions[vocabQIndex];
        var vProgress = ((vocabQIndex + 1) / vocabQuestions.length) * 100;

        if (vocabQIndex >= vocabQuestions.length) {
            // Results
            setTimerActive(false);
            var vPct = Math.round((vocabScore / vocabQuestions.length) * 100);
            return <div className='glass-card'><div className='result-panel'><div className='result-panel__emoji'>{vPct >= 80 ? '🏆' : vPct >= 60 ? '🎉' : '📚'}</div><div className='result-panel__title'>{vPct >= 80 ? 'Excellent!' : vPct >= 60 ? 'Good Job!' : 'Keep Studying!'}</div><div style={{
      fontSize: '3rem',
      fontWeight: 800,
      margin: '16px 0',
      background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent'
    }}>{vPct + '%'}</div><div style={{
      color: 'var(--text-secondary)'
    }}>{vocabScore + ' / ' + vocabQuestions.length + ' correct'}</div><div style={{
      display: 'flex',
      gap: 12,
      justifyContent: 'center',
      marginTop: 24
    }}><button className='btn btn--primary' onClick={startVocabQuiz}>↻ Retry</button><button className='btn btn--outline btn--small' onClick={resetAll}>📄 New PDF</button></div></div></div>;
        }

        var vOptEls = vq.options.map(function (opt, i) {
            var cls = 'quiz-option';
            if (vocabShowAnswer) {
                if (opt === vq.correct) cls += ' quiz-option--correct';
                else if (opt === vocabSelected) cls += ' quiz-option--wrong';
            }
            return <button key={i} className={cls} disabled={vocabShowAnswer} onClick={() => {
  if (vocabShowAnswer) return;
  setVocabSelected(opt);
  setVocabShowAnswer(true);
  if (opt === vq.correct) setVocabScore(function (s) {
    return s + 1;
  });
}}>{opt}</button>;
        });

        return <div className='glass-card'><div className='exam-topbar'><button className='quiz-bar__back' onClick={resetAll}>✕</button><span>{'Vocab Quiz • ' + (vocabQIndex + 1) + '/' + vocabQuestions.length}</span><span className='exam-timer'>{'⏱ ' + formatTime(timer)}</span></div><div className='progress-track'><div className='progress-fill' style={{
      width: vProgress + '%'
    }} /></div><div style={{
    textAlign: 'center',
    padding: '24px 0'
  }}><div className='exam-q-label'>{t('What does this mean?', props.appLang)}</div><div style={{
      fontSize: '2.8rem',
      fontWeight: 700,
      fontFamily: 'var(--font-jp)'
    }}>{vq.word}</div>{vq.reading && <div style={{
      fontSize: '1rem',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-jp)',
      marginTop: 4
    }}>{vq.reading}</div>}</div><div className='quiz-options'>{vOptEls}</div>{vocabShowAnswer && <button className='btn btn--primary btn--full btn--next' onClick={() => {
    if (vocabQIndex + 1 >= vocabQuestions.length) {
      PROGRESS.recordQuiz(vocabScore + (vocabSelected === vq.correct ? 0 : 0), vocabQuestions.length, 'PDF', 'meaning');
      setTimerActive(false);
      var finalPct = Math.round(vocabScore / vocabQuestions.length * 100);
      setPhase('upload'); // trigger re-render
      // Hacky but works: set timeout to show results
    }
    setVocabQIndex(function (i) {
      return i + 1;
    });
    setVocabSelected(null);
    setVocabShowAnswer(false);
  }}>{vocabQIndex + 1 >= vocabQuestions.length ? 'View Results →' : 'Next →'}</button>}</div>;
    }

    // ==============================
    // REVIEW PHASE (exam mode)
    // ==============================
    if (phase === 'review' && examData && examData.mode === 'exam') {
        var totalAnswered = Object.keys(answers).length;
        var totalQ = examData.totalQuestions;
        var hasKey = examData.answerKey && Object.keys(examData.answerKey).length > 0;

        // Calculate score if answer key exists
        var correctCount = 0;
        if (hasKey) {
            examData.sections.forEach(function (sec, sIdx) {
                sec.questions.forEach(function (q, qIdx) {
                    var userAns = getAnswer(sIdx, qIdx);
                    if (userAns !== undefined && examData.answerKey[q.number] !== undefined) {
                        if (userAns + 1 === examData.answerKey[q.number]) correctCount++;
                    }
                });
            });
        }

        // Section-by-section review
        var reviewSections = examData.sections.map(function (sec, sIdx) {
            var secAnswered = sec.questions.filter(function (_, qIdx) {
                return getAnswer(sIdx, qIdx) !== undefined;
            }).length;

            var questionReviews = sec.questions.map(function (q, qIdx) {
                var userAns = getAnswer(sIdx, qIdx);
                var isCorrect = hasKey && examData.answerKey[q.number] !== undefined && userAns + 1 === examData.answerKey[q.number];
                var correctOpt = hasKey && examData.answerKey[q.number] !== undefined ? examData.answerKey[q.number] - 1 : null;

                var optionEls = q.options.map(function (opt, optIdx) {
                    var cls = 'exam-review-option';
                    if (userAns === optIdx) cls += ' exam-review-option--selected';
                    if (hasKey && correctOpt === optIdx) cls += ' exam-review-option--correct';
                    if (hasKey && userAns === optIdx && !isCorrect) cls += ' exam-review-option--wrong';
                    
                    var optContent = opt || '—';
                    if (hasKey && !isCorrect && props.showFurigana && opt) {
                        optContent = <FuriganaText text={opt} show={true} />;
                    }
                    
                    return <div key={optIdx} className={cls}><span className='exam-review-option__num'>{optIdx + 1}</span><span>{optContent}</span></div>;
                });

                return <div key={qIdx} className='exam-review-q'><div className='exam-review-q__header'><span className='exam-review-q__num'>{'Q' + q.number}</span>{userAns === undefined ? <span className='exam-review-q__skip'>Skipped</span> : hasKey ? isCorrect ? <span className='exam-review-q__correct'>✓ Correct</span> : <span className='exam-review-q__wrong'>✗ Wrong</span> : <span className='exam-review-q__answered'>{'Answered: ' + (userAns + 1)}</span>}</div><div className='exam-review-q__text' dangerouslySetInnerHTML={{
    __html: sanitizeHTML(q.text)
  }} /><div className='exam-review-options'>{optionEls}</div></div>;
            });

            return <div key={sIdx} className='exam-review-section'><div className='exam-review-section__header'>{sectionTypeBadge(sec.type)}<span>{sec.title}</span><span className='exam-review-section__count'>{secAnswered + '/' + sec.questions.length}</span></div>{questionReviews}</div>;
        });

        return <div className='glass-card'><div className='exam-topbar'><button className='quiz-bar__back' onClick={resetAll}>✕</button><span>Exam Review</span><span className='exam-timer'>{'⏱ ' + formatTime(timer)}</span></div><div className='exam-results-summary'><h2 className='section-title' style={{
      marginBottom: 8
    }}>Exam Complete</h2><div className='exam-results-stats'><div className='exam-stat'><div className='exam-stat__value'>{totalAnswered + '/' + totalQ}</div><div className='exam-stat__label'>Answered</div></div><div className='exam-stat'><div className='exam-stat__value'>{formatTime(timer)}</div><div className='exam-stat__label'>Time</div></div>{hasKey && <div className='exam-stat exam-stat--score'><div className='exam-stat__value'>{correctCount + '/' + totalQ}</div><div className='exam-stat__label'>Score</div></div>}{hasKey && <div className='exam-stat exam-stat--score'><div className='exam-stat__value'>{Math.round(correctCount / totalQ * 100) + '%'}</div><div className='exam-stat__label'>Accuracy</div></div>}</div>{!hasKey && <div className='exam-no-key-notice'>💡 No answer key found in the PDF. Your selected answers are shown below for self-checking.</div>}</div><div className='exam-review-body'>{reviewSections}</div><div style={{
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    marginTop: 24
  }}><button className='btn btn--primary' onClick={() => {
      startExam();
    }}>↻ Retake Exam</button><button className='btn btn--outline btn--small' onClick={resetAll}>📄 New PDF</button></div></div>;
    }

    // ==============================
    // EXAM PHASE
    // ==============================
    if (phase === 'exam' && examData && examData.sections) {
        var sec = examData.sections[currentSection];
        if (!sec) { finishExam(); return null; }

        var q = sec.questions[currentQ];
        var globalQNum = 0;
        for (var gi = 0; gi < currentSection; gi++) globalQNum += examData.sections[gi].questions.length;
        globalQNum += currentQ + 1;
        var totalProgress = (globalQNum / examData.totalQuestions) * 100;

        // Section nav pills
        var sectionPills = examData.sections.map(function (s, sIdx) {
            var answeredInSec = s.questions.filter(function (_, qIdx) { return getAnswer(sIdx, qIdx) !== undefined; }).length;
            var cls = 'exam-sec-pill';
            if (sIdx === currentSection) cls += ' exam-sec-pill--active';
            if (answeredInSec === s.questions.length) cls += ' exam-sec-pill--complete';
            return <button key={sIdx} className={cls} onClick={() => {
  setCurrentSection(sIdx);
  setCurrentQ(0);
}}>{s.title}<span className='exam-sec-pill__count'>{answeredInSec + '/' + s.questions.length}</span></button>;
        });

        // Question nav dots
        var qDots = sec.questions.map(function (_, qIdx) {
            var ans = getAnswer(currentSection, qIdx);
            var cls = 'exam-q-dot';
            if (qIdx === currentQ) cls += ' exam-q-dot--active';
            if (ans !== undefined) cls += ' exam-q-dot--answered';
            return <button key={qIdx} className={cls} onClick={() => {
  setCurrentQ(qIdx);
}}>{qIdx + 1}</button>;
        });

        // Option buttons
        var selectedOpt = getAnswer(currentSection, currentQ);
        var optionEls = [];
        if (q && q.options && q.options.length > 0) {
            optionEls = q.options.map(function (opt, optIdx) {
                if (!opt || opt === '—') return null;
                var cls = 'exam-option';
                if (selectedOpt === optIdx) cls += ' exam-option--selected';
                return <button key={optIdx} className={cls} onClick={() => {
  selectAnswer(currentSection, currentQ, optIdx);
}}><span className='exam-option__num'>{optIdx + 1}</span><span className='exam-option__text'>{opt}</span></button>;
            }).filter(Boolean);
        }

        // Navigation buttons
        var isFirst = currentSection === 0 && currentQ === 0;
        var isLast = currentSection === examData.sections.length - 1 && currentQ === sec.questions.length - 1;

        function goPrev() {
            if (currentQ > 0) { setCurrentQ(currentQ - 1); }
            else if (currentSection > 0) {
                var prevSec = examData.sections[currentSection - 1];
                setCurrentSection(currentSection - 1);
                setCurrentQ(prevSec.questions.length - 1);
            }
        }
        function goNext() {
            if (currentQ < sec.questions.length - 1) { setCurrentQ(currentQ + 1); }
            else if (currentSection < examData.sections.length - 1) {
                setCurrentSection(currentSection + 1);
                setCurrentQ(0);
            }
        }

        return <div className='glass-card exam-card'>
  <div className='exam-topbar'><button className='quiz-bar__back' onClick={() => {
      if (confirm('Are you sure? Your progress will be saved for review.')) finishExam();
    }}>✕</button><span>{examData.title}</span><span className='exam-timer'>{'⏱ ' + formatTime(timer)}</span></div>
  <div className='progress-track'><div className='progress-fill' style={{
      width: totalProgress + '%'
    }} /></div>
  <div className='exam-sec-nav'>{sectionPills}</div>
  <div className='exam-section-info'>{sectionTypeBadge(sec.type)}{sec.instructions && <p className='exam-section-instr'>{sec.instructions}</p>}</div>{
  // Reading passage
  sec.passage && <div className='exam-passage'><div className='exam-passage__label'>📖 Reading Passage</div><div className='exam-passage__text'>{sec.passage}</div></div>}{
  // Sub-passage for this question
  q && q.subPassage && <div className='exam-passage exam-passage--sub'><div className='exam-passage__text'>{q.subPassage}</div></div>} // Question dots
  <div className='exam-q-nav'>{qDots}</div>{
  // Question
  q && <div className='exam-question'><div className='exam-question__num'>{'Q' + q.number}</div><div className='exam-question__text' dangerouslySetInnerHTML={{
      __html: sanitizeHTML(q.text)
    }} /></div>} // Options
  <div className='exam-options'>{optionEls}</div>
  <div className='exam-nav-btns'><button className='btn btn--outline btn--small' disabled={isFirst} onClick={goPrev}>← Previous</button><button className='btn btn--primary' onClick={isLast ? finishExam : goNext}>{isLast ? '✓ Finish Exam' : 'Next →'}</button>{!isLast ? <button className='btn btn--outline btn--small' style={{
      marginLeft: '12px',
      borderColor: 'var(--danger)',
      color: 'var(--danger)'
    }} onClick={finishExam}>Submit Early</button> : null}</div></div>;
    }

    // ==============================
    // SELECT EXAM PHASE
    // ==============================
    if (phase === 'select_exam' && allExams.length > 0) {
        var examList = allExams.map(function(exam, i) {
            return <button key={i} className='btn btn--outline' style={{
  display: 'block',
  width: '100%',
  marginBottom: '12px',
  textAlign: 'left',
  padding: '16px'
}} onClick={() => {
  setExamData(exam);
  setPhase('preview');
}}>{'📄 ' + exam.title + ' (' + exam.totalQuestions + ' questions)'}</button>;
        });
        
        return <div className='glass-card'><div className='flashcard-header'><button className='quiz-bar__back' onClick={resetAll}>←</button><span>{'📄 ' + fileName}</span><span /></div><h2 className='section-title' style={{
    marginTop: 16
  }}>Select Exam to Take</h2><p className='section-desc'>This file contains multiple tests. Please select one:</p><div style={{
    marginTop: 24
  }}>{examList}</div></div>;
    }

    // ==============================
    // PREVIEW PHASE
    // ==============================
    if (phase === 'preview' && examData) {
        // === EXAM MODE PREVIEW ===
        if (examData.mode === 'exam') {
            var secSummary = examData.sections.map(function (sec, i) {
                return <div key={i} className='exam-preview-sec'>{sectionTypeBadge(sec.type)}<div className='exam-preview-sec__info'><div className='exam-preview-sec__title'>{sec.title}</div><div className='exam-preview-sec__detail'>{sec.questions.length + ' questions' + (sec.passage ? ' • Has reading passage' : '') + (sec.instructions ? ' • ' + sec.instructions.substring(0, 60) + (sec.instructions.length > 60 ? '...' : '') : '')}</div></div></div>;
            });

            return <div className='glass-card'><div className='flashcard-header'><button className='quiz-bar__back' onClick={resetAll}>←</button><span>{'📄 ' + fileName}</span><span /></div><h2 className='section-title' style={{
    marginTop: 16
  }}>{examData.title}</h2><p className='section-desc'>{'Found ' + examData.sections.length + ' sections with ' + examData.totalQuestions + ' questions total.'}</p>{examData.answerKey && Object.keys(examData.answerKey).length > 0 && <div className='exam-key-notice'>✅ Answer key detected! Your exam will be auto-graded.</div>}<div className='exam-preview-sections'>{secSummary}</div><div className='setup-center'><button className='btn btn--primary btn--large btn--glow' onClick={startExam} style={{
      marginTop: 24
    }}>▶  Start Exam (Timed)</button></div></div>;
        }

        // === VOCAB MODE PREVIEW (fallback) ===
        if (examData.mode === 'vocab') {
            var previewWords = vocabMatches.slice(0, 15).map(function (m, i) {
                return <div key={i} className='pdf-word-chip'><span className='pdf-word-chip__word'>{m.word}</span><span className='pdf-word-chip__meaning'>{m.correct}</span>{m.level && <span className='pdf-word-chip__level'>{m.level}</span>}</div>;
            });

            return <div className='glass-card'><div className='flashcard-header'><button className='quiz-bar__back' onClick={resetAll}>←</button><span>{'📄 ' + fileName}</span><span /></div><h2 className='section-title' style={{
    marginTop: 16
  }}>Vocabulary Mode</h2><p className='section-desc'>{'No structured exam found. Found ' + vocabMatches.length + ' JLPT vocabulary words — generating a vocab quiz instead.'}</p><div className='pdf-words-preview'>{previewWords}</div>{vocabMatches.length > 15 && <p style={{
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
    marginTop: 8
  }}>{'...and ' + (vocabMatches.length - 15) + ' more words'}</p>}<div className='setup-center'><button className='btn btn--primary btn--large btn--glow' onClick={startVocabQuiz} style={{
      marginTop: 24
    }}>▶  Start Vocab Quiz</button></div></div>;
        }
    }

    // ==============================
    // PROCESSING PHASE
    // ==============================
    if (phase === 'processing') {
        return <div className='glass-card'><div style={{
    textAlign: 'center',
    padding: '60px 20px'
  }}><div className='pdf-processing-icon'>📄</div><h3 style={{
      marginTop: 16,
      marginBottom: 8
    }}>Analyzing PDF...</h3><p style={{
      color: 'var(--text-muted)'
    }}>Detecting exam structure, sections, and questions</p><div className='pdf-processing-bar'><div className='pdf-processing-bar__fill' /></div></div></div>;
    }

    // ==============================
    // UPLOAD PHASE
    // ==============================
    if (isMock) return null; // Mock exam doesn't use upload phase anymore
    return <div className='glass-card'><h2 className='section-title'>{isMock ? '🎓 Mock Exam' : '📄 PDF Exam'}</h2><p className='section-desc'>{isMock ? 'Loading the mock exam...' : 'Upload a real JLPT practice exam PDF. The app will parse sections (語彙・文法・読解), extract questions with options, and let you take a timed exam.'}</p><div className={'pdf-upload-zone' + (dragOver ? ' pdf-upload-zone--dragover' : '')} onDrop={e => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }} onDragOver={e => {
    e.preventDefault();
    setDragOver(true);
  }} onDragLeave={() => {
    setDragOver(false);
  }} onClick={() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }}><div className='pdf-upload-zone__icon'>{isMock ? '📝' : '📁'}</div><div className='pdf-upload-zone__title'>{isMock ? 'Drop your exam DOCX here' : 'Drop your exam PDF here'}</div><div className='pdf-upload-zone__hint'>or click to browse • Supports JLPT N5–N1 practice exams</div><input ref={fileInputRef} type='file' accept={isMock ? '.docx' : '.pdf'} style={{
      display: 'none'
    }} onChange={e => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    }} /></div>{error && <div className='pdf-error'>{'⚠️ ' + error}</div>}<div className='pdf-info'><h3 style={{
      fontSize: '1rem',
      marginBottom: 12
    }}>🎯 What this supports</h3><ul className='pdf-info__list'><li>語彙 (Vocabulary) — Kanji readings, word meanings, usage</li><li>文法 (Grammar) — Sentence completion, grammar forms</li><li>読解 (Reading) — Passages with comprehension questions</li><li>Timed exam mode with section navigation</li><li>Auto-grading when answer key is included</li>{!isMock && <li>Fallback vocab quiz mode for non-exam PDFs</li>}</ul></div></div>;
}


function PDFExamTab() {
    return <SharedExamTab mode='pdf' />;
}

function MockExamTab(props) {
    var _phase = useState('loading');
    var phase = _phase[0], setPhase = _phase[1];

    var _examData = useState(null);
    var examData = _examData[0], setExamData = _examData[1];

    var _error = useState('');
    var error = _error[0], setError = _error[1];

    var _currentSection = useState(0);
    var currentSection = _currentSection[0], setCurrentSection = _currentSection[1];

    var _currentQ = useState(0);
    var currentQ = _currentQ[0], setCurrentQ = _currentQ[1];

    var _answers = useState({});
    var answers = _answers[0], setAnswers = _answers[1];

    var _timer = useState(0);
    var timer = _timer[0], setTimer = _timer[1];

    var _timerActive = useState(false);
    var timerActive = _timerActive[0], setTimerActive = _timerActive[1];

    var timerRef = useRef(null);

    useEffect(function() {
        if (!window.N2_MOCK_EXAM) {
            setError('N2_MOCK_EXAM data not found. Please ensure n2test_data.js is loaded.');
            setPhase('error');
            return;
        }

        try {
            var json = window.N2_MOCK_EXAM;
            var totalQ = 0;
            var answerKey = {};
            var mappedSections = json.sections.map(function(sec) {
                totalQ += sec.questions.length;
                return {
                    title: sec.section_id,
                    instructions: sec.instruction,
                    questions: sec.questions.map(function(q) {
                        if (q.correct_option_id !== undefined) {
                            answerKey[q.question_id] = q.correct_option_id;
                        }
                        var formattedText = q.text ? q.text.replace(/\[(.*?)\]/g, '<u>$1</u>') : "";
                        return {
                            number: q.question_id,
                            text: formattedText,
                            options: q.options ? q.options.map(function(o) { return o.text; }) : [],
                            passage: q.passage || null,
                            correctOpt: q.correct_option_id ? q.correct_option_id - 1 : null
                        };
                    })
                };
            });

            setExamData({
                title: json.test_id + ' - ' + json.title,
                totalQuestions: totalQ,
                timeLimit: json.time_limit_minutes,
                answerKey: answerKey,
                sections: mappedSections
            });
            setPhase('setup');
        } catch(err) {
            console.error(err);
            setError('Error parsing N2_MOCK_EXAM data.');
            setPhase('error');
        }
    }, []);

    useEffect(function () {
        if (timerActive) {
            timerRef.current = setInterval(function () {
                setTimer(function (t) { return t + 1; });
            }, 1000);
        }
        return function () { if (timerRef.current) clearInterval(timerRef.current); };
    }, [timerActive]);

    function formatTime(seconds) {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function startExam() {
        setCurrentSection(0);
        setCurrentQ(0);
        setAnswers({});
        setTimer(0);
        setTimerActive(true);
        setPhase('exam');
    }

    function selectAnswer(sIdx, qIdx, optIdx) {
        setAnswers(function (prev) {
            var next = Object.assign({}, prev);
            next[sIdx + '-' + qIdx] = optIdx;
            return next;
        });
    }

    function getAnswer(sIdx, qIdx) {
        return answers[sIdx + '-' + qIdx];
    }

    if (phase === 'loading') {
        return <div className='glass-card' style={{
  textAlign: 'center',
  padding: '40px'
}}><h2>{t('Loading Mock Exam...', props.appLang)}</h2><p style={{
    color: 'var(--text-muted)'
  }}>{t('Fetching N2test.json', props.appLang)}</p></div>;
    }

    if (phase === 'error') {
        return <div className='glass-card' style={{
  textAlign: 'center',
  padding: '40px'
}}><h2 style={{
    color: 'var(--danger)'
  }}>{t('Error', props.appLang)}</h2><p>{error}</p></div>;
    }

    if (phase === 'setup' && examData) {
        return <div className='glass-card mock-exam-wrapper' style={{
  textAlign: 'center',
  padding: '40px'
}}><div className='mock-header-card'><h2 className='section-title' style={{
      marginBottom: '10px'
    }}>{'📝 ' + t('Mock Exam', props.appLang)}</h2><h3 style={{
      margin: '15px 0',
      fontSize: '1.5rem',
      color: 'var(--primary)'
    }}>{examData.title}</h3><p style={{
      marginBottom: '10px',
      fontSize: '1.1rem'
    }}>{t('Total Questions: ', props.appLang) + examData.totalQuestions}</p><p style={{
      marginBottom: '30px',
      fontSize: '1.1rem'
    }}>{t('Time Limit: ', props.appLang) + examData.timeLimit + ' ' + t('minutes', props.appLang)}</p><button className='btn btn--primary btn--large btn--glow' onClick={startExam}>{'▶ ' + t('START EXAM', props.appLang)}</button></div></div>;
    }

    if (phase === 'exam' && examData) {
        var sec = examData.sections[currentSection];
        var q = sec.questions[currentQ];

        var optionEls = q.options.map(function(opt, idx) {
            var isSelected = getAnswer(currentSection, currentQ) === idx;
            var cls = 'mock-option-btn';
            if (isSelected) cls += ' selected';
            return <button key={idx} className={cls} onClick={() => {
  selectAnswer(currentSection, currentQ, idx);
}}><span className='mock-option-num'>{idx + 1}</span><span>{opt}</span></button>;
        });

        var isFirst = currentSection === 0 && currentQ === 0;
        var isLast = currentSection === examData.sections.length - 1 && currentQ === sec.questions.length - 1;

        return <div className='glass-card mock-exam-wrapper'><div className='exam-topbar' style={{
    marginBottom: '20px'
  }}><button className='quiz-bar__back' style={{
      width: 'auto',
      padding: '0 16px',
      borderRadius: '20px'
    }} onClick={() => {
      setPhase('setup');
      setTimerActive(false);
    }}>{'✕ ' + t('Quit', props.appLang)}</button><span style={{
      fontWeight: 'bold',
      color: 'var(--text-secondary)'
    }}>{sec.title + ' (' + (currentQ + 1) + '/' + sec.questions.length + ')'}</span><span className='exam-timer' style={{
      fontWeight: 'bold'
    }}>{'⏱ ' + formatTime(timer)}</span></div>{sec.instructions && <div style={{
    margin: '20px 0',
    padding: '15px',
    background: 'rgba(var(--primary-rgb),0.05)',
    borderLeft: '4px solid var(--primary)',
    borderRadius: '4px'
  }}>{sec.instructions}</div>}{q.passage && <div className='mock-passage-box'><div className='exam-passage__text'>{q.passage}</div></div>}<div className='mock-question-text'><span style={{
      color: 'var(--primary)',
      marginRight: '12px'
    }}>{'Q' + q.number + '.'}</span><span dangerouslySetInnerHTML={{
      __html: sanitizeHTML(q.text)
    }} /></div><div style={{
    marginTop: '20px'
  }}>{optionEls}</div><div className='exam-nav' style={{
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '40px',
    paddingTop: '20px',
    borderTop: '1px solid rgba(0,0,0,0.05)'
  }}><button className='btn btn--outline' disabled={isFirst} onClick={() => {
      if (currentQ > 0) setCurrentQ(currentQ - 1);else {
        setCurrentSection(currentSection - 1);
        setCurrentQ(examData.sections[currentSection - 1].questions.length - 1);
      }
    }}>{'← ' + t('Previous', props.appLang)}</button>{!isLast ? <div style={{
      display: 'flex',
      gap: '10px'
    }}><button className='btn btn--outline' style={{
        color: 'var(--danger)',
        borderColor: 'var(--danger)'
      }} onClick={() => {
        if (confirm(t('Are you sure you want to submit early?', props.appLang) || 'Are you sure you want to submit early?')) {
          setPhase('review');
          setTimerActive(false);
        }
      }}>{t('Submit Early', props.appLang) || 'Submit Early'}</button><button className='btn btn--primary' onClick={() => {
        if (currentQ < sec.questions.length - 1) setCurrentQ(currentQ + 1);else {
          setCurrentSection(currentSection + 1);
          setCurrentQ(0);
        }
      }}>{t('Next', props.appLang) + ' →'}</button></div> : <button className='btn btn--primary' style={{
      background: 'var(--success)'
    }} onClick={() => {
      setPhase('review');
      setTimerActive(false);
    }}>{t('Submit Exam', props.appLang) + ' ✓'}</button>}</div></div>;
    }

    if (phase === 'review' && examData) {
        var correctCount = 0;
        var answeredCount = 0;

        var reviewSections = examData.sections.map(function(sec, sIdx) {
            var qReviews = sec.questions.map(function(q, qIdx) {
                var userAns = getAnswer(sIdx, qIdx);
                if (userAns !== undefined) answeredCount++;
                var isCorrect = userAns === q.correctOpt;
                if (isCorrect) correctCount++;

                var opts = q.options.map(function(opt, optIdx) {
                    var isSelected = userAns === optIdx;
                    var isCorrectOpt = q.correctOpt === optIdx;
                    
                    var bg = 'var(--bg-primary)';
                    var border = '1px solid rgba(0,0,0,0.1)';
                    if (isCorrectOpt) { bg = 'rgba(16, 185, 129, 0.1)'; border = '2px solid var(--success)'; }
                    else if (isSelected && !isCorrect) { bg = 'rgba(239, 68, 68, 0.1)'; border = '2px solid var(--danger)'; }
                    
                    return <div key={optIdx} style={{
  padding: '12px',
  marginBottom: '8px',
  borderRadius: '8px',
  background: bg,
  border: border,
  display: 'flex',
  alignItems: 'center'
}}><span className='mock-option-num' style={{
    width: '24px',
    height: '24px',
    marginRight: '12px',
    fontSize: '0.9rem',
    background: isCorrectOpt ? 'var(--success)' : isSelected ? 'var(--danger)' : 'rgba(0,0,0,0.05)',
    color: isCorrectOpt || isSelected ? 'white' : 'inherit'
  }}>{optIdx + 1}</span><span>{opt}</span></div>;
                });

                var qCls = 'mock-review-card';
                if (isCorrect) qCls += ' mock-review-correct';
                else if (userAns === undefined) qCls += ' mock-review-skipped';
                else qCls += ' mock-review-wrong';

                return <div key={qIdx} className={qCls}><div style={{
    fontWeight: 'bold',
    marginBottom: '15px',
    color: 'var(--text-secondary)'
  }}>{'Q' + q.number + ' ' + (isCorrect ? '✅ Correct' : userAns === undefined ? '⚪ Skipped' : '❌ Wrong')}</div><div dangerouslySetInnerHTML={{
    __html: sanitizeHTML(q.text)
  }} className='mock-question-text' style={{
    borderBottom: 'none',
    paddingBottom: '0'
  }} /><div style={{
    marginTop: '15px'
  }}>{opts}</div></div>;
            });

            return <div key={sIdx} style={{
  marginTop: '30px'
}}><h3 className='section-title' style={{
    fontSize: '1.2rem',
    marginBottom: '15px'
  }}>{sec.title}</h3>{qReviews}</div>;
        });

        return <div className='glass-card'><div className='exam-topbar'><button className='quiz-bar__back' onClick={() => {
      setPhase('setup');
    }}>✕ Back</button><span>Exam Review</span><span className='exam-timer'>{'⏱ ' + formatTime(timer)}</span></div><div style={{
    textAlign: 'center',
    padding: '30px 0',
    borderBottom: '1px solid #ddd'
  }}><h2 style={{
      fontSize: '2rem',
      marginBottom: '10px'
    }}>{'Score: ' + correctCount + ' / ' + examData.totalQuestions}</h2><p>{'Answered ' + answeredCount + ' out of ' + examData.totalQuestions + ' questions.'}</p></div><div>{reviewSections}</div></div>;
    }

    return null;
}

/* =================================================================
   APP ROOT COMPONENT
   Top-level component that manages:
   - Tab navigation (Dictionary, Kanji, Flashcards, Conjugation, Grammar, Quiz, Dashboard, Saved, Custom)
   - Custom questions state (add/delete)
   - Question pool composition (built-in JLPT_VOCAB + custom questions)
   - Keyboard shortcuts
   ================================================================= */
function LanguageSelector(props) {
    var _isOpen = useState(false);
    var isOpen = _isOpen[0], setIsOpen = _isOpen[1];
    var menuRef = useRef(null);

    useEffect(function() {
        var options = [
            { id: 'en', label: '🇬🇧 EN' },
            { id: 'vn', label: '🇻🇳 VN' },
            { id: 'my', label: '🇲🇲 MY' },
            { id: 'ja', label: '🇯🇵 JA' }
        ];
        var styleId = 'language-selector-styles';
        if (!document.getElementById(styleId)) {
            var style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .custom-lang-selector { position: relative; display: inline-block; z-index: 50; }
                .nav-tab--active::after { display: none !important; }
                .nav-indicator { background: linear-gradient(135deg, var(--primary), var(--secondary)) !important; }
                .nav-tab::before { display: none !important; }
                .lang-selector-btn {
                    background: rgba(255, 255, 255, 0.1); color: var(--text-primary, #fff);
                    border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 20px;
                    padding: 8px 16px; font-size: 0.9rem; font-weight: 500; cursor: pointer;
                    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                    transition: all 0.2s ease; display: flex; align-items: center; gap: 8px;
                }
                .lang-selector-btn:hover { background-color: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.3); }
                .lang-selector-btn .arrow { font-size: 0.7rem; transition: transform 0.2s ease; }
                .lang-selector-btn .arrow.up { transform: rotate(180deg); }
                .lang-dropdown {
                    position: absolute; top: 100%; right: 0; margin-top: 8px;
                    background: var(--bg-elevated); border: 1px solid var(--border-glass);
                    border-radius: 8px; padding: 8px; min-width: 120px;
                    box-shadow: var(--shadow-lg); z-index: 1000;
                    display: flex; flex-direction: column; gap: 4px;
                    animation: fadeInDown 0.2s ease-out;
                }
                @keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                .lang-option {
                    background: transparent; border: none; color: var(--text-secondary);
                    padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;
                    cursor: pointer; text-align: left; transition: all 0.2s ease;
                }
                .lang-option:hover { background: var(--bg-hover); color: var(--text-primary); }
                .lang-option.active {
                    background: var(--primary);
                    color: white; font-weight: bold;
                }
            `;
            document.head.appendChild(style);
        }

        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return function() { document.removeEventListener('mousedown', handleClickOutside); };
    }, []);

    var options = [
        { id: 'en', label: '🇬🇧 EN' },
        { id: 'vn', label: '🇻🇳 VN' },
        { id: 'my', label: '🇲🇲 MY' },
        { id: 'ja', label: '🇯🇵 JA' }
    ];
    var selected = options.find(function(o) { return o.id === props.value; }) || options[0];

    return <div className='custom-lang-selector' ref={menuRef}><button className='lang-selector-btn' onClick={() => {
    setIsOpen(!isOpen);
  }}>{selected.label}<span className={'arrow' + (isOpen ? ' up' : '')}>▼</span></button>{isOpen && <div className='lang-dropdown'>{options.map(function (opt) {
      return <button key={opt.id} className={'lang-option' + (opt.id === props.value ? ' active' : '')} onClick={() => {
        props.onChange(opt.id);
        setIsOpen(false);
      }}>{opt.label}</button>;
    })}</div>}</div>;
}

function HeaderLoginWidget() {
    var _profile = useState(function() { return typeof LEADERBOARD_API !== 'undefined' ? LEADERBOARD_API.getProfile() : null; });
    var profile = _profile[0], setProfile = _profile[1];

    var _firebaseUser = useState(function() {
        return (typeof AUTH !== 'undefined' && AUTH.authObj && AUTH.authObj.currentUser) ? AUTH.authObj.currentUser : null;
    });
    var firebaseUser = _firebaseUser[0], setFirebaseUser = _firebaseUser[1];

    var _isOpen = useState(false);
    var isOpen = _isOpen[0], setIsOpen = _isOpen[1];

    useEffect(function() {
        var handleProfileUpdate = function() {
            if (typeof LEADERBOARD_API !== 'undefined') setProfile(LEADERBOARD_API.getProfile());
        };
        window.addEventListener('profileUpdate', handleProfileUpdate);

        var unsubscribe = null;
        if (typeof AUTH !== 'undefined' && AUTH.authObj) {
            unsubscribe = AUTH.authObj.onAuthStateChanged(function(user) {
                setFirebaseUser(user);
                if (typeof LEADERBOARD_API !== 'undefined') setProfile(LEADERBOARD_API.getProfile());
            });
        }
        return function() {
            window.removeEventListener('profileUpdate', handleProfileUpdate);
            if (unsubscribe) unsubscribe();
        };
    }, []);

    function handleGoogleLogin() {
        if (typeof AUTH !== 'undefined') {
            AUTH.signIn().then(function() { setIsOpen(false); }).catch(function(e) { alert('Login failed: ' + e.message); });
        }
    }

    function handleGuestLogin() {
        if (typeof AUTH !== 'undefined') {
            AUTH.signInAsGuest().then(function() { setIsOpen(false); }).catch(function(e) { alert('Guest login failed: ' + e.message); });
        }
    }

    function handleLogout() {
        if (typeof AUTH !== 'undefined') {
            AUTH.signOut().then(function() { setIsOpen(false); });
        }
    }

    var isAnonymous = firebaseUser && firebaseUser.isAnonymous;
    var isGoogleUser = firebaseUser && !firebaseUser.isAnonymous && firebaseUser.uid;
    var isSignedIn = !!firebaseUser;

    // Determine what to show in the button
    var displayName, displayAvatar, accountLabel;
    if (isGoogleUser) {
        displayName = (firebaseUser.displayName) || (profile && profile.name) || 'Account';
        displayAvatar = firebaseUser.photoURL || (profile && profile.avatar) || '👤';
        accountLabel = 'Google Account';
    } else if (isAnonymous) {
        displayName = 'Guest';
        displayAvatar = (profile && profile.avatar) || '👤';
        accountLabel = 'Guest Session';
    } else {
        displayName = 'Sign In';
        displayAvatar = '👤';
        accountLabel = 'Not signed in';
    }

    var avatarEl = (isGoogleUser && firebaseUser.photoURL)
        ? <img src={firebaseUser.photoURL} className='login-widget__avatar-img' alt='' />
        : <span>{displayAvatar}</span>;

    var dropdownMenu = isOpen ? <div className='login-widget__dropdown'><div className='login-widget__dropdown-header'><strong className='login-widget__dropdown-name'>{displayName}</strong><div className='login-widget__dropdown-label'>{accountLabel}</div></div>{!isGoogleUser && <button className='login-widget__action login-widget__action--google' onClick={handleGoogleLogin}>🔑 Sign in with Google</button>}{!isSignedIn && <button className='login-widget__action login-widget__action--ghost' onClick={handleGuestLogin}>👤 Continue as Guest</button>}{isSignedIn && <button className='login-widget__action login-widget__action--ghost' onClick={handleLogout}>Sign Out</button>}</div> : null;

    return <div className='login-widget'><button className={'login-widget__btn' + (isGoogleUser ? ' login-widget__btn--google' : isAnonymous ? ' login-widget__btn--guest' : '')} onClick={() => {
    setIsOpen(!isOpen);
  }} aria-expanded={isOpen} aria-label={'Account: ' + displayName}><div className='login-widget__avatar'>{avatarEl}</div><span className='login-widget__name'>{displayName}</span></button>{dropdownMenu}</div>;
}

function FuriganaText(props) {
    var text = props.text;
    var show = props.show;
    if (!text) return null;
    
    // Pattern matches one or more Kanji (plus kana to handle okurigana inside readings sometimes if formatted weird, 
    // but the regex focuses on preceding Kanji block) followed by fullwidth or halfwidth parenthesis.
    // e.g. "彼（かれ）" -> Kanji: 彼, Reading: かれ
    var parts = [];
    var regex = /([一-龯]+)[（\(]([^）\)]+)[）\)]/g;
    var lastIndex = 0;
    var match;
    
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        if (show) {
            parts.push(<ruby key={match.index}>{match[1]}<rt>{match[2]}</rt></ruby>);
        } else {
            parts.push(match[1]); // Just the Kanji
        }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    
    return <span>{parts}</span>;
}

function CustomSelect(props) {
    var _isOpen = useState(false);
    var isOpen = _isOpen[0], setIsOpen = _isOpen[1];
    var menuRef = useRef(null);

    useEffect(function() {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return function() { document.removeEventListener('mousedown', handleClickOutside); };
    }, []);

    var selectedOpt = props.options.find(function(o) { return o.value === props.value; }) || props.options[0];

    return <div className='custom-select-wrapper' ref={menuRef} style={{
  position: 'relative',
  display: 'inline-block',
  width: props.width || 'auto'
}}><button className='input-field' onClick={() => {
    setIsOpen(!isOpen);
  }} style={{
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    textAlign: 'left',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '12px 16px',
    borderRadius: '12px',
    color: 'var(--text-primary)',
    fontWeight: '500'
  }}><span>{selectedOpt ? selectedOpt.label : ''}</span><span style={{
      fontSize: '0.7rem',
      marginLeft: '15px',
      transition: 'transform 0.2s',
      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      color: 'rgba(255,255,255,0.5)'
    }}>▼</span></button>{isOpen && <div className='lang-dropdown custom-scrollbar' style={{
    width: '100%',
    boxSizing: 'border-box',
    maxHeight: '250px',
    overflowY: 'auto'
  }}>{props.options.map(function (opt) {
      var isActive = opt.value === props.value;
      return <button key={opt.value} className={'lang-option' + (isActive ? ' active' : '')} onClick={() => {
        props.onChange(opt.value);
        setIsOpen(false);
      }}>{opt.label}</button>;
    })}</div>}</div>;
}



export { GrammarQuizTab, SharedExamTab, PDFExamTab, MockExamTab, LanguageSelector, HeaderLoginWidget, FuriganaText, CustomSelect };
