import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { saveResearchToMemory } from '../utils/compaction.js';

/**
 * Research Engine
 * Uses Perplexity sonar-deep-research model via OpenRouter
 * Runs on a schedule (default: every 12h) to gather macro market intelligence
 */
export class ResearchEngine {
  constructor(config) {
    this.agentId = config.agentId;
    this.model = config.models?.research || 'perplexity/sonar-deep-research';
    this.interval = config.researchInterval || 43200000; // 12h default
    
    // Create OpenRouter client
    this.openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY
    });
    
    this._intervalId = null;
    this._lastRun = null;
  }

  /**
   * Run a research query
   */
  async runResearch(query = 'Macro Market Today') {
    console.log(`[Research] Running query: "${query}"`);
    
    const startTime = Date.now();
    
    try {
      const result = await generateText({
        model: this.openrouter(this.model),
        prompt: this._buildResearchPrompt(query),
        maxTokens: 4096
      });
      
      const duration = Date.now() - startTime;
      console.log(`[Research] Completed in ${duration}ms`);
      
      // Parse and structure the response
      const structured = this._parseResearchResponse(result.text, query);
      
      // Save to memory
      const saved = await saveResearchToMemory(this.agentId, structured);
      console.log(`[Research] Saved to ${saved.filename}`);
      
      this._lastRun = {
        timestamp: new Date().toISOString(),
        query,
        success: true,
        filepath: saved.filepath
      };
      
      return {
        success: true,
        data: structured,
        filepath: saved.filepath
      };
    } catch (error) {
      console.error(`[Research] Error: ${error.message}`);
      
      this._lastRun = {
        timestamp: new Date().toISOString(),
        query,
        success: false,
        error: error.message
      };
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build the research prompt
   */
  _buildResearchPrompt(query) {
    return `You are a cryptocurrency and macro market research analyst. Provide a comprehensive analysis based on the following query.

Query: ${query}

Please provide:
1. **Executive Summary**: A brief overview of current market conditions
2. **Key Market Movements**: Notable price movements, volume changes, and trends
3. **Macro Factors**: Relevant economic news, Fed decisions, regulations, institutional moves
4. **Crypto-Specific News**: Protocol updates, exchange news, on-chain metrics
5. **Risk Assessment**: Current market risks and potential catalysts
6. **Trading Implications**: What this means for traders in the next 24-48 hours

Be specific with data points, percentages, and timeframes. Focus on actionable intelligence.`;
  }

  /**
   * Parse research response into structured format
   */
  _parseResearchResponse(text, query) {
    // Extract key points (lines starting with - or *)
    const keyPointsMatch = text.match(/^[\-\*]\s+.+$/gm) || [];
    const keyPoints = keyPointsMatch.map(p => p.replace(/^[\-\*]\s+/, '').trim()).slice(0, 10);
    
    // Try to extract sources (URLs or citations)
    const urlMatch = text.match(/https?:\/\/[^\s\)]+/g) || [];
    const sources = [...new Set(urlMatch)].slice(0, 10);
    
    return {
      query,
      summary: text,
      keyPoints,
      sources,
      rawResponse: text,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Start the scheduled research loop
   */
  start() {
    console.log(`[Research] Starting scheduler (interval: ${this.interval}ms)`);
    
    // Run immediately on start
    this.runResearch();
    
    // Then schedule periodic runs
    this._intervalId = setInterval(() => {
      this.runResearch();
    }, this.interval);
    
    return this;
  }

  /**
   * Stop the scheduled research loop
   */
  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
      console.log('[Research] Scheduler stopped');
    }
    return this;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      running: this._intervalId !== null,
      interval: this.interval,
      lastRun: this._lastRun,
      model: this.model
    };
  }

  /**
   * Force run (useful for testing or manual triggers)
   */
  async forceRun(query) {
    return this.runResearch(query || 'Macro Market Today');
  }
}

/**
 * Create a research engine instance
 */
export function createResearchEngine(config) {
  return new ResearchEngine(config);
}

export default ResearchEngine;
