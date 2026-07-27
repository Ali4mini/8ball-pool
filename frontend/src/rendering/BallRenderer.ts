/**
 * Manages photorealistic 3D ball textures, dynamic ground drop shadows, 
 * Matter physics bodies, and lifecycle (creation, pocketing, respawning).
 */
import Phaser from 'phaser';
import {
  BALL_RADIUS, BALL_DIAM,
  CUE_SPOT_X, CUE_SPOT_Y,
  PLAY_T, PLAY_H, RACK_X,
} from '../gameConfig';

export interface BallData {
  number: number;
  sprite: Phaser.Physics.Matter.Image;
}

const BALL_COLORS: Record<string, string[]> = {
  classic: [
    '#ffffff', // 0: Cue
    '#f1c40f', // 1: Yellow
    '#2980b9', // 2: Blue
    '#e74c3c', // 3: Red
    '#8e44ad', // 4: Purple
    '#e67e22', // 5: Orange
    '#27ae60', // 6: Green
    '#78281f', // 7: Maroon
    '#111111', // 8: Black
    '#f1c40f', // 9: Yellow Stripe
    '#2980b9', // 10: Blue Stripe
    '#e74c3c', // 11: Red Stripe
    '#8e44ad', // 12: Purple Stripe
    '#e67e22', // 13: Orange Stripe
    '#27ae60', // 14: Green Stripe
    '#78281f', // 15: Maroon Stripe
  ],
  neon: [
    '#ffffff', '#ffff00', '#00ffff', '#ff00ff', '#ff0066', '#00ff00', '#6600ff', '#ff3300',
    '#111111', '#ffff00', '#00ffff', '#ff00ff', '#ff0066', '#00ff00', '#6600ff', '#ff3300',
  ],
};

const RACK_LAYOUT = [
  [1],
  [11, 2],
  [3, 8, 10],
  [15, 4, 14, 7],
  [5, 12, 9, 13, 6],
];

export class BallRenderer {
  private scene: Phaser.Scene;
  private ballMap: Map<number, BallData> = new Map();
  private shadowMap: Map<number, Phaser.GameObjects.Image> = new Map();
  private cueBall!: BallData;
  private ballSet: string;

  constructor(scene: Phaser.Scene, ballSet: string) {
    this.scene = scene;
    this.ballSet = ballSet;
  }

