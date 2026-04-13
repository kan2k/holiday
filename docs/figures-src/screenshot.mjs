import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = `file:///${path.resolve(__dirname, 'index.html').replace(/\\/g, '/')}`;
const outDir = path.resolve(__dirname, '..', 'figures');

const figures = [
  { id: 'fig1', file: 'fig1-architecture.png' },
  { id: 'fig2', file: 'fig2-two-stage.png' },
  { id: 'fig3', file: 'fig3-ralph-loop.png' },
  { id: 'fig4', file: 'fig4-tech-stack.png' },
  { id: 'fig5', file: 'fig5-market-universe.png' },
  { id: 'fig6', file: 'fig6-dashboard.png' },
  { id: 'fig7', file: 'fig7-create-agent.png' },
  { id: 'fig8', file: 'fig8-dashboard-live.png' },
];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 });
await page.goto(htmlPath, { waitUntil: 'networkidle0' });

for (const { id, file } of figures) {
  const el = await page.$(`#${id}`);
  if (!el) { console.error(`Element #${id} not found`); continue; }
  await el.screenshot({ path: path.join(outDir, file), type: 'png' });
  console.log(`Saved ${file}`);
}

await browser.close();
console.log('Done.');
