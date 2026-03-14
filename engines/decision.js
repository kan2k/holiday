import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createPriceChartTool, createGetPriceTool, createAccountStateTool } from '../tools/priceChart.js';
import { createGetResearchTool, createGetDecisionHistoryTool } from '../tools/reports.js';
import { loadRecentDecisions, summarizeRecentDecisions } from '../utils/compaction.js';
import { 
  microcompactDecisions, 
  loadRollingSummary, 
  saveRollingSummary,
  generateTradingSummary,
  formatTradingSummary,
  createContinuationMessage 
} from '../utils/smart-compaction.js';

/**
 * Decision Engine
 * Uses moonshotai/kimi-k2.5 via OpenRouter
 * Makes trading decisions based on research, price data, and history
 */
export class DecisionEngine {
  constructor(config, hyperliquidClient) {
    this.agentId = config.agentId;
    this.persona = config.persona;
    this.tradingPairs = config.tradingPairs;
    this.maxPositionSize = config.maxPositionSize || 0.02;
    this.leverage = config.leverage || 1;
    this.model = config.models?.decision || 'moonshotai/kimi-k2.5';
    
    this.hyperliquid = hyperliquidClient;
    
    // Create OpenRouter client
    this.openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY
    });
    
    // Build tools
    this.tools = this._buildTools();
  }

  /**
   * Build tools available to the decision agent
   */
  _buildTools() {
    return {
      getPriceChart: createPriceChartTool(this.hyperliquid),
      getPrice: createGetPriceTool(this.hyperliquid),
      getAccountState: createAccountStateTool(this.hyperliquid),
      getResearch: createGetResearchTool(this.agentId),
      getDecisionHistory: createGetDecisionHistoryTool(this.agentId)
    };
  }

  /**
   * Run the decision-making process
   * Uses agentic tool calling - the model decides what data to fetch
   */
  async makeDecision() {
    const runId = Date.now().toString(36).slice(-4);
    console.log(`[Decision:${runId}] Starting for ${this.agentId} using ${this.model}`);
    
    const startTime = Date.now();
    
    try {
      // Smart compaction: keep last 3 decisions in full, summarize older ones
      console.log(`[Decision:${runId}] Loading context...`);
      const { fullDecisions, summary: oldDecisionsSummary, summarizedCount } = 
        await microcompactDecisions(this.agentId, 3);
      
      if (summarizedCount > 0) {
        console.log(`[Decision:${runId}] Microcompacted ${summarizedCount} older decisions`);
      }
      
      // Load rolling summary (persists across sessions)
      const { exists: hasSummary, content: rollingSummary } = 
        await loadRollingSummary(this.agentId);
      
      if (hasSummary) {
        console.log(`[Decision:${runId}] Loaded rolling summary`);
      }
      
      // Build decision history from full decisions + summary of older ones
      let decisionHistory = '';
      
      // Include rolling summary at the start (continuation context)
      if (rollingSummary) {
        decisionHistory += `### Previous Session Context\n${rollingSummary}\n\n`;
      }
      
      if (oldDecisionsSummary) {
        decisionHistory += `### Older Decisions (Summarized)\n${oldDecisionsSummary}\n\n`;
      }
      decisionHistory += summarizeRecentDecisions(fullDecisions);
      
      // Build the system prompt with persona and context
      const systemPrompt = this._buildAgenticSystemPrompt(decisionHistory);
      
      // Build the user prompt telling it to gather data and decide
      const userPrompt = this._buildAgenticUserPrompt(hasSummary);
      
      console.log(`[Decision:${runId}] Agentic mode - model will choose what data to fetch...`);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 second timeout for tool calls
      
      // Track tool calls for logging
      const toolCalls = [];
      
      // Run with tools - model decides what data to fetch
      // Retry once on "Failed to process successful response" errors
      let result;
      let retryCount = 0;
      const maxRetries = 1;
      
      while (retryCount <= maxRetries) {
        try {
          result = await generateText({
            model: this.openrouter(this.model),
            system: systemPrompt,
            prompt: userPrompt,
            tools: this.tools,
            maxSteps: 6, // Reduced to avoid very long chains
            maxTokens: 2048, // Reduced to avoid parsing issues
            temperature: 0.4,
            abortSignal: controller.signal,
            experimental_telemetry: { isEnabled: false },
            onStepFinish: ({ toolCalls: calls }) => {
              if (calls?.length > 0) {
                for (const call of calls) {
                  toolCalls.push(call.toolName);
                  console.log(`[Decision:${runId}] Tool: ${call.toolName}(${JSON.stringify(call.args).slice(0, 50)}...)`);
                }
              }
            }
          });
          break; // Success, exit retry loop
        } catch (retryError) {
          if (retryError.message?.includes('Failed to process successful response') && retryCount < maxRetries) {
            console.warn(`[Decision:${runId}] Response parsing failed, retrying...`);
            retryCount++;
            toolCalls.length = 0; // Reset tool calls for retry
          } else {
            throw retryError; // Not retriable or max retries reached
          }
        }
      }
      
      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      console.log(`[Decision:${runId}] Done in ${(duration/1000).toFixed(1)}s (${toolCalls.length} tool calls)`);
      
      // Parse the decision from the response
      const decision = this._parseDecision(result.text);
      
      // Build market data from tool results for summary
      const marketData = this._extractMarketDataFromSteps(result.steps);
      
      // Update rolling summary with this decision (for next iteration)
      try {
        const tradingSummary = await generateTradingSummary(
          this.agentId, 
          fullDecisions, 
          marketData
        );
        tradingSummary.tradingIntent = this.persona.slice(0, 200);
        tradingSummary.nextSteps = decision.reason || 'Continue monitoring';
        
        const summaryMd = formatTradingSummary(tradingSummary, this.agentId);
        await saveRollingSummary(this.agentId, summaryMd);
        console.log(`[Decision:${runId}] Saved summary`);
      } catch (summaryError) {
        console.warn(`[Decision] Failed to update summary: ${summaryError.message}`);
      }
      
      return {
        success: true,
        decision,
        reasoning: result.text,
        marketData,
        toolCalls,
        duration
      };
    } catch (error) {
      const errorMsg = error.name === 'AbortError' ? 'Model request timed out (180s)' : error.message;
      console.error(`[Decision] Error: ${errorMsg}`);
      
      // Better error logging for ai-sdk errors
      if (error.cause && Object.keys(error.cause).length > 0) {
        console.error(`[Decision] Cause: ${JSON.stringify(error.cause, null, 2)}`);
      }
      if (error.statusCode) {
        console.error(`[Decision] Status: ${error.statusCode}`);
      }
      if (error.responseBody) {
        console.error(`[Decision] Response: ${error.responseBody?.slice?.(0, 500) || error.responseBody}`);
      }
      
      // "Failed to process successful response" is often a model output parsing issue
      // This can happen when the model returns malformed JSON or very long responses
      if (errorMsg.includes('Failed to process successful response')) {
        console.error(`[Decision] This is likely a model output parsing issue. The model may have returned malformed JSON or an excessively long response.`);
      }
      
      return {
        success: false,
        error: errorMsg,
        decision: { action: 'HOLD', reason: 'Decision process failed' }
      };
    }
  }
  
  /**
   * Extract market data from tool call results for summary
   */
  _extractMarketDataFromSteps(steps) {
    const data = {
      prices: [],
      charts: [],
      account: null,
      research: null
    };
    
    if (!steps) return data;
    
    for (const step of steps) {
      if (!step.toolResults) continue;
      
      for (const result of step.toolResults) {
        const value = result.result;
        if (!value || value.error) continue;
        
        // Extract price data
        if (result.toolName === 'getPrice' && value.price) {
          data.prices.push({
            symbol: value.symbol,
            market: value.market,
            price: value.price
          });
        }
        
        // Extract chart data
        if (result.toolName === 'getPriceChart' && value.currentPrice) {
          data.charts.push({
            symbol: value.symbol,
            currentPrice: value.currentPrice,
            sma20: value.indicators?.sma20,
            rsi: value.indicators?.rsi,
            priceChange24h: value.priceChange
          });
        }
        
        // Extract account state
        if (result.toolName === 'getAccountState' && value.marginSummary) {
          data.account = value;
        }
        
        // Extract research
        if (result.toolName === 'getResearch' && value.content) {
          data.research = value;
        }
      }
    }
    
    return data;
  }

  /**
   * Gather market data using tools directly
   */
  async _gatherMarketData() {
    console.log(`[Decision] Fetching market data...`);
    const data = {
      prices: [],
      charts: [],
      account: null,
      research: null,
      history: null
    };

    // Get prices and charts for each trading pair
    for (const pair of this.tradingPairs) {
      try {
        const price = await this.hyperliquid.getPrice(pair.symbol, pair.market);
        data.prices.push({ symbol: pair.symbol, market: pair.market, price });
        console.log(`[Decision]   ${pair.symbol}: $${price}`);
      } catch (e) {
        console.log(`[Decision]   ${pair.symbol}: price fetch failed - ${e.message}`);
      }

      try {
        const candles = await this.hyperliquid.getCandles(pair.symbol, '1h', 50);
        const closes = candles.map(c => c.close);
        const chart = {
          symbol: pair.symbol,
          currentPrice: closes[closes.length - 1],
          sma20: this._calculateSMA(closes, 20),
          rsi: this._calculateRSI(closes, 14),
          priceChange24h: ((closes[closes.length - 1] - closes[closes.length - 25]) / closes[closes.length - 25] * 100).toFixed(2) + '%'
        };
        data.charts.push(chart);
      } catch (e) {
        console.log(`[Decision]   ${pair.symbol}: chart fetch failed - ${e.message}`);
      }
    }

    // Get account state
    try {
      data.account = await this.hyperliquid.getAccountState();
    } catch (e) {
      console.log(`[Decision]   Account state fetch failed - ${e.message}`);
    }

    // Get research
    try {
      const { getLatestResearch } = await import('../utils/compaction.js');
      data.research = await getLatestResearch(this.agentId);
    } catch (e) {
      // No research available yet
    }

    // Get decision history
    try {
      data.history = summarizeRecentDecisions(await loadRecentDecisions(this.agentId, 3));
    } catch (e) {
      // No history
    }

    return data;
  }

  _calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  _calculateRSI(data, period = 14) {
    if (data.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Build user prompt with pre-gathered data
   */
  _buildUserPromptWithData(marketData, hasPreviousContext = false) {
    let prompt = '';
    
    // Add continuation message if we have previous context (Claude Code pattern)
    if (hasPreviousContext) {
      prompt += `This session continues from previous trading activity. The context summary was provided in the system prompt. Continue making decisions without re-asking about strategy.\n\n`;
    }
    
    prompt += `It's ${new Date().toISOString()}.\n\n`;
    prompt += `## Current Market Data\n\n`;
    
    if (marketData.prices.length > 0) {
      prompt += `### Prices\n`;
      for (const p of marketData.prices) {
        prompt += `- ${p.symbol} (${p.market}): $${p.price}\n`;
      }
      prompt += `\n`;
    }

    if (marketData.charts.length > 0) {
      prompt += `### Technical Indicators\n`;
      for (const c of marketData.charts) {
        prompt += `- ${c.symbol}: Price $${c.currentPrice?.toFixed(2)}, SMA20: $${c.sma20?.toFixed(2) || 'N/A'}, RSI: ${c.rsi?.toFixed(1) || 'N/A'}, 24h Change: ${c.priceChange24h}\n`;
      }
      prompt += `\n`;
    }

    if (marketData.account?.marginSummary) {
      prompt += `### Account State\n`;
      prompt += `- Account Value: $${marketData.account.marginSummary.accountValue}\n`;
      prompt += `- Margin Used: $${marketData.account.marginSummary.totalMarginUsed}\n`;
      prompt += `\n`;
    }

    if (marketData.research) {
      prompt += `### Latest Research Summary\n`;
      prompt += `${marketData.research.content?.slice(0, 1000) || 'No research available'}\n\n`;
    }

    if (marketData.history && marketData.history !== 'No previous decisions recorded.') {
      prompt += `### Recent Decision History\n`;
      prompt += `${marketData.history}\n\n`;
    }

    prompt += `## Your Task\n`;
    prompt += `Based on the data above, make a trading decision. Consider:\n`;
    prompt += `1. Current price levels and technical indicators\n`;
    prompt += `2. Your risk limits (max ${this.maxPositionSize * 100}% per trade)\n`;
    prompt += `3. Your persona and trading style\n\n`;
    prompt += `Provide your analysis, then your decision in the specified format.`;

    return prompt;
  }

  /**
   * Build agentic system prompt - tells model to use tools
   */
  _buildAgenticSystemPrompt(decisionHistory) {
    return `# Trading Decision Agent

## Your Persona
${this.persona}

## Your Role
You are an autonomous PERPETUAL FUTURES trading agent. You can profit from BOTH directions:
- **LONG**: Profit when price goes UP (bullish setup)
- **SHORT**: Profit when price goes DOWN (bearish setup)

This is NOT spot trading. You can SHORT in bearish markets - this is a valid and profitable strategy!

## Trading Pairs (Perpetual Futures)
${this.tradingPairs.map(p => `- ${p.symbol} (${p.market})`).join('\n')}

## Available Tools

**IMPORTANT: Use SIMPLE symbol names like "ETH", "BTC", "SOL" - NOT full contract names!**

1. **getPriceChart** - Get OHLCV candles with technical indicators
   - symbol: "ETH" or "BTC" (simple, max 10 chars)
   - interval: "1m", "5m", "15m", "1h", "4h", "1d"
   - limit: 10-500 candles
   - Example: getPriceChart({ symbol: "ETH", interval: "1h", limit: 50 })
   
2. **getPrice** - Get current price
   - symbol: "ETH" or "BTC" (simple name)
   - Example: getPrice({ symbol: "ETH", market: "perp" })

3. **getAccountState** - Get positions, balances, margin info

4. **getResearch** - Get latest macro research report

5. **getDecisionHistory** - Get your recent decisions

## IMPORTANT: Use Tools Based on Your Persona
- If you're a scalper: use 1m, 5m, 15m timeframes
- If you're a swing trader: use 1h, 4h timeframes  
- If you're a position trader: use 4h, 1d timeframes
- If you're cautious: check multiple timeframes for confluence

## Decision Process
1. FIRST: Call tools to gather data (don't skip this!)
2. Analyze macro environment from research
3. Analyze technicals from price charts
4. Check your current positions
5. Review past decisions
6. Make decision with clear reasoning

## Risk Rules
- Maximum position size: ${this.maxPositionSize * 100}% of portfolio per trade (before leverage)
- Leverage: ${this.leverage}x — your effective exposure = size × ${this.leverage}
- A ${this.maxPositionSize * 100}% allocation at ${this.leverage}x leverage = ${(this.maxPositionSize * 100 * this.leverage).toFixed(0)}% effective exposure
- Never override your risk limits
- HOLD is valid when uncertain

## Output Format
After analysis, provide decision in this format:
\`\`\`decision
ACTION: [LONG|SHORT|CLOSE|HOLD]
SYMBOL: [symbol]
SIZE: [percentage, e.g., 0.01 for 1% — this is BEFORE leverage]
REASON: [one-line reason]
\`\`\`

**Actions explained:**
- **LONG**: Open long position (bullish - profit when price goes UP)
- **SHORT**: Open short position (bearish - profit when price goes DOWN)
- **CLOSE**: Close existing position
- **HOLD**: No action

SIZE is the % of portfolio you want to allocate. Leverage (${this.leverage}x) is applied automatically.
If HOLD, omit SYMBOL and SIZE.

**IMPORTANT**: In bearish markets, SHORT is often the best opportunity! Don't just wait for bullish setups.

${decisionHistory}`;
  }

  /**
   * Build agentic user prompt
   */
  _buildAgenticUserPrompt(hasPreviousContext = false) {
    let prompt = '';
    
    if (hasPreviousContext) {
      prompt += `Continuing from previous session. Context provided above.\n\n`;
    }
    
    prompt += `Current time: ${new Date().toISOString()}

Your task: Make a trading decision for your pairs.

**You MUST use your tools to gather data first.** Based on your persona, choose appropriate:
- Timeframes (scalper=1m-15m, swing=1h-4h, position=4h-1d)
- Number of candles (more for longer analysis)

Suggested steps:
1. getResearch() - check macro conditions
2. getPriceChart({ symbol, interval, limit }) - for EACH pair with timeframe matching your style
3. getAccountState() - check positions
4. Analyze all data
5. Output your decision

Begin by calling tools to gather data.`;

    return prompt;
  }

  /**
   * Build the system prompt with persona
   */
  _buildSystemPrompt(decisionHistory) {
    return `# Trading Decision Agent

## Your Persona
${this.persona}

## Your Role
You are an autonomous trading decision agent. Your job is to analyze market conditions and make trading decisions for the following pairs:
${this.tradingPairs.map(p => `- ${p.symbol} (${p.market})`).join('\n')}

## Available Tools
You have access to tools to:
1. Get price charts with technical indicators
2. Get current prices
3. Get account state (positions, balances)
4. Get macro research reports
5. Get your previous decision history

## Decision Framework
1. First, gather information using your tools
2. Analyze the macro environment (research reports)
3. Analyze technical setup (price charts)
4. Consider your current positions (account state)
5. Review past decisions to avoid repeating mistakes
6. Make a decision with clear reasoning

## Risk Rules
- Maximum position size: ${this.maxPositionSize * 100}% of portfolio per trade (before leverage)
- Leverage: ${this.leverage}x — effective exposure = size × ${this.leverage}
- Never override your risk limits
- When uncertain, HOLD is a valid decision
- Always have a reason for your decision

## Output Format
After your analysis, provide a decision in this exact format:
\`\`\`decision
ACTION: [LONG|SHORT|CLOSE|HOLD]
SYMBOL: [symbol]
SIZE: [percentage of portfolio, e.g., 0.01 for 1% — before leverage]
REASON: [one-line reason]
\`\`\`

**Actions:**
- LONG: Open long (bullish - profit when price UP)
- SHORT: Open short (bearish - profit when price DOWN)
- CLOSE: Close existing position
- HOLD: No action

SIZE is the % of portfolio to allocate. Leverage (${this.leverage}x) is applied automatically.
If HOLD, you can omit SYMBOL and SIZE.

${decisionHistory}`;
  }

  /**
   * Build the user prompt
   */
  _buildUserPrompt() {
    return `It's ${new Date().toISOString()}. 

Please analyze the current market conditions and make a trading decision.

Steps:
1. Use getResearch to check the latest macro analysis
2. Use getPriceChart for your trading pairs to see technical setup
3. Use getAccountState to see current positions
4. Use getDecisionHistory to review recent decisions
5. Based on all information, make your decision

Remember to stay true to your persona and risk limits. Provide your analysis and then your decision in the specified format.`;
  }

  /**
   * Parse the decision from the model output
   */
  _parseDecision(text) {
    // Look for the decision block
    const decisionMatch = text.match(/```decision\n([\s\S]*?)```/);
    
    if (!decisionMatch) {
      // Try to parse without code block
      const actionMatch = text.match(/ACTION:\s*(LONG|SHORT|CLOSE|HOLD|BUY|SELL)/i);
      if (actionMatch) {
        return this._parseDecisionLines(text);
      }
      
      // Default to HOLD if no clear decision
      return {
        action: 'HOLD',
        reason: 'No clear decision signal in analysis'
      };
    }
    
    return this._parseDecisionLines(decisionMatch[1]);
  }

  /**
   * Parse decision from text lines
   */
  _parseDecisionLines(text) {
    const lines = text.split('\n');
    const decision = {
      action: 'HOLD',
      symbol: null,
      size: null,
      reason: ''
    };
    
    for (const line of lines) {
      const actionMatch = line.match(/ACTION:\s*(LONG|SHORT|CLOSE|HOLD|BUY|SELL)/i);
      if (actionMatch) decision.action = actionMatch[1].toUpperCase();
      
      const symbolMatch = line.match(/SYMBOL:\s*(\w+)/i);
      if (symbolMatch) decision.symbol = symbolMatch[1].toUpperCase();
      
      const sizeMatch = line.match(/SIZE:\s*([\d.]+)/i);
      if (sizeMatch) decision.size = parseFloat(sizeMatch[1]);
      
      const reasonMatch = line.match(/REASON:\s*(.+)/i);
      if (reasonMatch) decision.reason = reasonMatch[1].trim();
    }
    
    // Validate size against max
    if (decision.size && decision.size > this.maxPositionSize) {
      console.log(`[Decision] Size ${decision.size} exceeds max ${this.maxPositionSize}, capping`);
      decision.size = this.maxPositionSize;
    }
    
    return decision;
  }
}

/**
 * Create a decision engine instance
 */
export function createDecisionEngine(config, hyperliquidClient) {
  return new DecisionEngine(config, hyperliquidClient);
}

export default DecisionEngine;
