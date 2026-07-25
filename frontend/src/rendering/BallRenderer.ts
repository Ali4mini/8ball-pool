/**
 * Manages ball textures, Matter physics bodies, and lifecycle
 * (creation, pocketing, respawning, position snapshots).
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

const BALL_COLORS: Record<string, number[]> = {
  classic: [0xffffff, 0xf1c40f, 0x0000ff, 0xff0000, 0x800080, 0xff8c00, 0x006400, 0x8b0000,
            0x111111, 0xf1c40f, 0x0000ff, 0xff0000, 0x800080, 0xff8c00, 0x006400, 0x8b0000],
  neon: [0xffffff, 0xffff00, 0x00ffff, 0xff00ff, 0xff0066, 0x00ff00, 0x6600ff, 0xff3300,
         0x000000, 0xffff00, 0x00ffff, 0xff00ff, 0xff0066, 0x00ff00, 0x6600ff, 0xff3300],
  gold: [0xffffff, 0xffd700, 0xdaa520, 0xb8860b, 0xcd950c, 0xcd9b1d, 0x8b6508, 0x8b6914,
         0x111111, 0xffd700, 0xdaa520, 0xb8860b, 0xcd950c, 0xcd9b1d, 0x8b6508, 0x8b6914],
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
  private cueBall!: BallData;
  private ballSet: string;

  constructor(scene: Phaser.Scene, ballSet: string) {
    this.scene = scene;
    this.ballSet = ballSet;
  }

  /** Generate ball textures once. Call before createBalls(). */
  generateTextures(): void {
    const colors = BALL_COLORS[this.ballSet] || BALL_COLORS.classic;
    const r = BALL_RADIUS;
    const d = BALL_DIAM;

    for (let num = 0; num <= 15; num++) {
      const gfx = this.scene.add.graphics();
      const color = num === 0 ? 0xffffff : (num === 8 ? 0x111111 : colors[num]);

      // Drop shadow
      gfx.fillStyle(0x000000, 0.25);
      gfx.fillCircle(r + 1, r + 2, r);

      if (num === 0) {
        gfx.fillStyle(0xffffff, 1); gfx.fillCircle(r, r, r);
        gfx.fillStyle(0xf0f0f0, 0.6); gfx.fillCircle(r - 2, r - 2, r * 0.5);
        gfx.lineStyle(1, 0xcccccc, 0.4); gfx.strokeCircle(r, r, r);
      } else if (num === 8) {
        gfx.fillStyle(0x1a1a1a, 1); gfx.fillCircle(r, r, r);
        gfx.fillStyle(0xffffff, 1); gfx.fillCircle(r, r, 5);
        gfx.fillStyle(0x111111, 1); gfx.fillCircle(r, r, 3);
        gfx.fillStyle(0xffffff, 0.3); gfx.fillCircle(r - 2, r - 2, 3);
      } else if (num <= 7) {
        gfx.fillStyle(color, 1); gfx.fillCircle(r, r, r);
        gfx.fillStyle(0xffffff, 0.25); gfx.fillCircle(r - 3, r - 3, r * 0.4);
        gfx.fillStyle(0xffffff, 0.85); gfx.fillCircle(r, r, 4);
      } else {
        gfx.fillStyle(0xffffff, 1); gfx.fillCircle(r, r, r);
        gfx.lineStyle(r * 0.55, color, 1);
        gfx.beginPath(); gfx.moveTo(0, r); gfx.lineTo(d, r); gfx.strokePath();
        gfx.lineStyle(r * 0.4, color, 0.6);
        gfx.beginPath(); gfx.moveTo(0, r * 0.6); gfx.lineTo(d, r * 0.6);
        gfx.moveTo(0, r * 1.4); gfx.lineTo(d, r * 1.4); gfx.strokePath();
        gfx.fillStyle(0xffffff, 0.2); gfx.fillCircle(r - 3, r - 3, r * 0.35);
        gfx.fillStyle(0xffffff, 0.85); gfx.fillCircle(r, r, 4);
      }

      gfx.generateTexture(`ball_${num}`, d + 2, d + 4);
      gfx.destroy();
    }
  }

  /** Create Matter physics balls with visuals at default rack positions. */
  createBalls(): void {
    this.ballMap.clear();
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
      const img = this.scene.matter.add.image(x, y, `ball_${num}`, undefined, {
        shape: { type: 'circle', radius: BALL_RADIUS },
        restitution: 0.9, friction: 0.02, frictionAir: 0.015,
        frictionStatic: 0.01, density: 0.005, slop: 0.05,
        label: `ball_${num}`, isBullet: true,
        enableSleeping: false, sleepThreshold: Infinity,
      } as any);

      const bd: BallData = { number: num, sprite: img };
      this.ballMap.set(num, bd);
      if (num === 0) this.cueBall = bd;
    });
  }

  /** Hide and remove a pocketed ball from the physics world. */
  pocketBall(num: number): void {
    const bd = this.ballMap.get(num);
    if (!bd) return;
    bd.sprite.setVisible(false);
    bd.sprite.setPosition(-100, -100);
    bd.sprite.setVelocity(0, 0);
    (bd.sprite.body as any).isStatic = true;
    this.ballMap.delete(num);
  }

  /** Respawn cue ball at head spot (after scratch). */
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
  }

  private createSingleCue(): void {
    const img = this.scene.matter.add.image(CUE_SPOT_X, CUE_SPOT_Y, 'ball_0', undefined, {
      shape: { type: 'circle', radius: BALL_RADIUS },
      restitution: 0.9, friction: 0.02, frictionAir: 0.015,
      frictionStatic: 0.01, density: 0.005, slop: 0.05,
      label: 'ball_0', isBullet: true,
    } as any);
    this.cueBall = { number: 0, sprite: img };
    this.ballMap.set(0, this.cueBall);
  }

  getBall(num: number): BallData | undefined { return this.ballMap.get(num); }

  getCueBall(): BallData { return this.cueBall; }

  getCueBallSprite(): Phaser.Physics.Matter.Image { return this.cueBall?.sprite; }

  getAllBalls(): Map<number, BallData> { return this.ballMap; }

  /** Count balls of a given group still on the table. */
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

  /** Snapshot of current ball positions for sending to server. */
  getPositionsSnapshot(): Record<string, [number, number]> {
    const pos: Record<string, [number, number]> = {};
    this.ballMap.forEach((bd) => {
      pos[String(bd.number)] = [bd.sprite.x, bd.sprite.y];
    });
    return pos;
  }

  /** Teleport balls to server-provided positions. */
  setPositions(ballPositions: Record<string, [number, number]>): void {
    Object.entries(ballPositions).forEach(([numStr, [x, y]]) => {
      const num = parseInt(numStr, 10);
      const bd = this.ballMap.get(num);
      if (bd) {
        bd.sprite.setPosition(x, y);
        bd.sprite.setVelocity(0, 0);
      }
    });
  }
}
