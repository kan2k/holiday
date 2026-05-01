import { useState } from 'react';
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

function AgentList({ agents, selected, onSelect, onDeleteAgent }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex-1 overflow-y-auto py-1"
    >
      {agents.map(agent => (
        <motion.div
          key={agent.id}
          variants={item}
          className={`relative group ${
            selected === agent.id ? 'bg-terminal-accent/5' : 'hover:bg-terminal-card'
          }`}
        >
          <motion.button
            onClick={() => onSelect(agent.id)}
            whileHover={{ backgroundColor: 'rgba(0,212,170,0.04)' }}
            whileTap={{ scale: 0.98 }}
            className="w-full text-left px-4 py-3 pr-11 transition-colors cursor-pointer"
          >
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

          {onDeleteAgent && (
            <button
              type="button"
              title="Delete agent"
              aria-label={`Delete agent ${agent.id}`}
              className="absolute right-2 top-2 z-10 p-1.5 rounded border border-transparent text-terminal-text-dim
                         hover:text-terminal-short hover:border-terminal-short/30 hover:bg-terminal-short/5
                         opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={(e) => onDeleteAgent(agent.id, e)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
                <path d="M5.5 5.5v6h1v-6h-1zm2 0v6h1v-6h-1zm2 0v6h1v-6h-1z" />
                <path d="M2 3v1h1l1 9.5a1 1 0 0 0 1 .5h6a1 1 0 0 0 1-.5L13 4h1V3H2zm2.18 1h7.64l-.85 8H5.03l-.85-8zM6 1.5V2h4v-.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5z" />
              </svg>
            </button>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

function BacktestList({ backtests, selected, onSelect }) {
  if (backtests.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 text-center">
        <div className="text-[10px] font-mono text-terminal-text-dim leading-relaxed">
          No backtests yet.<br />
          Run one with:<br />
          <span className="text-terminal-accent">node scripts/backtest.js --agent &lt;id&gt;</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex-1 overflow-y-auto py-1"
    >
      {backtests.map(bt => {
        const isProfit = bt.totalPnl >= 0;
        const key = bt.file;
        return (
          <motion.button
            key={key}
            variants={item}
            onClick={() => onSelect(key)}
            whileHover={{ backgroundColor: 'rgba(0,212,170,0.04)' }}
            whileTap={{ scale: 0.98 }}
            className={`w-full text-left px-4 py-3 transition-colors relative cursor-pointer ${
              selected === key ? 'bg-terminal-accent/5' : 'hover:bg-terminal-card'
            }`}
          >
            {selected === key && (
              <motion.div
                layoutId="activeBacktest"
                className="absolute left-0 top-0 bottom-0 w-[2px] bg-terminal-accent"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}

            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${
                selected === key ? 'bg-terminal-accent' : 'bg-terminal-border-light'
              }`} />
              <span className={`font-mono text-xs font-medium tracking-wide ${
                selected === key ? 'text-terminal-accent' : 'text-terminal-text'
              }`}>
                {bt.config?.agentId || 'unknown'}
              </span>
            </div>

            <div className="mt-1.5 ml-3.5 flex items-center gap-2">
              <span className="text-[9px] font-mono text-terminal-text-dim">
                {bt.config?.from} → {bt.config?.to}
              </span>
            </div>

            <div className="mt-1 ml-3.5 flex items-center gap-3">
              <span className={`text-[10px] font-mono font-bold ${
                isProfit ? 'text-terminal-long' : 'text-terminal-short'
              }`}>
                {isProfit ? '+' : ''}{bt.pnlPercent}%
              </span>
              <span className="text-[9px] font-mono text-terminal-text-dim">
                {bt.totalTrades} trades
              </span>
              <span className="text-[9px] font-mono text-terminal-text-dim">
                {bt.leverage}x
              </span>
              {bt.liquidated && (
                <span className="text-[8px] font-mono px-1 rounded bg-terminal-short/10 text-terminal-short">
                  LIQ
                </span>
              )}
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

export default function AgentSidebar({
  agents, selected, onSelect, onDeleteAgent, onAddAgent,
  backtests = [], selectedBacktest, onSelectBacktest,
  activeTab = 'agents', onTabChange
}) {
  return (
    <div className="h-full flex flex-col bg-terminal-surface">
      {/* Tab Header */}
      <div className="flex border-b border-terminal-border">
        <button
          onClick={() => onTabChange?.('agents')}
          className={`flex-1 px-4 py-3 text-[10px] font-mono tracking-[0.2em] uppercase transition-colors cursor-pointer ${
            activeTab === 'agents'
              ? 'text-terminal-accent border-b-2 border-terminal-accent'
              : 'text-terminal-text-dim hover:text-terminal-text'
          }`}
        >
          Agents
        </button>
        <button
          onClick={() => onTabChange?.('backtests')}
          className={`flex-1 px-4 py-3 text-[10px] font-mono tracking-[0.2em] uppercase transition-colors cursor-pointer relative ${
            activeTab === 'backtests'
              ? 'text-terminal-accent border-b-2 border-terminal-accent'
              : 'text-terminal-text-dim hover:text-terminal-text'
          }`}
        >
          Backtests
          {backtests.length > 0 && (
            <span className="ml-1 text-[8px] bg-terminal-accent/15 text-terminal-accent px-1 rounded">
              {backtests.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'agents' ? (
        <>
          <AgentList agents={agents} selected={selected} onSelect={onSelect} onDeleteAgent={onDeleteAgent} />
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
        </>
      ) : (
        <BacktestList
          backtests={backtests}
          selected={selectedBacktest}
          onSelect={onSelectBacktest}
        />
      )}
    </div>
  );
}
