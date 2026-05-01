import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PERSONAS = [
  { id: 'cautious', label: 'CAUTIOUS', desc: 'Risk-focused, waits for clear setups', leverage: 2 },
  { id: 'momentum', label: 'MOMENTUM', desc: 'Aggressive, rides trends & breakouts', leverage: 5 },
  { id: 'contrarian', label: 'CONTRARIAN', desc: 'Buys fear, sells greed', leverage: 3 },
  { id: 'scalper', label: 'SCALPER', desc: 'Short-term, quick trades', leverage: 10 },
  { id: 'custom', label: 'CUSTOM', desc: 'Define your own persona', leverage: 1 },
];

const DECISION_MODELS = [
  {
    id: 'fast',
    label: 'FAST',
    model: 'deepseek/deepseek-chat-v3-0324',
    desc: 'Lowest latency, cheapest — good for frequent loops',
    speed: '~3s',
    cost: '$0.20/M',
    intelligence: '82',
    color: '#00d4aa',
  },
  {
    id: 'balanced',
    label: 'BALANCED',
    model: 'moonshotai/kimi-k2.5',
    desc: 'Best value — strong reasoning at low cost',
    speed: '~35s',
    cost: '$0.35/M',
    intelligence: '89',
    color: '#E8A838',
  },
  {
    id: 'smart',
    label: 'SMART',
    model: 'anthropic/claude-opus-4.6',
    desc: 'Top-tier intelligence — best for high-stakes decisions',
    speed: '~45s',
    cost: '$15.00/M',
    intelligence: '97',
    color: '#C084FC',
  },
];

const PAIR_CATEGORIES = [
  {
    id: 'fx', label: 'FX', color: '#C084FC',
    pairs: [
      { symbol: 'xyz:EUR', market: 'hip3', label: 'EUR/USD' },
      { symbol: 'xyz:JPY', market: 'hip3', label: 'USD/JPY' },
    ],
  },
  {
    id: 'commodity', label: 'Commodities', color: '#FFD700',
    pairs: [
      { symbol: 'xyz:GOLD', market: 'hip3', label: 'GOLD' },
      { symbol: 'xyz:SILVER', market: 'hip3', label: 'SILVER' },
      { symbol: 'xyz:PLATINUM', market: 'hip3', label: 'PLATINUM' },
      { symbol: 'xyz:COPPER', market: 'hip3', label: 'COPPER' },
      { symbol: 'xyz:CL', market: 'hip3', label: 'WTI OIL' },
      { symbol: 'xyz:BRENTOIL', market: 'hip3', label: 'BRENT' },
      { symbol: 'xyz:NATGAS', market: 'hip3', label: 'NAT GAS' },
    ],
  },
  {
    id: 'index', label: 'Index / ETF', color: '#E8A838',
    pairs: [
      { symbol: 'xyz:XYZ100', market: 'hip3', label: 'NASDAQ' },
      { symbol: 'xyz:EWY', market: 'hip3', label: 'EWY' },
      { symbol: 'xyz:EWJ', market: 'hip3', label: 'EWJ' },
      { symbol: 'xyz:URNM', market: 'hip3', label: 'URNM' },
    ],
  },
  {
    id: 'stock', label: 'Stocks', color: '#6C8EFF',
    pairs: [
      { symbol: 'xyz:AAPL', market: 'hip3', label: 'AAPL' },
      { symbol: 'xyz:MSFT', market: 'hip3', label: 'MSFT' },
      { symbol: 'xyz:GOOGL', market: 'hip3', label: 'GOOGL' },
      { symbol: 'xyz:AMZN', market: 'hip3', label: 'AMZN' },
      { symbol: 'xyz:META', market: 'hip3', label: 'META' },
      { symbol: 'xyz:NVDA', market: 'hip3', label: 'NVDA' },
      { symbol: 'xyz:TSLA', market: 'hip3', label: 'TSLA' },
      { symbol: 'xyz:NFLX', market: 'hip3', label: 'NFLX' },
      { symbol: 'xyz:AMD', market: 'hip3', label: 'AMD' },
      { symbol: 'xyz:ORCL', market: 'hip3', label: 'ORCL' },
      { symbol: 'xyz:TSM', market: 'hip3', label: 'TSM' },
      { symbol: 'xyz:INTC', market: 'hip3', label: 'INTC' },
      { symbol: 'xyz:MU', market: 'hip3', label: 'MU' },
      { symbol: 'xyz:PLTR', market: 'hip3', label: 'PLTR' },
      { symbol: 'xyz:COIN', market: 'hip3', label: 'COIN' },
      { symbol: 'xyz:HOOD', market: 'hip3', label: 'HOOD' },
      { symbol: 'xyz:MSTR', market: 'hip3', label: 'MSTR' },
      { symbol: 'xyz:RIVN', market: 'hip3', label: 'RIVN' },
      { symbol: 'xyz:BABA', market: 'hip3', label: 'BABA' },
      { symbol: 'xyz:CRWV', market: 'hip3', label: 'CRWV' },
      { symbol: 'xyz:SMSN', market: 'hip3', label: 'SMSN' },
      { symbol: 'xyz:HYUNDAI', market: 'hip3', label: 'HYUNDAI' },
    ],
  },
  {
    id: 'crypto', label: 'Crypto', color: '#00d4aa',
    pairs: [
      { symbol: 'BTC', market: 'perp', label: 'BTC' },
      { symbol: 'ETH', market: 'perp', label: 'ETH' },
      { symbol: 'SOL', market: 'perp', label: 'SOL' },
    ],
  },
];

