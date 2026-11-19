/**
 * Vývojový nástroj: změří výkon produkčního buildu s testovacím souborem 1 000 uzlů
 * v emulaci telefonu (Android, 4× zpomalený procesor). Používá nainstalovaný Chrome
 * přes puppeteer-core (jen devDependency). Nic z toho není součástí nasazení.
 *
 *   npm run build
 *   npx vite-node scripts/perf/generate.ts
 *   node scripts/perf/measure.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = join(ROOT, 'scripts', 'perf', 'out', 'perf-1000.mapa.txt');
const PASSWORD = 'perf-test-heslo-1000';
const PORT = 4179;
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));

if (!existsSync(FILE)) throw new Error('Chybí testovací soubor – spusťte nejdřív: npx vite-node scripts/perf/generate.ts');
if (!CHROME) throw new Error('Nenašel jsem Chrome ani Edge (nastavte CHROME_PATH).');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, value, unit, note = '') => {
  results.push({ name, value: typeof value === 'number' ? Math.round(value) : value, unit, note });
  console.log(`  ${name}: ${typeof value === 'number' ? Math.round(value) : value} ${unit} ${note}`);
};

// --- produkční build přes vite preview ---
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: process.platform === 'win32',
  stdio: 'ignore',
});
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    /* čekám */
  }
  await sleep(500);
}