  /**
   * Generates photorealistic 3D pool ball textures and ground shadow textures procedurally.
   */
  generateTextures(): void {
    const colors = BALL_COLORS[this.ballSet] || BALL_COLORS.classic;
    const r = BALL_RADIUS;
    const d = BALL_DIAM;

    // 1. Generate Ground Shadow Texture
    this.generateShadowTexture(d);

    // 2. Generate Each Ball Texture (0 to 15)
    for (let num = 0; num <= 15; num++) {
      const textureKey = `ball_${num}`;
      if (this.scene.textures.exists(textureKey)) continue;

      const canvasTex = this.scene.textures.createCanvas(textureKey, d, d);
      if (!canvasTex) continue;

      const ctx = canvasTex.context;
      const mainColor = colors[num];

      ctx.clearRect(0, 0, d, d);

      if (num === 0) {
        // ─── CUE BALL ───────────────────────────────
        this.draw3DSphere(ctx, r, '#ffffff', '#e2e8f0', '#cbd5e1');
        // Red aim spot on cue ball
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(r + 2, r - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (num === 8) {
        // ─── 8-BALL ─────────────────────────────────
        this.draw3DSphere(ctx, r, '#333333', '#111111', '#000000');
        this.drawNumberPatch(ctx, r, '8', '#111111');
      } else if (num <= 7) {
        // ─── SOLID BALLS (1-7) ──────────────────────
        const lighterColor = this.adjustColor(mainColor, 40);
        const darkerColor = this.adjustColor(mainColor, -50);
        this.draw3DSphere(ctx, r, lighterColor, mainColor, darkerColor);
        this.drawNumberPatch(ctx, r, String(num), '#111111');
      } else {
        // ─── STRIPE BALLS (9-15) ────────────────────
        // Base 3D White Sphere
        this.draw3DSphere(ctx, r, '#ffffff', '#f1f5f9', '#cbd5e1');

        // Colored Stripe Band
        ctx.save();
        ctx.beginPath();
        ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
        ctx.clip();

        const stripeGrad = ctx.createLinearGradient(0, r - 7, 0, r + 7);
        stripeGrad.addColorStop(0, this.adjustColor(mainColor, 20));
        stripeGrad.addColorStop(0.5, mainColor);
        stripeGrad.addColorStop(1, this.adjustColor(mainColor, -40));

        ctx.fillStyle = stripeGrad;
        ctx.fillRect(0, r - 6.5, d, 13);
        ctx.restore();

        this.drawNumberPatch(ctx, r, String(num), '#111111');
      }

      // ─── TOP GLOSS SPECULAR HIGHLIGHT ─────────────
      this.drawGlossHighlight(ctx, r);

      canvasTex.refresh();
    }
  }

  /**
   * Generates a soft radial drop shadow texture
   */
  private generateShadowTexture(d: number): void {
    const key = 'ball_ground_shadow';
    if (this.scene.textures.exists(key)) return;

    const size = d + 8;
    const canvasTex = this.scene.textures.createCanvas(key, size, size);
    if (!canvasTex) return;

    const ctx = canvasTex.context;
    const center = size / 2;

    const grad = ctx.createRadialGradient(center, center, 2, center, center, size / 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    canvasTex.refresh();
  }

  /**
   * Helper: Draws a 3D volumetric sphere using radial gradients
   */
  private draw3DSphere(ctx: CanvasRenderingContext2D, r: number, lightColor: string, midColor: string, darkColor: string): void {
    // 3D volumetric shading - light source top-left
    const grad = ctx.createRadialGradient(r * 0.35, r * 0.3, r * 0.05, r * 0.45, r * 0.45, r);
    grad.addColorStop(0, lightColor);
    grad.addColorStop(0.3, lightColor);
    grad.addColorStop(0.6, midColor);
    grad.addColorStop(1, darkColor);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Subtle dark outer stroke for crisp edge
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  /**
   * Helper: Draws white center patch with crisp ball number text
   */
  private drawNumberPatch(ctx: CanvasRenderingContext2D, r: number, text: string, textColor: string): void {
    const patchR = r * 0.48;

    // White circle patch
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r, r, patchR, 0, Math.PI * 2);
    ctx.fill();

    // Crisp number text
    ctx.fillStyle = textColor;
    ctx.font = 'bold 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, r, r + 0.5);
  }

  /**
   * Helper: Top-left glossy specular shine
   */
  private drawGlossHighlight(ctx: CanvasRenderingContext2D, r: number): void {
    // Specular highlight - smaller, more focused, more transparent
    const glossGrad = ctx.createRadialGradient(r * 0.35, r * 0.3, 0.5, r * 0.35, r * 0.3, r * 0.45);
    glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    glossGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.15)');
    glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = glossGrad;
    ctx.beginPath();
    ctx.arc(r * 0.35, r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Secondary smaller bright spot
    const spotGrad = ctx.createRadialGradient(r * 0.32, r * 0.28, 0.5, r * 0.32, r * 0.28, r * 0.15);
    spotGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    spotGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.arc(r * 0.32, r * 0.28, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Color lightness adjuster helper
   */
  private adjustColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  /**
   * Create Matter physics balls and ground shadows
   */
  createBalls(): void {
    this.ballMap.clear();
    this.shadowMap.forEach(s => s.destroy());
    this.shadowMap.clear();

    const R = BALL_RADIUS;
    const D = BALL_DIAM + 0.3;
    const RS = Math.sqrt(3) * R + 0.25;
    const rackX = RACK_X;
    const centerY = PLAY_T + PLAY_H / 2;

    const positions: [number, number, number][] = [[0, CUE_SPOT_X, CUE_SPOT_Y]];
    for (let i = 0; i < RACK_LAYOUT.length; i++) {
      const row = RACK_LAYOUT[i];
      const rowX = rackX + i * RS;
      for (let j = 0; j < row.length; j++) {
        positions.push([row[j], rowX, centerY + j * D - i * R]);
      }
    }

    positions.forEach(([num, x, y]) => {
      // 1. Create Ground Shadow Sprite (rendered under balls)
      const shadow = this.scene.add.image(x + 2.5, y + 3.5, 'ball_ground_shadow');
      shadow.setDepth(1);
      this.shadowMap.set(num, shadow);

      // 2. Create Matter Physics Ball Image
      const img = this.scene.matter.add.image(x, y, `ball_${num}`, undefined, {
        shape: { type: 'circle', radius: BALL_RADIUS },
        restitution: 0.85, friction: 0.03, frictionAir: 0.025,
        frictionStatic: 0.02, density: 0.005, slop: 0.05,
        label: `ball_${num}`, isBullet: true,
        enableSleeping: true, sleepThreshold: 60,
      } as any);

      img.setDepth(2);

      const bd: BallData = { number: num, sprite: img };
      this.ballMap.set(num, bd);
      if (num === 0) this.cueBall = bd;
    });
  }

  /**
   * Call this in GameScene update() to keep ground shadows attached under balls
   */
  updateShadows(): void {
    this.ballMap.forEach((bd, num) => {
      const shadow = this.shadowMap.get(num);
      if (shadow) {
        if (bd.sprite.visible && bd.sprite.x > -50) {
          shadow.setVisible(true);
          shadow.setPosition(bd.sprite.x + 2.5, bd.sprite.y + 3.5);
        } else {
          shadow.setVisible(false);
        }
      }
    });
  }

  /** Hide and remove a pocketed ball from physics world. */
  pocketBall(num: number): void {
    const bd = this.ballMap.get(num);
    if (!bd) return;
    bd.sprite.setVisible(false);
    bd.sprite.setPosition(-100, -100);
    bd.sprite.setVelocity(0, 0);
    (bd.sprite.body as any).isStatic = true;

    const shadow = this.shadowMap.get(num);
    if (shadow) shadow.setVisible(false);

    this.ballMap.delete(num);
  }

  /** Respawn cue ball at head spot. */
  respawnCue(): void {
    let cue = this.ballMap.get(0);
    if (!cue) {
      this.createSingleCue();
      cue = this.ballMap.get(0)!;
    }
    cue.sprite.setVisible(true);
    cue.sprite.setPosition(CUE_SPOT_X, CUE_SPOT_Y);
    cue.sprite.setVelocity(0, 0);
    const rawBody = cue.sprite.body as any;
    rawBody.isStatic = false;

    const shadow = this.shadowMap.get(0);
    if (shadow) {
      shadow.setVisible(true);
      shadow.setPosition(CUE_SPOT_X + 2.5, CUE_SPOT_Y + 3.5);
    }
  }

  private createSingleCue(): void {
    const shadow = this.scene.add.image(CUE_SPOT_X + 2.5, CUE_SPOT_Y + 3.5, 'ball_ground_shadow');
    shadow.setDepth(1);
    this.shadowMap.set(0, shadow);

    const img = this.scene.matter.add.image(CUE_SPOT_X, CUE_SPOT_Y, 'ball_0', undefined, {
      shape: { type: 'circle', radius: BALL_RADIUS },
      restitution: 0.85, friction: 0.03, frictionAir: 0.025,
      frictionStatic: 0.02, density: 0.005, slop: 0.05,
      label: 'ball_0', isBullet: true,
      enableSleeping: true, sleepThreshold: 60,
    } as any);
    img.setDepth(2);

    this.cueBall = { number: 0, sprite: img };
    this.ballMap.set(0, this.cueBall);
  }

  getBall(num: number): BallData | undefined { return this.ballMap.get(num); }

  getCueBall(): BallData { return this.cueBall; }

  getCueBallSprite(): Phaser.Physics.Matter.Image { return this.cueBall?.sprite; }

  getAllBalls(): Map<number, BallData> { return this.ballMap; }

  /** Count balls of a given group still on table. */
  countByGroup(group: 'solids' | 'stripes' | null): number {
    if (!group) return 0;
    let count = 0;
    this.ballMap.forEach((bd) => {
      const n = bd.number;
      if (n === 0 || n === 8) return;
      const g = (n >= 1 && n <= 7) ? 'solids' : 'stripes';
      if (g === group) count++;
    });
    return count;
  }

  getPositionsSnapshot(): Record<string, [number, number]> {
    const pos: Record<string, [number, number]> = {};
    this.ballMap.forEach((bd) => {
      pos[String(bd.number)] = [bd.sprite.x, bd.sprite.y];
    });
    return pos;
  }

  setPositions(ballPositions: Record<string, [number, number]>): void {
    Object.entries(ballPositions).forEach(([numStr, [x, y]]) => {
      const num = parseInt(numStr, 10);
      const bd = this.ballMap.get(num);
      if (bd) {
        bd.sprite.setPosition(x, y);
        bd.sprite.setVelocity(0, 0);
      }
      const shadow = this.shadowMap.get(num);
      if (shadow) shadow.setPosition(x + 2.5, y + 3.5);
    });
  }
}
