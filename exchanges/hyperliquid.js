import { ethers } from 'ethers';
import { signL1Action } from '@nktkas/hyperliquid/signing';

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz';
const HYPERLIQUID_INFO_API = `${HYPERLIQUID_API}/info`;
const HYPERLIQUID_EXCHANGE_API = `${HYPERLIQUID_API}/exchange`;

/**
 * Hyperliquid Exchange Client
 * Handles validation, market data, and trade execution
 */
export class HyperliquidClient {
  constructor(config = {}) {
    this.walletAddress = config.walletAddress;
    this.privateKey = config.privateKey;
    this.wallet = config.privateKey ? new ethers.Wallet(config.privateKey) : null;
    
    // Cache for metadata
    this._perpMeta = null;
    this._spotMeta = null;
    this._hip3Tokens = null;
  }

  /**
   * Fetch perpetual markets metadata
   */
  async getPerpMeta() {
    if (this._perpMeta) return this._perpMeta;
    
    const response = await fetch(HYPERLIQUID_INFO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch perp meta: ${response.statusText}`);
    }
    
    this._perpMeta = await response.json();
    return this._perpMeta;
  }

  /**
   * Fetch spot markets metadata
   */
  async getSpotMeta() {
    if (this._spotMeta) return this._spotMeta;
    
    const response = await fetch(HYPERLIQUID_INFO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'spotMeta' })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch spot meta: ${response.statusText}`);
    }
    
