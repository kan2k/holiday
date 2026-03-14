import { createHyperliquidClient } from './exchanges/hyperliquid.js';
import { createResearchEngine } from './engines/research.js';
import { createDecisionEngine } from './engines/decision.js';
import { createReviewEngine } from './engines/review.js';
import { saveDecisionToMemory, loadRecentDecisions } from './utils/compaction.js';
import { loadAgentConfig } from './utils/validation.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Ralph Loop Agent
 * 
 * Implements the Ralph Loop pattern:
 * - Fresh context each iteration
 * - Persistent memory via markdown files
 * - Compound learning through decision history
 */
export class AgentLoop {
  constructor(configPath, options = {}) {
    this.configPath = configPath;
    this.options = options;
    this.config = null;
    this.hyperliquid = null;
    this.researchEngine = null;
    this.decisionEngine = null;
    this.reviewEngine = null;  // Review + Execute (safety layer)
    
    this._loopId = null;
    this._running = false;
    this._iterationCount = 0;
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    console.log('='.repeat(60));
    console.log('[Agent] Initializing...');
    
    // Load and validate config
    const configResult = await loadAgentConfig(this.configPath);
    
    if (!configResult.valid) {
      console.error('[Agent] Config validation failed:');
      configResult.errors.forEach(e => console.error(`  - ${e}`));
      throw new Error('Config validation failed');
    }
    
    if (configResult.warnings.length > 0) {
      console.warn('[Agent] Warnings:');
      configResult.warnings.forEach(w => console.warn(`  - ${w}`));
    }
    
    this.config = configResult.config;
    console.log(`[Agent] Loaded config for agent: ${this.config.agentId}`);
    
    // Initialize Hyperliquid client
    this.hyperliquid = createHyperliquidClient({
      walletAddress: this.config.walletAddress,
      privateKey: this.config.privateKey !== 'YOUR_PRIVATE_KEY_HERE' ? this.config.privateKey : null
    });
    
    // Validate trading pairs
    console.log('[Agent] Validating trading pairs...');
    for (const pair of this.config.tradingPairs) {
      const result = await this.hyperliquid.validateTradingPair(pair.symbol, pair.market);
      if (result.valid) {
        console.log(`  ✓ ${pair.symbol} (${pair.market})`);
      } else {
        console.warn(`  ✗ ${pair.symbol} (${pair.market}): ${result.error}`);
      }
    }
    
    // Initialize engines
    // Decision: Kimi analyzes and proposes trades
    // Review: Second model validates and executes via tools (safety layer)
    this.researchEngine = createResearchEngine(this.config);
    this.decisionEngine = createDecisionEngine(this.config, this.hyperliquid);
    this.reviewEngine = createReviewEngine(this.config, this.hyperliquid);
    
    // Ensure agent directories exist
    await this._ensureAgentDirectories();
    
    // Create/update AGENT.md
    await this._updateAgentMd();
    
    console.log('[Agent] Initialization complete');
    console.log('='.repeat(60));
    
    return this;
  }

  /**
   * Ensure directories exist
   */
  async _ensureAgentDirectories() {
    // Global memory directories
    const decisionsDir = path.join(process.cwd(), 'memory', 'decisions');
    const researchDir = path.join(process.cwd(), 'memory', 'research');
    
    // Prompts directory for agent configs
    const promptsDir = path.join(process.cwd(), 'prompts');
    
    await fs.mkdir(decisionsDir, { recursive: true });
    await fs.mkdir(researchDir, { recursive: true });
    await fs.mkdir(promptsDir, { recursive: true });
  }

