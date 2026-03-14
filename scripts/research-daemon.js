import 'dotenv/config';
import { createResearchEngine } from '../engines/research.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Standalone Research Daemon
 * 
 * Runs research on a schedule, shared across all agents.
 * Run this once instead of letting each agent duplicate research.
 * 
 * Usage:
 *   node scripts/research-daemon.js                          # Default: every 12h
 *   node scripts/research-daemon.js --interval 6             # Every 6 hours
 *   node scripts/research-daemon.js --query "BTC outlook"    # Custom query
 *   node scripts/research-daemon.js --once                   # Run once and exit
 */

async function main() {
  const args = process.argv.slice(2);
  let intervalHours = 12;
  let query = 'Macro Market Today';
  let once = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) {
      intervalHours = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--query' && args[i + 1]) {
      query = args[i + 1];
      i++;
    } else if (args[i] === '--once') {
      once = true;
    } else if (args[i] === '--help') {
      showHelp();
      process.exit(0);
    }
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY not set in .env');
    process.exit(1);
  }

  console.log(`
┌─────────────────────────────────────────────┐
│  📚 Research Daemon                         │
│  Shared research engine for all agents      │
├─────────────────────────────────────────────┤
│  Query:    ${query.padEnd(33)}│
│  Interval: ${(intervalHours + 'h').padEnd(33)}│
│  Mode:     ${(once ? 'single run' : 'continuous').padEnd(33)}│
└─────────────────────────────────────────────┘
`);

  const config = {
    agentId: 'research-daemon',
    models: { research: 'perplexity/sonar-deep-research' },
    researchInterval: intervalHours * 3600000,
  };

  const engine = createResearchEngine(config);

  const runOnce = async () => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] Running research: "${query}"`);
    const result = await engine.runResearch(query);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✅ Done in ${elapsed}s → ${result.filepath}`);
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Failed: ${result.error}`);
    }
    return result;
  };

  if (once) {
    await runOnce();
    return;
  }

  // Run immediately, then on interval
  await runOnce();

  const intervalMs = intervalHours * 3600000;
  console.log(`\n⏰ Next run in ${intervalHours}h. Press Ctrl+C to stop.\n`);

  const loop = setInterval(async () => {
    await runOnce();
    console.log(`\n⏰ Next run in ${intervalHours}h.\n`);
  }, intervalMs);

  process.on('SIGINT', () => {
    clearInterval(loop);
    console.log('\n🛑 Research daemon stopped.');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clearInterval(loop);
    process.exit(0);
  });
}

function showHelp() {
  console.log(`
Research Daemon - Shared research for all agents

Usage: node scripts/research-daemon.js [options]

Options:
  --interval <hours>   Research interval in hours (default: 12)
  --query "<text>"     Custom research query (default: "Macro Market Today")
  --once               Run once and exit
  --help               Show this help

Examples:
  node scripts/research-daemon.js                        # Every 12h
  node scripts/research-daemon.js --interval 6           # Every 6h
  node scripts/research-daemon.js --once                 # Single run
  node scripts/research-daemon.js --query "Gold outlook"  # Custom query
`);
}

main().catch(error => {
  console.error('Fatal:', error.message);
  process.exit(1);
});
