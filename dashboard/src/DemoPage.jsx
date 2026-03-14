import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';

const TOTAL_SLIDES = 12;

const EQUITY = [
  { day: 'Jan 30', eq: 1000, eth: 2706.3 },
  { day: 'Jan 31', eq: 994.31, eth: 2449.5 },
  { day: 'Feb 1', eq: 994.31, eth: 2268.4 },
  { day: 'Feb 2', eq: 996.33, eth: 2345.2 },
  { day: 'Feb 3', eq: 993.45, eth: 2232.4 },
  { day: 'Feb 4', eq: 991.19, eth: 2147.9 },
  { day: 'Feb 5', eq: 982.28, eth: 1825.9 },
  { day: 'Feb 6', eq: 986.09, eth: 2062.0 },
];

const TRADES = [
  { day: 'Jan 30', action: 'LONG', entry: 2706.3, exit: 2449.5, pnl: -5.69, reason: 'Extreme oversold at support' },
  { day: 'Feb 1', action: 'LONG', entry: 2268.4, exit: 2345.2, pnl: 2.02, reason: 'RSI 16.8 — scaling into fear' },
  { day: 'Feb 2', action: 'LONG', entry: 2345.2, exit: 2232.4, pnl: -2.88, reason: 'RSI 22 — capitulation volume' },
  { day: 'Feb 3', action: 'LONG', entry: 2232.4, exit: 2147.9, pnl: -2.26, reason: 'RSI 24 — mean reversion' },
  { day: 'Feb 4', action: 'LONG', entry: 2147.9, exit: 1825.9, pnl: -8.92, reason: 'RSI 20.5 — key support' },
  { day: 'Feb 5', action: 'LONG', entry: 1825.9, exit: 2062.0, pnl: 3.81, reason: 'RSI 17 — capitulation bottom' },
  { day: 'Feb 6', action: 'LONG', entry: 2062.0, exit: 2062.0, pnl: 0, reason: 'RSI 27 — backtest end' },
];

const BENCHMARK = [
  { label: 'ETH Buy & Hold', pnl: -23.80, color: '#ff1744' },
  { label: 'Agent Portfolio', pnl: -1.39, color: '#00d4aa' },
];

// --- Helpers ---

function useSlideInView(ref) {
  return useInView(ref, { amount: 0.4, once: false });
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
});

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.6, delay },
});

