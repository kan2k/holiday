import fs from 'fs/promises';
import path from 'path';

/**
 * Generate a datetime-based filename
 */
export function generateDatetimeFilename(agentId = null) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const datetime = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  
  // Include agent name in decision filenames
  if (agentId) {
    return `${agentId}-${datetime}.md`;
  }
  
  return `${datetime}.md`;
}

/**
 * Compact a decision run into a markdown summary
 */
export function compactDecisionRun(decisionData) {
  const {
    timestamp,
    agentId,
    persona,
    marketContext,
    researchSummary,
    priceData,
    decision,
    reasoning,
    execution
  } = decisionData;

  const md = `# Decision Run: ${new Date(timestamp).toISOString()}

## Agent
- **ID**: ${agentId}
- **Persona**: ${persona}

## Market Context
${marketContext || 'No market context available'}

## Market Research
${formatResearchSummary(researchSummary)}

## Price Data
${priceData ? formatPriceData(priceData) : 'No price data'}

## Decision
${formatDecision(decision)}

## Reasoning
${reasoning || 'No reasoning provided'}

## Execution Result
${execution ? formatExecutionResult(execution) : 'No execution (decision was HOLD or failed)'}

---
*Compacted at ${new Date().toISOString()}*
`;

  return md;
}

/**
 * Format research summary - clean up citations and headers
 */
