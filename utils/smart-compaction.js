import fs from 'fs/promises';
import path from 'path';

/**
 * Format relative time (e.g., "2 hours ago", "15 minutes ago")
 */
function formatTimeAgo(timestamp) {
  // Parse timestamp from filename format: agentId-YYYY-MM-DD_HH-MM-SS
  const match = timestamp.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return '';
  
  const [, year, month, day, hour, min, sec] = match;
  // Don't use 'Z' - the timestamp is in local time, not UTC
  const decisionTime = new Date(year, month - 1, day, hour, min, sec);
  const now = new Date();
  const diffMs = now - decisionTime;
  
  // Handle negative diff (shouldn't happen but just in case)
  if (diffMs < 0) return 'just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
}

/**
 * Smart Compaction System
 * Inspired by Claude Code's auto-compaction approach
 * 
 * Uses structured summarization to preserve:
 * - Trading intent and strategy
 * - Recent decisions and their outcomes
 * - Market context and analysis
 * - Errors and lessons learned
 * - Current positions and pending actions
 */

const COMPACTION_PROMPT = `You are a trading context summarizer. Create a structured summary of the trading session.

Your summary must include these sections:

1. **Trading Intent**: What is the agent's trading strategy and current objectives?

2. **Market Analysis**: Key market conditions, trends, and technical levels identified.

3. **Recent Decisions**: List the last 3-5 trading decisions with:
   - Action taken (BUY/SELL/HOLD)
   - Reasoning behind the decision
   - Outcome if known

4. **Lessons Learned**: Any errors, mistakes, or insights that should inform future decisions.

5. **Current Positions**: Open positions, entry prices, and unrealized P&L.

6. **Pending Actions**: Any trades or actions that were planned but not yet executed.

7. **Key Levels**: Important price levels (support, resistance, stop-loss, take-profit).

8. **Next Steps**: What should the agent focus on in the next iteration?

Be concise but preserve all actionable trading intelligence.`;

/**
 * Generate a compact trading summary from recent decisions
 */
