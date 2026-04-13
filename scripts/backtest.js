#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { z } from 'zod';
import { tool } from 'ai';
import { DecisionEngine } from '../engines/decision.js';
import { ReviewEngine } from '../engines/review.js';
import { randomBytes } from 'crypto';
import { loadAgentConfig } from '../utils/validation.js';

const RESEARCH_DIR = path.join(process.cwd(), 'memory', 'research');
const BACKTEST_DIR = path.join(process.cwd(), 'memory', 'backtests');
const MAINTENANCE_MARGIN_RATE = 0.03;
const ESTIMATED_TOKENS_PER_ITERATION = 16000;
const KIMI_INPUT_COST_PER_M = 0.35;
const KIMI_OUTPUT_COST_PER_M = 1.05;

// ─── Utility ──────────────────────────────────────────────────────────────────

function parseDate(str) {
  const d = new Date(str + 'T00:00:00Z');
  if (isNaN(d)) throw new Error(`Invalid date: ${str}`);
  return d;
}

function formatYMD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateDateRange(from, to) {
  const dates = [];
  const current = new Date(from);
  while (current <= to) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function askConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase().startsWith('y')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Historical Data Fetching ─────────────────────────────────────────────────

async function fetchHistoricalCandles(symbol, from, to) {
  const startMs = from.getTime();
  const endMs = to.getTime() + 86400000;

  const isHip3 = symbol.includes(':');
  const body = {
    type: 'candleSnapshot',
    req: { coin: symbol, interval: '1d', startTime: startMs, endTime: endMs }
  };

  const url = isHip3
    ? 'https://api.hyperliquid.xyz/info'
    : 'https://api.hyperliquid.xyz/info';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`Candle fetch failed: ${response.status}`);
  const data = await response.json();

  return data.map(c => ({
    time: Math.floor(c.t / 1000),
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v)
  })).sort((a, b) => a.time - b.time);
}

// ─── Research Loader ──────────────────────────────────────────────────────────

