import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import type { MatchIndex, MatchState } from '../engine.ts';
import { fmtClock } from '../engine.ts';

const hex = (s: string): number => Number(s.replace('#', '0x'));
const FONT = 'Inter, "Segoe UI", Helvetica, Arial, sans-serif';
const style = (o: TextStyleOptions): TextStyleOptions => ({ fontFamily: FONT, fill: 0xffffff, ...o });

export interface UiInfo { speed: number; rate: number; playing: boolean }
export interface ViewRect { cx: number; cy: number; hw: number; hh: number }

/** Screen-space overlay: scoreboard, clock, timeline, event feed, moment banners. */
export class Hud {
  readonly root = new Container();
  private readonly W: number; private readonly H: number;
  private ix: MatchIndex;
  private readonly panel = new Graphics();
  private readonly homeName: Text; private readonly awayName: Text; private readonly score: Text;
  private readonly clock: Text; private readonly period: Text; private readonly speed: Text;
  private readonly timeline = new Graphics();
  private readonly tlLabels: Text[] = [];
  private readonly feedTexts: Text[] = [];
  private readonly feedDots = new Graphics();
  private readonly banner = new Container();
  private readonly bannerBg = new Graphics();
  private readonly bannerBig: Text; private readonly bannerSmall: Text;
  private readonly confetti = new Graphics();
  private readonly radar = new Graphics();
  private readonly hit = new Graphics();
  onSeek: ((T: number) => void) | null = null;
  private scrubbing = false;

  constructor(ix: MatchIndex, W: number, H: number) {
    this.ix = ix; this.W = W; this.H = H;
    const m = ix.log.meta;

    // ---- scoreboard
    this.root.addChild(this.panel);
    this.homeName = new Text({ text: m.home.short, style: style({ fontSize: 22, fontWeight: '800' }) });
    this.awayName = new Text({ text: m.away.short, style: style({ fontSize: 22, fontWeight: '800' }) });
    this.score = new Text({ text: '0 - 0', style: style({ fontSize: 26, fontWeight: '900' }) });
    this.clock = new Text({ text: '00:00', style: style({ fontSize: 24, fontWeight: '700' }) });
    this.period = new Text({ text: '1ST HALF', style: style({ fontSize: 11, fontWeight: '700', fill: 0x9fb3c8, letterSpacing: 1 }) });
    this.speed = new Text({ text: '', style: style({ fontSize: 14, fontWeight: '700', fill: 0xdfe7ef }) });
    for (const t of [this.homeName, this.awayName, this.score, this.clock]) t.anchor.set(0.5);
    this.period.anchor.set(0.5, 0);
    this.speed.anchor.set(1, 0);
    this.root.addChild(this.homeName, this.awayName, this.score, this.clock, this.period, this.speed);

    // ---- timeline + feed
    this.root.addChild(this.timeline, this.feedDots, this.radar);
    for (const lbl of ["0'", "45'", "90'"]) {
      const t = new Text({ text: lbl, style: style({ fontSize: 11, fontWeight: '700', fill: 0xc9d4df }) });
      t.anchor.set(0.5, 0); this.tlLabels.push(t); this.root.addChild(t);
    }
    for (let i = 0; i < 3; i++) {
      const t = new Text({ text: '', style: style({ fontSize: 14, fontWeight: i === 2 ? '700' : '500' }) });
      this.feedTexts.push(t); this.root.addChild(t);
    }
    this.hit.rect(0, H - 60, W, 60).fill({ color: 0xffffff, alpha: 0.001 });
    this.hit.eventMode = 'static'; this.hit.cursor = 'pointer';
    const seekAt = (x: number) => { const u = Math.max(0, Math.min(1, (x - 40) / (W - 80))); this.onSeek?.(u * this.ix.duration); };
    this.hit.on('pointerdown', e => { this.scrubbing = true; seekAt(e.global.x); });
    this.hit.on('pointermove', e => { if (this.scrubbing) seekAt(e.global.x); });
    this.hit.on('pointerup', () => { this.scrubbing = false; });
    this.hit.on('pointerupoutside', () => { this.scrubbing = false; });
    this.root.addChild(this.hit);

    // ---- moment banner
    this.bannerBig = new Text({ text: '', style: style({ fontSize: 76, fontWeight: '900', letterSpacing: 2, stroke: { color: 0x000000, width: 6 }, dropShadow: { alpha: 0.5, blur: 6, distance: 4, color: 0x000000 } }) });
    this.bannerSmall = new Text({ text: '', style: style({ fontSize: 22, fontWeight: '700', stroke: { color: 0x000000, width: 4 } }) });
    this.bannerBig.anchor.set(0.5); this.bannerSmall.anchor.set(0.5);
    this.banner.addChild(this.confetti, this.bannerBg, this.bannerBig, this.bannerSmall);
    this.banner.visible = false;
    this.root.addChild(this.banner);
  }