const ALL_PAIRS = PAIR_CATEGORIES.flatMap(c => c.pairs);

const BACKTEST_PERIODS = [
  { id: '7d', label: '7 DAYS', from: '2026-03-03', to: '2026-03-10', days: 7, desc: 'Quick demo' },
  { id: '14d', label: '14 DAYS', from: '2026-02-24', to: '2026-03-10', days: 14, desc: 'Medium test' },
  { id: 'full', label: 'FULL', from: '2026-02-10', to: '2026-03-10', days: 29, desc: 'Comprehensive' },
];

const overlay = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const panel = {
  hidden: { opacity: 0, scale: 0.92, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30, delay: 0.05 } },
  exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2 } }
};

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, x: -40, transition: { duration: 0.2 } }
};

// ─── Backtest Live Feed ───────────────────────────────────────────────────────

function BacktestFeed({ agentId, period, onComplete }) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [progress, setProgress] = useState({ day: 0, total: 0, balance: 1000 });
  const [result, setResult] = useState(null);
  const feedRef = useRef(null);

  useEffect(() => {
    const url = `/api/backtests/run?agent=${agentId}&from=${period.from}&to=${period.to}&balance=1000`;
    const es = new EventSource(url);

    const addEvent = (evt) => {
      setEvents(prev => [evt, ...prev].slice(0, 100));
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        switch (data.type) {
          case 'day':
            setProgress({ day: data.dayNum, total: data.totalDays, balance: data.balance });
            addEvent({
              id: Date.now(),
              type: 'day',
              icon: '📅',
              text: `Day ${data.dayNum}/${data.totalDays} — ${data.date}`,
              detail: `Balance: $${data.balance.toFixed(2)}`,
              color: '#00d4aa',
            });
            break;

          case 'action':
            if (data.action === 'decision_start') {
              setStatus('deciding');
              addEvent({ id: Date.now(), type: 'decision', icon: '🧠', text: 'Analyzing market...', detail: 'Decision engine started', color: '#E8A838' });
            } else if (data.action === 'tool_call') {
              addEvent({ id: Date.now(), type: 'tool', icon: '🔧', text: `Tool: ${data.tool}`, detail: data.message.replace(/\[.*?\]\s*/, ''), color: '#6C8EFF' });
            } else if (data.action === 'decision_done') {
              const timeMatch = data.message.match(/Done in ([\d.]+)s/);
              addEvent({ id: Date.now(), type: 'done', icon: '✓', text: `Decision complete`, detail: timeMatch ? `${timeMatch[1]}s` : '', color: '#00d4aa' });
            } else if (data.action === 'review_start') {
              setStatus('reviewing');
              addEvent({ id: Date.now(), type: 'review', icon: '🔍', text: 'Reviewing decision...', detail: data.message.replace(/\[.*?\]\s*/, ''), color: '#C084FC' });
            } else if (data.action === 'review_done') {
              addEvent({ id: Date.now(), type: 'done', icon: '✓', text: 'Review complete', color: '#00d4aa' });
            } else if (data.action === 'review_result') {
              const approved = data.message.includes('APPROVED');
              addEvent({ id: Date.now(), type: 'verdict', icon: approved ? '✅' : '❌', text: approved ? 'APPROVED' : 'REJECTED', detail: data.message.slice(0, 120), color: approved ? '#00d4aa' : '#ef4444' });
            }
            break;

          case 'trade':
            const isLiq = data.message.includes('LIQUIDATED');
            if (isLiq) {
              addEvent({ id: Date.now(), type: 'liquidation', icon: '⛔', text: 'LIQUIDATED', detail: data.message, color: '#ef4444' });
            } else {
              const tradeMatch = data.message.match(/→ (\w+)\s+(.+?)\s+@\s*\$([.\d]+)/);
              if (tradeMatch) {
                const action = tradeMatch[1];
                const colorMap = { LONG: '#00d4aa', SHORT: '#ef4444', CLOSE: '#E8A838', HOLD: '#666' };
                addEvent({
                  id: Date.now(), type: 'trade', icon: action === 'HOLD' ? '⏸' : action === 'CLOSE' ? '🔒' : '📈',
                  text: `${action} ${tradeMatch[2]}`, detail: `@ $${tradeMatch[3]}`,
                  color: colorMap[action] || '#00d4aa',
                });
              } else if (data.message.includes('HOLD')) {
                addEvent({ id: Date.now(), type: 'trade', icon: '⏸', text: 'HOLD', detail: data.message.replace(/.*→\s*/, '').slice(0, 100), color: '#666' });
              }
            }
            break;

          case 'status':
            addEvent({ id: Date.now(), type: 'status', icon: '⚡', text: data.message, color: '#6C8EFF' });
            break;

          case 'complete':
            setStatus('complete');
            setResult(data.result);
            addEvent({ id: Date.now(), type: 'complete', icon: '🏁', text: 'Backtest complete!', color: '#00d4aa' });
            es.close();
            onComplete?.(data.result);
            break;

          case 'error':
            setStatus('error');
            addEvent({
              id: Date.now(),
              type: 'error',
              icon: '❌',
              text: data.message || 'Backtest failed',
              detail: data.detail ? data.detail.slice(0, 400) : undefined,
              color: '#ef4444',
            });
            es.close();
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      if (status !== 'complete') {
        setStatus('error');
        addEvent({ id: Date.now(), type: 'error', icon: '❌', text: 'Connection lost', color: '#ef4444' });
      }
      es.close();
    };

    setStatus('running');

    return () => es.close();
  }, [agentId, period]);

  const pct = progress.total > 0 ? (progress.day / progress.total) * 100 : 0;
  const isProfit = result && result.totalPnl >= 0;

  return (
    <div className="space-y-3">
      {/* Progress Header */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono text-terminal-text-dim tracking-wider uppercase">
          {status === 'running' || status === 'deciding' || status === 'reviewing'
            ? `Day ${progress.day}/${progress.total}`
            : status === 'complete' ? 'Backtest Complete' : status}
        </div>
        <div className="text-[10px] font-mono text-terminal-accent">
          ${progress.balance.toFixed(2)}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-terminal-border rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: status === 'complete' ? (isProfit ? '#00d4aa' : '#ef4444') : '#00d4aa' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Result Summary */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-terminal-bg rounded-lg p-3 text-center"
        >
          <div className={`text-xl font-mono font-bold ${isProfit ? 'text-terminal-long' : 'text-terminal-short'}`}>
            {isProfit ? '+' : ''}{result.pnlPercent}%
          </div>
          <div className="text-[9px] font-mono text-terminal-text-dim mt-0.5">
            ${result.startingBalance} → ${result.endingBalance?.toFixed(2)} | {result.totalTrades} trades | {result.winRate}% win
          </div>
        </motion.div>
      )}

      {/* Phase Indicator */}
      {status !== 'complete' && status !== 'error' && (
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: status === 'deciding' ? '#E8A838' : status === 'reviewing' ? '#C084FC' : '#00d4aa' }}
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="text-[9px] font-mono text-terminal-text-dim">
            {status === 'deciding' ? 'Agent is thinking...' : status === 'reviewing' ? 'Safety review...' : 'Processing...'}
          </span>
        </div>
      )}

      {/* Event Feed */}
      <div className="max-h-[220px] overflow-y-auto space-y-0.5 pr-1" ref={feedRef}>
        <AnimatePresence initial={false}>
          {events.map((evt) => (
            <motion.div
              key={evt.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-2 py-1 px-2 rounded text-[9px] font-mono"
              style={{ backgroundColor: evt.color + '08' }}
            >
              <span className="flex-shrink-0 w-4 text-center">{evt.icon}</span>
              <div className="flex-1 min-w-0">
                <span style={{ color: evt.color }} className="font-medium">{evt.text}</span>
                {evt.detail && (
                  <span className="text-terminal-text-dim ml-1.5 truncate">{evt.detail}</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Backtest Result Screen ───────────────────────────────────────────────────

function BacktestResultScreen({ agentId, period, result }) {
  const isProfit = (result?.totalPnl ?? 0) >= 0;
  const pnlColor = isProfit ? '#00d4aa' : '#ef4444';
  const trades = Array.isArray(result?.trades) ? result.trades : [];
  const closedTrades = trades.filter(t => t.exitPrice !== undefined);
  const wins = closedTrades.filter(t => (t.pnl ?? 0) > 0).length;
  const losses = closedTrades.length - wins;

  return (
    <div className="space-y-3">
      {/* Hero PnL */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="rounded-lg border p-4 text-center"
        style={{ borderColor: pnlColor + '40', backgroundColor: pnlColor + '0a' }}
      >
        <div className="text-[9px] font-mono tracking-[0.2em] uppercase text-terminal-text-dim mb-1">
          {result?.liquidated ? 'Liquidated' : 'Net PnL'}
        </div>
        <div className="text-3xl font-mono font-bold" style={{ color: pnlColor }}>
          {isProfit ? '+' : ''}{result?.pnlPercent ?? 0}%
        </div>
        <div className="text-[10px] font-mono text-terminal-text-dim mt-1">
          ${result?.startingBalance?.toFixed?.(2) ?? result?.startingBalance} →{' '}
          <span style={{ color: pnlColor }}>${result?.endingBalance?.toFixed?.(2) ?? result?.endingBalance}</span>
          <span className="ml-2">({isProfit ? '+' : ''}${result?.totalPnl?.toFixed?.(2) ?? result?.totalPnl})</span>
        </div>
        {period && (
          <div className="text-[9px] font-mono text-terminal-text-dim mt-0.5">
            {agentId} · {period.label} · {period.days} days
          </div>
        )}
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Trades', value: result?.totalTrades ?? 0 },
          { label: 'Win Rate', value: `${result?.winRate ?? 0}%` },
          { label: 'Max DD', value: `${result?.maxDrawdown ?? 0}%` },
          { label: 'Leverage', value: `${result?.leverage ?? 1}x` },
        ].map(s => (
          <div key={s.label} className="bg-terminal-bg rounded border border-terminal-border px-2 py-1.5 text-center">
            <div className="text-[8px] font-mono tracking-[0.15em] uppercase text-terminal-text-dim">{s.label}</div>
            <div className="text-[11px] font-mono font-bold text-terminal-text mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Wins/Losses bar */}
      {closedTrades.length > 0 && (
        <div>
          <div className="flex justify-between text-[9px] font-mono text-terminal-text-dim mb-1">
            <span><span className="text-terminal-long">{wins}W</span> / <span className="text-terminal-short">{losses}L</span></span>
            <span>{closedTrades.length} closed</span>
          </div>
          <div className="h-1 bg-terminal-border rounded-full overflow-hidden flex">
            <div className="h-full bg-terminal-long" style={{ width: `${(wins / closedTrades.length) * 100}%` }} />
            <div className="h-full bg-terminal-short" style={{ width: `${(losses / closedTrades.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Trade list */}
      {closedTrades.length > 0 && (
        <div>
          <div className="text-[9px] font-mono tracking-[0.15em] uppercase text-terminal-text-dim mb-1.5">
            Recent trades
          </div>
          <div className="max-h-[160px] overflow-y-auto space-y-0.5 pr-1">
            {closedTrades.slice(-8).reverse().map((t, i) => {
              const pnl = t.pnl ?? 0;
              const good = pnl >= 0;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between px-2 py-1 rounded text-[9px] font-mono"
                  style={{ backgroundColor: (good ? '#00d4aa' : '#ef4444') + '08' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-terminal-text-dim w-14 truncate">{t.exitDay || t.day}</span>
                    <span
                      className="w-10 text-center font-bold"
                      style={{ color: t.action === 'LONG' ? '#00d4aa' : t.action === 'SHORT' ? '#ef4444' : '#E8A838' }}
                    >{t.action}</span>
                    <span className="text-terminal-text truncate">{t.symbol}</span>
                    {t.reason && (
                      <span className="text-terminal-text-dim text-[8px] uppercase tracking-wider">· {t.reason}</span>
                    )}
                  </div>
                  <span className="font-bold" style={{ color: good ? '#00d4aa' : '#ef4444' }}>
                    {good ? '+' : ''}${pnl.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {closedTrades.length === 0 && (
        <div className="text-center py-4 text-[10px] font-mono text-terminal-text-dim">
          No trades executed during this period.
        </div>
      )}
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export default function CreateAgentDialog({ open, onClose, onCreated }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [persona, setPersona] = useState('cautious');
  const [customPersona, setCustomPersona] = useState('');
  const [leverage, setLeverage] = useState(2);
  const [selectedPairs, setSelectedPairs] = useState([
    { symbol: 'ETH', market: 'perp' },
    { symbol: 'BTC', market: 'perp' },
  ]);
  const [interval, setInterval] = useState(60);
  const [decisionModel, setDecisionModel] = useState('balanced');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdAgentId, setCreatedAgentId] = useState(null);
  const [backtestPeriod, setBacktestPeriod] = useState(null);
  const [backtesting, setBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);

  const recommendedLev = PERSONAS.find(p => p.id === persona)?.leverage || 1;

  const reset = useCallback(() => {
    setStep(0);
    setName('');
    setPersona('cautious');
    setCustomPersona('');
    setLeverage(2);
    setSelectedPairs([
      { symbol: 'ETH', market: 'perp' },
      { symbol: 'BTC', market: 'perp' },
    ]);
    setInterval(60);
    setDecisionModel('balanced');
    setCreating(false);
    setError('');
    setCreatedAgentId(null);
    setBacktestPeriod(null);
    setBacktesting(false);
    setBacktestResult(null);
  }, []);

  const handleClose = useCallback(() => {
    if (backtesting) return;
    reset();
    onClose();
  }, [reset, onClose, backtesting]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape' && !backtesting) handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleClose, backtesting]);

  const isPairSelected = (symbol) => selectedPairs.some(p => p.symbol === symbol);

  const togglePair = (pair) => {
    setSelectedPairs(prev =>
      prev.some(p => p.symbol === pair.symbol)
        ? prev.filter(p => p.symbol !== pair.symbol)
        : [...prev, { symbol: pair.symbol, market: pair.market }]
    );
  };

  const selectedModelConfig = DECISION_MODELS.find(m => m.id === decisionModel);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          persona: persona === 'custom' ? customPersona : persona,
          leverage,
          tradingPairs: selectedPairs,
          loopInterval: interval * 60 * 1000,
          decisionModel: selectedModelConfig?.model,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create agent');
      setCreatedAgentId(data.id);
      setCreating(false);
      setStep(totalSteps - 1);
      onCreated?.(data);
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  };

  const handleStartBacktest = () => {
    if (!backtestPeriod) return;
    setBacktestResult(null);
    setBacktesting(true);
  };

  const handleBacktestComplete = (result) => {
    setBacktestResult(result || null);
    setBacktesting(false);
  };

  const handleRunAnotherBacktest = () => {
    setBacktestResult(null);
    setBacktestPeriod(null);
  };

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return persona !== 'custom' || customPersona.trim().length > 0;
    if (step === 2) return leverage >= 1 && leverage <= 100;
    if (step === 3) return selectedPairs.length > 0;
    if (step === 4) return true;
    return true;
  };

  const totalSteps = 7;

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div>
            <label className="block text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-3 uppercase">
              Agent Identifier
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canNext() && setStep(1)}
              placeholder="my-alpha-trader"
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2.5 text-sm font-mono text-terminal-accent placeholder:text-terminal-text-dim/30 focus:outline-none focus:border-terminal-accent/50 transition-colors"
            />
            <p className="text-[9px] font-mono text-terminal-text-dim mt-2">
              Lowercase, alphanumeric and dashes only
            </p>
          </div>
        );

      case 1:
        return (
          <div>
            <label className="block text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-3 uppercase">
              Trading Persona
            </label>
            <div className="space-y-1.5">
              {PERSONAS.map(p => (
                <motion.button
                  key={p.id}
                  whileHover={{ backgroundColor: 'rgba(0,212,170,0.04)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setPersona(p.id); setLeverage(p.leverage); }}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors cursor-pointer ${
                    persona === p.id
                      ? 'border-terminal-accent/40 bg-terminal-accent/5'
                      : 'border-terminal-border hover:border-terminal-border-light'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-[11px] font-semibold ${
                      persona === p.id ? 'text-terminal-accent' : 'text-terminal-text'
                    }`}>{p.label}</span>
                    <span className="font-mono text-[9px] text-terminal-text-dim">{p.leverage}x</span>
                  </div>
                  <p className="text-[9px] text-terminal-text-dim mt-0.5">{p.desc}</p>
                </motion.button>
              ))}
            </div>
            {persona === 'custom' && (
              <motion.textarea
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 80, opacity: 1 }}
                value={customPersona}
                onChange={e => setCustomPersona(e.target.value)}
                placeholder="Describe your trading personality..."
                className="w-full mt-3 bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-[11px] font-mono text-terminal-text placeholder:text-terminal-text-dim/30 focus:outline-none focus:border-terminal-accent/50 resize-none transition-colors"
              />
            )}
          </div>
        );

      case 2:
        return (
          <div>
            <label className="block text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-3 uppercase">
              Leverage
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min={1} max={100}
                value={leverage}
                onChange={e => setLeverage(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                className="w-24 bg-terminal-bg border border-terminal-border rounded px-3 py-2.5 text-lg font-mono text-terminal-accent text-center focus:outline-none focus:border-terminal-accent/50 transition-colors"
              />
              <span className="text-lg font-mono text-terminal-text-dim">x</span>
            </div>
            <p className="text-[9px] font-mono text-terminal-text-dim mt-3">
              Recommended: <span className="text-terminal-accent">{recommendedLev}x</span> for {PERSONAS.find(p => p.id === persona)?.label || 'CUSTOM'}
            </p>
            <div className="flex gap-2 mt-3">
              {[1, 2, 3, 5, 10, 20, 50].map(lev => (
                <button key={lev} onClick={() => setLeverage(lev)}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors cursor-pointer ${
                    leverage === lev
                      ? 'border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent'
                      : 'border-terminal-border text-terminal-text-dim hover:border-terminal-border-light'
                  }`}>{lev}x</button>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div>
            <label className="block text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-3 uppercase">
              Trading Pairs
            </label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {PAIR_CATEGORIES.map(cat => (
                <div key={cat.id} className={cat.pairs.length > 6 ? 'col-span-2' : ''}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-[9px] font-mono font-bold tracking-[0.15em] uppercase" style={{ color: cat.color }}>
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-3.5">
                    {cat.pairs.map(pair => {
                      const selected = isPairSelected(pair.symbol);
                      return (
                        <motion.button key={pair.symbol} whileTap={{ scale: 0.92 }}
                          onClick={() => togglePair(pair)}
                          className={`px-2 py-1 text-[10px] font-mono rounded border transition-all cursor-pointer ${
                            selected ? '' : 'border-terminal-border text-terminal-text-dim hover:border-terminal-border-light hover:text-terminal-text'
                          }`}
                          style={selected ? { borderColor: cat.color + '80', backgroundColor: cat.color + '15', color: cat.color } : undefined}
                        >{pair.label}</motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[9px] font-mono text-terminal-text-dim mt-3">
              Selected: <span className="text-terminal-accent">
                {selectedPairs.map(p => {
                  const found = ALL_PAIRS.find(ap => ap.symbol === p.symbol);
                  return found?.label || p.symbol;
                }).join(', ') || 'None'}
              </span>
            </p>
          </div>
        );

      case 4:
        return (
          <div>
            <label className="block text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-3 uppercase">
              Decision Model
            </label>
            <p className="text-[9px] font-mono text-terminal-text-dim mb-3">
              Choose the AI model for trading decisions. Benchmarked on{' '}
              <a href="https://artificialanalysis.ai/" target="_blank" rel="noopener" className="text-terminal-accent underline">
                Artificial Analysis
              </a>
            </p>
            <div className="space-y-2">
              {DECISION_MODELS.map(m => (
                <motion.button
                  key={m.id}
                  whileHover={{ backgroundColor: 'rgba(0,212,170,0.04)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDecisionModel(m.id)}
                  className={`w-full text-left px-3 py-2.5 rounded border transition-colors cursor-pointer ${
                    decisionModel === m.id
                      ? 'bg-opacity-5'
                      : 'border-terminal-border hover:border-terminal-border-light'
                  }`}
                  style={decisionModel === m.id ? {
                    borderColor: m.color + '80',
                    backgroundColor: m.color + '10',
                  } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold" style={{ color: decisionModel === m.id ? m.color : undefined }}>
                      {m.label}
                    </span>
                    <div className="flex items-center gap-3 text-[9px] font-mono text-terminal-text-dim">
                      <span title="Latency">{m.speed}</span>
                      <span title="Price">{m.cost}</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-terminal-text-dim mt-0.5">{m.desc}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[8px] font-mono text-terminal-text-dim">IQ</span>
                    <div className="flex-1 h-1 bg-terminal-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${m.intelligence}%`, backgroundColor: m.color }} />
                    </div>
                    <span className="text-[8px] font-mono" style={{ color: m.color }}>{m.intelligence}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div>
            <label className="block text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-3 uppercase">
              Loop Interval (minutes)
            </label>
            <input
              type="number"
              min={1} max={1440}
              value={interval}
              onChange={e => setInterval(Math.max(1, parseInt(e.target.value) || 60))}
              className="w-32 bg-terminal-bg border border-terminal-border rounded px-3 py-2.5 text-sm font-mono text-terminal-accent text-center focus:outline-none focus:border-terminal-accent/50 transition-colors"
            />
            <div className="flex gap-2 mt-3">
              {[5, 15, 30, 60, 120, 360].map(m => (
                <button key={m} onClick={() => setInterval(m)}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors cursor-pointer ${
                    interval === m
                      ? 'border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent'
                      : 'border-terminal-border text-terminal-text-dim hover:border-terminal-border-light'
                  }`}>{m < 60 ? `${m}m` : `${m / 60}h`}</button>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-6 p-3 rounded border border-terminal-border bg-terminal-bg">
              <div className="text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-2 uppercase">Summary</div>
              <div className="space-y-1 text-[10px] font-mono">
                {[
                  ['Name', name || '—', 'text-terminal-accent'],
                  ['Persona', persona === 'custom' ? 'Custom' : PERSONAS.find(p => p.id === persona)?.label, 'text-terminal-text'],
                  ['Leverage', `${leverage}x`, 'text-terminal-text'],
                  ['Pairs', selectedPairs.map(p => ALL_PAIRS.find(ap => ap.symbol === p.symbol)?.label || p.symbol).join(', '), 'text-terminal-accent'],
                  ['Model', selectedModelConfig?.label || 'BALANCED', ''],
                  ['Interval', `${interval}m`, 'text-terminal-text'],
                ].map(([label, value, cls]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-terminal-text-dim">{label}</span>
                    <span className={cls} style={label === 'Model' ? { color: selectedModelConfig?.color } : undefined}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div>
            {!createdAgentId ? (
              <div className="text-center py-4">
                <div className="text-[10px] font-mono text-terminal-text-dim">Creating agent...</div>
              </div>
            ) : backtesting ? (
              <div>
                <label className="block text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-3 uppercase">
                  Backtesting {createdAgentId}
                </label>
                <BacktestFeed
                  agentId={createdAgentId}
                  period={BACKTEST_PERIODS.find(p => p.id === backtestPeriod)}
                  onComplete={handleBacktestComplete}
                />
              </div>
            ) : backtestResult ? (
              <BacktestResultScreen
                agentId={createdAgentId}
                period={BACKTEST_PERIODS.find(p => p.id === backtestPeriod)}
                result={backtestResult}
              />
            ) : (
              <div>
                <div className="text-center mb-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-terminal-accent/10 text-terminal-accent text-lg mb-2"
                  >
                    ✓
                  </motion.div>
                  <div className="text-xs font-mono text-terminal-accent font-bold">{createdAgentId} created</div>
                </div>

                <label className="block text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-3 uppercase">
                  Run a Backtest?
                </label>
                <p className="text-[9px] font-mono text-terminal-text-dim mb-3">
                  Test your agent against historical data (Feb 10 – Mar 10). Research is already backfilled — no extra cost for data.
                </p>

                <div className="space-y-1.5">
                  {BACKTEST_PERIODS.map(p => {
                    const modelCost = decisionModel === 'fast' ? 0.003 : decisionModel === 'smart' ? 0.05 : 0.006;
                    const estCost = (p.days * modelCost).toFixed(2);
                    const estTime = decisionModel === 'fast' ? p.days * 12 : decisionModel === 'smart' ? p.days * 120 : p.days * 67;
                    const timeStr = estTime >= 60 ? `~${Math.round(estTime / 60)}min` : `~${estTime}s`;
                    return (
                      <motion.button
                        key={p.id}
                        whileHover={{ backgroundColor: 'rgba(0,212,170,0.04)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setBacktestPeriod(p.id)}
                        className={`w-full text-left px-3 py-2 rounded border transition-colors cursor-pointer ${
                          backtestPeriod === p.id
                            ? 'border-terminal-accent/40 bg-terminal-accent/5'
                            : 'border-terminal-border hover:border-terminal-border-light'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-mono text-[11px] font-semibold ${
                            backtestPeriod === p.id ? 'text-terminal-accent' : 'text-terminal-text'
                          }`}>{p.label}</span>
                          <span className="text-[9px] font-mono text-terminal-text-dim">{p.days} days</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[9px] font-mono text-terminal-text-dim">
                          <span>{p.desc}</span>
                          <span>~${estCost}</span>
                          <span>{timeStr}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                <motion.button
                  whileHover={{ backgroundColor: 'rgba(0,212,170,0.04)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setBacktestPeriod(null)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors cursor-pointer mt-1.5 ${
                    backtestPeriod === null
                      ? 'border-terminal-border-light bg-terminal-card'
                      : 'border-terminal-border hover:border-terminal-border-light'
                  }`}
                >
                  <span className={`font-mono text-[11px] ${
                    backtestPeriod === null ? 'text-terminal-text' : 'text-terminal-text-dim'
                  }`}>SKIP</span>
                  <span className="text-[9px] font-mono text-terminal-text-dim ml-2">— just create the agent</span>
                </motion.button>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const stepLabel =
    step <= 5
      ? `Step ${step + 1}/6`
      : backtesting
        ? 'Backtesting...'
        : backtestResult
          ? 'Backtest Complete'
          : 'Complete';
  const isLastConfig = step === 5;
  const isBacktestStep = step === 6;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={overlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={backtesting ? undefined : handleClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <motion.div
            variants={panel}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={e => e.stopPropagation()}
            className="relative w-[520px] max-h-[85vh] bg-terminal-surface border border-terminal-border rounded-lg shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-terminal-border">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono tracking-[0.2em] text-terminal-accent uppercase font-bold">
                  {isBacktestStep
                    ? backtesting
                      ? 'Backtesting'
                      : backtestResult
                        ? 'Results'
                        : 'Agent Created'
                    : 'New Agent'}
                </span>
                <span className="text-[9px] font-mono text-terminal-text-dim">{stepLabel}</span>
              </div>
              {!backtesting && (
                <button
                  onClick={handleClose}
                  className="text-terminal-text-dim hover:text-terminal-text text-sm font-mono cursor-pointer transition-colors"
                >ESC</button>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-[2px] bg-terminal-border">
              <motion.div
                className="h-full bg-terminal-accent"
                initial={{ width: 0 }}
                animate={{ width: `${(Math.min(step + 1, 6) / 6) * 100}%` }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            {/* Content */}
            <div className="px-5 py-5 min-h-[280px] max-h-[60vh] overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step + (backtesting ? '-bt' : '')}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  {renderStep()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Error */}
            {error && (
              <div className="px-5 pb-2">
                <div className="text-[10px] font-mono text-terminal-short bg-terminal-short/10 px-3 py-1.5 rounded">
                  {error}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-terminal-border">
              {isBacktestStep ? (
                backtesting ? (
                  <span className="text-[9px] font-mono text-terminal-text-dim">Backtest running — please wait</span>
                ) : backtestResult ? (
                  <>
                    <button
                      onClick={handleRunAnotherBacktest}
                      className="px-4 py-1.5 text-[10px] font-mono text-terminal-text-dim hover:text-terminal-text border border-terminal-border rounded cursor-pointer transition-colors"
                    >RUN ANOTHER</button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleClose}
                      className="px-5 py-1.5 text-[10px] font-mono font-bold bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40 rounded hover:bg-terminal-accent/30 cursor-pointer transition-all"
                    >VIEW IN DASHBOARD</motion.button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleClose}
                      className="px-4 py-1.5 text-[10px] font-mono text-terminal-text-dim hover:text-terminal-text border border-terminal-border rounded cursor-pointer transition-colors"
                    >{backtestPeriod ? 'SKIP' : 'DONE'}</button>

                    {backtestPeriod && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleStartBacktest}
                        className="px-5 py-1.5 text-[10px] font-mono font-bold bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40 rounded hover:bg-terminal-accent/30 cursor-pointer transition-all"
                      >RUN BACKTEST</motion.button>
                    )}
                  </>
                )
              ) : (
                <>
                  <button
                    onClick={() => step > 0 ? setStep(step - 1) : handleClose()}
                    className="px-4 py-1.5 text-[10px] font-mono text-terminal-text-dim hover:text-terminal-text border border-terminal-border rounded cursor-pointer transition-colors"
                  >{step === 0 ? 'CANCEL' : 'BACK'}</button>

                  {isLastConfig ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={creating}
                      onClick={handleCreate}
                      className="px-5 py-1.5 text-[10px] font-mono font-bold bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40 rounded hover:bg-terminal-accent/30 cursor-pointer transition-all disabled:opacity-50"
                    >{creating ? 'CREATING...' : 'CREATE AGENT'}</motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={!canNext()}
                      onClick={() => setStep(step + 1)}
                      className={`px-5 py-1.5 text-[10px] font-mono font-bold rounded cursor-pointer transition-all ${
                        canNext()
                          ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 hover:bg-terminal-accent/25'
                          : 'bg-terminal-border/30 text-terminal-text-dim border border-terminal-border cursor-not-allowed'
                      }`}
                    >NEXT</motion.button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