async function loadResearchForDate(targetDate) {
  const targetYMD = formatYMD(targetDate);
  try {
    const files = await fs.readdir(RESEARCH_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort();

    let best = null;
    for (const f of mdFiles) {
      const fDate = f.slice(0, 10);
      if (fDate <= targetYMD) best = f;
    }

    if (!best) return null;
    const content = await fs.readFile(path.join(RESEARCH_DIR, best), 'utf-8');
    return { filename: best, content };
  } catch {
    return null;
  }
}

// ─── Portfolio Simulator ──────────────────────────────────────────────────────

class PortfolioSimulator {
  constructor(startingBalance, leverage, stopLossPercent = 0, takeProfitPercent = 0) {
    this.startingBalance = startingBalance;
    this.balance = startingBalance;
    this.leverage = leverage;
    this.stopLossPercent = stopLossPercent;
    this.takeProfitPercent = takeProfitPercent;
    this.currentPrices = {};
    this.positions = {};
    this.trades = [];
    this.equityHistory = [];
    this.liquidated = false;
    this.liquidationDay = null;
    this.peakEquity = startingBalance;
    this.maxDrawdown = 0;
    this.tpslEvents = [];
  }

  setCurrentPrices(prices) {
    this.currentPrices = { ...prices };
  }

  _totalLockedMargin() {
    return Object.values(this.positions).reduce((sum, p) => sum + p.margin, 0);
  }

  _equity(currentPrices) {
    return this.balance + this._totalLockedMargin() + this._calcUnrealizedPnl(currentPrices);
  }

  hasOpenPositions() {
    return Object.keys(this.positions).length > 0;
  }

  closeAllPositions(prices, day, reason = 'fail-safe-close') {
    const results = [];
    for (const sym of Object.keys(this.positions)) {
      const price = prices[sym] || this.positions[sym].entryPrice;
      const result = this.closePosition(sym, price, day, reason);
      if (result) results.push({ symbol: sym, ...result });
    }
    return results;
  }

  getAccountState(currentPrices) {
    const equity = this._equity(currentPrices);
    const positionEntries = Object.entries(this.positions);
    return {
      marginSummary: {
        accountValue: String(equity.toFixed(2)),
        totalMarginUsed: String(this._totalLockedMargin().toFixed(2))
      },
      assetPositions: positionEntries.map(([sym, p]) => ({
        position: {
          coin: sym,
          szi: String(p.side === 'long' ? p.size : -p.size),
          entryPx: String(p.entryPrice.toFixed(2)),
          unrealizedPnl: String(this._positionPnl(p, currentPrices[sym] || p.entryPrice).toFixed(2))
        }
      }))
    };
  }

  openPosition(symbol, side, sizePercent, price, day) {
    if (this.positions[symbol]) {
      this.closePosition(symbol, price, day, 'replaced');
    }

    const equity = this._equity(this.currentPrices);
    const margin = equity * sizePercent;
    const notional = margin * this.leverage;
    const size = notional / price;

    this.balance -= margin;

    const pos = { side, size, entryPrice: price, margin, notional, openDay: day };

    if (this.stopLossPercent > 0) {
      pos.slPrice = side === 'long'
        ? price * (1 - this.stopLossPercent)
        : price * (1 + this.stopLossPercent);
    }
    if (this.takeProfitPercent > 0) {
      pos.tpPrice = side === 'long'
        ? price * (1 + this.takeProfitPercent)
        : price * (1 - this.takeProfitPercent);
    }

    this.positions[symbol] = pos;

    const trade = {
      day: formatYMD(day), action: side.toUpperCase(), symbol,
      entryPrice: price, size, sizePercent, margin, notional,
      leverage: this.leverage,
      slPrice: pos.slPrice, tpPrice: pos.tpPrice
    };
    this.trades.push(trade);
    return trade;
  }

  closePosition(symbol, price, day, reason = 'signal') {
    const pos = this.positions[symbol];
    if (!pos) return null;

    const pnl = this._positionPnl(pos, price);
    const returnAmount = pos.margin + pnl;
    this.balance += Math.max(0, returnAmount);

    const trade = this.trades.find(t =>
      t.symbol === symbol && !t.exitPrice && t.action === pos.side.toUpperCase()
    );
    if (trade) {
      trade.exitPrice = price;
      trade.exitDay = formatYMD(day);
      trade.pnl = pnl;
      trade.reason = reason;
    }

    delete this.positions[symbol];
    return { pnl, returnAmount };
  }

  checkTPSL(candlesBySymbol, day) {
    const triggered = [];
    const dayTs = Math.floor(day.getTime() / 1000);

    for (const [sym, pos] of Object.entries({ ...this.positions })) {
      const candles = candlesBySymbol[sym] || [];
      const todayCandle = candles.find(c => c.time === dayTs);
      if (!todayCandle) continue;

      let hitSL = false, hitTP = false;

      if (pos.side === 'long') {
        if (pos.slPrice && todayCandle.low <= pos.slPrice) hitSL = true;
        if (pos.tpPrice && todayCandle.high >= pos.tpPrice) hitTP = true;
      } else {
        if (pos.slPrice && todayCandle.high >= pos.slPrice) hitSL = true;
        if (pos.tpPrice && todayCandle.low <= pos.tpPrice) hitTP = true;
      }

      if (hitSL && hitTP) hitSL = true; // conservative: assume SL hit first
      if (hitSL) {
        const result = this.closePosition(sym, pos.slPrice, day, 'stop-loss');
        if (result) {
          triggered.push({ symbol: sym, type: 'SL', price: pos.slPrice, pnl: result.pnl });
          this.tpslEvents.push({ day: formatYMD(day), symbol: sym, type: 'stop-loss', price: pos.slPrice, pnl: result.pnl });
        }
      } else if (hitTP) {
        const result = this.closePosition(sym, pos.tpPrice, day, 'take-profit');
        if (result) {
          triggered.push({ symbol: sym, type: 'TP', price: pos.tpPrice, pnl: result.pnl });
          this.tpslEvents.push({ day: formatYMD(day), symbol: sym, type: 'take-profit', price: pos.tpPrice, pnl: result.pnl });
        }
      }
    }
    return triggered;
  }

  checkLiquidation(currentPrices, day) {
    const equity = this._equity(currentPrices);

    let totalMaintenanceMargin = 0;
    for (const [sym, pos] of Object.entries(this.positions)) {
      const currentPrice = currentPrices[sym] || pos.entryPrice;
      const currentNotional = pos.size * currentPrice;
      totalMaintenanceMargin += currentNotional * MAINTENANCE_MARGIN_RATE;
    }

    if (equity < totalMaintenanceMargin && Object.keys(this.positions).length > 0) {
      for (const [sym] of Object.entries(this.positions)) {
        this.closePosition(sym, currentPrices[sym], day, 'liquidated');
      }
      this.liquidated = true;
      this.liquidationDay = formatYMD(day);
      return true;
    }
    return false;
  }

  recordEquity(day, currentPrices) {
    const equity = this._equity(currentPrices);
    this.equityHistory.push({ day: formatYMD(day), equity });

    if (equity > this.peakEquity) this.peakEquity = equity;
    const drawdown = (this.peakEquity - equity) / this.peakEquity;
    if (drawdown > this.maxDrawdown) this.maxDrawdown = drawdown;
  }

  getSummary(finalPrices) {
    for (const [sym] of Object.entries(this.positions)) {
      this.closePosition(sym, finalPrices[sym], new Date(), 'backtest-end');
    }

    const closedTrades = this.trades.filter(t => t.exitPrice !== undefined);
    const wins = closedTrades.filter(t => t.pnl > 0);
    const totalPnl = this.balance - this.startingBalance;

    return {
      startingBalance: this.startingBalance,
      endingBalance: parseFloat(this.balance.toFixed(2)),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      pnlPercent: parseFloat((totalPnl / this.startingBalance * 100).toFixed(2)),
      totalTrades: closedTrades.length,
      winRate: closedTrades.length > 0
        ? parseFloat((wins.length / closedTrades.length * 100).toFixed(1)) : 0,
      maxDrawdown: parseFloat((this.maxDrawdown * 100).toFixed(2)),
      liquidated: this.liquidated,
      liquidationDay: this.liquidationDay,
      stopLossPercent: this.stopLossPercent,
      takeProfitPercent: this.takeProfitPercent,
      tpslEvents: this.tpslEvents,
      trades: closedTrades.map(t => ({
        day: t.day, exitDay: t.exitDay, action: t.action, symbol: t.symbol,
        entryPrice: t.entryPrice, exitPrice: t.exitPrice,
        slPrice: t.slPrice, tpPrice: t.tpPrice,
        pnl: parseFloat((t.pnl || 0).toFixed(2)), reason: t.reason
      })),
      equityHistory: this.equityHistory,
      leverage: this.leverage
    };
  }

  _positionPnl(pos, currentPrice) {
    const priceDiff = currentPrice - pos.entryPrice;
    return pos.side === 'long'
      ? pos.size * priceDiff
      : pos.size * -priceDiff;
  }

  _calcUnrealizedPnl(currentPrices) {
    let total = 0;
    for (const [sym, pos] of Object.entries(this.positions)) {
      total += this._positionPnl(pos, currentPrices[sym] || pos.entryPrice);
    }
    return total;
  }
}

// ─── Backtest Mock Client ─────────────────────────────────────────────────────

class BacktestHyperliquidClient {
  constructor(candlesBySymbol, portfolio, currentDay) {
    this.candlesBySymbol = candlesBySymbol;
    this.portfolio = portfolio;
    this.currentDay = currentDay;
    this.walletAddress = '0x' + '0'.repeat(40);
  }

  setDay(day) {
    this.currentDay = day;
  }

  _getCandlesUpTo(symbol, dayTs) {
    const candles = this.candlesBySymbol[symbol] || [];
    return candles.filter(c => c.time <= dayTs);
  }

  _getCurrentPrice(symbol) {
    const dayTs = Math.floor(this.currentDay.getTime() / 1000);
    const available = this._getCandlesUpTo(symbol, dayTs);
    if (available.length === 0) return null;
    return available[available.length - 1].close;
  }

  async getCandles(symbol, interval = '1d', limit = 100) {
    const dayTs = Math.floor(this.currentDay.getTime() / 1000);
    const available = this._getCandlesUpTo(symbol, dayTs);
    return available.slice(-limit);
  }

  async getPrice(symbol) {
    const price = this._getCurrentPrice(symbol);
    if (!price) throw new Error(`No price data for ${symbol}`);
    return price;
  }

  async getAccountState() {
    const prices = {};
    for (const sym of Object.keys(this.candlesBySymbol)) {
      const p = this._getCurrentPrice(sym);
      if (p) prices[sym] = p;
    }
    return this.portfolio.getAccountState(prices);
  }

  async placeOrder({ symbol, side, size, price }) {
    const actionSide = side === 'buy' ? 'long' : 'short';
    return { status: 'ok', response: { type: 'backtest', symbol, side: actionSide, size, price } };
  }
}

// ─── Backtest Tool Overrides ──────────────────────────────────────────────────

function createBacktestResearchTool(currentDay) {
  return tool({
    description: 'Get the latest macro market research report',
    parameters: z.object({}),
    execute: async () => {
      const research = await loadResearchForDate(currentDay);
      if (!research) return { available: false, message: 'No research available for this date' };
      return { available: true, filename: research.filename, content: research.content };
    }
  });
}

function createBacktestHistoryTool(pastDecisions) {
  return tool({
    description: 'Get recent decision history',
    parameters: z.object({
      limit: z.number().min(1).max(20).default(5).describe('Number of recent decisions')
    }),
    execute: async ({ limit }) => {
      const recent = pastDecisions.slice(-limit);
      if (recent.length === 0) return { available: false, message: 'No prior decisions in this backtest' };
      return {
        available: true,
        count: recent.length,
        summary: recent.map(d =>
          `[${d.day}] ${d.action} ${d.symbol || 'N/A'} | ${d.reason || ''}`
        ).join('\n'),
        decisions: recent
      };
    }
  });
}

// ─── Main Backtest Logic ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.error(`Usage: node scripts/backtest.js --agent <id> [options]

Options:
  --agent <id>          Agent config to backtest (required)
  --from YYYY-MM-DD     Start date (default: 2026-02-01)
  --to   YYYY-MM-DD     End date   (default: 2026-02-28)
  --balance <number>    Starting balance in USDC (default: 1000)
  --model <model>       Override decision model (e.g. google/gemini-3.0-flash)
  --yes                 Skip confirmation
  --help                Show this help

Options:
  --sl <pct>       Stop-loss percentage (default: 0.05 = 5%)
  --tp <pct>       Take-profit percentage (default: 0.10 = 10%)

Notes:
  - Backtest runs at daily interval (one decision per day)
  - Research must be backfilled first: node scripts/backfill-research.js
  - Trades execute at candle close price (no slippage simulation)
  - SL/TP checked against candle high/low each day
  - Error fail-safe: CLOSE open positions (not HOLD)
  - Equity-based position sizing (not cash-only)
  - Funding rates are excluded from PnL calculation`);
    process.exit(0);
  }

  const agentIdx = args.indexOf('--agent');
  if (agentIdx === -1) { console.error('Error: --agent <id> is required'); process.exit(1); }
  const agentId = args[agentIdx + 1];

  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const balIdx = args.indexOf('--balance');
  const modelIdx = args.indexOf('--model');
  const slIdx = args.indexOf('--sl');
  const tpIdx = args.indexOf('--tp');
  const skipConfirm = args.includes('--yes');

  const from = parseDate(fromIdx !== -1 ? args[fromIdx + 1] : '2026-02-01');
  const to = parseDate(toIdx !== -1 ? args[toIdx + 1] : '2026-02-28');
  const startingBalance = balIdx !== -1 ? parseFloat(args[balIdx + 1]) : 10000;
  const modelOverride = modelIdx !== -1 ? args[modelIdx + 1] : null;
  const stopLossPercent = slIdx !== -1 ? parseFloat(args[slIdx + 1]) : 0.05;
  const takeProfitPercent = tpIdx !== -1 ? parseFloat(args[tpIdx + 1]) : 0.10;

  const configPath = path.join(process.cwd(), 'config', 'agents', `${agentId}.json`);
  let config;
  try {
    const configResult = await loadAgentConfig(configPath);
    if (!configResult.valid) {
      console.error(`Config validation failed:\n${configResult.errors.join('\n')}`);
      process.exit(1);
    }
    config = configResult.config;
  } catch (err) {
    console.error(`Failed to load agent config: ${err.message}`);
    process.exit(1);
  }

  if (modelOverride) {
    config.models = config.models || {};
    config.models.decision = modelOverride;
    config.models.review = modelOverride;
    console.error(`  Model override: ${modelOverride} (decision + review)`);
  }

  if (config.loopInterval < 86400000) {
    console.error(`\n  ⚠ Agent loop interval is ${config.loopInterval}ms (${(config.loopInterval/3600000).toFixed(1)}h).`);
    console.error(`  Backtest runs at daily interval to manage token costs.`);
    console.error(`  Sub-daily intervals are blocked in backtest mode.\n`);
  }

  const dates = generateDateRange(from, to);
  const symbols = config.tradingPairs.map(p => p.symbol);

  // Check research coverage
  let researchMissing = 0;
  for (const d of dates) {
    const r = await loadResearchForDate(d);
    if (!r) researchMissing++;
  }
  if (researchMissing > 0) {
    console.error(`\n  ⚠ Missing research for ${researchMissing}/${dates.length} days.`);
    console.error(`  Run backfill first: node scripts/backfill-research.js --from ${formatYMD(from)} --to ${formatYMD(to)}\n`);
  }

  // Cost estimation
  const inputTokensPerIter = 10000;
  const outputTokensPerIter = 3000;
  const totalIters = dates.length;
  const inputCost = (totalIters * inputTokensPerIter / 1_000_000) * KIMI_INPUT_COST_PER_M;
  const outputCost = (totalIters * outputTokensPerIter / 1_000_000) * KIMI_OUTPUT_COST_PER_M;
  const estimatedCost = inputCost + outputCost;

  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║           Backtest                        ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`  Agent:      ${agentId}`);
  console.error(`  Persona:    ${config.persona.slice(0, 60)}...`);
  console.error(`  Pairs:      ${symbols.join(', ')}`);
  console.error(`  Period:     ${formatYMD(from)} → ${formatYMD(to)} (${dates.length} days)`);
  console.error(`  Balance:    $${startingBalance.toLocaleString()}`);
  console.error(`  Leverage:   ${config.leverage}x`);
  console.error(`  Max size:   ${(config.maxPositionSize * 100).toFixed(1)}%`);
  console.error(`  Stop-loss:  ${(stopLossPercent * 100).toFixed(1)}%`);
  console.error(`  Take-profit: ${(takeProfitPercent * 100).toFixed(1)}%`);
  console.error(`  Fail-safe:  CLOSE (context-aware)`);
  console.error(`  Interval:   daily (1 decision/day)`);
  console.error(``);
  console.error(`  Token estimate: ~${(totalIters * (inputTokensPerIter + outputTokensPerIter)).toLocaleString()} tokens`);
  console.error(`  Cost estimate:  ~$${estimatedCost.toFixed(2)} (Decision + Review × ${totalIters} days)`);
  if (researchMissing > 0) {
    console.error(`  ⚠ Research gaps: ${researchMissing} days without data`);
  }
  console.error(``);

  if (!skipConfirm) {
    const confirmed = await askConfirm('  Start backtest? (y/n) ');
    if (!confirmed) { console.error('\n  Cancelled.'); process.exit(0); }
  }

  // Fetch historical candles
  console.error(`\n  Fetching historical candles...`);
  const candlesBySymbol = {};
  for (const sym of symbols) {
    try {
      const lookbackFrom = new Date(from);
      lookbackFrom.setUTCDate(lookbackFrom.getUTCDate() - 60);
      const candles = await fetchHistoricalCandles(sym, lookbackFrom, to);
      candlesBySymbol[sym] = candles;
      console.error(`    ${sym}: ${candles.length} daily candles loaded`);
      await sleep(300);
    } catch (err) {
      console.error(`    ${sym}: FAILED - ${err.message}`);
      candlesBySymbol[sym] = [];
    }
  }

  // Generate unique backtest ID
  const backtestId = `${agentId}-${formatYMD(from)}-to-${formatYMD(to)}-${randomBytes(4).toString('hex')}`;
  const backtestDir = path.join(BACKTEST_DIR, backtestId);
  const decisionsDir = path.join(backtestDir, 'decisions');
  await fs.mkdir(decisionsDir, { recursive: true });
  console.error(`  Backtest ID: ${backtestId}`);

  // Initialize portfolio and mock client
  const portfolio = new PortfolioSimulator(startingBalance, config.leverage, stopLossPercent, takeProfitPercent);
  const mockClient = new BacktestHyperliquidClient(candlesBySymbol, portfolio, from);

  // Run backtest
  console.error(`\n  Running backtest...\n`);
  const pastDecisions = [];

  for (let i = 0; i < dates.length; i++) {
    const day = dates[i];
    const dayStr = formatYMD(day);
    mockClient.setDay(day);

    // Get current prices for mark-to-market
    const currentPrices = {};
    for (const sym of symbols) {
      try { currentPrices[sym] = await mockClient.getPrice(sym); } catch { /* no data */ }
    }

    portfolio.setCurrentPrices(currentPrices);

    // Check liquidation before this day's decision
    if (portfolio.checkLiquidation(currentPrices, day)) {
      console.error(`  [${dayStr}] ⛔ LIQUIDATED — equity below maintenance margin`);
      portfolio.recordEquity(day, currentPrices);
      break;
    }

    // Check SL/TP triggers using intraday high/low
    const tpslTriggered = portfolio.checkTPSL(candlesBySymbol, day);
    for (const ev of tpslTriggered) {
      console.error(`  [${dayStr}] ${ev.type === 'SL' ? '⛔ STOP-LOSS' : '✅ TAKE-PROFIT'} ${ev.symbol} @ $${ev.price.toFixed(2)} | PnL: $${ev.pnl.toFixed(2)}`);
    }

    portfolio.recordEquity(day, currentPrices);

    const equity = portfolio._equity(currentPrices);
    console.error(`  [${dayStr}] Day ${i + 1}/${dates.length} | Balance: $${portfolio.balance.toFixed(2)} | Equity: $${equity.toFixed(2)}`);

    try {
      // Create engines with mock client
      const decisionEngine = new DecisionEngine(config, mockClient);
      const reviewEngine = new ReviewEngine(
        { ...config, executionMode: 'paper' },
        mockClient
      );

      // Override research and history tools
      decisionEngine.tools.getResearch = createBacktestResearchTool(day);
      decisionEngine.tools.getDecisionHistory = createBacktestHistoryTool(pastDecisions);

      // Override executeTrade to record in portfolio
      reviewEngine.tools.executeTrade = tool({
        description: 'Execute an approved perpetual futures trade.',
        parameters: z.object({
          action: z.enum(['LONG', 'SHORT', 'CLOSE']),
          symbol: z.string().max(20),
          sizePercent: z.number().min(0.001).max(1),
          reason: z.string()
        }),
        execute: async ({ action, symbol, sizePercent, reason }) => {
          if (sizePercent > config.maxPositionSize) sizePercent = config.maxPositionSize;
          const price = currentPrices[symbol];
          if (!price) return { executed: false, error: `No price for ${symbol}` };

          if (action === 'CLOSE') {
            const result = portfolio.closePosition(symbol, price, day, 'signal');
            if (!result) return { executed: false, error: 'No position to close' };
            console.error(`    → CLOSE ${symbol} @ $${price.toFixed(2)} | PnL: $${result.pnl.toFixed(2)}`);
            return { executed: true, action: 'CLOSE', symbol, price, pnl: result.pnl, mode: 'backtest' };
          }

          const side = action === 'LONG' ? 'long' : 'short';
          const trade = portfolio.openPosition(symbol, side, sizePercent, price, day);
          console.error(`    → ${action} ${symbol} @ $${price.toFixed(2)} | ${(sizePercent * 100).toFixed(1)}% | ${config.leverage}x`);
          return { executed: true, action, symbol, price, size: trade.size, mode: 'backtest' };
        }
      });

      // Run decision
      const decisionResult = await decisionEngine.makeDecision();
      const decision = decisionResult.decision || { action: 'HOLD', reason: 'No decision' };

      // Run review
      const reviewResult = await reviewEngine.review(
        decision, decisionResult.reasoning || '', decisionResult.marketContext || ''
      );

      const decisionRecord = {
        day: dayStr, action: decision.action, symbol: decision.symbol,
        size: decision.size, reason: decision.reason,
        reviewed: reviewResult.executed || false
      };
      pastDecisions.push(decisionRecord);

      if (decision.action === 'HOLD') {
        console.error(`    → HOLD: ${decision.reason || 'no reason'}`);
      }

      // Save decision markdown
      const equity = portfolio._equity(currentPrices);
      const decisionMd = [
        `# Backtest Decision: ${dayStr}`,
        ``,
        `**Backtest ID:** ${backtestId}`,
        `**Agent:** ${agentId}`,
        `**Day:** ${i + 1}/${dates.length}`,
        `**Balance:** $${portfolio.balance.toFixed(2)}`,
        `**Equity:** $${equity.toFixed(2)}`,
        ``,
        `## Decision`,
        `- **Action:** ${decision.action}`,
        `- **Symbol:** ${decision.symbol || 'N/A'}`,
        `- **Size:** ${decision.size ? (decision.size * 100).toFixed(1) + '%' : 'N/A'}`,
        `- **Reason:** ${decision.reason || 'No reason provided'}`,
        ``,
        `## Reasoning`,
        `${decisionResult.reasoning || 'No reasoning captured'}`,
        ``,
        `## Review`,
        `- **Executed:** ${reviewResult.executed || false}`,
        `- **Verdict:** ${reviewResult.verdict || 'N/A'}`,
        ``,
        `## Positions`,
        ...Object.entries(portfolio.positions).map(([sym, pos]) => {
          const price = currentPrices[sym] || pos.entryPrice;
          const pnl = portfolio._positionPnl(pos, price);
          return `- ${sym}: ${pos.side.toUpperCase()} ${pos.size.toFixed(6)} @ $${pos.entryPrice.toFixed(2)} | PnL: $${pnl.toFixed(2)}`;
        }),
        Object.keys(portfolio.positions).length === 0 ? '- No open positions' : '',
        ``,
        `---`,
        `*Generated during backtest ${backtestId}*`,
      ].join('\n');
      await fs.writeFile(path.join(decisionsDir, `${dayStr}.md`), decisionMd, 'utf-8');

    } catch (err) {
      console.error(`    ✗ Error: ${err.message}`);
      if (portfolio.hasOpenPositions()) {
        const closed = portfolio.closeAllPositions(currentPrices, day, 'error-close');
        for (const c of closed) {
          console.error(`    → CLOSE ${c.symbol} (fail-safe) | PnL: $${c.pnl.toFixed(2)}`);
        }
        pastDecisions.push({ day: dayStr, action: 'CLOSE', reason: `Error fail-safe: ${err.message}` });
      } else {
        pastDecisions.push({ day: dayStr, action: 'HOLD', reason: `Error: ${err.message}` });
      }
    }

    if (i < dates.length - 1) await sleep(500);
  }

  // Final summary
  const finalPrices = {};
  for (const sym of symbols) {
    try { finalPrices[sym] = await mockClient.getPrice(sym); } catch { /* */ }
  }
  const summary = portfolio.getSummary(finalPrices);

  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║        Backtest Results                   ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`  Agent:          ${agentId}`);
  console.error(`  Period:         ${formatYMD(from)} → ${formatYMD(to)}`);
  console.error(`  Starting:       $${summary.startingBalance.toLocaleString()}`);
  console.error(`  Ending:         $${summary.endingBalance.toLocaleString()}`);
  console.error(`  Total PnL:      $${summary.totalPnl >= 0 ? '+' : ''}${summary.totalPnl.toLocaleString()} (${summary.pnlPercent >= 0 ? '+' : ''}${summary.pnlPercent}%)`);
  console.error(`  Total trades:   ${summary.totalTrades}`);
  console.error(`  Win rate:       ${summary.winRate}%`);
  console.error(`  Max drawdown:   ${summary.maxDrawdown}%`);
  console.error(`  Leverage:       ${summary.leverage}x`);
  if (summary.liquidated) {
    console.error(`  ⛔ LIQUIDATED on ${summary.liquidationDay}`);
  }

  if (summary.tpslEvents && summary.tpslEvents.length > 0) {
    console.error(`\n  SL/TP Events: ${summary.tpslEvents.length}`);
    for (const ev of summary.tpslEvents) {
      console.error(`    ${ev.day} ${ev.type.toUpperCase().padEnd(12)} ${ev.symbol.padEnd(8)} @ $${ev.price.toFixed(2)} | PnL: $${ev.pnl >= 0 ? '+' : ''}${ev.pnl.toFixed(2)}`);
    }
  }
  if (summary.trades.length > 0) {
    console.error(`\n  Trade Log:`);
    console.error(`  ${'Day'.padEnd(12)} ${'Action'.padEnd(8)} ${'Symbol'.padEnd(12)} ${'Entry'.padEnd(10)} ${'Exit'.padEnd(10)} ${'PnL'.padEnd(12)} Reason`);
    console.error(`  ${'─'.repeat(80)}`);
    for (const t of summary.trades) {
      const pnlStr = `$${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}`;
      console.error(`  ${t.day.padEnd(12)} ${t.action.padEnd(8)} ${t.symbol.padEnd(12)} $${t.entryPrice?.toFixed(2).padEnd(8) || 'N/A'.padEnd(8)} $${t.exitPrice?.toFixed(2).padEnd(8) || 'N/A'.padEnd(8)} ${pnlStr.padEnd(12)} ${t.reason || ''}`);
    }
  }

  // Save results
  const resultData = {
    backtestId,
    config: { agentId, from: formatYMD(from), to: formatYMD(to), startingBalance, leverage: config.leverage },
    ...summary,
    decisions: pastDecisions
  };
  const resultFile = path.join(backtestDir, 'results.json');
  await fs.writeFile(resultFile, JSON.stringify(resultData, null, 2));
  // Also save a flat copy for easy listing
  await fs.writeFile(path.join(BACKTEST_DIR, `${backtestId}.json`), JSON.stringify(resultData, null, 2));
  console.error(`\n  Results saved: ${backtestDir}/`);
  console.error(`  Decisions:    ${decisionsDir}/ (${pastDecisions.length} files)`);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
