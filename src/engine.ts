/* Match viewer engine.
   Everything here is a PURE function of (log, T): no accumulated state, so
   seeking is exact, the same log always gives the same replay, and a frame
   can be rendered in isolation for testing or offline capture. */
import type { MatchEvent, MatchLog, TeamId, EventType } from './types.ts';
import { FORMATIONS, anchorFor, attackDir, clamp, lerp, type Anchor } from './formations.ts';

export interface Keyframe { t: number; x: number; y: number; e: MatchEvent }

export interface MatchIndex {
  log: MatchLog;
  W: number; H: number;
  events: MatchEvent[];
  /** per player keyframes, key = team + shirt */
  kf: Map<string, Keyframe[]>;
  /** moments that get a slowdown + overlay */
  key: MatchEvent[];
  formation: Record<TeamId, readonly Anchor[]>;
  halftime: number;
  duration: number;
}

export interface PlayerState {
  team: TeamId; num: number; gk: boolean;
  x: number; y: number;
  vx: number; vy: number; speed: number;
  /** +1 faces +x, -1 faces -x */
  facing: 1 | -1;
  hasBall: boolean; involved: boolean;
  card: 'yellow' | 'red' | null;
  /** true once sent off */
  off: boolean;
}

export interface BallState {
  x: number; y: number;
  /** height above the ground in metres */
  h: number;
  vx: number; vy: number;
  /** rolling angle in radians, for the panel pattern */
  spin: number;
  /** a few recent ground positions, newest first, for a motion streak */
  trail: [number, number, number][];
}

export type MomentKind = 'goal' | 'yellow' | 'red' | 'save' | 'halftime' | 'fulltime' | 'kickoff';
export interface Moment { kind: MomentKind; e: MatchEvent; age: number }

export interface MatchState {
  T: number;
  period: 1 | 2;
  /** 0 normally; 0..1 while ends are being changed at half-time (players fade) */
  transition: number;
  ball: BallState;
  players: PlayerState[];
  score: { home: number; away: number };
  possession: TeamId;
  moment: Moment | null;
  /** the event in progress (last with t <= T) */
  current: MatchEvent | null;
  /** short commentary feed, newest last */
  feed: { t: number; text: string; team: TeamId | null }[];
}

export interface Camera { cx: number; cy: number; z: number; shake: number }

// ------------------------------------------------------------------ index
export function buildIndex(log: MatchLog): MatchIndex {
  const events = log.events.slice().sort((a, b) => a.t - b.t);
  const kf = new Map<string, Keyframe[]>();
  const add = (k: string, f: Keyframe) => { let arr = kf.get(k); if (!arr) kf.set(k, (arr = [])); arr.push(f); };
  for (let z = 0; z < events.length; z++) {
    const e = events[z]!;
    if (!e.player) continue;
    const k = e.team + e.player;
    if (e.type === 'goal') {
      // the goal event is where the BALL crossed the line; the scorer peels away
      // from the shot position to celebrate instead of running into the net
      const shot = events[z - 1];
      const from = shot && shot.team === e.team && shot.player === e.player ? shot : e;
      const towardOwnHalf = e.x > log.pitch.w / 2 ? -1 : 1;
      const cy = from.y < log.pitch.h / 2 ? 3 : log.pitch.h - 3;
      add(k, { t: e.t + 5.5, x: clamp(from.x + towardOwnHalf * 14, 2, log.pitch.w - 2), y: lerp(from.y, cy, 0.7), e });
      continue;
    }
    add(k, { t: e.t, x: e.x, y: e.y, e });
    // a carry-type action ends where the next event happens: give the runner a
    // keyframe there too, so they do not snap back to where the run started
    const n = events[z + 1];
    if (n && CARRY.has(e.type) && (n.team !== e.team || n.player !== e.player) && n.t > e.t) {
      add(k, { t: n.t, x: n.x, y: n.y, e });
    }
  }
  for (const arr of kf.values()) arr.sort((a, b) => a.t - b.t);
  const key = events.filter(e =>
    e.type === 'goal' || e.card || e.type === 'save' || e.type === 'halftime' || e.type === 'fulltime');
  return {
    log, W: log.pitch.w, H: log.pitch.h, events, kf, key,
    formation: {
      home: FORMATIONS[log.meta.home.formation] ?? FORMATIONS['4-4-2']!,
      away: FORMATIONS[log.meta.away.formation] ?? FORMATIONS['4-4-2']!,
    },
    halftime: log.meta.halftimeSec, duration: log.meta.durationSec,
  };
}

// ------------------------------------------------------------------ helpers
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeOut = (u: number, k = 2.2): number => 1 - Math.pow(1 - u, k);

