import type { TeamId } from './types.ts';

/** Anchor positions as fractions of the pitch, in attack-relative coordinates:
 *  fx = 0 own goal line, fx = 1 opponent goal line; fy = 0..1 across the width. */
export type Anchor = readonly [fx: number, fy: number];

export const FORMATIONS: Record<string, readonly Anchor[]> = {
  // GK, back four, three mids, three forwards (shirts 1..11 in this order)
  '4-3-3': [
    [0.04, 0.50],
    [0.20, 0.15], [0.19, 0.38], [0.19, 0.62], [0.20, 0.85],
    [0.40, 0.30], [0.36, 0.50], [0.40, 0.70],
    [0.62, 0.14], [0.66, 0.50], [0.62, 0.86],
  ],
  // GK, back four, four mids, two strikers
  '4-4-2': [
    [0.04, 0.50],
    [0.20, 0.15], [0.19, 0.38], [0.19, 0.62], [0.20, 0.85],
    [0.42, 0.14], [0.40, 0.38], [0.40, 0.62], [0.42, 0.86],
    [0.62, 0.38], [0.62, 0.62],
  ],
};

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** Direction a team attacks along x: +1 or -1. Home attacks +x in the first half. */
export function attackDir(team: TeamId, period: 1 | 2): 1 | -1 {
  const homeDir = period === 1 ? 1 : -1;
  return team === 'home' ? homeDir : (-homeDir as 1 | -1);
}

/** Where a player "wants" to be given the ball position: the formation slot,
 *  slid along the pitch with the ball and compressed toward the ball's half. */
export function anchorFor(
  formation: readonly Anchor[], idx: number, team: TeamId, period: 1 | 2,
  ballX: number, ballY: number, W: number, H: number,
): [number, number] {
  const a = formation[idx] ?? formation[0]!;
  const dir = attackDir(team, period);
  // ball position in this team's attack-relative frame
  const bfx = dir === 1 ? ballX / W : 1 - ballX / W;
  // the whole block slides with the ball, less for the keeper
  const slide = clamp((bfx - 0.5) * 0.62, -0.30, 0.30) * (idx === 0 ? 0.25 : 1);
  const fx = clamp(a[0] + slide, 0.02, 0.98);
  // squeeze the width toward the ball's side and expand in the middle third
  const by = ballY / H;
  const spread = 0.80 + 0.20 * (1 - Math.abs(bfx - 0.5) * 2);
  const lean = (by - 0.5) * 0.22 * (idx === 0 ? 0.6 : 1);
  const fy = clamp(0.5 + (a[1] - 0.5) * spread + lean, 0.03, 0.97);
  const x = dir === 1 ? fx * W : (1 - fx) * W;
  return [x, fy * H];
}