function formatResearchSummary(researchSummary) {
  if (!researchSummary) {
    return 'No research data available';
  }
  
  let cleaned = researchSummary;
  
  // Remove citations like [1], [8][11], etc.
  cleaned = cleaned.replace(/\[\d+\]/g, '');
  cleaned = cleaned.replace(/\[\d+,\s*\d+\]/g, '');
  
  // Remove "## Query" section and its content (up to next ##)
  cleaned = cleaned.replace(/## Query\n.*?\n(?=##|$)/s, '');
  
  // Remove "## Summary" header but keep content
  cleaned = cleaned.replace(/## Summary\n/g, '');
  
  // Remove "# Research Report:" header line
  cleaned = cleaned.replace(/# Research Report:.*\n/g, '');
  
  // Remove "## Key Points" section if empty or generic
  cleaned = cleaned.replace(/## Key Points\n(- .*\n)*\n?/g, '');
  
  // Remove "## Sources" section
  cleaned = cleaned.replace(/## Sources\n(- .*\n)*\n?/g, '');
  
  // Remove "## Raw Response" section
  cleaned = cleaned.replace(/## Raw Response[\s\S]*$/g, '');
  
  // Clean up multiple newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  return cleaned || 'No research data available';
}

/**
 * Format price data for markdown
 */
function formatPriceData(priceData) {
  if (!priceData || !Array.isArray(priceData) || priceData.length === 0) {
    return 'No price data';
  }
  
  return priceData.map(p => 
    `- **${p.symbol}** (${p.market || 'perp'}): $${typeof p.price === 'number' ? p.price.toFixed(2) : p.price}`
  ).join('\n');
}

/**
 * Format decision for markdown - clean format based on action
 */
function formatDecision(decision) {
  if (!decision) {
    return '**Action**: HOLD\n**Reason**: No decision provided';
  }
  
  const action = decision.action || 'HOLD';
  const reason = decision.reason || '';
  
  if (action === 'HOLD') {
    return `**Action**: HOLD
**Reason**: ${reason || 'Waiting for better setup'}`;
  }
  
  // For BUY/SELL, show full details
  return `**Action**: ${action}
**Symbol**: ${decision.symbol || 'N/A'}
**Size**: ${decision.size ? (decision.size * 100).toFixed(1) + '%' : 'N/A'}
**Reason**: ${reason}`;
}

/**
 * Format execution result for markdown
 */
function formatExecutionResult(execution) {
  if (execution.error) {
    return `**Error**: ${execution.error}`;
  }
  
  return `- **Status**: ${execution.status}
- **Order ID**: ${execution.orderId || 'N/A'}
- **Filled**: ${execution.filled || 'N/A'}
- **Avg Price**: ${execution.avgPrice || 'N/A'}`;
}

/**
 * Save compacted decision to global memory/decisions folder
 */
export async function saveDecisionToMemory(agentId, decisionData, baseDir = process.cwd()) {
  // Decisions are now in global memory/decisions folder
  const memoryDir = path.join(baseDir, 'memory', 'decisions');
  
  // Ensure directory exists
  await fs.mkdir(memoryDir, { recursive: true });
  
  // Filename includes agentId: agentName-datetime.md
  const filename = generateDatetimeFilename(agentId);
  const filepath = path.join(memoryDir, filename);
  
  const compactedContent = compactDecisionRun(decisionData);
  await fs.writeFile(filepath, compactedContent, 'utf-8');
  
  return {
    filepath,
    filename,
    content: compactedContent
  };
}

/**
 * Load recent decisions from global memory/decisions folder
 * Filters by agentId prefix in filename
 */
export async function loadRecentDecisions(agentId, limit = 10, baseDir = process.cwd()) {
  const memoryDir = path.join(baseDir, 'memory', 'decisions');
  
  try {
    const files = await fs.readdir(memoryDir);
    // Filter by agentId prefix: agentName-datetime.md
    const mdFiles = files
      .filter(f => f.endsWith('.md') && f.startsWith(`${agentId}-`))
      .sort()
      .reverse()
      .slice(0, limit);
    
    const decisions = await Promise.all(
      mdFiles.map(async (filename) => {
        const content = await fs.readFile(path.join(memoryDir, filename), 'utf-8');
        return { filename, content };
      })
    );
    
    return decisions;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Compact recent decisions into a summary for context
 */
export function summarizeRecentDecisions(decisions) {
  if (!decisions || decisions.length === 0) {
    return 'No previous decisions recorded.';
  }
  
  const summary = decisions.map((d, i) => {
    // Extract key info from markdown content
    const actionMatch = d.content.match(/\*\*Action\*\*: (\w+)/);
    const symbolMatch = d.content.match(/\*\*Symbol\*\*: (\w+)/);
    const reasoningMatch = d.content.match(/## Reasoning\n([\s\S]*?)(?=\n## |$)/);
    
    return `### Decision ${i + 1} (${d.filename.replace('.md', '')})
- Action: ${actionMatch?.[1] || 'Unknown'}
- Symbol: ${symbolMatch?.[1] || 'Unknown'}
- Key Reasoning: ${reasoningMatch?.[1]?.slice(0, 200) || 'No reasoning'}...`;
  }).join('\n\n');
  
  return `## Recent Decision History (Last ${decisions.length})\n\n${summary}`;
}

/**
 * Save research report to global memory (shared across all agents)
 */
export async function saveResearchToMemory(agentId, researchData, baseDir = process.cwd()) {
  // Research is global, not per-agent
  const memoryDir = path.join(baseDir, 'memory', 'research');
  
  await fs.mkdir(memoryDir, { recursive: true });
  
  const filename = generateDatetimeFilename();
  const filepath = path.join(memoryDir, filename);
  
  const content = `# Research Report: ${new Date().toISOString()}

## Query
${researchData.query}

## Summary
${researchData.summary}

## Key Points
${researchData.keyPoints?.map(p => `- ${p}`).join('\n') || 'No key points extracted'}

## Sources
${researchData.sources?.map(s => `- ${s}`).join('\n') || 'No sources available'}

## Raw Response
\`\`\`
${researchData.rawResponse || 'No raw response'}
\`\`\`

---
*Generated at ${new Date().toISOString()}*
`;

  await fs.writeFile(filepath, content, 'utf-8');
  
  return { filepath, filename, content };
}

/**
 * Get latest research report (global, shared across all agents)
 */
export async function getLatestResearch(agentId = null, baseDir = process.cwd()) {
  // Research is global, not per-agent (agentId param kept for backwards compatibility)
  const memoryDir = path.join(baseDir, 'memory', 'research');
  
  try {
    const files = await fs.readdir(memoryDir);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse();
    
    if (mdFiles.length === 0) {
      return null;
    }
    
    const content = await fs.readFile(path.join(memoryDir, mdFiles[0]), 'utf-8');
    return { filename: mdFiles[0], content };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export default {
  generateDatetimeFilename,
  compactDecisionRun,
  saveDecisionToMemory,
  loadRecentDecisions,
  summarizeRecentDecisions,
  saveResearchToMemory,
  getLatestResearch
};