/** index of the last entry with t <= T, or -1 */
function bracket<T extends { t: number }>(arr: readonly T[], T: number): number {
  let lo = 0, hi = arr.length - 1, res = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (arr[m]!.t <= T) { res = m; lo = m + 1; } else hi = m - 1;
  }
  return res;
}

const KICK: ReadonlySet<EventType> = new Set(['pass', 'cross', 'shot', 'clearance', 'freekick', 'corner', 'throwin', 'goalkick']);
const CARRY: ReadonlySet<EventType> = new Set(['carry', 'tackle', 'interception', 'save']);

const SPEED: Partial<Record<EventType, number>> = {
  pass: 15, cross: 19, shot: 26, clearance: 21, goalkick: 22, freekick: 19, corner: 18, throwin: 9,
};
function peakHeight(e: MatchEvent, dist: number): number {
  switch (e.type) {
    case 'pass': return dist > 26 ? 2.6 : 0.12;
    case 'cross': return 3.2;
    case 'shot': return e.outcome === 'blocked' ? 0.4 : 0.9;
    case 'clearance': return 5.0;
    case 'goalkick': return 6.0;
    case 'freekick': return e.to ? 2.6 : 1.4;
    case 'corner': return 3.6;
    case 'throwin': return 2.0;
    default: return 0;
  }
}

/** ball position for the segment [cur, nxt] at time T */
function ballAt(ix: MatchIndex, T: number, i: number): BallState {
  const { events, W, H } = ix;
  if (i < 0) return { x: W / 2, y: H / 2, h: 0, vx: 0, vy: 0, spin: 0, trail: [] };
  const cur = events[i]!;
  const nxt = events[i + 1] ?? cur;
  const gap = Math.max(0.001, nxt.t - cur.t);
  const dx = nxt.x - cur.x, dy = nxt.y - cur.y;
  const dist = Math.hypot(dx, dy);
  const age = T - cur.t;

  if (cur.type === 'goal') {
    // sit in the net, then get carried back to the centre for the restart
    const hold = 3, walk = Math.min(12, Math.max(1, gap - hold - 1));
    const u = clamp((age - hold) / walk, 0, 1);
    const e = ease(u);
    return { x: lerp(cur.x, W / 2, e), y: lerp(cur.y, H / 2, e), h: 0, vx: 0, vy: 0, spin: 0, trail: [] };
  }
  if (KICK.has(cur.type)) {
    const dur = clamp(dist / (SPEED[cur.type] ?? 15), 0.35, gap);
    const u = clamp(age / dur, 0, 1);
    const e = easeOut(u, 2.0);
    const peak = peakHeight(cur, dist);
    const h = peak * 4 * u * (1 - u);
    // derivative of easeOut for velocity
    const de = u < 1 ? 2.0 * Math.pow(1 - u, 1.0) / dur : 0;
    return { x: cur.x + dx * e, y: cur.y + dy * e, h, vx: dx * de, vy: dy * de, spin: (dist * e) / 0.11, trail: [] };
  }
  if (CARRY.has(cur.type)) {
    const u = clamp(age / gap, 0, 1);
    const e = ease(u);
    const de = (u < 0.5 ? 4 * u : 4 * (1 - u)) / gap;
    return { x: cur.x + dx * e, y: cur.y + dy * e, h: 0, vx: dx * de, vy: dy * de, spin: (dist * e) / 0.11, trail: [] };
  }
  // static (out, foul, kickoff, halftime...): sit, then get moved to the restart spot
  const move = Math.min(2.0, gap);
  const u = clamp((age - (gap - move)) / move, 0, 1);
  const e = ease(u);
  const de = (u > 0 && u < 1 ? (u < 0.5 ? 4 * u : 4 * (1 - u)) : 0) / move;
  return { x: cur.x + dx * e, y: cur.y + dy * e, h: 0, vx: dx * de, vy: dy * de, spin: (dist * e) / 0.11, trail: [] };
}

/** The team shape follows a slow, smoothed version of the ball rather than the
 *  ball itself, so a 20 m/s pass does not drag twenty players with it.
 *  Triangular kernel over the last WIN seconds: continuous in T, still pure. */
const WIN = 7, TAPS = 14;
function slowBall(ix: MatchIndex, T: number): [number, number] {
  let sx = 0, sy = 0, sw = 0;
  for (let k = 0; k <= TAPS; k++) {
    const u = k / TAPS;                    // 0 = now, 1 = WIN seconds ago
    const w = 1 - u * 0.85;                // more weight on the present
    const t = Math.max(0, T - u * WIN);
    const b = ballAt(ix, t, bracket(ix.events, t));
    sx += b.x * w; sy += b.y * w; sw += w;
  }
  return [sx / sw, sy / sw];
}

