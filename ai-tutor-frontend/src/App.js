import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

import CheckpointCard from './components/CheckpointCard';
import PracticeQuizzesPage from './components/PracticeQuizzesPage';

const API = 'http://127.0.0.1:8000/api';

// VisualImage — fetches a real image from backend (Wikimedia/Wikipedia/Unsplash)
// Shows attribution beneath the image. Renders nothing if no image found.
const VisualImage = ({ query }) => {
  const [imgData, setImgData] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!query) return;
    fetch(`${API}/image?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => setImgData(data))
      .catch(() => setImgData(null));
  }, [query]);

  if (!imgData || !imgData.url) return null;

  return (
    <div style={{ margin: '12px 0' }}>
      <motion.img
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 0.95 }}
        src={imgData.url}
        alt={query}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setImgData(null)}
        style={{
          maxWidth: '100%', maxHeight: '350px', objectFit: 'contain',
          borderRadius: '8px', display: 'block'
        }}
      />
      {loaded && (imgData.attribution || imgData.source) && (
        <div style={{
          fontSize: '11px', color: 'rgba(255,230,153,0.55)', marginTop: '5px',
          fontStyle: 'italic', lineHeight: '1.4'
        }}>
          {imgData.attribution && <span>{imgData.attribution}</span>}
          {imgData.source && <span style={{ marginLeft: '6px' }}>via {imgData.source}</span>}
          {imgData.license && <span style={{ marginLeft: '6px' }}>· {imgData.license}</span>}
        </div>
      )}
    </div>
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
    ctx.lineWidth = 2.5;
    ctx.font = '16px "Caveat", cursive';

    let type = '';
    try {
      const parsed = JSON.parse(instructions);
      type = parsed.type;
    } catch (e) {
      type = instructions.toLowerCase().trim();
    }

    const arrow = (x1, y1, x2, y2) => {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - 10 * Math.cos(angle - 0.4), y2 - 10 * Math.sin(angle - 0.4));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 10 * Math.cos(angle + 0.4), y2 - 10 * Math.sin(angle + 0.4));
    };

    ctx.beginPath();

    if (type === 'right_triangle') {
      ctx.moveTo(150, 50); ctx.lineTo(150, 250); ctx.lineTo(350, 250); ctx.closePath();
      ctx.fillText('A', 140, 40); ctx.fillText('B', 130, 265); ctx.fillText('C', 355, 265);
      ctx.strokeRect(150, 230, 20, 20);
      ctx.fillText('hypotenuse', 230, 130); ctx.fillText('base', 220, 275); ctx.fillText('height', 100, 155);

    } else if (type === 'triangle') {
      ctx.moveTo(250, 40); ctx.lineTo(100, 260); ctx.lineTo(400, 260); ctx.closePath();
      ctx.fillText('A', 242, 30); ctx.fillText('B', 82, 278); ctx.fillText('C', 404, 278);

    } else if (type === 'circuit') {
      ctx.strokeRect(100, 90, 300, 140);
      ctx.clearRect(228, 85, 44, 10);
      ctx.fillText('⊣⊢ V', 225, 82);
      ctx.clearRect(228, 224, 44, 10);
      ctx.strokeRect(228, 216, 44, 14);
      ctx.fillText('R', 244, 248);
      ctx.fillText('+', 85, 168); ctx.fillText('−', 402, 168);

    } else if (type === 'graph' || type === 'parabola' || type === 'plot') {
      arrow(40, 260, 460, 260); ctx.fillText('x', 448, 278);
      arrow(250, 310, 250, 20);  ctx.fillText('y', 256, 22);
      ctx.moveTo(90, 50);
      ctx.quadraticCurveTo(250, 360, 410, 50);
      ctx.fillText('f(x)', 310, 80);

    } else if (type === 'circle') {
      ctx.arc(250, 155, 110, 0, 2 * Math.PI);
      ctx.moveTo(250, 155); ctx.lineTo(360, 155);
      ctx.fillText('r', 298, 148); ctx.fillText('O', 240, 162);

    } else if (type === 'force_block') {
      ctx.moveTo(80, 255); ctx.lineTo(420, 255);
      ctx.strokeRect(200, 150, 100, 100);
      ctx.fillText('Mass (m)', 215, 207);
      arrow(250, 255, 250, 310); ctx.fillText('mg (weight)', 262, 320);
      arrow(250, 150, 250, 90);  ctx.fillText('N (normal)', 258, 80);
      arrow(300, 200, 375, 200); ctx.fillText('F (applied)', 378, 206);

    } else if (type === 'ray_diagram') {
      // Mirror / lens ray diagram
      ctx.moveTo(40, 175); ctx.lineTo(460, 175); // principal axis
      ctx.fillText('Principal Axis', 340, 165);
      ctx.moveTo(250, 60); ctx.lineTo(250, 300); // lens/mirror
      ctx.fillText('Lens', 255, 52);
      // Incident ray
      ctx.setLineDash([5, 3]);
      ctx.moveTo(60, 100); ctx.lineTo(250, 100);
      ctx.setLineDash([]);
      arrow(250, 100, 390, 230);
      ctx.fillText('incident', 120, 90); ctx.fillText('refracted', 310, 245);
      // Focus
      ctx.arc(330, 175, 4, 0, 2 * Math.PI); ctx.fill();
      ctx.fillText('F', 318, 192);

    } else if (type === 'flow_diagram') {
      const boxW = 160, boxH = 38, cx = 250;
      const labels = ['START', 'Process / Input', 'Decision', 'Output', 'END'];
      const ys = [30, 100, 175, 250, 320];
      labels.forEach((lbl, i) => {
        if (i === 2) {
          // Diamond for decision
          ctx.beginPath();
          ctx.moveTo(cx, ys[i]); ctx.lineTo(cx + 70, ys[i] + 30);
          ctx.lineTo(cx, ys[i] + 60); ctx.lineTo(cx - 70, ys[i] + 30);
          ctx.closePath(); ctx.stroke();
          ctx.fillText(lbl, cx - 28, ys[i] + 36);
        } else {
          ctx.strokeRect(cx - boxW / 2, ys[i], boxW, boxH);
          ctx.fillText(lbl, cx - ctx.measureText(lbl).width / 2, ys[i] + 25);
        }
        if (i < labels.length - 1) {
          const nextY = i === 2 ? ys[i] + 60 : ys[i] + boxH;
          arrow(cx, nextY, cx, ys[i + 1]);
        }
      });

    } else if (type === 'osi_layers') {
      const layers = [
        '7 - Application', '6 - Presentation', '5 - Session',
        '4 - Transport', '3 - Network', '2 - Data Link', '1 - Physical'
      ];
      const colors = ['#ff6b6b','#ff9f43','#feca57','#48dbfb','#0abde3','#006994','#1e3799'];
      layers.forEach((lbl, i) => {
        ctx.fillStyle = colors[i];
        ctx.globalAlpha = 0.35;
        ctx.fillRect(90, 18 + i * 44, 320, 36);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors[i];
        ctx.strokeRect(90, 18 + i * 44, 320, 36);
        ctx.fillStyle = '#ffe699';
        ctx.strokeStyle = '#ffe699';
        ctx.fillText(lbl, 102, 42 + i * 44);
      });

    } else if (type === 'water_cycle') {
      // Simple water cycle: evaporation → condensation → precipitation → collection
      ctx.fillText('☀', 400, 50);
      ctx.fillText('Cloud ☁', 170, 80);
      arrow(250, 250, 210, 100); ctx.fillText('Evaporation', 255, 190);
      arrow(215, 95, 115, 150);  ctx.fillText('Condensation', 60, 130);
      ctx.setLineDash([4, 3]);
      arrow(140, 160, 140, 260); ctx.fillText('Precipitation', 148, 215);
      ctx.setLineDash([]);
      ctx.moveTo(80, 270); ctx.lineTo(420, 270); // ground
      ctx.moveTo(80, 270); ctx.lineTo(80, 290); ctx.lineTo(420, 290); ctx.lineTo(420, 270);
      ctx.fillText('Collection (runoff)', 155, 285);
      arrow(390, 280, 260, 260); // runoff arrow

    } else if (type === 'bar_chart') {
      const bars = [{ l: 'A', v: 180 }, { l: 'B', v: 120 }, { l: 'C', v: 220 }, { l: 'D', v: 90 }];
      const base = 280, barW = 55, gap = 20, startX = 80;
      ctx.moveTo(60, 40); ctx.lineTo(60, base); ctx.lineTo(450, base);
      bars.forEach((b, i) => {
        const x = startX + i * (barW + gap);
        ctx.fillStyle = 'rgba(255,230,153,0.3)';
        ctx.fillRect(x, base - b.v, barW, b.v);
        ctx.fillStyle = '#ffe699';
        ctx.strokeStyle = '#ffe699';
        ctx.strokeRect(x, base - b.v, barW, b.v);
        ctx.fillText(b.l, x + barW / 2 - 5, base + 18);
        ctx.fillText(b.v, x + 5, base - b.v - 5);
      });
      ctx.fillStyle = '#ffe699'; ctx.strokeStyle = '#ffe699';

    } else {
      ctx.strokeRect(130, 110, 240, 110);
      ctx.fillText(instructions.substring(0, 28), 140, 170);
    }

    ctx.stroke();
  }, [instructions]);

  return (
    <div style={{ textAlign: 'center', margin: '18px 0' }}>
      <canvas
        ref={canvasRef}
        width={500}
        height={350}
        style={{
          backgroundColor: 'rgba(11, 46, 27, 0.5)',
          border: '2px dashed rgba(255, 230, 153, 0.4)',
          borderRadius: '8px',
          maxWidth: '100%'
        }}
      />
    </div>
  );
};

async function* streamEndpoint(endpoint, body, signal) {
  let resp;
  try {
    resp = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal 
    });
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      return;
    }
    throw err;
  }

  if (!resp.ok) {
    throw new Error(`Server returned HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done || signal?.aborted) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (signal?.aborted) break;
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          if (json.error) throw new Error(json.error);
          if (json.text) yield json.text;
        } catch (e) {
          if (e.message && e.message.includes('API Error')) throw e;
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      return;
    }
    throw err;
  } finally {
    try {
      reader.cancel();
    } catch (_) {}
  }
}

