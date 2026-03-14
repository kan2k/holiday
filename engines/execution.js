/**
 * Execution Engine
 * Takes decisions from the Decision Engine and executes trades via Hyperliquid
 */
export class ExecutionEngine {
  constructor(config, hyperliquidClient) {
    this.agentId = config.agentId;
    this.tradingPairs = config.tradingPairs;
    this.maxPositionSize = config.maxPositionSize || 0.02;
    this.hyperliquid = hyperliquidClient;
    
    // Execution mode: 'live' or 'paper'
    this.mode = config.executionMode || 'paper';
  }

  /**
   * Execute a trading decision
   */
  async execute(decision) {
    console.log(`[Execution] Processing decision: ${decision.action} ${decision.symbol || ''}`);
    
    // Validate decision
    const validation = this._validateDecision(decision);
    if (!validation.valid) {
      return {
        success: false,
        executed: false,
        error: validation.error,
        decision
      };
    }
    
    // HOLD requires no action
    if (decision.action === 'HOLD') {
      return {
        success: true,
        executed: false,
        reason: 'Decision was HOLD - no action required',
        decision
      };
    }
    
    // Get current account state
    const accountState = await this._getAccountState();
    if (!accountState.success) {
      return {
        success: false,
        executed: false,
        error: accountState.error,
        decision
      };
    }
    
    // Calculate order parameters
    const orderParams = await this._calculateOrderParams(decision, accountState.data);
    if (!orderParams.valid) {
      return {
        success: false,
        executed: false,
        error: orderParams.error,
        decision
      };
    }
    
    // Execute based on mode
    if (this.mode === 'paper') {
      return this._paperExecute(orderParams.params, decision);
    } else {
      return this._liveExecute(orderParams.params, decision);
    }
  }

  /**
   * Validate the decision
   */
  _validateDecision(decision) {
    if (!decision || !decision.action) {
      return { valid: false, error: 'Invalid decision object' };
    }
    
    const validActions = ['BUY', 'SELL', 'HOLD'];
    if (!validActions.includes(decision.action)) {
      return { valid: false, error: `Invalid action: ${decision.action}` };
    }
    
    if (decision.action !== 'HOLD') {
      if (!decision.symbol) {
        return { valid: false, error: 'Symbol required for BUY/SELL' };
      }
      
      if (!decision.size || decision.size <= 0) {
        return { valid: false, error: 'Valid size required for BUY/SELL' };
      }
      
      // Check if symbol is in allowed trading pairs
      const allowedSymbols = this.tradingPairs.map(p => p.symbol.toUpperCase());
      if (!allowedSymbols.includes(decision.symbol.toUpperCase())) {
        return { valid: false, error: `Symbol ${decision.symbol} not in allowed trading pairs` };
      }
      
      // Check size limit
      if (decision.size > this.maxPositionSize) {
        return { valid: false, error: `Size ${decision.size} exceeds max ${this.maxPositionSize}` };
      }
    }
    
    return { valid: true };
  }

  /**
   * Get account state
   */
  async _getAccountState() {
    try {
      const state = await this.hyperliquid.getAccountState();
      return { success: true, data: state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate order parameters
   */
  async _calculateOrderParams(decision, accountState) {
    try {
      // Get account value
      const accountValue = parseFloat(accountState.marginSummary?.accountValue || 0);
      if (accountValue <= 0) {
        return { valid: false, error: 'Account has no value' };
      }
      
      // Calculate position value
      const positionValue = accountValue * decision.size;
      
      // Get current price
      const price = await this.hyperliquid.getPrice(decision.symbol);
      
      // Calculate size in asset terms
      const assetSize = positionValue / price;
      
      // Determine market type from config
      const pairConfig = this.tradingPairs.find(
        p => p.symbol.toUpperCase() === decision.symbol.toUpperCase()
      );
      
      return {
        valid: true,
        params: {
          symbol: decision.symbol.toUpperCase(),
          side: decision.action.toLowerCase(),
          size: assetSize,
          price: price,
          market: pairConfig?.market || 'perp',
          orderType: 'limit',
          positionValue,
          accountValue
        }
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Paper trading execution (simulated)
   */
  _paperExecute(params, decision) {
    console.log(`[Execution] PAPER TRADE: ${params.side} ${params.size} ${params.symbol} @ ${params.price}`);
    
    return {
      success: true,
      executed: true,
      mode: 'paper',
      order: {
        symbol: params.symbol,
        side: params.side,
        size: params.size,
        price: params.price,
        positionValue: params.positionValue,
        timestamp: new Date().toISOString()
      },
      decision,
      note: 'Paper trade - no real order placed'
    };
  }

  /**
   * Live trading execution
   */
  async _liveExecute(params, decision) {
    console.log(`[Execution] LIVE TRADE: ${params.side} ${params.size} ${params.symbol} @ ${params.price}`);
    
    try {
      const result = await this.hyperliquid.placeOrder({
        symbol: params.symbol,
        side: params.side,
        size: params.size,
        price: params.price,
        orderType: params.orderType
      });
      
      return {
        success: true,
        executed: true,
        mode: 'live',
        order: {
          symbol: params.symbol,
          side: params.side,
          size: params.size,
          price: params.price,
          positionValue: params.positionValue,
          orderId: result.response?.data?.statuses?.[0]?.oid,
          timestamp: new Date().toISOString()
        },
        decision,
        rawResult: result
      };
    } catch (error) {
      console.error(`[Execution] Live trade failed: ${error.message}`);
      
      return {
        success: false,
        executed: false,
        mode: 'live',
        error: error.message,
        decision
      };
    }
  }

  /**
   * Cancel an open order
   */
  async cancelOrder(symbol, orderId) {
    if (this.mode === 'paper') {
      return {
        success: true,
        mode: 'paper',
        note: 'Paper mode - no real cancel'
      };
    }
    
    try {
      const result = await this.hyperliquid.cancelOrder(symbol, orderId);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get execution status
   */
  getStatus() {
    return {
      mode: this.mode,
      tradingPairs: this.tradingPairs,
      maxPositionSize: this.maxPositionSize
    };
  }
}

/**
 * Create an execution engine instance
 */
export function createExecutionEngine(config, hyperliquidClient) {
  return new ExecutionEngine(config, hyperliquidClient);
}

export default ExecutionEngine;
