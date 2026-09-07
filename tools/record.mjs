// Offline, deterministic capture: fixed timestep frames -> ffmpeg -> mp4.
// Usage: node tools/record.mjs <startT> <speed> <seconds> <out.mp4> [fps]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = Number(process.argv[2] ?? 840), SPEED = Number(process.argv[3] ?? 30), SECS = Number(process.argv[4] ?? 20);
const OUT = process.argv[5] ?? join(root, 'dist/match_viewer_demo.mp4'), FPS = Number(process.argv[6] ?? 30);
// optional speed changes during the take: JSON like [[23,120],[40,30]] = at wall second 23 switch to 120x
const SCHEDULE = JSON.parse(process.argv[7] ?? '[]');
const dir = join(root, 'frames'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const cdp = await pg.context().newCDPSession(pg);
pg.on('pageerror', e => console.log('pageerror:', e.message));
await pg.goto('file://' + join(root, 'dist/match_viewer_demo.html') + '?capture=1');
await pg.waitForFunction(() => window.__ready, null, { timeout: 20000 });
await pg.evaluate(([t, s]) => { window.__setSpeed(s); window.__seek(t); window.__setPlaying(true); window.__settle(20); }, [START, SPEED]);
const N = FPS * SECS;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  for (const [w, sp] of SCHEDULE) if (i === Math.round(w * FPS)) await pg.evaluate(v => window.__setSpeed(v), sp);
  await pg.evaluate(d => window.__step(d), 1 / FPS);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.png`, Buffer.from(shot.data, 'base64'));
  if (i % 100 === 0) console.log(`frame ${i}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('final', JSON.stringify(await pg.evaluate(() => window.__state())));
await b.close();
execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${dir}/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 19 -movflags +faststart ${OUT}`);
console.log('wrote', OUT);
