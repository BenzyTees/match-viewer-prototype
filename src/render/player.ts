import { Container, Graphics, Text } from 'pixi.js';
import type { PlayerState } from '../engine.ts';
import type { TeamId } from '../types.ts';
import type { TeamMeta } from '../types.ts';

const hex = (s: string): number => Number(s.replace('#', '0x'));
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa5673f];
const HAIRS = [0x2b1d0e, 0x111111, 0x5a3a1a, 0xd8b04a, 0x8a3b1a, 0x3a3a3a, 0xcfcfcf];

/** One cartoon footballer. Built once; `update` moves and animates it. */
export class PlayerSprite {
  readonly root = new Container();
  private readonly body = new Container();
  private readonly legL: Graphics; private readonly legR: Graphics;
  private readonly armL: Graphics; private readonly armR: Graphics;
  private readonly head: Container;
  private readonly ring: Graphics;
  private readonly card: Graphics;
  private readonly shirtNum: Text;
  private phase = 0;
  private numScale = 0.011;

  constructor(readonly team: TeamId, readonly num: number, meta: TeamMeta) {
    const gk = num === 1;
    const shirt = gk ? hex(meta.kit.gk) : hex(meta.kit.shirt);
    const shorts = gk ? 0x222222 : hex(meta.kit.shorts);
    const trim = hex(meta.kit.trim);
    const seed = (num * 7 + (team === 'home' ? 1 : 4)) % 97;
    const skin = SKINS[seed % SKINS.length]!;
    const hair = HAIRS[(seed * 3) % HAIRS.length]!;
    const style = (seed * 5) % 4;   // hair style

    // shadow + carrier ring sit on the ground
    const shadow = new Graphics().ellipse(0, 0.12, 0.62, 0.26).fill({ color: 0x000000, alpha: 0.28 });
    this.ring = new Graphics().ellipse(0, 0.12, 0.95, 0.42).stroke({ width: 0.13, color: 0xffffff, alpha: 0.95 });
    this.ring.visible = false;
    this.root.addChild(shadow, this.ring);

    const leg = (): Graphics => {
      const g = new Graphics();
      g.roundRect(-0.13, 0, 0.26, 0.66, 0.1).fill(skin);
      g.roundRect(-0.17, -0.02, 0.34, 0.34, 0.08).fill(shorts);
      g.roundRect(-0.17, 0.55, 0.36, 0.17, 0.07).fill(0x1b1b1b);   // boot
      return g;
    };
    this.legL = leg(); this.legL.position.set(-0.19, -0.78);
    this.legR = leg(); this.legR.position.set(0.19, -0.78);
    this.root.addChild(this.legL, this.legR);

    // torso
    const torso = new Graphics();
    torso.roundRect(-0.56, -1.5, 1.12, 0.82, 0.24).fill(shirt);
    torso.roundRect(-0.56, -1.5, 1.12, 0.82, 0.24).stroke({ width: 0.05, color: 0x000000, alpha: 0.25 });
    // collar + a stripe of trim
    torso.roundRect(-0.2, -1.52, 0.4, 0.12, 0.05).fill(trim);
    torso.rect(-0.56, -0.86, 1.12, 0.1).fill({ color: trim, alpha: 0.9 });
    this.body.addChild(torso);

    const arm = (): Graphics => {
      const g = new Graphics();
      g.roundRect(-0.11, 0, 0.22, 0.6, 0.1).fill(skin);
      g.roundRect(-0.14, -0.02, 0.28, 0.3, 0.08).fill(shirt);   // sleeve
      g.roundRect(-0.14, -0.02, 0.28, 0.06, 0.02).fill(trim);
      if (gk) g.circle(0, 0.6, 0.15).fill(0xf5f5f5);              // glove
      return g;
    };
    this.armL = arm(); this.armL.position.set(-0.52, -1.42);
    this.armR = arm(); this.armR.position.set(0.52, -1.42);
    this.body.addChild(this.armL, this.armR);

    this.shirtNum = new Text({ text: String(num), style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 44, fontWeight: '800', fill: gk ? 0x111111 : luminance(shirt) > 0.5 ? 0x111111 : 0xffffff } });
    this.shirtNum.anchor.set(0.5); this.shirtNum.scale.set(0.011);
    this.numScale = 0.011; this.shirtNum.position.set(0, -1.08);
    this.body.addChild(this.shirtNum);

