import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function StatusBar({ agentCount, selectedAgent }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-8 flex items-center px-4 border-b border-terminal-border bg-terminal-bg text-[11px] font-mono tracking-wider">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2"
      >
        <span className="text-terminal-accent font-bold">HOLIDAY</span>
        <span className="text-terminal-text-dim">│</span>
        <span className="text-terminal-text-dim">TERMINAL</span>
      </motion.div>

      <div className="flex-1" />

      <div className="flex items-center gap-4 text-terminal-text-dim">
        {selectedAgent && (
          <span>
            <span className="text-terminal-text-dim">AGENT:</span>{' '}
            <span className="text-terminal-accent">{selectedAgent.id?.toUpperCase()}</span>
            <span className="text-terminal-text-dim ml-2">│</span>
            <span className="ml-2">MODE:</span>{' '}
            <span className={selectedAgent.mode === 'live' ? 'text-terminal-short' : 'text-terminal-amber'}>
              {selectedAgent.mode?.toUpperCase()}
            </span>
            <span className="text-terminal-text-dim ml-2">│</span>
            <span className="ml-2">LEV:</span>{' '}
            <span className="text-terminal-text">{selectedAgent.leverage}x</span>
          </span>
        )}
        <span className="text-terminal-text-dim">│</span>
        <span>{agentCount} AGENT{agentCount !== 1 ? 'S' : ''}</span>
        <span className="text-terminal-text-dim">│</span>
        <span className="text-terminal-accent tabular-nums">
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </span>
        <div className="w-2 h-2 rounded-full bg-terminal-accent animate-pulse" />
      </div>
    </div>
  );
}
