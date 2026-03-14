import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

const HYPERLIQUID_INFO_API = 'https://api.hyperliquid.xyz/info';

// Known category mappings for xyz HIP-3 assets
const HIP3_CATEGORIES = {
  stocks: ['TSLA', 'NVDA', 'HOOD', 'INTC', 'PLTR', 'COIN', 'META', 'AAPL', 'MSFT', 'ORCL', 'GOOGL', 'AMZN', 'AMD', 'MU', 'SNDK', 'MSTR', 'CRCL', 'NFLX', 'COST', 'LLY', 'TSM', 'RIVN', 'BABA', 'SMSN', 'CRWV', 'GME', 'SKHX'],
  commodities: ['GOLD', 'SILVER', 'COPPER', 'NATGAS', 'URANIUM', 'ALUMINIUM', 'PLATINUM', 'PALLADIUM', 'CL', 'URNM'],
  indices: ['XYZ100', 'KR200', 'USAR', 'DXY'],
  forex: ['JPY', 'EUR']
};

/**
 * Create a new agent with a fresh wallet
 * 
 * Usage:
 *   node scripts/create-agent.js                    # Interactive mode
 *   node scripts/create-agent.js my-trader          # Quick create with name
 *   node scripts/create-agent.js my-trader --yes    # Skip confirmation
 */

const DEFAULT_PERSONAS = {
  cautious: {
    description: `You are a cautious crypto trader focused on risk management. You prefer to wait for clear setups rather than chase momentum. You always consider the macro environment before making decisions. You never risk more than 2% of portfolio on a single trade. When in doubt, you stay in cash.`,
    recommendedLeverage: 2
  },
  
  momentum: {
    description: `You are an aggressive momentum trader who capitalizes on strong trends. You look for breakouts with high volume confirmation. You're comfortable with higher risk but always use stop losses. You prefer to ride winners and cut losers quickly.`,
    recommendedLeverage: 5
  },
  
  contrarian: {
    description: `You are a contrarian trader who looks for oversold conditions and sentiment extremes. You buy fear and sell greed. You're patient and willing to wait for the perfect setup. You scale into positions rather than going all-in.`,
    recommendedLeverage: 3
  },
  
  scalper: {
    description: `You are a short-term scalper focused on quick profits from small price movements. You trade frequently and don't hold positions for long. You focus on high-liquidity pairs and tight spreads. You're disciplined about taking profits and cutting losses fast.`,
    recommendedLeverage: 10
  }
};

