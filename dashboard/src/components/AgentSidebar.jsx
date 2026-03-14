import { motion } from 'framer-motion';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.3 }
  }
};

const item = {
  hidden: { x: -20, opacity: 0 },
  show: { x: 0, opacity: 1, transition: { ease: [0.22, 1, 0.36, 1], duration: 0.5 } }
};

export default function AgentSidebar({ agents, selected, onSelect, onAddAgent }) {
  return (
    <div className="h-full flex flex-col bg-terminal-surface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-terminal-border">
        <span className="text-[10px] font-mono tracking-[0.2em] text-terminal-text-dim uppercase">
          Agents
        </span>
      </div>

      {/* Agent list */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex-1 overflow-y-auto py-1"
      >
        {agents.map(agent => (
          <motion.button
            key={agent.id}
            variants={item}
            onClick={() => onSelect(agent.id)}
            whileHover={{ backgroundColor: 'rgba(0,212,170,0.04)' }}
            whileTap={{ scale: 0.98 }}
            className={`w-full text-left px-4 py-3 transition-colors relative group cursor-pointer ${
              selected === agent.id
                ? 'bg-terminal-accent/5'
                : 'hover:bg-terminal-card'
            }`}
          >
            {/* Active indicator */}
            {selected === agent.id && (
              <motion.div
                layoutId="activeAgent"
                className="absolute left-0 top-0 bottom-0 w-[2px] bg-terminal-accent"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}

            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${
                selected === agent.id ? 'bg-terminal-accent' : 'bg-terminal-border-light'
              }`} />
              <span className={`font-mono text-xs font-medium tracking-wide ${
                selected === agent.id ? 'text-terminal-accent' : 'text-terminal-text'
              }`}>
                {agent.id}
              </span>
            </div>

            <div className="mt-1.5 ml-3.5 flex flex-wrap gap-1">
              {agent.pairs.slice(0, 4).map(pair => (
                <span
                  key={pair}
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-terminal-bg text-terminal-text-dim"
                >
                  {pair}
                </span>
              ))}
              {agent.pairs.length > 4 && (
                <span className="text-[9px] font-mono text-terminal-text-dim">
                  +{agent.pairs.length - 4}
                </span>
              )}
            </div>

            <div className="mt-1 ml-3.5 flex items-center gap-2">
              <span className="text-[9px] font-mono text-terminal-text-dim">
                {agent.leverage}x
              </span>
              <span className={`text-[9px] font-mono px-1 rounded ${
                agent.mode === 'live'
                  ? 'text-terminal-short bg-terminal-short/10'
                  : 'text-terminal-amber bg-terminal-amber/10'
              }`}>
                {agent.mode}
              </span>
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* Add button */}
      <div className="p-3 border-t border-terminal-border">
        <motion.button
          whileHover={{ scale: 1.02, backgroundColor: 'rgba(0,212,170,0.12)' }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-2 border border-dashed border-terminal-border-light rounded text-terminal-text-dim 
                     text-[10px] font-mono tracking-wider hover:border-terminal-accent hover:text-terminal-accent
                     transition-colors cursor-pointer"
          onClick={() => onAddAgent?.()}
        >
          + NEW AGENT
        </motion.button>
      </div>
    </div>
  );
}