export async function generateTradingSummary(agentId, recentDecisions, currentMarketData = null) {
  const sections = {
    tradingIntent: '',
    marketAnalysis: '',
    recentDecisions: [],
    lessonsLearned: [],
    currentPositions: [],
    pendingActions: [],
    keyLevels: {},
    nextSteps: ''
  };

  // Extract from recent decisions
  for (const decision of recentDecisions) {
    const content = decision.content;
    
    // Extract decision action
    const actionMatch = content.match(/\*\*Action\*\*:\s*(\w+)/);
    const reasonMatch = content.match(/\*\*Reason\*\*:\s*(.+)/);
    sections.recentDecisions.push({
      timestamp: decision.filename.replace('.md', ''),
      action: actionMatch?.[1] || 'UNKNOWN',
      reason: reasonMatch?.[1] || 'No reason provided'
    });

    // Extract lessons from reasoning
    const reasoningMatch = content.match(/## Reasoning\n([\s\S]*?)(?=\n## |$)/);
    if (reasoningMatch) {
      // Look for error mentions or lesson patterns
      const reasoning = reasoningMatch[1];
      if (reasoning.includes('mistake') || reasoning.includes('error') || reasoning.includes('lesson')) {
        sections.lessonsLearned.push(reasoning.slice(0, 200));
      }
    }
  }

  // Add current market context if available
  if (currentMarketData) {
    if (currentMarketData.charts) {
      sections.marketAnalysis = currentMarketData.charts.map(c => 
        `${c.symbol}: $${c.currentPrice?.toFixed(2)} | RSI: ${c.rsi?.toFixed(1)} | Trend: ${c.sma20 > c.currentPrice ? 'Below SMA20' : 'Above SMA20'}`
      ).join('\n');
    }
    
    if (currentMarketData.account?.assetPositions) {
      sections.currentPositions = currentMarketData.account.assetPositions
        .filter(p => parseFloat(p.position?.szi) !== 0)
        .map(p => ({
          symbol: p.position.coin,
          size: p.position.szi,
          entryPrice: p.position.entryPx,
          pnl: p.position.unrealizedPnl
        }));
    }
  }

  return sections;
}

/**
 * Format trading summary as markdown for storage
 */
export function formatTradingSummary(summary, agentId) {
  return `# Trading Context Summary: ${agentId}
*Generated: ${new Date().toISOString()}*

## Trading Intent
${summary.tradingIntent || 'Continue monitoring for high-conviction setups'}

## Market Analysis
${summary.marketAnalysis || 'Awaiting fresh market data'}

## Recent Decisions (Last ${summary.recentDecisions.length})
${summary.recentDecisions.map((d, i) => {
  const timeAgo = formatTimeAgo(d.timestamp);
  return `${i + 1}. **${d.action}** (${timeAgo}) - ${d.reason}`;
}).join('\n') || 'No recent decisions'}

## Lessons Learned
${summary.lessonsLearned.length > 0 
  ? summary.lessonsLearned.map(l => `- ${l}`).join('\n')
  : '- No significant lessons yet'}

## Current Positions
${summary.currentPositions.length > 0
  ? summary.currentPositions.map(p => 
      `- ${p.symbol}: ${p.size} @ $${p.entryPrice} (PnL: ${p.pnl})`
    ).join('\n')
  : '- No open positions'}

## Key Price Levels
${Object.keys(summary.keyLevels).length > 0
  ? Object.entries(summary.keyLevels).map(([sym, levels]) =>
      `- ${sym}: Support $${levels.support}, Resistance $${levels.resistance}`
    ).join('\n')
  : '- No key levels tracked'}

## Next Steps
${summary.nextSteps || 'Continue with standard decision loop'}

---
*This summary preserves trading context across iterations (Ralph Loop pattern)*
`;
}

/**
 * Delta summarization for incremental updates
 * Similar to Claude Code's background task summarization
 */
export function createDeltaSummary(previousSummary, newDecision) {
  // Extract key info from new decision
  const actionMatch = newDecision.match(/\*\*Action\*\*:\s*(\w+)/);
  const reasonMatch = newDecision.match(/\*\*Reason\*\*:\s*(.+)/);
  
  const action = actionMatch?.[1] || 'HOLD';
  const reason = reasonMatch?.[1] || 'No reason';
  
  // Create 1-2 sentence update
  const timestamp = new Date().toISOString().split('T')[0];
  const delta = `[${timestamp}] Decision: ${action}. ${reason}`;
  
  // Append to previous summary, keeping last 10 deltas
  const lines = previousSummary ? previousSummary.split('\n') : [];
  lines.push(delta);
  
  // Keep only last 10 decision summaries
  if (lines.length > 10) {
    lines.shift();
  }
  
  return lines.join('\n');
}

/**
 * Load or create the rolling summary file
 */
export async function loadRollingSummary(agentId, baseDir = process.cwd()) {
  const summaryPath = path.join(baseDir, 'memory', `${agentId}-summary.md`);
  
  try {
    const content = await fs.readFile(summaryPath, 'utf-8');
    return { exists: true, content, path: summaryPath };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { exists: false, content: null, path: summaryPath };
    }
    throw error;
  }
}

/**
 * Save the rolling summary
 */
export async function saveRollingSummary(agentId, summary, baseDir = process.cwd()) {
  const summaryPath = path.join(baseDir, 'memory', `${agentId}-summary.md`);
  await fs.writeFile(summaryPath, summary, 'utf-8');
  return summaryPath;
}

/**
 * Create continuation message for decision engine
 * Similar to Claude Code's post-compaction message
 */
export function createContinuationMessage(summary) {
  return `This decision session continues from previous trading activity. Here is the context summary:

${summary}

Continue making trading decisions based on this context. Do not re-ask about trading strategy or objectives - proceed with analysis and decision-making.`;
}

/**
 * Microcompaction: Keep last N decisions in full, summarize older ones
 */
export async function microcompactDecisions(agentId, keepFull = 3, baseDir = process.cwd()) {
  const { loadRecentDecisions } = await import('./compaction.js');
  
  const allDecisions = await loadRecentDecisions(agentId, 20, baseDir);
  
  if (allDecisions.length <= keepFull) {
    // No compaction needed
    return {
      fullDecisions: allDecisions,
      summary: null
    };
  }
  
  // Keep last N in full
  const fullDecisions = allDecisions.slice(0, keepFull);
  const toSummarize = allDecisions.slice(keepFull);
  
  // Create delta summary of older decisions
  let deltaSummary = '';
  for (const decision of toSummarize.reverse()) {
    deltaSummary = createDeltaSummary(deltaSummary, decision.content);
  }
  
  return {
    fullDecisions,
    summary: deltaSummary,
    summarizedCount: toSummarize.length
  };
}

export default {
  generateTradingSummary,
  formatTradingSummary,
  createDeltaSummary,
  loadRollingSummary,
  saveRollingSummary,
  createContinuationMessage,
  microcompactDecisions,
  COMPACTION_PROMPT
};
