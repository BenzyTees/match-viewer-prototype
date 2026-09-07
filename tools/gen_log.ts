/* Deterministic synthetic match log.
   A small possession state machine: passes, carries, crosses, shots, turnovers,
   set pieces, fouls with cards, halftime with a change of ends. One position per
   event, nothing per tick — the same shape a real event feed gives you. */
import type { MatchEvent, MatchLog, TeamId, Outcome } from '../src/types.ts';
import { FORMATIONS, anchorFor, attackDir, clamp } from '../src/formations.ts';

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.argv[2] ?? 16);
const rnd = mulberry32(SEED);
const r = (a: number, b: number): number => a + rnd() * (b - a);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;

const W = 105, H = 68, DUR = 5400, HALF = 2700;
const meta = {
  home: { name: 'Riverside Rovers', short: 'RIV', formation: '4-3-3',
          kit: { shirt: '#e63946', shorts: '#ffffff', trim: '#ffffff', gk: '#2ec4b6' } },
  away: { name: 'Northgate City', short: 'NOR', formation: '4-4-2',
          kit: { shirt: '#1d4ed8', shorts: '#0b1c4a', trim: '#facc15', gk: '#f59e0b' } },
  durationSec: DUR, halftimeSec: HALF,
};
const other = (t: TeamId): TeamId => (t === 'home' ? 'away' : 'home');
const formationOf = (t: TeamId) => FORMATIONS[meta[t].formation]!;

const events: MatchEvent[] = [];
let t = 0;
let period: 1 | 2 = 1;
const score = { home: 0, away: 0 };
let lastPos = new Map<string, { x: number; y: number; t: number }>();

function push(e: Omit<MatchEvent, 't'> & { t?: number }): MatchEvent {
  const ev: MatchEvent = { t: +t.toFixed(1), ...e, x: +clamp(e.x, 0, W).toFixed(1), y: +clamp(e.y, 0, H).toFixed(1) };
  if (ev.period === undefined) ev.period = period;
  events.push(ev);
  if (ev.player > 0) lastPos.set(ev.team + ev.player, { x: ev.x, y: ev.y, t });
  return ev;
}

/** Plausible current position of a player: formation anchor pulled toward
 *  where we last saw them if that was recent. */
function posOf(team: TeamId, num: number, bx: number, by: number): [number, number] {
  const [ax, ay] = anchorFor(formationOf(team), num - 1, team, period, bx, by, W, H);
  const lp = lastPos.get(team + num);
  if (lp && t - lp.t < 25) {
    const w = 1 - (t - lp.t) / 25;
    return [ax + (lp.x - ax) * w, ay + (lp.y - ay) * w];
  }
  return [ax, ay];
}

/** the nearest of `cands` (by plausible current position) to a point, with a
 *  little randomness so it is not always the same shirt */
function nearest(team: TeamId, x: number, y: number, cands: readonly number[], bx = x, by = y): number {
  const scored = cands.map(num => { const [px, py] = posOf(team, num, bx, by); return { num, d: Math.hypot(px - x, py - y) + rnd() * 6 }; });
  scored.sort((a, b) => a.d - b.d);
  return scored[0]!.num;
}

function goalX(team: TeamId): number { return attackDir(team, period) === 1 ? W : 0; }
function distToGoal(team: TeamId, x: number, y: number): number {
  return Math.hypot(goalX(team) - x, H / 2 - y);
}
/** how far up the pitch, 0 = own goal line, 1 = opponent goal line */
function progress(team: TeamId, x: number): number {
  return attackDir(team, period) === 1 ? x / W : 1 - x / W;
}

/** choose a teammate to pass to, biased forward and to a sensible distance */
function chooseReceiver(team: TeamId, from: number, bx: number, by: number, long: boolean): { num: number; x: number; y: number } {
  const dir = attackDir(team, period);
  let best: { num: number; x: number; y: number; s: number } | null = null;
  for (let num = 2; num <= 11; num++) {
    if (num === from) continue;
    const [px, py] = posOf(team, num, bx, by);
    // receivers move into space: a few metres forward and toward the ball's lane
    const rx = px + dir * r(2, 9), ry = py + (by - py) * 0.15 + r(-4, 4);
    const d = Math.hypot(rx - bx, ry - by);
    const ideal = long ? 38 : 16;
    const s = -Math.abs(d - ideal) / ideal + (rx - bx) * dir * 0.02 + rnd() * 0.6;
    if (!best || s > best.s) best = { num, x: rx, y: ry, s };
  }
  return best!;
}

