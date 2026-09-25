import React, { useState, useEffect } from 'react';

const API = 'http://127.0.0.1:8000/api';

const presetModules = [
  {
    subject: 'Computer Science',
    topic: 'Object Oriented Architecture & Constructors',
    questions: [
      {
        id: '1',
        question: 'When a parameterized constructor is explicitly defined in a Java class, what happens to the default no-argument constructor?',
        options: [
          { id: 'A', text: 'The compiler retains the default no-argument constructor automatically.' },
          { id: 'B', text: 'The compiler removes the implicit default constructor unless explicitly declared.' },
          { id: 'C', text: 'A syntax compilation error occurs immediately upon class initialization.' }
        ],
        correct_id: 'B',
        explanation: 'Java only provides the implicit default no-argument constructor if zero constructors are defined. Adding any custom constructor takes over initialization ownership.'
      },
      {
        id: '2',
        question: 'What is the primary purpose of constructor chaining using the "this()" keyword in Java?',
        options: [
          { id: 'A', text: 'To invoke an overloaded constructor within the same class and eliminate duplicate code' },
          { id: 'B', text: 'To dynamically allocate garbage collection heap memory frames' },
          { id: 'C', text: 'To override a parent class constructor method at runtime' }
        ],
        correct_id: 'A',
        explanation: 'Constructor chaining via this() allows one constructor to invoke another within the same class, centralizing parameter initialization.'
      }
    ]
  },
  {
    subject: 'Physics',
    topic: 'Newtonian Dynamics & Free Body Vectors',
    questions: [
      {
        id: '1',
        question: 'A mass rests motionless on a horizontal flat surface. Which force directly balances the gravitational force acting downward on the mass?',
        options: [
          { id: 'A', text: 'Friction force along the horizontal surface plane' },
          { id: 'B', text: 'Normal force exerted perpendicularly upward by the contact surface' },
          { id: 'C', text: 'Kinetic tension vector along the diagonal axis' }
        ],
        correct_id: 'B',
        explanation: 'According to Newton’s First and Third Laws, the normal force exerted perpendicularly upward by the surface balances the downward gravitational force (mg).'
      },
      {
        id: '2',
        question: 'If the net external force acting on a moving object is zero, what can be stated about its motion?',
        options: [
          { id: 'A', text: 'The object must immediately come to a complete stop' },
          { id: 'B', text: 'The object continues moving at constant velocity in a straight line' },
          { id: 'C', text: 'The object undergoes uniform positive tangential acceleration' }
        ],
        correct_id: 'B',
        explanation: 'By Newton’s First Law (Law of Inertia), when net force is zero, an object in motion remains in uniform rectilinear motion with constant velocity.'
      }
    ]
  },
  {
    subject: 'Mathematics',
    topic: 'Quadratic Equations & Coordinate Geometry',
    questions: [
      {
        id: '1',
        question: 'In the standard quadratic formula x = (-b ± √(b² - 4ac)) / (2a), what does the discriminant term (b² - 4ac) indicate when Δ < 0?',
        options: [
          { id: 'A', text: 'The equation has two distinct real roots intersecting the x-axis' },
          { id: 'B', text: 'The equation has two complex conjugate roots and never intersects the x-axis' },
          { id: 'C', text: 'The parabolic curve collapses into a linear asymptote' }
        ],
        correct_id: 'B',
        explanation: 'When the discriminant Δ < 0, the square root yields an imaginary number, producing two complex conjugate roots with zero real x-intercepts.'
      }
    ]
  }
];