const downloads = mkdtempSync(join(tmpdir(), 'mapa-perf-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
try {
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await page.emulate({
    viewport: { width: 393, height: 851, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  // Uložení přes stažení (sdílecí dialog systému v testu nejde ovládat).
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined });
    window.__frames = [];
    const tick = (t) => {
      window.__frames.push(t);
      if (window.__frames.length > 4000) window.__frames.splice(0, 2000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const frameStats = async (fn) => {
    const start = await page.evaluate(() => performance.now());
    await fn();
    return page.evaluate((s) => {
      const f = window.__frames.filter((t) => t >= s);
      const d = f.slice(1).map((t, i) => t - f[i]);
      const dur = (f[f.length - 1] - f[0]) / 1000;
      d.sort((a, b) => a - b);
      return { fps: (f.length - 1) / dur, p95: d[Math.floor(d.length * 0.95)] ?? 0, worst: d[d.length - 1] ?? 0 };
    }, start);
  };
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

  console.log(`Chrome: ${CHROME}\nEmulace: Android 393×851, CPU 4× zpomalené\n`);
  await page.goto(base, { waitUntil: 'networkidle0' });

  // --- první spuštění: zařízení + heslo ---
  await page.waitForSelector('input[type=password]');
  const inputs = await page.$$('input');
  await inputs[0].type('Výkonový test');
  const pw = await page.$$('input[type=password]');
  await pw[0].type(PASSWORD);
  await pw[1].type(PASSWORD);
  await page.click('input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.topbar', { timeout: 60000 });
  await sleep(500);
  const skip = await page.$$('xpath/.//button[contains(., "Přeskočit")]');
  if (skip[0]) await skip[0].click();
  await sleep(300);

  // --- otevření a dešifrování souboru ---
  await page.click('.topbar .tb-btn[aria-label="Další"]');
  await page.waitForSelector('.menu');
  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    (await page.$$('xpath/.//button[contains(@class,"menu-item")][contains(., "Otevřít soubor")]'))[0].click(),
  ]);
  const t0 = Date.now();
  await chooser.accept([FILE]);
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0 && !document.querySelector('.busy'), { timeout: 120000 });
  await settle();
  record('Načtení a dešifrování souboru (1 000 uzlů)', Date.now() - t0, 'ms', '(vč. odvození klíče PBKDF2 600 000×)');
  await sleep(1500);

  // --- posun a zoom ---
  const box = await page.$eval('.react-flow__pane', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const pan = await frameStats(async () => {
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    for (let i = 0; i < 60; i++) await page.mouse.move(box.x + Math.sin(i / 6) * 120, box.y + Math.cos(i / 6) * 160);
    await page.mouse.up();
  });
  record('Posun plochy', pan.fps, 'snímků/s', `(95 % snímků do ${Math.round(pan.p95)} ms, nejhorší ${Math.round(pan.worst)} ms)`);
  const zoom = await frameStats(async () => {
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel({ deltaY: i < 20 ? 60 : -60 });
      await sleep(16);
    }
  });
  record('Zoom kolečkem (přes všechny úrovně)', zoom.fps, 'snímků/s', `(95 % do ${Math.round(zoom.p95)} ms, nejhorší ${Math.round(zoom.worst)} ms)`);

  // --- přechod úrovní detailu ---
  const setZoom = (z) =>
    page.evaluate((zz) => {
      const s = document.querySelector('.zoom-ctrl input[type=range]');
      const v = Math.round(((Math.log(zz) - Math.log(0.1)) / (Math.log(2.5) - Math.log(0.1))) * 1000);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(s, String(v));
      s.dispatchEvent(new Event('input', { bubbles: true }));
    }, z);
  for (const [from, to, label] of [
    [0.8, 0.45, 'Vše → Projekty a úkoly'],
    [0.45, 0.2, 'Projekty a úkoly → Přehled'],
    [0.2, 0.8, 'Přehled → Vše'],
  ]) {
    await setZoom(from);
    await sleep(800);
    const s = Date.now();
    await setZoom(to);
    await settle();
    record(`Přechod úrovně detailu ${label}`, Date.now() - s, 'ms');
    await sleep(600);
  }

  // --- sbalení velké větve: vybrat projekt v rejstříku, mezerník ---
  await setZoom(0.8);
  await sleep(600);
  await page.click('.topbar .tb-btn[aria-label="Rejstřík"]');
  await page.waitForSelector('.tree-title.project');
  await sleep(1200); // dojet animaci vysunutí rejstříku (při 4× zpomalení trvá déle)
  // projekt s největší větví = první v rejstříku nemusí být; vezmi ten s nejvíce řádky pod sebou
  await page.click('.tree-title.project');
  await sleep(1200);
  const collapse = await page.evaluate(async () => {
    const btn = document.querySelector('.mm-node.project.selected .collapse-btn');
    if (!btn) return { ms: -1 };
    const s = performance.now();
    btn.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return { ms: performance.now() - s };
  });
  await sleep(400);
  // počet skrytých uzlů z rejstříku (ikonka sbalení) a z čísla „+N“ na uzlu
  const hiddenNow = await page.evaluate(() => document.querySelector('.collapse-btn.collapsed')?.textContent ?? null);
  record('Sbalení velké větve (projekt)', collapse.ms, 'ms', hiddenNow ? `(skryto ${hiddenNow} uzlů)` : '(větev se nesbalila – měření neplatné)');
  await page.keyboard.press('Escape');
  await sleep(300);

  // --- vyhledávání: měří se od posledního znaku (bez doby psaní) ---
  await page.click('.topbar .tb-btn[aria-label="Hledat"]');
  await page.waitForSelector('.search.mobile .search-input');
  await page.type('.search.mobile .search-input', 'overit cen');
  await page.waitForSelector('.search-row', { timeout: 10000 });
  await sleep(500);
  const s1 = Date.now();
  await page.type('.search.mobile .search-input', 'u');
  await page.waitForFunction(() => !!document.querySelector('.search-results') && ![...document.querySelectorAll('.search-empty')].some((e) => e.textContent === 'Hledám…'), { timeout: 10000 });
  const nRes = await page.$$eval('.search-row', (r) => r.length);
  record('Vyhledávání „overit cenu“ (od posledního znaku k výsledkům)', Date.now() - s1, 'ms', `(${nRes} výsledků, vč. čekání 150 ms po dopsání)`);
  await page.click('.search.mobile .tb-btn'); // zavřít hledání
  await sleep(300);

  // --- filtr ---
  await page.click('.topbar .tb-btn[aria-label="Další"]');
  await page.waitForSelector('.menu');
  await (await page.$$('xpath/.//button[contains(@class,"menu-item")][contains(., "Filtr")]'))[0].click();
  await page.waitForSelector('.filter-dialog');
  const s2 = Date.now();
  await (await page.$$('xpath/.//button[contains(@class,"toggle-chip")][contains(., "Po termínu")]'))[0].click();
  await page.waitForSelector('.filter-bar');
  await settle();
  record('Filtr „Po termínu“ (mapa + rejstřík)', Date.now() - s2, 'ms');
  await page.keyboard.press('Escape');
  await sleep(300);

  // --- uložení do souboru ---
  const before = readdirSync(downloads).length;
  const s3 = Date.now();
  await page.click('.topbar .tb-btn.save');
  for (let i = 0; i < 600 && readdirSync(downloads).filter((f) => !f.endsWith('.crdownload')).length <= before; i++) await sleep(50);
  const saved = readdirSync(downloads).find((f) => !f.endsWith('.crdownload'));
  record('Uložení do souboru (šifrování + stažení)', Date.now() - s3, 'ms', saved ? `(${Math.round(statSync(join(downloads, saved)).size / 1024)} kB)` : '(soubor se nestáhl)');
} finally {
  await browser.close();
  server.kill();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true });
}

console.log('\nJSON:', JSON.stringify(results));
