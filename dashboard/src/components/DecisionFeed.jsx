import { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ACTION_CONFIG = {
  LONG: { color: 'text-terminal-long', bg: 'bg-terminal-long/10', icon: '▲' },
  BUY: { color: 'text-terminal-long', bg: 'bg-terminal-long/10', icon: '▲' },
  SHORT: { color: 'text-terminal-short', bg: 'bg-terminal-short/10', icon: '▼' },
  SELL: { color: 'text-terminal-short', bg: 'bg-terminal-short/10', icon: '▼' },
  HOLD: { color: 'text-terminal-hold', bg: 'bg-terminal-hold/10', icon: '◆' },
  CLOSE: { color: 'text-blue-400', bg: 'bg-blue-400/10', icon: '■' },
};

function formatTimeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: {
      delay: i * 0.04,
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1]
    }
  }),
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } }
};

export default function DecisionFeed({ decisions, total, loading, onLoadMore, hasMore }) {
  const scrollRef = useRef(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      onLoadMore();
    }
  }, [loading, hasMore, onLoadMore]);

  return (
    <div className="h-full flex flex-col bg-terminal-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-terminal-border flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-[0.2em] text-terminal-text-dim uppercase">
          Decisions
        </span>
        <span className="text-[10px] font-mono text-terminal-text-dim">
          {total} total
        </span>
      </div>

      {/* Feed */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <AnimatePresence mode="popLayout">
          {decisions.map((d, i) => {
            const config = ACTION_CONFIG[d.action] || ACTION_CONFIG.HOLD;
            return (
              <motion.div
                key={d.file || `${d.timestamp}-${i}`}
                variants={itemVariants}
                custom={i}
                initial="hidden"
                animate="visible"
                exit="exit"
                layout
                className="px-4 py-3 border-b border-terminal-border/50 hover:bg-terminal-card/50 transition-colors group"
              >
                {/* Top row: action + symbol + time */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${config.color} ${config.bg}`}>
                      {config.icon} {d.action}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-terminal-text">
                      {d.symbol}
                    </span>
                    {d.size != null && (
                      <span className="font-mono text-[9px] text-terminal-text-dim px-1 py-0.5 rounded bg-terminal-bg">
                        {d.size}%
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[9px] text-terminal-text-dim tabular-nums">
                    {formatTimeAgo(d.timestamp)}
                  </span>
                </div>

                {/* Reason */}
                {d.reason && (
                  <p className="text-[10px] text-terminal-text-dim leading-relaxed line-clamp-2 group-hover:text-terminal-text transition-colors">
                    {d.reason}
                  </p>
                )}

                {/* Time bar visualization */}
                <div className="mt-2 h-[1px] bg-terminal-border rounded overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.8, delay: i * 0.05, ease: 'easeOut' }}
                    className="h-full rounded"
                    style={{ backgroundColor: ACTION_CONFIG[d.action]?.color === 'text-terminal-long' ? '#00c853' : ACTION_CONFIG[d.action]?.color === 'text-terminal-short' ? '#ff1744' : '#ff9800', opacity: 0.3 }}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Load more indicator */}
        {loading && (
          <div className="flex items-center justify-center py-4 gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-3 h-3 border border-terminal-accent border-t-transparent rounded-full"
            />
            <span className="text-[9px] font-mono text-terminal-text-dim">Loading...</span>
          </div>
        )}

        {!loading && hasMore && (
          <button
            onClick={onLoadMore}
            className="w-full py-3 text-[9px] font-mono text-terminal-text-dim hover:text-terminal-accent transition-colors cursor-pointer"
          >
            Load more decisions...
          </button>
        )}

        {!loading && !hasMore && decisions.length > 0 && (
          <div className="py-4 text-center text-[9px] font-mono text-terminal-text-dim">
            End of history
          </div>
        )}

        {!loading && decisions.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <span className="text-[10px] font-mono text-terminal-text-dim">No decisions yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
