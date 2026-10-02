import React, { useState } from 'react';

const API = 'http://127.0.0.1:8000/api';

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

export default function PracticeQuizzesPage({ activeTopic, activeSubject, activeLanguage = 'English', documentId, onStartLesson, onReturnDashboard, onPracticeCompleted }) {
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [selectedModule, setSelectedModule] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [answersLog, setAnswersLog] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');

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
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('cognilearn_token') ? { 'Authorization': `Bearer ${localStorage.getItem('cognilearn_token')}` } : {})
        },
        body: JSON.stringify({ topic: topicName, subject: subj, difficulty: quizDifficulty, language: activeLanguage, document_id: documentId || null })
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
      setCompleted(true);
      saveProgress(score, questions.length);
    }
  };

  const handleNextQuestion = handleSubmitAnswer;

  const saveProgress = async (score, total) => {
    try {
      const token = localStorage.getItem('cognilearn_token');
      await fetch(`${API}/practice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          id: Date.now().toString(),
          topic: selectedModule ? selectedModule.topic : (customTopicInput || 'Practice'),
          subject: selectedModule ? selectedModule.subject : (activeSubject || 'General'),
          score: score,
          total: total,
          date: new Date().toLocaleString()
        })
      });
      if (onPracticeCompleted) {
        onPracticeCompleted();
      }
    } catch (e) {
      console.error('Failed to save practice progress', e);
    }
  };

  const currentQ = questions[currentIndex] || null;
  const correctCount = answersLog.filter(a => a.isCorrect).length;
  const incorrectCount = answersLog.filter(a => !a.isCorrect).length;
  const percentageScore = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
  const hasPracticeSession = !completed && questions.length > 0 && currentQ !== null;

  return (
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
          <span>Practice & Concept Mastery</span>
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '6px 0 4px 0', color: '#ffffff', letterSpacing: '-0.02em' }}>
          Practice & Quizzes
        </h1>
        <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
          Practice and reinforce what you have learned.
        </p>
      </div>

      {/* Topic, difficulty, and generate controls */}
      <div style={{ backgroundColor: '#151515', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '18px 20px', marginBottom: '24px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ marginBottom: '14px', color: '#d1d5db', fontSize: '13px', fontWeight: 700 }}>Choose quiz difficulty</div>
        <div role="group" aria-label="Quiz difficulty" style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {['Easy', 'Medium', 'Hard'].map(level => (
            <button key={level} type="button" aria-pressed={difficulty === level} onClick={() => setDifficulty(level)} style={{ padding: '9px 18px', borderRadius: '7px', border: difficulty === level ? '1px solid #f59e0b' : '1px solid #3a3a3a', background: difficulty === level ? 'rgba(245,158,11,.16)' : '#202020', color: difficulty === level ? '#fbbf24' : '#d1d5db', fontWeight: 700, cursor: 'pointer' }}>{level}</button>
          ))}
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

        {/* Validation / Error Message */}
        {errorMessage && (
          <div style={{ color: '#f87171', fontSize: '13px', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Conditionally Rendered Question Flow - ONLY rendered after generation */}
      {hasPracticeSession && (
        <div style={{ backgroundColor: '#151515', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)' }}>
          {/* Header & Progress */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2a', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>
              {selectedModule ? selectedModule.topic : 'Practice Quiz'}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', color: '#9ca3af' }}>
              {selectedModule?.difficulty} · Question {currentIndex + 1} of 5
            </span>
          </div>

          {/* Amber Progress Bar */}
          <div style={{ width: '100%', height: '6px', backgroundColor: '#222222', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, height: '100%', backgroundColor: '#f59e0b', transition: 'width 0.3s ease' }} />
          </div>

          {/* Question Text */}
          <div role="heading" aria-level="2" className="quiz-question" style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', lineHeight: 1.5, margin: 0 }}>
            <QuizContent content={currentQ.question} />
          </div>

          {/* Option Cards */}
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

          {/* Feedback appears immediately after the answer is selected. */}
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

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', pt: '10px' }}>
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

      {/* Completion Summary - ONLY rendered after quiz is finished */}
      {completed && (
        <div style={{ backgroundColor: '#151515', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px 0', color: '#ffffff' }}>
              Practice Set Completed! 🎉
            </h2>
            <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
              Topic: <strong>{selectedModule ? selectedModule.topic : customTopicInput}</strong>
            </p>
          </div>

          {/* Score Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Score</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', display: 'block', marginTop: '2px' }}>{correctCount} / 5</span>
            </div>
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#34d399', textTransform: 'uppercase', fontWeight: 700 }}>Correct</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#34d399', display: 'block', marginTop: '2px' }}>{correctCount}</span>
            </div>
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#f87171', textTransform: 'uppercase', fontWeight: 700 }}>Incorrect</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#f87171', display: 'block', marginTop: '2px' }}>{incorrectCount}</span>
            </div>
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700 }}>Accuracy</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', display: 'block', marginTop: '2px' }}>{percentageScore}%</span>
            </div>
          </div>

          {/* Detailed Question Review */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Detailed Question Review:</span>
            {answersLog.map((item, idx) => (
              <div key={idx} style={{ backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', borderLeft: `4px solid ${item.isCorrect ? '#10b981' : '#ef4444'}`, borderRadius: '6px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af' }}>Question #{idx + 1}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: item.isCorrect ? '#34d399' : '#f87171' }}>
                    {item.isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                </div>
                <QuizContent content={item.question} className="quiz-review-question" />
                <div className="quiz-review-details">
                  <div><strong>Your answer:</strong><QuizContent content={item.selectedText} /></div>
                  <div><strong>Correct answer: {item.correctId}</strong><QuizContent content={item.correctText} /></div>
                  <div><strong>💡 Explanation:</strong><QuizContent content={item.explanation} /></div>
                </div>
              </div>
            ))}
          </div>

          {/* Return & Action Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', pt: '12px', borderTop: '1px solid #2a2a2a' }}>
            <button
              onClick={() => handleFetchCustomQuiz(selectedModule?.topic || customTopicInput || activeTopic, selectedModule?.subject || activeSubject || 'General', selectedModule?.difficulty || difficulty)}
              style={{
                backgroundColor: 'transparent',
                color: '#f59e0b',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Retry Practice Set
            </button>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={onReturnDashboard}
                style={{
                  backgroundColor: '#222222',
                  color: '#ffffff',
                  border: '1px solid #333333',
                  borderRadius: '6px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Return to Dashboard
              </button>
              <button
                onClick={() => onStartLesson(selectedModule ? selectedModule.topic : customTopicInput, selectedModule ? selectedModule.subject : (activeSubject || 'General'))}
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#111111',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(245, 158, 11, 0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                Launch Lesson in Classroom
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