function kickoff(team: TeamId): { team: TeamId; num: number; x: number; y: number } {
  push({ type: 'kickoff', team, player: 10, x: W / 2, y: H / 2, score: { ...score } });
  t += r(1.2, 2.2);
  const dir = attackDir(team, period);
  push({ type: 'pass', team, player: 10, x: W / 2, y: H / 2, to: 7, outcome: 'complete' });
  t += r(1.5, 2.5);
  return { team, num: 7, x: W / 2 - dir * r(4, 9), y: H / 2 + r(-8, 8) };
}

/** ball leaves play; returns the restart holder */
function ballOut(team: TeamId, x: number, y: number, why: 'throw' | 'goalline'): { team: TeamId; num: number; x: number; y: number } {
  push({ type: 'out', team, player: 0, x, y });
  const opp = other(team);
  if (why === 'throw') {
    const ty = y < H / 2 ? 0 : H;
    t += r(8, 16);
    const [tx] = [clamp(x + r(-3, 3), 1, W - 1)];
    const thrower = nearest(opp, tx, ty, [2, 3, 4, 5, 6, 7, 8, 9]);
    const rcv = chooseReceiver(opp, thrower, tx, ty, false);
    push({ type: 'throwin', team: opp, player: thrower, x: tx, y: ty, to: rcv.num, outcome: 'complete' });
    t += r(1.4, 2.4);
    return { team: opp, num: rcv.num, x: clamp(rcv.x, 2, W - 2), y: clamp(rcv.y, 2, H - 2) };
  }
  // goal line: decide corner or goal kick by who touched last
  const defendingTeam = goalX(team) === (x > W / 2 ? W : 0) ? opp : team;
  const gx = x > W / 2 ? W : 0;
  if (defendingTeam === opp) {
    // attacking side put it out: goal kick for defenders
    t += r(14, 24);
    const gkx = gx === W ? W - 5.5 : 5.5;
    const rcv = chooseReceiver(opp, 1, gkx, H / 2, true);
    push({ type: 'goalkick', team: opp, player: 1, x: gkx, y: H / 2 + r(-4, 4), to: rcv.num, outcome: 'complete' });
    t += r(2.2, 3.4);
    return { team: opp, num: rcv.num, x: rcv.x, y: rcv.y };
  }
  // defenders put it out: corner for attackers
  t += r(16, 28);
  const cy = y < H / 2 ? 0.5 : H - 0.5;
  const cx = gx === W ? W - 0.5 : 0.5;
  const taker = nearest(team, cx, cy, [6, 7, 8, 9, 11]);
  const target = pick([9, 10, 3, 4, 2].filter(n => n !== taker));
  push({ type: 'corner', team, player: taker, x: cx, y: cy, to: target, outcome: 'complete' });
  t += r(2.0, 2.8);
  const bx = gx === W ? W - r(4, 11) : r(4, 11);
  const by = H / 2 + r(-9, 9);
  return { team, num: target, x: bx, y: by };
}

type Holder = { team: TeamId; num: number; x: number; y: number };

