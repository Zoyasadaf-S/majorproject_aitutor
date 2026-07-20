import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

const API = 'http://127.0.0.1:8000/api';

const VisualImage = ({ query, subject }) => {
  return (
    <motion.img 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      src={`${API}/image?q=${encodeURIComponent(query)}&subject=${encodeURIComponent(subject)}`} 
      alt="Visual Aid" 
      referrerPolicy="no-referrer" 
      style={{ maxWidth: '100%', maxHeight: '350px', objectFit: 'contain', borderRadius: '8px', marginTop: '10px' }} 
    />
  );
};

const CanvasDiagram = ({ instructions }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ffe699';
    ctx.fillStyle = '#ffe699';
    ctx.lineWidth = 3;
    ctx.font = '18px "Caveat", cursive';

    ctx.beginPath();
    
    let type = '';
    try {
        const parsed = JSON.parse(instructions);
        type = parsed.type;
    } catch (e) {
        type = instructions.toLowerCase().trim();
    }
    
    if (type === 'right_triangle') {
        ctx.moveTo(150, 50); ctx.lineTo(150, 250); ctx.lineTo(350, 250); ctx.closePath();
        ctx.fillText("A", 140, 40); ctx.fillText("B", 130, 260); ctx.fillText("C", 360, 260);
        ctx.strokeRect(150, 230, 20, 20); 
    } 
    else if (type === 'triangle') {
        ctx.moveTo(250, 40); ctx.lineTo(100, 240); ctx.lineTo(400, 240); ctx.closePath();
        ctx.fillText("A", 240, 30); ctx.fillText("B", 80, 260); ctx.fillText("C", 410, 260);
    } 
    else if (type === 'circuit') {
        ctx.strokeRect(100, 80, 300, 140);
        ctx.clearRect(230, 75, 40, 10); ctx.fillText("┠┨ V", 225, 70);
        ctx.clearRect(230, 215, 40, 10); ctx.strokeRect(230, 210, 40, 10); ctx.fillText("R", 245, 245);
    } 
    else if (type === 'graph' || type === 'parabola' || type === 'plot') {
        ctx.moveTo(50, 250); ctx.lineTo(450, 250); 
        ctx.moveTo(250, 30); ctx.lineTo(250, 270);
        ctx.moveTo(100, 50); ctx.quadraticCurveTo(250, 350, 400, 50);
        ctx.fillText("y", 260, 40); ctx.fillText("x", 440, 270);
    } 
    else if (type === 'circle') {
        ctx.arc(250, 150, 100, 0, 2 * Math.PI);
        ctx.fillText("r", 255, 145);
        ctx.moveTo(250, 150); ctx.lineTo(350, 150);
    } 
    else if (type === 'force_block') {
        ctx.moveTo(100, 250); ctx.lineTo(400, 250);
        ctx.strokeRect(200, 150, 100, 100);
        ctx.fillText("Mass", 230, 205);
        ctx.moveTo(250, 250); ctx.lineTo(250, 290);
        ctx.lineTo(245, 280); ctx.moveTo(250, 290); ctx.lineTo(255, 280);
        ctx.fillText("mg", 260, 290);
        ctx.moveTo(250, 150); ctx.lineTo(250, 100);
        ctx.lineTo(245, 110); ctx.moveTo(250, 100); ctx.lineTo(255, 110);
        ctx.fillText("N", 260, 115);
        ctx.moveTo(300, 200); ctx.lineTo(360, 200);
        ctx.lineTo(350, 195); ctx.moveTo(360, 200); ctx.lineTo(350, 205);
        ctx.fillText("F", 365, 205);
    } 
    else {
        ctx.strokeRect(150, 100, 200, 100);
        ctx.fillText(instructions.substring(0, 20), 160, 150);
    }
    ctx.stroke();
  }, [instructions]);

  return (
      <div style={{ textAlign: 'center', margin: '20px 0' }}>
        <canvas 
          ref={canvasRef} 
          width={500} 
          height={350} 
          style={{ backgroundColor: 'rgba(11, 46, 27, 0.5)', border: '2px dashed rgba(255, 230, 153, 0.4)', borderRadius: '8px', maxWidth: '100%' }} 
        />
      </div>
  );
};

