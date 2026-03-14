#!/usr/bin/env node
/**
 * Blindspot Comparison: Simple vs Complex Research Prompts
 * 
 * Systematically scans both prompt outputs across multiple dates
 * for topic coverage in 10 categories, producing a coverage matrix
 * that reveals which topics each prompt consistently covers or misses.
 */
import fs from 'fs/promises';
import path from 'path';

const SIMPLE_DIR = path.join(process.cwd(), 'analysis', 'research-prompt-comparison', 'backtest', 'research-simple');
const COMPLEX_DIR = path.join(process.cwd(), 'analysis', 'research-prompt-comparison', 'backtest', 'research-complex');
const OUTPUT_DIR = path.join(process.cwd(), 'analysis', 'blindspot-comparison');

const DATES = [
  '2026-02-28',
  '2026-03-01',
  '2026-03-02',
  '2026-03-03',
  '2026-03-04',
  '2026-03-05',
  '2026-03-06',
  '2026-03-07'
];

const COVERAGE_CATEGORIES = {
  'BTC Price Data': {
    keywords: ['bitcoin', 'btc', 'btc/usd', 'bitcoin price'],
    dataPatterns: [/\$\d{2,3},\d{3}/g, /btc.*?\$[\d,]+/gi, /bitcoin.*?\$[\d,]+/gi],
    description: 'Specific Bitcoin price levels, ranges, and movements'
  },
  'ETH Price Data': {
    keywords: ['ethereum', 'eth', 'eth/usd', 'ether'],
    dataPatterns: [/eth.*?\$[\d,]+/gi, /ethereum.*?\$[\d,]+/gi],
    description: 'Specific Ethereum price levels, ranges, and movements'
  },
  'Altcoin Coverage': {
    keywords: ['solana', 'sol', 'xrp', 'cardano', 'ada', 'doge', 'dogecoin', 'avax', 'matic', 'polygon', 'altcoin'],
    dataPatterns: [],
    description: 'Coverage of altcoins beyond BTC and ETH'
  },
  'Technical Indicators': {
    keywords: ['rsi', 'macd', 'moving average', 'bollinger', 'support', 'resistance', 'fibonacci', 'volume profile', 'ema', 'sma', 'trend line', 'breakout', 'breakdown'],
    dataPatterns: [/rsi.*?\d+/gi, /support.*?\$[\d,]+/gi, /resistance.*?\$[\d,]+/gi],
    description: 'Technical analysis indicators and chart patterns'
  },
  'On-Chain Metrics': {
    keywords: ['on-chain', 'onchain', 'whale', 'exchange flow', 'exchange inflow', 'exchange outflow', 'active addresses', 'hash rate', 'mining', 'miner', 'nvt', 'mvrv', 'sopr', 'realized price', 'utxo', 'accumulation', 'distribution'],
    dataPatterns: [],
    description: 'Blockchain-native metrics and on-chain analysis'
  },
  'Institutional Activity': {
    keywords: ['etf', 'institutional', 'blackrock', 'fidelity', 'grayscale', 'microstrategy', 'saylor', 'spot etf', 'etf flow', 'etf inflow', 'etf outflow', 'ria', 'registered investment'],
    dataPatterns: [/etf.*?\$[\d,]+/gi, /inflow.*?\$[\d,]+/gi, /outflow.*?\$[\d,]+/gi],
    description: 'ETF flows, institutional positions, and corporate adoption'
  },
  'Macro Economic Data': {
    keywords: ['cpi', 'inflation', 'gdp', 'employment', 'nonfarm', 'payroll', 'unemployment', 'pce', 'retail sales', 'consumer sentiment', 'consumer confidence', 'pmi', 'ism', 'housing', 'treasury', 'yield', 'bond'],
    dataPatterns: [/\d+\.?\d*\s*%.*?(inflation|cpi|gdp|unemployment)/gi, /(inflation|cpi|gdp|unemployment).*?\d+\.?\d*\s*%/gi],
    description: 'Economic indicators: CPI, GDP, employment, PMI, etc.'
  },
  'Fed Policy': {
    keywords: ['federal reserve', 'fed ', 'fomc', 'powell', 'rate cut', 'rate hike', 'monetary policy', 'hawkish', 'dovish', 'basis point', 'federal funds', 'quantitative', 'tightening', 'easing', 'balance sheet'],
    dataPatterns: [/\d+\.?\d*\s*%.*?rate/gi, /rate.*?\d+\.?\d*\s*%/gi, /\d+\s*basis\s*point/gi],
    description: 'Federal Reserve policy, rate decisions, and forward guidance'
  },
  'Geopolitical Events': {
    keywords: ['geopolit', 'war', 'conflict', 'sanction', 'tariff', 'trade war', 'iran', 'china', 'russia', 'ukraine', 'middle east', 'military', 'oil price', 'crude', 'energy price', 'strait of hormuz'],
    dataPatterns: [],
    description: 'Geopolitical tensions, trade policy, and their market impact'
  },
  'Regulatory Developments': {
    keywords: ['regulation', 'regulatory', 'sec', 'cftc', 'clarity act', 'stablecoin', 'legislation', 'compliance', 'enforcement', 'legal', 'lawsuit', 'court', 'congress', 'senate', 'bill'],
    dataPatterns: [],
    description: 'Crypto regulation, legislation, and legal developments'
  },
  'Derivatives Market': {
    keywords: ['futures', 'options', 'open interest', 'funding rate', 'perpetual', 'perp', 'liquidation', 'leverage', 'margin', 'implied volatility', 'iv ', 'put/call', 'put-call', 'options expiry', 'max pain'],
    dataPatterns: [/open interest.*?\$[\d,]+/gi, /funding.*?[\d.]+\s*%/gi],
    description: 'Futures, options, funding rates, and derivatives activity'
  },
  'Stablecoin Dynamics': {
    keywords: ['stablecoin', 'usdt', 'usdc', 'tether', 'circle', 'dai', 'stablecoin market cap', 'stablecoin flow', 'depeg'],
    dataPatterns: [],
    description: 'Stablecoin supply, flows, and market cap changes'
  },
  'Risk Assessment': {
    keywords: ['risk', 'vix', 'volatility index', 'fear', 'greed', 'fear & greed', 'fear and greed', 'tail risk', 'black swan', 'systemic', 'contagion', 'drawdown', 'max drawdown'],
    dataPatterns: [/vix.*?\d+/gi, /fear.*?\d+/gi],
    description: 'Risk metrics, volatility indices, and sentiment gauges'
  },
  'Forward-Looking Catalysts': {
    keywords: ['upcoming', 'next week', 'catalyst', 'outlook', 'forecast', 'projection', 'prediction', 'expect', 'anticipat', 'forward', 'ahead', 'next month', 'calendar', 'scheduled'],
    dataPatterns: [],
    description: 'Forward-looking events, catalysts, and predictions'
  },
  'DeFi & Protocol News': {
    keywords: ['defi', 'decentralized finance', 'tvl', 'total value locked', 'yield', 'apy', 'apr', 'liquidity pool', 'amm', 'dex', 'uniswap', 'aave', 'compound', 'lido', 'staking', 'restaking', 'layer 2', 'l2', 'rollup'],
    dataPatterns: [],
    description: 'DeFi protocols, TVL, yields, and protocol developments'
  }
};

