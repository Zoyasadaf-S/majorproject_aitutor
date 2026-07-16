import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

const API = 'http://127.0.0.1:8000/api';

const resetVoiceEngine = () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
    const dummy = new SpeechSynthesisUtterance("");
    dummy.volume = 0;
    window.speechSynthesis.speak(dummy);
  }
};

const speakText = (text) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.resume(); 
  const cleanText = text.replace(/\[.*?\]/g, '').trim();
  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const setVoiceAndSpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === "Google UK English Female") ||
                  voices.find(v => v.name === "Microsoft Zira - English (United States)") ||
                  voices.find(v => v.name === "Samantha") || 
                  voices.find(v => v.name.toLowerCase().includes("female")) || 
                  voices[0];
                  
    if (voice) utterance.voice = voice;
    utterance.rate = 0.90; 
    utterance.pitch = 1.1; 
    window.speechSynthesis.speak(utterance);
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = setVoiceAndSpeak;
  } else {
    setVoiceAndSpeak();
  }
};

const WikipediaImage = ({ query }) => {
  const [imgUrl, setImgUrl] = useState('');
  
  useEffect(() => {
    const fetchImage = async () => {
      try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages&piprop=original|thumbnail&pithumbsize=600&format=json&origin=*`;
        const res = await fetch(searchUrl);
        const data = await res.json();
        const pages = data.query?.pages;
        
        if (pages) {
          const page = Object.values(pages)[0];
          if (page.original && page.original.source) {
            setImgUrl(page.original.source);
            return;
          } else if (page.thumbnail && page.thumbnail.source) {
            setImgUrl(page.thumbnail.source);
            return;
          }
        }
      } catch (e) {
        console.error("Image fetch failed", e);
      }
      setImgUrl(`https://placehold.co/600x350/131314/ffe699?text=${encodeURIComponent(query)}`);
    };
    fetchImage();
  }, [query]);

  if (!imgUrl) return <div style={{ color: '#a1a1aa', fontStyle: 'italic', padding: '20px', textAlign: 'center' }}>Loading visual...</div>;
  
  return (
    <motion.img 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      src={imgUrl} 
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
    ctx.font = '18px "Segoe UI", sans-serif';

    ctx.beginPath();
    const inst = instructions.toLowerCase();
    
    // NEW: Handles Right Triangles for Pythagoras and Trigonometry
    if (inst.includes('right triangle')) {
        ctx.moveTo(150, 50); ctx.lineTo(150, 250); ctx.lineTo(350, 250); ctx.closePath();
        ctx.fillText("A", 140, 40); ctx.fillText("B", 130, 260); ctx.fillText("C", 360, 260);
        ctx.strokeRect(150, 230, 20, 20); // Draws the 90-degree square symbol
    } 
    // Normal equilateral triangle
    else if (inst.includes('triangle')) {
        ctx.moveTo(250, 40); ctx.lineTo(100, 240); ctx.lineTo(400, 240); ctx.closePath();
        ctx.fillText("A", 240, 30); ctx.fillText("B", 80, 260); ctx.fillText("C", 410, 260);
    } else if (inst.includes('circuit') || inst.includes('physics')) {
        ctx.strokeRect(100, 80, 300, 140);
        ctx.clearRect(230, 75, 40, 10); ctx.fillText("┠┨ V", 225, 70);
        ctx.clearRect(230, 215, 40, 10); ctx.strokeRect(230, 210, 40, 10); ctx.fillText("R", 245, 245);
    } else if (inst.includes('graph') || inst.includes('parabola') || inst.includes('plot')) {
        ctx.moveTo(50, 250); ctx.lineTo(450, 250); 
        ctx.moveTo(250, 30); ctx.lineTo(250, 270);
        ctx.moveTo(100, 50); ctx.quadraticCurveTo(250, 350, 400, 50);
        ctx.fillText("y", 260, 40); ctx.fillText("x", 440, 270);
    } else if (inst.includes('circle')) {
        ctx.arc(250, 150, 100, 0, 2 * Math.PI);
        ctx.fillText("r", 255, 145);
        ctx.moveTo(250, 150); ctx.lineTo(350, 150);
    } else {
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
          height={300} 
          style={{ backgroundColor: '#11291d', border: '2px dashed #ffe699', borderRadius: '8px', maxWidth: '100%' }} 
        />
        <div style={{ color: '#ffe699', marginTop: '10px', fontStyle: 'italic', fontSize: '14px' }}>Generated Diagram: {instructions}</div>
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
        if (json.text) yield json.text;
      } catch {}
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
  const [blocks, setBlocks] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [interruption, setInterruption] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [questionsAsked, setQuestionsAsked] = useState([]);
  
  const rawBufferRef = useRef('');
  const processedUpToRef = useRef(0);
  const scrollRef = useRef(null);
  const lessonContextRef = useRef(''); 
  const abortControllerRef = useRef(null);

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
    if (window.speechSynthesis) window.speechSynthesis.getVoices();
  }, []);

  const togglePause = () => {
    if (!window.speechSynthesis) return;
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const processRaw = useCallback((raw) => {
    setBlocks(prev => {
      const tagRe = /\[(HEADING|POINT|MATH|IMAGE|EXPLAIN|CODE|DIAGRAM)\]([\s\S]*?)\[\/\1\]/gi;
      tagRe.lastIndex = 0;
      let match;
      const newBlocks = [];
      
      while ((match = tagRe.exec(raw)) !== null) {
        const endPos = match.index + match[0].length;
        
        if (endPos > processedUpToRef.current) {
          const tag = match[1].toUpperCase();
          const content = (match[2] || '').trim();
          processedUpToRef.current = endPos;

          if (tag === 'EXPLAIN' || tag === 'POINT' || tag === 'MATH' || tag === 'CODE' || tag === 'DIAGRAM') {
            lessonContextRef.current += content + '\n';
          }

          if (tag === 'EXPLAIN') {
            speakText(content);
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

    setStarted(true);
    setViewPastClass(null);
    setIsStreaming(true);
    setIsPaused(false);
    setQuestionsAsked([]);
    rawBufferRef.current = '';
    processedUpToRef.current = 0;
    lessonContextRef.current = ''; 
    setBlocks([]);
    resetVoiceEngine();

    try {
      for await (const chunk of streamEndpoint('teach', { topic }, abortControllerRef.current.signal)) {
        rawBufferRef.current += chunk;
        processRaw(rawBufferRef.current);
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
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
    resetVoiceEngine(); 
    
    const history = [
      { role: "user", content: `Teach me about: ${topic}` },
      { role: "assistant", content: rawBufferRef.current }
    ];

    try {
      for await (const chunk of streamEndpoint('interrupt', { topic, history, question }, abortControllerRef.current.signal)) {
        rawBufferRef.current += chunk;
        processRaw(rawBufferRef.current);
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setIsStreaming(false);
    }
  };

  const exitToLanding = async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    resetVoiceEngine();
    
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

  // Hide header dynamically if a live class is currently active.
  const showHeader = !started || viewPastClass;

  return (
    <div className="dashboard-layout">
      {/* Top Header Section - Conditionally rendered based on active class */}
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

      {/* Main Workspace Area */}
      <div className="app-workspace">
        {/* VIEW: RECORDING PLAYBACK */}
        {viewPastClass && (
          <>
            <div className="left-sidebar-panel">
              <div className="sidebar-top-section">
                <div className="brand-title">
                  Cogni-Learn <span role="img" aria-label="graduation cap">🎓</span>
                  <button className="exit-action-btn" onClick={() => setViewPastClass(null)}>BACK</button>
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
                    {step.tag === 'HEADING' && <h1 className="rendered-heading">{step.content}</h1>}
                    {step.tag === 'POINT' && (
                      <div className="rendered-point-row">
                        <span className="point-bullet-marker">•</span>
                        <span className="point-text-content">{step.content}</span>
                      </div>
                    )}
                    {step.tag === 'MATH' && (
                      <div className="rendered-math-container">
                        <BlockMath math={step.content} />
                      </div>
                    )}
                    {step.tag === 'IMAGE' && (
                      <div className="rendered-media-frame">
                        <WikipediaImage query={step.content} />
                        <div className="media-caption-bar">Displaying Images for {step.content}</div>
                      </div>
                    )}
                    {step.tag === 'DIAGRAM' && (
                      <CanvasDiagram instructions={step.content} />
                    )}
                    {step.tag === 'CODE' && (
                      <div className="rendered-code-container">
                        <pre><code>{step.content}</code></pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* VIEW: DASHBOARD (NOT STARTED) */}
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
                      <div className="history-topic">{cls.topic}</div>
                      <div className="history-date">{cls.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="classroom-main-board" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <div className="landing-card">
                <h1 className="main-title">Start a New Class 🎓</h1>
                <p className="main-subtitle">Enter any complex topic, math formula, or coding framework to begin your live session.</p>
                <div className="topic-input-wrapper">
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

        {/* VIEW: ACTIVE LIVE CLASS */}
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
                  placeholder="Raise your hand to ask a doubt..." 
                  onKeyPress={e => e.key === 'Enter' && handleInterrupt()}
                />
                <button className="submit-ask-btn" onClick={handleInterrupt}>
                  Ask Doubt
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
                      {step.tag === 'HEADING' && <h1 className="rendered-heading">{step.content}</h1>}
                      {step.tag === 'POINT' && (
                        <div className="rendered-point-row">
                          <span className="point-bullet-marker">•</span>
                          <span className="point-text-content">{step.content}</span>
                        </div>
                      )}
                      {step.tag === 'MATH' && (
                        <div className="rendered-math-container">
                          <BlockMath math={step.content} />
                        </div>
                      )}
                      {step.tag === 'IMAGE' && (
                        <div className="rendered-media-frame">
                          <WikipediaImage query={step.content} />
                          <div className="media-caption-bar">Displaying Images for {step.content}</div>
                        </div>
                      )}
                      {step.tag === 'DIAGRAM' && (
                        <CanvasDiagram instructions={step.content} />
                      )}
                      {step.tag === 'CODE' && (
                        <div className="rendered-code-container">
                          <pre><code>{step.content}</code></pre>
                        </div>
                      )}
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