#!/usr/bin/env node
/**
 * Research Prompt Backtest Comparison
 * 
 * Backfills research for a volatile period using both simple and complex prompts,
 * then runs the same agent backtest twice to compare decision quality.
 * 
 * Results saved to analysis/research-prompt-comparison/backtest/
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'perplexity/sonar-deep-research';
const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, 'memory', 'research');
const ANALYSIS_DIR = path.join(ROOT, 'analysis', 'research-prompt-comparison', 'backtest');

const COMPLEX_PROMPT_TEMPLATE = (dateStr) => `<role>
You are an expert cryptocurrency market researcher specializing in Bitcoin analysis. Provide thorough, data-driven analysis with specific insights and actionable recommendations.
</role>

<critical_instructions>
• ALWAYS use current web data to validate and enhance your analysis
• NEVER rely solely on training data for recent market events  
• MUST correlate price movements with specific, verified events
• REQUIRE factual basis for all claims about market developments
</critical_instructions>

<analysis_framework>
<price_movement_analysis>
• Identify significant price changes (>2-3% moves)
• Correlate each major price movement with specific events, news, or developments
• Focus on the "why" behind market movements
</price_movement_analysis>
<market_conditions>
• Liquidity, funding rates, and exchange flows
• Institutional vs retail activity patterns
• Derivatives Market Activity: Open interest, perpetuals funding rates, options implied volatility
</market_conditions>
<external_factors>
• Fed policy, economic data, and regulatory news
• Traditional market correlations and risk sentiment
</external_factors>
<forward_looking_analysis>
• Identify upcoming events in the next 7 days
• Use historical event impact patterns to estimate potential price movements
</forward_looking_analysis>
</analysis_framework>

Provide a comprehensive macro market analysis as of ${dateStr}. Cover all major asset classes — crypto, equities, commodities, forex. Be specific with data points.`;

function formatYMD(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

function formatDateForPerplexity(date) {
  return `${date.getUTCMonth()+1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}

async function callPerplexity(prompt, beforeDate) {
  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com/kan2k/holiday'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      search_before_date_filter: beforeDate
    })
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {}
  };
}

function saveResearchFile(date, text, query) {
  const dateStr = formatYMD(date);
  return `# Research Report: ${dateStr}T12:00:00.000Z\n\n## Query\n${query}\n\n## Summary\n${text}\n\n---\n*Generated at ${dateStr}T12:00:00.000Z (backfilled)*\n`;
}

function runBacktest(agentId, from, to, label) {
  return new Promise((resolve, reject) => {
    const args = [
      'scripts/backtest.js', '--agent', agentId,
      '--from', from, '--to', to,
      '--balance', '1000',
      '--model', 'deepseek/deepseek-chat-v3-0324',
      '--yes'
    ];
    const child = spawn('node', args, { cwd: ROOT, env: process.env });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => {
      const text = d.toString();
      stderr += text;
      process.stderr.write(`  [${label}] ${text}`);
    });
    child.on('close', code => {
      try { resolve({ result: JSON.parse(stdout), stderr, exitCode: code }); }
      catch { resolve({ result: null, stderr, exitCode: code }); }
    });
    child.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const agentIdx = args.indexOf('--agent');
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const AGENT = agentIdx !== -1 ? args[agentIdx + 1] : 'contrarian-trader';
  const FROM = fromIdx !== -1 ? args[fromIdx + 1] : '2026-02-28';
  const TO = toIdx !== -1 ? args[toIdx + 1] : '2026-03-07';
  const dates = [];
  const from = new Date(FROM + 'T12:00:00Z');
  const to = new Date(TO + 'T12:00:00Z');
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(new Date(d));
  }

  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║  Research Backtest Comparison              ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`  Agent:    ${AGENT}`);
  console.error(`  Period:   ${FROM} → ${TO} (${dates.length} days)`);
  console.error(`  Model:    deepseek/deepseek-chat-v3-0324 (fast)`);
  console.error(`  Phase 1:  Backfill complex research for ${dates.length} dates`);
  console.error(`  Phase 2:  Backtest A (simple research — already exists)`);
  console.error(`  Phase 3:  Backtest B (complex research — swap files)`);
  console.error(`  Cost:     ~$${dates.length * 2} (backfill) + ~$0.20 x2 (backtest)`);

  await fs.mkdir(ANALYSIS_DIR, { recursive: true });

  // ── Phase 1: Backfill complex research ──────────────────────────────────────
  console.error(`\n  Phase 1: Backfilling complex research...`);

  const complexDir = path.join(ANALYSIS_DIR, 'research-complex');
  const simpleDir = path.join(ANALYSIS_DIR, 'research-simple');
  await fs.mkdir(complexDir, { recursive: true });
  await fs.mkdir(simpleDir, { recursive: true });

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = formatYMD(date);
    const filename = `${dateStr}_12-00-00.md`;
    const nextDay = new Date(date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const beforeFilter = formatDateForPerplexity(nextDay);

    // Copy existing simple research
    const existingPath = path.join(RESEARCH_DIR, filename);
    try {
      const existing = await fs.readFile(existingPath, 'utf-8');
      await fs.writeFile(path.join(simpleDir, filename), existing, 'utf-8');
      console.error(`  [${i+1}/${dates.length}] ${dateStr} simple: copied (${existing.length} chars)`);
    } catch {
      console.error(`  [${i+1}/${dates.length}] ${dateStr} simple: MISSING`);
    }

    // Generate complex research
    const complexPath = path.join(complexDir, filename);
    try {
      await fs.access(complexPath);
      const cached = await fs.readFile(complexPath, 'utf-8');
      console.error(`  [${i+1}/${dates.length}] ${dateStr} complex: cached (${cached.length} chars)`);
    } catch {
      console.error(`  [${i+1}/${dates.length}] ${dateStr} complex: generating...`);
      try {
        const prompt = COMPLEX_PROMPT_TEMPLATE(dateStr);
        const result = await callPerplexity(prompt, beforeFilter);
        const content = saveResearchFile(date, result.text, 'Complex structured macro analysis');
        await fs.writeFile(complexPath, content, 'utf-8');
        console.error(`    ✓ ${result.text.length} chars, ${result.usage.total_tokens || '?'} tokens`);
      } catch (err) {
        console.error(`    ✗ ${err.message}`);
      }
      if (i < dates.length - 1) await new Promise(r => setTimeout(r, 3000));
    }
  }

  // ── Phase 2: Backtest A (simple research) ───────────────────────────────────
  console.error(`\n  Phase 2: Backtest with SIMPLE research...`);
  const btA = await runBacktest(AGENT, FROM, TO, 'simple');
  const resultA = btA.result;

  // ── Phase 3: Swap research → complex, backtest again ────────────────────────
  console.error(`\n  Phase 3: Swapping research files → complex...`);

  // Backup originals and swap in complex research
  const backupDir = path.join(ANALYSIS_DIR, 'research-backup');
  await fs.mkdir(backupDir, { recursive: true });

  for (const date of dates) {
    const filename = `${formatYMD(date)}_12-00-00.md`;
    const orig = path.join(RESEARCH_DIR, filename);
    const backup = path.join(backupDir, filename);
    const complex = path.join(complexDir, filename);

    try {
      await fs.copyFile(orig, backup);
      await fs.copyFile(complex, orig);
    } catch (err) {
      console.error(`    Swap failed for ${filename}: ${err.message}`);
    }
  }

  console.error(`  Phase 3: Backtest with COMPLEX research...`);
  const btB = await runBacktest(AGENT, FROM, TO, 'complex');
  const resultB = btB.result;

  // ── Restore original research ───────────────────────────────────────────────
  console.error(`\n  Restoring original research files...`);
  for (const date of dates) {
    const filename = `${formatYMD(date)}_12-00-00.md`;
    const orig = path.join(RESEARCH_DIR, filename);
    const backup = path.join(backupDir, filename);
    try { await fs.copyFile(backup, orig); } catch { /* */ }
  }

  // ── Compare results ─────────────────────────────────────────────────────────
  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║  Backtest Comparison Results               ║`);
  console.error(`╚══════════════════════════════════════════╝`);

  const comparison = {
    experiment: { agent: AGENT, from: FROM, to: TO, model: 'deepseek/deepseek-chat-v3-0324', rationale: 'Period selected for US-Iran conflict market volatility. ETH dropped from ~$2126 to ~$1968 during this window.' },
    simple: resultA ? {
      pnl: resultA.totalPnl, pnlPct: resultA.pnlPercent,
      trades: resultA.totalTrades, winRate: resultA.winRate,
      maxDrawdown: resultA.maxDrawdown, endingBalance: resultA.endingBalance,
      tradeLog: resultA.trades
    } : { error: 'backtest failed' },
    complex: resultB ? {
      pnl: resultB.totalPnl, pnlPct: resultB.pnlPercent,
      trades: resultB.totalTrades, winRate: resultB.winRate,
      maxDrawdown: resultB.maxDrawdown, endingBalance: resultB.endingBalance,
      tradeLog: resultB.trades
    } : { error: 'backtest failed' }
  };

  if (resultA && resultB) {
    const pad = (s, n) => String(s).padEnd(n);
    console.error(`\n  ${'Metric'.padEnd(25)} ${'Simple Research'.padEnd(20)} ${'Complex Research'.padEnd(20)}`);
    console.error(`  ${'─'.repeat(65)}`);
    console.error(`  ${pad('PnL ($)', 25)} ${pad('$' + resultA.totalPnl, 20)} ${pad('$' + resultB.totalPnl, 20)}`);
    console.error(`  ${pad('PnL (%)', 25)} ${pad(resultA.pnlPercent + '%', 20)} ${pad(resultB.pnlPercent + '%', 20)}`);
    console.error(`  ${pad('Total trades', 25)} ${pad(resultA.totalTrades, 20)} ${pad(resultB.totalTrades, 20)}`);
    console.error(`  ${pad('Win rate', 25)} ${pad(resultA.winRate + '%', 20)} ${pad(resultB.winRate + '%', 20)}`);
    console.error(`  ${pad('Max drawdown', 25)} ${pad(resultA.maxDrawdown + '%', 20)} ${pad(resultB.maxDrawdown + '%', 20)}`);
    console.error(`  ${pad('Ending balance', 25)} ${pad('$' + resultA.endingBalance, 20)} ${pad('$' + resultB.endingBalance, 20)}`);
  }

  const outputFile = `comparison-${AGENT}.json`;
  await fs.writeFile(path.join(ANALYSIS_DIR, outputFile), JSON.stringify(comparison, null, 2), 'utf-8');
  console.error(`\n  Results saved to: ${ANALYSIS_DIR}/${outputFile}`);
  console.log(JSON.stringify(comparison, null, 2));
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
