import { z } from 'zod';
import { tool } from 'ai';

/**
 * Create price chart tool for the decision agent
 */
export function createPriceChartTool(hyperliquidClient) {
  return tool({
    description: 'Get price chart data (OHLCV candles) for a trading pair. Symbol must be simple like ETH, BTC, SOL - NOT full contract names.',
    parameters: z.object({
      symbol: z.string().max(10).describe('Trading symbol - use simple names like ETH, BTC, SOL (NOT full contract names)'),
      interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('1h').describe('Candle interval'),
      limit: z.number().min(10).max(500).default(100).describe('Number of candles to fetch')
    }),
    execute: async ({ symbol, interval, limit }) => {
      try {
        const candles = await hyperliquidClient.getCandles(symbol, interval, limit);
        
        // Calculate basic technical indicators
        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        
        const currentPrice = closes[closes.length - 1];
        const priceChange = ((currentPrice - closes[0]) / closes[0]) * 100;
        
        // Simple Moving Averages
        const sma20 = calculateSMA(closes, 20);
        const sma50 = calculateSMA(closes, 50);
        
        // RSI
        const rsi = calculateRSI(closes, 14);
        
        // Support and Resistance
        const recentHighs = highs.slice(-20);
        const recentLows = lows.slice(-20);
        const resistance = Math.max(...recentHighs);
        const support = Math.min(...recentLows);
        
        // Volume analysis
        const volumes = candles.map(c => c.volume);
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const volumeTrend = recentVolume > avgVolume ? 'above_average' : 'below_average';
        
        return {
          symbol,
          interval,
          currentPrice,
          priceChange: `${priceChange.toFixed(2)}%`,
          indicators: {
            sma20,
            sma50,
            rsi,
            trend: sma20 > sma50 ? 'bullish' : 'bearish'
          },
          levels: {
            resistance,
            support,
            distanceToResistance: `${((resistance - currentPrice) / currentPrice * 100).toFixed(2)}%`,
            distanceToSupport: `${((currentPrice - support) / currentPrice * 100).toFixed(2)}%`
          },
          volume: {
            average: avgVolume,
            recent: recentVolume,
            trend: volumeTrend
          },
          recentCandles: candles.slice(-10).map(c => ({
            time: new Date(c.time).toISOString(),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
          }))
        };
      } catch (error) {
        return {
          error: error.message,
          symbol,
          interval
        };
      }
    }
  });
}

/**
 * Create current price tool
 */
export function createGetPriceTool(hyperliquidClient) {
  return tool({
    description: 'Get the current price for a trading symbol. Use simple symbol names like ETH, BTC.',
    parameters: z.object({
      symbol: z.string().max(10).describe('Trading symbol - use simple names like ETH, BTC (max 10 chars)'),
      market: z.enum(['perp', 'spot']).default('perp').describe('Market type')
    }),
    execute: async ({ symbol, market }) => {
      try {
        const price = await hyperliquidClient.getPrice(symbol, market);
        return { symbol, market, price, timestamp: new Date().toISOString() };
      } catch (error) {
        return { error: error.message, symbol, market };
      }
    }
  });
}

/**
 * Create account state tool
 */
export function createAccountStateTool(hyperliquidClient) {
  return tool({
    description: 'Get current account state including positions, balances, and margin info',
    parameters: z.object({}),
    execute: async () => {
      try {
        const state = await hyperliquidClient.getAccountState();
        return {
          marginSummary: state.marginSummary,
          positions: state.assetPositions?.map(p => ({
            symbol: p.position.coin,
            size: p.position.szi,
            entryPrice: p.position.entryPx,
            unrealizedPnl: p.position.unrealizedPnl,
            leverage: p.position.leverage
          })).filter(p => parseFloat(p.size) !== 0),
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  });
}

// Helper: Calculate Simple Moving Average
function calculateSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Helper: Calculate RSI
function calculateRSI(data, period = 14) {
  if (data.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
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

export default {
  createPriceChartTool,
  createGetPriceTool,
  createAccountStateTool
};
