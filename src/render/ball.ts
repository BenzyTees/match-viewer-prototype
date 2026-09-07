import { Container, Graphics } from 'pixi.js';
import type { BallState } from '../engine.ts';

export class BallSprite {
  readonly root = new Container();
  private readonly shadow: Graphics;
  private readonly ball = new Container();
  private readonly panels: Graphics;
  private readonly trail = new Graphics();

  constructor() {
    this.shadow = new Graphics().ellipse(0, 0, 0.42, 0.2).fill({ color: 0x000000, alpha: 0.32 });
    const skin = new Graphics().circle(0, 0, 0.42).fill(0xffffff).circle(0, 0, 0.42).stroke({ width: 0.05, color: 0x222222, alpha: 0.9 });
    this.panels = new Graphics();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      this.panels.circle(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.1).fill(0x222222);
    }
    this.panels.circle(0, 0, 0.08).fill(0x222222);
    this.ball.addChild(skin, this.panels);
    this.root.addChild(this.trail, this.shadow, this.ball);
  }

  update(b: BallState): void {
    this.root.position.set(b.x, b.y);
    this.root.zIndex = b.y + 0.3;
    // lift the ball with height; the shadow stays on the ground and shrinks
    const lift = 0.28 + b.h * 0.9;
    this.ball.position.set(0, -lift);
    const sc = 1 + Math.min(1.2, b.h * 0.09);
    this.ball.scale.set(sc);
    this.shadow.scale.set(Math.max(0.35, 1 - b.h * 0.08));
    this.shadow.alpha = Math.max(0.12, 0.32 - b.h * 0.03);
    this.panels.rotation = b.spin * 0.6;
    const tr = this.trail.clear();
    b.trail.forEach(([x, y, h], k) => {
      const a = 0.42 * (1 - k / b.trail.length);
      tr.circle(x - b.x, y - b.y - (0.28 + h * 0.9), 0.36 * (1 - k * 0.12) * (1 + Math.min(1.2, h * 0.09))).fill({ color: 0xffffff, alpha: a });
    });
  }
}
