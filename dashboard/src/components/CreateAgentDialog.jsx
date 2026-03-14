import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PERSONAS = [
  { id: 'cautious', label: 'CAUTIOUS', desc: 'Risk-focused, waits for clear setups', leverage: 2 },
  { id: 'momentum', label: 'MOMENTUM', desc: 'Aggressive, rides trends & breakouts', leverage: 5 },
  { id: 'contrarian', label: 'CONTRARIAN', desc: 'Buys fear, sells greed', leverage: 3 },
  { id: 'scalper', label: 'SCALPER', desc: 'Short-term, quick trades', leverage: 10 },
  { id: 'custom', label: 'CUSTOM', desc: 'Define your own persona', leverage: 1 },
];

// Ordered from least risk to most risk
const PAIR_CATEGORIES = [
  {
    id: 'fx',
    label: 'FX',
    color: '#C084FC',
    pairs: [
      { symbol: 'xyz:EUR', market: 'hip3', label: 'EUR/USD' },
      { symbol: 'xyz:JPY', market: 'hip3', label: 'USD/JPY' },
    ],
  },
  {
    id: 'commodity',
    label: 'Commodities',
    color: '#FFD700',
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
    id: 'index',
    label: 'Index / ETF',
    color: '#E8A838',
    pairs: [
      { symbol: 'xyz:XYZ100', market: 'hip3', label: 'NASDAQ' },
      { symbol: 'xyz:EWY', market: 'hip3', label: 'EWY' },
      { symbol: 'xyz:EWJ', market: 'hip3', label: 'EWJ' },
      { symbol: 'xyz:URNM', market: 'hip3', label: 'URNM' },
    ],
  },
  {
    id: 'stock',
    label: 'Stocks',
    color: '#6C8EFF',
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
    id: 'crypto',
    label: 'Crypto',
    color: '#00d4aa',
    pairs: [
      { symbol: 'BTC', market: 'perp', label: 'BTC' },
      { symbol: 'ETH', market: 'perp', label: 'ETH' },
      { symbol: 'SOL', market: 'perp', label: 'SOL' },
    ],
  },
];

const ALL_PAIRS = PAIR_CATEGORIES.flatMap(c => c.pairs);

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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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
    setCreating(false);
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // Keyboard Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  const isPairSelected = (symbol) => selectedPairs.some(p => p.symbol === symbol);

  const togglePair = (pair) => {
    setSelectedPairs(prev =>
      prev.some(p => p.symbol === pair.symbol)
        ? prev.filter(p => p.symbol !== pair.symbol)
        : [...prev, { symbol: pair.symbol, market: pair.market }]
    );
  };

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
          loopInterval: interval * 60 * 1000
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create agent');
      setCreating(false);
      handleClose();
      onCreated?.(data);
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  };

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return persona !== 'custom' || customPersona.trim().length > 0;
    if (step === 2) return leverage >= 1 && leverage <= 100;
    if (step === 3) return selectedPairs.length > 0;
    return true;
  };

  const totalSteps = 5;

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
                  onClick={() => {
                    setPersona(p.id);
                    setLeverage(p.leverage);
                  }}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors cursor-pointer ${
                    persona === p.id
                      ? 'border-terminal-accent/40 bg-terminal-accent/5'
                      : 'border-terminal-border hover:border-terminal-border-light'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-[11px] font-semibold ${
                      persona === p.id ? 'text-terminal-accent' : 'text-terminal-text'
                    }`}>
                      {p.label}
                    </span>
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
                min={1}
                max={100}
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
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors cursor-pointer ${
                    leverage === lev
                      ? 'border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent'
                      : 'border-terminal-border text-terminal-text-dim hover:border-terminal-border-light'
                  }`}
                >
                  {lev}x
                </button>
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
                        <motion.button
                          key={pair.symbol}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => togglePair(pair)}
                          className={`px-2 py-1 text-[10px] font-mono rounded border transition-all cursor-pointer ${
                            selected ? '' : 'border-terminal-border text-terminal-text-dim hover:border-terminal-border-light hover:text-terminal-text'
                          }`}
                          style={selected ? {
                            borderColor: cat.color + '80',
                            backgroundColor: cat.color + '15',
                            color: cat.color,
                          } : undefined}
                        >
                          {pair.label}
                        </motion.button>
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
              Loop Interval (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={interval}
              onChange={e => setInterval(Math.max(1, parseInt(e.target.value) || 60))}
              className="w-32 bg-terminal-bg border border-terminal-border rounded px-3 py-2.5 text-sm font-mono text-terminal-accent text-center focus:outline-none focus:border-terminal-accent/50 transition-colors"
            />
            <div className="flex gap-2 mt-3">
              {[5, 15, 30, 60, 120, 360].map(m => (
                <button
                  key={m}
                  onClick={() => setInterval(m)}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors cursor-pointer ${
                    interval === m
                      ? 'border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent'
                      : 'border-terminal-border text-terminal-text-dim hover:border-terminal-border-light'
                  }`}
                >
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-6 p-3 rounded border border-terminal-border bg-terminal-bg">
              <div className="text-[10px] font-mono tracking-[0.15em] text-terminal-text-dim mb-2 uppercase">Summary</div>
              <div className="space-y-1 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span className="text-terminal-text-dim">Name</span>
                  <span className="text-terminal-accent">{name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text-dim">Persona</span>
                  <span className="text-terminal-text">{persona === 'custom' ? 'Custom' : PERSONAS.find(p => p.id === persona)?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text-dim">Leverage</span>
                  <span className="text-terminal-text">{leverage}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text-dim">Pairs</span>
                  <span className="text-terminal-accent">{selectedPairs.map(p => {
                    const found = ALL_PAIRS.find(ap => ap.symbol === p.symbol);
                    return found?.label || p.symbol;
                  }).join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text-dim">Interval</span>
                  <span className="text-terminal-text">{interval}m</span>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={overlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={handleClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Dialog */}
          <motion.div
            variants={panel}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={e => e.stopPropagation()}
            className="relative w-[480px] max-h-[85vh] bg-terminal-surface border border-terminal-border rounded-lg shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-terminal-border">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono tracking-[0.2em] text-terminal-accent uppercase font-bold">
                  New Agent
                </span>
                <span className="text-[9px] font-mono text-terminal-text-dim">
                  Step {step + 1}/{totalSteps}
                </span>
              </div>
              <button
                onClick={handleClose}
                className="text-terminal-text-dim hover:text-terminal-text text-sm font-mono cursor-pointer transition-colors"
              >
                ESC
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-[2px] bg-terminal-border">
              <motion.div
                className="h-full bg-terminal-accent"
                initial={{ width: 0 }}
                animate={{ width: `${((step + 1) / totalSteps) * 100}%` }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            {/* Content */}
            <div className="px-5 py-5 min-h-[280px] overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
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
              <button
                onClick={() => step > 0 ? setStep(step - 1) : handleClose()}
                className="px-4 py-1.5 text-[10px] font-mono text-terminal-text-dim hover:text-terminal-text border border-terminal-border rounded cursor-pointer transition-colors"
              >
                {step === 0 ? 'CANCEL' : 'BACK'}
              </button>

              {step < totalSteps - 1 ? (
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
                >
                  NEXT
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={creating}
                  onClick={handleCreate}
                  className="px-5 py-1.5 text-[10px] font-mono font-bold bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40 rounded hover:bg-terminal-accent/30 cursor-pointer transition-all disabled:opacity-50"
                >
                  {creating ? 'CREATING...' : 'CREATE AGENT'}
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
