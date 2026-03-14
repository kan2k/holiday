#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'perplexity/sonar-deep-research';
const OUTPUT_DIR = path.join(process.cwd(), 'analysis', 'research-prompt-comparison');

// ─── Prompt A: Simple (current Holiday approach) ─────────────────────────────

const PROMPT_A_NAME = 'simple';
const PROMPT_A = `Macro Market Today`;

// ─── Prompt B: Complex structured (XML framework + JSON output) ──────────────

const PROMPT_B_NAME = 'complex';
const PROMPT_B = `<role>
You are an expert cryptocurrency market researcher specializing in Bitcoin analysis. Provide thorough, data-driven analysis with specific insights and actionable recommendations. When previous research is provided in code blocks, build upon those insights and focus on new developments.
</role>

<critical_instructions>
• ALWAYS use current web data to validate and enhance your analysis
• NEVER rely solely on training data for recent market events
• MUST correlate price movements with specific, verified events
• REQUIRE factual basis for all claims about market developments
• VALIDATE all event timings against actual occurrence dates
</critical_instructions>

<analysis_framework>
<price_movement_analysis>
• Identify significant price changes from Bitcoin data (>2-3% moves)
• Correlate each major price movement with specific events, news, or developments
• Assess the impact magnitude: How much did each event move the market?
• Note any delayed reactions or multi-day impacts from single events
• Focus on the "why" behind market movements with specific event-to-price correlations, and use historical patterns to estimate future impacts.
• Use the historical data as ground truth to validate your analysis.
</price_movement_analysis>

<market_conditions>
• Liquidity, funding rates, and exchange flows
• Institutional vs retail activity patterns
• How current conditions compare to historical periods with similar price action
• Derivatives Market Activity: Open interest, perpetuals funding rates, options implied volatility, and their influence on spot price
</market_conditions>

<external_factors>
• Fed policy, economic data, and regulatory news
• Traditional market correlations and risk sentiment
• Specific events that caused the price movements shown in the data
</external_factors>

<crypto_fundamentals>
• Network activity, ETF flows, and stablecoin dynamics
• Major events, upgrades, or announcements that align with price changes
• On-chain metrics that support or contradict price movements
</crypto_fundamentals>

<event_impact_mapping>
• Create connections between specific events and percentage price changes
• Identify which types of events have the strongest market impact
• Note any patterns in how quickly markets react to different event types
</event_impact_mapping>

<forward_looking_analysis>
• Identify upcoming events in the next specified timeframe days (economic data, Fed meetings, earnings, crypto events, etc.)
• Find very recent events (last 24-48 hours) that markets haven't fully reacted to yet
• Use historical event impact patterns to estimate potential price movements
• Consider event timing, market conditions, and historical precedents
</forward_looking_analysis>
</analysis_framework>

<output_requirements>
You must ONLY respond with a structured JSON object containing your analysis with the following format:
\`\`\`
{
  "title": "Main title for the market research report",
  "keyFindings": {
    "summary": "Executive summary of key findings (2-3 sentences)",
    "priceRange": { "low": "Low", "high": "High", "current": "Current" },
    "timeframe": "Time period analyzed"
  },
  "priceAnalysis": {
    "overview": "General overview",
    "significantMoves": [{ "timestamp": "", "priceChange": "", "priceChangePercent": "", "description": "" }],
    "macroeconomicCorrelations": [{ "factor": "", "impact": "", "priceEffect": "" }],
    "regulatoryCatalysts": [{ "event": "", "date": "", "impact": "", "priceEffect": "" }],
    "eventImpactMapping": {
      "highImpactEvents": [{ "event": "", "date": "", "priceChange": "", "priceChangePercent": "", "timeLag": "", "description": "" }],
      "lowImpactEvents": [{ "event": "", "date": "", "priceChangePercent": "", "description": "" }]
    },
    "currentMarketDrivers": {
      "institutionalActivity": { "description": "", "metrics": [{ "metric": "", "value": "", "trend": "" }] },
      "derivativesMarket": { "fundingRates": "", "openInterest": "", "volatility": "" },
      "macroFiscalFactors": [{ "factor": "", "impact": "", "outlook": "" }]
    },
    "patternRecognition": {
      "strongestImpactors": [],
      "weakestImpactors": [],
      "reactionTimelines": [{ "eventType": "", "timeframe": "", "conviction": "" }]
    },
    "forwardLookingAnalysis": {
      "immediateEvents": [{ "event": "", "timeframe": "", "impact": "", "historicalPattern": "", "prediction": { "priceChangePercent": "", "direction": "", "confidence": "" } }],
      "unpricedRecentEvents": [{ "event": "", "date": "", "prediction": { "priceChangePercent": "", "direction": "", "timeframe": "" } }],
      "priceProjections": {
        "baseCase": { "probability": "", "priceRange": "", "description": "" },
        "bullCase": { "probability": "", "priceTarget": "", "catalysts": [] },
        "bearCase": { "probability": "", "priceTarget": "", "risks": [] }
      }
    },
    "conclusion": {
      "synthesis": "",
      "strategicImplications": "",
      "recommendations": { "traders": "", "institutions": "", "monitoring": "" }
    }
  }
}
\`\`\`
</output_requirements>`;

