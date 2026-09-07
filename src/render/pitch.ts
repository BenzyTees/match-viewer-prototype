import { Container, Graphics } from 'pixi.js';
import type { MatchLog } from '../types.ts';

/** Stylised pitch + surroundings, drawn once in world units (metres). */
export function buildPitch(log: MatchLog): Container {
  const W = log.pitch.w, H = log.pitch.h;
  const root = new Container();

  // ---- surroundings: dark grass apron, ad boards, crowd
  const apron = new Graphics().rect(-40, -30, W + 80, H + 60).fill(0x1f5a2a);
  root.addChild(apron);

  const crowd = new Graphics();
  // seed-stable pseudo random for the crowd dots
  let sd = 12345;
  const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
  const palette = [0x2b2f3a, 0x3a3f4d, 0x4b5163, 0x263040, 0x5a4a3a, 0x6b2b2b, 0x2b4a6b, 0x7a7a7a, 0x8a3a3a, 0x3a6b4a];
  const home = Number(log.meta.home.kit.shirt.replace('#', '0x')), away = Number(log.meta.away.kit.shirt.replace('#', '0x'));
  const drawBand = (x0: number, y0: number, w: number, h: number, rows: number, cols: number, teamColor: number) => {
    // tiers
    crowd.rect(x0, y0, w, h).fill(0x1a1d24);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + (c + 0.5) * (w / cols) + (rnd() - 0.5) * 0.4;
        const y = y0 + (r + 0.5) * (h / rows) + (rnd() - 0.5) * 0.3;
        const col = rnd() < 0.22 ? teamColor : palette[Math.floor(rnd() * palette.length)]!;
        crowd.circle(x, y, 0.3).fill({ color: col, alpha: 0.85 });
      }
    }
  };
  const B = 4.5;   // gap between touchline and boards
  const D = 11;    // stand depth
  drawBand(-B - D, -B - D, W + 2 * (B + D), D, 12, 170, home);           // top stand
  drawBand(-B - D, H + B, W + 2 * (B + D), D, 12, 170, away);           // bottom stand
  drawBand(-B - D, -B, D, H + 2 * B, 90, 12, home);                      // left
  drawBand(W + B, -B, D, H + 2 * B, 90, 12, away);                       // right
  crowd.cacheAsTexture(true);
  root.addChild(crowd);

  // ad boards: alternating panels in a soft palette
  const boards = new Graphics();
  const boardCols = [0xf2f2f2, 0xdfe3e8, 0x22303c, 0xeaeaea, 0x2b6cb0, 0xf2f2f2];
  const panel = (x: number, y: number, w: number, h: number, i: number) => {
    boards.rect(x, y, w, h).fill(boardCols[i % boardCols.length]!);
    boards.rect(x, y, w, h).stroke({ width: 0.12, color: 0x111111, alpha: 0.35 });
  };
  const bw = 7;
  for (let i = 0, x = -B; x < W + B; i++, x += bw) { panel(x, -B - 1.1, Math.min(bw, W + B - x), 1.0, i); panel(x, H + B + 0.1, Math.min(bw, W + B - x), 1.0, i + 3); }
  for (let i = 0, y = -B; y < H + B; i++, y += bw) { panel(-B - 1.1, y, 1.0, Math.min(bw, H + B - y), i + 1); panel(W + B + 0.1, y, 1.0, Math.min(bw, H + B - y), i + 4); }
  root.addChild(boards);

  // ---- the grass: mown stripes + a subtle vignette
  const grass = new Graphics();
  grass.rect(-B, -B, W + 2 * B, H + 2 * B).fill(0x2f8a3e);
  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    grass.rect(-B + i * ((W + 2 * B) / stripes), -B, (W + 2 * B) / stripes, H + 2 * B).fill(i % 2 ? 0x2f8a3e : 0x36984a);
  }
  // mowing cross-stripes, very faint, to give the surface some texture
  for (let i = 0; i < 8; i++) {
    grass.rect(-B, -B + i * ((H + 2 * B) / 8), W + 2 * B, (H + 2 * B) / 16).fill({ color: 0xffffff, alpha: 0.025 });
  }
  root.addChild(grass);

  // ---- markings
  const L = new Graphics();
  const lw = 0.24, white = { width: lw, color: 0xffffff, alpha: 0.92 };
  L.rect(0, 0, W, H).stroke(white);
  L.moveTo(W / 2, 0).lineTo(W / 2, H).stroke(white);
  L.moveTo(W / 2 + 9.15, H / 2).circle(W / 2, H / 2, 9.15).stroke(white);
  L.circle(W / 2, H / 2, 0.35).fill(0xffffff);
  for (const side of [0, 1]) {
    const sx = side ? -1 : 1, gx = side ? W : 0;
    // penalty area 16.5 x 40.32, six-yard 5.5 x 18.32
    L.rect(side ? W - 16.5 : 0, H / 2 - 20.16, 16.5, 40.32).stroke(white);
    L.rect(side ? W - 5.5 : 0, H / 2 - 9.16, 5.5, 18.32).stroke(white);
    L.circle(gx + sx * 11, H / 2, 0.35).fill(0xffffff);
    // the D: arc of radius 9.15 around the penalty spot, outside the box
    const px = gx + sx * 11;
    const a = Math.acos(5.5 / 9.15);
    const arc = (cx: number, cy: number, r: number, a0: number, a1: number) =>
      L.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0)).arc(cx, cy, r, a0, a1).stroke(white);
    if (side === 0) arc(px, H / 2, 9.15, -a, a);
    else arc(px, H / 2, 9.15, Math.PI - a, Math.PI + a);
    // corner arcs
    arc(gx, 0, 1, side ? Math.PI / 2 : 0, side ? Math.PI : Math.PI / 2);
    arc(gx, H, 1, side ? Math.PI : -Math.PI / 2, side ? 3 * Math.PI / 2 : 0);
  }
  root.addChild(L);

  // ---- goals with nets (behind the goal line)
  const nets = new Graphics();
  for (const side of [0, 1]) {
    const gx = side ? W : 0, sx = side ? 1 : -1, depth = 2.2, half = 3.66;
    const x0 = gx, x1 = gx + sx * depth;
    nets.rect(Math.min(x0, x1), H / 2 - half, depth, 2 * half).fill({ color: 0xffffff, alpha: 0.10 });
    const nl = { width: 0.06, color: 0xffffff, alpha: 0.55 };
    for (let k = 0; k <= 8; k++) { const y = H / 2 - half + (2 * half * k) / 8; nets.moveTo(x0, y).lineTo(x1, y).stroke(nl); }
    for (let k = 0; k <= 4; k++) { const x = x0 + (sx * depth * k) / 4; nets.moveTo(x, H / 2 - half).lineTo(x, H / 2 + half).stroke(nl); }
    // posts and bar (bar drawn as the front line, thicker)
    nets.rect(Math.min(x0, x1), H / 2 - half - 0.15, depth, 0.3).fill(0xf8f8f8);
    nets.rect(Math.min(x0, x1), H / 2 + half - 0.15, depth, 0.3).fill(0xf8f8f8);
    nets.rect(x1 - 0.15, H / 2 - half, 0.3, 2 * half).fill(0xdddddd);
    nets.rect(x0 - 0.16, H / 2 - half - 0.15, 0.32, 2 * half + 0.3).fill(0xffffff);
  }
  root.addChild(nets);

  return root;
}
