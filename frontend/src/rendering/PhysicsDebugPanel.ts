/**
 * Physics debug overlay — press D to toggle.
 * Allows live tweaking of Matter.js physics parameters (friction, restitution, etc.)
 */
import Phaser from 'phaser';
import { BallRenderer } from './BallRenderer';

interface ParamDef {
  key: string;
  label: string;
  val: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}

export class PhysicsDebugPanel {
  private scene: Phaser.Scene;
  private visible = false;
  private bg!: Phaser.GameObjects.Graphics;
  private elements: Phaser.GameObjects.GameObject[] = [];

  /** Callback invoked when a ball physics param changes. */
  onApplyBall: (key: string, val: number) => void = () => {};
  /** Callback invoked when a wall physics param changes. */
  onApplyWall: (key: string, val: number) => void = () => {};
  /** Callback invoked when settle speed changes. */
  onApplySettle: (val: number) => void = () => {};

  private ballParams: ParamDef[] = [
    { key: 'frictionAir', label: 'Air drag', val: 0.012, min: 0.001, max: 0.05, step: 0.001, fmt: v => v.toFixed(3) },
    { key: 'restitution', label: 'Restitution', val: 0.88, min: 0.3, max: 1.0, step: 0.05, fmt: v => v.toFixed(2) },
    { key: 'friction', label: 'Friction', val: 0.015, min: 0.001, max: 0.15, step: 0.002, fmt: v => v.toFixed(3) },
    { key: 'density', label: 'Density', val: 0.005, min: 0.001, max: 0.02, step: 0.001, fmt: v => v.toFixed(3) },
    { key: 'slop', label: 'Slop', val: 0, min: 0, max: 1.0, step: 0.05, fmt: v => v.toFixed(2) },
  ];
  private wallParams: ParamDef[] = [
    { key: 'restitution', label: 'Cushion rest', val: 0.85, min: 0.3, max: 1.0, step: 0.05, fmt: v => v.toFixed(2) },
    { key: 'friction', label: 'Cushion fric', val: 0.05, min: 0.01, max: 0.3, step: 0.01, fmt: v => v.toFixed(2) },
  ];
  private sysParams: ParamDef[] = [
    { key: 'settleSpeed', label: 'Settle Spd', val: 0.8, min: 0.1, max: 10, step: 0.2, fmt: v => v.toFixed(1) },
  ];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.build();
    scene.input.keyboard!.on('keydown-D', () => this.toggle());
  }

  private build(): void {
    const { width } = this.scene.scale;
    const px = width - 260, py = 50;

    this.bg = this.scene.add.graphics().setDepth(100).setVisible(false);
    const title = this.scene.add.text(px + 10, py + 6, '⚙ Physics Tweak (D)', {
      fontSize: '13px', fontFamily: 'monospace', color: '#ff8800',
    }).setDepth(101).setVisible(false);
    this.elements.push(title);

    let yy = py + 30;
    const all = [...this.ballParams, ...this.wallParams, ...this.sysParams];

    for (const p of all) {
      const label = this.scene.add.text(px + 10, yy, p.label, {
        fontSize: '12px', fontFamily: 'monospace', color: '#aaa',
      }).setDepth(102).setVisible(false);
      const dec = this.makeBtn('◀', px + 140, yy - 1, () => this.adjust(p, -p.step));
      const val = this.scene.add.text(px + 165, yy, p.fmt(p.val), {
        fontSize: '12px', fontFamily: 'monospace', color: '#fff',
      }).setDepth(102).setVisible(false);
      const inc = this.makeBtn('▶', px + 215, yy - 1, () => this.adjust(p, p.step));
      this.elements.push(label, val, dec, inc);
      yy += 22;
    }

    yy += 4;
    const reset = this.makeBtn('↺ Reset', px + 10, yy, () => this.resetAll());
    reset.setStyle({ fontSize: '12px', fontFamily: 'monospace', color: '#ff6644', backgroundColor: '#442222', padding: { x: 8, y: 3 } } as any);
    const close = this.makeBtn('✕ Hide', px + 150, yy, () => this.toggle());
    close.setStyle({ fontSize: '12px', fontFamily: 'monospace', color: '#888', backgroundColor: '#222', padding: { x: 8, y: 3 } } as any);
    this.elements.push(reset, close);
  }

  private makeBtn(text: string, x: number, y: number, cb: () => void): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, text, {
      fontSize: '14px', fontFamily: 'monospace', color: '#ccc',
      backgroundColor: '#333', padding: { x: 5, y: 2 },
    }).setDepth(102).setInteractive({ useHandCursor: true }).setVisible(false);
    t.on('pointerdown', cb);
    return t;
  }

  private adjust(p: ParamDef, delta: number): void {
    p.val = Math.max(p.min, Math.min(p.max, +(p.val + delta).toFixed(4)));
    this.apply(p);
    this.refresh();
  }

  private apply(p: ParamDef): void {
    if (this.ballParams.includes(p)) this.onApplyBall(p.key, p.val);
    else if (this.wallParams.includes(p)) this.onApplyWall(p.key, p.val);
    else if (p.key === 'settleSpeed') this.onApplySettle(p.val);
  }

  private resetAll(): void {
    const ballDefaults: Record<string, number> = { frictionAir: 0.012, restitution: 0.88, friction: 0.015, density: 0.005, slop: 0 };
    const wallDefaults: Record<string, number> = { restitution: 0.85, friction: 0.05 };
    for (const d of this.ballParams) { d.val = ballDefaults[d.key]; this.onApplyBall(d.key, d.val); }
    for (const d of this.wallParams) { d.val = wallDefaults[d.key]; this.onApplyWall(d.key, d.val); }
    for (const d of this.sysParams) { d.val = 0.8; if (d.key === 'settleSpeed') this.onApplySettle(0.8); }
    this.refresh();
  }

  resetDefaults(): void { this.resetAll(); }

  private refresh(): void {
    let idx = 0;
    const all = [...this.ballParams, ...this.wallParams, ...this.sysParams];
    // In the flat array: title, then groups of [label, dec, valText, inc]
    for (const p of all) {
      const valText = this.elements[idx * 4 + 2];
      if (valText) (valText as Phaser.GameObjects.Text).setText(p.fmt(p.val));
      idx++;
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    for (const el of this.elements) (el as any).setVisible(this.visible);
    if (this.visible) this.drawBg();
  }

  setVisible(visible: boolean): void {
    if (this.visible !== visible) this.toggle();
  }

  isVisible(): boolean { return this.visible; }

  private drawBg(): void {
    const { width } = this.scene.scale;
    this.bg.clear();
    this.bg.fillStyle(0x111111, 0.85);
    this.bg.fillRoundedRect(width - 260, 46, 245, this.elements.length * 22 / 4 + 50, 6);
    this.bg.lineStyle(1, 0xff8800, 0.4);
    this.bg.strokeRoundedRect(width - 260, 46, 245, this.elements.length * 22 / 4 + 50, 6);
    this.bg.setVisible(true);
  }
}
