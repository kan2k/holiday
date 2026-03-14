import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function EquityChart({ history, startingBalance }) {
  if (!history || history.length < 2) return null;

  const values = history.map(h => h.equity);
  const min = Math.min(...values) * 0.98;
  const max = Math.max(...values) * 1.02;
  const range = max - min || 1;

  const w = 100;
  const h = 60;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  const isProfit = values[values.length - 1] >= startingBalance;

  return (
    <div className="mt-3 px-1">
      <div className="text-[9px] font-mono text-terminal-text-dim mb-1 tracking-wider">EQUITY CURVE</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none">
        <line
          x1="0" y1={h - ((startingBalance - min) / range) * h}
          x2={w} y2={h - ((startingBalance - min) / range) * h}
          stroke="rgba(255,255,255,0.08)" strokeDasharray="2,2"
        />
        <polyline
          fill="none"
          stroke={isProfit ? '#00d4aa' : '#ef4444'}
          strokeWidth="1.5"
          points={points}
        />
      </svg>
      <div className="flex justify-between text-[8px] font-mono text-terminal-text-dim mt-0.5">
        <span>{history[0]?.day}</span>
        <span>{history[history.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function TradeRow({ trade, idx }) {
  const isWin = (trade.pnl || 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.03 }}
      className="px-3 py-2 border-b border-terminal-border/50 text-[10px] font-mono"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
            trade.action === 'LONG'
              ? 'bg-terminal-long/15 text-terminal-long'
              : 'bg-terminal-short/15 text-terminal-short'
          }`}>
            {trade.action}
          </span>
          <span className="text-terminal-text font-medium">{trade.symbol}</span>
        </div>
        <span className={`font-medium ${isWin ? 'text-terminal-long' : 'text-terminal-short'}`}>
          {isWin ? '+' : ''}{trade.pnl?.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1 text-terminal-text-dim">
        <span>{trade.day}</span>
        <span>→</span>
        <span>{trade.exitDay || '—'}</span>
        <span className="ml-auto">${trade.entryPrice?.toFixed(2)} → ${trade.exitPrice?.toFixed(2)}</span>
      </div>
      {trade.reason && trade.reason !== 'signal' && (
        <div className="mt-0.5 text-terminal-amber/70">{trade.reason}</div>
      )}
    </motion.div>
  );
}

export default function BacktestPanel({ backtest }) {
  const [showTrades, setShowTrades] = useState(false);

  if (!backtest) {
    return (
      <div className="h-full flex items-center justify-center text-terminal-text-dim text-xs font-mono">
        Select a backtest to view results
      </div>
    );
  }

  const isProfit = backtest.totalPnl >= 0;

  return (
    <div className="h-full flex flex-col bg-terminal-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-terminal-border">
        <span className="text-[10px] font-mono tracking-[0.2em] text-terminal-text-dim uppercase">
          Backtest Results
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Summary Stats */}
        <div className="p-4 space-y-3">
          {/* PnL Hero */}
          <div className="bg-terminal-bg rounded-lg p-4 text-center">
            <div className={`text-2xl font-mono font-bold ${isProfit ? 'text-terminal-long' : 'text-terminal-short'}`}>
              {isProfit ? '+' : ''}{backtest.pnlPercent}%
            </div>
            <div className="text-[10px] font-mono text-terminal-text-dim mt-1">
              ${backtest.startingBalance?.toLocaleString()} → ${backtest.endingBalance?.toLocaleString()}
            </div>
            <div className={`text-xs font-mono mt-0.5 ${isProfit ? 'text-terminal-long' : 'text-terminal-short'}`}>
              {isProfit ? '+' : ''}${backtest.totalPnl?.toLocaleString()}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Trades', value: backtest.totalTrades },
              { label: 'Win Rate', value: `${backtest.winRate}%` },
              { label: 'Max DD', value: `${backtest.maxDrawdown}%`, warn: backtest.maxDrawdown > 20 },
              { label: 'Leverage', value: `${backtest.leverage}x` },
            ].map(({ label, value, warn }) => (
              <div key={label} className="bg-terminal-bg rounded px-3 py-2">
                <div className="text-[9px] font-mono text-terminal-text-dim tracking-wider">{label}</div>
                <div className={`text-sm font-mono font-medium mt-0.5 ${
                  warn ? 'text-terminal-short' : 'text-terminal-text'
                }`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Liquidation Warning */}
          {backtest.liquidated && (
            <div className="bg-terminal-short/10 border border-terminal-short/20 rounded-lg px-3 py-2 text-[10px] font-mono text-terminal-short">
              LIQUIDATED on {backtest.liquidationDay}
            </div>
          )}

          {/* Config Info */}
          <div className="bg-terminal-bg rounded px-3 py-2 text-[10px] font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-terminal-text-dim">Agent</span>
              <span className="text-terminal-text">{backtest.config?.agentId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-text-dim">Period</span>
              <span className="text-terminal-text">{backtest.config?.from} → {backtest.config?.to}</span>
            </div>
          </div>

          {/* Equity Chart */}
          <EquityChart history={backtest.equityHistory} startingBalance={backtest.startingBalance} />
        </div>

        {/* Trade Log Toggle */}
        <div className="border-t border-terminal-border">
          <button
            onClick={() => setShowTrades(!showTrades)}
            className="w-full px-4 py-2 text-left text-[10px] font-mono tracking-wider text-terminal-text-dim
                       hover:text-terminal-accent hover:bg-terminal-accent/5 transition-colors cursor-pointer"
          >
            {showTrades ? '▼' : '▶'} TRADE LOG ({backtest.trades?.length || 0})
          </button>

          <AnimatePresence>
            {showTrades && backtest.trades?.map((trade, i) => (
              <TradeRow key={i} trade={trade} idx={i} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