    // head
    this.head = new Container();
    const face = new Graphics().circle(0, 0, 0.5).fill(skin);
    face.circle(0, 0, 0.5).stroke({ width: 0.05, color: 0x000000, alpha: 0.2 });
    const hairG = new Graphics();
    if (style === 0) hairG.arc(0, 0, 0.52, Math.PI, 2 * Math.PI).lineTo(0.52, -0.1).lineTo(-0.52, -0.1).closePath().fill(hair);
    else if (style === 1) { hairG.arc(0, 0.02, 0.53, Math.PI * 1.05, Math.PI * 1.95).closePath().fill(hair); hairG.ellipse(0, -0.5, 0.35, 0.16).fill(hair); }
    else if (style === 2) hairG.arc(0, 0, 0.52, Math.PI * 1.1, Math.PI * 1.9).closePath().fill(hair);
    else { hairG.arc(0, 0.05, 0.53, Math.PI, 2 * Math.PI).closePath().fill(hair); hairG.rect(-0.53, -0.1, 0.16, 0.35).fill(hair); }
    const eyes = new Graphics();
    for (const s of [-1, 1]) { eyes.ellipse(0.2 * s + 0.08, 0.02, 0.1, 0.12).fill(0xffffff); eyes.circle(0.2 * s + 0.12, 0.03, 0.055).fill(0x111111); }
    eyes.moveTo(0.02, 0.28).quadraticCurveTo(0.14, 0.36, 0.26, 0.26).stroke({ width: 0.04, color: 0x000000, alpha: 0.55 });
    this.head.addChild(face, hairG, eyes);
    this.head.position.set(0, -1.98);
    this.body.addChild(this.head);
    this.root.addChild(this.body);

    // card marker above the head
    this.card = new Graphics();
    this.card.visible = false;
    this.card.position.set(0.55, -2.85);
    this.root.addChild(this.card);
  }

  update(p: PlayerState, wallDt: number, celebrate: boolean, alpha: number): void {
    this.root.visible = !p.off && alpha > 0.01;
    this.root.alpha = alpha;
    this.root.position.set(p.x, p.y);
    this.root.zIndex = p.y;
    this.body.scale.x = p.facing; this.legL.scale.x = p.facing; this.legR.scale.x = p.facing;
    this.shirtNum.scale.x = this.numScale * p.facing;   // keep the number readable when flipped
    const amp = Math.min(1, p.speed / 3.2);
    this.phase += wallDt * (2.2 + 4.5 * amp) * Math.PI * 2 * (0.35 + 0.65 * amp);
    const s = Math.sin(this.phase);
    if (celebrate) {
      const j = Math.abs(Math.sin(this.phase * 0.5));
      this.body.position.y = -j * 0.35;
      this.armL.rotation = -2.6 + Math.sin(this.phase) * 0.2; this.armR.rotation = 2.6 - Math.sin(this.phase) * 0.2;
      this.legL.rotation = -0.3 * j; this.legR.rotation = 0.3 * j;
      this.legL.position.y = -0.78 - j * 0.35; this.legR.position.y = -0.78 - j * 0.35;
    } else {
      this.legL.rotation = s * 0.8 * amp; this.legR.rotation = -s * 0.8 * amp;
      this.armL.rotation = -s * 0.7 * amp + 0.15; this.armR.rotation = s * 0.7 * amp - 0.15;
      this.body.position.y = -Math.abs(s) * 0.07 * amp;
      this.legL.position.y = -0.78; this.legR.position.y = -0.78;
    }
    this.ring.visible = p.hasBall;
    if (p.card) {
      this.card.visible = true;
      this.card.clear().roundRect(-0.14, -0.2, 0.28, 0.4, 0.04).fill(p.card === 'red' ? 0xe53935 : 0xffd400)
        .roundRect(-0.14, -0.2, 0.28, 0.4, 0.04).stroke({ width: 0.04, color: 0x000000, alpha: 0.5 });
    } else this.card.visible = false;
  }
}

function luminance(c: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
