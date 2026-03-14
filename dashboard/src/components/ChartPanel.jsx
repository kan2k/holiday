import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createChart } from 'lightweight-charts';

const ACTION_COLORS = {
  LONG: '#00c853',
  BUY: '#00c853',
  SHORT: '#ff1744',
  SELL: '#ff1744',
  HOLD: '#ff9800',
  CLOSE: '#2196f3'
};

const INTERVAL_DAYS_MAP = {
  '5m':  { '1D': 1, '3D': 3, '1W': 7, '1M': 30 },
  '15m': { '1D': 1, '3D': 3, '1W': 7, '1M': 30, '3M': 90 },
  '1h':  { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 },
  '4h':  { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730 },
  '1d':  { '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'ALL': 1825 },
};

function getDefaultRange(interval) {
  const map = INTERVAL_DAYS_MAP[interval];
  if (!map) return '3M';
  const keys = Object.keys(map);
  // Pick a reasonable default that covers enough history for research markers
  if (keys.includes('3M')) return '3M';
  return keys.length >= 2 ? keys[1] : keys[0];
}

function TriangleMarker({ action, size, reason, style }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const color = ACTION_COLORS[action] || '#ff9800';
  const isLong = action === 'LONG' || action === 'BUY';

  const handleMouseMove = useCallback((e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      style={style}
      className="absolute pointer-events-auto cursor-pointer"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {size != null && (
        <div
          className="absolute left-1/2 -translate-x-1/2 font-mono text-[9px] font-bold whitespace-nowrap pointer-events-none"
          style={{
            color,
            ...(isLong ? { bottom: '100%', marginBottom: 2 } : { top: '100%', marginTop: 2 })
          }}
        >
          {size}%
        </div>
      )}

      <div className="absolute -inset-2" />

      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          ...(isLong
            ? { borderBottom: `10px solid ${color}` }
            : { borderTop: `10px solid ${color}` })
        }}
      />

      {showTooltip && (
        <div
          className="fixed z-[9999] px-3 py-2 rounded bg-terminal-card border border-terminal-border shadow-xl max-w-[280px] pointer-events-none"
          style={{ left: tooltipPos.x + 14, top: tooltipPos.y - 10 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color, backgroundColor: color + '20' }}>
              {action}
            </span>
            {size != null && (
              <span className="font-mono text-[10px] text-terminal-text-dim">{size}%</span>
            )}
          </div>
          {reason && (
            <p className="text-[10px] text-terminal-text leading-relaxed">{reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ResearchDot({ x, y, report, onClickReport }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      className="absolute pointer-events-auto cursor-pointer"
      style={{ left: x - 8, top: y - 8, width: 16, height: 16 }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => onClickReport(report)}
    >
      <div
        className="absolute rounded-full"
        style={{
          left: 5,
          top: 5,
          width: 6,
          height: 6,
          backgroundColor: '#ffffff',
          boxShadow: '0 0 6px rgba(255,255,255,0.6)',
        }}
      />

      {showTooltip && (
        <div
          className="fixed z-[9999] px-3 py-2 rounded bg-terminal-card border border-terminal-border shadow-xl max-w-[320px] pointer-events-none"
          style={{ left: tooltipPos.x + 14, top: tooltipPos.y - 10 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-white bg-white/10">
              RESEARCH
            </span>
            <span className="font-mono text-[9px] text-terminal-text-dim">
              {new Date(report.timestamp * 1000).toLocaleString()}
            </span>
          </div>
          {report.query && (
            <p className="text-[10px] text-terminal-accent font-bold mb-0.5">{report.query}</p>
          )}
          <p className="text-[10px] text-terminal-text leading-relaxed">{report.shortSummary}</p>
        </div>
      )}
    </div>
  );
}

function ResearchDialog({ report, onClose }) {
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 bg-terminal-card border border-terminal-border rounded-lg shadow-2xl w-[90vw] max-w-[800px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-terminal-border">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded text-white bg-white/10">
              RESEARCH
            </span>
            <span className="font-mono text-[11px] text-terminal-accent font-bold">{report.query}</span>
            <span className="font-mono text-[9px] text-terminal-text-dim">
              {new Date(report.timestamp * 1000).toLocaleString()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-terminal-text-dim hover:text-terminal-text text-lg px-2 py-1 rounded hover:bg-terminal-border/30 transition-colors cursor-pointer"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="font-mono text-[11px] text-terminal-text leading-relaxed whitespace-pre-wrap">
            {report.fullContent}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SingleChart({ symbol, decisions, research, interval = '1h', days = 30, showHold, onClickResearch }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const candlesRef = useRef([]);
  const [candles, setCandles] = useState([]);
  const [markerPositions, setMarkerPositions] = useState([]);
  const [researchPositions, setResearchPositions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    initialFitDone.current = false;
    fetch(`/api/candles/${encodeURIComponent(symbol)}?interval=${interval}&days=${days}&maxCandles=15000`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          candlesRef.current = data;
          setCandles(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol, interval, days]);

  useEffect(() => {
    if (!symbol) return;

    const poll = window.setInterval(() => {
      const existing = candlesRef.current;
      if (existing.length === 0) return;

      const lastTime = existing[existing.length - 1]?.time;
      if (!lastTime) return;

      const sinceMs = (lastTime - 7200) * 1000;

      fetch(`/api/candles/${encodeURIComponent(symbol)}?interval=${interval}&since=${sinceMs}`)
        .then(r => r.json())
        .then(fresh => {
          if (!Array.isArray(fresh) || fresh.length === 0) return;

          const map = new Map(candlesRef.current.map(c => [c.time, c]));
          for (const c of fresh) {
            map.set(c.time, c);
          }
          const merged = Array.from(map.values()).sort((a, b) => a.time - b.time);
          candlesRef.current = merged;
          setCandles(merged);
        })
        .catch(() => {});
    }, 5000);

    return () => window.clearInterval(poll);
  }, [symbol, interval]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#080c14' },
        textColor: '#4a5a6a',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#0e1520' },
        horzLines: { color: '#0e1520' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#00d4aa30', labelBackgroundColor: '#0b0f18' },
        horzLine: { color: '#00d4aa30', labelBackgroundColor: '#0b0f18' },
      },
      timeScale: {
        borderColor: '#111a28',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#111a28',
      },
      localization: { locale: 'en-US' },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#00c853',
      downColor: '#ff1744',
      borderUpColor: '#00c853',
      borderDownColor: '#ff1744',
      wickUpColor: '#00c85360',
      wickDownColor: '#ff174460',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);
    handleResize();

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  const initialFitDone = useRef(false);
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(candles);
    if (!initialFitDone.current) {
      chartRef.current?.timeScale().fitContent();
      initialFitDone.current = true;
    }
  }, [candles]);

  // Decision marker positions
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || candles.length === 0) return;

    const relevantDecisions = decisions.filter(d =>
      d.symbol === symbol && (showHold || d.action !== 'HOLD')
    );

    const updatePositions = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;

      const timeScale = chart.timeScale();
      const positions = [];

      for (const d of relevantDecisions) {
        let closestCandle = candles[0];
        let closestDiff = Infinity;
        for (const c of candles) {
          const diff = Math.abs(c.time - d.timestamp);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestCandle = c;
          }
        }

        const x = timeScale.timeToCoordinate(closestCandle.time);
        const isLong = d.action === 'LONG' || d.action === 'BUY';
        const price = isLong ? closestCandle.low : closestCandle.high;
        const y = series.priceToCoordinate(price);

        if (x !== null && y !== null) {
          positions.push({
            x,
            y: isLong ? y + 4 : y - 14,
            action: d.action,
            size: d.size,
            reason: d.reason,
            key: `${d.timestamp}-${d.action}-${d.symbol}`
          });
        }
      }

      setMarkerPositions(positions);
    };

    updatePositions();

    const timeScale = chartRef.current.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(updatePositions);

    return () => {
      try {
        timeScale.unsubscribeVisibleLogicalRangeChange(updatePositions);
      } catch {}
    };
  }, [decisions, candles, symbol, showHold]);

  // Research marker positions - 1 dot per report, stacked above the candle high
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || candles.length === 0 || !research || research.length === 0) return;

    const updateResearchPositions = () => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;

      const timeScale = chart.timeScale();

      // Group research by closest candle time
      const groups = new Map();
      for (const r of research) {
        let closestCandle = null;
        let closestDiff = Infinity;
        for (const c of candles) {
          const diff = Math.abs(c.time - r.timestamp);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestCandle = c;
          }
        }
        if (!closestCandle) continue;

        const key = closestCandle.time;
        if (!groups.has(key)) {
          groups.set(key, { candle: closestCandle, reports: [] });
        }
        groups.get(key).reports.push(r);
      }

      const positions = [];
      const dotSpacing = 12;

      for (const [, { candle, reports }] of groups) {
        const x = timeScale.timeToCoordinate(candle.time);
        if (x === null) continue;

        const highY = series.priceToCoordinate(candle.high);
        if (highY === null) continue;

        // Stack dots above the candle high, going upward
        for (let i = 0; i < reports.length; i++) {
          positions.push({
            x,
            y: highY - 14 - i * dotSpacing,
            report: reports[i],
            key: `research-${reports[i].timestamp}`,
          });
        }
      }

      setResearchPositions(positions);
    };

    updateResearchPositions();

    const timeScale = chartRef.current.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(updateResearchPositions);

    return () => {
      try {
        timeScale.unsubscribeVisibleLogicalRangeChange(updateResearchPositions);
      } catch {}
    };
  }, [research, candles]);

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-2 left-3 z-10 flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold text-terminal-accent tracking-wider">{symbol}</span>
        <span className="font-mono text-[9px] text-terminal-text-dim">{interval}</span>
        {loading && (
          <span className="font-mono text-[9px] text-terminal-text-dim animate-pulse">Loading...</span>
        )}
      </div>

      <div ref={containerRef} className="w-full h-full" />

      {/* Decision triangle overlays */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 10 }}>
        {markerPositions.map(m => (
          <TriangleMarker
            key={m.key}
            action={m.action}
            size={m.size}
            reason={m.reason}
            style={{
              left: m.x - 6,
              top: m.y,
              position: 'absolute',
            }}
          />
        ))}
      </div>

      {/* Research dot overlays */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 11 }}>
        {researchPositions.map(r => (
          <ResearchDot
            key={r.key}
            x={r.x}
            y={r.y}
            report={r.report}
            onClickReport={onClickResearch}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChartPanel({ agent, decisions, research }) {
  const [showHold, setShowHold] = useState(false);
  const [interval, setInterval] = useState('1h');
  const [range, setRange] = useState('3M');
  const [selectedResearch, setSelectedResearch] = useState(null);
  const pairs = agent?.pairs || [];

  const handleIntervalChange = useCallback((iv) => {
    setInterval(iv);
    setRange(getDefaultRange(iv));
  }, []);

  const rangeOptions = INTERVAL_DAYS_MAP[interval] || INTERVAL_DAYS_MAP['1h'];
  const days = rangeOptions[range] || 30;

  return (
    <div className="h-full flex flex-col bg-terminal-bg">
      <div className="h-9 flex items-center px-4 border-b border-terminal-border bg-terminal-surface gap-4">
        <span className="text-[10px] font-mono tracking-[0.2em] text-terminal-text-dim uppercase">
          Charts
        </span>

        <div className="flex-1" />

        {/* Range selector */}
        <div className="flex gap-1">
          {Object.keys(rangeOptions).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 text-[9px] font-mono rounded transition-colors cursor-pointer ${
                range === r
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'text-terminal-text-dim hover:text-terminal-text'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-terminal-border" />

        {/* Interval selector */}
        <div className="flex gap-1">
          {['5m', '15m', '1h', '4h', '1d'].map(iv => (
            <button
              key={iv}
              onClick={() => handleIntervalChange(iv)}
              className={`px-2 py-0.5 text-[9px] font-mono rounded transition-colors cursor-pointer ${
                interval === iv
                  ? 'bg-terminal-accent/15 text-terminal-accent'
                  : 'text-terminal-text-dim hover:text-terminal-text'
              }`}
            >
              {iv}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showHold}
            onChange={e => setShowHold(e.target.checked)}
            className="accent-terminal-accent w-3 h-3"
          />
          <span className="text-[9px] font-mono text-terminal-text-dim">HOLD</span>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {pairs.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="text-terminal-text-dim font-mono text-xs">No trading pairs</div>
              <div className="text-terminal-text-dim font-mono text-[10px] mt-1">Select an agent to view charts</div>
            </motion.div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {pairs.map((pair, i) => (
              <motion.div
                key={pair}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 min-h-[280px] border-b border-terminal-border last:border-b-0"
              >
                <SingleChart
                  symbol={pair}
                  decisions={decisions}
                  research={research}
                  interval={interval}
                  days={days}
                  showHold={showHold}
                  onClickResearch={setSelectedResearch}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedResearch && (
          <ResearchDialog
            report={selectedResearch}
            onClose={() => setSelectedResearch(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