export default function PracticeQuizzesPage({ activeTopic, activeSubject, onStartLesson, onReturnDashboard }) {
  const [selectedModule, setSelectedModule] = useState(presetModules[0]);
  const [questions, setQuestions] = useState(presetModules[0].questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [answersLog, setAnswersLog] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [customTopicInput, setCustomTopicInput] = useState('');

  // Auto-generate quiz if activeTopic is provided
  useEffect(() => {
    if (activeTopic) {
      handleFetchCustomQuiz(activeTopic, activeSubject || 'General');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopic, activeSubject]);

  const handleFetchCustomQuiz = async (topicName, subj = 'General') => {
    setIsLoadingQuiz(true);
    try {
      const res = await fetch(`${API}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicName, subject: subj })
      });
      if (res.ok) {
        const generated = await res.json();
        if (Array.isArray(generated) && generated.length > 0) {
          const mod = { subject: subj, topic: topicName, questions: generated };
          setSelectedModule(mod);
          setQuestions(generated);
          resetState();
        }
      }
    } catch (e) {
      console.error("Failed to fetch custom quiz", e);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const resetState = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setAnswersLog([]);
    setCompleted(false);
  };

  const handleSelectPreset = (mod) => {
    setSelectedModule(mod);
    setQuestions(mod.questions);
    resetState();
  };

  const handleSelectOption = (optionId) => {
    if (isAnswerSubmitted) return;
    setSelectedOption(optionId);
  };

  const handleSubmitAnswer = () => {
    if (!selectedOption || isAnswerSubmitted) return;
    const currentQ = questions[currentIndex];
    const isCorrect = selectedOption === currentQ.correct_id;
    setIsAnswerSubmitted(true);

    const logEntry = {
      id: currentQ.id || currentIndex.toString(),
      question: currentQ.question,
      selectedOption,
      correctId: currentQ.correct_id,
      isCorrect,
      explanation: currentQ.explanation
    };

    setAnswersLog(prev => [...prev, logEntry]);
  };

  const handleRetryCurrent = () => {
    setIsAnswerSubmitted(false);
    setSelectedOption(null);
    setAnswersLog(prev => prev.slice(0, prev.length - 1));
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
    } else {
      setCompleted(true);
      const correctCount = answersLog.filter(a => a.isCorrect).length + (selectedOption === questions[currentIndex].correct_id ? 0 : 0);
      saveProgress(correctCount, questions.length);
    }
  };

  const saveProgress = async (score, total) => {
    try {
      await fetch(`${API}/practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Date.now().toString(),
          topic: selectedModule.topic,
          subject: selectedModule.subject,
          score: score,
          total: total,
          date: new Date().toLocaleString()
        })
      });
    } catch (e) {
      console.error("Failed to save practice progress", e);
    }
  };

  const currentQ = questions[currentIndex] || questions[0];
  const correctCount = answersLog.filter(a => a.isCorrect).length;
  const incorrectCount = answersLog.filter(a => !a.isCorrect).length;
  const percentageScore = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', padding: '24px', color: '#f9fafb' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>Practice & Concept Mastery</span>
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '6px 0 4px 0', color: '#ffffff' }}>
          Interactive Practice Studio
        </h1>
        <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
          Verify and reinforce key subject concepts with instant feedback and explanations.
        </p>
      </div>

      {/* Preset & Custom Topic Selection */}
      <div style={{ backgroundColor: '#182522', border: '1px solid #2d453b', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Select Practice Topic:</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {presetModules.map(mod => (
              <button
                key={mod.topic}
                onClick={() => handleSelectPreset(mod)}
                style={{
                  backgroundColor: selectedModule.topic === mod.topic ? '#059669' : '#1f2937',
                  color: selectedModule.topic === mod.topic ? '#ffffff' : '#d1d5db',
                  border: '1px solid #374151',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {mod.subject}: {mod.topic.split('&')[0]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', pt: '8px', borderTop: '1px solid #2d453b' }}>
          <input
            type="text"
            placeholder="Or type any custom topic (e.g. Newton's Laws, Binary Trees, Photosynthesis)..."
            value={customTopicInput}
            onChange={(e) => setCustomTopicInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && customTopicInput.trim() && handleFetchCustomQuiz(customTopicInput.trim(), 'General')}
            style={{
              flex: 1,
              backgroundColor: '#111827',
              color: '#f9fafb',
              border: '1px solid #374151',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          <button
            onClick={() => customTopicInput.trim() && handleFetchCustomQuiz(customTopicInput.trim(), 'General')}
            disabled={!customTopicInput.trim() || isLoadingQuiz}
            style={{
              backgroundColor: customTopicInput.trim() && !isLoadingQuiz ? '#0284c7' : '#374151',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: customTopicInput.trim() && !isLoadingQuiz ? 'pointer' : 'not-allowed'
            }}
          >
            {isLoadingQuiz ? 'Generating...' : 'Generate Practice'}
          </button>
        </div>
      </div>

      {/* Interactive Question Flow */}
      {!completed && currentQ && (
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header & Progress */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
              {selectedModule.subject} • {selectedModule.topic}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', color: '#94a3b8' }}>
              Question {currentIndex + 1} of {questions.length}
            </span>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: '6px', backgroundColor: '#0f172a', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, height: '100%', backgroundColor: '#0284c7', transition: 'width 0.3s ease' }} />
          </div>

          {/* Question Text */}
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', lineHeight: 1.5, margin: 0 }}>
            {currentQ.question}
          </h2>

          {/* Option Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {currentQ.options.map(opt => {
              const isSelected = selectedOption === opt.id;
              const isCorrect = opt.id === currentQ.correct_id;

              let borderStyle = '1px solid #334155';
              let bgStyle = '#0f172a';
              let textColor = '#cbd5e1';

              if (isSelected) {
                borderStyle = '2px solid #38bdf8';
                bgStyle = 'rgba(56, 189, 248, 0.1)';
                textColor = '#38bdf8';
              }

              if (isAnswerSubmitted) {
                if (isCorrect) {
                  borderStyle = '2px solid #10b981';
                  bgStyle = 'rgba(16, 185, 129, 0.15)';
                  textColor = '#34d399';
                } else if (isSelected && !isCorrect) {
                  borderStyle = '2px solid #f43f5e';
                  bgStyle = 'rgba(244, 63, 94, 0.15)';
                  textColor = '#fb7185';
                }
              }

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
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
                    backgroundColor: isSelected ? '#38bdf8' : '#1e293b',
                    color: isSelected ? '#0f172a' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    flexShrink: 0
                  }}>
                    {opt.id}
                  </span>
                  <span>{opt.text}</span>
                </button>
              );
            })}
          </div>

          {/* Explanation Banner */}
          {isAnswerSubmitted && (
            <div style={{
              backgroundColor: selectedOption === currentQ.correct_id ? 'rgba(6, 78, 59, 0.5)' : 'rgba(120, 53, 15, 0.5)',
              borderLeft: `4px solid ${selectedOption === currentQ.correct_id ? '#10b981' : '#f59e0b'}`,
              borderRadius: '6px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: selectedOption === currentQ.correct_id ? '#34d399' : '#fbbf24' }}>
                {selectedOption === currentQ.correct_id ? 'Correct Understanding' : 'Misconception Identified'}
              </span>
              <p style={{ fontSize: '14px', color: '#e2e8f0', margin: 0, lineHeight: 1.5 }}>
                {currentQ.explanation}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', pt: '10px' }}>
            {!isAnswerSubmitted ? (
              <button
                onClick={handleSubmitAnswer}
                disabled={!selectedOption}
                style={{
                  backgroundColor: selectedOption ? '#0284c7' : '#334155',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 22px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: selectedOption ? 'pointer' : 'not-allowed'
                }}
              >
                Submit Answer
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                {selectedOption !== currentQ.correct_id && (
                  <button
                    onClick={handleRetryCurrent}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#fbbf24',
                      border: '1px solid #d97706',
                      borderRadius: '6px',
                      padding: '10px 18px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    Retry Question
                  </button>
                )}
                <button
                  onClick={handleNextQuestion}
                  style={{
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px 22px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {currentIndex + 1 < questions.length ? 'Next Question' : 'View Results'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completion Summary */}
      {completed && (
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px 0', color: '#ffffff' }}>
              Practice Set Completed! 🎉
            </h2>
            <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
              Topic: <strong>{selectedModule.topic}</strong> ({selectedModule.subject})
            </p>
          </div>

          {/* Score Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
            <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Attempted</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#f8fafc', display: 'block', marginTop: '2px' }}>{questions.length}</span>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#34d399', textTransform: 'uppercase', fontWeight: 700 }}>Correct</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#34d399', display: 'block', marginTop: '2px' }}>{correctCount}</span>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#fb7185', textTransform: 'uppercase', fontWeight: 700 }}>Needs Review</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#fb7185', display: 'block', marginTop: '2px' }}>{incorrectCount}</span>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>Accuracy</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8', display: 'block', marginTop: '2px' }}>{percentageScore}%</span>
            </div>
          </div>

          {/* Detailed Question Review */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Detailed Question Review:</span>
            {answersLog.map((item, idx) => (
              <div key={idx} style={{ backgroundColor: '#0f172a', borderLeft: `4px solid ${item.isCorrect ? '#10b981' : '#f43f5e'}`, borderRadius: '6px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8' }}>Question #{idx + 1}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: item.isCorrect ? '#34d399' : '#fb7185' }}>
                    {item.isCorrect ? 'Correct' : 'Needs Review'}
                  </span>
                </div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', margin: '0 0 6px 0' }}>{item.question}</p>
                <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, fontStyle: 'italic' }}>
                  💡 <strong>Concept:</strong> {item.explanation}
                </p>
              </div>
            ))}
          </div>

          {/* Return & Action Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', pt: '12px', borderTop: '1px solid #334155' }}>
            <button
              onClick={resetState}
              style={{
                backgroundColor: 'transparent',
                color: '#38bdf8',
                border: '1px solid #0284c7',
                borderRadius: '6px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Retry Practice Set
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={onReturnDashboard}
                style={{
                  backgroundColor: '#334155',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Return to Dashboard
              </button>
              <button
                onClick={() => onStartLesson(selectedModule.topic, selectedModule.subject)}
                style={{
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
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
