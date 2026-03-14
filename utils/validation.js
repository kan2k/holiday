import { ethers } from 'ethers';
import { z } from 'zod';

// Schema for agent configuration
export const AgentConfigSchema = z.object({
  agentId: z.string().min(1),
  loopInterval: z.number().min(60000), // minimum 1 minute
  persona: z.string().min(10),
  walletAddress: z.string(),
  privateKey: z.string(),
  tradingPairs: z.array(z.object({
    symbol: z.string(),
    market: z.enum(['spot', 'perp', 'hip3']),
    dex: z.string().optional() // HIP-3 dex name (e.g., 'xyz')
  })).min(1),
  researchInterval: z.number().default(43200000), // 12h default
  maxPositionSize: z.number().min(0).max(1).default(0.02),
  leverage: z.number().min(1).max(100).default(1),
  models: z.object({
    research: z.string().default('perplexity/sonar-deep-research'),
    decision: z.string().default('moonshotai/kimi-k2.5'),
    review: z.string().default('moonshotai/kimi-k2.5')  // Safety layer model
  }).default({})
});

/**
 * Validate Ethereum wallet address
 */
export function validateWalletAddress(address) {
  try {
    const checksumAddress = ethers.getAddress(address);
    return {
      valid: true,
      address: checksumAddress
    };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid wallet address: ${error.message}`
    };
  }
}

/**
 * Validate private key and check it matches wallet address
 */
export function validatePrivateKey(privateKey, expectedAddress) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const derivedAddress = wallet.address;
    
    if (derivedAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      return {
        valid: false,
        error: `Private key does not match wallet address. Derived: ${derivedAddress}, Expected: ${expectedAddress}`
      };
    }
    
    return {
      valid: true,
      address: derivedAddress
    };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid private key: ${error.message}`
    };
  }
}

/**
 * Validate agent configuration
 */
export async function validateAgentConfig(config, hyperliquidClient) {
  const errors = [];
  const warnings = [];
  
  // 1. Validate schema
  const schemaResult = AgentConfigSchema.safeParse(config);
  if (!schemaResult.success) {
    errors.push(`Schema validation failed: ${schemaResult.error.message}`);
    return { valid: false, errors, warnings };
  }
  
  const validConfig = schemaResult.data;
  
  // 2. Validate wallet address
  const walletResult = validateWalletAddress(validConfig.walletAddress);
  if (!walletResult.valid) {
    errors.push(walletResult.error);
  }
  
  // 3. Validate private key matches wallet
  if (validConfig.privateKey && validConfig.privateKey !== 'YOUR_PRIVATE_KEY_HERE') {
    const pkResult = validatePrivateKey(validConfig.privateKey, validConfig.walletAddress);
    if (!pkResult.valid) {
      errors.push(pkResult.error);
    }
  } else {
    warnings.push('Private key not configured - running in read-only mode');
  }
  
  // 4. Validate trading pairs exist on Hyperliquid
  if (hyperliquidClient) {
    for (const pair of validConfig.tradingPairs) {
      const pairResult = await hyperliquidClient.validateTradingPair(pair.symbol, pair.market);
      if (!pairResult.valid) {
        errors.push(`Trading pair ${pair.symbol} (${pair.market}): ${pairResult.error}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    config: validConfig,
    errors,
    warnings
  };
}

/**
 * Load and validate config from file
 */
export async function loadAgentConfig(configPath, hyperliquidClient = null) {
  const fs = await import('fs/promises');
  
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    return await validateAgentConfig(config, hyperliquidClient);
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to load config: ${error.message}`],
      warnings: []
    };
  }
}
