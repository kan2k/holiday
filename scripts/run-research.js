import 'dotenv/config';
import { createResearchEngine } from '../engines/research.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Manually run the research engine
 * 
 * Usage:
 *   node scripts/run-research.js                    # Default query
 *   node scripts/run-research.js "Custom query"    # Custom query
 *   node scripts/run-research.js --agent my-agent  # Specific agent
 */

async function main() {
  const args = process.argv.slice(2);
  let agentId = 'example-agent';
  let query = 'Macro Market Today';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      agentId = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      query = args[i];
    }
  }

  console.log(`📚 Research Engine - Manual Run`);
  console.log(`   Agent: ${agentId}`);
  console.log(`   Query: "${query}"`);
  console.log('');

  // Check API key
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY not set in .env');
    process.exit(1);
  }

  // Load agent config
  const configPath = path.join(process.cwd(), 'config', 'agents', `${agentId}.json`);
  
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    const engine = createResearchEngine(config);
    
    console.log('🔍 Running research...\n');
    const result = await engine.runResearch(query);
    
    if (result.success) {
      console.log('\n✅ Research complete!');
      console.log(`📁 Saved to: ${result.filepath}`);
    } else {
      console.error('\n❌ Research failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
