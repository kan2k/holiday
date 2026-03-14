import fs from 'fs/promises';
import path from 'path';
import { createHyperliquidClient } from '../exchanges/hyperliquid.js';

/**
 * Visualize trading decisions on price charts
 * Generates a static HTML file with TradingView lightweight-charts
 * Shows both BTC and ETH charts
 */

async function loadDecisions(agentId) {
  const decisionsDir = path.join(process.cwd(), 'memory', 'decisions');
  const files = await fs.readdir(decisionsDir);
  
  const decisions = [];
  
  for (const file of files) {
    if (!file.startsWith(agentId) || !file.endsWith('.md')) continue;
    
    const content = await fs.readFile(path.join(decisionsDir, file), 'utf-8');
    
    // Parse timestamp from filename: agentId-YYYY-MM-DD_HH-MM-SS.md
    const match = file.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
    if (!match) continue;
    
    const [, year, month, day, hour, min, sec] = match;
    const timestamp = new Date(year, month - 1, day, hour, min, sec).getTime() / 1000;
    
    // Parse action
    const actionMatch = content.match(/\*\*Action\*\*:\s*(LONG|SHORT|CLOSE|HOLD|BUY|SELL)/i);
    const action = actionMatch?.[1]?.toUpperCase() || 'HOLD';
    
    // Parse symbol
    const symbolMatch = content.match(/\*\*Symbol\*\*:\s*(\w+)/i);
    const symbol = symbolMatch?.[1]?.toUpperCase() || 'BTC';
    
    // Parse reason
    const reasonMatch = content.match(/\*\*Reason\*\*:\s*(.+)/i);
    const reason = reasonMatch?.[1] || '';
    
    // Parse size (e.g., **Size**: 0.02 or **Size**: 2%)
    const sizeMatch = content.match(/\*\*Size\*\*:\s*([\d.]+)%?/i);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : null;
    
    decisions.push({
      timestamp,
      action,
      symbol,
      reason,
      size,
      file
    });
  }
  
  // Sort by timestamp
  decisions.sort((a, b) => a.timestamp - b.timestamp);
  
  return decisions;
}

async function fetchCandles(symbol, days = 7) {
  const client = createHyperliquidClient({});
  
  // Fetch hourly candles for the past N days
  const limit = days * 24;
  const candles = await client.getCandles(symbol, '1h', limit);
  
  return candles.map(c => ({
    time: Math.floor(c.time / 1000), // Convert to seconds
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close
  }));
}

