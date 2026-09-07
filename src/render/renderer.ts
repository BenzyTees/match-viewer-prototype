import { Application, Container } from 'pixi.js';
import type { Camera, MatchIndex, MatchState } from '../engine.ts';
import { buildPitch } from './pitch.ts';
import { PlayerSprite } from './player.ts';
import { BallSprite } from './ball.ts';
import { Hud, type UiInfo } from './hud.ts';

/** metres of pitch visible across the canvas width at zoom 1 */
export const VIEW_M = 78;

export class Renderer {
  readonly app: Application;
  readonly W: number; readonly H: number;
  readonly world = new Container();
  private pitch: Container | null = null;
  private players = new Map<string, PlayerSprite>();
  private ball = new BallSprite();
  readonly hud: Hud;
  private ix: MatchIndex;

  private constructor(app: Application, ix: MatchIndex, W: number, H: number) {
    this.app = app; this.ix = ix; this.W = W; this.H = H;
    this.world.sortableChildren = true;
    app.stage.addChild(this.world);
    this.hud = new Hud(ix, W, H);
    app.stage.addChild(this.hud.root);
    this.setIndex(ix);
  }

  static async create(canvas: HTMLCanvasElement, ix: MatchIndex, W = 1280, H = 720): Promise<Renderer> {
    const app = new Application();
    await app.init({ canvas, width: W, height: H, background: 0x0e1a12, antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, preference: 'webgl' });
    app.ticker.stop();      // we drive rendering ourselves
    return new Renderer(app, ix, W, H);
  }

  /** (re)build the scene for a log */
  setIndex(ix: MatchIndex): void {
    this.ix = ix;
    this.world.removeChildren();
    for (const p of this.players.values()) p.root.destroy({ children: true });
    this.players.clear();
    this.pitch = buildPitch(ix.log);
    this.pitch.zIndex = -1e6;
    this.world.addChild(this.pitch);
    for (const team of ['home', 'away'] as const) {
      for (let n = 1; n <= 11; n++) {
        const sp = new PlayerSprite(team, n, ix.log.meta[team]);
        this.players.set(team + n, sp);
        this.world.addChild(sp.root);
      }
    }
    this.world.addChild(this.ball.root);
    this.hud.setIndex(ix);
  }

  draw(s: MatchState, cam: Camera, wallDt: number, ui: UiInfo): void {
    const { W, H } = this;
    const { W: PW, H: PH } = this.ix;
    // camera -> world transform, clamped so we never look past the stands
    const scale = (W / VIEW_M) * cam.z;
    const halfW = W / (2 * scale), halfH = H / (2 * scale);
    const M = 9;
    const cx = Math.min(Math.max(cam.cx, halfW - M), PW - halfW + M);
    const cy = Math.min(Math.max(cam.cy, halfH - M), PH - halfH + M);
    const shx = cam.shake ? Math.sin(s.T * 97) * cam.shake * 6 : 0;
    const shy = cam.shake ? Math.cos(s.T * 83) * cam.shake * 6 : 0;
    this.world.scale.set(scale);
    this.world.position.set(W / 2 - cx * scale + shx, H / 2 - cy * scale + shy);

    const scorer = s.moment && s.moment.kind === 'goal' ? s.moment.e.team + s.moment.e.player : null;
    const alpha = s.transition > 0 ? Math.max(0, 1 - Math.sin(s.transition * Math.PI) * 1.15) : 1;
    for (const p of s.players) {
      const sp = this.players.get(p.team + p.num);
      if (!sp) continue;
      const celebrate = scorer === p.team + p.num && (s.moment?.age ?? 9) < 7;
      sp.update(p, wallDt, celebrate, alpha);
    }
    this.ball.update(s.ball);
    this.hud.draw(s, ui, { cx, cy, hw: halfW, hh: halfH });
    this.app.render();
  }
}