async function* streamEndpoint(endpoint, body, signal) {
  const resp = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal 
  });
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        if (json.error) throw new Error(json.error);
        if (json.text) yield json.text;
      } catch (e) {
        if (e.message.includes('API Error')) throw e;
      }
    }
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username] = useState("Zoya Sadaf"); 
  
  const [pastClasses, setPastClasses] = useState([]);
  const [viewPastClass, setViewPastClass] = useState(null);

  const [started, setStarted] = useState(false);
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('General');
  const availableSubjects = ['General', 'Mathematics', 'Physics', 'Biology', 'Computer Science', 'Chemistry', 'Social Science'];
  
  const [blocks, setBlocks] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [interruption, setInterruption] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [questionsAsked, setQuestionsAsked] = useState([]);
  
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const rawBufferRef = useRef('');
  const processedUpToRef = useRef(0);
  const scrollRef = useRef(null);
  const lessonContextRef = useRef(''); 
  const abortControllerRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  const clearSpeechCompletely = () => {
    if (currentUtteranceRef.current instanceof Audio) {
      currentUtteranceRef.current.pause();
      currentUtteranceRef.current.src = "";
    }
    setAudioQueue([]);
    setIsPlaying(false);
    setIsPaused(false);
    currentUtteranceRef.current = null;
  };

  useEffect(() => {
    if (isPaused) return; 

    if (!isPlaying && audioQueue.length > 0) {
      const nextItem = audioQueue[0];
      
      // Wait for it to be ready from the prefetch
      if (!nextItem.ready) return; 

      setIsPlaying(true);
      
      if (!nextItem.url) {
        // Fallback if it failed to fetch
        setAudioQueue(prev => prev.slice(1));
        setIsPlaying(false);
        return;
      }

      const audio = new Audio(nextItem.url);
      currentUtteranceRef.current = audio;
      
      audio.onended = () => {
        setAudioQueue(prev => prev.slice(1));
        setIsPlaying(false);
        currentUtteranceRef.current = null;
        URL.revokeObjectURL(nextItem.url);
      };
      
      audio.onerror = () => {
        setAudioQueue(prev => prev.slice(1));
        setIsPlaying(false);
        currentUtteranceRef.current = null;
        URL.revokeObjectURL(nextItem.url);
      };

      audio.play().catch(e => {
        console.error("Audio play failed", e);
        setAudioQueue(prev => prev.slice(1));
        setIsPlaying(false);
      });
    }
  }, [audioQueue, isPlaying, isPaused]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API}/history`);
      if (res.ok) {
        const data = await res.json();
        setPastClasses(data);
      }
    } catch (e) {
      console.error("Failed to fetch history from database", e);
    }
  };

  const deleteHistoryItem = async (e, id) => {
    e.stopPropagation();
    try {
      await fetch(`${API}/history/${id}`, { method: 'DELETE' });
      setPastClasses(prev => prev.filter(cls => cls.id !== id));
      if (viewPastClass && viewPastClass.id === id) {
        setViewPastClass(null);
      }
    } catch (e) {
      console.error("Failed to delete history item", e);
    }
  };

  useEffect(() => {
    if (isAuthenticated && !started) {
      fetchHistory();
    }
  }, [isAuthenticated, started]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks.length, isStreaming]);

  useEffect(() => {
    return () => {
      if (currentUtteranceRef.current instanceof Audio) {
        currentUtteranceRef.current.pause();
      }
    };
  }, []);

  const togglePause = () => {
    setIsPaused(prev => {
      const nextPaused = !prev;
      if (currentUtteranceRef.current instanceof Audio) {
        if (nextPaused) {
          currentUtteranceRef.current.pause();
        } else {
          currentUtteranceRef.current.play();
        }
      }
      return nextPaused;
    });
  };

  const processRaw = useCallback((raw) => {
    setBlocks(prev => {
      const tagRe = /\[(HEADING|POINT|MATH|IMAGE|EXPLAIN|CODE|DIAGRAM|QUESTION|QUIZ|WARNING|SUMMARY|HOMEWORK)\]([\s\S]*?)\[\/\1\]/gi;
      tagRe.lastIndex = 0;
      let match;
      const newBlocks = [];
      
      while ((match = tagRe.exec(raw)) !== null) {
        const endPos = match.index + match[0].length;
        
        if (endPos > processedUpToRef.current) {
          const tag = match[1].toUpperCase();
          const content = (match[2] || '').trim();
          processedUpToRef.current = endPos;

          if (tag === 'EXPLAIN' || tag === 'POINT' || tag === 'MATH' || tag === 'CODE' || tag === 'DIAGRAM' || tag === 'QUESTION') {
            lessonContextRef.current += content + '\n';
          }

          if (tag === 'EXPLAIN') {
            const cleanText = content.replace(/\[.*?\]/g, '').replace(/[\{\}\\]/g, '').trim();
            if (cleanText) {
              const id = Date.now() + Math.random();
              setAudioQueue(q => [...q, { id, ready: false, url: null }]);
              
              fetch(`${API}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanText })
              })
              .then(res => res.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                setAudioQueue(q => q.map(item => item.id === id ? { ...item, ready: true, url } : item));
              })
              .catch(err => {
                console.error("Prefetch failed", err);
                setAudioQueue(q => q.map(item => item.id === id ? { ...item, ready: true, url: null } : item));
              });
            }
          } else {
            newBlocks.push({ tag, content, id: `block-${endPos}` });
          }
        }
      }
      return newBlocks.length > 0 ? [...prev, ...newBlocks] : prev;
    });
  }, []);

  const startSession = async () => {
    if (!topic) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    clearSpeechCompletely();
    setStarted(true);
    setViewPastClass(null);
    setIsStreaming(true);
    setIsPaused(false);
    setQuestionsAsked([]);
    rawBufferRef.current = '';
    processedUpToRef.current = 0;
    lessonContextRef.current = ''; 
    setBlocks([]);

    try {
      for await (const chunk of streamEndpoint('teach', { topic, subject }, abortControllerRef.current.signal)) {
        rawBufferRef.current += chunk;
        processRaw(rawBufferRef.current);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error(e);
        setBlocks(prev => [...prev, { tag: 'WARNING', content: `API Error: ${e.message}. Rate limit hit or connection failed. Please wait a minute.`, id: Date.now() }]);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleInterrupt = async () => {
    if (!interruption) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setIsStreaming(true);
    setIsPaused(false);
    const question = interruption;
    setQuestionsAsked(prev => [...prev, question]);
    setInterruption('');
    
    clearSpeechCompletely();
    
    const history = [
      { role: "user", content: `Teach me about: ${topic}` },
      { role: "assistant", content: rawBufferRef.current }
    ];

    try {
      for await (const chunk of streamEndpoint('interrupt', { topic, history, question, subject }, abortControllerRef.current.signal)) {
        rawBufferRef.current += chunk;
        processRaw(rawBufferRef.current);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error(e);
        setBlocks(prev => [...prev, { tag: 'WARNING', content: `API Error: ${e.message}. Rate limit hit or connection failed. Please wait a minute.`, id: Date.now() }]);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const exitToLanding = async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    clearSpeechCompletely();
    
    if (topic && blocks.length > 0) {
      const newClass = {
        id: Date.now().toString(),
        topic,
        blocks,
        questionsAsked,
        date: new Date().toLocaleString()
      };
      
      try {
        await fetch(`${API}/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClass)
        });
      } catch (e) {
        console.error("Failed to save class to database", e);
      }
    }

    setStarted(false);
    setIsStreaming(false);
    setIsPaused(false);
    setTopic('');
    setBlocks([]);
    setInterruption('');
    setQuestionsAsked([]);
    rawBufferRef.current = '';
    processedUpToRef.current = 0;
    lessonContextRef.current = ''; 
  };

  const handleLogout = () => {
    if (started) {
      exitToLanding();
    }
    clearSpeechCompletely();
    setViewPastClass(null);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="login-page">
        <header className="login-header">
          <div className="logo-area">
            <span className="logo-icon">✎</span>
            <span className="logo-text-white">AI</span>
            <span className="logo-text-orange">TUTOR</span>
          </div>
        </header>
        <main className="login-main">
          <div className="login-container">
            <h2 className="welcome-header">Welcome Back</h2>
            <p className="welcome-subtitle">sign in to access your digital chalkboard and learning history.</p>
            
            <div className="input-field-group">
              <label>EMAIL ADDRESS</label>
              <input type="email" placeholder="Enter your email" />
            </div>
            
            <div className="input-field-group">
              <label>PASSWORD</label>
              <input type="password" placeholder="Enter your password" />
            </div>

            <div className="signin-btn-container" onClick={() => setIsAuthenticated(true)}>
              SIGN IN
            </div>

            <div className="demo-access-text" onClick={() => setIsAuthenticated(true)}>
              Access Demo Account
            </div>

            <div className="create-account-text">
              Create a new account
            </div>
          </div>
        </main>
        <footer className="login-footer">
          &copy; 2026 AI Tutor - Vintage Chalkboard Simulation. All rights reserved.
        </footer>
      </div>
    );
  }

  const showHeader = !started || viewPastClass;

  const renderBlock = (step) => {
    switch(step.tag) {
      case 'HEADING': return <h1 className="rendered-heading">{step.content}</h1>;
      case 'POINT': return (
        <div className="rendered-point-row">
          <span className="point-bullet-marker">•</span>
          <span className="point-text-content">{step.content}</span>
        </div>
      );
      case 'MATH': return (
        <div className="rendered-math-container">
          <BlockMath math={step.content} />
        </div>
      );
      case 'IMAGE': return (
        <div className="rendered-media-frame">
          <VisualImage query={step.content} subject={subject} />
        </div>
      );
      case 'DIAGRAM': return <CanvasDiagram instructions={step.content} />;
      case 'CODE': return (
        <div className="rendered-code-container">
          <pre><code>{step.content}</code></pre>
        </div>
      );
      case 'WARNING': return <div className="rendered-warning">⚠️ {step.content}</div>;
      case 'QUESTION': return <div className="rendered-question">🤔 {step.content}</div>;
      case 'SUMMARY': return <div className="rendered-summary">📌 {step.content}</div>;
      case 'HOMEWORK': return <div className="rendered-homework">📝 {step.content}</div>;
      default: return null;
    }
  };

  return (
    <div className="dashboard-layout">
      {showHeader && (
        <header className="dashboard-header">
          <div className="logo-area">
            <span className="logo-icon">✎</span>
            <span className="logo-text-white">AI</span>
            <span className="logo-text-orange">TUTOR</span>
          </div>
          <div className="user-profile-area">
            <span className="logged-in-text">logged in as <span className="username-text">{username}</span></span>
            <button className="signout-btn" onClick={handleLogout}>SIGN OUT</button>
          </div>
        </header>
      )}

      <div className="app-workspace">
        {viewPastClass && (
          <>
            <div className="left-sidebar-panel">
              <div className="sidebar-top-section">
                <div className="brand-title">
                  Cogni-Learn <span role="img" aria-label="graduation cap">🎓</span>
                  <button className="exit-action-btn" onClick={() => { clearSpeechCompletely(); setViewPastClass(null); }}>QUIT</button>
                </div>

                <div className="status-meta-card">
                  <div className="meta-card-label">RECORDING PLAYBACK</div>
                  <div className="meta-card-value">{viewPastClass.topic}</div>
                  <div className="meta-card-label" style={{marginTop: '12px'}}>DATE RECORDED</div>
                  <div className="meta-card-value" style={{fontSize: '13px', color: '#a5c7b0'}}>{viewPastClass.date}</div>
                </div>

                {viewPastClass.questionsAsked.length > 0 && (
                  <div className="status-meta-card">
                    <div className="meta-card-label">QUESTIONS ASKED:</div>
                    <div className="questions-history-log">
                      {viewPastClass.questionsAsked.map((q, idx) => (
                        <div key={idx} className="logged-question-bubble">"{q}"</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="classroom-main-board" ref={scrollRef}>
              <div className="board-scrollable-container">
                {viewPastClass.blocks.map((step) => (
                  <div key={step.id} className="board-render-element">
                    {renderBlock(step)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!started && !viewPastClass && (
          <>
            <div className="left-sidebar-panel">
              <div className="brand-title">
                Cogni-Learn <span role="img" aria-label="graduation cap">🎓</span>
              </div>
              
              <div className="history-section">
                <h3 className="history-header">CLASS RECORDINGS</h3>
                <div className="history-list">
                  {pastClasses.length === 0 && <p className="empty-history">No past classes found. Start a new lesson to save it here!</p>}
                  
                  {pastClasses.map(cls => (
                    <div key={cls.id} className="history-item" onClick={() => setViewPastClass(cls)}>
                      <div style={{flex: 1}}>
                        <div className="history-topic">{cls.topic}</div>
                        <div className="history-date">{cls.date}</div>
                      </div>
                      <button className="delete-history-btn" onClick={(e) => deleteHistoryItem(e, cls.id)}>
                        ✖
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="classroom-main-board" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <div className="landing-card">
                  <h1 className="main-title">Start a New Class 🎓</h1>
                  <p className="main-subtitle">Select a subject and enter any complex topic, math formula, or coding concept to begin your live session.</p>
                  
                  <select 
                      className="subject-dropdown" 
                      value={subject} 
                      onChange={(e) => setSubject(e.target.value)}
                  >
                      {availableSubjects.map(sub => (
                          <option key={sub} value={sub}>{sub}</option>
                      ))}
                  </select>

                  <div className="topic-input-wrapper" style={{ marginTop: '15px' }}>
                      <input 
                          value={topic} 
                          onChange={e => setTopic(e.target.value)} 
                          placeholder="What topic would you like to master today?" 
                          onKeyPress={e => e.key === 'Enter' && startSession()}
                          autoFocus
                      />
                      <button onClick={startSession} disabled={!topic}>Teach Me</button>
                  </div>
              </div>
            </div>
          </>
        )}

        {started && !viewPastClass && (
          <>
            <div className="left-sidebar-panel">
              <div className="sidebar-top-section">
                <div className="brand-title">
                  Cogni-Learn <span role="img" aria-label="graduation cap">🎓</span>
                  <button className="exit-action-btn" onClick={exitToLanding}>END CLASS</button>
                </div>

                <div className="status-meta-card">
                  <div className="meta-card-label">CURRENT LESSON</div>
                  <div className="meta-card-value">{topic}</div>
                </div>

                <div className="status-meta-card">
                  <div className="meta-card-label">QUESTIONS ASKED:</div>
                  <div className="questions-history-log">
                    {questionsAsked.map((q, idx) => (
                      <div key={idx} className="logged-question-bubble">
                        "{q}"
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sidebar-bottom-controls">
                <button className="voice-toggle-btn" onClick={togglePause}>
                  {isPaused ? '▶ Resume Voice' : '⏸ Pause Voice'}
                </button>
                <input 
                  className="realtime-feedback-box"
                  value={interruption} 
                  onChange={e => setInterruption(e.target.value)} 
                  placeholder="Answer questions or ask a doubt..." 
                  onKeyPress={e => e.key === 'Enter' && handleInterrupt()}
                />
                <button className="submit-ask-btn" onClick={handleInterrupt}>
                  Submit
                </button>
              </div>
            </div>

            <div className="classroom-main-board" ref={scrollRef}>
              <div className="board-scrollable-container">
                <AnimatePresence>
                  {blocks.map((step) => (
                    <motion.div 
                      key={step.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="board-render-element"
                    >
                      {renderBlock(step)}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}