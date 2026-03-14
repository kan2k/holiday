import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Serve built frontend in production
const distPath = path.join(__dirname, 'dist');
try {
  await fs.access(distPath);
  app.use(express.static(distPath));
} catch {}

// ─── Persona descriptions ──────────────────────────────────

const PERSONA_TEXT = {
  cautious: `You are a cautious crypto trader focused on risk management. You prefer to wait for clear setups rather than chase momentum. You always consider the macro environment before making decisions. You never risk more than 2% of portfolio on a single trade. When in doubt, you stay in cash.`,
  momentum: `You are an aggressive momentum trader who capitalizes on strong trends. You look for breakouts with high volume confirmation. You're comfortable with higher risk but always use stop losses. You prefer to ride winners and cut losers quickly.`,
  contrarian: `You are a contrarian trader who looks for oversold conditions and sentiment extremes. You buy fear and sell greed. You're patient and willing to wait for the perfect setup. You scale into positions rather than going all-in.`,
  scalper: `You are a short-term scalper focused on quick profits from small price movements. You trade frequently and don't hold positions for long. You focus on high-liquidity pairs and tight spreads. You're disciplined about taking profits and cutting losses fast.`,
};

// ─── API Routes ────────────────────────────────────────────

/**
 * GET /api/agents - List all agents
 */