// Common subject suggestions (hint only — does NOT control prompt logic)
const SUBJECT_SUGGESTIONS = [
  'General', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'Computer Science', 'History', 'Geography', 'Civics', 'Economics',
  'Social Science', 'Literature', 'Languages', 'Electronics',
  'Networking', 'Operating Systems', 'DBMS', 'Software Engineering',
  'IoT', 'Engineering'
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username] = useState("Zoya Sadaf");

  const [pastClasses, setPastClasses] = useState([]);
  const [viewPastClass, setViewPastClass] = useState(null);

  const [started, setStarted] = useState(false);
  const [activeTab, setActiveTab] = useState('classroom');
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('General'); // hint only

  // detectedLanguage is tracked via detectedLanguageRef (used by TTS, not JSX)

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
  const currentStreamIdRef = useRef(0);

  const clearSpeechCompletely = () => {
    if (currentUtteranceRef.current instanceof Audio) {
      currentUtteranceRef.current.pause();
      currentUtteranceRef.current.currentTime = 0;
      currentUtteranceRef.current.src = "";
    }
    setAudioQueue(prev => {
      prev.forEach(item => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
      return [];
    });
    setIsPlaying(false);
    setIsPaused(false);
    currentUtteranceRef.current = null;
  };

  const stopCurrentStreamAndSpeech = () => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (_) {}
    }
    abortControllerRef.current = new AbortController();
    currentStreamIdRef.current += 1;
    clearSpeechCompletely();

    if (rawBufferRef.current.length > processedUpToRef.current) {
      rawBufferRef.current = rawBufferRef.current.slice(0, processedUpToRef.current);
    }
    setIsStreaming(false);
    return currentStreamIdRef.current;
  };

  useEffect(() => {
    if (isPaused) return; 

    if (!isPlaying && audioQueue.length > 0) {
      const nextItem = audioQueue[0];
      
      if (nextItem.streamId && nextItem.streamId !== currentStreamIdRef.current) {
        if (nextItem.url) URL.revokeObjectURL(nextItem.url);
        setAudioQueue(prev => prev.slice(1));
        return;
      }

      if (!nextItem.ready) return; 

      setIsPlaying(true);
      
      if (!nextItem.url) {
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
          currentUtteranceRef.current.play().catch(e => console.error("Resume audio play failed", e));
        }
      }
      return nextPaused;
    });
  };

  const detectedLanguageRef = useRef('en');

  // ── Robust Tag Sanitizer for Chalkboard UI ────────────────────────────────────
  // Ensures NO raw [TAG], [/TAG], [EXPLAIN] spoken content, or [LANG] markup
  // ever bleeds onto the chalkboard UI.
  const stripAllTags = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
      // 1. Remove [LANG] tags and language codes completely
      .replace(/\[LANG\][a-z]{0,5}(?:\[\/LANG\])?/gi, '')
      // 2. Remove [EXPLAIN]...[/EXPLAIN] block content completely (TTS only, never UI text)
      .replace(/\[EXPLAIN\][\s\S]*?\[\/EXPLAIN\]/gi, '')
      // 3. Remove any remaining open/close tag markup, e.g. [POINT], [/POINT], [HEADING], etc.
      .replace(/\[\/?\s*[A-Z1-9_-]{2,20}\s*\]/gi, '')
      // 4. Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  };

  // ── Spoken Text Sanitizer for TTS Audio ─────────────────────────────────────
  // Sanitizes spoken text for Text-to-Speech without deleting the text body
  const stripSpokenText = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/\[LANG\][a-z]{0,5}(?:\[\/LANG\])?/gi, '')
      .replace(/\[\/?\s*[A-Z1-9_-]{2,20}\s*\]/gi, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const processRaw = useCallback((raw, streamId) => {
    if (streamId !== currentStreamIdRef.current) return;

    // ── Step 1: Extract [LANG] (never rendered — TTS voice selection only) ──────
    const langMatch = raw.match(/\[LANG\]([a-z]{2})\[\/LANG\]/i);
    if (langMatch) {
      const code = langMatch[1].toLowerCase();
      if (code !== detectedLanguageRef.current) {
        detectedLanguageRef.current = code;
      }
    }

    // ── Step 2: Main tag scanner on monotonic raw stream buffer ─────────────────
    const KNOWN_TAGS = 'HEADING|POINT|MATH|IMAGE|EXPLAIN|CODE|DIAGRAM|QUESTION|QUIZ|WARNING|SUMMARY';
    const tagRe = new RegExp(
      `\\[(${KNOWN_TAGS})\\]([\\s\\S]*?)\\[\/\\1\\]`,
      'gi'
    );

    const CONTAINER_TAGS = new Set(['SUMMARY']);
    const innerPointRe = /\[POINT\]([\s\S]*?)\[\/POINT\]/gi;

    let match;
    const newBlocks = [];
    const newTtsItems = [];

    tagRe.lastIndex = 0;
    while ((match = tagRe.exec(raw)) !== null) {
      const endPos = match.index + match[0].length;
      if (endPos <= processedUpToRef.current) continue;

      const tag = match[1].toUpperCase();
      const rawContent = (match[2] || '').trim();
      processedUpToRef.current = endPos;

      // Accumulate lesson context (for interrupt re-send)
      if (['EXPLAIN','POINT','MATH','CODE','DIAGRAM','QUESTION'].includes(tag)) {
        lessonContextRef.current += rawContent + '\n';
      }

      if (tag === 'EXPLAIN') {
        // TTS only — never rendered on board
        const cleanText = stripSpokenText(rawContent);
        console.log('[EXPLAIN Tag Found]:', rawContent);
        console.log('[Sending clean text to TTS]:', cleanText);

        if (cleanText && streamId === currentStreamIdRef.current) {
          const id = Date.now() + Math.random();
          newTtsItems.push({ id, cleanText });
        }
        continue;
      }

      if (CONTAINER_TAGS.has(tag)) {
        // ── Flatten: extract nested [POINT] children into individual blocks ──
        let innerMatch;
        const innerPoints = [];
        innerPointRe.lastIndex = 0;
        while ((innerMatch = innerPointRe.exec(rawContent)) !== null) {
          const pointContent = stripAllTags(innerMatch[1].trim());
          if (pointContent) {
            innerPoints.push(pointContent);
          }
        }

        if (innerPoints.length > 0) {
          newBlocks.push({
            tag,
            content: '',   // header-only row
            id: `block-${endPos}-hdr`
          });
          innerPoints.forEach((pt, i) => {
            newBlocks.push({ tag: 'POINT', content: pt, id: `block-${endPos}-pt${i}` });
          });
        } else {
          const safeContent = stripAllTags(rawContent);
          if (safeContent) {
            newBlocks.push({ tag, content: safeContent, id: `block-${endPos}` });
          }
        }
        continue;
      }

      // ── Regular UI block: sanitise content before storing ───────────────────
      let safeContent = rawContent;
      if (tag !== 'MATH' && tag !== 'CODE') {
        safeContent = stripAllTags(rawContent);
      } else {
        safeContent = rawContent
          .replace(/\[\/?(HEADING|POINT|IMAGE|EXPLAIN|DIAGRAM|QUESTION|QUIZ|WARNING|SUMMARY|LANG)\]/gi, '')
          .trim();
      }

      if (safeContent || tag === 'DIAGRAM') {
        newBlocks.push({ tag, content: safeContent, id: `block-${endPos}` });
      }
    }

    if (newBlocks.length > 0 && streamId === currentStreamIdRef.current) {
      setBlocks(prev => [...prev, ...newBlocks]);
    }

    if (newTtsItems.length > 0 && streamId === currentStreamIdRef.current) {
      const langForTts = detectedLanguageRef.current || 'en';
      newTtsItems.forEach(({ id, cleanText }) => {
        setAudioQueue(q => [...q, { id, streamId, ready: false, url: null }]);

        fetch(`${API}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, language: langForTts })
        })
        .then(res => {
          if (streamId !== currentStreamIdRef.current) return null;
          return res.blob();
        })
        .then(blob => {
          if (!blob || streamId !== currentStreamIdRef.current) return;
          const url = URL.createObjectURL(blob);
          setAudioQueue(q => {
            if (streamId !== currentStreamIdRef.current) {
              URL.revokeObjectURL(url);
              return q;
            }
            return q.map(item => item.id === id ? { ...item, ready: true, url } : item);
          });
        })
        .catch(err => {
          console.error('TTS fetch failed', err);
          if (streamId === currentStreamIdRef.current) {
            setAudioQueue(q => q.map(item => item.id === id ? { ...item, ready: true, url: null } : item));
          }
        });
      });
    }
  }, []);

  const startSession = async () => {
    if (!topic) return;
    const streamId = stopCurrentStreamAndSpeech();

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
        if (streamId !== currentStreamIdRef.current) break;
        rawBufferRef.current += chunk;
        processRaw(rawBufferRef.current, streamId);
      }
    } catch (e) {
      if (e.name !== 'AbortError' && !abortControllerRef.current?.signal?.aborted) {
        console.error(e);
        setBlocks(prev => [...prev, { tag: 'WARNING', content: `API Error: ${e.message}. Rate limit hit or connection failed. Please wait a minute.`, id: Date.now() }]);
      }
    } finally {
      if (streamId === currentStreamIdRef.current) {
        setIsStreaming(false);
      }
    }
  };

  const handleInterrupt = async (customDoubt = null) => {
    const question = (typeof customDoubt === 'string' ? customDoubt : interruption || '').trim();
    if (!question) return;

    const streamId = stopCurrentStreamAndSpeech();

    setIsStreaming(true);
    setIsPaused(false);
    setQuestionsAsked(prev => [...prev, question]);
    setInterruption('');
    
    const history = [
      { role: "user", content: `Teach me about: ${topic}` },
      { role: "assistant", content: rawBufferRef.current }
    ];

    try {
      for await (const chunk of streamEndpoint('interrupt', { topic, history, question, subject }, abortControllerRef.current.signal)) {
        if (streamId !== currentStreamIdRef.current) break;
        rawBufferRef.current += chunk;
        processRaw(rawBufferRef.current, streamId);
      }
    } catch (e) {
      if (e.name !== 'AbortError' && !abortControllerRef.current?.signal?.aborted) {
        console.error(e);
        setBlocks(prev => [...prev, { tag: 'WARNING', content: `API Error: ${e.message}. Rate limit hit or connection failed. Please wait a minute.`, id: Date.now() }]);
      }
    } finally {
      if (streamId === currentStreamIdRef.current) {
        setIsStreaming(false);
      }
    }
  };

  const exitToLanding = async () => {
    stopCurrentStreamAndSpeech();
    
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
    // Final-defence sanitiser: strip any leftover tag text that
    // somehow survived the processRaw pass before it hits the DOM.
    const safe = (str) => stripAllTags(str);

    switch(step.tag) {
      case 'HEADING': return <h1 className="rendered-heading">{safe(step.content)}</h1>;
      case 'POINT': return (
        <div className="rendered-point-row">
          <span className="point-bullet-marker">•</span>
          <span className="point-text-content">{safe(step.content)}</span>
        </div>
      );
      case 'MATH': return (
        <div className="rendered-math-container">
          <BlockMath math={step.content} />
        </div>
      );
      case 'IMAGE': return (
        <div className="rendered-media-frame">
          <VisualImage query={safe(step.content)} />
        </div>
      );
      case 'DIAGRAM': return <CanvasDiagram instructions={safe(step.content)} />;
      case 'CODE': return (
        <div className="rendered-code-container">
          <pre><code>{step.content}</code></pre>
        </div>
      );
      case 'WARNING': return <div className="rendered-warning">⚠️ {safe(step.content)}</div>;
      case 'QUESTION': return <div className="rendered-question">❓ {safe(step.content)}</div>;
      // SUMMARY header row (content is empty — points are rendered as individual POINT blocks)
      case 'SUMMARY': return step.content
        ? <div className="rendered-summary">📌 {safe(step.content)}</div>
        : <div className="rendered-summary" style={{fontWeight:'bold',opacity:0.85}}>📌 Summary</div>;
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

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={() => setActiveTab('classroom')}
              style={{
                backgroundColor: activeTab === 'classroom' ? '#059669' : 'transparent',
                color: activeTab === 'classroom' ? '#ffffff' : '#9ca3af',
                border: '1px solid #374151',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Classroom Studio
            </button>
            <button 
              onClick={() => setActiveTab('practice')}
              style={{
                backgroundColor: activeTab === 'practice' ? '#0284c7' : 'transparent',
                color: activeTab === 'practice' ? '#ffffff' : '#9ca3af',
                border: '1px solid #374151',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Practice & Quizzes
            </button>
          </div>

          <div className="user-profile-area">
            <span className="logged-in-text">logged in as <span className="username-text">{username}</span></span>
            <button className="signout-btn" onClick={handleLogout}>SIGN OUT</button>
          </div>
        </header>
      )}

      <div className="app-workspace">
        {activeTab === 'practice' && !started && !viewPastClass ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <PracticeQuizzesPage
              activeTopic={topic}
              activeSubject={subject}
              onStartLesson={(newTopic, newSubject) => {
                setTopic(newTopic);
                if (newSubject) setSubject(newSubject);
                setActiveTab('classroom');
                startSession();
              }}
              onReturnDashboard={() => setActiveTab('classroom')}
            />
          </div>
        ) : null}

        {activeTab === 'classroom' && viewPastClass && (
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

        {activeTab === 'classroom' && !started && !viewPastClass && (
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
                  
                  <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontSize: '11px', color: 'rgba(255,230,153,0.6)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                        Subject Hint <span style={{ fontWeight: 'normal', opacity: 0.6 }}>(optional — AI auto-detects from your question)</span>
                      </label>
                      <select
                          className="subject-dropdown"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                      >
                          {SUBJECT_SUGGESTIONS.map(sub => (
                              <option key={sub} value={sub}>{sub}</option>
                          ))}
                      </select>
                  </div>

                  <div className="topic-input-wrapper" style={{ marginTop: '12px' }}>
                      <input
                          value={topic}
                          onChange={e => setTopic(e.target.value)}
                          placeholder="Ask any academic question or enter a topic..."
                          onKeyPress={e => e.key === 'Enter' && startSession()}
                          autoFocus
                      />
                      <button onClick={startSession} disabled={!topic}>Teach Me</button>
                      <button onClick={() => setActiveTab('practice')} style={{ backgroundColor: '#0284c7' }}>Practice Mode</button>
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