import 'dotenv/config';
import { createAgentLoop } from './agent-loop.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Holiday - Autonomous AI Trading Agent
 * "Go on holiday while your AI trades 24/7"
 * 
 * Usage:
 *   node index.js                     # Run with default example-agent config
 *   node index.js --agent my-agent    # Run with specific agent config
 *   node index.js --once              # Run single iteration (for testing)
 *   node index.js --validate          # Validate config only
 */

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  ██╗  ██╗ ██████╗ ██╗     ██╗██████╗  █████╗ ██╗   ██╗        ║
║  ██║  ██║██╔═══██╗██║     ██║██╔══██╗██╔══██╗╚██╗ ██╔╝        ║
║  ███████║██║   ██║██║     ██║██║  ██║███████║ ╚████╔╝         ║
║  ██╔══██║██║   ██║██║     ██║██║  ██║██╔══██║  ╚██╔╝          ║
║  ██║  ██║╚██████╔╝███████╗██║██████╔╝██║  ██║   ██║           ║
║  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   🏖️      ║
║                                                               ║
║        Your AI trades while you take a break                  ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    agent: 'example-agent',
    once: false,
    validate: false,
    noResearch: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      options.agent = args[i + 1];
      i++;
    } else if (args[i] === '--once') {
      options.once = true;
    } else if (args[i] === '--validate') {
      options.validate = true;
    } else if (args[i] === '--no-research') {
      options.noResearch = true;
    } else if (args[i] === '--help') {
      showHelp();
      process.exit(0);
    }
  }

  // Check for OpenRouter API key
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('\n❌ Error: OPENROUTER_API_KEY not set');
    console.error('   Create a .env file with your OpenRouter API key:');
    console.error('   OPENROUTER_API_KEY=your_key_here\n');
    process.exit(1);
  }

  // Find config file
  const configPath = path.join(process.cwd(), 'config', 'agents', `${options.agent}.json`);
  
  try {
    await fs.access(configPath);
  } catch {
    console.error(`\n❌ Error: Config file not found: ${configPath}`);
    console.error(`   Create a config file at config/agents/${options.agent}.json\n`);
    process.exit(1);
  }

  console.log(`📋 Agent: ${options.agent}`);
  console.log(`📁 Config: ${configPath}`);
  if (options.noResearch) console.log(`📚 Research: disabled (use research:daemon separately)`);
  console.log('');

  // Create agent
  const agent = createAgentLoop(configPath, { skipResearch: options.noResearch });

  // Validate only mode
  if (options.validate) {
    console.log('🔍 Validating configuration...\n');
    try {
      await agent.initialize();
      console.log('\n✅ Configuration is valid!');
    } catch (error) {
      console.error(`\n❌ Validation failed: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  // Single iteration mode
  if (options.once) {
    console.log('🔄 Running single iteration...\n');
    try {
      const result = await agent.runOnce();
      console.log('\n📊 Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  // Full loop mode
  try {
    await agent.initialize();
    await agent.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
      agent.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
      agent.stop();
      process.exit(0);
    });

    console.log('\n🚀 Agent is running. Press Ctrl+C to stop.\n');

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Usage: node index.js [options]

Options:
  --agent <name>    Specify agent config name (default: example-agent)
  --once            Run single iteration and exit
  --validate        Validate config and exit
  --no-research     Disable built-in research (use research:daemon instead)
  --help            Show this help message

Examples:
  node index.js --agent my-trader                  # Run with built-in research
  node index.js --agent my-trader --no-research    # Skip research (use daemon)
  node index.js --once                             # Test single iteration
  node index.js --validate                         # Check config validity

Research daemon (run separately, shared by all agents):
  node scripts/research-daemon.js                  # Every 12h (default)
  node scripts/research-daemon.js --interval 6     # Every 6h

Config files should be placed in: config/agents/<name>.json
`);
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
