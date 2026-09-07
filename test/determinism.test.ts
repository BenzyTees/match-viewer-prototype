/* Sanity + determinism checks, run with `npm test` (Node 22+, no deps).
   1. stateAt is pure: sampling T in a random order gives byte-identical states
      to sampling in playback order.
   2. Player speeds stay physical (no teleports between keyframes).
   3. The ball never leaves the pitch by more than a touchline's width. */
import { readFileSync } from 'node:fs';
import { buildIndex, stateAt, rateAt } from '../src/engine.ts';
import type { MatchLog } from '../src/types.ts';

const log = JSON.parse(readFileSync(new URL('../data/match_log.json', import.meta.url), 'utf8')) as MatchLog;
const ix = buildIndex(log);

const samples: number[] = [];
for (let T = 0; T <= ix.duration; T += 0.37) samples.push(+T.toFixed(2));
const seq = samples.map(T => JSON.stringify(stateAt(ix, T)));
const shuffled = samples.map((T, i) => [T, i] as const).sort((a, b) => Math.sin(a[0] * 7.3) - Math.sin(b[0] * 7.3));
let mismatches = 0;
for (const [T, i] of shuffled) if (JSON.stringify(stateAt(ix, T)) !== seq[i]) mismatches++;
console.log(`purity: ${samples.length} samples, ${mismatches} mismatches`);

let maxSpeed = 0, maxBallOut = 0, nan = 0, fast = 0, total = 0;
for (const T of samples) {
  const s = stateAt(ix, T);
  for (const p of s.players) {
    if (Number.isNaN(p.x + p.y + p.vx + p.vy)) nan++;
    if (s.transition > 0 || p.off) continue;
    total++;
    if (p.speed > maxSpeed) maxSpeed = p.speed;
    if (p.speed > 9) fast++;
  }
  const over = Math.max(-s.ball.x, s.ball.x - ix.W, -s.ball.y, s.ball.y - ix.H, 0);
  if (over > maxBallOut) maxBallOut = over;
  if (Number.isNaN(rateAt(ix, T, 30))) nan++;
}
console.log(`max player speed ${maxSpeed.toFixed(1)} m/s (${(100 * fast / total).toFixed(3)}% of samples over 9 m/s), ball out of bounds by at most ${maxBallOut.toFixed(2)} m, NaN ${nan}`);

const ok = mismatches === 0 && nan === 0 && fast / total < 0.002 && maxBallOut < 1.5;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
