import React, { useState, useEffect, useCallback } from 'react';

const API = 'http://127.0.0.1:8000/api';

const authHeaders = (extra = {}) => {
  const token = localStorage.getItem('cognilearn_token');
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

// Render plain text safely while honoring Markdown-style fenced code blocks.
// Text nodes remain escaped by React; no generated HTML is injected.
function QuizContent({ content, className = '' }) {
  const parts = (content || '').split(/(```[^\n]*\n[\s\S]*?```)/g);
  return (
    <div className={`quiz-content ${className}`.trim()}>
      {parts.map((part, index) => {
        const code = part.match(/^```([^\n]*)\n([\s\S]*?)```$/);
        return code
          ? <pre className="quiz-code" key={index}><code>{code[2]}</code></pre>
          : <div className="quiz-text" key={index}>{part}</div>;
      })}
    </div>
  );
}

const cardStyle = {
  backgroundColor: '#151515',
  border: '1px solid #2a2a2a',
  borderRadius: '12px',
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
};

// Full end-of-quiz report. Used for a just-finished quiz AND for opening a saved quiz from history.
function QuizReport({ report, isHistory, onRetry, onReturnDashboard, onStartLesson, onClose }) {
  const answers = Array.isArray(report.answers) ? report.answers : [];
  const total = report.total || answers.length || 0;
  const score = report.score ?? answers.filter(a => a.isCorrect).length;
  const incorrect = Math.max(0, total - score);
  const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
  const meta = [report.subject, report.difficulty, report.language].filter(Boolean).join(' · ');

  const statBox = (label, value, color) => (
    <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
      <span style={{ fontSize: '11px', color, textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: '22px', fontWeight: 800, color, display: 'block', marginTop: '2px' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ ...cardStyle, padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px 0', color: '#ffffff' }}>
          {isHistory ? 'Quiz Report' : 'Practice Set Completed! 🎉'}
        </h2>
        <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
          Topic: <strong>{report.topic}</strong>
        </p>
        {(meta || report.date) && (
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
            {meta}{meta && report.date ? ' · ' : ''}{report.date}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
        {statBox('Score', `${score} / ${total}`, '#ffffff')}
        {statBox('Correct', score, '#34d399')}
        {statBox('Incorrect', incorrect, '#f87171')}
        {statBox('Accuracy', `${accuracy}%`, '#f59e0b')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Detailed Question Review:</span>

        {answers.length === 0 && (
          <div style={{ fontSize: '13px', color: '#9ca3af', backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '14px' }}>
            The question-by-question review was not saved for this older attempt. Only the score was recorded.
          </div>
        )}

        {answers.map((item, idx) => (
          <div key={idx} style={{ backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', borderLeft: `4px solid ${item.isCorrect ? '#10b981' : '#ef4444'}`, borderRadius: '6px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af' }}>Question #{idx + 1}</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: item.isCorrect ? '#34d399' : '#f87171' }}>
                {item.isCorrect ? 'Correct' : 'Incorrect'}
              </span>
            </div>
            <QuizContent content={item.question} className="quiz-review-question" />

            {Array.isArray(item.options) && item.options.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '10px 0' }}>
                {item.options.map(opt => {
                  const isCorrectOpt = opt.id === item.correctId;
                  const isPicked = opt.id === item.selectedOption;
                  const border = isCorrectOpt ? '1px solid #10b981' : (isPicked ? '1px solid #ef4444' : '1px solid #2a2a2a');
                  const bg = isCorrectOpt ? 'rgba(16, 185, 129, 0.12)' : (isPicked ? 'rgba(239, 68, 68, 0.12)' : 'transparent');
                  const color = isCorrectOpt ? '#34d399' : (isPicked ? '#fca5a5' : '#cbd5e1');
                  const tag = isCorrectOpt && isPicked ? '✓ Your answer (correct)'
                    : isCorrectOpt ? '✓ Correct answer'
                    : isPicked ? '✕ Your answer' : '';
                  return (
                    <div key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', borderRadius: '6px', border, backgroundColor: bg, color, fontSize: '13px' }}>
                      <strong style={{ flexShrink: 0 }}>{opt.id}.</strong>
                      <div style={{ flex: 1, minWidth: 0 }}><QuizContent content={opt.text} /></div>
                      {tag && <span style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>{tag}</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="quiz-review-details">
                <div><strong>Your answer: {item.selectedOption}</strong><QuizContent content={item.selectedText} /></div>
                <div><strong>Correct answer: {item.correctId}</strong><QuizContent content={item.correctText} /></div>
              </div>
            )}

            <div className="quiz-review-details">
              <div><strong>💡 Explanation:</strong><QuizContent content={item.explanation} /></div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '12px', borderTop: '1px solid #2a2a2a' }}>
        <button
          onClick={onRetry}
          style={{ backgroundColor: 'transparent', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: '6px', padding: '10px 18px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Retry Practice Set
        </button>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={isHistory ? onClose : onReturnDashboard}
            style={{ backgroundColor: '#222222', color: '#ffffff', border: '1px solid #333333', borderRadius: '6px', padding: '10px 18px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {isHistory ? 'Back to New Quiz' : 'Return to Dashboard'}
          </button>
          <button
            onClick={onStartLesson}
            style={{ backgroundColor: '#f59e0b', color: '#111111', border: 'none', borderRadius: '6px', padding: '10px 18px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 10px rgba(245, 158, 11, 0.25)' }}
          >
            Launch Lesson in Classroom
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PracticeQuizzesPage({ activeTopic, activeSubject, activeLanguage = 'English', documentId, onStartLesson, onReturnDashboard, onPracticeCompleted }) {
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [selectedModule, setSelectedModule] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [answersLog, setAnswersLog] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [completedAt, setCompletedAt] = useState('');
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [quizLanguage, setQuizLanguage] = useState('English');

  // Quiz history (left sidebar)
  const [history, setHistory] = useState([]);
  const [viewReport, setViewReport] = useState(null);

  const loadHistory = useCallback(async () => {
    const token = localStorage.getItem('cognilearn_token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/practice`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load quiz history', e);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const deleteHistoryItem = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API}/practice/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setHistory(prev => prev.filter(item => item.id !== id));
      setViewReport(prev => (prev && prev.id === id ? null : prev));
      if (onPracticeCompleted) onPracticeCompleted();
    } catch (err) {
      console.error('Failed to delete quiz history item', err);
    }
  };

  const openReport = (item) => {
    const details = item.details || {};
    setViewReport({
      id: item.id,
      topic: item.topic,
      subject: item.subject,
      difficulty: details.difficulty,
      language: details.language,
      date: item.date,
      score: item.score,
      total: item.total,
      answers: Array.isArray(details.answers) ? details.answers : []
    });
  };

  const resetState = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setAnswersLog([]);
    setCompleted(false);
  };

  const handleGenerateClick = () => {
    const trimmed = customTopicInput.trim() || activeTopic?.trim() || '';
    if (!trimmed) {
      setErrorMessage('Please enter a topic.');
      return;
    }
    setErrorMessage('');
    handleFetchCustomQuiz(trimmed, activeSubject || 'General', difficulty);
  };

  const handleFetchCustomQuiz = async (topicName, subj = 'General', quizDifficulty = difficulty) => {
    setIsLoadingQuiz(true);
    setErrorMessage('');
    try {
      const res = await fetch(`${API}/quiz`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ topic: topicName, subject: subj, difficulty: quizDifficulty, language: quizLanguage, document_id: documentId || null })
      });
      if (res.ok) {
        const generated = await res.json();
        const validQuiz = Array.isArray(generated) && generated.length === 5 && generated.every(q =>
          q && typeof q.question === 'string' && q.question.trim() &&
          Array.isArray(q.options) && q.options.length === 4 &&
          q.options.every(o => o && typeof o.id === 'string' && typeof o.text === 'string') &&
          q.options.some(o => o.id === q.correct_id) && new Set(q.options.map(o => o.id)).size === 4
        );
        if (validQuiz) {
          const safeQuestions = generated.map(question => ({
            ...question,
            explanation: typeof question.explanation === 'string' && question.explanation.trim()
              ? question.explanation
              : 'An explanation was not returned for this question. Please review the correct answer and retry the quiz for a complete explanation.'
          }));
          const mod = { subject: subj, topic: topicName, difficulty: quizDifficulty, questions: safeQuestions };
          setSelectedModule(mod);
          setQuestions(safeQuestions);
          resetState();
        } else {
          setErrorMessage('The generated quiz was incomplete or invalid. Please retry.');
        }
      } else {
        const failure = await res.json().catch(() => ({}));
        setErrorMessage(failure.detail || 'Failed to generate practice questions. Please try again.');
      }
    } catch (e) {
      console.error('Failed to fetch custom quiz', e);
      setErrorMessage('Unable to connect to the server. Please check your connection and try again.');
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleSelectOption = (optionId) => {
    if (isAnswerSubmitted) return;
    setSelectedOption(optionId);
    setIsAnswerSubmitted(true);
  };

  const handleSubmitAnswer = () => {
    if (!selectedOption || !isAnswerSubmitted || questions.length === 0) return;
    const currentQ = questions[currentIndex];
    const isCorrect = selectedOption === currentQ.correct_id;
    const logEntry = {
      id: currentQ.id || currentIndex.toString(),
      question: currentQ.question,
      options: currentQ.options,
      selectedOption,
      correctId: currentQ.correct_id,
      selectedText: currentQ.options.find(option => option.id === selectedOption)?.text || '',
      correctText: currentQ.options.find(option => option.id === currentQ.correct_id)?.text || '',
      isCorrect,
      explanation: currentQ.explanation
    };
    setAnswersLog(prev => [...prev, logEntry]);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
    } else {
      const finalAnswers = [...answersLog, logEntry];
      const score = finalAnswers.filter(a => a.isCorrect).length;
      const finishedAt = new Date().toLocaleString();
      setCompletedAt(finishedAt);
      setCompleted(true);
      saveProgress(score, questions.length, finalAnswers, finishedAt);
    }
  };

  const handleNextQuestion = handleSubmitAnswer;

  // Saves the score AND the full report (questions, options, answers, explanations) to the database.
  const saveProgress = async (score, total, answers, finishedAt) => {
    try {
      const res = await fetch(`${API}/practice`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: Date.now().toString(),
          topic: selectedModule ? selectedModule.topic : (customTopicInput || 'Practice'),
          subject: selectedModule ? selectedModule.subject : (activeSubject || 'General'),
          score,
          total,
          date: finishedAt,
          details: {
            difficulty: selectedModule?.difficulty || difficulty,
            language: quizLanguage,
            answers
          }
        })
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      await loadHistory();
      if (onPracticeCompleted) onPracticeCompleted();
    } catch (e) {
      console.error('Failed to save practice progress', e);
    }
  };

  const currentQ = questions[currentIndex] || null;
  const correctCount = answersLog.filter(a => a.isCorrect).length;
  const hasPracticeSession = !completed && questions.length > 0 && currentQ !== null;

  const liveReport = completed ? {
    topic: selectedModule ? selectedModule.topic : customTopicInput,
    subject: selectedModule ? selectedModule.subject : (activeSubject || 'General'),
    difficulty: selectedModule?.difficulty || difficulty,
    language: quizLanguage,
    date: completedAt,
    score: correctCount,
    total: questions.length,
    answers: answersLog
  } : null;

  const launchLesson = (report) => onStartLesson(report.topic, report.subject || 'General');

  return (
    <div style={{ display: 'flex', flex: 1, width: '100%', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* ── Left sidebar: quiz history (same look as the teaching history) ── */}
      <div className="left-sidebar-panel">
        <div className="brand-title">
          Cogni-Learn <span role="img" aria-label="graduation cap">🎓</span>
          {viewReport && (
            <button className="exit-action-btn" onClick={() => setViewReport(null)}>NEW QUIZ</button>
          )}
        </div>

        <div className="history-section">
          <h3 className="history-header">QUIZ HISTORY</h3>
          <div className="history-list">
            {history.length === 0 && (
              <p className="empty-history">No past quizzes found. Finish a practice set to save its report here!</p>
            )}

            {history.map(item => {
              const isActive = viewReport && viewReport.id === item.id;
              return (
                <div
                  key={item.id}
                  className="history-item"
                  onClick={() => openReport(item)}
                  style={isActive ? { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: '#f59e0b' } : undefined}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="history-topic">{item.topic}</div>
                    <div className="history-date">{item.date}</div>
                    <div className="history-date">
                      Score {item.score}/{item.total}{item.details?.difficulty ? ` · ${item.details.difficulty}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="delete-history-btn" title="Delete this quiz" onClick={(e) => deleteHistoryItem(e, item.id)}>
                      ✖
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: '850px', margin: '0 auto', padding: '24px 20px', color: '#ffffff', width: '100%', boxSizing: 'border-box' }}>
          {/* Header */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>{viewReport ? 'Quiz Report Playback' : 'Practice & Concept Mastery'}</span>
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '6px 0 4px 0', color: '#ffffff', letterSpacing: '-0.02em' }}>
              Practice & Quizzes
            </h1>
            <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
              {viewReport ? 'Reviewing a saved quiz report.' : 'Practice and reinforce what you have learned.'}
            </p>
          </div>

          {viewReport ? (
            <QuizReport
              report={viewReport}
              isHistory
              onRetry={() => {
                const r = viewReport;
                setViewReport(null);
                handleFetchCustomQuiz(r.topic, r.subject || 'General', r.difficulty || difficulty);
              }}
              onClose={() => setViewReport(null)}
              onStartLesson={() => launchLesson(viewReport)}
            />
          ) : (
            <>
              {/* Topic, difficulty, and generate controls */}
              <div style={{ ...cardStyle, padding: '18px 20px', marginBottom: '24px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)' }}>
                <div style={{ marginBottom: '14px', color: '#d1d5db', fontSize: '13px', fontWeight: 700 }}>Choose quiz difficulty</div>
                <div role="group" aria-label="Quiz difficulty" style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {['Easy', 'Medium', 'Hard'].map(level => (
                    <button key={level} type="button" aria-pressed={difficulty === level} onClick={() => setDifficulty(level)} style={{ padding: '9px 18px', borderRadius: '7px', border: difficulty === level ? '1px solid #f59e0b' : '1px solid #3a3a3a', background: difficulty === level ? 'rgba(245,158,11,.16)' : '#202020', color: difficulty === level ? '#fbbf24' : '#d1d5db', fontWeight: 700, cursor: 'pointer' }}>{level}</button>
                  ))}
                </div>
                <div style={{ marginBottom: '14px', color: '#d1d5db', fontSize: '13px', fontWeight: 700 }}>Choose quiz language</div>
                <div style={{ marginBottom: '16px' }}>
                  <select
                    value={quizLanguage}
                    onChange={(e) => setQuizLanguage(e.target.value)}
                    style={{
                      backgroundColor: '#222222',
                      color: '#ffffff',
                      border: '1px solid #333333',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      outline: 'none',
                      minWidth: '200px'
                    }}
                  >
                    <option value="English">English</option>
                    <option value="Hindi">हिंदी (Hindi)</option>
                    <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder={activeTopic ? `Current lesson: ${activeTopic}` : 'Enter a topic you want to practice...'}
                    value={customTopicInput}
                    onChange={(e) => {
                      setCustomTopicInput(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateClick()}
                    style={{
                      flex: '1 1 280px',
                      minWidth: '220px',
                      backgroundColor: '#222222',
                      color: '#ffffff',
                      border: errorMessage ? '1px solid #ef4444' : '1px solid #333333',
                      borderRadius: '6px',
                      padding: '12px 16px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
                    }}
                  />
                  <button
                    onClick={handleGenerateClick}
                    disabled={isLoadingQuiz}
                    style={{
                      backgroundColor: '#f59e0b',
                      color: '#111111',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '12px 22px',
                      fontSize: '13px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      cursor: isLoadingQuiz ? 'wait' : 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isLoadingQuiz ? 'GENERATING...' : 'START 5-QUESTION QUIZ'}
                  </button>
                </div>

                {errorMessage && (
                  <div style={{ color: '#f87171', fontSize: '13px', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                    <span>⚠️</span>
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Question flow */}
              {hasPracticeSession && (
                <div style={{ ...cardStyle, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2a', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>
                      {selectedModule ? selectedModule.topic : 'Practice Quiz'}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', color: '#9ca3af' }}>
                      {selectedModule?.difficulty} · Question {currentIndex + 1} of 5
                    </span>
                  </div>

                  <div style={{ width: '100%', height: '6px', backgroundColor: '#222222', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, height: '100%', backgroundColor: '#f59e0b', transition: 'width 0.3s ease' }} />
                  </div>

                  <div role="heading" aria-level="2" className="quiz-question" style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', lineHeight: 1.5, margin: 0 }}>
                    <QuizContent content={currentQ.question} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {currentQ.options.map(opt => {
                      const isSelected = selectedOption === opt.id;
                      const isCorrect = opt.id === currentQ.correct_id;

                      let borderStyle = '1px solid #2a2a2a';
                      let bgStyle = '#1e1e1e';
                      let textColor = '#e2e8f0';

                      if (isSelected) {
                        borderStyle = '2px solid #f59e0b';
                        bgStyle = 'rgba(245, 158, 11, 0.1)';
                        textColor = '#ffffff';
                      }

                      if (isAnswerSubmitted) {
                        if (isCorrect) {
                          borderStyle = '2px solid #10b981';
                          bgStyle = 'rgba(16, 185, 129, 0.15)';
                          textColor = '#34d399';
                        } else if (isSelected && !isCorrect) {
                          borderStyle = '2px solid #ef4444';
                          bgStyle = 'rgba(239, 68, 68, 0.15)';
                          textColor = '#fca5a5';
                        }
                      }

                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleSelectOption(opt.id)}
                          disabled={isAnswerSubmitted}
                          tabIndex={0}
                          aria-pressed={isSelected}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '14px 16px',
                            borderRadius: '8px',
                            border: borderStyle,
                            backgroundColor: bgStyle,
                            color: textColor,
                            cursor: isAnswerSubmitted ? 'default' : 'pointer',
                            textAlign: 'left',
                            fontSize: '14px',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            outline: 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: isAnswerSubmitted
                              ? (isCorrect ? '#10b981' : (isSelected ? '#ef4444' : '#2a2a2a'))
                              : (isSelected ? '#f59e0b' : '#2a2a2a'),
                            color: isAnswerSubmitted
                              ? '#ffffff'
                              : (isSelected ? '#111111' : '#9ca3af'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            flexShrink: 0
                          }}>
                            {opt.id}
                          </span>
                          <QuizContent content={opt.text} className="quiz-option-content" />
                        </button>
                      );
                    })}
                  </div>

                  {isAnswerSubmitted && (
                    <div style={{
                      backgroundColor: selectedOption === currentQ.correct_id ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      borderLeft: `4px solid ${selectedOption === currentQ.correct_id ? '#10b981' : '#f59e0b'}`,
                      borderRadius: '6px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: selectedOption === currentQ.correct_id ? '#34d399' : '#f87171' }}>
                        {selectedOption === currentQ.correct_id ? '✓ Correct!' : '✕ Incorrect'}
                      </span>
                      <p style={{ fontSize: '14px', color: '#e2e8f0', margin: 0, lineHeight: 1.5 }}>
                        Your answer: <strong>{currentQ.options.find(option => option.id === selectedOption)?.id}. {currentQ.options.find(option => option.id === selectedOption)?.text}</strong>
                      </p>
                      <p style={{ fontSize: '14px', color: '#e2e8f0', margin: 0, lineHeight: 1.5 }}>
                        Correct answer: <strong>{currentQ.correct_id}. {currentQ.options.find(option => option.id === currentQ.correct_id)?.text}</strong>
                      </p>
                      <div style={{ fontSize: '14px', color: '#e2e8f0', margin: 0, lineHeight: 1.5 }}>
                        <strong>Explanation:</strong>
                        <QuizContent content={currentQ.explanation} className="quiz-feedback-explanation" />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '10px' }}>
                    {!isAnswerSubmitted ? (
                      <button
                        onClick={handleSubmitAnswer}
                        disabled={!selectedOption}
                        style={{
                          backgroundColor: selectedOption ? '#f59e0b' : '#2a2a2a',
                          color: selectedOption ? '#111111' : '#666666',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '10px 22px',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          cursor: selectedOption ? 'pointer' : 'not-allowed',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {currentIndex + 1 < questions.length ? 'Next Question' : 'Finish Quiz'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={handleNextQuestion}
                          style={{
                            backgroundColor: '#f59e0b',
                            color: '#111111',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '10px 22px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 2px 10px rgba(245, 158, 11, 0.25)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {currentIndex + 1 < questions.length ? 'Next Question' : 'Finish Quiz'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Report for the quiz that was just finished */}
              {liveReport && (
                <QuizReport
                  report={liveReport}
                  onRetry={() => handleFetchCustomQuiz(liveReport.topic || activeTopic, liveReport.subject || 'General', liveReport.difficulty || difficulty)}
                  onReturnDashboard={onReturnDashboard}
                  onStartLesson={() => launchLesson(liveReport)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}