// ─── Run Experiment ──────────────────────────────────────────────────────────

async function callPerplexity(prompt, label) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  console.error(`\n  [${label}] Calling Perplexity sonar-deep-research...`);
  const startTime = Date.now();

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
      max_tokens: 4096
    })
  });

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};

  return {
    label,
    text,
    latencyMs,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    textLength: text.length,
    wordCount: text.split(/\s+/).length,
    lineCount: text.split('\n').length,
    rawUsage: usage,
    rawModel: data.model || MODEL
  };
}

function analyzeContent(text, label) {
  const sections = (text.match(/^#{1,3}\s+.+$/gm) || []).map(s => s.trim());
  const bulletPoints = (text.match(/^[\-\*•]\s+.+$/gm) || []).length;
  const percentages = (text.match(/\d+\.?\d*\s*%/g) || []).length;
  const dollarAmounts = (text.match(/\$[\d,]+\.?\d*/g) || []).length;
  const citations = (text.match(/\[\d+\]/g) || []).length;
  const uniqueCitations = new Set((text.match(/\[\d+\]/g) || []).map(c => c)).size;
  const urls = (text.match(/https?:\/\/[^\s\)]+/g) || []).length;

  const hasJSON = text.includes('{') && text.includes('"title"');
  let jsonValid = false;
  if (hasJSON) {
    try {
      const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) JSON.parse(jsonMatch[1]);
      jsonValid = !!jsonMatch;
    } catch { /* not valid */ }
  }

  const actionableSignals = [];
  if (/\b(long|short|buy|sell|bullish|bearish)\b/i.test(text)) actionableSignals.push('directional bias');
  if (/\b(support|resistance|level|target)\b/i.test(text)) actionableSignals.push('price levels');
  if (/\b(risk|stop.?loss|position.?size)\b/i.test(text)) actionableSignals.push('risk management');
  if (/\b(next\s+\d+|24.?48|upcoming|catalyst)\b/i.test(text)) actionableSignals.push('forward-looking');
  if (/\b(RSI|MACD|moving.?average|volume|funding)\b/i.test(text)) actionableSignals.push('technical indicators');
  if (/\b(Fed|CPI|inflation|GDP|employment|rate)\b/i.test(text)) actionableSignals.push('macro factors');
  if (/\b(ETF|institutional|whale|on.?chain)\b/i.test(text)) actionableSignals.push('institutional/on-chain');

  return {
    label,
    sections: sections.length,
    sectionNames: sections,
    bulletPoints,
    percentages,
    dollarAmounts,
    citations,
    uniqueCitations,
    urls,
    hasJSON,
    jsonValid,
    actionableSignals,
    actionableScore: actionableSignals.length
  };
}