const scaleIn = (delay = 0) => ({
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

function A({ children, delay = 0, inView, ...rest }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

function SlideNum({ n }) {
  return (
    <div className="absolute bottom-6 left-8 font-mono text-sm text-terminal-text-dim select-none z-10">
      {String(n).padStart(2, '0')} / {TOTAL_SLIDES}
    </div>
  );
}

function Tag({ children, color = '#00d4aa' }) {
  return (
    <span
      className="inline-block px-3 py-1 rounded-full font-mono text-sm font-medium mr-2 mb-2"
      style={{ background: color + '18', color, border: `1px solid ${color}40` }}
    >
      {children}
    </span>
  );
}

function StatCard({ label, value, sub, color = '#00d4aa', delay = 0, inView }) {
  return (
    <A delay={delay} inView={inView}>
      <div className="rounded-xl p-5" style={{ background: '#080c14', border: '1px solid #111a28' }}>
        <div className="font-mono text-3xl font-bold mb-1" style={{ color }}>{value}</div>
        <div className="text-base text-terminal-text font-medium">{label}</div>
        {sub && <div className="text-sm text-terminal-text-dim mt-1">{sub}</div>}
      </div>
    </A>
  );
}

function Arrow({ className }) {
  return (
    <svg className={className} width="28" height="14" viewBox="0 0 28 14" fill="none">
      <path d="M2 2L14 12L26 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CodeLine({ children, highlight = false, dim = false }) {
  return (
    <div
      className="font-mono text-[15px] leading-relaxed px-4 py-0.5 transition-all duration-500"
      style={{
        background: highlight ? '#00d4aa10' : 'transparent',
        borderLeft: highlight ? '3px solid #00d4aa' : '3px solid transparent',
        opacity: dim ? 0.35 : 1,
      }}
    >
      {children}
    </div>
  );
}

// --- SVG Chart Helpers ---

function makePolyline(data, w, h, key, pad = 20) {
  const vals = data.map((d) => d[key]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  return data
    .map((d, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (d[key] - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');
}

function EquityChart({ inView }) {
  const w = 700, h = 220;
  const eqLine = makePolyline(EQUITY, w, h, 'eq');
  const ethLine = makePolyline(EQUITY, w, h, 'eth');
  const pad = 20;

  return (
    <motion.svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
    >
      {EQUITY.map((d, i) => {
        const x = pad + (i / (EQUITY.length - 1)) * (w - pad * 2);
        return (
          <g key={i}>
            <line x1={x} y1={pad} x2={x} y2={h - pad} stroke="#111a28" strokeWidth="1" />
            <text x={x} y={h - 2} textAnchor="middle" fill="#4a5a6a" fontSize="11" fontFamily="JetBrains Mono">{d.day}</text>
          </g>
        );
      })}
      <motion.polyline
        points={ethLine}
        fill="none"
        stroke="#ff9800"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.4"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 1.5, delay: 0.5 }}
      />
      <motion.polyline
        points={eqLine}
        fill="none"
        stroke="#00d4aa"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 1.5, delay: 0.7 }}
      />
      {EQUITY.map((d, i) => {
        const x = pad + (i / (EQUITY.length - 1)) * (w - pad * 2);
        const eqMin = Math.min(...EQUITY.map(e => e.eq));
        const eqMax = Math.max(...EQUITY.map(e => e.eq));
        const y = pad + (1 - (d.eq - eqMin) / (eqMax - eqMin || 1)) * (h - pad * 2);
        return (
          <motion.circle
            key={i} cx={x} cy={y} r="4" fill="#00d4aa"
            initial={{ opacity: 0, scale: 0 }}
            animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
            transition={{ duration: 0.3, delay: 0.8 + i * 0.08 }}
          />
        );
      })}
      <text x={w - pad} y={pad + 8} textAnchor="end" fill="#00d4aa" fontSize="11" fontFamily="JetBrains Mono">Portfolio</text>
      <text x={w - pad} y={pad + 22} textAnchor="end" fill="#ff9800" fontSize="11" fontFamily="JetBrains Mono" opacity="0.6">ETH Price</text>
    </motion.svg>
  );
}

// --- Slides ---

function S1({ inView }) {
  return (
    <div className="text-center">
      <A delay={0} inView={inView}>
        <div className="font-mono text-terminal-text-dim text-lg tracking-[0.4em] uppercase mb-6">Autonomous Trading System</div>
      </A>
      <A delay={0.15} inView={inView}>
        <h1
          className="font-mono font-bold tracking-tight mb-6"
          style={{ fontSize: 'clamp(56px, 8vw, 96px)', color: '#00d4aa', textShadow: '0 0 60px #00d4aa30, 0 0 120px #00d4aa10' }}
        >
          HOLIDAY
        </h1>
      </A>
      <A delay={0.35} inView={inView}>
        <p className="text-xl text-terminal-text mb-8 max-w-2xl mx-auto leading-relaxed">
          Multi-agent AI system trading perpetual futures on Hyperliquid DEX — with built-in safety, persistent memory, and shared research.
        </p>
      </A>
      <A delay={0.55} inView={inView}>
        <div className="flex flex-wrap justify-center gap-1">
          <Tag>Two-Stage Safety</Tag>
          <Tag>Ralph Loop Memory</Tag>
          <Tag color="#ff9800">50+ Assets</Tag>
          <Tag color="#c8d6e5">24/7 Autonomous</Tag>
        </div>
      </A>
      <A delay={0.8} inView={inView}>
        <div className="mt-16 flex flex-col items-center text-terminal-text-dim">
          <span className="text-sm mb-2">Scroll to explore</span>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
            <Arrow className="text-terminal-text-dim" />
          </motion.div>
        </div>
      </A>
    </div>
  );
}

function S2({ inView }) {
  const problems = [
    { icon: '🎭', title: 'LLM Hallucinations', desc: 'Models fabricate order parameters — wrong prices, impossible sizes, non-existent symbols', color: '#ff1744' },
    { icon: '📉', title: 'Context Drift', desc: 'Long-running conversations accumulate noise — model loses focus after hours of trading', color: '#ff9800' },
    { icon: '⚡', title: 'No Safety Net', desc: 'Single AI decides and executes — one bad output sends real money to the market', color: '#ffab00' },
  ];
  return (
    <div>
      <A delay={0} inView={inView}>
        <h2 className="text-4xl font-bold mb-2">The Problem</h2>
        <p className="text-lg text-terminal-text-dim mb-10">Why autonomous LLM trading is dangerous without safeguards</p>
      </A>
      <div className="grid grid-cols-3 gap-6">
        {problems.map((p, i) => (
          <A key={i} delay={0.2 + i * 0.15} inView={inView}>
            <div className="rounded-xl p-6 h-full" style={{ background: '#080c14', border: `1px solid ${p.color}30` }}>
              <div className="text-4xl mb-4">{p.icon}</div>
              <div className="text-xl font-bold mb-2" style={{ color: p.color }}>{p.title}</div>
              <div className="text-base text-terminal-text-dim leading-relaxed">{p.desc}</div>
            </div>
          </A>
        ))}
      </div>
      <A delay={0.7} inView={inView}>
        <div className="mt-10 text-center">
          <span className="text-2xl font-bold text-terminal-text">Holiday solves all three →</span>
        </div>
      </A>
    </div>
  );
}

function S3({ inView }) {
  const boxes = [
    { label: 'Research\nEngine', sub: 'Perplexity Deep Research', color: '#6366f1', y: 0 },
    { label: 'Decision\nEngine', sub: 'Kimi K2.5 · T=0.4', color: '#00d4aa', y: 1 },
    { label: 'Review\nEngine', sub: 'Safety Layer · T=0.1', color: '#ff9800', y: 2 },
    { label: 'Hyperliquid\nExchange', sub: 'On-Chain Execution', color: '#ff1744', y: 3 },
  ];
  return (
    <div>
      <A delay={0} inView={inView}>
        <h2 className="text-4xl font-bold mb-2">System Architecture</h2>
        <p className="text-lg text-terminal-text-dim mb-10">Four engines in sequence — research feeds decisions, safety validates, exchange executes</p>
      </A>
      <div className="flex items-start gap-4 justify-center">
        {boxes.map((b, i) => (
          <A key={i} delay={0.2 + i * 0.18} inView={inView} className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <div
                className="rounded-xl p-5 text-center w-[200px]"
                style={{ background: '#080c14', border: `2px solid ${b.color}60`, boxShadow: `0 0 30px ${b.color}10` }}
              >
                <div className="font-mono text-lg font-bold whitespace-pre-line leading-tight mb-1" style={{ color: b.color }}>{b.label}</div>
                <div className="text-xs text-terminal-text-dim font-mono">{b.sub}</div>
              </div>
            </div>
            {i < boxes.length - 1 && (
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={inView ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.18 }}
                className="text-terminal-text-dim text-2xl font-mono"
              >
                →
              </motion.div>
            )}
          </A>
        ))}
      </div>
      <A delay={1.0} inView={inView}>
        <div className="mt-8 flex justify-center gap-8 text-sm text-terminal-text-dim">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#6366f1' }} />
            <span>Shared across agents</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#00d4aa' }} />
            <span>Per-agent decision</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#ff9800' }} />
            <span>Independent validation</span>
          </div>
        </div>
      </A>
      <A delay={1.1} inView={inView}>
        <div className="mt-6 rounded-xl p-4 text-center" style={{ background: '#0b0f18', border: '1px solid #1a2840' }}>
          <span className="font-mono text-sm text-terminal-text-dim">Memory System</span>
          <span className="text-terminal-text mx-3">·</span>
          <span className="text-sm text-terminal-text">Decision logs + Research reports + Rolling summaries</span>
          <span className="text-terminal-text mx-3">·</span>
          <span className="font-mono text-sm" style={{ color: '#00d4aa' }}>Ralph Loop ↻</span>
        </div>
      </A>
    </div>
  );
}

function S4({ inView }) {
  return (
    <div>
      <A delay={0} inView={inView}>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="font-mono text-terminal-accent text-lg">STEP 1</span>
          <h2 className="text-4xl font-bold">Configure Your Agent</h2>
        </div>
        <p className="text-lg text-terminal-text-dim mb-8">Define persona, pairs, risk limits, and model — everything is JSON</p>
      </A>
      <div className="grid grid-cols-[1fr_340px] gap-8">
        <A delay={0.15} inView={inView}>
          <div className="rounded-xl overflow-hidden" style={{ background: '#080c14', border: '1px solid #111a28' }}>
            <div className="px-4 py-2 flex gap-2 border-b border-terminal-border">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="font-mono text-xs text-terminal-text-dim ml-2">contrarian-trader.json</span>
            </div>
            <div className="py-3">
              <CodeLine dim>{'{'}</CodeLine>
              <CodeLine highlight><span className="text-terminal-accent">"agentId"</span>: <span className="text-green-400">"contrarian-trader"</span>,</CodeLine>
              <CodeLine dim><span className="text-terminal-accent">"loopInterval"</span>: 3600000,</CodeLine>
              <CodeLine highlight><span className="text-terminal-accent">"persona"</span>: <span className="text-green-400">"You are a contrarian trader who buys fear and sells greed..."</span>,</CodeLine>
              <CodeLine dim><span className="text-terminal-accent">"tradingPairs"</span>: [</CodeLine>
              <CodeLine highlight>  {'{ '}<span className="text-terminal-accent">"symbol"</span>: <span className="text-green-400">"ETH"</span>, <span className="text-terminal-accent">"market"</span>: <span className="text-green-400">"perp"</span>{' }'},</CodeLine>
              <CodeLine highlight>  {'{ '}<span className="text-terminal-accent">"symbol"</span>: <span className="text-green-400">"BTC"</span>, <span className="text-terminal-accent">"market"</span>: <span className="text-green-400">"perp"</span>{' }'}</CodeLine>
              <CodeLine dim>],</CodeLine>
              <CodeLine highlight><span className="text-terminal-accent">"maxPositionSize"</span>: <span className="text-blue-400">0.02</span>,</CodeLine>
              <CodeLine highlight><span className="text-terminal-accent">"leverage"</span>: <span className="text-blue-400">3</span>,</CodeLine>
              <CodeLine highlight><span className="text-terminal-accent">"executionMode"</span>: <span className="text-green-400">"paper"</span>,</CodeLine>
              <CodeLine dim><span className="text-terminal-accent">"models"</span>: {'{'}</CodeLine>
              <CodeLine dim>  <span className="text-terminal-accent">"decision"</span>: <span className="text-green-400">"moonshotai/kimi-k2.5"</span></CodeLine>
              <CodeLine dim>{'}'}</CodeLine>
              <CodeLine dim>{'}'}</CodeLine>
            </div>
          </div>
        </A>
        <div className="flex flex-col gap-4 pt-2">
          {[
            { field: 'persona', desc: 'Natural language trading style — the AI follows this personality', color: '#00d4aa' },
            { field: 'tradingPairs', desc: 'Which markets to trade — perp, spot, or HIP-3', color: '#00d4aa' },
            { field: 'maxPositionSize', desc: '2% per trade × 3x leverage = 6% max exposure', color: '#ff9800' },
            { field: 'executionMode', desc: 'Paper first, then switch to live with real capital', color: '#6366f1' },
          ].map((item, i) => (
            <A key={i} delay={0.4 + i * 0.12} inView={inView}>
              <div className="rounded-lg p-3" style={{ background: '#0b0f18', borderLeft: `3px solid ${item.color}` }}>
                <div className="font-mono text-sm font-bold mb-0.5" style={{ color: item.color }}>{item.field}</div>
                <div className="text-sm text-terminal-text-dim leading-snug">{item.desc}</div>
              </div>
            </A>
          ))}
        </div>
      </div>
    </div>
  );
}

function S5({ inView }) {
  return (
    <div>
      <A delay={0} inView={inView}>
        <h2 className="text-4xl font-bold mb-2">Two-Stage Safety</h2>
        <p className="text-lg text-terminal-text-dim mb-8">No order reaches the market unless <em>both</em> AI models agree</p>
      </A>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-6 items-start mb-8">
        <A delay={0.15} inView={inView}>
          <div className="rounded-xl p-5" style={{ background: '#080c14', border: '2px solid #00d4aa40' }}>
            <div className="font-mono text-lg font-bold text-terminal-accent mb-3">Stage 1: Decision Engine</div>
            <div className="text-sm text-terminal-text-dim mb-3">Agentic tool calling — model chooses what data to fetch</div>
            <div className="space-y-1.5 font-mono text-sm">
              {['getPriceChart()', 'getResearch()', 'getAccountState()', 'getDecisionHistory()'].map((t, i) => (
                <motion.div
                  key={i}
                  className="px-3 py-1.5 rounded"
                  style={{ background: '#00d4aa08', border: '1px solid #00d4aa20' }}
                  initial={{ opacity: 0, x: -20 }}
                  animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                >
                  <span className="text-terminal-accent">→</span> {t}
                </motion.div>
              ))}
            </div>
            <div className="mt-3 text-xs text-terminal-text-dim">Temperature: 0.4 · Creative analysis</div>
          </div>
        </A>
        <A delay={0.5} inView={inView}>
          <div className="flex flex-col items-center gap-2 pt-12">
            <motion.div
              className="text-3xl"
              animate={inView ? { x: [0, 8, 0] } : {}}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              →
            </motion.div>
            <div className="font-mono text-xs text-terminal-text-dim">Proposal</div>
          </div>
        </A>
        <A delay={0.3} inView={inView}>
          <div className="rounded-xl p-5" style={{ background: '#080c14', border: '2px solid #ff980040' }}>
            <div className="font-mono text-lg font-bold text-terminal-hold mb-3">Stage 2: Review Engine</div>
            <div className="text-sm text-terminal-text-dim mb-3">Validates rules, then executes via tools — can't hallucinate params</div>
            <div className="space-y-2">
              {[
                { label: 'executeTrade()', desc: 'Approved — send to exchange', color: '#00c853' },
                { label: 'rejectTrade()', desc: 'Unsafe — default to HOLD', color: '#ff1744' },
                { label: 'approveHold()', desc: 'Confirm no action needed', color: '#ff9800' },
              ].map((t, i) => (
                <motion.div
                  key={i}
                  className="px-3 py-1.5 rounded flex items-center gap-2"
                  style={{ background: t.color + '08', border: `1px solid ${t.color}25` }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                  transition={{ delay: 0.6 + i * 0.12 }}
                >
                  <span className="font-mono text-sm" style={{ color: t.color }}>{t.label}</span>
                  <span className="text-xs text-terminal-text-dim">{t.desc}</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-3 text-xs text-terminal-text-dim">Temperature: 0.1 · Deterministic safety</div>
          </div>
        </A>
      </div>
      <A delay={0.9} inView={inView}>
        <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: '#00d4aa08', border: '1px solid #00d4aa20' }}>
          <div className="flex items-center gap-6">
            <div>
              <span className="font-mono text-sm text-terminal-accent">TESTED</span>
              <span className="text-terminal-text mx-2">·</span>
              <span className="text-sm text-terminal-text">Symbol violations rejected <strong className="text-terminal-accent">9/9</strong> across all temperatures</span>
            </div>
          </div>
          <div className="font-mono text-2xl font-bold text-terminal-accent">100%</div>
        </div>
      </A>
    </div>
  );
}

function S6({ inView }) {
  const steps = ['Fresh Context', 'Fetch Memory', 'Decision', 'Review', 'Save & Loop'];
  return (
    <div>
      <A delay={0} inView={inView}>
        <h2 className="text-4xl font-bold mb-2">Ralph Loop Memory</h2>
        <p className="text-lg text-terminal-text-dim mb-10">Each iteration starts fresh — no context drift, ever</p>
      </A>
      <div className="flex items-center justify-center gap-2 mb-10">
        {steps.map((s, i) => (
          <A key={i} delay={0.15 + i * 0.12} inView={inView} className="flex items-center gap-2">
            <div className="rounded-lg px-4 py-3 text-center" style={{ background: '#080c14', border: '1px solid #00d4aa30' }}>
              <div className="font-mono text-sm font-medium text-terminal-accent">{s}</div>
            </div>
            {i < steps.length - 1 && <span className="text-terminal-text-dim font-mono">→</span>}
          </A>
        ))}
      </div>
      <A delay={0.8} inView={inView}>
        <div className="rounded-xl p-5 mb-6" style={{ background: '#080c14', border: '1px solid #111a28' }}>
          <div className="font-mono text-sm text-terminal-text-dim mb-3">Smart Compaction — keeps context lean</div>
          <div className="flex items-end gap-2 h-16">
            {[...Array(13)].map((_, i) => {
              const isFull = i >= 10;
              const h = isFull ? 56 : 14;
              return (
                <motion.div
                  key={i}
                  className="rounded-sm flex-1"
                  style={{
                    background: isFull ? '#00d4aa' : '#00d4aa40',
                    height: h,
                  }}
                  initial={{ scaleY: 0 }}
                  animate={inView ? { scaleY: 1 } : { scaleY: 0 }}
                  transition={{ duration: 0.4, delay: 0.9 + i * 0.05 }}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs font-mono text-terminal-text-dim">
            <span>← Older decisions (microcompacted ~150 tokens each)</span>
            <span>Recent 3 in full →</span>
          </div>
        </div>
      </A>
      <div className="grid grid-cols-3 gap-4">
        <StatCard inView={inView} delay={1.0} label="Context Used" value="13.1%" sub="of 128K token limit" />
        <StatCard inView={inView} delay={1.1} label="Compression" value="5.6×" sub="at 20-decision window" />
        <StatCard inView={inView} delay={1.2} label="Infinite Operation" value="∞" sub="29K tokens at 100 decisions" color="#ff9800" />
      </div>
    </div>
  );
}

function S7({ inView }) {
  const sections = [
    'Executive Summary', 'BTC/ETH Price Action', 'Macro & Fed Policy',
    'On-Chain Metrics', 'Institutional Flows', 'Risk Assessment',
    'Regulatory News', 'DeFi Developments', 'Trading Implications',
  ];
  return (
    <div>
      <A delay={0} inView={inView}>
        <h2 className="text-4xl font-bold mb-2">Shared Research Engine</h2>
        <p className="text-lg text-terminal-text-dim mb-8">One 3-word prompt → Perplexity deep-research produces comprehensive macro intelligence</p>
      </A>
      <div className="grid grid-cols-[1fr_300px] gap-8">
        <A delay={0.15} inView={inView}>
          <div className="rounded-xl overflow-hidden" style={{ background: '#080c14', border: '1px solid #6366f140' }}>
            <div className="px-5 py-3 border-b border-terminal-border flex items-center justify-between">
              <span className="font-mono text-sm" style={{ color: '#6366f1' }}>Research Report · Jan 31, 2026</span>
              <span className="font-mono text-xs text-terminal-text-dim">sonar-deep-research</span>
            </div>
            <div className="p-5">
              <div className="font-mono text-xs text-terminal-text-dim mb-2">QUERY</div>
              <div className="font-mono text-2xl font-bold text-terminal-accent mb-4">"Macro Market Today"</div>
              <div className="text-sm text-terminal-text-dim leading-relaxed mb-4">
                Bitcoin surged to $97,700 mid-month before collapsing to below $77,700 — a devastating -14% monthly decline driven by Fed hawkishness, inflation persistence, and geopolitical tensions...
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((s, i) => (
                  <motion.span
                    key={i}
                    className="text-xs font-mono px-2 py-1 rounded"
                    style={{ background: '#6366f115', color: '#6366f1', border: '1px solid #6366f120' }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                    transition={{ delay: 0.5 + i * 0.06 }}
                  >
                    {s}
                  </motion.span>
                ))}
              </div>
            </div>
          </div>
        </A>
        <div className="flex flex-col gap-4">
          <StatCard inView={inView} delay={0.4} label="Output Size" value="34K" sub="characters per report" color="#6366f1" />
          <StatCard inView={inView} delay={0.5} label="Sections" value="25+" sub="structured analysis" color="#6366f1" />
          <StatCard inView={inView} delay={0.6} label="Citations" value="14+" sub="unique web sources" color="#6366f1" />
          <A delay={0.7} inView={inView}>
            <div className="rounded-lg p-3 text-center" style={{ background: '#6366f108', border: '1px solid #6366f120' }}>
              <div className="text-xs text-terminal-text-dim">Shared across all agents</div>
              <div className="font-mono text-sm" style={{ color: '#6366f1' }}>1 report → N agents</div>
            </div>
          </A>
        </div>
      </div>
    </div>
  );
}

function S8({ inView }) {
  return (
    <div>
      <A delay={0} inView={inView}>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="font-mono text-terminal-accent text-lg">STEP 2</span>
          <h2 className="text-4xl font-bold">Backtest Against History</h2>
        </div>
        <p className="text-lg text-terminal-text-dim mb-6">Replay the full Decision + Review pipeline on historical data</p>
      </A>
      <A delay={0.15} inView={inView}>
        <div className="rounded-xl p-5 mb-6" style={{ background: '#080c14', border: '1px solid #111a28' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-sm text-terminal-text-dim">contrarian-trader · ETH · Jan 30 – Feb 6, 2026</span>
            <span className="font-mono text-sm" style={{ color: '#ff9800' }}>ETH crashed -23.8%</span>
          </div>
          <EquityChart inView={inView} />
        </div>
      </A>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard inView={inView} delay={0.5} label="Total Trades" value="7" sub="all LONG ETH" />
        <StatCard inView={inView} delay={0.6} label="Win Rate" value="28.6%" sub="2 wins / 7 trades" color="#ff9800" />
        <StatCard inView={inView} delay={0.7} label="Portfolio PnL" value="-1.39%" sub="vs ETH -23.80%" />
        <StatCard inView={inView} delay={0.8} label="Max Drawdown" value="1.77%" sub="no liquidation" color="#ff9800" />
      </div>
      <A delay={0.9} inView={inView}>
        <div className="grid grid-cols-2 gap-4">
          {BENCHMARK.map((b, i) => (
            <div key={i} className="rounded-xl p-4 flex items-center justify-between" style={{ background: '#080c14', border: `1px solid ${b.color}30` }}>
              <span className="text-base text-terminal-text">{b.label}</span>
              <span className="font-mono text-2xl font-bold" style={{ color: b.color }}>{b.pnl > 0 ? '+' : ''}{b.pnl}%</span>
            </div>
          ))}
        </div>
      </A>
    </div>
  );
}

function S9({ inView }) {
  return (
    <div>
      <A delay={0} inView={inView}>
        <h2 className="text-4xl font-bold mb-2">Trade-by-Trade Timeline</h2>
        <p className="text-lg text-terminal-text-dim mb-6">Agent scaled into fear through a -23.8% crash — each decision logged with full reasoning</p>
      </A>
      <div className="space-y-2">
        {TRADES.map((t, i) => (
          <motion.div
            key={i}
            className="rounded-lg px-5 py-3 flex items-center gap-4"
            style={{ background: '#080c14', border: `1px solid ${t.pnl >= 0 ? '#00c85330' : '#ff174430'}` }}
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.1 }}
          >
            <div className="font-mono text-sm text-terminal-text-dim w-16">{t.day}</div>
            <div
              className="font-mono text-xs font-bold px-2 py-0.5 rounded w-14 text-center"
              style={{ background: '#00c85318', color: '#00c853' }}
            >
              {t.action}
            </div>
            <div className="font-mono text-sm text-terminal-text w-28">
              ${t.entry.toFixed(0)} → ${t.exit.toFixed(0)}
            </div>
            <div
              className="font-mono text-sm font-bold w-20 text-right"
              style={{ color: t.pnl >= 0 ? '#00c853' : '#ff1744' }}
            >
              {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
            </div>
            <div className="text-sm text-terminal-text-dim flex-1 truncate">{t.reason}</div>
          </motion.div>
        ))}
      </div>
      <A delay={1.0} inView={inView}>
        <div className="mt-4 text-sm text-terminal-text-dim text-center">
          Worst day: Feb 4→5 (<span className="text-terminal-short">-$8.92</span>) · Best day: Feb 5→6 (<span className="text-terminal-long">+$3.81</span> — caught the bounce)
        </div>
      </A>
    </div>
  );
}

function S10({ inView }) {
  return (
    <div>
      <A delay={0} inView={inView}>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="font-mono text-terminal-accent text-lg">STEP 3</span>
          <h2 className="text-4xl font-bold">Deploy Live</h2>
        </div>
        <p className="text-lg text-terminal-text-dim mb-8">Switch to <code className="font-mono text-terminal-accent">"executionMode": "live"</code> — real orders on Hyperliquid</p>
      </A>
      <div className="grid grid-cols-2 gap-6 mb-8">
        <A delay={0.15} inView={inView}>
          <div className="rounded-xl p-5" style={{ background: '#080c14', border: '1px solid #111a28' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-sm text-terminal-short font-bold">LIVE TRADING</span>
            </div>
            <div className="font-mono text-sm text-terminal-text-dim mb-3">contrarian-trader · Mar 14, 2026</div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-terminal-text-dim">Action</span>
                <span className="font-mono font-bold text-terminal-long">LONG ETH</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-text-dim">Size</span>
                <span className="font-mono">1.5% × 3x = 4.5% exposure</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-text-dim">Entry</span>
                <span className="font-mono">$2,067.50</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-text-dim">RSI (1h)</span>
                <span className="font-mono text-terminal-short">25.9 — oversold</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-text-dim">Reason</span>
                <span className="text-xs text-terminal-text-dim max-w-[250px] text-right">Seller exhaustion at $2063 support, asymmetric R:R</span>
              </div>
            </div>
          </div>
        </A>
        <A delay={0.3} inView={inView}>
          <div className="rounded-xl p-5 h-full flex flex-col justify-between" style={{ background: '#080c14', border: '1px solid #111a28' }}>
            <div>
              <div className="font-mono text-sm text-terminal-text-dim mb-3">Dashboard monitors everything</div>
              <div className="space-y-3 text-sm">
                {[
                  { icon: '📊', label: 'Candlestick charts with decision markers' },
                  { icon: '🔬', label: 'Research annotations on timeline' },
                  { icon: '📋', label: 'Decision feed with full reasoning' },
                  { icon: '⚙️', label: 'Agent creation wizard (5 steps)' },
                  { icon: '💰', label: '50+ assets: crypto, equities, forex, commodities' },
                ].map((f, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                    transition={{ delay: 0.5 + i * 0.08 }}
                  >
                    <span className="text-lg">{f.icon}</span>
                    <span className="text-terminal-text">{f.label}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-terminal-border text-xs text-terminal-text-dim">
              React + TradingView Lightweight Charts + Express API
            </div>
          </div>
        </A>
      </div>
      <A delay={0.7} inView={inView}>
        <div className="flex gap-4">
          {[
            { label: '108', sub: 'Decisions logged', color: '#00d4aa' },
            { label: '52', sub: 'Research reports', color: '#6366f1' },
            { label: '3', sub: 'Agents deployed', color: '#ff9800' },
            { label: '44', sub: 'Days of operation', color: '#c8d6e5' },
          ].map((s, i) => (
            <div key={i} className="flex-1 rounded-lg p-3 text-center" style={{ background: '#0b0f18', border: '1px solid #1a2840' }}>
              <div className="font-mono text-2xl font-bold" style={{ color: s.color }}>{s.label}</div>
              <div className="text-xs text-terminal-text-dim mt-1">{s.sub}</div>
            </div>
          ))}
        </div>
      </A>
    </div>
  );
}

function S11({ inView }) {
  const proofs = [
    { title: 'Hard Rule Enforcement', value: '100%', desc: 'Symbol violations rejected 9/9 across all temperatures (0.1, 0.4, 0.7)', color: '#00c853' },
    { title: 'Context Efficiency', value: '13.1%', desc: 'Only 16.7K of 128K tokens used — prevents "lost in the middle" degradation', color: '#00d4aa' },
    { title: 'Crash Resilience', value: '-1.39%', desc: 'Portfolio lost 1.39% while ETH crashed 23.8% — position sizing saved capital', color: '#ff9800' },
    { title: 'Smart Compaction', value: '5.6×', desc: '20 decisions compressed from 90K to 16K tokens — operates indefinitely', color: '#6366f1' },
    { title: 'Within-Session Learning', value: '60%', desc: 'Peak rate of past-decision references — agent adapts to recent mistakes', color: '#00d4aa' },
    { title: 'Research Coverage', value: '15/15', desc: 'Both simple and complex prompts cover all 15 topic categories with no blindspots', color: '#6366f1' },
  ];
  return (
    <div>
      <A delay={0} inView={inView}>
        <h2 className="text-4xl font-bold mb-2">Evidence & Key Findings</h2>
        <p className="text-lg text-terminal-text-dim mb-8">Every claim backed by data — from ablation tests to production logs</p>
      </A>
      <div className="grid grid-cols-3 gap-4">
        {proofs.map((p, i) => (
          <A key={i} delay={0.15 + i * 0.1} inView={inView}>
            <div className="rounded-xl p-5 h-full" style={{ background: '#080c14', border: `1px solid ${p.color}25` }}>
              <div className="font-mono text-3xl font-bold mb-2" style={{ color: p.color }}>{p.value}</div>
              <div className="text-base font-bold text-terminal-text mb-1">{p.title}</div>
              <div className="text-sm text-terminal-text-dim leading-snug">{p.desc}</div>
            </div>
          </A>
        ))}
      </div>
    </div>
  );
}

function S12({ inView }) {
  const items = [
    { title: 'Sub-Daily Backtesting', desc: 'Hourly iterations with intraday research', color: '#00d4aa' },
    { title: 'Portfolio Risk Manager', desc: 'Cross-agent exposure limits and correlation monitoring', color: '#ff9800' },
    { title: 'Automated Stop-Loss', desc: 'Exchange-native SL/TP orders at execution layer', color: '#ff1744' },
    { title: 'Multi-Exchange', desc: 'dYdX, GMX, Binance — cross-venue arbitrage', color: '#6366f1' },
  ];
  return (
    <div className="text-center">
      <A delay={0} inView={inView}>
        <h2 className="text-4xl font-bold mb-2">Future Work</h2>
        <p className="text-lg text-terminal-text-dim mb-10">What's next for Holiday</p>
      </A>
      <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto mb-12">
        {items.map((item, i) => (
          <A key={i} delay={0.2 + i * 0.12} inView={inView}>
            <div className="rounded-xl p-5 text-left" style={{ background: '#080c14', border: `1px solid ${item.color}30` }}>
              <div className="text-lg font-bold mb-1" style={{ color: item.color }}>{item.title}</div>
              <div className="text-sm text-terminal-text-dim">{item.desc}</div>
            </div>
          </A>
        ))}
      </div>
      <A delay={0.7} inView={inView}>
        <div className="font-mono text-sm text-terminal-text-dim mb-3">Open source · MIT License · Node.js + Vercel AI SDK</div>
      </A>
      <A delay={0.85} inView={inView}>
        <h3
          className="font-mono font-bold text-3xl"
          style={{ color: '#00d4aa', textShadow: '0 0 40px #00d4aa30' }}
        >
          Thank you
        </h3>
      </A>
    </div>
  );
}

// --- Main ---

const SLIDES = [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12];

export default function DemoPage() {
  const [current, setCurrent] = useState(0);
  const containerRef = useRef(null);
  const slideRefs = useRef([]);
  const observerRef = useRef(null);

  const scrollTo = useCallback((index) => {
    const el = slideRefs.current[index];
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const goNext = useCallback(() => {
    setCurrent((c) => {
      const next = Math.min(c + 1, TOTAL_SLIDES - 1);
      scrollTo(next);
      return next;
    });
  }, [scrollTo]);

  const goPrev = useCallback(() => {
    setCurrent((c) => {
      const prev = Math.max(c - 1, 0);
      scrollTo(prev);
      return prev;
    });
  }, [scrollTo]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = slideRefs.current.indexOf(entry.target);
            if (idx >= 0) setCurrent(idx);
          }
        });
      },
      { threshold: 0.5 }
    );
    slideRefs.current.forEach((el) => {
      if (el) observerRef.current.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-y-auto"
      style={{
        scrollSnapType: 'y mandatory',
        background: '#04070d',
        color: '#c8d6e5',
      }}
    >
      {SLIDES.map((SlideComp, i) => {
        const ref = (el) => { slideRefs.current[i] = el; };
        return <SlideWrapper key={i} index={i} refCb={ref} SlideComp={SlideComp} />;
      })}

      {/* Navigation overlay */}
      <div className="fixed bottom-6 right-8 flex flex-col gap-2 z-50">
        <button
          onClick={goPrev}
          disabled={current === 0}
          className="w-11 h-11 rounded-lg flex items-center justify-center transition-all duration-200"
          style={{
            background: current === 0 ? '#111a28' : '#1a2840',
            border: '1px solid #1a2840',
            opacity: current === 0 ? 0.3 : 1,
            cursor: current === 0 ? 'default' : 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 11L9 6L14 11" stroke="#c8d6e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={goNext}
          disabled={current === TOTAL_SLIDES - 1}
          className="w-11 h-11 rounded-lg flex items-center justify-center transition-all duration-200"
          style={{
            background: current === TOTAL_SLIDES - 1 ? '#111a28' : '#1a2840',
            border: '1px solid #1a2840',
            opacity: current === TOTAL_SLIDES - 1 ? 0.3 : 1,
            cursor: current === TOTAL_SLIDES - 1 ? 'default' : 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 7L9 12L14 7" stroke="#c8d6e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SlideWrapper({ index, refCb, SlideComp }) {
  const elRef = useRef(null);
  const inView = useSlideInView(elRef);
  return (
    <div
      ref={(el) => {
        elRef.current = el;
        refCb(el);
      }}
      className="min-h-screen flex items-center justify-center snap-start relative"
      style={{ scrollSnapAlign: 'start' }}
    >
      <div className="w-full max-w-[1100px] mx-auto px-10 py-16">
        <SlideComp inView={inView} />
      </div>
      <SlideNum n={index + 1} />
    </div>
  );
}
