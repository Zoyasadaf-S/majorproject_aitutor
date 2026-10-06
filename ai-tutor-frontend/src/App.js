import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

import PracticeQuizzesPage from './components/PracticeQuizzesPage';
import UserProfileDropdown from './components/UserProfileDropdown';
import AdminDashboard from './components/AdminDashboard';

const API = 'http://127.0.0.1:8000/api';

// VisualImage — fetches a real image from backend (Wikimedia/Wikipedia/Unsplash)
// Shows attribution beneath the image. Renders nothing if no image found.
const VisualImage = ({ query }) => {
  const [imgData, setImgData] = React.useState(null);
  const [imageStatus, setImageStatus] = React.useState('loading');

  React.useEffect(() => {
    let active = true;
    setImgData(null);
    setImageStatus('loading');
    if (!query) {
      setImageStatus('missing');
      return () => { active = false; };
    }
    fetch(`${API}/image?q=${encodeURIComponent(query)}`)
      .then(r => {
        if (!r.ok) throw new Error(`Image lookup failed (${r.status})`);
        return r.json();
      })
      .then(data => {
        if (!active) return;
        if (data?.url) setImgData(data);
        else setImageStatus('missing');
      })
      .catch(() => {
        if (active) setImageStatus('missing');
      });
    return () => { active = false; };
  }, [query]);

  if (imageStatus === 'missing') {
    return <div className="visual-unavailable" role="status">No matching image could be loaded; the lesson continues on the board.</div>;
  }
  if (!imgData?.url) {
    return <div className="visual-loading" role="status">Finding a relevant teaching image…</div>;
  }

  return (
    <div style={{ margin: '12px 0' }}>
      <motion.img
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: imageStatus === 'loaded' ? 1 : 0, scale: imageStatus === 'loaded' ? 1 : 0.95 }}
        src={imgData.url}
        alt={query}
        referrerPolicy="no-referrer"
        onLoad={() => setImageStatus('loaded')}
        onError={() => { setImgData(null); setImageStatus('missing'); }}
        style={{
          maxWidth: '100%', maxHeight: '350px', objectFit: 'contain',
          borderRadius: '8px', display: 'block'
        }}
      />
      {imageStatus === 'loaded' && (imgData.attribution || imgData.source) && (
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

// Supported canvas diagram types — must match TEACH_SYSTEM prompt exactly
const CANVAS_VALID_TYPES = new Set([
  'right_triangle', 'triangle', 'circuit', 'graph', 'parabola',
  'plot', 'circle', 'force_block', 'ray_diagram', 'flow_diagram',
  'osi_layers', 'water_cycle', 'bar_chart'
]);

function parseDiagramDefinition(instructions) {
  if (!instructions) return {};
  try {
    const parsed = JSON.parse(instructions);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return { type: instructions.toLowerCase().trim() };
  }
}

function getFlowDiagramSteps(definition) {
  const steps = definition?.steps;
  const kinds = new Set(['start', 'process', 'input', 'output', 'end']);
  if (Object.keys(definition || {}).some(key => !['type', 'steps'].includes(key))) return null;
  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 6) return null;
  if (steps[0]?.kind !== 'start' || steps[steps.length - 1]?.kind !== 'end') return null;
  if (steps.some((step, index) => (
    !step || typeof step.label !== 'string' || !step.label.trim() || step.label.length > 42 ||
    !kinds.has(step.kind) || (index > 0 && index < steps.length - 1 && ['start', 'end'].includes(step.kind))
  ))) return null;
  return steps;
}

const CanvasDiagram = ({ instructions }) => {
  const canvasRef = useRef(null);
  const definition = useMemo(() => parseDiagramDefinition(instructions), [instructions]);
  const diagramType = (definition.type || '').toLowerCase().trim();
  const flowSteps = useMemo(
    () => diagramType === 'flow_diagram' ? getFlowDiagramSteps(definition) : null,
    [definition, diagramType]
  );
  const isValidType = CANVAS_VALID_TYPES.has(diagramType) && (diagramType !== 'flow_diagram' || !!flowSteps);

  useEffect(() => {
    // Only draw if type is valid AND canvas is mounted
    if (!isValidType) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ffe699';
    ctx.fillStyle = '#ffe699';
    ctx.lineWidth = 2.5;
    ctx.font = '16px "Caveat", cursive';

    const type = diagramType;

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
      const nodeW = 330, nodeH = 36, gap = 14, cx = 250;
      const totalH = flowSteps.length * nodeH + (flowSteps.length - 1) * gap;
      const firstY = (350 - totalH) / 2;
      ctx.textAlign = 'center';
      flowSteps.forEach((step, i) => {
        const y = firstY + i * (nodeH + gap);
        const left = cx - nodeW / 2;
        ctx.beginPath();
        if (step.kind === 'start' || step.kind === 'end') {
          ctx.ellipse(cx, y + nodeH / 2, nodeW / 2, nodeH / 2, 0, 0, 2 * Math.PI);
        } else if (step.kind === 'input' || step.kind === 'output') {
          ctx.moveTo(left + 18, y); ctx.lineTo(left + nodeW, y);
          ctx.lineTo(left + nodeW - 18, y + nodeH); ctx.lineTo(left, y + nodeH);
          ctx.closePath();
        } else {
          ctx.rect(left, y, nodeW, nodeH);
        }
        ctx.stroke();
        ctx.fillText(step.label.trim(), cx, y + 23, nodeW - 34);
        if (i < flowSteps.length - 1) {
          ctx.beginPath();
          arrow(cx, y + nodeH, cx, y + nodeH + gap - 2);
          ctx.stroke();
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

    }

    ctx.stroke();
  }, [instructions, isValidType, diagramType, flowSteps]);

  // Return null for unsupported types — no canvas box rendered at all
  if (!isValidType) return null;

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
  const token = localStorage.getItem('cognilearn_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    resp = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: headers,
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
    const failure = await resp.json().catch(() => ({}));
    throw new Error(failure.detail || `The server could not process this request (HTTP ${resp.status}).`);
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
          if (json.error) {
            const error = new Error(json.error);
            if (json.status === 429) error.code = 'RATE_LIMITED';
            throw error;
          }
          if (json.text) yield json.text;
        } catch (e) {
          if (e.code === 'RATE_LIMITED' || (e.message && e.message.includes('API Error'))) throw e;
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
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [pastClasses, setPastClasses] = useState([]);
  const [practiceRecords, setPracticeRecords] = useState([]);
  const [viewPastClass, setViewPastClass] = useState(null);

  const [started, setStarted] = useState(false);
  const [activeTab, setActiveTab] = useState('classroom');
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('General'); // hint only

  const [selectedFile, setSelectedFile] = useState(null); // { name, documentId }
  const [selectedImage, setSelectedImage] = useState(null); // { name, imageId }
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // detectedLanguage is tracked via detectedLanguageRef (used by TTS, not JSX)

  const [blocks, setBlocks] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [audioNeedsUserGesture, setAudioNeedsUserGesture] = useState(false);
  const [interruption, setInterruption] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [questionsAsked, setQuestionsAsked] = useState([]);
  
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastCompletedBlockId, setLastCompletedBlockId] = useState(null);
  const lastCompletedBlockIdRef = useRef(null);
  const audioQueueRef = useRef(audioQueue);
  const ttsGenerationQueueRef = useRef(Promise.resolve());
  const ttsAbortControllersRef = useRef(new Set());

  const rawBufferRef = useRef('');
  const processedUpToRef = useRef(0);
  const scrollRef = useRef(null);
  const lessonContextRef = useRef(''); 
  const abortControllerRef = useRef(null);
  const currentUtteranceRef = useRef(null);
  const currentAudioBlockIdRef = useRef(null);
  const resumedBlockIdsByEndPosRef = useRef(new Map());
  const currentStreamIdRef = useRef(0);

  useEffect(() => {
    audioQueueRef.current = audioQueue;
  }, [audioQueue]);

  // Validate existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('cognilearn_token');
    if (token) {
      fetch(`${API}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Invalid session');
      })
      .then(data => {
        setUser(data.user);
        setIsAuthenticated(true);
      })
      .catch(() => {
        localStorage.removeItem('cognilearn_token');
        setIsAuthenticated(false);
        setUser(null);
      });
    }
  }, []);

  const clearSpeechCompletely = () => {
    ttsAbortControllersRef.current.forEach(controller => controller.abort());
    ttsAbortControllersRef.current.clear();
    if (currentUtteranceRef.current instanceof Audio) {
      const activeAudio = currentUtteranceRef.current;
      activeAudio.pause();
      activeAudio.removeAttribute('src');
      activeAudio.load();
    }
    currentAudioBlockIdRef.current = null;
    setAudioQueue(prev => {
      prev.forEach(item => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
      return [];
    });
    setIsPlaying(false);
    setIsPaused(false);
    setAudioNeedsUserGesture(false);
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
    if (isPaused || audioNeedsUserGesture) return;

    if (!isPlaying && audioQueue.length > 0) {
      const nextItem = audioQueue[0];
      
      if (nextItem.streamId && nextItem.streamId !== currentStreamIdRef.current) {
        if (nextItem.url) URL.revokeObjectURL(nextItem.url);
        setAudioQueue(prev => prev.filter(item => item.id !== nextItem.id));
        return;
      }

      if (!nextItem.ready) return; 

      if (!nextItem.url) {
        setAudioQueue(prev => prev.filter(item => item.id !== nextItem.id));
        return;
      }

      const audio = new Audio(nextItem.url);
      currentUtteranceRef.current = audio;
      currentAudioBlockIdRef.current = nextItem.blockId || null;

      const releaseCurrentAudio = (errorMessage = '') => {
        if (errorMessage) setAudioError(errorMessage);
        setAudioQueue(prev => prev.filter(item => item.id !== nextItem.id));
        setIsPlaying(false);
        if (currentUtteranceRef.current === audio) {
          currentUtteranceRef.current = null;
          currentAudioBlockIdRef.current = null;
        }
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(nextItem.url);
      };

      audio.onended = () => {
        setAudioError('');
        if (nextItem.blockId) {
          lastCompletedBlockIdRef.current = nextItem.blockId;
          setLastCompletedBlockId(nextItem.blockId);
        }
        releaseCurrentAudio();
      };
      
      audio.onerror = () => {
        releaseCurrentAudio('Audio playback failed. You can continue reading the lesson.');
      };

      audio.play().then(() => {
        setAudioError('');
        setIsPlaying(true);
      }).catch(e => {
        console.error("Audio play failed", e);
        setIsPlaying(false);
        if (e.name === 'NotAllowedError') {
          setAudioNeedsUserGesture(true);
          setAudioError('Select Play Voice to start the lesson narration.');
          return;
        }
        releaseCurrentAudio('Audio playback failed. You can continue reading the lesson.');
      });
    }
  }, [audioQueue, isPlaying, isPaused, audioNeedsUserGesture]);

  const fetchHistory = async () => {
    const token = localStorage.getItem('cognilearn_token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPastClasses(Array.isArray(data) ? data.map(item => ({
          ...item,
          blocks: Array.isArray(item?.blocks) ? item.blocks.filter(block => block && typeof block === 'object' && typeof block.tag === 'string') : [],
          questionsAsked: Array.isArray(item?.questionsAsked) ? item.questionsAsked.filter(question => typeof question === 'string') : [],
          topic: typeof item?.topic === 'string' && item.topic ? item.topic : 'Recorded lesson',
          date: typeof item?.date === 'string' ? item.date : '',
          subject: typeof item?.subject === 'string' ? item.subject : 'General',
          language: typeof item?.language === 'string' ? item.language : 'en'
        })) : []);
      }
    } catch (e) {
      console.error("Failed to fetch history from database", e);
    }
  };

  const deleteHistoryItem = async (e, id) => {
    e.stopPropagation();
    const token = localStorage.getItem('cognilearn_token');
    try {
      await fetch(`${API}/history/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setPastClasses(prev => prev.filter(cls => cls.id !== id));
      if (viewPastClass && viewPastClass.id === id) {
        setViewPastClass(null);
      }
    } catch (e) {
      console.error("Failed to delete history item", e);
    }
  };

  const fetchPracticeRecords = async () => {
    const token = localStorage.getItem('cognilearn_token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/practice`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPracticeRecords(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch practice records from database", e);
    }
  };

  useEffect(() => {
    if (isAuthenticated && !started) {
      fetchHistory();
      fetchPracticeRecords();
    }
  }, [isAuthenticated, started]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks.length, isStreaming]);

  useEffect(() => {
    const ttsControllers = ttsAbortControllersRef.current;
    return () => {
      abortControllerRef.current?.abort();
      if (currentUtteranceRef.current instanceof Audio) {
        currentUtteranceRef.current.pause();
        currentUtteranceRef.current.removeAttribute('src');
      }
      audioQueueRef.current.forEach(item => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
      ttsControllers.forEach(controller => controller.abort());
    };
  }, []);

  useEffect(() => {
    const previewUrl = selectedImage?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [selectedImage?.previewUrl]);

  const playBlockedAudio = () => {
    const audio = currentUtteranceRef.current;
    if (!(audio instanceof Audio)) {
      setAudioNeedsUserGesture(false);
      setIsPaused(false);
      return;
    }
    setAudioError('');
    setIsPaused(false);
    audio.play().then(() => {
      setAudioNeedsUserGesture(false);
      setIsPlaying(true);
    }).catch(error => {
      console.error('Narration could not be resumed', error);
      setIsPlaying(false);
      if (error.name === 'NotAllowedError') {
        setAudioNeedsUserGesture(true);
        setAudioError('Narration is still blocked by the browser. Use Play Voice after interacting with the page.');
      } else {
        setAudioError('Audio playback failed. You can continue reading the lesson.');
      }
    });
  };

  const togglePause = () => {
    setIsPaused(prev => {
      const nextPaused = !prev;
      if (currentUtteranceRef.current instanceof Audio) {
        if (nextPaused) {
          currentUtteranceRef.current.pause();
        } else {
          currentUtteranceRef.current.play().catch(e => {
            console.error("Resume audio play failed", e);
            if (e.name === 'NotAllowedError') {
              setAudioNeedsUserGesture(true);
              setIsPlaying(false);
              setAudioError('Select Play Voice to resume the lesson narration.');
            } else {
              setAudioError('Audio playback failed. You can continue reading the lesson.');
            }
          });
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
      // 2. Remove remaining open/close tag markup, e.g. [POINT], [/POINT], [HEADING], etc.
      .replace(/\[\/?\s*[A-Z1-9_-]{2,20}\s*\]/gi, '')
      // 3. Normalize whitespace
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
      `\\[(${KNOWN_TAGS})\\]([\\s\\S]*?)\\[/\\1\\]`,
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
      const blockId = resumedBlockIdsByEndPosRef.current.get(endPos) || `block-${endPos}`;
      processedUpToRef.current = endPos;

      // Accumulate lesson context (for interrupt re-send)
      if (['EXPLAIN','POINT','MATH','CODE','DIAGRAM','QUESTION'].includes(tag)) {
        lessonContextRef.current += rawContent + '\n';
      }

      if (tag === 'EXPLAIN') {
        const cleanText = stripSpokenText(rawContent);
        if (cleanText && streamId === currentStreamIdRef.current) {
          const id = Date.now() + Math.random();
          newTtsItems.push({ id, blockId, cleanText });
        }
        if (rawContent && streamId === currentStreamIdRef.current) {
          newBlocks.push({ tag: 'EXPLAIN', content: rawContent, id: blockId });
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
        newBlocks.push({ tag, content: safeContent, id: blockId });
      }
    }

    if (newBlocks.length > 0 && streamId === currentStreamIdRef.current) {
      setBlocks(prev => [...prev, ...newBlocks]);
    }

    if (newTtsItems.length > 0 && streamId === currentStreamIdRef.current) {
      const langForTts = detectedLanguageRef.current || 'en';
      newTtsItems.forEach(({ id, blockId, cleanText }) => {
        setAudioQueue(q => [...q, { id, blockId, streamId, ready: false, url: null }]);
        ttsGenerationQueueRef.current = ttsGenerationQueueRef.current.then(async () => {
          if (streamId !== currentStreamIdRef.current) return;
          const controller = new AbortController();
          ttsAbortControllersRef.current.add(controller);
          try {
            const response = await fetch(`${API}/tts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: cleanText, language: langForTts }),
              signal: controller.signal
            });
            if (!response.ok) throw new Error(`TTS request failed (${response.status})`);
            const blob = await response.blob();
            if (!blob.size) throw new Error('TTS returned an empty audio file');
            if (streamId !== currentStreamIdRef.current) return;

            const url = URL.createObjectURL(blob);
            setAudioQueue(q => {
              if (streamId !== currentStreamIdRef.current || !q.some(item => item.id === id)) {
                URL.revokeObjectURL(url);
                return q;
              }
              return q.map(item => item.id === id ? { ...item, ready: true, url } : item);
            });
          } catch (err) {
            if (err.name === 'AbortError' || streamId !== currentStreamIdRef.current) return;
            console.error('TTS fetch failed', err);
            setAudioError('Audio generation failed. You can continue reading the lesson.');
            setAudioQueue(q => q.map(item => item.id === id ? { ...item, ready: true, url: null } : item));
          } finally {
            ttsAbortControllersRef.current.delete(controller);
          }
        });
      });
    }
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setIsUploading(true);

    const token = localStorage.getItem('cognilearn_token');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API}/documents/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.document_id) {
        setSelectedFile({ name: file.name, documentId: data.document_id });
        setSelectedImage(null);
      } else {
        setUploadError(data.detail || 'Failed to upload document');
      }
    } catch (err) {
      setUploadError('Upload failed. Please check network connection.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setIsUploading(true);

    const token = localStorage.getItem('cognilearn_token');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API}/images/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.image_id) {
        setSelectedImage({ name: file.name, imageId: data.image_id, previewUrl: URL.createObjectURL(file) });
        setSelectedFile(null);
      } else {
        setUploadError(data.detail || 'Failed to upload image');
      }
    } catch (err) {
      setUploadError('Image upload failed. Please check connection.');
    } finally {
      setIsUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const startSession = async () => {
    if (!topic.trim() && !selectedFile && !selectedImage) return;
    const streamId = stopCurrentStreamAndSpeech();

    setStreamError('');
    setAudioError('');
    setStarted(true);
    setViewPastClass(null);
    setIsStreaming(true);
    setIsPaused(false);
    setQuestionsAsked([]);
    rawBufferRef.current = '';
    processedUpToRef.current = 0;
    lessonContextRef.current = ''; 
    resumedBlockIdsByEndPosRef.current.clear();
    lastCompletedBlockIdRef.current = null;
    setLastCompletedBlockId(null);
    setBlocks([]);

    const payload = {
      topic: topic.trim(),
      subject,
      document_id: selectedFile?.documentId || null,
      image_id: selectedImage?.imageId || null
    };

    try {
      for await (const chunk of streamEndpoint('teach', payload, abortControllerRef.current.signal)) {
        if (streamId !== currentStreamIdRef.current) break;
        rawBufferRef.current += chunk;
        processRaw(rawBufferRef.current, streamId);
      }
    } catch (e) {
      if (e.name !== 'AbortError' && !abortControllerRef.current?.signal?.aborted) {
        if (e.code === 'RATE_LIMITED') {
          setStreamError(e.message || 'Groq returned HTTP 429. Check its rate limits and retry timing.');
        } else {
          console.error(e);
          setBlocks(prev => [...prev, { tag: 'WARNING', content: `API Error: ${e.message}. Rate limit hit or connection failed. Please wait a minute.`, id: Date.now() }]);
        }
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

    const lessonTagPattern = /\[(HEADING|POINT|EXPLAIN|MATH|CODE|DIAGRAM|QUESTION|WARNING|SUMMARY)\]([\s\S]*?)\[\/\1\]/gi;
    const lessonBlocks = [...rawBufferRef.current.matchAll(lessonTagPattern)].map(match => {
      const endPos = match.index + match[0].length;
      return {
        id: resumedBlockIdsByEndPosRef.current.get(endPos) || `block-${endPos}`,
        tag: match[1].toUpperCase(),
        content: match[2].trim()
      };
    });
    const queuedBlockId = audioQueueRef.current.find(item => item.streamId === currentStreamIdRef.current && item.blockId)?.blockId;
    const isAudioBlockActive = Boolean(currentAudioBlockIdRef.current);
    const interruptedBlockId = currentAudioBlockIdRef.current || queuedBlockId || lastCompletedBlockIdRef.current || lastCompletedBlockId;
    const interruptedIndex = lessonBlocks.findIndex(block => block.id === interruptedBlockId);
    const remainingBlocks = interruptedIndex >= 0
      ? lessonBlocks.slice(interruptedIndex + (isAudioBlockActive || queuedBlockId ? 0 : 1))
      : lessonBlocks;

    // If playback stopped mid-explanation, estimate the spoken position within that
    // block and send only its unspoken tail before the remaining lesson blocks.
    if (isAudioBlockActive && remainingBlocks[0]?.id === currentAudioBlockIdRef.current) {
      const activeAudio = currentUtteranceRef.current;
      const progress = activeAudio instanceof Audio && Number.isFinite(activeAudio.duration) && activeAudio.duration > 0
        ? Math.min(1, Math.max(0, activeAudio.currentTime / activeAudio.duration))
        : 0;
      const spokenText = stripSpokenText(remainingBlocks[0].content);
      let spokenChars = Math.floor(spokenText.length * progress);
      while (spokenChars < spokenText.length && spokenChars > 0 && !/\s/.test(spokenText[spokenChars])) spokenChars += 1;
      const unspokenTail = spokenText.slice(spokenChars).trim();
      if (unspokenTail) remainingBlocks[0] = { ...remainingBlocks[0], content: unspokenTail };
      else remainingBlocks.shift();
    }

    const lastCompletedId = interruptedBlockId || null;
    const streamId = stopCurrentStreamAndSpeech();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    setStreamError('');
    setAudioError('');
    setIsStreaming(true);
    setIsPaused(false);
    setQuestionsAsked(prev => [...prev, question]);
    setInterruption('');
    
    const history = [
      { role: "user", content: `Teach me about: ${topic}` },
      { role: "assistant", content: rawBufferRef.current }
    ];
    try {
      const token = localStorage.getItem('cognilearn_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API}/interrupt`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic,
          user_query: question,
          history,
          subject,
          last_completed_block_id: lastCompletedId,
          remaining_blocks: remainingBlocks
        }),
        signal: abortControllerRef.current.signal
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        const requestError = new Error(failure.detail || `The server could not resume the lesson (HTTP ${response.status}).`);
        if (response.status === 429) requestError.code = 'RATE_LIMITED';
        throw requestError;
      }
      const result = await response.json();
      if (streamId !== currentStreamIdRef.current) return;
      if (result.status !== 'success' || !Array.isArray(result.blocks)) {
        throw new Error('The tutor returned an invalid lesson continuation.');
      }

      // BUG 2+3+7 FIX: Backend now returns structured {id, tag, content} blocks.
      // Each block must be injected with its CORRECT tag — not all wrapped as [EXPLAIN].
      // MATH blocks must go through [MATH]...[/MATH] so processRaw renders them visually.
      // Only EXPLAIN blocks get sent to TTS by processRaw.
      const responseBlocks = result.blocks.filter(
        block => block && block.id && block.tag && typeof block.content === 'string'
      );

      // BUG 5 FIX: Fall back to legacy {id, text} format if backend is old
      const legacyBlocks = result.blocks.filter(
        block => block && block.id && typeof block.text === 'string' && block.text.trim() &&
                 !block.tag  // only use legacy format if tag field is missing
      );

      if (responseBlocks.length === 0 && legacyBlocks.length === 0) {
        throw new Error('The tutor returned no spoken continuation.');
      }

      // Build tagged strings for rawBufferRef injection.
      // Each block uses its own tag — preserving the MATH/EXPLAIN distinction (BUG 3 FIX).
      let taggedResponse = '';
      let blockEnd = rawBufferRef.current.length;

      if (responseBlocks.length > 0) {
        // New structured format from updated backend
        responseBlocks.forEach(block => {
          const tag = block.tag.toUpperCase();
          const taggedStr = `[${tag}]${block.content}[/${tag}]`;
          taggedResponse += taggedStr;
          blockEnd += taggedStr.length;
          // BUG 1 FIX: IDs come from backend as resume_<ts>_<uuid>_<idx> — globally unique
          resumedBlockIdsByEndPosRef.current.set(blockEnd, block.id);
        });
      } else {
        // Legacy fallback: wrap all as EXPLAIN (old backend behaviour)
        legacyBlocks.forEach((block, index) => {
          const safeId = block.id || `resumed_${Date.now()}_${index}`;
          const taggedStr = `[EXPLAIN]${block.text.trim()}[/EXPLAIN]`;
          taggedResponse += taggedStr;
          blockEnd += taggedStr.length;
          resumedBlockIdsByEndPosRef.current.set(blockEnd, safeId);
        });
      }

      rawBufferRef.current = rawBufferRef.current + taggedResponse;
      processRaw(rawBufferRef.current, streamId);
    } catch (e) {
      if (e.name !== 'AbortError' && !abortControllerRef.current?.signal?.aborted) {
        if (e.code === 'RATE_LIMITED' || /HTTP 429/.test(e.message)) {
          setStreamError(e.message || 'Groq returned HTTP 429. Check its rate limits and retry timing.');
        } else {
          console.error(e);
          setBlocks(prev => [...prev, { tag: 'WARNING', content: `API Error: ${e.message}. Rate limit hit or connection failed. Please wait a minute.`, id: Date.now() }]);
        }
      }
    } finally {
      if (streamId === currentStreamIdRef.current) {
        setIsStreaming(false);
      }
    }
  };

  const exitToLanding = async () => {
    stopCurrentStreamAndSpeech();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    // End the classroom immediately. Do not leave the old stream's error or
    // lesson state visible while the optional history save is in flight.
    const lessonTitle = topic || selectedFile?.name || selectedImage?.name || "Class Session";
    const shouldSaveClass = Boolean(lessonTitle && blocks.length > 0);
    const token = localStorage.getItem('cognilearn_token');
    const newClass = shouldSaveClass ? {
      id: Date.now().toString(),
      topic: lessonTitle,
      blocks,
      questionsAsked,
      date: new Date().toLocaleString(),
      subject,
      language: detectedLanguageRef.current || 'en'
    } : null;

    setStarted(false);
    setIsStreaming(false);
    setIsPaused(false);
    setTopic('');
    setSelectedFile(null);
    setSelectedImage(null);
    setUploadError('');
    setStreamError('');
    setAudioError('');
    setAudioNeedsUserGesture(false);
    setBlocks([]);
    setInterruption('');
    setQuestionsAsked([]);
    setLastCompletedBlockId(null);
    lastCompletedBlockIdRef.current = null;
    resumedBlockIdsByEndPosRef.current.clear();
    rawBufferRef.current = '';
    processedUpToRef.current = 0;
    lessonContextRef.current = '';

    if (newClass) {
      try {
        const response = await fetch(`${API}/history`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(newClass)
        });
        if (!response.ok) throw new Error(`History save failed (${response.status})`);
        setPastClasses(prev => [newClass, ...prev.filter(item => item.id !== newClass.id)]);
      } catch (e) {
        console.error("Failed to save class to database", e);
      }
    }
  };

  const handleLogout = async () => {
    if (started) {
      exitToLanding();
    }
    clearSpeechCompletely();
    setViewPastClass(null);
    const token = localStorage.getItem('cognilearn_token');
    if (token) {
      try {
        await fetch(`${API}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (_) {}
    }
    localStorage.removeItem('cognilearn_token');
    setIsAuthenticated(false);
    setUser(null);
    setPastClasses([]);
    setPracticeRecords([]);
    setPasswordInput('');
    setConfirmPasswordInput('');
    setAuthError('');
  };

  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');
    if (!emailInput.trim() || !passwordInput) {
      setAuthError('Please enter email and password.');
      return;
    }
    setIsAuthLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim(), password: passwordInput })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem('cognilearn_token', data.access_token);
        setUser(data.user);
        setIsAuthenticated(true);
        setAuthError('');
        setPasswordInput('');
      } else {
        setAuthError(data.detail || 'Invalid email or password');
      }
    } catch (err) {
      setAuthError('Unable to connect to server');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');
    if (!nameInput.trim() || !emailInput.trim() || !passwordInput) {
      setAuthError('All fields are required.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Passwords do not match.');
      return;
    }
    if (passwordInput.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    setIsAuthLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.trim(),
          email: emailInput.trim(),
          password: passwordInput
        })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem('cognilearn_token', data.access_token);
        setUser(data.user);
        setIsAuthenticated(true);
        setAuthError('');
        setPasswordInput('');
        setConfirmPasswordInput('');
      } else {
        setAuthError(data.detail || 'Registration failed');
      }
    } catch (err) {
      setAuthError('Unable to connect to server');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setEmailInput('demo@cognilearn.ai');
    setPasswordInput('demo123');
    setIsAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@cognilearn.ai', password: 'demo123' })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem('cognilearn_token', data.access_token);
        setUser(data.user);
        setIsAuthenticated(true);
        setAuthError('');
      } else {
        setAuthError('Demo account login failed');
      }
    } catch (err) {
      setAuthError('Unable to connect to server');
    } finally {
      setIsAuthLoading(false);
    }
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
          <div className={`login-container ${authMode === 'register' ? 'register-container' : ''}`}>
            {authMode === 'login' ? (
              <form onSubmit={handleLoginSubmit}>
                <h2 className="welcome-header">Welcome Back</h2>
                <p className="welcome-subtitle">Sign in to access your digital chalkboard and learning history.</p>

                {authError && (
                  <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px', padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid #ef4444' }}>
                    {authError}
                  </div>
                )}
                
                <div className="input-field-group">
                  <label>EMAIL ADDRESS</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
                
                <div className="input-field-group">
                  <label>PASSWORD</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="signin-btn-container"
                  disabled={isAuthLoading}
                  style={{ width: '100%', border: 'none', cursor: isAuthLoading ? 'wait' : 'pointer' }}
                >
                  {isAuthLoading ? 'SIGNING IN...' : 'SIGN IN'}
                </button>

                <div className="demo-access-text" onClick={handleDemoLogin} style={{ cursor: 'pointer' }}>
                  Access Demo Account
                </div>

                <div
                  className="create-account-text"
                  onClick={() => { setAuthMode('register'); setAuthError(''); }}
                  style={{ cursor: 'pointer' }}
                >
                  Need an account? Create a new account
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit}>
                <h2 className="welcome-header">Create Account</h2>
                <p className="welcome-subtitle">Sign up to start your personalized AI tutoring experience.</p>

                {authError && (
                  <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px', padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid #ef4444' }}>
                    {authError}
                  </div>
                )}
                
                <div className="input-field-group">
                  <label>FULL NAME</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div className="input-field-group">
                  <label>EMAIL ADDRESS</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
                
                <div className="input-field-group">
                  <label>PASSWORD</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder="Create a password (min 6 characters)"
                    required
                  />
                </div>

                <div className="input-field-group">
                  <label>CONFIRM PASSWORD</label>
                  <input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={e => setConfirmPasswordInput(e.target.value)}
                    placeholder="Confirm your password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="signin-btn-container"
                  disabled={isAuthLoading}
                  style={{ width: '100%', border: 'none', cursor: isAuthLoading ? 'wait' : 'pointer' }}
                >
                  {isAuthLoading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
                </button>

                <div
                  className="create-account-text"
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  style={{ cursor: 'pointer' }}
                >
                  Already have an account? Sign In
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Exclusive Admin Routing ───────────────────────────────────────────────────
  // If the logged-in account has role === 'admin', show ONLY the Admin Dashboard.
  // The admin does NOT see student teaching controls, classroom studio, or practice.
  if (user?.role === 'admin') {
    return (
      <AdminDashboard
        user={user}
        token={localStorage.getItem('cognilearn_token')}
        onLogout={handleLogout}
      />
    );
  }

  const showHeader = !started || viewPastClass;

  const renderBlock = (step, includeExplanation = false) => {
    // Final-defence sanitiser: strip any leftover tag text that
    // somehow survived the processRaw pass before it hits the DOM.
    const safe = (str) => stripAllTags(str);
    const safeMultiline = (str) => typeof str === 'string'
      ? str.replace(/\[\/?\s*[A-Z1-9_-]{2,20}\s*\]/gi, '').trim()
      : '';

    switch(step.tag) {
      case 'HEADING': return <h1 className="rendered-heading">{safe(step.content)}</h1>;
      case 'POINT': return (
        <div className="rendered-point-row">
          <span className="point-bullet-marker">•</span>
          <span className="point-text-content">{safe(step.content)}</span>
        </div>
      );
      case 'EXPLAIN': return includeExplanation
        ? <div className="recorded-explanation"><strong>Explanation</strong><div>{safeMultiline(step.content)}</div></div>
        : null;
      case 'MATH': {
        try {
          return (
            <div className="rendered-math-container">
              <BlockMath math={step.content} />
            </div>
          );
        } catch (e) {
          return <div className="rendered-warning">⚠️ Math rendering error</div>;
        }
      }
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
      case 'QUIZ': return null; // Quiz blocks handled separately by PracticeQuizzesPage
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
                backgroundColor: activeTab === 'classroom' ? '#f59e0b' : 'transparent',
                color: activeTab === 'classroom' ? '#111111' : '#9ca3af',
                border: activeTab === 'classroom' ? '1px solid #f59e0b' : '1px solid #374151',
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
                backgroundColor: activeTab === 'practice' ? '#f59e0b' : 'transparent',
                color: activeTab === 'practice' ? '#111111' : '#9ca3af',
                border: activeTab === 'practice' ? '1px solid #f59e0b' : '1px solid #374151',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Practice & Quizzes
            </button>
            {user?.role === 'admin' && (
              <button 
                onClick={() => setActiveTab('admin')}
                style={{
                  backgroundColor: activeTab === 'admin' ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)',
                  color: activeTab === 'admin' ? '#111111' : '#f59e0b',
                  border: '1px solid #f59e0b',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🛡️</span> Admin Dashboard
              </button>
            )}
          </div>

          <div className="user-profile-area" style={{ position: 'relative' }}>
            <UserProfileDropdown
              user={user}
              pastClasses={pastClasses}
              practiceRecords={practiceRecords}
              onLogout={handleLogout}
              onRefresh={() => {
                fetchHistory();
                fetchPracticeRecords();
              }}
            />
          </div>
        </header>
      )}

      <div className="app-workspace">
        {activeTab === 'admin' && (
          <div style={{ flex: 1, overflowY: 'auto', width: '100%' }}>
            <AdminDashboard
              user={user}
              token={localStorage.getItem('cognilearn_token')}
              onLogout={handleLogout}
              onNavigateClassroom={() => setActiveTab('classroom')}
            />
          </div>
        )}

        {activeTab === 'practice' && !started && !viewPastClass ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <PracticeQuizzesPage
              activeTopic={topic}
              activeSubject={subject}
              activeLanguage={detectedLanguageRef.current || 'English'}
              documentId={selectedFile?.documentId}
              onStartLesson={(newTopic, newSubject) => {
                setTopic(newTopic);
                if (newSubject) setSubject(newSubject);
                setActiveTab('classroom');
                startSession();
              }}
              onReturnDashboard={() => setActiveTab('classroom')}
              onPracticeCompleted={() => fetchPracticeRecords()}
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
                  <div className="meta-card-label" style={{marginTop: '12px'}}>SUBJECT · LANGUAGE</div>
                  <div className="meta-card-value" style={{fontSize: '13px', color: '#a5c7b0'}}>{viewPastClass.subject || 'General'} · {viewPastClass.language || 'en'}</div>
                  <div className="meta-card-label" style={{marginTop: '12px'}}>DATE RECORDED</div>
                  <div className="meta-card-value" style={{fontSize: '13px', color: '#a5c7b0'}}>{viewPastClass.date}</div>
                </div>

                {(viewPastClass.questionsAsked || []).length > 0 && (
                  <div className="status-meta-card">
                    <div className="meta-card-label">QUESTIONS ASKED:</div>
                    <div className="questions-history-log">
                      {(viewPastClass.questionsAsked || []).map((q, idx) => (
                        <div key={idx} className="logged-question-bubble">"{q}"</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="classroom-main-board" ref={scrollRef}>
              <div className="board-scrollable-container">
                {(Array.isArray(viewPastClass.blocks) ? viewPastClass.blocks : []).map((step, index) => (
                  <div key={step.id || index} className="board-render-element">
                    {renderBlock(step, true)}
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
              <div className="landing-card" style={{ maxWidth: '640px', width: '92%' }}>
                <h1 className="main-title" style={{ marginBottom: '18px' }}>What would you like to learn?</h1>
                
                <div style={{ marginBottom: '14px' }}>
                  <input
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="Enter a topic or question..."
                    onKeyPress={e => e.key === 'Enter' && startSession()}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 230, 153, 0.3)',
                      color: '#ffffff',
                      fontSize: '15px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,.docx,.pptx,.txt,.md"
                    style={{ display: 'none' }}
                  />
                  <input
                    type="file"
                    ref={imageInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 230, 153, 0.08)',
                      border: '1px solid rgba(255, 230, 153, 0.3)',
                      color: '#ffe699',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: isUploading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>📄</span> {isUploading ? 'Uploading...' : 'Upload File'}
                  </button>

                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploading}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 230, 153, 0.08)',
                      border: '1px solid rgba(255, 230, 153, 0.3)',
                      color: '#ffe699',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: isUploading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>🖼️</span> {isUploading ? 'Uploading...' : 'Upload Image'}
                  </button>
                </div>

                {(selectedFile || selectedImage) && (
                  <div style={{
                    margin: '12px 0 16px 0',
                    padding: '10px 14px',
                    backgroundColor: 'rgba(34, 197, 94, 0.12)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: '#4ade80',
                    fontSize: '13px'
                  }}>
                    <span>
                      ✓ {selectedFile ? selectedFile.name : selectedImage.name}
                    </span>
                    <button
                      onClick={() => { setSelectedFile(null); setSelectedImage(null); }}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#f87171',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: '2px 8px'
                      }}
                    >
                      [Remove]
                    </button>
                  </div>
                )}

                {uploadError && (
                  <div style={{
                    color: '#f87171',
                    fontSize: '12px',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid #ef4444'
                  }}>
                    {uploadError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <select
                      className="subject-dropdown"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                    >
                      {SUBJECT_SUGGESTIONS.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={startSession}
                    disabled={!topic.trim() && !selectedFile && !selectedImage}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: (!topic.trim() && !selectedFile && !selectedImage) ? '#374151' : '#f59e0b',
                      color: (!topic.trim() && !selectedFile && !selectedImage) ? '#9ca3af' : '#111111',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: (!topic.trim() && !selectedFile && !selectedImage) ? 'not-allowed' : 'pointer',
                      boxShadow: (!topic.trim() && !selectedFile && !selectedImage) ? 'none' : '0 4px 12px rgba(245, 158, 11, 0.3)'
                    }}
                  >
                    Start Teaching
                  </button>
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

              {streamError && (
                <div role="alert" style={{ margin: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255, 193, 7, 0.12)', color: '#ffe6a1' }}>
                  {streamError}
                </div>
              )}
              {audioError && (
                <div role="status" style={{ margin: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255, 193, 7, 0.12)', color: '#ffe6a1' }}>
                  {audioError}
                </div>
              )}

              <div className="sidebar-bottom-controls">
                <button className="voice-toggle-btn" onClick={audioNeedsUserGesture ? playBlockedAudio : togglePause}>
                  {audioNeedsUserGesture ? '▶ Play Voice' : isPaused ? '▶ Resume Voice' : '⏸ Pause Voice'}
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
                {selectedImage?.previewUrl && (
                  <figure className="uploaded-image-context">
                    <img src={selectedImage.previewUrl} alt={`Uploaded lesson image: ${selectedImage.name}`} />
                    <figcaption>Uploaded image · {selectedImage.name}</figcaption>
                  </figure>
                )}
                <AnimatePresence>
                  {blocks.map((step) => (
                    <motion.div 
                      key={step.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
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