/** raw position of one player at T (before drift), plus whether they are "on duty" */
function playerPos(ix: MatchIndex, T: number, i: number, ball: BallState, ref: [number, number], team: TeamId, num: number, period: 1 | 2): [number, number, boolean] {
  const { events, W, H } = ix;
  const cur = i >= 0 ? events[i]! : null;
  const arr = ix.kf.get(team + num);
  const [ax, ay] = anchorFor(ix.formation[team], num - 1, team, period, ref[0], ref[1], W, H);

  // the actor of a carry-type segment runs with the ball
  if (cur && CARRY.has(cur.type) && cur.team === team && cur.player === num) {
    const sp = Math.hypot(ball.vx, ball.vy);
    const ox = sp > 0.1 ? -ball.vx / sp * 0.55 : 0, oy = sp > 0.1 ? -ball.vy / sp * 0.55 : 0;
    return [ball.x + ox, ball.y + oy, true];
  }
  if (!arr || !arr.length) return [ax, ay, false];

  const j = bracket(arr, T);
  const k0 = j >= 0 ? arr[j]! : null;
  const k1 = arr[j + 1] ?? null;

  if (k0 && k1) {
    const g = k1.t - k0.t;
    const d = Math.hypot(k1.x - k0.x, k1.y - k0.y);
    if (g <= 30) {
      // dwell briefly at k0 (the action itself), then move to k1 arriving on time
      const dwell = Math.min(1.2, g * 0.25);
      const travel = Math.max(0.5, g - dwell);
      const u = clamp((T - k0.t - dwell) / travel, 0, 1);
      const e = ease(u);
      return [lerp(k0.x, k1.x, e), lerp(k0.y, k1.y, e), u < 1 || T - k0.t < 1.5];
    }
    // long gap: return to shape after k0, leave shape in time to reach k1
    const back = clamp(d * 0.25, 3, 8);
    const go = clamp(d / 4.5, 3, 14);
    if (T - k0.t < back) {
      const e = ease(clamp((T - k0.t) / back, 0, 1));
      return [lerp(k0.x, ax, e), lerp(k0.y, ay, e), T - k0.t < 1.5];
    }
    if (k1.t - T < go) {
      const e = ease(clamp(1 - (k1.t - T) / go, 0, 1));
      return [lerp(ax, k1.x, e), lerp(ay, k1.y, e), k1.t - T < 3];
    }
    return [ax, ay, false];
  }
  if (k0) {
    const back = 6;
    const e = ease(clamp((T - k0.t) / back, 0, 1));
    return [lerp(k0.x, ax, e), lerp(k0.y, ay, e), T - k0.t < 1.5];
  }
  if (k1) {
    const go = clamp(Math.hypot(k1.x - ax, k1.y - ay) / 4.5, 3, 14);
    if (k1.t - T < go) {
      const e = ease(clamp(1 - (k1.t - T) / go, 0, 1));
      return [lerp(ax, k1.x, e), lerp(ay, k1.y, e), k1.t - T < 3];
    }
  }
  return [ax, ay, false];
}

function withDrift(x: number, y: number, T: number, team: TeamId, num: number, W: number, H: number): [number, number] {
  const ph = num * 1.7 + (team === 'home' ? 0 : 3.1);
  return [clamp(x + Math.sin(T * 0.5 + ph) * 0.45, 0.5, W - 0.5), clamp(y + Math.cos(T * 0.37 + ph * 1.3) * 0.6, 0.5, H - 0.5)];
}

function periodAt(ix: MatchIndex, T: number): 1 | 2 { return T >= ix.halftime ? 2 : 1; }

// ------------------------------------------------------------------ text
const NAMES: Record<TeamId, string> = { home: 'HOME', away: 'AWAY' };
export function describe(ix: MatchIndex, e: MatchEvent): string | null {
  const side = ix.log.meta[e.team].short;
  const who = `${side} #${e.player}`;
  switch (e.type) {
    case 'kickoff': return `Kick-off, ${side}`;
    case 'goal': return `GOAL! ${who}  ${e.score ? `${e.score.home}-${e.score.away}` : ''}`.trim();
    case 'shot': return e.outcome === 'goal' ? null : `Shot by ${who}: ${e.outcome}`;
    case 'save': return `Save, ${who}`;
    case 'foul': return e.card ? `${e.card === 'red' ? 'RED' : 'Yellow'} card: ${who}` : `Foul by ${who}`;
    case 'corner': return `Corner, ${side}`;
    case 'halftime': return `Half-time ${e.score ? `${e.score.home}-${e.score.away}` : ''}`.trim();
    case 'fulltime': return `Full-time ${e.score ? `${e.score.home}-${e.score.away}` : ''}`.trim();
    case 'cross': return e.outcome === 'complete' ? `Cross from ${who}` : null;
    default: return null;
  }
}
void NAMES;

