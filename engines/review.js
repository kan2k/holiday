import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

/**
 * Review Engine
 * 
 * Second-stage safety layer that validates decisions before execution.
 * Uses a separate model to review the decision engine's output and 
 * executes trades via tool calls (can't hallucinate order params).
 * 
 * Flow: Decision Engine → Review Engine → Tool-based Execution
 */
export class ReviewEngine {
  constructor(config, hyperliquidClient) {
    this.agentId = config.agentId;
    this.persona = config.persona;
    this.tradingPairs = config.tradingPairs;
    this.maxPositionSize = config.maxPositionSize || 0.02;
    this.leverage = config.leverage || 1;
    this.hyperliquid = hyperliquidClient;
    this.mode = config.executionMode || 'paper';
    
    // Use a fast, reliable model for review (less likely to hallucinate)
    this.model = config.models?.review || 'moonshotai/kimi-k2.5';
    
    // Create OpenRouter client
    this.openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY
    });
    
    // Build execution tools
    this.tools = this._buildExecutionTools();
  }

  /**
   * Build tools for the reviewer to execute trades
   */
  _buildExecutionTools() {
    return {
      // Approve and execute a trade
      executeTrade: tool({
        description: 'Execute an approved perpetual futures trade. LONG profits when price UP, SHORT profits when price DOWN.',
        parameters: z.object({
          action: z.enum(['LONG', 'SHORT', 'CLOSE']).describe('LONG (bullish), SHORT (bearish), or CLOSE existing position'),
          symbol: z.string().max(10).describe('Trading symbol (e.g., ETH, BTC)'),
          sizePercent: z.number().min(0.001).max(1).describe('Position size as decimal (0.01 = 1% of portfolio)'),
          reason: z.string().describe('Why you approved this trade')
        }),
        execute: async ({ action, symbol, sizePercent, reason }) => {
          return this._executeTrade(action, symbol, sizePercent, reason);
        }
      }),

      // Reject and hold
      rejectTrade: tool({
        description: 'Reject the proposed trade and hold position. Use when the decision violates persona, risk rules, or seems unsafe.',
        parameters: z.object({
          originalAction: z.string().describe('The original proposed action'),
          reason: z.string().describe('Why you rejected this trade')
        }),
        execute: async ({ originalAction, reason }) => {
          console.log(`[Review] REJECTED: ${originalAction} - ${reason}`);
          return {
            executed: false,
            action: 'HOLD',
            rejected: true,
            rejectionReason: reason
          };
        }
      }),

      // Approve hold (no action needed)
      approveHold: tool({
        description: 'Approve a HOLD decision. No trade will be executed.',
        parameters: z.object({
          reason: z.string().describe('Why HOLD is the correct decision')
        }),
        execute: async ({ reason }) => {
          console.log(`[Review] APPROVED HOLD: ${reason}`);
          return {
            executed: false,
            action: 'HOLD',
            approved: true,
            reason
          };
        }
      }),

      // Get current price for validation
      getCurrentPrice: tool({
        description: 'Get current price to validate order parameters',
        parameters: z.object({
          symbol: z.string().describe('Trading symbol')
        }),
        execute: async ({ symbol }) => {
          try {
            const price = await this.hyperliquid.getPrice(symbol, 'perp');
            return { symbol, price, timestamp: new Date().toISOString() };
          } catch (e) {
            return { error: e.message };
          }
        }
      }),

      // Get account state for validation
      getAccountState: tool({
        description: 'Get account state to validate position sizing',
        parameters: z.object({}),
        execute: async () => {
          try {
            const state = await this.hyperliquid.getAccountState();
            return {
              accountValue: state.marginSummary?.accountValue,
              marginUsed: state.marginSummary?.totalMarginUsed,
              positions: state.assetPositions?.filter(p => parseFloat(p.position?.szi) !== 0).map(p => ({
                symbol: p.position.coin,
                size: p.position.szi,
                entryPrice: p.position.entryPx,
                pnl: p.position.unrealizedPnl
              }))
            };
          } catch (e) {
            return { error: e.message };
          }
        }
      })
    };
  }

  /**
   * Execute a trade (called by executeTrade tool)
   */
  async _executeTrade(action, symbol, sizePercent, approvalReason) {
    console.log(`[Review] APPROVED: ${action} ${symbol} @ ${sizePercent * 100}% - ${approvalReason}`);
    
    // Enforce max position size
    if (sizePercent > this.maxPositionSize) {
      console.log(`[Review] Capping size from ${sizePercent} to ${this.maxPositionSize}`);
      sizePercent = this.maxPositionSize;
    }
    
    // Validate symbol is allowed
    const allowedSymbols = this.tradingPairs.map(p => p.symbol.toUpperCase());
    if (!allowedSymbols.includes(symbol.toUpperCase())) {
      return {
        executed: false,
        error: `Symbol ${symbol} not in allowed trading pairs: ${allowedSymbols.join(', ')}`
      };
    }
    
    try {
      // Get account value
      const state = await this.hyperliquid.getAccountState();
      const accountValue = parseFloat(state.marginSummary?.accountValue || 0);
      
      if (accountValue <= 0) {
        return { executed: false, error: 'Account has no value' };
      }
      
      // Calculate position value and size (leverage amplifies position)
      const positionValue = accountValue * sizePercent * this.leverage;
      const price = await this.hyperliquid.getPrice(symbol, 'perp');
      const assetSize = positionValue / price;
      
      // Map LONG/SHORT to API side
      // LONG = buy (profit when price UP)
      // SHORT = sell (profit when price DOWN)
      // CLOSE = depends on current position (handled separately)
      let side;
      if (action === 'LONG') {
        side = 'buy';
      } else if (action === 'SHORT') {
        side = 'sell';
      } else if (action === 'CLOSE') {
        // For close, we need to check current position and do opposite
        // For now, default to sell (close long). TODO: check position
        side = 'sell';
      } else {
        side = action.toLowerCase(); // fallback
      }
      
      // Paper or live execution
      if (this.mode === 'paper') {
        console.log(`[Review] PAPER TRADE: ${action} (${side}) ${assetSize.toFixed(4)} ${symbol} @ $${price} [${this.leverage}x leverage]`);
        return {
          executed: true,
          mode: 'paper',
          action,
          side,
          symbol,
          size: assetSize,
          price,
          positionValue,
          leverage: this.leverage,
          approvalReason,
          timestamp: new Date().toISOString()
        };
      } else {
        console.log(`[Review] LIVE TRADE: ${action} (${side}) ${assetSize.toFixed(4)} ${symbol} @ $${price} [${this.leverage}x leverage]`);
        const result = await this.hyperliquid.placeOrder({
          symbol,
          side,
          size: assetSize,
          price,
          orderType: 'limit'
        });
        
        return {
          executed: true,
          mode: 'live',
          action,
          symbol,
          size: assetSize,
          price,
          positionValue,
          leverage: this.leverage,
          orderId: result.response?.data?.statuses?.[0]?.oid,
          approvalReason,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error(`[Review] Execution failed: ${error.message}`);
      return {
        executed: false,
        error: error.message
      };
    }
  }

  /**
   * Review and execute a decision from the decision engine
   */
  async review(decision, reasoning, marketContext = null) {
    const runId = Date.now().toString(36).slice(-4);
    console.log(`[Review:${runId}] Reviewing decision: ${decision.action} ${decision.symbol || ''}`);
    
    const startTime = Date.now();
    
    try {
      const systemPrompt = this._buildSystemPrompt();
      const userPrompt = this._buildUserPrompt(decision, reasoning, marketContext);
      
      console.log(`[Review:${runId}] Calling reviewer model...`);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
      
      const result = await generateText({
        model: this.openrouter(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        tools: this.tools,
        maxSteps: 5,
        maxTokens: 1024,
        temperature: 0.1, // Low temperature for consistent validation
        abortSignal: controller.signal,
        experimental_telemetry: { isEnabled: false }
      });
      
      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      console.log(`[Review:${runId}] Done in ${(duration / 1000).toFixed(1)}s`);
      
      // Extract execution result from tool calls
      const executionResult = this._extractExecutionResult(result.steps);
      
      return {
        success: true,
        ...executionResult,
        reviewReasoning: result.text,
        duration
      };
      
    } catch (error) {
      const errorMsg = error.name === 'AbortError' ? 'Review timed out (60s)' : error.message;
      console.error(`[Review] Error: ${errorMsg}`);
      
      return {
        success: false,
        executed: false,
        error: errorMsg,
        action: 'CLOSE',
        reason: 'Review process failed - defaulting to CLOSE for safety'
      };
    }
  }

  /**
   * Extract execution result from tool call steps
   */
  _extractExecutionResult(steps) {
    if (!steps) {
      return { executed: false, action: 'HOLD', reason: 'No tool calls made' };
    }
    
    for (const step of steps) {
      if (!step.toolResults) continue;
      
      for (const result of step.toolResults) {
        const value = result.result;
        
        // Check for execution results
        if (result.toolName === 'executeTrade' && value) {
          return {
            executed: value.executed,
            action: value.action,
            symbol: value.symbol,
            size: value.size,
            price: value.price,
            positionValue: value.positionValue,
            mode: value.mode,
            orderId: value.orderId,
            approvalReason: value.approvalReason,
            error: value.error
          };
        }
        
        if (result.toolName === 'rejectTrade' && value) {
          return {
            executed: false,
            action: 'HOLD',
            rejected: true,
            rejectionReason: value.rejectionReason,
            originalAction: value.originalAction
          };
        }
        
        if (result.toolName === 'approveHold' && value) {
          return {
            executed: false,
            action: 'HOLD',
            approved: true,
            reason: value.reason
          };
        }
      }
    }
    
    return { executed: false, action: 'HOLD', reason: 'No execution decision made' };
  }

  /**
   * Build system prompt for reviewer
   */
  _buildSystemPrompt() {
    return `# Perpetual Futures Trade Review Agent

You are a safety-focused trade reviewer for PERPETUAL FUTURES. Your job is to validate trading decisions before execution.

## IMPORTANT: This is Perpetual Trading
- **LONG**: Profit when price goes UP (bullish)
- **SHORT**: Profit when price goes DOWN (bearish)
- **CLOSE**: Close existing position

In bearish markets, SHORT is a valid and profitable opportunity!

## Your Responsibilities
1. Validate the decision follows the trader's PERSONA rules
2. Ensure position size is within risk limits (max ${this.maxPositionSize * 100}% per trade)
3. Verify the symbol is in allowed trading pairs
4. Check the reasoning makes sense given market conditions
5. Execute valid trades via tools OR reject unsafe trades

## Trader Persona (MUST FOLLOW)
${this.persona}

## Risk Rules
- Maximum position size: ${this.maxPositionSize * 100}% of portfolio
- Leverage: ${this.leverage}x (position value = allocation × ${this.leverage})
- Allowed symbols: ${this.tradingPairs.map(p => p.symbol).join(', ')}
- Mode: ${this.mode} (${this.mode === 'paper' ? 'simulated trades only' : 'REAL MONEY'})

## Available Tools
1. **executeTrade** - Execute an approved LONG, SHORT, or CLOSE
2. **rejectTrade** - Reject an unsafe trade (defaults to HOLD)
3. **approveHold** - Approve a HOLD decision
4. **getCurrentPrice** - Validate current price
5. **getAccountState** - Check positions and balance

## Decision Process
1. Read the proposed decision and reasoning
2. Check if it violates persona or risk rules
3. If HOLD: call approveHold
4. If LONG/SHORT/CLOSE and valid: call executeTrade with validated params
5. If LONG/SHORT/CLOSE but unsafe: call rejectTrade with explanation

## CRITICAL RULES
- NEVER execute a trade larger than ${this.maxPositionSize * 100}% of portfolio (before leverage)
- Leverage is ${this.leverage}x — effective exposure = size × ${this.leverage}
- NEVER trade symbols outside the allowed list
- ALWAYS reject trades that contradict the persona
- SHORT is VALID in bearish markets - don't reject just because it's bearish!
- When in doubt, REJECT and HOLD
- You are the LAST line of defense before real money is used`;
  }

  /**
   * Build user prompt with decision to review
   */
  _buildUserPrompt(decision, reasoning, marketContext) {
    let prompt = `## Proposed Decision from Decision Engine

**Action**: ${decision.action}
${decision.symbol ? `**Symbol**: ${decision.symbol}` : ''}
${decision.size ? `**Size**: ${decision.size * 100}% of portfolio` : ''}
${decision.reason ? `**Reason**: ${decision.reason}` : ''}

## Decision Engine's Reasoning
${reasoning || 'No detailed reasoning provided'}

`;

    if (marketContext) {
      prompt += `## Current Market Context
${marketContext}

`;
    }

    prompt += `## Your Task
Review this decision against the persona and risk rules. Then:
- If it's a valid HOLD: call approveHold
- If it's a valid LONG/SHORT/CLOSE within rules: call executeTrade
- If it violates any rules: call rejectTrade

Remember: This is perpetual trading. SHORT is valid and profitable in bearish markets!

Make your decision now.`;

    return prompt;
  }
}

/**
 * Create a review engine instance
 */
export function createReviewEngine(config, hyperliquidClient) {
  return new ReviewEngine(config, hyperliquidClient);
}

export default ReviewEngine;
