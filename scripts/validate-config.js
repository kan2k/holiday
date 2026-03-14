import 'dotenv/config';
import { loadAgentConfig } from '../utils/validation.js';
import { createHyperliquidClient } from '../exchanges/hyperliquid.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Validate agent configuration
 * 
 * Usage:
 *   node scripts/validate-config.js                    # Validate example-agent
 *   node scripts/validate-config.js --agent my-agent  # Validate specific agent
 */

async function main() {
  const args = process.argv.slice(2);
  let agentId = 'example-agent';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      agentId = args[i + 1];
      i++;
    }
  }

  console.log(`🔍 Validating agent config: ${agentId}\n`);

  const configPath = path.join(process.cwd(), 'config', 'agents', `${agentId}.json`);

  // Check file exists
  try {
    await fs.access(configPath);
  } catch {
    console.error(`❌ Config file not found: ${configPath}`);
    process.exit(1);
  }

  // Create Hyperliquid client for validation
  const hyperliquid = createHyperliquidClient({});

  // Load and validate
  const result = await loadAgentConfig(configPath, hyperliquid);

  console.log('Schema Validation:', result.valid ? '✅ Pass' : '❌ Fail');
  
  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(e => console.log(`  ❌ ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }

  if (result.valid) {
    console.log('\n✅ Configuration is valid!');
    console.log('\nConfig summary:');
    console.log(`  Agent ID: ${result.config.agentId}`);
    console.log(`  Loop Interval: ${result.config.loopInterval / 1000 / 60} minutes`);
    console.log(`  Trading Pairs: ${result.config.tradingPairs.length}`);
    result.config.tradingPairs.forEach(p => {
      console.log(`    - ${p.symbol} (${p.market})`);
    });
  } else {
    console.log('\n❌ Configuration has errors. Please fix and try again.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