// ------------------------------------------------------------------ state
export function stateAt(ix: MatchIndex, T: number): MatchState {
  const { events, W, H } = ix;
  T = clamp(T, 0, ix.duration);
  const i = bracket(events, T);
  const cur = i >= 0 ? events[i]! : null;
  const period = periodAt(ix, T);
  const ball = ballAt(ix, T, i);
  // motion streak: where the ball was a few hundredths ago (only when flying fast)
  if (Math.hypot(ball.vx, ball.vy) > 9) {
    for (let k = 1; k <= 4; k++) {
      const t = T - k * 0.035;
      const b = ballAt(ix, t, bracket(events, t));
      ball.trail.push([b.x, b.y, b.h]);
    }
  }

  // velocities by finite difference: positions are pure in T, so this is too
  const EPS = 0.12;
  const iPrev = bracket(events, T - EPS);
  const ballPrev = ballAt(ix, T - EPS, iPrev);
  const periodPrev = periodAt(ix, T - EPS);
  const ref = slowBall(ix, T), refPrev = slowBall(ix, T - EPS);

  // cards so far, per player
  const cards = new Map<string, 'yellow' | 'red'>();
  const offAt = new Map<string, number>();
  for (let z = 0; z <= i; z++) {
    const e = events[z]!;
    if (!e.card) continue;
    const k = e.team + e.player;
    const prev = cards.get(k);
    const now: 'yellow' | 'red' = e.card === 'red' || prev === 'yellow' ? 'red' : 'yellow';
    cards.set(k, now);
    if (now === 'red' && !offAt.has(k)) offAt.set(k, e.t);
  }

  // change of ends: over the few log-seconds between the whistle and the restart
  // the two formations are cross-faded rather than sprinted across the pitch
  const SWAP = 3;
  const transition = T >= ix.halftime && T < ix.halftime + SWAP ? (T - ix.halftime) / SWAP : 0;

  const players: PlayerState[] = [];
  for (const team of ['home', 'away'] as const) {
    for (let num = 1; num <= 11; num++) {
      const k = team + num;
      const sentOff = offAt.get(k);
      const off = sentOff !== undefined && T - sentOff > 6;
      let [px, py, involved] = playerPos(ix, T, i, ball, ref, team, num, period);
      let [qx, qy] = playerPos(ix, T - EPS, iPrev, ballPrev, refPrev, team, num, periodPrev);
      if (transition > 0) {
        const [ox, oy] = playerPos(ix, T, i, ball, ref, team, num, 1);
        const u = ease(transition);
        px = lerp(ox, px, u); py = lerp(oy, py, u); qx = px; qy = py;
      }
      [px, py] = withDrift(px, py, T, team, num, W, H);
      [qx, qy] = withDrift(qx, qy, T - EPS, team, num, W, H);
      if (sentOff !== undefined && !off) {
        // walk off toward the nearest touchline
        const u = ease(clamp((T - sentOff) / 6, 0, 1));
        const ty = py < H / 2 ? -3 : H + 3;
        py = lerp(py, ty, u); qy = lerp(qy, ty, u);
      }
      const vx = (px - qx) / EPS, vy = (py - qy) / EPS;
      const speed = Math.hypot(vx, vy);
      const dBall = Math.hypot(ball.x - px, ball.y - py);
      const facing: 1 | -1 = speed > 0.8 ? (vx >= 0 ? 1 : -1) : (ball.x >= px ? 1 : -1);
      const hasBall = !!cur && ball.h < 0.3 && dBall < 1.6 &&
        ((CARRY.has(cur.type) && cur.team === team && cur.player === num) ||
         (events[i + 1]?.team === team && events[i + 1]?.player === num));
      players.push({ team, num, gk: num === 1, x: px, y: py, vx, vy, speed, facing, hasBall, involved,
        card: cards.get(k) ?? null, off });
    }
  }

  let score = { home: 0, away: 0 };
  for (let z = i; z >= 0; z--) { const s = events[z]!.score; if (s) { score = s; break; } }

  let possession: TeamId = cur?.team ?? 'home';
  if (cur && (cur.type === 'out' || cur.type === 'goal')) possession = cur.team === 'home' ? 'away' : 'home';

  let moment: Moment | null = null;
  for (let z = ix.key.length - 1; z >= 0; z--) {
    const e = ix.key[z]!;
    if (e.t > T) continue;
    const age = T - e.t;
    const kind: MomentKind = e.type === 'goal' ? 'goal' : e.card ? e.card : e.type === 'save' ? 'save'
      : e.type === 'halftime' ? 'halftime' : 'fulltime';
    const life = kind === 'goal' ? 9 : kind === 'save' ? 3.5 : kind === 'fulltime' ? 1e9 : 7;
    if (age < life) moment = { kind, e, age };
    break;
  }

  const feed: MatchState['feed'] = [];
  for (let z = i; z >= 0 && feed.length < 4; z--) {
    const e = events[z]!;
    const text = describe(ix, e);
    if (text) feed.unshift({ t: e.t, text, team: e.type === 'halftime' || e.type === 'fulltime' ? null : e.team });
  }

  return { T, period, transition, ball, players, score, possession, moment, current: cur, feed };
}

