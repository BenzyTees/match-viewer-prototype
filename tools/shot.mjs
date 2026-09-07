// Usage: node tools/shot.mjs <T seconds> [speed] [settleFrames] [out.png]
// Renders one frame of the built demo at match time T, offline and deterministic.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = Number(process.argv[2] ?? 60), speed = Number(process.argv[3] ?? 30), settle = Number(process.argv[4] ?? 30);
const out = process.argv[5] ?? `/tmp/shot_${T}.png`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1312, height: 900 }, deviceScaleFactor: 1 });
pg.on('pageerror', e => console.log('pageerror:', e.message));
pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
await pg.goto('file://' + join(root, 'dist/match_viewer_demo.html') + '?capture=1');
await pg.waitForFunction(() => window.__ready, null, { timeout: 20000 });
await pg.evaluate(([t, s, n]) => { window.__setSpeed(s); window.__seek(t); window.__settle(n); }, [T, speed, settle]);
await pg.screenshot({ path: out });
console.log(out, JSON.stringify(await pg.evaluate(() => window.__state())));
await b.close();