app.get('/api/agents', async (req, res) => {
  try {
    const agentsDir = path.join(ROOT, 'config', 'agents');
    const files = await fs.readdir(agentsDir);
    const agents = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await fs.readFile(path.join(agentsDir, file), 'utf-8');
      const config = JSON.parse(content);
      agents.push({
        id: config.agentId,
        persona: config.persona?.slice(0, 120) + '...',
        pairs: config.tradingPairs?.map(p => p.symbol) || [],
        leverage: config.leverage || 1,
        mode: config.executionMode || 'paper',
        loopInterval: config.loopInterval
      });
    }

    res.json(agents);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/agents - Create a new agent
 */
app.post('/api/agents', async (req, res) => {
  try {
    const { name, persona, leverage, pairs, tradingPairs: pairsFromBody, loopInterval } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    const agentId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const configPath = path.join(ROOT, 'config', 'agents', `${agentId}.json`);

    // Check if already exists
    try {
      await fs.access(configPath);
      return res.status(409).json({ error: `Agent "${agentId}" already exists` });
    } catch {}

    // Generate a wallet (random hex private key)
    const privateKey = '0x' + randomBytes(32).toString('hex');
    const walletAddress = '0x' + randomBytes(20).toString('hex');

    // Resolve persona text
    let personaText = PERSONA_TEXT[persona] || persona;
    if (typeof personaText !== 'string' || !personaText.trim()) {
      personaText = PERSONA_TEXT.cautious;
    }

    // Accept pair objects { symbol, market } or legacy string arrays
    let tradingPairs;
    if (pairsFromBody && Array.isArray(pairsFromBody) && pairsFromBody.length > 0) {
      tradingPairs = pairsFromBody.map(p => ({
        symbol: p.symbol,
        market: p.market || 'perp'
      }));
    } else {
      tradingPairs = (pairs || ['ETH', 'BTC']).map(symbol => ({
        symbol: typeof symbol === 'string' ? symbol.toUpperCase() : symbol,
        market: 'perp'
      }));
    }

    const config = {
      agentId,
      loopInterval: loopInterval || 3600000,
      persona: personaText,
      walletAddress,
      privateKey,
      tradingPairs,
      researchInterval: 43200000,
      maxPositionSize: 0.5,
      leverage: leverage || 1,
      executionMode: 'paper',
      models: {
        research: 'perplexity/sonar-deep-research',
        decision: 'moonshotai/kimi-k2.5'
      }
    };

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create memory directories
    await fs.mkdir(path.join(ROOT, 'memory', 'decisions'), { recursive: true });

    res.json({
      id: agentId,
      pairs: tradingPairs.map(p => p.symbol),
      leverage: config.leverage,
      mode: config.executionMode,
      walletAddress
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/agents/:id - Get agent config
 */
app.get('/api/agents/:id', async (req, res) => {
  try {
    const configPath = path.join(ROOT, 'config', 'agents', `${req.params.id}.json`);
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    // Don't expose private key
    delete config.privateKey;
    res.json(config);
  } catch (e) {
    res.status(404).json({ error: `Agent ${req.params.id} not found` });
  }
});

/**
 * GET /api/agents/:id/decisions?offset=0&limit=10
 */
app.get('/api/agents/:id/decisions', async (req, res) => {
  try {
    const decisionsDir = path.join(ROOT, 'memory', 'decisions');
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 10;

    let files = await fs.readdir(decisionsDir);
    files = files
      .filter(f => f.startsWith(req.params.id) && f.endsWith('.md'))
      .sort()
      .reverse(); // newest first

    const total = files.length;
    const sliced = files.slice(offset, offset + limit);

    const decisions = [];
    for (const file of sliced) {
      const content = await fs.readFile(path.join(decisionsDir, file), 'utf-8');

      // Parse timestamp from filename
      const match = file.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
      if (!match) continue;
      const [, year, month, day, hour, min, sec] = match;
      const timestamp = new Date(year, month - 1, day, hour, min, sec).toISOString();

      const actionMatch = content.match(/\*\*Action\*\*:\s*(LONG|SHORT|CLOSE|HOLD|BUY|SELL)/i);
      const symbolMatch = content.match(/\*\*Symbol\*\*:\s*(\w+)/i);
      const reasonMatch = content.match(/\*\*Reason\*\*:\s*(.+)/i);
      const sizeMatch = content.match(/\*\*Size\*\*:\s*([\d.]+)%?/i);

      decisions.push({
        file,
        timestamp,
        action: actionMatch?.[1]?.toUpperCase() || 'HOLD',
        symbol: symbolMatch?.[1]?.toUpperCase() || '',
        reason: reasonMatch?.[1] || '',
        size: sizeMatch ? parseFloat(sizeMatch[1]) : null
      });
    }

    res.json({ decisions, total, offset, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/agents/:id/decisions/all - All decisions (for chart markers)
 */
app.get('/api/agents/:id/decisions/all', async (req, res) => {
  try {
    const decisionsDir = path.join(ROOT, 'memory', 'decisions');
    let files = await fs.readdir(decisionsDir);
    files = files
      .filter(f => f.startsWith(req.params.id) && f.endsWith('.md'))
      .sort();

    const decisions = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(decisionsDir, file), 'utf-8');
      const match = file.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
      if (!match) continue;
      const [, year, month, day, hour, min, sec] = match;
      const timestamp = new Date(year, month - 1, day, hour, min, sec).getTime() / 1000;

      const actionMatch = content.match(/\*\*Action\*\*:\s*(LONG|SHORT|CLOSE|HOLD|BUY|SELL)/i);
      const symbolMatch = content.match(/\*\*Symbol\*\*:\s*(\w+)/i);
      const sizeMatch = content.match(/\*\*Size\*\*:\s*([\d.]+)%?/i);
      const reasonMatch = content.match(/\*\*Reason\*\*:\s*(.+)/i);

      decisions.push({
        timestamp,
        action: actionMatch?.[1]?.toUpperCase() || 'HOLD',
        symbol: symbolMatch?.[1]?.toUpperCase() || '',
        size: sizeMatch ? parseFloat(sizeMatch[1]) : null,
        reason: reasonMatch?.[1] || ''
      });
    }

    res.json(decisions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const INTERVAL_MS = {
  '1m': 60000, '5m': 300000, '15m': 900000,
  '1h': 3600000, '4h': 14400000, '1d': 86400000
};

const MAX_CANDLES_PER_REQUEST = 5000;
const BATCH_DELAY_MS = 250;

async function fetchCandleBatch(symbol, interval, startTime, endTime) {
  const response = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin: symbol, interval, startTime, endTime }
    })
  });
  return response.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * GET /api/candles/:symbol?interval=1h&days=7&since=timestamp_ms&maxCandles=15000
 * Fetches multiple batches if needed (5000 per request, rate-limited).
 * Symbol should be URL-encoded (e.g. GOLD%2FUSDC for GOLD/USDC).
 */
app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.symbol);
    // Preserve case for HIP-3 symbols (e.g. xyz:GOLD) since the API is case-sensitive
    const symbol = raw.includes(':') ? raw : raw.toUpperCase();
    const interval = req.query.interval || '1h';
    const sinceMs = parseInt(req.query.since);
    const maxCandles = Math.min(parseInt(req.query.maxCandles) || 15000, 50000);

    const ms = INTERVAL_MS[interval] || 3600000;
    const endTime = Date.now();
    let startTime;

    if (sinceMs && !isNaN(sinceMs)) {
      startTime = sinceMs;
    } else {
      const days = parseInt(req.query.days) || 7;
      startTime = endTime - (days * 86400000);
    }

    const totalCandlesNeeded = Math.ceil((endTime - startTime) / ms);
    const batchCount = Math.ceil(Math.min(totalCandlesNeeded, maxCandles) / MAX_CANDLES_PER_REQUEST);

    const allCandles = new Map();
    let batchEnd = endTime;

    for (let i = 0; i < batchCount; i++) {
      const batchStart = Math.max(startTime, batchEnd - MAX_CANDLES_PER_REQUEST * ms);

      const candles = await fetchCandleBatch(symbol, interval, batchStart, batchEnd);
      if (Array.isArray(candles)) {
        for (const c of candles) {
          const time = Math.floor(c.t / 1000);
          allCandles.set(time, {
            time,
            open: parseFloat(c.o),
            high: parseFloat(c.h),
            low: parseFloat(c.l),
            close: parseFloat(c.c),
            volume: parseFloat(c.v)
          });
        }
      }

      batchEnd = batchStart;
      if (batchEnd <= startTime) break;
      if (i < batchCount - 1) await sleep(BATCH_DELAY_MS);
    }

    const formatted = Array.from(allCandles.values()).sort((a, b) => a.time - b.time);
    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/research - List all research reports with metadata
 */
app.get('/api/research', async (req, res) => {
  try {
    const researchDir = path.join(ROOT, 'memory', 'research');
    let files;
    try {
      files = await fs.readdir(researchDir);
    } catch {
      return res.json([]);
    }

    files = files.filter(f => f.endsWith('.md')).sort();

    const reports = [];
    for (const file of files) {
      const match = file.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
      if (!match) continue;
      const [, year, month, day, hour, min, sec] = match;
      const timestamp = new Date(year, month - 1, day, hour, min, sec).getTime() / 1000;

      const content = await fs.readFile(path.join(researchDir, file), 'utf-8');

      const queryMatch = content.match(/## Query\s*\n(.+)/);
      const query = queryMatch?.[1]?.trim() || '';

      // Extract summary: text between ## Summary and the next ## heading
      const summaryMatch = content.match(/## Summary\s*\n([\s\S]*?)(?=\n## (?:Key Points|Sources|Raw Response)|$)/);
      let summary = summaryMatch?.[1]?.trim() || '';
      // Truncate for the tooltip to first ~300 chars
      const shortSummary = summary.length > 300
        ? summary.slice(0, 300).replace(/\s+\S*$/, '') + '...'
        : summary;

      reports.push({
        file,
        timestamp,
        query,
        shortSummary,
        fullContent: content
      });
    }

    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/summary/:id - Rolling summary
 */
app.get('/api/summary/:id', async (req, res) => {
  try {
    const summaryPath = path.join(ROOT, 'memory', `${req.params.id}-summary.md`);
    const content = await fs.readFile(summaryPath, 'utf-8');
    res.json({ summary: content });
  } catch {
    res.json({ summary: null });
  }
});

// SPA fallback
app.get('*', async (req, res) => {
  try {
    res.sendFile(path.join(distPath, 'index.html'));
  } catch {
    res.status(404).send('Build the frontend first: npm run build');
  }
});

app.listen(PORT, () => {
  console.log(`[Holiday API] Running on http://localhost:${PORT}`);
  console.log(`[Holiday API] Reading from ${ROOT}`);
});