    this._spotMeta = await response.json();
    return this._spotMeta;
  }

  /**
   * Fetch HIP-3 perp dex metadata (e.g., xyz for stocks/commodities)
   */
  async getHip3Meta(dex = 'xyz') {
    const cacheKey = `_hip3Meta_${dex}`;
    if (this[cacheKey]) return this[cacheKey];
    
    const response = await fetch(HYPERLIQUID_INFO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta', dex })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch HIP-3 meta for dex ${dex}: ${response.statusText}`);
    }
    
    this[cacheKey] = await response.json();
    return this[cacheKey];
  }

  /**
   * Fetch HIP-3 tokens (permissionless tokens)
   */
  async getHip3Tokens() {
    if (this._hip3Tokens) return this._hip3Tokens;
    
    // HIP-3 tokens are part of spot meta with specific flags
    const spotMeta = await this.getSpotMeta();
    this._hip3Tokens = spotMeta.tokens?.filter(t => t.isHip3) || [];
    return this._hip3Tokens;
  }

  /**
   * Validate if a trading pair exists
   */
  async validateTradingPair(symbol, market) {
    try {
      if (market === 'perp') {
        const meta = await this.getPerpMeta();
        const found = meta.universe?.find(
          m => m.name.toUpperCase() === symbol.toUpperCase()
        );
        if (found) {
          return { valid: true, info: found };
        }
        return { valid: false, error: `Perp market ${symbol} not found` };
      }
      
      if (market === 'spot') {
        const meta = await this.getSpotMeta();
        const found = meta.tokens?.find(
          t => t.name.toUpperCase() === symbol.toUpperCase()
        );
        if (found) {
          return { valid: true, info: found };
        }
        return { valid: false, error: `Spot token ${symbol} not found` };
      }
      
      if (market === 'hip3') {
        // HIP-3 perp symbols are like xyz:GOLD, xyz:TSLA
        const dex = symbol.split(':')[0] || 'xyz';
        try {
          const meta = await this.getHip3Meta(dex);
          const found = meta.universe?.find(
            m => m.name.toUpperCase() === symbol.toUpperCase()
          );
          if (found) {
            return { valid: true, info: found };
          }
        } catch (e) {
          // Fall through to error
        }
        return { valid: false, error: `HIP-3 perp ${symbol} not found` };
      }
      
      return { valid: false, error: `Unknown market type: ${market}` };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get current price for a symbol
   */
  async getPrice(symbol, market = 'perp') {
    // For HIP-3, use metaAndAssetCtxs from the dex
    if (market === 'hip3' || symbol.includes(':')) {
      const dex = symbol.split(':')[0] || 'xyz';
      const response = await fetch(HYPERLIQUID_INFO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs', dex })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch HIP-3 prices: ${response.statusText}`);
      }
      
      const [meta, ctxs] = await response.json();
      const idx = meta.universe?.findIndex(
        m => m.name.toUpperCase() === symbol.toUpperCase()
      );
      
      if (idx !== -1 && ctxs[idx]) {
        const price = parseFloat(ctxs[idx].markPx || ctxs[idx].oraclePx);
        if (price > 0) return price;
      }
      
      throw new Error(`Price not found for HIP-3 ${symbol}`);
    }
    
    const response = await fetch(HYPERLIQUID_INFO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'allMids'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch prices: ${response.statusText}`);
    }
    
    const mids = await response.json();
    
    // allMids returns an object where keys are coin names (e.g., "ETH", "BTC")
    // Try direct lookup first
    const symbolUpper = symbol.toUpperCase();
    
    if (mids[symbolUpper]) {
      return parseFloat(mids[symbolUpper]);
    }
    
    // Also try with the symbol as-is
    if (mids[symbol]) {
      return parseFloat(mids[symbol]);
    }
    
    // For perps, also check the universe names
    if (market === 'perp') {
      const meta = await this.getPerpMeta();
      const asset = meta.universe?.find(
        m => m.name.toUpperCase() === symbolUpper
      );
      if (asset && mids[asset.name]) {
        return parseFloat(mids[asset.name]);
      }
    }
    
    // Debug: log available keys
    const availableKeys = Object.keys(mids).slice(0, 10);
    throw new Error(`Price not found for ${symbol} (${market}). Available: ${availableKeys.join(', ')}...`);
  }

  /**
   * Get candle data for charting
   */
  async getCandles(symbol, interval = '1h', limit = 100) {
    // For HIP-3 symbols, validate against the dex meta
    if (symbol.includes(':')) {
      const dex = symbol.split(':')[0];
      const meta = await this.getHip3Meta(dex);
      const assetIndex = meta.universe?.findIndex(
        m => m.name.toUpperCase() === symbol.toUpperCase()
      );
      if (assetIndex === -1) {
        throw new Error(`HIP-3 asset ${symbol} not found in dex ${dex}`);
      }
    } else {
      const meta = await this.getPerpMeta();
      const assetIndex = meta.universe?.findIndex(
        m => m.name.toUpperCase() === symbol.toUpperCase()
      );
      if (assetIndex === -1) {
        throw new Error(`Asset ${symbol} not found`);
      }
    }
    
    const endTime = Date.now();
    const response = await fetch(HYPERLIQUID_INFO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin: symbol.toUpperCase(),
          interval,
          startTime: endTime - (limit * this._intervalToMs(interval)),
          endTime
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch candles: ${response.statusText}`);
    }
    
    const candles = await response.json();
    return candles.map(c => ({
      time: c.t,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v)
    }));
  }

  /**
   * Get account state (positions, balances)
   */
  async getAccountState(address = this.walletAddress) {
    const response = await fetch(HYPERLIQUID_INFO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: address
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch account state: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Get open orders
   */
  async getOpenOrders(address = this.walletAddress) {
    const response = await fetch(HYPERLIQUID_INFO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openOrders',
        user: address
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch open orders: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Place an order (requires private key)
   */
  async placeOrder(orderParams) {
    if (!this.wallet) {
      throw new Error('Private key required for trading');
    }
    
    const { symbol, side, size, price, orderType = 'limit', reduceOnly = false } = orderParams;
    
    let assetIndex;
    
    if (symbol.includes(':')) {
      // HIP-3 builder-deployed perp: asset = 100000 + perp_dex_index * 10000 + index_in_meta
      const dex = symbol.split(':')[0];
      const meta = await this.getHip3Meta(dex);
      const indexInMeta = meta.universe?.findIndex(
        m => m.name.toUpperCase() === symbol.toUpperCase()
      );
      if (indexInMeta === -1) {
        throw new Error(`HIP-3 asset ${symbol} not found`);
      }
      // Get perp_dex_index from perpDexs
      const dexesRes = await fetch(HYPERLIQUID_INFO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'perpDexs' })
      });
      const dexes = await dexesRes.json();
      const perpDexIndex = dexes.findIndex(d => d && d.name === dex);
      if (perpDexIndex === -1) {
        throw new Error(`HIP-3 dex ${dex} not found`);
      }
      assetIndex = 100000 + perpDexIndex * 10000 + indexInMeta;
    } else {
      const meta = await this.getPerpMeta();
      assetIndex = meta.universe?.findIndex(
        m => m.name.toUpperCase() === symbol.toUpperCase()
      );
      if (assetIndex === -1) {
        throw new Error(`Asset ${symbol} not found`);
      }
    }
    
    const nonce = Date.now();
    const formattedPrice = this._formatNumber(price);
    const formattedSize = this._formatNumber(size);

    const action = {
      type: 'order',
      orders: [{
        a: assetIndex,
        b: side === 'buy',
        p: formattedPrice,
        s: formattedSize,
        r: reduceOnly,
        t: orderType === 'limit'
          ? { limit: { tif: 'Gtc' } }
          : { trigger: { triggerPx: formattedPrice, isMarket: true, tpsl: 'tp' } }
      }],
      grouping: 'na'
    };
    
    const signature = await this._signAction(action, nonce);
    
    const response = await fetch(HYPERLIQUID_EXCHANGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, nonce, signature })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Order failed: ${error}`);
    }
    
    return await response.json();
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol, orderId) {
    if (!this.wallet) {
      throw new Error('Private key required for trading');
    }
    
    const meta = await this.getPerpMeta();
    const assetIndex = meta.universe?.findIndex(
      m => m.name.toUpperCase() === symbol.toUpperCase()
    );
    
    const nonce = Date.now();
    const action = {
      type: 'cancel',
      cancels: [{ a: assetIndex, o: orderId }]
    };
    
    const signature = await this._signAction(action, nonce);
    
    const response = await fetch(HYPERLIQUID_EXCHANGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, nonce, signature })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cancel failed: ${error}`);
    }
    
    return await response.json();
  }

  /**
   * Sign an L1 action using the @nktkas/hyperliquid SDK.
   * Handles EIP-712 phantom agent construction, msgpack serialization,
   * and keccak256 hashing per Hyperliquid's spec.
   */
  async _signAction(action, nonce) {
    return await signL1Action({ wallet: this.wallet, action, nonce });
  }

  /**
   * Strip trailing zeros from a numeric string.
   * Hyperliquid rejects signatures when price/size contain trailing zeros.
   */
  _formatNumber(n) {
    const s = typeof n === 'string' ? n : String(n);
    if (!s.includes('.')) return s;
    return s.replace(/\.?0+$/, '');
  }

  /**
   * Convert interval string to milliseconds
   */
  _intervalToMs(interval) {
    const units = {
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    const value = parseInt(interval);
    const unit = interval.slice(-1);
    return value * (units[unit] || units['h']);
  }
}

/**
 * Create a new Hyperliquid client
 */
export function createHyperliquidClient(config) {
  return new HyperliquidClient(config);
}

export default HyperliquidClient;
