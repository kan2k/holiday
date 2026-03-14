#!/usr/bin/env node
/**
 * Validates Perplexity's search_before_date_filter by comparing
 * filtered (backfilled) vs unfiltered research for the same dates.
 * 
 * If the filter works, backfilled research should NOT contain
 * information about events that occurred after the target date.
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'perplexity/sonar-deep-research';
const RESEARCH_DIR = path.join(process.cwd(), 'memory', 'research');
const OUTPUT_DIR = path.join(process.cwd(), 'analysis', 'date-filter-validation');

const TEST_DATES = [
  { date: '2026-02-04', nextDayEvent: 'ETH crashed -15% on Feb 5 ($2148 → $1826)', lookAheadKeywords: ['feb 5', 'february 5', '1826', '1825', '1818', 'crashed 15', '-15%', 'flash crash feb'] },
  { date: '2026-02-28', nextDayEvent: 'ETH spiked to $2126 on Mar 4 during US-Iran conflict', lookAheadKeywords: ['mar 4', 'march 4', '2126', '2127', 'iran conflict march', 'spike to 2126'] },
  { date: '2026-03-06', nextDayEvent: 'ETH declined to $1968 on Mar 7', lookAheadKeywords: ['mar 7', 'march 7', 'mar 8', 'march 8', '1968', '1936'] }
];

function buildPrompt(dateStr) {
  return `You are a cryptocurrency and macro market research analyst. Provide a comprehensive analysis of market conditions AS OF ${dateStr}.

Query: Macro Market Today

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

async function callPerplexity(prompt, dateFilter = null) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4096
  };
  if (dateFilter) body.search_before_date_filter = dateFilter;

  const start = Date.now();
  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/kan2k/holiday'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {},
    latencyMs: Date.now() - start
  };
}

function formatDateForPerplexity(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

function scanForLookAhead(text, keywords, targetDate) {
  const lower = text.toLowerCase();
  const findings = [];

  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(text.length, idx + kw.length + 80);
      findings.push({
        keyword: kw,
        context: text.slice(start, end).replace(/\n/g, ' ').trim()
      });
    }
  }

  return findings;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║  Date Filter Validation Test               ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`  Model:      ${MODEL}`);
  console.error(`  Test dates: ${TEST_DATES.map(t => t.date).join(', ')}`);
  console.error(`  Method:     Generate UNFILTERED research, compare with existing FILTERED`);
  console.error(`  Cost:       ~$${TEST_DATES.length * 2} (${TEST_DATES.length} calls)`);

  const results = [];

  for (let i = 0; i < TEST_DATES.length; i++) {
    const { date, nextDayEvent, lookAheadKeywords } = TEST_DATES[i];
    console.error(`\n  [${i + 1}/${TEST_DATES.length}] Testing ${date}...`);
    console.error(`    Post-date event: ${nextDayEvent}`);

    // Load existing filtered (backfilled) research
    const filteredPath = path.join(RESEARCH_DIR, `${date}_12-00-00.md`);
    let filteredText = '';
    try {
      filteredText = await fs.readFile(filteredPath, 'utf-8');
      console.error(`    Filtered (backfilled): ${filteredText.length} chars loaded`);
    } catch {
      console.error(`    Filtered: NOT FOUND — generating with filter...`);
      const filter = formatDateForPerplexity(date);
      const res = await callPerplexity(buildPrompt(date), filter);
      filteredText = res.text;
      console.error(`    Filtered: generated (${filteredText.length} chars, ${res.latencyMs}ms)`);
      await new Promise(r => setTimeout(r, 3000));
    }

    // Generate unfiltered research (no search_before_date_filter)
    console.error(`    Generating UNFILTERED research (no date constraint)...`);
    const unfilteredRes = await callPerplexity(buildPrompt(date), null);
    const unfilteredText = unfilteredRes.text;
    console.error(`    Unfiltered: ${unfilteredText.length} chars, ${unfilteredRes.latencyMs}ms`);

    // Scan both for look-ahead keywords
    const filteredLookAhead = scanForLookAhead(filteredText, lookAheadKeywords, date);
    const unfilteredLookAhead = scanForLookAhead(unfilteredText, lookAheadKeywords, date);

    const result = {
      date,
      nextDayEvent,
      filtered: {
        chars: filteredText.length,
        lookAheadHits: filteredLookAhead.length,
        lookAheadDetails: filteredLookAhead
      },
      unfiltered: {
        chars: unfilteredText.length,
        latencyMs: unfilteredRes.latencyMs,
        tokens: unfilteredRes.usage.total_tokens || 0,
        lookAheadHits: unfilteredLookAhead.length,
        lookAheadDetails: unfilteredLookAhead
      },
      filterEffective: filteredLookAhead.length <= unfilteredLookAhead.length
    };
    results.push(result);

    console.error(`    Filtered look-ahead hits:   ${filteredLookAhead.length}`);
    console.error(`    Unfiltered look-ahead hits:  ${unfilteredLookAhead.length}`);
    if (filteredLookAhead.length > 0) {
      console.error(`    ⚠ FILTER LEAKAGE detected:`);
      for (const f of filteredLookAhead) {
        console.error(`      "${f.keyword}" → ...${f.context}...`);
      }
    }

    // Save unfiltered output
    await fs.writeFile(
      path.join(OUTPUT_DIR, `${date}_unfiltered.md`),
      `# Unfiltered Research: ${date}\n\n${unfilteredText}\n\n---\n*Generated without search_before_date_filter*\n`,
      'utf-8'
    );

    if (i < TEST_DATES.length - 1) await new Promise(r => setTimeout(r, 5000));
  }

  // Summary
  const summary = {
    testDate: new Date().toISOString(),
    model: MODEL,
    results,
    overallAssessment: {
      totalTests: results.length,
      filterLeakages: results.filter(r => r.filtered.lookAheadHits > 0).length,
      unfilteredLeakages: results.filter(r => r.unfiltered.lookAheadHits > 0).length,
      conclusion: results.every(r => r.filtered.lookAheadHits === 0)
        ? 'Filter appears effective — no look-ahead keywords detected in filtered research'
        : `Filter shows partial leakage — ${results.filter(r => r.filtered.lookAheadHits > 0).length}/${results.length} dates had look-ahead keywords in filtered output`
    }
  };

  await fs.writeFile(path.join(OUTPUT_DIR, 'validation-results.json'), JSON.stringify(summary, null, 2), 'utf-8');

  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║  Validation Results                        ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`  Total tests:          ${summary.overallAssessment.totalTests}`);
  console.error(`  Filter leakages:      ${summary.overallAssessment.filterLeakages}`);
  console.error(`  Unfiltered leakages:  ${summary.overallAssessment.unfilteredLeakages}`);
  console.error(`  Conclusion:           ${summary.overallAssessment.conclusion}`);
  console.error(`\n  Results saved to: ${OUTPUT_DIR}/`);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
