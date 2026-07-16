import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

const Whiteboard = ({ allSteps, currentStepIndex }) => {
  const scrollRef = useRef(null);

  const history = allSteps.slice(0, currentStepIndex + 1);
  
  // Find the latest image step
  const activeImageStep = [...history].reverse().find(step => step.visual_type === 'image');
  
  // Collect text/math steps
  const noteSteps = history.filter(step => step.visual_type !== 'image');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [noteSteps.length]);

  // --- NEW: WEB SEARCH IMAGE FUNCTION ---
  // This uses a standard thumbnail search to "pick from the web"
  // It effectively behaves like a Google Image Search result.
  const getWebImage = (query) => {
    const cleanQuery = encodeURIComponent(query.trim());
    // Using a reliable search thumbnail mirror (works like Google Images)
    return `https://tse2.mm.bing.net/th?q=${cleanQuery}&w=800&h=600&c=7&rs=1&p=0`;
  };

  return (
    // Dynamic Class: 'split-mode' if image exists, 'full-mode' if not
    <div className={`smart-board ${activeImageStep ? 'split-mode' : 'full-mode'}`}>
      
      {/* LEFT SIDE: DIAGRAM (Only visible if an image exists) */}
      <AnimatePresence>
        {activeImageStep && (
          <motion.div 
            className="diagram-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '50%', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              key={activeImageStep.content}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="sticky-image"
            >
              <img 
                src={getWebImage(activeImageStep.content)} 
                alt="Diagram" 
                onError={(e) => e.target.style.display='none'} // Hide if broken
              />
              <p className="caption">🔍 Searching Web: "{activeImageStep.content}"</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RIGHT SIDE: NOTES (Takes 100% if no image, 50% if image exists) */}
      <div className="notes-panel" ref={scrollRef}>
        <div className="notes-list">
          {noteSteps.map((step, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="note-item"
            >
              {step.visual_type === 'math' ? (
                <div className="math-block"><BlockMath math={step.content} /></div>
              ) : (
                <div className="text-block">
                  <span className="bullet">•</span>
                  <h2>{step.content}</h2>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
      
    </div>
  );
};

export default Whiteboard;