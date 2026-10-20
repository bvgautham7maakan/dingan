// Headless check of ui.html (typewriter, [hidden], stop->flushed, pause when hidden).
// Run: NODE_PATH=$(npm root -g) node tests/ui_test.mjs [screenshot.png]
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, '..', 'ui.html');
const results = [];
const check = (name, ok) => { results.push([name, ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 320 } });
await page.addInitScript(() => {
  window.__calls = [];
  window.pywebview = { api: new Proxy({}, { get: (_, k) => (...a) => window.__calls.push([k, ...a]) }) };
});
await page.goto(url);
await page.evaluate(() => TA.init({ typing_ms_per_char: 45 }));
await page.waitForTimeout(1500);
const demo = await page.evaluate(() => TA._state());
check('demo snippet loops when nothing written yet', demo.demoActive && demo.text.includes('def'));

await page.evaluate(() => {
  TA.onPrompt({ session: 's1' });
  TA.onTool({ tool: 'Write', target: 'src/app.py', file: 'src/app.py', code: 'def add(a, b):\n    return a + 0x2A\n' });
});
await page.waitForTimeout(400);
const partial = await page.evaluate(() => TA._state());
check('Write is typed character by character', partial.pending > 0 && partial.text.includes('// ── src/app.py'));
await page.waitForTimeout(2200);
const full = await page.evaluate(() => TA._state());
check('Write content fully typed', full.text.includes('return a + 0x2A') && full.pending === 0);
check('header status shows tool + file', (await page.textContent('#status')) === 'Write · src/app.py');
check('syntax colours applied', (await page.$$eval('.kw', (e) => e.map((x) => x.textContent))).includes('def')
  && (await page.$$eval('.num', (e) => e.map((x) => x.textContent))).includes('0x2A'));
await page.screenshot({ path: process.argv[2] || path.join(here, 'ui.png') });

await page.evaluate(() => TA.onTool({ tool: 'Write', target: '.env', file: '.env', code: '[hidden]' }));
await page.waitForTimeout(800);
check('.env write shows [hidden]', (await page.evaluate(() => TA._state())).text.includes('[hidden]'));

await page.evaluate(() => TA.onTool({ tool: 'Write', file: 'x.html', code: '<img src=x onerror="window.__xss=1">' }));
await page.waitForTimeout(100);
await page.evaluate(() => TA.onStop({ maxMs: 3000, gen: 7 }));
await page.waitForTimeout(3300);
const calls = await page.evaluate(() => window.__calls);
check('Stop: typewriter finishes then calls flushed(gen) within 3 s', calls.some((c) => c[0] === 'flushed' && c[1] === 7));
check('hook text rendered as text, never HTML', (await page.evaluate(() => window.__xss)) === undefined
  && (await page.$$('#lines img')).length === 0);

await page.evaluate(() => {
  const big = Array.from({ length: 400 }, (_, i) => `line_${i} = ${i}`).join('\n');
  TA.onPrompt({}); TA.onTool({ tool: 'Write', file: 'big.py', code: big });
});
const backlog = await page.evaluate(() => TA._state().pending);
check('backlog > ~1500 chars skips ahead', backlog <= 3200);

await page.evaluate(() => TA.setVisible(false));
await page.waitForTimeout(300);
const st = await page.evaluate(() => TA._state());
check('rendering paused while hidden', !st.looping && !st.typing);

await browser.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