  /**
   * Create/update agent AGENT.md file
   */
  async _updateAgentMd() {
    const promptPath = path.join(process.cwd(), 'prompts', `${this.config.agentId}-AGENT.md`);
    
    const content = `# Agent: ${this.config.agentId}

## Overview
This is an autonomous trading agent running on Holiday — your AI trades while you take a break.

## Persona
${this.config.persona}

## Trading Configuration
- **Trading Pairs**: ${this.config.tradingPairs.map(p => `${p.symbol} (${p.market})`).join(', ')}
- **Max Position Size**: ${this.config.maxPositionSize * 100}% per trade
- **Loop Interval**: ${this.config.loopInterval / 1000 / 60} minutes
- **Research Interval**: ${this.config.researchInterval / 1000 / 60 / 60} hours

## Models
- **Research**: ${this.config.models?.research || 'perplexity/sonar-deep-research'}
- **Decision**: ${this.config.models?.decision || 'moonshotai/kimi-k2.5'}
- **Review**: ${this.config.models?.review || 'moonshotai/kimi-k2.5'}

## Two-Stage Safety Architecture

### Stage 1: Decision Engine
The decision engine proposes trades:
1. Loads the latest macro research report
2. Analyzes price charts (timeframe based on persona)
3. Reviews recent decision history (compound learning)
4. Proposes a trading decision (BUY/SELL/HOLD)
5. Provides reasoning for the decision

### Stage 2: Review Engine (Safety Layer)
A separate model validates before execution:
1. Checks decision follows persona rules
2. Validates position size within limits
3. Confirms symbol is allowed
4. Reviews reasoning for safety
5. Executes via tool calls OR rejects to HOLD

This two-key system ensures no trade executes unless BOTH engines agree.

## Memory Structure
\`\`\`
holiday/
├── prompts/
│   └── ${this.config.agentId}-AGENT.md    # This file
├── memory/
│   ├── decisions/                    # All agent decisions (agentName-datetime.md)
│   ├── research/                     # Shared research reports
│   └── ${this.config.agentId}-summary.md  # Rolling context summary
└── config/agents/
    └── ${this.config.agentId}.json   # Agent configuration
\`\`\`

## Ralph Loop Pattern
This agent implements the Ralph Loop pattern:
- **Fresh Start**: Each iteration starts with clean context
- **Persistent Memory**: Decisions and research saved as markdown files
- **Compound Learning**: Past decisions inform future decisions
- **Auto-Compaction**: Each run is summarized and saved

---
*Last updated: ${new Date().toISOString()}*
`;

    await fs.writeFile(promptPath, content, 'utf-8');
    console.log(`[Agent] Updated prompt at ${promptPath}`);
  }

