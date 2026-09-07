/* Wires the pure engine to the renderer and the controls. This is the only
   place with mutable playback state: the clock T, the speed, the camera. */
import { buildIndex, stateAt, rateAt, cameraAt, fmtClock, type Camera, type MatchIndex } from './engine.ts';
import type { MatchLog } from './types.ts';
import { Renderer } from './render/renderer.ts';

declare global {
  interface Window {
    MATCH_LOG: MatchLog;
    __seek: (T: number) => void;
    __setPlaying: (v: boolean) => void;
    __setSpeed: (v: number) => void;
    __step: (dt: number) => void;
    __settle: (n: number) => void;
    __state: () => { T: number; speed: number; playing: boolean };
    __ready: boolean;
  }
}

const SPEEDS = [1, 4, 10, 30, 60, 120];

async function main(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  let ix: MatchIndex = buildIndex(window.MATCH_LOG);
  const R = await Renderer.create(canvas, ix);

  let T = 0, speed = 30, playing = true;
  let cam: Camera | null = null;
  let last = performance.now();

  const $ = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;
  const btnPlay = $('play') as HTMLButtonElement;
  const spd = $('speeds');
  const status = $('status');
  const info = $('info');

  for (const v of SPEEDS) {
    const b = document.createElement('button');
    b.textContent = `${v}×`; b.dataset['v'] = String(v);
    b.onclick = () => setSpeed(v);
    spd.appendChild(b);
  }
  function setSpeed(v: number): void {
    speed = v;
    for (const b of spd.querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset['v']) === v);
  }
  function setPlaying(v: boolean): void {
    playing = v;
    btnPlay.textContent = v ? 'Pause' : 'Play';
  }
  function seek(t: number): void {
    T = Math.max(0, Math.min(ix.duration, t));
    cam = null;                    // camera re-acquires instantly on a seek
    drawFrame(0);
  }
  function loadLog(log: MatchLog): void {
    ix = buildIndex(log);
    R.setIndex(ix);
    info.textContent = `${log.meta.home.name} v ${log.meta.away.name} · ${log.events.length} events`;
    seek(0);
  }

  btnPlay.onclick = () => setPlaying(!playing);
  R.hud.onSeek = t => seek(t);
  $('reset').onclick = () => loadLog(window.MATCH_LOG);
  ($('file') as HTMLInputElement).onchange = async ev => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) loadLog(JSON.parse(await f.text()) as MatchLog);
  };
  document.body.addEventListener('dragover', e => { e.preventDefault(); });
  document.body.addEventListener('drop', async e => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) loadLog(JSON.parse(await f.text()) as MatchLog);
  });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.code === 'ArrowRight') seek(T + (e.shiftKey ? 300 : 30));
    else if (e.code === 'ArrowLeft') seek(T - (e.shiftKey ? 300 : 30));
    else if (e.key >= '1' && e.key <= '6') setSpeed(SPEEDS[Number(e.key) - 1]!);
  });

  let fpsAcc = 0, fpsN = 0, fps = 0;
  function drawFrame(dt: number): void {
    const rate = rateAt(ix, T, speed);
    const s = stateAt(ix, T);
    cam = cameraAt(ix, s, cam, dt * Math.max(1, Math.min(speed, 8) / 2));
    R.draw(s, cam, dt, { speed, rate, playing });
    status.textContent = `${fmtClock(T)} · ${fps} fps`;
  }
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (playing) T = Math.min(ix.duration, T + dt * speed * rateAt(ix, T, speed));
    drawFrame(dt);
    requestAnimationFrame(frame);
  }

  // hooks for offline, fixed-timestep capture (tools/record.mjs)
  window.__seek = seek;
  window.__setPlaying = setPlaying;
  window.__setSpeed = setSpeed;
  window.__step = dt => { T = Math.min(ix.duration, T + dt * speed * rateAt(ix, T, speed)); drawFrame(dt); };
  window.__settle = n => { for (let i = 0; i < n; i++) drawFrame(1 / 30); };
  window.__state = () => ({ T, speed, playing });
  (window as unknown as { __R: Renderer }).__R = R;

  setSpeed(speed); setPlaying(true);
  info.textContent = `${ix.log.meta.home.name} v ${ix.log.meta.away.name} · ${ix.events.length} events`;
  if (new URLSearchParams(location.search).get('capture')) { document.body.classList.add('capture'); setPlaying(false); window.__ready = true; drawFrame(0); return; }
  window.__ready = true;
  requestAnimationFrame(t => { last = t; frame(t); });
}
main().catch(err => { console.error(err); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88">${String(err)}</pre>`); });