function shoot(h: Holder): Holder {
  const d = distToGoal(h.team, h.x, h.y);
  const opp = other(h.team);
  const gx = goalX(h.team);
  const pGoal = clamp(0.30 * Math.exp(-d / 11), 0.02, 0.28);
  const roll = rnd();
  let outcome: Outcome;
  if (roll < pGoal) outcome = 'goal';
  else if (roll < pGoal + 0.42) outcome = 'saved';
  else if (roll < pGoal + 0.42 + 0.30) outcome = 'wide';
  else outcome = 'blocked';
  push({ type: 'shot', team: h.team, player: h.num, x: h.x, y: h.y, outcome });
  const flight = clamp(d / 24, 0.4, 1.6);
  if (outcome === 'goal') {
    t += flight;
    score[h.team]++;
    push({ type: 'goal', team: h.team, player: h.num, x: gx, y: H / 2 + r(-3, 3), score: { ...score } });
    t += r(38, 62);
    return kickoff(opp);
  }
  if (outcome === 'saved') {
    t += flight;
    const sx = gx === W ? W - 1.5 : 1.5;
    push({ type: 'save', team: opp, player: 1, x: sx, y: H / 2 + r(-3.4, 3.4) });
    t += r(4, 9);
    const rcv = chooseReceiver(opp, 1, sx, H / 2, rnd() < 0.5);
    push({ type: 'pass', team: opp, player: 1, x: sx + (gx === W ? -r(1, 4) : r(1, 4)), y: H / 2 + r(-5, 5), to: rcv.num, outcome: 'complete' });
    t += r(1.8, 3.0);
    return { team: opp, num: rcv.num, x: rcv.x, y: rcv.y };
  }
  if (outcome === 'wide') {
    t += flight * 1.15;
    const oy = rnd() < 0.5 ? H / 2 - r(4.5, 12) : H / 2 + r(4.5, 12);
    return ballOut(h.team, gx, oy, 'goalline');
  }
  // blocked by a defender
  t += r(0.3, 0.7);
  const bx = h.x + (gx - h.x) * 0.3, by = h.y + r(-2, 2);
  const blocker = nearest(opp, bx, by, [2, 3, 4, 5, 6, 7, 8]);
  push({ type: 'clearance', team: opp, player: blocker, x: bx, y: by, outcome: rnd() < 0.45 ? 'out' : 'complete' });
  if (events[events.length - 1]!.outcome === 'out') {
    t += r(0.8, 1.5);
    return ballOut(opp, gx === W ? W : 0, rnd() < 0.5 ? r(1, 9) : H - r(1, 9), 'goalline');
  }
  t += r(1.8, 3.2);
  // loose ball picked up by whoever
  const winner: TeamId = rnd() < 0.55 ? h.team : opp;
  const lx = bx + (h.x - gx) * 0.35 + r(-6, 6), ly = by + r(-8, 8);
  const num = nearest(winner, lx, ly, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  return { team: winner, num, x: lx, y: ly };
}

function foul(h: Holder, by: TeamId): Holder {
  const fouler = nearest(by, h.x, h.y, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const card = rnd() < 0.19 ? (rnd() < 0.9 ? 'yellow' : 'red') : undefined;
  const e: Omit<MatchEvent, 't'> = { type: 'foul', team: by, player: fouler, x: h.x + r(-1, 1), y: h.y + r(-1, 1) };
  if (card) e.card = card;
  push(e);
  t += card ? r(22, 40) : r(10, 18);
  const taker = pick([6, 7, 8, 10]);
  const d = distToGoal(h.team, h.x, h.y);
  if (d < 30 && rnd() < 0.5) {
    // direct free kick at goal
    push({ type: 'freekick', team: h.team, player: taker, x: h.x, y: h.y });
    t += r(0.4, 0.9);
    return shoot({ team: h.team, num: taker, x: h.x, y: h.y });
  }
  const rcv = chooseReceiver(h.team, taker, h.x, h.y, d > 45 && rnd() < 0.5);
  push({ type: 'freekick', team: h.team, player: taker, x: h.x, y: h.y, to: rcv.num, outcome: 'complete' });
  t += r(1.8, 3.0);
  return { team: h.team, num: rcv.num, x: rcv.x, y: rcv.y };
}

/** one touch of play from the current holder; returns the next holder */
function step(h: Holder): Holder {
  const opp = other(h.team);
  const dir = attackDir(h.team, period);
  const prog = progress(h.team, h.x);
  const d = distToGoal(h.team, h.x, h.y);
  const wide = h.y < 14 || h.y > H - 14;
  const inBox = d < 20 && Math.abs(h.y - H / 2) < 16;

  // pressure grows near the opponent goal
  let action: 'pass' | 'carry' | 'cross' | 'shot' | 'long';
  const u = rnd();
  if (inBox && u < 0.34) action = 'shot';
  else if (d < 30 && !wide && u < 0.10) action = 'shot';
  else if (prog > 0.62 && wide && u < 0.55) action = 'cross';
  else if (u < 0.55) action = 'pass';
  else if (u < 0.86) action = 'carry';
  else action = 'long';

  if (action === 'shot') return shoot(h);

  if (action === 'cross') {
    const gx = goalX(h.team);
    const tx = gx === W ? W - r(5, 12) : r(5, 12), ty = H / 2 + r(-8, 8);
    const target = nearest(h.team, tx, ty, [9, 10, 11, 7, 8, 6].filter(n => n !== h.num), h.x, h.y);
    const won = rnd() < 0.45;
    push({ type: 'cross', team: h.team, player: h.num, x: h.x, y: h.y, to: target, outcome: won ? 'complete' : 'intercepted' });
    t += r(1.6, 2.4);
    if (won) return { team: h.team, num: target, x: tx, y: ty };
    const cx2 = tx + r(-2, 2), cy2 = ty + r(-3, 3);
    const def = nearest(opp, cx2, cy2, [1, 2, 3, 4, 5, 6]);
    const out = rnd() < 0.3;
    push({ type: 'clearance', team: opp, player: def, x: cx2, y: cy2, outcome: out ? 'out' : 'complete' });
    t += r(0.8, 1.6);
    if (out) return ballOut(opp, gx, rnd() < 0.5 ? r(1, 8) : H - r(1, 8), 'goalline');
    const lx = tx - dir * r(14, 26), ly = H / 2 + r(-15, 15);
    const winner: TeamId = rnd() < 0.5 ? h.team : opp;
    const num = nearest(winner, lx, ly, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    return { team: winner, num, x: lx, y: ly };
  }

  if (action === 'carry') {
    const run = r(5, 14);
    const nx = clamp(h.x + dir * run * r(0.5, 1) + r(-2, 2), 1, W - 1);
    const ny = clamp(h.y + r(-7, 7), 1, H - 1);
    push({ type: 'carry', team: h.team, player: h.num, x: h.x, y: h.y });
    const dt = run / r(4.0, 6.0) + r(0.3, 1.0);
    t += dt;
    const risk = 0.12 + prog * 0.14;
    const v = rnd();
    if (v < risk * 0.35) return foul({ team: h.team, num: h.num, x: nx, y: ny }, opp);
    if (v < risk) {
      const tackler = nearest(opp, nx, ny, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      push({ type: 'tackle', team: opp, player: tackler, x: nx, y: ny });
      t += r(1.2, 2.4);
      const nearLine = Math.min(ny, H - ny) < 9;
      if (nearLine && rnd() < 0.5) return ballOut(opp, nx + r(-2, 2), ny < H / 2 ? 0 : H, 'throw');
      return { team: opp, num: tackler, x: nx - dir * r(1, 4), y: ny + r(-3, 3) };
    }
    return { team: h.team, num: h.num, x: nx, y: ny };
  }

  // pass or long ball
  const long = action === 'long';
  const rcv = chooseReceiver(h.team, h.num, h.x, h.y, long);
  const dist = Math.hypot(rcv.x - h.x, rcv.y - h.y);
  const pSuccess = long ? 0.62 : clamp(0.92 - prog * 0.14 - dist * 0.004, 0.6, 0.93);
  const v = rnd();
  if (v < pSuccess) {
    push({ type: 'pass', team: h.team, player: h.num, x: h.x, y: h.y, to: rcv.num, outcome: 'complete' });
    t += clamp(dist / (long ? 17 : 13), 1.0, 3.2) + r(0.6, 2.2);
    return { team: h.team, num: rcv.num, x: clamp(rcv.x, 1, W - 1), y: clamp(rcv.y, 1, H - 1) };
  }
  if (v < pSuccess + 0.5 * (1 - pSuccess) || long) {
    // intercepted
    push({ type: 'pass', team: h.team, player: h.num, x: h.x, y: h.y, to: rcv.num, outcome: 'intercepted' });
    t += clamp(dist / 14, 0.9, 2.6);
    const ix = h.x + (rcv.x - h.x) * r(0.55, 0.9), iy = h.y + (rcv.y - h.y) * r(0.55, 0.9) + r(-3, 3);
    const num = nearest(opp, ix, iy, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    push({ type: 'interception', team: opp, player: num, x: ix, y: iy });
    t += r(1.0, 2.2);
    return { team: opp, num, x: clamp(ix, 1, W - 1), y: clamp(iy, 1, H - 1) };
  }
  // overhit, out of play
  push({ type: 'pass', team: h.team, player: h.num, x: h.x, y: h.y, to: rcv.num, outcome: 'out' });
  const oy = rcv.y < H / 2 ? 0 : H;
  const ox = clamp(rcv.x + dir * r(2, 8), 1, W - 1);
  t += clamp(Math.hypot(ox - h.x, oy - h.y) / 14, 1.0, 3.5);
  return ballOut(h.team, ox, oy, 'throw');
}

// ---------------------------------------------------------------- run it
let holder = kickoff('home');
let halfDone = false;
while (t < DUR) {
  if (!halfDone && t >= HALF) {
    halfDone = true;
    t = HALF;
    push({ type: 'halftime', team: 'home', player: 0, x: W / 2, y: H / 2, score: { ...score } });
    period = 2;
    lastPos = new Map();
    t = HALF + 3;
    holder = kickoff('away');
    continue;
  }
  holder = step(holder);
  if (holder.team && holder.x !== undefined) {
    holder.x = clamp(holder.x, 1, W - 1); holder.y = clamp(holder.y, 1, H - 1);
  }
}
// a sequence can overrun the whistle; the whistle wins
const kept = events.filter(e => (e.period === 1 ? e.t <= HALF : true) && e.t < DUR);
kept.sort((a, b) => a.t - b.t);
t = DUR;
kept.push({ t: DUR, type: 'fulltime', team: 'home', player: 0, x: W / 2, y: H / 2, score: { ...score }, period: 2 });
events.length = 0; events.push(...kept);

const log: MatchLog = { meta, pitch: { w: W, h: H }, events };
process.stdout.write(JSON.stringify(log));

const counts: Record<string, number> = {};
for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
process.stderr.write(`events=${events.length} score=${score.home}-${score.away} cards=${events.filter(e => e.card).length} ` +
  JSON.stringify(counts) + '\n');