/** Playback rate multiplier, a pure function of (T, replay speed): key moments
 *  are held at a readable effective speed (a goal plays at about 2.5x real time
 *  whether the replay runs at 10x or 120x) without cutting away or stopping the
 *  clock, then the rate eases back up. Returns 0 only at full-time. */
export function rateAt(ix: MatchIndex, T: number, speed = 30): number {
  if (T >= ix.duration) return 0;
  const kindOf = (e: MatchEvent): MomentKind => e.type === 'goal' ? 'goal' : e.card ? e.card : e.type === 'save' ? 'save'
    : e.type === 'halftime' ? 'halftime' : 'fulltime';
  // [effective speed to hold at, seconds of match time to hold, seconds to ease back]
  const PROFILE: Record<MomentKind, [number, number, number]> = {
    goal: [2.5, 6, 6], red: [4, 3.5, 4], yellow: [4, 3.5, 4], save: [6, 2, 2],
    halftime: [3, 4, 3], fulltime: [1, 1e9, 1], kickoff: [1, 0, 0],
  };
  let r = 1;
  for (const e of ix.key) {
    if (e.t > T) break;
    const a = T - e.t;
    const [eff, hold, ramp] = PROFILE[kindOf(e)];
    const floor = Math.min(1, eff / Math.max(1, speed));
    if (a < hold) r = Math.min(r, floor);
    else if (a < hold + ramp) r = Math.min(r, floor + (1 - floor) * ease((a - hold) / ramp));
  }
  // lead-in: start easing down 1.5 s before a goal so the slowdown is not a jolt
  const goalFloor = Math.min(1, 2.5 / Math.max(1, speed));
  for (const e of ix.key) {
    if (e.type !== 'goal') continue;
    const b = e.t - T;
    if (b > 0 && b < 1.5) r = Math.min(r, lerp(goalFloor, 1, ease(b / 1.5)));
  }
  return r;
}

/** Camera: smoothed toward the ball with a little lookahead; zooms on moments. */
export function cameraAt(ix: MatchIndex, s: MatchState, prev: Camera | null, dt: number): Camera {
  const { W, H } = ix;
  const look = 0.45;
  let tx = clamp(s.ball.x + clamp(s.ball.vx * look, -7, 7), 0, W);
  let ty = clamp(s.ball.y + clamp(s.ball.vy * look, -5, 5), 0, H);
  let zt = 1.0;
  if (s.moment) {
    if (s.moment.kind === 'goal') { zt = s.moment.age < 4 ? 1.75 : 1.25; }
    else if (s.moment.kind === 'yellow' || s.moment.kind === 'red') zt = 1.55;
    else if (s.moment.kind === 'save') zt = 1.5;
    else if (s.moment.kind === 'halftime' || s.moment.kind === 'fulltime') { zt = 0.92; tx = W / 2; ty = H / 2; }
  } else {
    // creep in a little when play is in either box
    const nearGoal = Math.min(s.ball.x, W - s.ball.x) < 22;
    zt = nearGoal ? 1.22 : 1.0;
  }
  const shake = s.moment && s.moment.kind === 'goal' && s.moment.age < 1.2 ? (1.2 - s.moment.age) * 0.6 : 0;
  if (!prev) return { cx: tx, cy: ty, z: zt, shake };
  const kp = 1 - Math.exp(-dt * 2.6), kz = 1 - Math.exp(-dt * 2.2);
  return { cx: lerp(prev.cx, tx, kp), cy: lerp(prev.cy, ty, kp), z: lerp(prev.z, zt, kz), shake };
}

export function fmtClock(T: number): string {
  const m = Math.floor(T / 60), s = Math.floor(T % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export { attackDir };