async function main() {
  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║  Research Prompt A/B Comparison            ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`  Model:    ${MODEL}`);
  console.error(`  Prompt A: "Simple" (${PROMPT_A.length} chars input)`);
  console.error(`  Prompt B: "Complex" (${PROMPT_B.length} chars input)`);
  console.error(`  Cost:     ~$4.00 (2 calls × ~$2/call)`);
  console.error(`  Output:   ${OUTPUT_DIR}`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Run Prompt A
  const resultA = await callPerplexity(PROMPT_A, PROMPT_A_NAME);
  console.error(`  [${PROMPT_A_NAME}] Done in ${(resultA.latencyMs / 1000).toFixed(1)}s — ${resultA.textLength} chars, ${resultA.totalTokens} tokens`);

  // Brief delay between calls
  console.error(`\n  Waiting 5s between calls...`);
  await new Promise(r => setTimeout(r, 5000));

  // Run Prompt B
  const resultB = await callPerplexity(PROMPT_B, PROMPT_B_NAME);
  console.error(`  [${PROMPT_B_NAME}] Done in ${(resultB.latencyMs / 1000).toFixed(1)}s — ${resultB.textLength} chars, ${resultB.totalTokens} tokens`);

  // Content analysis
  const analysisA = analyzeContent(resultA.text, PROMPT_A_NAME);
  const analysisB = analyzeContent(resultB.text, PROMPT_B_NAME);

  // Save raw outputs
  await fs.writeFile(path.join(OUTPUT_DIR, 'prompt-a-simple.md'), resultA.text, 'utf-8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'prompt-b-complex.md'), resultB.text, 'utf-8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'prompt-a-input.txt'), PROMPT_A, 'utf-8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'prompt-b-input.txt'), PROMPT_B, 'utf-8');

  // Build comparison report
  const report = {
    experimentDate: new Date().toISOString(),
    model: MODEL,
    prompts: {
      simple: { name: PROMPT_A_NAME, inputChars: PROMPT_A.length, inputTokensEstimate: Math.round(PROMPT_A.length / 4) },
      complex: { name: PROMPT_B_NAME, inputChars: PROMPT_B.length, inputTokensEstimate: Math.round(PROMPT_B.length / 4) }
    },
    results: {
      simple: {
        latencyMs: resultA.latencyMs,
        promptTokens: resultA.promptTokens,
        completionTokens: resultA.completionTokens,
        totalTokens: resultA.totalTokens,
        outputChars: resultA.textLength,
        outputWords: resultA.wordCount,
        outputLines: resultA.lineCount,
        ...analysisA
      },
      complex: {
        latencyMs: resultB.latencyMs,
        promptTokens: resultB.promptTokens,
        completionTokens: resultB.completionTokens,
        totalTokens: resultB.totalTokens,
        outputChars: resultB.textLength,
        outputWords: resultB.wordCount,
        outputLines: resultB.lineCount,
        ...analysisB
      }
    },
    comparison: {
      latencyDiffMs: resultB.latencyMs - resultA.latencyMs,
      latencyRatio: (resultB.latencyMs / resultA.latencyMs).toFixed(2),
      promptTokenRatio: resultA.promptTokens > 0 ? (resultB.promptTokens / resultA.promptTokens).toFixed(2) : 'N/A',
      completionTokenRatio: resultA.completionTokens > 0 ? (resultB.completionTokens / resultA.completionTokens).toFixed(2) : 'N/A',
      outputCharRatio: (resultB.textLength / resultA.textLength).toFixed(2),
      inputCharRatio: (PROMPT_B.length / PROMPT_A.length).toFixed(2),
      actionableScoreDiff: analysisB.actionableScore - analysisA.actionableScore,
      citationDiff: analysisB.uniqueCitations - analysisA.uniqueCitations,
      dataDensity: {
        simple: ((analysisA.percentages + analysisA.dollarAmounts) / resultA.wordCount * 100).toFixed(2) + '%',
        complex: ((analysisB.percentages + analysisB.dollarAmounts) / resultB.wordCount * 100).toFixed(2) + '%'
      }
    }
  };

  await fs.writeFile(path.join(OUTPUT_DIR, 'results.json'), JSON.stringify(report, null, 2), 'utf-8');

  // Print summary
  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║  Comparison Results                       ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`\n  ${'Metric'.padEnd(30)} ${'Simple'.padEnd(18)} ${'Complex'.padEnd(18)} Winner`);
  console.error(`  ${'─'.repeat(84)}`);

  const metrics = [
    ['Input chars', PROMPT_A.length, PROMPT_B.length, 'lower'],
    ['Input tokens (est)', Math.round(PROMPT_A.length / 4), Math.round(PROMPT_B.length / 4), 'lower'],
    ['Prompt tokens (actual)', resultA.promptTokens, resultB.promptTokens, 'lower'],
    ['Completion tokens', resultA.completionTokens, resultB.completionTokens, 'higher'],
    ['Latency (s)', (resultA.latencyMs / 1000).toFixed(1), (resultB.latencyMs / 1000).toFixed(1), 'lower'],
    ['Output chars', resultA.textLength, resultB.textLength, 'higher'],
    ['Output words', resultA.wordCount, resultB.wordCount, 'higher'],
    ['Sections (headers)', analysisA.sections, analysisB.sections, 'higher'],
    ['Bullet points', analysisA.bulletPoints, analysisB.bulletPoints, 'higher'],
    ['Data points (%)', analysisA.percentages, analysisB.percentages, 'higher'],
    ['Dollar amounts ($)', analysisA.dollarAmounts, analysisB.dollarAmounts, 'higher'],
    ['Citations [n]', analysisA.uniqueCitations, analysisB.uniqueCitations, 'higher'],
    ['Actionable signals', analysisA.actionableScore, analysisB.actionableScore, 'higher'],
    ['JSON output', analysisA.hasJSON ? 'No' : 'No', analysisB.hasJSON ? 'Yes' : 'No', 'n/a'],
  ];

  for (const [name, a, b, betterIs] of metrics) {
    const aStr = String(a).padEnd(18);
    const bStr = String(b).padEnd(18);
    let winner = '—';
    if (betterIs === 'lower') winner = parseFloat(a) <= parseFloat(b) ? 'Simple' : 'Complex';
    else if (betterIs === 'higher') winner = parseFloat(a) >= parseFloat(b) ? 'Simple' : 'Complex';
    console.error(`  ${name.padEnd(30)} ${aStr} ${bStr} ${winner}`);
  }

  console.error(`\n  Actionable signals (Simple): ${analysisA.actionableSignals.join(', ')}`);
  console.error(`  Actionable signals (Complex): ${analysisB.actionableSignals.join(', ')}`);

  console.error(`\n  Data density: Simple=${report.comparison.dataDensity.simple} | Complex=${report.comparison.dataDensity.complex}`);
  console.error(`  Files saved to: ${OUTPUT_DIR}/`);

  // Output JSON for programmatic use
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