  setIndex(ix: MatchIndex): void {
    this.ix = ix;
    this.homeName.text = ix.log.meta.home.short; this.awayName.text = ix.log.meta.away.short;
  }

  draw(s: MatchState, ui: UiInfo, view: ViewRect): void {
    const { W, H, ix } = this;
    const m = ix.log.meta;
    const hc = hex(m.home.kit.shirt), ac = hex(m.away.kit.shirt);

    // ---- scoreboard panel
    const px = 20, py = 18, pw = 470, ph = 56;
    const p = this.panel.clear();
    p.roundRect(px, py, pw, ph, 12).fill({ color: 0x0b1220, alpha: 0.86 });
    p.roundRect(px, py, pw, ph, 12).stroke({ width: 1, color: 0xffffff, alpha: 0.12 });
    p.roundRect(px + 12, py + 14, 10, 28, 3).fill(hc);
    p.roundRect(px + 258, py + 14, 10, 28, 3).fill(ac);
    // possession arrow
    const posX = s.possession === 'home' ? px + 98 : px + 232;
    p.poly([posX - 5, py + ph - 9, posX + 5, py + ph - 9, posX, py + ph - 4]).fill({ color: 0xffffff, alpha: 0.8 });
    // clock segment
    p.roundRect(px + 285, py + 7, 92, ph - 14, 8).fill({ color: 0xffffff, alpha: 0.08 });
    this.homeName.position.set(px + 60, py + ph / 2);
    this.score.position.set(px + 140, py + ph / 2);
    this.awayName.position.set(px + 220, py + ph / 2);
    this.score.text = `${s.score.home} - ${s.score.away}`;
    this.clock.position.set(px + 331, py + ph / 2 - 2);
    this.clock.text = fmtClock(s.T);
    this.period.position.set(px + 428, py + 11);
    this.period.text = s.T >= ix.duration ? 'FULL TIME' : s.transition > 0 ? 'HALF-TIME' : s.period === 1 ? '1ST HALF' : '2ND HALF';
    const eff = ui.speed * ui.rate;
    this.speed.position.set(W - 22, 26);
    this.speed.text = ui.playing ? (ui.rate < 0.98 ? `×${ui.speed}  ·  slowed to ×${eff < 1 ? eff.toFixed(1) : Math.round(eff)}` : `×${ui.speed}`) : 'PAUSED';
    p.roundRect(W - 22 - this.speed.width - 14, 18, this.speed.width + 28, 32, 10).fill({ color: 0x0b1220, alpha: 0.78 });

    // ---- radar: the whole pitch, all 22, and what the camera is looking at
    const rw = 176, rh = rw * (ix.H / ix.W), rx = W - 22 - rw, ry = 62;
    const rd = this.radar.clear();
    rd.roundRect(rx - 8, ry - 8, rw + 16, rh + 16, 10).fill({ color: 0x0b1220, alpha: 0.72 });
    rd.rect(rx, ry, rw, rh).fill({ color: 0x2f8a3e, alpha: 0.9 }).rect(rx, ry, rw, rh).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
    rd.moveTo(rx + rw / 2, ry).lineTo(rx + rw / 2, ry + rh).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    rd.circle(rx + rw / 2, ry + rh / 2, rh * 0.135).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    const k = rw / ix.W;
    rd.rect(rx, ry + rh / 2 - 20.16 * k, 16.5 * k, 40.32 * k).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    rd.rect(rx + rw - 16.5 * k, ry + rh / 2 - 20.16 * k, 16.5 * k, 40.32 * k).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    // camera window
    const vx = Math.max(rx, rx + (view.cx - view.hw) * k), vy = Math.max(ry, ry + (view.cy - view.hh) * k);
    const vx2 = Math.min(rx + rw, rx + (view.cx + view.hw) * k), vy2 = Math.min(ry + rh, ry + (view.cy + view.hh) * k);
    rd.rect(vx, vy, vx2 - vx, vy2 - vy).fill({ color: 0xffffff, alpha: 0.10 }).rect(vx, vy, vx2 - vx, vy2 - vy).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
    for (const p of s.players) {
      if (p.off) continue;
      rd.circle(rx + p.x * k, ry + p.y * k, p.hasBall ? 3.6 : 2.6).fill(p.team === 'home' ? hc : ac);
      if (p.hasBall) rd.circle(rx + p.x * k, ry + p.y * k, 3.6).stroke({ width: 1, color: 0xffffff });
    }
    rd.circle(rx + s.ball.x * k, ry + s.ball.y * k, 2.2).fill(0xffffff).circle(rx + s.ball.x * k, ry + s.ball.y * k, 2.2).stroke({ width: 1, color: 0x111111 });

    // ---- timeline
    const x0 = 40, x1 = W - 40, ty = H - 28, u = s.T / ix.duration;
    const tl = this.timeline.clear();
    tl.roundRect(x0 - 10, ty - 36, x1 - x0 + 20, 58, 12).fill({ color: 0x0b1220, alpha: 0.72 });
    tl.roundRect(x0, ty - 3, x1 - x0, 6, 3).fill({ color: 0xffffff, alpha: 0.18 });
    tl.roundRect(x0, ty - 3, (x1 - x0) * u, 6, 3).fill({ color: 0xffffff, alpha: 0.9 });
    const xAt = (t: number) => x0 + (x1 - x0) * (t / ix.duration);
    tl.rect(xAt(ix.halftime) - 1, ty - 9, 2, 18).fill({ color: 0xffffff, alpha: 0.5 });
    for (const e of ix.key) {
      const x = xAt(e.t);
      if (e.type === 'goal') {
        const c = e.team === 'home' ? hc : ac;
        tl.circle(x, ty - 14, 6).fill(c).circle(x, ty - 14, 6).stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
      } else if (e.card) {
        tl.roundRect(x - 3, ty + 8, 6, 9, 1).fill(e.card === 'red' ? 0xe53935 : 0xffd400);
      }
    }
    tl.circle(xAt(s.T), ty, 7).fill(0xffffff).circle(xAt(s.T), ty, 7).stroke({ width: 2, color: 0x0b1220, alpha: 0.9 });
    this.tlLabels[0]!.position.set(x0, ty + 8); this.tlLabels[1]!.position.set(xAt(ix.halftime), ty + 8); this.tlLabels[2]!.position.set(x1, ty + 8);

    // ---- feed
    const fd = this.feedDots.clear();
    const lines = s.feed.slice(-3);
    if (lines.length) fd.roundRect(30, H - 146, 360, 72, 10).fill({ color: 0x0b1220, alpha: 0.62 });
    for (let i = 0; i < 3; i++) {
      const t = this.feedTexts[i]!;
      const row = lines[i - (3 - lines.length)];
      if (!row) { t.text = ''; continue; }
      const y = H - 128 + i * 20;
      t.text = `${Math.floor(row.t / 60)}'  ${row.text}`;
      t.alpha = 0.45 + 0.275 * i;
      t.position.set(58, y - 9);
      const c = row.team === 'home' ? hc : row.team === 'away' ? ac : 0xffffff;
      fd.circle(46, y, 4).fill({ color: c, alpha: t.alpha });
    }

    // ---- banner
    const mo = s.moment;
    if (!mo) { this.banner.visible = false; return; }
    this.banner.visible = true;
    const e = mo.e;
    const teamCol = e.team === 'home' ? hc : ac;
    const teamName = ix.log.meta[e.team].name;
    let big = '', small = '', col = 0xffffff, life = 7;
    switch (mo.kind) {
      case 'goal': big = 'GOAL!'; small = `${teamName}  ·  #${e.player}  ·  ${Math.floor(e.t / 60)}'   ${e.score ? `${e.score.home} - ${e.score.away}` : ''}`; col = teamCol; life = 9; break;
      case 'yellow': big = 'YELLOW CARD'; small = `${teamName}  ·  #${e.player}`; col = 0xffd400; break;
      case 'red': big = 'RED CARD'; small = `${teamName}  ·  #${e.player}  ·  sent off`; col = 0xe53935; break;
      case 'save': big = 'SAVE!'; small = `${teamName}  ·  #${e.player}`; col = 0x7bd88f; life = 3.5; break;
      case 'halftime': big = 'HALF-TIME'; small = `${m.home.short} ${e.score?.home ?? 0} - ${e.score?.away ?? 0} ${m.away.short}`; break;
      case 'fulltime': big = 'FULL-TIME'; small = `${m.home.name} ${e.score?.home ?? 0} - ${e.score?.away ?? 0} ${m.away.name}`; life = 1e9; break;
      case 'kickoff': big = 'KICK-OFF'; small = teamName; life = 3; break;
    }
    const a = Math.min(1, mo.age * 5) * Math.min(1, Math.max(0, (life - mo.age) * 1.5));
    const pop = 1 + 0.18 * Math.exp(-mo.age * 4);
    this.banner.alpha = a;
    const cy = 150;
    this.bannerBig.text = big; this.bannerBig.style.fill = col;
    this.bannerBig.scale.set(mo.kind === 'goal' ? pop : pop * 0.75);
    this.bannerBig.position.set(W / 2, cy);
    this.bannerSmall.text = small; this.bannerSmall.position.set(W / 2, cy + (mo.kind === 'goal' ? 62 : 48));
    const bw = Math.max(this.bannerBig.width, this.bannerSmall.width) + 80;
    this.bannerBg.clear().roundRect(W / 2 - bw / 2, cy - 55, bw, 140, 18).fill({ color: 0x0b1220, alpha: 0.55 });
    this.bannerBg.rect(W / 2 - bw / 2, cy - 55, bw, 5).fill(col);

    // confetti for goals: every particle is a pure function of (index, age)
    const cf = this.confetti.clear();
    if (mo.kind === 'goal' && mo.age < 4) {
      const cols = [teamCol, 0xffffff, 0xffd400, teamCol];
      for (let i = 0; i < 90; i++) {
        const h1 = frac(Math.sin(i * 12.9898) * 43758.5453), h2 = frac(Math.sin(i * 78.233) * 12345.678), h3 = frac(Math.sin(i * 3.7) * 999.1);
        const ang = -Math.PI / 2 + (h1 - 0.5) * 2.4, sp = 260 + h2 * 420;
        const t = mo.age;
        const x = W / 2 + Math.cos(ang) * sp * t, y = cy + Math.sin(ang) * sp * t + 0.5 * 520 * t * t;
        const al = Math.max(0, 1 - t / 3.2);
        const r = t * (4 + h3 * 8), c = Math.cos(r), sn = Math.sin(r);
        const pts: number[] = [];
        for (const [qx, qy] of [[-6, -3], [6, -3], [6, 3], [-6, 3]] as const) pts.push(x + qx * c - qy * sn, y + qx * sn + qy * c);
        cf.poly(pts).fill({ color: cols[i % 4]!, alpha: al });
      }
    }
  }
}
const frac = (v: number): number => v - Math.floor(v);
