import React, { useState } from 'react';

const API = 'http://127.0.0.1:8000/api';

export default function CheckpointCard({ topic, question }) {
  const [studentAnswer, setStudentAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    if (!studentAnswer.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic || 'General Concept',
          question: question,
          student_answer: studentAnswer.trim()
        })
      });
      if (res.ok) {
        const data = await res.json();
        setEvaluation(data);
      } else {
        throw new Error('Evaluation failed');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not evaluate answer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = () => {
    setEvaluation(null);
    setStudentAnswer('');
    setErrorMsg('');
  };

  return (
    <div 
      className="checkpoint-card"
      style={{
        backgroundColor: '#1b2a26',
        border: '2px solid #528c70',
        borderRadius: '12px',
        padding: '20px',
        margin: '18px 0',
        color: '#f0fdf4',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)'
      }}
    >
      {/* Card Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6ee7b7', fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>Instructor Checkpoint</span>
        </div>
        <span style={{ 
          fontSize: '11px', 
          fontWeight: 700, 
          padding: '3px 10px', 
          borderRadius: '12px',
          backgroundColor: evaluation ? (evaluation.is_correct ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)') : 'rgba(59, 130, 246, 0.2)',
          color: evaluation ? (evaluation.is_correct ? '#34d399' : '#fbbf24') : '#60a5fa',
          border: `1px solid ${evaluation ? (evaluation.is_correct ? '#059669' : '#d97706') : '#2563eb'}`
        }}>
          {evaluation ? (evaluation.is_correct ? 'Concept Mastered' : 'Needs Review') : 'Active Verification'}
        </span>
      </div>

      {/* Question Text */}
      <p style={{ fontSize: '16px', fontWeight: 600, color: '#f3f4f6', lineHeight: 1.5, marginBottom: '16px' }}>
        {question}
      </p>

      {/* Input or Result Section */}
      {!evaluation ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <textarea
            rows={3}
            value={studentAnswer}
            onChange={(e) => setStudentAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Type your explanation or answer here..."
            aria-label="Student answer input"
            style={{
              width: '100%',
              backgroundColor: '#111d1a',
              color: '#f9fafb',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '14px',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit'
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
              Press Enter or click Submit to receive instant AI evaluation.
            </span>
            <button
              onClick={handleSubmit}
              disabled={!studentAnswer.trim() || isSubmitting}
              style={{
                backgroundColor: studentAnswer.trim() && !isSubmitting ? '#059669' : '#374151',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: studentAnswer.trim() && !isSubmitting ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              {isSubmitting ? 'Evaluating...' : 'Submit Answer'}
            </button>
          </div>
          {errorMsg && <p style={{ color: '#f87171', fontSize: '12px', margin: 0 }}>{errorMsg}</p>}
        </div>
      ) : (
        /* Evaluation Feedback Banner */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            backgroundColor: evaluation.is_correct ? 'rgba(6, 78, 59, 0.6)' : 'rgba(120, 53, 15, 0.6)',
            borderLeft: `4px solid ${evaluation.is_correct ? '#10b981' : '#f59e0b'}`,
            borderRadius: '6px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={evaluation.is_correct ? '#34d399' : '#fbbf24'} strokeWidth="2.5">
                {evaluation.is_correct ? (
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"></path>
                ) : (
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"></path>
                )}
              </svg>
              <span style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', color: evaluation.is_correct ? '#34d399' : '#fbbf24' }}>
                {evaluation.is_correct ? 'Correct Understanding' : 'Conceptual Misconception Identified'}
              </span>
            </div>

            <p style={{ fontSize: '14px', color: '#e5e7eb', margin: 0, lineHeight: 1.5 }}>
              {evaluation.explanation}
            </p>

            {evaluation.correct_answer && !evaluation.is_correct && (
              <p style={{ fontSize: '13px', color: '#6ee7b7', margin: 0, fontWeight: 500 }}>
                <strong>Key Answer:</strong> {evaluation.correct_answer}
              </p>
            )}

            {evaluation.feedback && (
              <p style={{ fontSize: '12px', color: '#d1d5db', fontStyle: 'italic', margin: 0 }}>
                💡 <strong>Takeaway:</strong> {evaluation.feedback}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            {!evaluation.is_correct && (
              <button
                onClick={handleRetry}
                style={{
                  backgroundColor: 'transparent',
                  color: '#fbbf24',
                  border: '1px solid #d97706',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
                Retry Checkpoint
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