  /**
   * Run a single iteration of the agent loop
   * This is the "fresh start" - no state carried over except from memory files
   */
  async runIteration() {
    this._iterationCount++;
    const iterationStart = Date.now();
    
    console.log('\n' + '='.repeat(60));
    console.log(`[Agent] Iteration #${this._iterationCount} - ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    
    let decisionData = {
      timestamp: Date.now(),
      agentId: this.config.agentId,
      persona: this.config.persona,
      marketContext: null,
      researchSummary: null,
      priceData: null,
      decision: null,
      reasoning: null,
      execution: null
    };
    
    try {
      // Step 1: Decision
      console.log('\n[Step 1] Making decision...');
      const decisionResult = await this.decisionEngine.makeDecision();
      
      if (!decisionResult.success) {
        console.error(`[Agent] Decision failed: ${decisionResult.error}`);
        decisionData.decision = { action: 'HOLD', reason: 'Decision engine error' };
        decisionData.reasoning = decisionResult.error;
      } else {
        decisionData.decision = decisionResult.decision;
        decisionData.reasoning = decisionResult.reasoning;
        
        // Populate market data from decision result
        if (decisionResult.marketData) {
          decisionData.priceData = decisionResult.marketData.prices;
          decisionData.researchSummary = decisionResult.marketData.research?.content || null;
          decisionData.marketContext = decisionResult.marketData.charts?.map(c => 
            `${c.symbol}: $${c.currentPrice?.toFixed(2)} | RSI: ${c.rsi?.toFixed(1)} | SMA20: $${c.sma20?.toFixed(2)} | 24h: ${c.priceChange24h}`
          ).join('\n') || null;
        }
        
        const d = decisionResult.decision;
        const decisionLog = d.action === 'HOLD' 
          ? `[Agent] Decision: HOLD - ${d.reason || 'No clear setup'}`
          : `[Agent] Decision: ${d.action} ${d.symbol} - ${d.reason || ''}`;
        console.log(decisionLog);
      }
      
      // Step 2: Review & Execute (safety layer)
      console.log('\n[Step 2] Reviewing decision...');
      const reviewResult = await this.reviewEngine.review(
        decisionData.decision,
        decisionData.reasoning,
        decisionData.marketContext
      );
      decisionData.execution = reviewResult;
      
      if (reviewResult.rejected) {
        console.log(`[Agent] REJECTED by reviewer: ${reviewResult.rejectionReason}`);
      } else if (reviewResult.executed) {
        console.log(`[Agent] Executed: ${reviewResult.mode} ${reviewResult.action} ${reviewResult.symbol || ''}`);
      } else {
        console.log(`[Agent] Not executed: ${reviewResult.reason || 'HOLD approved'}`);
      }
      
      // Step 3: Compact and save
      console.log('\n[Step 3] Compacting and saving to memory...');
      const saved = await saveDecisionToMemory(this.config.agentId, decisionData);
      console.log(`[Agent] Saved to ${saved.filename}`);
      
      const duration = Date.now() - iterationStart;
      console.log(`\n[Agent] Iteration complete in ${duration}ms`);
      
      return {
        success: true,
        iteration: this._iterationCount,
        decision: decisionData.decision,
        reviewed: true,
        executed: reviewResult.executed,
        rejected: reviewResult.rejected || false,
        savedTo: saved.filepath,
        duration
      };
      
    } catch (error) {
      console.error(`[Agent] Iteration error: ${error.message}`);
      
      // Still try to save what we have
      try {
        decisionData.decision = decisionData.decision || { action: 'HOLD', reason: 'Error in iteration' };
        decisionData.reasoning = decisionData.reasoning || error.message;
        await saveDecisionToMemory(this.config.agentId, decisionData);
      } catch (saveError) {
        console.error(`[Agent] Failed to save error state: ${saveError.message}`);
      }
      
      return {
        success: false,
        iteration: this._iterationCount,
        error: error.message
      };
    }
  }

  /**
   * Start the agent loop
   */
  async start() {
    if (this._running) {
      console.log('[Agent] Already running');
      return this;
    }
    
    console.log(`[Agent] Starting loop (interval: ${this.config.loopInterval}ms)`);
    this._running = true;
    
    // Start research engine (unless disabled via --no-research)
    if (!this.options.skipResearch) {
      this.researchEngine.start();
    } else {
      console.log('[Agent] Research engine disabled — using shared research daemon');
    }
    
    // Run first iteration immediately
    await this.runIteration();
    
    // Schedule subsequent iterations
    this._loopId = setInterval(async () => {
      if (this._running) {
        await this.runIteration();
      }
    }, this.config.loopInterval);
    
    return this;
  }

  /**
   * Stop the agent loop
   */
  stop() {
    console.log('[Agent] Stopping...');
    this._running = false;
    
    if (this._loopId) {
      clearInterval(this._loopId);
      this._loopId = null;
    }
    
    this.researchEngine?.stop();
    
    console.log('[Agent] Stopped');
    return this;
  }

  /**
   * Run a single iteration (for testing)
   */
  async runOnce() {
    await this.initialize();
    return await this.runIteration();
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      agentId: this.config?.agentId,
      running: this._running,
      iterations: this._iterationCount,
      research: this.researchEngine?.getStatus(),
      execution: this.executionEngine?.getStatus()
    };
  }
}

/**
 * Create an agent loop instance
 */
export function createAgentLoop(configPath, options = {}) {
  return new AgentLoop(configPath, options);
}

export default AgentLoop;