function analyzeFile(text, categories) {
  const lower = text.toLowerCase();
  const results = {};

  for (const [category, config] of Object.entries(categories)) {
    const keywordHits = [];
    for (const kw of config.keywords) {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = text.match(regex);
      if (matches) {
        keywordHits.push({ keyword: kw, count: matches.length });
      }
    }

    let dataPointCount = 0;
    const dataExamples = [];
    for (const pattern of config.dataPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        dataPointCount += matches.length;
        dataExamples.push(...matches.slice(0, 3));
      }
    }

    const totalHits = keywordHits.reduce((sum, h) => sum + h.count, 0);
    const uniqueKeywords = keywordHits.length;

    results[category] = {
      covered: totalHits > 0,
      totalMentions: totalHits,
      uniqueKeywordsHit: uniqueKeywords,
      keywordsTotal: config.keywords.length,
      coverageDepth: uniqueKeywords >= 3 ? 'deep' : uniqueKeywords >= 1 ? 'shallow' : 'absent',
      dataPoints: dataPointCount,
      dataExamples: dataExamples.slice(0, 3),
      topKeywords: keywordHits.sort((a, b) => b.count - a.count).slice(0, 5)
    };
  }

  return results;
}

function computeStats(text) {
  return {
    chars: text.length,
    words: text.split(/\s+/).length,
    sections: (text.match(/^#{1,3}\s+.+$/gm) || []).length,
    percentages: (text.match(/\d+\.?\d*\s*%/g) || []).length,
    dollarAmounts: (text.match(/\$[\d,]+\.?\d*/g) || []).length,
    citations: new Set((text.match(/\[\d+\]/g) || [])).size,
    bulletPoints: (text.match(/^[\-\*•]\s+.+$/gm) || []).length,
  };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.error(`\n╔══════════════════════════════════════════╗`);
  console.error(`║  Blindspot Coverage Comparison             ║`);
  console.error(`╚══════════════════════════════════════════╝`);
  console.error(`  Dates:      ${DATES.length} (${DATES[0]} to ${DATES[DATES.length - 1]})`);
  console.error(`  Categories: ${Object.keys(COVERAGE_CATEGORIES).length}`);

  const results = [];

  for (const date of DATES) {
    const filename = `${date}_12-00-00.md`;
    const simplePath = path.join(SIMPLE_DIR, filename);
    const complexPath = path.join(COMPLEX_DIR, filename);

    let simpleText, complexText;
    try {
      simpleText = await fs.readFile(simplePath, 'utf-8');
    } catch {
      console.error(`  [${date}] Simple research not found, skipping`);
      continue;
    }
    try {
      complexText = await fs.readFile(complexPath, 'utf-8');
    } catch {
      console.error(`  [${date}] Complex research not found, skipping`);
      continue;
    }

    const simpleAnalysis = analyzeFile(simpleText, COVERAGE_CATEGORIES);
    const complexAnalysis = analyzeFile(complexText, COVERAGE_CATEGORIES);
    const simpleStats = computeStats(simpleText);
    const complexStats = computeStats(complexText);

    const dateResult = {
      date,
      simple: { stats: simpleStats, coverage: simpleAnalysis },
      complex: { stats: complexStats, coverage: complexAnalysis }
    };
    results.push(dateResult);

    console.error(`  [${date}] Simple: ${simpleStats.chars} chars, ${simpleStats.words} words | Complex: ${complexStats.chars} chars, ${complexStats.words} words`);
  }

  // Aggregate across all dates
  const categoryAgg = {};
  for (const cat of Object.keys(COVERAGE_CATEGORIES)) {
    categoryAgg[cat] = {
      simple: { coveredCount: 0, deepCount: 0, shallowCount: 0, absentCount: 0, totalMentions: 0 },
      complex: { coveredCount: 0, deepCount: 0, shallowCount: 0, absentCount: 0, totalMentions: 0 }
    };
  }

  const statsAgg = {
    simple: { chars: 0, words: 0, sections: 0, percentages: 0, dollarAmounts: 0, citations: 0 },
    complex: { chars: 0, words: 0, sections: 0, percentages: 0, dollarAmounts: 0, citations: 0 }
  };

  for (const r of results) {
    for (const cat of Object.keys(COVERAGE_CATEGORIES)) {
      const s = r.simple.coverage[cat];
      const c = r.complex.coverage[cat];

      if (s.covered) categoryAgg[cat].simple.coveredCount++;
      if (s.coverageDepth === 'deep') categoryAgg[cat].simple.deepCount++;
      if (s.coverageDepth === 'shallow') categoryAgg[cat].simple.shallowCount++;
      if (s.coverageDepth === 'absent') categoryAgg[cat].simple.absentCount++;
      categoryAgg[cat].simple.totalMentions += s.totalMentions;

      if (c.covered) categoryAgg[cat].complex.coveredCount++;
      if (c.coverageDepth === 'deep') categoryAgg[cat].complex.deepCount++;
      if (c.coverageDepth === 'shallow') categoryAgg[cat].complex.shallowCount++;
      if (c.coverageDepth === 'absent') categoryAgg[cat].complex.absentCount++;
      categoryAgg[cat].complex.totalMentions += c.totalMentions;
    }

    for (const key of Object.keys(statsAgg.simple)) {
      statsAgg.simple[key] += r.simple.stats[key];
      statsAgg.complex[key] += r.complex.stats[key];
    }
  }

  const n = results.length;

  // Identify blindspots
  const simpleBlindspots = [];
  const complexBlindspots = [];
  const simpleAdvantages = [];
  const complexAdvantages = [];

  for (const [cat, agg] of Object.entries(categoryAgg)) {
    const sRate = agg.simple.coveredCount / n;
    const cRate = agg.complex.coveredCount / n;
    const sDeep = agg.simple.deepCount / n;
    const cDeep = agg.complex.deepCount / n;

    if (sRate < 0.5 && cRate >= 0.5) simpleBlindspots.push({ category: cat, simpleRate: sRate, complexRate: cRate });
    if (cRate < 0.5 && sRate >= 0.5) complexBlindspots.push({ category: cat, simpleRate: sRate, complexRate: cRate });
    if (sDeep > cDeep + 0.2) simpleAdvantages.push({ category: cat, simpleDeep: sDeep, complexDeep: cDeep, sMentions: agg.simple.totalMentions, cMentions: agg.complex.totalMentions });
    if (cDeep > sDeep + 0.2) complexAdvantages.push({ category: cat, simpleDeep: sDeep, complexDeep: cDeep, sMentions: agg.simple.totalMentions, cMentions: agg.complex.totalMentions });
  }

  const summary = {
    experimentDate: new Date().toISOString(),
    datesAnalyzed: results.length,
    dateRange: `${DATES[0]} to ${DATES[DATES.length - 1]}`,
    categoriesAnalyzed: Object.keys(COVERAGE_CATEGORIES).length,
    aggregateStats: {
      simple: {
        avgChars: Math.round(statsAgg.simple.chars / n),
        avgWords: Math.round(statsAgg.simple.words / n),
        avgSections: (statsAgg.simple.sections / n).toFixed(1),
        avgPercentages: (statsAgg.simple.percentages / n).toFixed(1),
        avgDollarAmounts: (statsAgg.simple.dollarAmounts / n).toFixed(1),
        avgCitations: (statsAgg.simple.citations / n).toFixed(1)
      },
      complex: {
        avgChars: Math.round(statsAgg.complex.chars / n),
        avgWords: Math.round(statsAgg.complex.words / n),
        avgSections: (statsAgg.complex.sections / n).toFixed(1),
        avgPercentages: (statsAgg.complex.percentages / n).toFixed(1),
        avgDollarAmounts: (statsAgg.complex.dollarAmounts / n).toFixed(1),
        avgCitations: (statsAgg.complex.citations / n).toFixed(1)
      }
    },
    coverageMatrix: {},
    simpleBlindspots,
    complexBlindspots,
    simpleAdvantages,
    complexAdvantages,
    perDateResults: results
  };

  for (const [cat, agg] of Object.entries(categoryAgg)) {
    summary.coverageMatrix[cat] = {
      simple: {
        coverageRate: `${agg.simple.coveredCount}/${n} (${(agg.simple.coveredCount / n * 100).toFixed(0)}%)`,
        deepRate: `${agg.simple.deepCount}/${n}`,
        shallowRate: `${agg.simple.shallowCount}/${n}`,
        absentRate: `${agg.simple.absentCount}/${n}`,
        avgMentions: (agg.simple.totalMentions / n).toFixed(1)
      },
      complex: {
        coverageRate: `${agg.complex.coveredCount}/${n} (${(agg.complex.coveredCount / n * 100).toFixed(0)}%)`,
        deepRate: `${agg.complex.deepCount}/${n}`,
        shallowRate: `${agg.complex.shallowCount}/${n}`,
        absentRate: `${agg.complex.absentCount}/${n}`,
        avgMentions: (agg.complex.totalMentions / n).toFixed(1)
      },
      winner: agg.simple.totalMentions > agg.complex.totalMentions * 1.2 ? 'Simple' :
              agg.complex.totalMentions > agg.simple.totalMentions * 1.2 ? 'Complex' : 'Tie'
    };
  }

  await fs.writeFile(path.join(OUTPUT_DIR, 'blindspot-results.json'), JSON.stringify(summary, null, 2), 'utf-8');

  // Print coverage matrix
  console.error(`\n  ┌────────────────────────────┬──────────────────────────────┬──────────────────────────────┬────────┐`);
  console.error(`  │ Category                   │ Simple (coverage / mentions) │ Complex (coverage / mentions)│ Winner │`);
  console.error(`  ├────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────┤`);

  for (const [cat, agg] of Object.entries(categoryAgg)) {
    const sStr = `${agg.simple.coveredCount}/${n} (${(agg.simple.totalMentions / n).toFixed(0)} avg)`;
    const cStr = `${agg.complex.coveredCount}/${n} (${(agg.complex.totalMentions / n).toFixed(0)} avg)`;
    const winner = summary.coverageMatrix[cat].winner;
    console.error(`  │ ${cat.padEnd(26)} │ ${sStr.padEnd(28)} │ ${cStr.padEnd(28)} │ ${winner.padEnd(6)} │`);
  }
  console.error(`  └────────────────────────────┴──────────────────────────────┴──────────────────────────────┴────────┘`);

  if (simpleBlindspots.length > 0) {
    console.error(`\n  Simple Prompt BLINDSPOTS (covered <50% but complex covers ≥50%):`);
    for (const b of simpleBlindspots) console.error(`    - ${b.category}: Simple ${(b.simpleRate * 100).toFixed(0)}% vs Complex ${(b.complexRate * 100).toFixed(0)}%`);
  }
  if (complexBlindspots.length > 0) {
    console.error(`\n  Complex Prompt BLINDSPOTS (covered <50% but simple covers ≥50%):`);
    for (const b of complexBlindspots) console.error(`    - ${b.category}: Complex ${(b.complexRate * 100).toFixed(0)}% vs Simple ${(b.simpleRate * 100).toFixed(0)}%`);
  }
  if (simpleAdvantages.length > 0) {
    console.error(`\n  Simple Prompt DEPTH ADVANTAGES (>20% more deep coverage):`);
    for (const a of simpleAdvantages) console.error(`    - ${a.category}: Simple deep ${(a.simpleDeep * 100).toFixed(0)}% vs Complex deep ${(a.complexDeep * 100).toFixed(0)}% | mentions: ${a.sMentions} vs ${a.cMentions}`);
  }
  if (complexAdvantages.length > 0) {
    console.error(`\n  Complex Prompt DEPTH ADVANTAGES (>20% more deep coverage):`);
    for (const a of complexAdvantages) console.error(`    - ${a.category}: Complex deep ${(a.complexDeep * 100).toFixed(0)}% vs Simple deep ${(a.simpleDeep * 100).toFixed(0)}% | mentions: ${a.cMentions} vs ${a.sMentions}`);
  }

  console.error(`\n  Aggregate stats (avg per day):`);
  console.error(`    Simple:  ${summary.aggregateStats.simple.avgChars} chars, ${summary.aggregateStats.simple.avgWords} words, ${summary.aggregateStats.simple.avgSections} sections, ${summary.aggregateStats.simple.avgCitations} citations`);
  console.error(`    Complex: ${summary.aggregateStats.complex.avgChars} chars, ${summary.aggregateStats.complex.avgWords} words, ${summary.aggregateStats.complex.avgSections} sections, ${summary.aggregateStats.complex.avgCitations} citations`);
  console.error(`\n  Results saved to: ${OUTPUT_DIR}/blindspot-results.json`);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