async function main() {
  const args = process.argv.slice(2);
  let agentName = args[0];
  const skipConfirm = args.includes('--yes') || args.includes('-y');

  console.log(`
╔════════════════════════════════════════════╗
║        ClawdTrade Agent Generator          ║
╚════════════════════════════════════════════╝
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  try {
    // Get agent name
    if (!agentName || agentName.startsWith('--')) {
      agentName = await question('Agent name (e.g., my-trader): ');
      if (!agentName) {
        console.error('❌ Agent name is required');
        process.exit(1);
      }
    }

    // Sanitize name
    agentName = agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    const configPath = path.join(process.cwd(), 'config', 'agents', `${agentName}.json`);

    // Check if already exists
    try {
      await fs.access(configPath);
      console.error(`❌ Agent "${agentName}" already exists at ${configPath}`);
      process.exit(1);
    } catch {
      // Good, doesn't exist
    }

    // Generate wallet
    console.log('\n🔐 Generating new wallet...');
    const wallet = ethers.Wallet.createRandom();
    
    console.log(`\n✅ Wallet generated!`);
    console.log(`   Address: ${wallet.address}`);
    console.log(`   Private Key: ${wallet.privateKey.slice(0, 10)}...${wallet.privateKey.slice(-6)}`);

    // Select persona
    let persona = DEFAULT_PERSONAS.cautious.description;
    let recommendedLeverage = DEFAULT_PERSONAS.cautious.recommendedLeverage;
    if (!skipConfirm) {
      console.log('\n📝 Select a trading persona:\n');
      console.log('  1. Cautious    (risk-focused, waits for clear setups)     [recommended: 2x]');
      console.log('  2. Momentum    (aggressive, rides trends)                 [recommended: 5x]');
      console.log('  3. Contrarian  (buys fear, sells greed)                   [recommended: 3x]');
      console.log('  4. Scalper     (short-term, quick trades)                 [recommended: 10x]');
      console.log('  5. Custom      (enter your own)\n');

      const personaChoice = await question('Choice [1-5, default: 1]: ') || '1';
      
      switch (personaChoice) {
        case '1':
          persona = DEFAULT_PERSONAS.cautious.description;
          recommendedLeverage = DEFAULT_PERSONAS.cautious.recommendedLeverage;
          break;
        case '2':
          persona = DEFAULT_PERSONAS.momentum.description;
          recommendedLeverage = DEFAULT_PERSONAS.momentum.recommendedLeverage;
          break;
        case '3':
          persona = DEFAULT_PERSONAS.contrarian.description;
          recommendedLeverage = DEFAULT_PERSONAS.contrarian.recommendedLeverage;
          break;
        case '4':
          persona = DEFAULT_PERSONAS.scalper.description;
          recommendedLeverage = DEFAULT_PERSONAS.scalper.recommendedLeverage;
          break;
        case '5':
          persona = await question('Enter your custom persona:\n> ');
          recommendedLeverage = null; // No recommendation for custom
          break;
        default:
          persona = DEFAULT_PERSONAS.cautious.description;
          recommendedLeverage = DEFAULT_PERSONAS.cautious.recommendedLeverage;
      }
    }

    // Select leverage
    let leverage = recommendedLeverage || 1;
    if (!skipConfirm) {
      const leveragePrompt = recommendedLeverage
        ? `\n⚡ Leverage [recommended: ${recommendedLeverage}x, press Enter to accept]: `
        : '\n⚡ Leverage [1-100, default: 1]: ';
      const leverageInput = await question(leveragePrompt);
      if (leverageInput) {
        const parsed = parseInt(leverageInput);
        if (parsed >= 1 && parsed <= 100) {
          leverage = parsed;
        } else {
          console.log(`   ⚠️  Invalid leverage "${leverageInput}", using ${leverage}x`);
        }
      }
    }

    // Select trading pairs
    let tradingPairs = [];
    
    if (!skipConfirm) {
      console.log('\n📊 Select trading pairs');
      console.log('   Fetching available markets from Hyperliquid...\n');

      // Fetch live data
      let perpSymbols = [];
      let hip3Stocks = [];
      let hip3Commodities = [];
      let hip3Indices = [];
      let hip3Forex = [];

      try {
        // Fetch native perps
        const perpRes = await fetch(HYPERLIQUID_INFO_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'meta' })
        });
        const perpMeta = await perpRes.json();
        perpSymbols = perpMeta.universe
          ?.filter(m => !m.isDelisted)
          .map(m => m.name) || [];

        // Fetch xyz HIP-3 perps
        const xyzRes = await fetch(HYPERLIQUID_INFO_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'meta', dex: 'xyz' })
        });
        const xyzMeta = await xyzRes.json();
        const xyzSymbols = xyzMeta.universe?.map(m => m.name) || [];

        // Categorize xyz symbols
        for (const full of xyzSymbols) {
          const short = full.replace('xyz:', '');
          if (HIP3_CATEGORIES.stocks.includes(short)) hip3Stocks.push(full);
          else if (HIP3_CATEGORIES.commodities.includes(short)) hip3Commodities.push(full);
          else if (HIP3_CATEGORIES.indices.includes(short)) hip3Indices.push(full);
          else if (HIP3_CATEGORIES.forex.includes(short)) hip3Forex.push(full);
          else hip3Stocks.push(full); // default unknown to stocks
        }
      } catch (e) {
        console.log(`   ⚠️  Could not fetch live markets: ${e.message}`);
        console.log('   Using default list...\n');
        perpSymbols = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'LINK', 'AVAX', 'ARB', 'OP', 'SUI'];
      }

      // Popular crypto perps to show
      const popularCrypto = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'LINK', 'AVAX', 'ARB', 'OP', 'SUI', 'PEPE', 'WIF', 'HYPE', 'PENDLE', 'RENDER', 'TAO'];
      const availableCrypto = popularCrypto.filter(s => perpSymbols.includes(s) || perpSymbols.includes('k' + s));

      // Display categories
      console.log('  ┌─────────────────────────────────────────────────────────────┐');
      console.log('  │                    CRYPTO (Native Perps)                    │');
      console.log('  ├─────────────────────────────────────────────────────────────┤');
      // Show crypto in rows of 8
      for (let i = 0; i < availableCrypto.length; i += 8) {
        const row = availableCrypto.slice(i, i + 8).map(s => s.padEnd(8)).join('');
        console.log(`  │  ${row.padEnd(57)}│`);
      }
      console.log(`  │  + ${perpSymbols.length - availableCrypto.length} more (type any symbol)${' '.repeat(33)}│`);
      
      console.log('  ├─────────────────────────────────────────────────────────────┤');
      console.log('  │                  STOCKS (HIP-3 via trade.xyz)               │');
      console.log('  ├─────────────────────────────────────────────────────────────┤');
      const stockDisplay = hip3Stocks.map(s => s.replace('xyz:', ''));
      for (let i = 0; i < stockDisplay.length; i += 8) {
        const row = stockDisplay.slice(i, i + 8).map(s => s.padEnd(8)).join('');
        console.log(`  │  ${row.padEnd(57)}│`);
      }

      console.log('  ├─────────────────────────────────────────────────────────────┤');
      console.log('  │                COMMODITIES (HIP-3 via trade.xyz)            │');
      console.log('  ├─────────────────────────────────────────────────────────────┤');
      const commodDisplay = hip3Commodities.map(s => s.replace('xyz:', ''));
      for (let i = 0; i < commodDisplay.length; i += 8) {
        const row = commodDisplay.slice(i, i + 8).map(s => s.padEnd(8)).join('');
        console.log(`  │  ${row.padEnd(57)}│`);
      }

      console.log('  ├─────────────────────────────────────────────────────────────┤');
      console.log('  │              INDICES & FOREX (HIP-3 via trade.xyz)           │');
      console.log('  ├─────────────────────────────────────────────────────────────┤');
      const indexDisplay = [...hip3Indices, ...hip3Forex].map(s => s.replace('xyz:', ''));
      for (let i = 0; i < indexDisplay.length; i += 8) {
        const row = indexDisplay.slice(i, i + 8).map(s => s.padEnd(8)).join('');
        console.log(`  │  ${row.padEnd(57)}│`);
      }
      console.log('  └─────────────────────────────────────────────────────────────┘');
      
      console.log('\n  Crypto pairs use native perps. Stock/commodity pairs use HIP-3 (xyz:).');
      console.log('  Enter symbols comma-separated. Prefix is auto-detected.\n');

      const pairInput = await question('  Pairs [default: ETH,BTC]: ') || 'ETH,BTC';
      
      const selectedSymbols = pairInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      
      // Build all known hip3 symbols for lookup
      const allHip3Short = [...hip3Stocks, ...hip3Commodities, ...hip3Indices, ...hip3Forex].map(s => s.replace('xyz:', ''));
      
      for (const sym of selectedSymbols) {
        // Check if it's already prefixed with xyz:
        if (sym.startsWith('XYZ:')) {
          tradingPairs.push({ symbol: sym.toLowerCase(), market: 'hip3', dex: 'xyz' });
        }
        // Check if it's a known HIP-3 asset
        else if (allHip3Short.includes(sym)) {
          tradingPairs.push({ symbol: `xyz:${sym}`, market: 'hip3', dex: 'xyz' });
        }
        // Otherwise it's a native perp
        else {
          tradingPairs.push({ symbol: sym, market: 'perp' });
        }
      }
      
      // Show what was selected
      console.log('\n  Selected:');
      for (const p of tradingPairs) {
        const type = p.market === 'hip3' ? 'HIP-3' : 'perp';
        console.log(`    ${p.symbol} (${type})`);
      }
    } else {
      tradingPairs = [
        { symbol: 'ETH', market: 'perp' },
        { symbol: 'BTC', market: 'perp' }
      ];
    }

    // Loop interval
    let loopInterval = 3600000; // 1 hour default
    if (!skipConfirm) {
      const intervalInput = await question('\nLoop interval in minutes [default: 60]: ') || '60';
      loopInterval = parseInt(intervalInput) * 60 * 1000;
    }

    // Create config
    const config = {
      agentId: agentName,
      loopInterval,
      persona,
      walletAddress: wallet.address,
      privateKey: wallet.privateKey,
      tradingPairs,
      researchInterval: 43200000,
      maxPositionSize: 0.02,
      leverage,
      executionMode: 'paper',
      models: {
        research: 'perplexity/sonar-deep-research',
        decision: 'moonshotai/kimi-k2.5'
      }
    };

    // Confirmation
    if (!skipConfirm) {
      console.log('\n' + '─'.repeat(50));
      console.log('📋 Agent Configuration Summary:');
      console.log('─'.repeat(50));
      console.log(`   Name:          ${config.agentId}`);
      console.log(`   Wallet:        ${config.walletAddress}`);
      console.log(`   Loop Interval: ${config.loopInterval / 60000} minutes`);
      console.log(`   Pairs:         ${config.tradingPairs.map(p => `${p.symbol} (${p.market})`).join(', ')}`);
      console.log(`   Leverage:      ${config.leverage}x`);
      console.log(`   Execution:     ${config.executionMode}`);
      console.log('─'.repeat(50));

      const confirm = await question('\nCreate this agent? [Y/n]: ');
      if (confirm.toLowerCase() === 'n') {
        console.log('Cancelled.');
        process.exit(0);
      }
    }

    // Write config
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Create agent directory structure
    const agentDir = path.join(process.cwd(), 'agents', agentName);
    await fs.mkdir(path.join(agentDir, 'memory', 'decisions'), { recursive: true });
    await fs.mkdir(path.join(agentDir, 'memory', 'research'), { recursive: true });

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ✅ Agent "${agentName}" created successfully!                 
╠════════════════════════════════════════════════════════════════╣
║                                                                
║  📁 Config: config/agents/${agentName}.json
║  📂 Memory: agents/${agentName}/memory/
║                                                                
║  🔐 IMPORTANT - Save these credentials securely:               
║                                                                
║     Address:     ${wallet.address}
║     Private Key: ${wallet.privateKey}
║                                                                
║  ⚠️  The private key is stored in the config file.             
║     Never commit this to git or share it!                      
║                                                                
╠════════════════════════════════════════════════════════════════╣
║  Next steps:                                                   
║                                                                
║  1. Fund wallet on Hyperliquid (Arbitrum):                     
║     ${wallet.address}
║                                                                
║  2. Test the agent:                                            
║     node index.js --agent ${agentName} --once
║                                                                
║  3. Run the agent:                                             
║     node index.js --agent ${agentName}
║                                                                
╚════════════════════════════════════════════════════════════════╝
`);

  } finally {
    rl.close();
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