function generateHTML(btcCandles, ethCandles, decisions) {
  // Create HOLD markers for toggle functionality
  function createHoldMarkers(candles) {
    const candleTimes = candles.map(c => c.time);
    
    function snapToCandle(timestamp) {
      let closest = candleTimes[0];
      let minDiff = Math.abs(timestamp - closest);
      for (const t of candleTimes) {
        const diff = Math.abs(timestamp - t);
        if (diff < minDiff) {
          minDiff = diff;
          closest = t;
        }
      }
      return closest;
    }
    
    return decisions
      .filter(d => d.action === 'HOLD')
      .map(d => ({
        time: snapToCandle(d.timestamp),
        position: 'aboveBar',
        color: '#666666',
        shape: 'circle',
        text: '',
        size: 0.5
      }));
  }

  const btcHoldMarkers = createHoldMarkers(btcCandles);
  const ethHoldMarkers = createHoldMarkers(ethCandles);

  const holdCount = decisions.filter(d => d.action === 'HOLD').length;
  const longCount = decisions.filter(d => d.action === 'LONG' || d.action === 'BUY').length;
  const shortCount = decisions.filter(d => d.action === 'SHORT' || d.action === 'SELL').length;

  // Prepare triangle data for custom drawing (no arrows, pure triangles)
  const btcTriangles = decisions
    .filter(d => (d.action === 'LONG' || d.action === 'SHORT' || d.action === 'BUY' || d.action === 'SELL'))
    .filter(d => !d.symbol || d.symbol === 'BTC')
    .map(d => {
      const isLong = d.action === 'LONG' || d.action === 'BUY';
      return {
        time: d.timestamp,
        isLong,
        size: d.size,
        reason: d.reason || 'No reason provided'
      };
    });

  const ethTriangles = decisions
    .filter(d => (d.action === 'LONG' || d.action === 'SHORT' || d.action === 'BUY' || d.action === 'SELL'))
    .filter(d => !d.symbol || d.symbol === 'ETH')
    .map(d => {
      const isLong = d.action === 'LONG' || d.action === 'BUY';
      return {
        time: d.timestamp,
        isLong,
        size: d.size,
        reason: d.reason || 'No reason provided'
      };
    });

  return `<!DOCTYPE html>
<html>
<head>
  <title>Holiday Charts</title>
  <script src="https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 10px;
      background: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .chart-container {
      width: 100%;
      height: calc(50vh - 30px);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 10px;
      position: relative;
    }
    .chart-label {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 10;
      background: rgba(0,0,0,0.6);
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 14px;
    }
    .controls {
      display: flex;
      gap: 20px;
      align-items: center;
      padding: 8px 0;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    .triangle-up {
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 10px solid #00C853;
    }
    .triangle-down {
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 10px solid #FF1744;
    }
    .circle {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #666;
    }
    label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    input[type="checkbox"] {
      cursor: pointer;
    }
    .tooltip {
      position: fixed;
      background: rgba(0, 0, 0, 0.9);
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      max-width: 300px;
      z-index: 1000;
      pointer-events: none;
      display: none;
      line-height: 1.4;
      border: 1px solid #333;
    }
    .tooltip.visible {
      display: block;
    }
  </style>
</head>
<body>
  <div id="tooltip" class="tooltip"></div>
  <div class="controls">
    <div class="legend-item">
      <div class="triangle-up"></div>
      <span>LONG (${longCount})</span>
    </div>
    <div class="legend-item">
      <div class="triangle-down"></div>
      <span>SHORT (${shortCount})</span>
    </div>
    <label>
      <input type="checkbox" id="showHold" onchange="toggleHold()">
      <div class="circle"></div>
      <span>Show HOLD (${holdCount})</span>
    </label>
  </div>

  <div class="chart-container">
    <div class="chart-label">BTC</div>
    <div id="btcChart" style="width: 100%; height: 100%;"></div>
  </div>
  
  <div class="chart-container">
    <div class="chart-label">ETH</div>
    <div id="ethChart" style="width: 100%; height: 100%;"></div>
  </div>

  <script>
    const btcCandles = ${JSON.stringify(btcCandles)};
    const ethCandles = ${JSON.stringify(ethCandles)};
    const btcTriangles = ${JSON.stringify(btcTriangles)};
    const ethTriangles = ${JSON.stringify(ethTriangles)};
    const btcHoldMarkers = ${JSON.stringify(btcHoldMarkers)};
    const ethHoldMarkers = ${JSON.stringify(ethHoldMarkers)};

    // Snap timestamp to nearest candle
    function snapToCandle(timestamp, candles) {
      let closest = candles[0];
      let minDiff = Math.abs(timestamp - closest.time);
      for (const c of candles) {
        const diff = Math.abs(timestamp - c.time);
        if (diff < minDiff) {
          minDiff = diff;
          closest = c;
        }
      }
      return closest;
    }

    const chartOptions = {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#c9d1d9',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      localization: {
        locale: 'en-US',
      },
    };

    // BTC Chart
    const btcChart = LightweightCharts.createChart(document.getElementById('btcChart'), chartOptions);
    const btcSeries = btcChart.addCandlestickSeries({
      upColor: '#238636',
      downColor: '#da3633',
      borderVisible: false,
      wickUpColor: '#238636',
      wickDownColor: '#da3633',
    });
    btcSeries.setData(btcCandles);
    btcChart.timeScale().fitContent();

    // ETH Chart
    const ethChart = LightweightCharts.createChart(document.getElementById('ethChart'), chartOptions);
    const ethSeries = ethChart.addCandlestickSeries({
      upColor: '#238636',
      downColor: '#da3633',
      borderVisible: false,
      wickUpColor: '#238636',
      wickDownColor: '#da3633',
    });
    ethSeries.setData(ethCandles);
    ethChart.timeScale().fitContent();

    // Tooltip element
    const tooltip = document.getElementById('tooltip');

    // Create triangle overlays
    function createTriangleOverlays(chart, series, triangles, candles, containerSelector) {
      const chartDiv = document.querySelector(containerSelector);
      const container = chartDiv.parentElement; // Use .chart-container (has position:relative)
      const overlayContainer = document.createElement('div');
      overlayContainer.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:25px;overflow:hidden;z-index:5;pointer-events:none;';
      overlayContainer.className = 'triangle-overlay';
      container.appendChild(overlayContainer);

      function updateTriangles() {
        overlayContainer.innerHTML = '';
        
        for (const tri of triangles) {
          const snapped = snapToCandle(tri.time, candles);
          const x = chart.timeScale().timeToCoordinate(snapped.time);
          if (x === null) continue;
          
          const price = tri.isLong ? snapped.low : snapped.high;
          const y = series.priceToCoordinate(price);
          if (y === null) continue;

          // Create triangle element
          const el = document.createElement('div');
          el.style.cssText = \`
            position: absolute;
            left: \${x}px;
            top: \${y + (tri.isLong ? 8 : -24)}px;
            transform: translateX(-50%);
            text-align: center;
            cursor: pointer;
            pointer-events: auto;
          \`;
          el.dataset.reason = tri.reason;
          el.dataset.action = tri.isLong ? 'LONG' : 'SHORT';
          el.dataset.size = tri.size || '';
          
          // Hover events for tooltip
          el.addEventListener('mouseenter', (e) => {
            const action = e.target.closest('[data-reason]').dataset.action;
            const size = e.target.closest('[data-reason]').dataset.size;
            const reason = e.target.closest('[data-reason]').dataset.reason;
            tooltip.innerHTML = \`<strong>\${action}\${size ? ' ' + size + '%' : ''}</strong><br>\${reason}\`;
            tooltip.classList.add('visible');
          });
          el.addEventListener('mousemove', (e) => {
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
          });
          el.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
          });
          
          // Size label
          if (tri.size) {
            const label = document.createElement('div');
            label.style.cssText = \`
              font-size: 10px;
              color: #fff;
              margin-bottom: 2px;
            \`;
            label.textContent = tri.size + '%';
            if (tri.isLong) {
              el.appendChild(label);
            }
          }
          
          // Triangle shape (pure CSS triangle, no tail)
          const triangle = document.createElement('div');
          if (tri.isLong) {
            triangle.style.cssText = \`
              width: 0;
              height: 0;
              border-left: 8px solid transparent;
              border-right: 8px solid transparent;
              border-bottom: 12px solid #00C853;
              margin: 0 auto;
            \`;
          } else {
            triangle.style.cssText = \`
              width: 0;
              height: 0;
              border-left: 8px solid transparent;
              border-right: 8px solid transparent;
              border-top: 12px solid #FF1744;
              margin: 0 auto;
            \`;
          }
          el.appendChild(triangle);
          
          // Size label below for SHORT
          if (tri.size && !tri.isLong) {
            const label = document.createElement('div');
            label.style.cssText = \`
              font-size: 10px;
              color: #fff;
              margin-top: 2px;
            \`;
            label.textContent = tri.size + '%';
            el.appendChild(label);
          }
          
          overlayContainer.appendChild(el);
        }
      }

      updateTriangles();
      chart.timeScale().subscribeVisibleTimeRangeChange(updateTriangles);
      chart.subscribeCrosshairMove(updateTriangles);
      return updateTriangles;
    }

    const updateBtcTriangles = createTriangleOverlays(btcChart, btcSeries, btcTriangles, btcCandles, '#btcChart');
    const updateEthTriangles = createTriangleOverlays(ethChart, ethSeries, ethTriangles, ethCandles, '#ethChart');

    // Sync time scales
    btcChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) ethChart.timeScale().setVisibleLogicalRange(range);
    });
    ethChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) btcChart.timeScale().setVisibleLogicalRange(range);
    });

    // Toggle HOLD markers
    let showHold = false;
    function toggleHold() {
      showHold = document.getElementById('showHold').checked;
      if (showHold) {
        btcSeries.setMarkers(btcHoldMarkers);
        ethSeries.setMarkers(ethHoldMarkers);
      } else {
        btcSeries.setMarkers([]);
        ethSeries.setMarkers([]);
      }
    }
  </script>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  let agentId = 'my-trader';
  let days = 7;
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      agentId = args[i + 1];
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1]);
      i++;
    }
  }

  console.log(`📊 Loading decisions for ${agentId}...`);
  const decisions = await loadDecisions(agentId);
  console.log(`   Found ${decisions.length} decisions`);
  
  console.log(`📈 Fetching BTC candles (${days} days)...`);
  const btcCandles = await fetchCandles('BTC', days);
  console.log(`   Got ${btcCandles.length} candles`);
  
  console.log(`📈 Fetching ETH candles (${days} days)...`);
  const ethCandles = await fetchCandles('ETH', days);
  console.log(`   Got ${ethCandles.length} candles`);
  
  console.log(`🎨 Generating chart...`);
  const html = generateHTML(btcCandles, ethCandles, decisions);
  
  const outputPath = path.join(process.cwd(), 'decisions-chart.html');
  await fs.writeFile(outputPath, html);
  console.log(`✅ Saved to ${outputPath}`);
  
  // Open in browser
  const { spawn } = await import('child_process');
  if (process.platform === 'win32') {
    // Windows: use 'start' with cmd /c and empty title
    spawn('cmd', ['/c', 'start', '""', outputPath], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [outputPath], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [outputPath], { detached: true, stdio: 'ignore' }).unref();
  }
  console.log(`🌐 Opened in browser`);
}

main().catch(console.error);
