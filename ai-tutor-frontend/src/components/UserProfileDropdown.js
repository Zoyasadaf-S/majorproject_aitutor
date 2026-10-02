import React, { useState, useRef, useEffect } from 'react';

export default function UserProfileDropdown({ user, pastClasses = [], practiceRecords = [], onLogout, onRefresh }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showQuizHistory, setShowQuizHistory] = useState(false);
  const dropdownRef = useRef(null);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      if (onRefresh) onRefresh();
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onRefresh]);

  const name = user?.name || 'Scholar';
  const email = user?.email || 'scholar@cognilearn.ai';
  const initial = name.trim().charAt(0).toUpperCase() || 'U';

  const lessonsCount = pastClasses.length;
  const quizzesCount = practiceRecords.length;

  const totalScore = practiceRecords.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
  const totalQuestions = practiceRecords.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const quizScoreDisplay = quizzesCount === 0 
    ? "No quizzes yet" 
    : (totalQuestions > 0 ? `${Math.round((totalScore / totalQuestions) * 100)}%` : "0%");

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Circular Profile Avatar */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="User Profile"
        aria-expanded={isOpen}
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          backgroundColor: '#f59e0b',
          color: '#111111',
          fontSize: '18px',
          fontWeight: 800,
          border: '2px solid rgba(245, 158, 11, 0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          boxShadow: isOpen ? '0 0 16px rgba(245, 158, 11, 0.5)' : '0 2px 10px rgba(245, 158, 11, 0.25)',
          outline: 'none',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.06)';
          e.currentTarget.style.boxShadow = '0 0 16px rgba(245, 158, 11, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = isOpen ? '0 0 16px rgba(245, 158, 11, 0.5)' : '0 2px 10px rgba(245, 158, 11, 0.25)';
        }}
      >
        {initial}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: '320px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: '#151515',
            border: '1px solid #2a2a2a',
            borderRadius: '12px',
            padding: '18px 20px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.85), 0 0 1px rgba(245, 158, 11, 0.3)',
            zIndex: 1000,
            color: '#ffffff',
            boxSizing: 'border-box'
          }}
        >
          {/* User Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '14px', borderBottom: '1px solid #262626' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                border: '1px solid #f59e0b',
                fontSize: '16px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {initial}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {email}
              </div>
            </div>
          </div>

          {/* Account Metrics */}
          <div style={{ padding: '14px 0', borderBottom: '1px solid #262626' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Profile & Account
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9ca3af' }}>Role:</span>
                <span style={{
                  fontWeight: 800,
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: user?.role === 'admin' ? 'rgba(245, 158, 11, 0.2)' : '#222222',
                  color: user?.role === 'admin' ? '#f59e0b' : '#9ca3af',
                  border: user?.role === 'admin' ? '1px solid #f59e0b' : '1px solid #333'
                }}>
                  {user?.role === 'admin' ? '🛡️ ADMIN' : '👤 USER'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9ca3af' }}>Lessons Taken:</span>
                <span style={{ fontWeight: 700, color: '#ffffff', backgroundColor: '#222222', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  {lessonsCount}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9ca3af' }}>Quizzes Completed:</span>
                <span style={{ fontWeight: 700, color: '#ffffff', backgroundColor: '#222222', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  {quizzesCount}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9ca3af' }}>Quiz Score:</span>
                <span style={{ fontWeight: 700, color: quizzesCount > 0 ? '#f59e0b' : '#9ca3af' }}>
                  {quizScoreDisplay}
                </span>
              </div>
            </div>
          </div>

          {/* Quiz History Section */}
          <div style={{ padding: '14px 0', borderBottom: '1px solid #262626' }}>
            <button
              onClick={() => setShowQuizHistory(prev => !prev)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '4px 0',
                fontSize: '13px',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📜</span>
                <span>Quiz History</span>
              </span>
              <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>
                {showQuizHistory ? 'Hide ▲' : 'View ▼'}
              </span>
            </button>

            {showQuizHistory && (
              <div style={{ marginTop: '10px' }}>
                {practiceRecords.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic', padding: '6px 0' }}>
                    No quizzes completed yet.
                  </div>
                ) : (
                  <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' }}>
                    {practiceRecords.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        style={{
                          backgroundColor: '#1e1e1e',
                          border: '1px solid #2a2a2a',
                          borderRadius: '6px',
                          padding: '10px 12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
                            {item.topic}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            {item.score} / {item.total}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                          {item.date}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sign Out Button */}
          <div style={{ paddingTop: '14px' }}>
            <button
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                border: '1px solid #ef4444',
                color: '#f87171',
                borderRadius: '6px',
                padding: '9px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>SIGN OUT</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
