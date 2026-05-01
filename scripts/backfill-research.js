#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

const RESEARCH_DIR = path.join(process.cwd(), 'memory', 'research');
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'perplexity/sonar-deep-research';
const COST_PER_CALL_USD = 2.00;

function parseDate(str) {
  const d = new Date(str + 'T12:00:00Z');
  if (isNaN(d)) throw new Error(`Invalid date: ${str}`);
  return d;
}

function formatDateForPerplexity(date) {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const y = date.getUTCFullYear();
  return `${m}/${d}/${y}`;
}

function formatDateForFilename(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}_12-00-00.md`;
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

async function getExistingResearchDates() {
  try {
    const files = await fs.readdir(RESEARCH_DIR);
    return new Set(files.map(f => f.slice(0, 10)));
  } catch {
    return new Set();
  }
}

function buildBackfillPrompt(query, dateStr) {
  return `You are a cryptocurrency and macro market research analyst. Provide a comprehensive analysis of market conditions AS OF ${dateStr}.

Query: ${query}

IMPORTANT: You are writing a research report for ${dateStr}. Only include information available on or before this date. Do NOT reference events after ${dateStr}.

Please provide:
1. **Executive Summary**: Overview of market conditions on ${dateStr}
2. **Key Market Movements**: Notable price movements, volume changes, and trends
3. **Macro Factors**: Relevant economic news, Fed decisions, regulations, institutional moves
4. **Crypto-Specific News**: Protocol updates, exchange news, on-chain metrics
5. **Risk Assessment**: Current market risks and potential catalysts
6. **Trading Implications**: What this means for traders in the next 24-48 hours

Be specific with data points, percentages, and timeframes. Focus on actionable intelligence.`;
}

async function callPerplexity(prompt, beforeDate) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/kan2k/holiday'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      search_before_date_filter: beforeDate
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function saveResearch(date, query, text) {
  await fs.mkdir(RESEARCH_DIR, { recursive: true });

  const keyPoints = (text.match(/^[\-\*]\s+.+$/gm) || [])
    .map(p => p.replace(/^[\-\*]\s+/, '').trim()).slice(0, 10);
  const sources = [...new Set((text.match(/https?:\/\/[^\s\)]+/g) || []))].slice(0, 10);

  const dateStr = formatYMD(date);
  const content = `# Research Report: ${dateStr}T12:00:00.000Z

## Query
${query}

## Summary
${text}

## Key Points
${keyPoints.map(p => `- ${p}`).join('\n') || 'No key points extracted'}

## Sources
${sources.map(s => `- ${s}`).join('\n') || 'No sources available'}

## Raw Response
\`\`\`
${text}
\`\`\`

---
*Generated at ${dateStr}T12:00:00.000Z (backfilled)*
`;

  const filename = formatDateForFilename(date);
  const filepath = path.join(RESEARCH_DIR, filename);
  await fs.writeFile(filepath, content, 'utf-8');
  return { filepath, filename };
}

function askConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.error(`Usage: node scripts/backfill-research.js [options]

Options:
  --from YYYY-MM-DD       Start date (default: 2026-02-01)
  --to   YYYY-MM-DD       End date   (default: 2026-02-28)
  --query "..."           Research query (default: "Macro Market Today")
  --concurrency <n>       Parallel Perplexity calls (default: 5, max: 20)
  --yes                   Skip confirmation
  --help                  Show this help`);
    process.exit(0);
  }

  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const queryIdx = args.indexOf('--query');
  const concIdx = args.indexOf('--concurrency');
  const skipConfirm = args.includes('--yes');

  const from = parseDate(fromIdx !== -1 ? args[fromIdx + 1] : '2026-02-01');
  const to = parseDate(toIdx !== -1 ? args[toIdx + 1] : '2026-02-28');
  const query = queryIdx !== -1 ? args[queryIdx + 1] : 'Macro Market Today';
  const concurrency = Math.max(
    1,
    Math.min(20, concIdx !== -1 ? parseInt(args[concIdx + 1], 10) || 5 : 5),
  );

  const allDates = generateDateRange(from, to);
  const existing = await getExistingResearchDates();
  const missing = allDates.filter(d => !existing.has(formatYMD(d)));

  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║        Research Backfill                  ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`  Period:     ${formatYMD(from)} → ${formatYMD(to)}`);
  console.error(`  Total days: ${allDates.length}`);
  console.error(`  Existing:   ${allDates.length - missing.length} (skipped)`);
  console.error(`  To backfill: ${missing.length}`);
  console.error(`  Model:      ${MODEL}`);
  console.error(`  Query:      "${query}"`);
  console.error(`  Filter:     search_before_date_filter (per day)`);
  console.error(`  Parallel:   ${concurrency} call(s) in flight`);
  console.error(``);

  if (missing.length === 0) {
    console.error('  ✓ All dates already have research. Nothing to do.');
    process.exit(0);
  }

  const estimatedCost = missing.length * COST_PER_CALL_USD;
  console.error(`  Estimated cost: ~$${estimatedCost.toFixed(2)} (${missing.length} calls × $${COST_PER_CALL_USD}/call)`);
  const estSerial = missing.length * 45;
  const estParallel = Math.ceil(missing.length / concurrency) * 45;
  console.error(
    `  Estimated time: ~${estParallel}s at concurrency ${concurrency} (serial would be ~${estSerial}s)\n`,
  );

  if (!skipConfirm) {
    const confirmed = await askConfirm('  Proceed with backfill? (y/n) ');
    if (!confirmed) {
      console.error('\n  Cancelled.');
      process.exit(0);
    }
  }

  console.error('');
  let completed = 0;
  let failed = 0;
  let started = 0;

  const runOne = async (date) => {
    const idx = ++started;
    const dateStr = formatYMD(date);
    const nextDay = new Date(date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const beforeFilter = formatDateForPerplexity(nextDay);

    console.error(
      `  [${idx}/${missing.length}] → ${dateStr} (filter: before ${beforeFilter})`,
    );

    try {
      const prompt = buildBackfillPrompt(query, dateStr);
      const text = await callPerplexity(prompt, beforeFilter);
      const saved = await saveResearch(date, query, text);
      completed++;
      console.error(
        `    ✓ [${dateStr}] Saved ${saved.filename} (${text.length} chars) — ${completed + failed}/${missing.length} done`,
      );
    } catch (err) {
      failed++;
      console.error(`    ✗ [${dateStr}] Failed: ${err.message}`);
    }
  };

  // Simple bounded pool: each worker pulls the next date until the queue drains.
  const queue = missing.slice();
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        await runOne(next);
      }
    },
  );
  await Promise.all(workers);

  console.error(
    `\n  Done: ${completed} backfilled, ${failed} failed, ${allDates.length - missing.length} skipped`,
  );
  console.log(
    JSON.stringify({
      completed,
      failed,
      skipped: allDates.length - missing.length,
    }),
  );
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
