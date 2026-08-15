/**
 * Manages photorealistic 3D ball textures, dynamic ground drop shadows,
 * Matter physics bodies, authentic 3D rolling animations, and lifecycle.
 */
import Phaser from "phaser";
import {
  BALL_RADIUS,
  BALL_DIAM,
  CUE_SPOT_X,
  CUE_SPOT_Y,
  PLAY_T,
  PLAY_H,
  RACK_X,
} from "../gameConfig";

export interface BallData {
  number: number;
  sprite: Phaser.Physics.Matter.Image;
}

export type PhysicsSnapshot = Record<
  string,
  { pos: [number, number]; vel: [number, number] }
>;

export interface RemotePlaybackDiagnostics {
  active: boolean;
  bufferedSnapshots: number;
  predictionErrorPx: number;
}

interface TimedPhysicsSnapshot {
  receivedAt: number;
  balls: PhysicsSnapshot;
}

const BALL_COLORS: Record<string, string[]> = {
  classic: [
    "#ffffff", // 0: Cue
    "#f1c40f", // 1: Yellow
    "#2980b9", // 2: Blue
    "#e74c3c", // 3: Red
    "#8e44ad", // 4: Purple
    "#e67e22", // 5: Orange
    "#27ae60", // 6: Green
    "#78281f", // 7: Maroon
    "#111111", // 8: Black
    "#f1c40f", // 9: Yellow Stripe
    "#2980b9", // 10: Blue Stripe
    "#e74c3c", // 11: Red Stripe
    "#8e44ad", // 12: Purple Stripe
    "#e67e22", // 13: Orange Stripe
    "#27ae60", // 14: Green Stripe
    "#78281f", // 15: Maroon Stripe
  ],
  neon: [
    "#ffffff",
    "#ffff00",
    "#00ffff",
    "#ff00ff",
    "#ff0066",
    "#00ff00",
    "#6600ff",
    "#ff3300",
    "#111111",
    "#ffff00",
    "#00ffff",
    "#ff00ff",
    "#ff0066",
    "#00ff00",
    "#6600ff",
    "#ff3300",
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
  private pocketedBallNumbers: Set<number> = new Set();
  private cueBall!: BallData;
  private ballSet: string;

  // The local shooter owns the Matter simulation. The other player only
  // renders a buffered stream of that simulation, so a second physics world
  // cannot fight the network corrections and produce visible stutter.
  private remotePlayback = false;
  private remoteSnapshots: TimedPhysicsSnapshot[] = [];
  private remotePredictionErrorPx = 0;
  private readonly REMOTE_INTERPOLATION_DELAY_MS = 60;
  private readonly REMOTE_MAX_EXTRAPOLATION_MS = 250;
  // Matter velocity is measured per base physics step, not per second.
  private readonly MATTER_BASE_STEP_MS = 1000 / 60;

  constructor(scene: Phaser.Scene, ballSet: string) {
    this.scene = scene;
    this.ballSet = ballSet;
  }

  generateTextures(): void {
    const colors = BALL_COLORS[this.ballSet] || BALL_COLORS.classic;
    const r = BALL_RADIUS;
    const d = BALL_DIAM;

    this.generateShadowTexture(d);

    for (let num = 0; num <= 15; num++) {
      const textureKey = `ball_${num}`;
      if (this.scene.textures.exists(textureKey)) continue;

      const canvasTex = this.scene.textures.createCanvas(textureKey, d, d);
      if (!canvasTex) continue;

      const ctx = canvasTex.context;
      const mainColor = colors[num];

      ctx.clearRect(0, 0, d, d);

      if (num === 0) {
        this.draw3DSphere(ctx, r, "#ffffff", "#e2e8f0", "#cbd5e1");
        ctx.fillStyle = "#dc2626";
        ctx.beginPath();
        ctx.arc(r + 2, r - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (num === 8) {
        this.draw3DSphere(ctx, r, "#333333", "#111111", "#000000");
        this.drawNumberPatch(ctx, r, "8", "#111111");
      } else if (num <= 7) {
        const lighterColor = this.adjustColor(mainColor, 40);
        const darkerColor = this.adjustColor(mainColor, -50);
        this.draw3DSphere(ctx, r, lighterColor, mainColor, darkerColor);
        this.drawNumberPatch(ctx, r, String(num), "#111111");
      } else {
        this.draw3DSphere(ctx, r, "#ffffff", "#f1f5f9", "#cbd5e1");

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

        this.drawNumberPatch(ctx, r, String(num), "#111111");
      }

      this.drawGlossHighlight(ctx, r);
      canvasTex.refresh();
    }
  }

  private generateShadowTexture(d: number): void {
    const key = "ball_ground_shadow";
    if (this.scene.textures.exists(key)) return;

    const size = d + 8;
    const canvasTex = this.scene.textures.createCanvas(key, size, size);
    if (!canvasTex) return;

    const ctx = canvasTex.context;
    const center = size / 2;

    const grad = ctx.createRadialGradient(
      center,
      center,
      2,
      center,
      center,
      size / 2,
    );
    grad.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    grad.addColorStop(0.5, "rgba(0, 0, 0, 0.25)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    canvasTex.refresh();
  }

  private draw3DSphere(
    ctx: CanvasRenderingContext2D,
    r: number,
    lightColor: string,
    midColor: string,
    darkColor: string,
  ): void {
    const grad = ctx.createRadialGradient(
      r * 0.35,
      r * 0.3,
      r * 0.05,
      r * 0.45,
      r * 0.45,
      r,
    );
    grad.addColorStop(0, lightColor);
    grad.addColorStop(0.3, lightColor);
    grad.addColorStop(0.6, midColor);
    grad.addColorStop(1, darkColor);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  private drawNumberPatch(
    ctx: CanvasRenderingContext2D,
    r: number,
    text: string,
    textColor: string,
  ): void {
    const patchR = r * 0.48;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(r, r, patchR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = "bold 9px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, r, r + 0.5);
  }

  private drawGlossHighlight(ctx: CanvasRenderingContext2D, r: number): void {
    const glossGrad = ctx.createRadialGradient(
      r * 0.35,
      r * 0.3,
      0.5,
      r * 0.35,
      r * 0.3,
      r * 0.45,
    );
    glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    glossGrad.addColorStop(0.3, "rgba(255, 255, 255, 0.15)");
    glossGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = glossGrad;
    ctx.beginPath();
    ctx.arc(r * 0.35, r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    const spotGrad = ctx.createRadialGradient(
      r * 0.32,
      r * 0.28,
      0.5,
      r * 0.32,
      r * 0.28,
      r * 0.15,
    );
    spotGrad.addColorStop(0, "rgba(255, 255, 255, 0.8)");
    spotGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.arc(r * 0.32, r * 0.28, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  private adjustColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    return (
      "#" +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)
    );
  }

  createBalls(): void {
    this.ballMap.clear();
    this.shadowMap.forEach((s) => s.destroy());
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
      const shadow = this.scene.add.image(
        x + 2.5,
        y + 3.5,
        "ball_ground_shadow",
      );
      shadow.setDepth(1);
      this.shadowMap.set(num, shadow);

      const img = this.scene.matter.add.image(x, y, `ball_${num}`, undefined, {
        shape: { type: "circle", radius: BALL_RADIUS },
        restitution: 0.88,
        friction: 0.015,
        frictionAir: 0.012,
        frictionStatic: 0.01,
        density: 0.005,
        slop: 0,
        label: `ball_${num}`,
        enableSleeping: false,
      } as any);
      img.setDepth(2);

      if (num !== 0) {
        img.setRotation((Phaser.Math.Between(0, 360) * Math.PI) / 180);
      }

      const bd: BallData = { number: num, sprite: img };
      this.ballMap.set(num, bd);
      if (num === 0) this.cueBall = bd;
    });
  }

  updateShadows(): void {
    this.ballMap.forEach((bd, num) => {
      const shadow = this.shadowMap.get(num);
      const sprite = bd.sprite;

      if (sprite.visible && sprite.x > -50) {
        if (shadow) {
          shadow.setVisible(true);
          shadow.setPosition(sprite.x + 2.5, sprite.y + 3.5);
        }

        const body = sprite.body as any;
        if (body && body.velocity) {
          const vx = body.velocity.x;
          const vy = body.velocity.y;
          const speed = Math.hypot(vx, vy);

          if (speed > 0.08) {
            const rollDirection = vx >= 0 ? 1 : -1;
            const rollSpeed = (speed / BALL_RADIUS) * 0.22;
            sprite.rotation += rollSpeed * rollDirection;
          }
        }
      } else if (shadow) {
        shadow.setVisible(false);
      }
    });
  }

  pocketBall(num: number): void {
    if (this.pocketedBallNumbers.has(num)) return;

    const bd = this.ballMap.get(num);
    if (!bd) return;

    this.pocketedBallNumbers.add(num);
    bd.sprite.setVisible(false);
    bd.sprite.setPosition(-100, -100);
    bd.sprite.setVelocity(0, 0);
    (bd.sprite.body as any).isStatic = true;

    const shadow = this.shadowMap.get(num);
    if (shadow) shadow.setVisible(false);

    this.ballMap.delete(num);
  }

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
    const shadow = this.scene.add.image(
      CUE_SPOT_X + 2.5,
      CUE_SPOT_Y + 3.5,
      "ball_ground_shadow",
    );
    shadow.setDepth(1);
    this.shadowMap.set(0, shadow);

    // FIXED: Unified physics parameters to match createBalls()
    const img = this.scene.matter.add.image(
      CUE_SPOT_X,
      CUE_SPOT_Y,
      "ball_0",
      undefined,
      {
        shape: { type: "circle", radius: BALL_RADIUS },
        restitution: 0.88,
        friction: 0.015,
        frictionAir: 0.012,
        frictionStatic: 0.01,
        density: 0.005,
        slop: 0,
        label: "ball_0",
        enableSleeping: false,
      } as any,
    );
    img.setDepth(2);

    this.cueBall = { number: 0, sprite: img };
    this.ballMap.set(0, this.cueBall);
  }

  getBall(num: number): BallData | undefined {
    return this.ballMap.get(num);
  }

  getCueBall(): BallData {
    return this.cueBall;
  }

  getCueBallSprite(): Phaser.Physics.Matter.Image {
    return this.cueBall?.sprite;
  }

  getAllBalls(): Map<number, BallData> {
    return this.ballMap;
  }

  countByGroup(group: "solids" | "stripes" | null): number {
    if (!group) return 0;
    let count = 0;
    this.ballMap.forEach((bd) => {
      const n = bd.number;
      if (n === 0 || n === 8) return;
      const g = n >= 1 && n <= 7 ? "solids" : "stripes";
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

  /**
   * Captures position [x, y] and velocity [vx, vy] for real-time synchronization
   */
  getPhysicsSnapshot(): Record<
    string,
    { pos: [number, number]; vel: [number, number] }
  > {
    const snapshot: Record<
      string,
      { pos: [number, number]; vel: [number, number] }
    > = {};
    this.ballMap.forEach((bd) => {
      const body = bd.sprite.body as any;
      snapshot[String(bd.number)] = {
        pos: [bd.sprite.x, bd.sprite.y],
        vel: body ? [body.velocity.x, body.velocity.y] : [0, 0],
      };
    });
    return snapshot;
  }

  /**
   * Starts display-only playback for an opponent shot. Matter bodies stay in
   * the world for rendering/collision metadata, but are made static so the
   * viewer does not run a divergent local simulation.
   */
  beginRemotePlayback(initialSnapshot?: PhysicsSnapshot): void {
    this.remotePlayback = true;
    this.remoteSnapshots = [];
    this.remotePredictionErrorPx = 0;

    this.ballMap.forEach((bd) => {
      bd.sprite.setStatic(true);
      bd.sprite.setVelocity(0, 0);
    });

    if (initialSnapshot) {
      this.remoteSnapshots.push({
        receivedAt: Date.now(),
        balls: initialSnapshot,
      });
    }
  }

  /** Returns control of the balls to the normal local Matter simulation. */
  endRemotePlayback(): void {
    if (!this.remotePlayback) return;

    this.remotePlayback = false;
    this.remoteSnapshots = [];
    this.remotePredictionErrorPx = 0;
    this.ballMap.forEach((bd) => {
      bd.sprite.setStatic(false);
      bd.sprite.setVelocity(0, 0);
    });
  }

  /**
   * Queues a shooter tick. The tick is rendered slightly in the past so two
   * adjacent network samples can be blended instead of snapping between them.
   */
  applyPhysicsSnapshot(snapshot: PhysicsSnapshot): void {
    if (!this.remotePlayback) {
      this.applyPhysicsSnapshotImmediately(snapshot);
      return;
    }

    const receivedAt = Date.now();
    const previousSnapshot = this.remoteSnapshots.at(-1);
    this.remotePredictionErrorPx = previousSnapshot
      ? this.measureSnapshotPredictionError(previousSnapshot, snapshot, receivedAt)
      : 0;

    this.remoteSnapshots.push({
      receivedAt,
      balls: snapshot,
    });

    // A shooter snapshot contains every ball that is still in play. Removing
    // missing balls here keeps the viewer in sync even before shot_result.
    const presentBalls = new Set(Object.keys(snapshot));
    this.ballMap.forEach((_, num) => {
      if (!presentBalls.has(String(num))) this.pocketBall(num);
    });

    // The scene coalesces inbound bursts before calling this method. Two
    // samples are sufficient for interpolation; retaining older snapshots
    // would replay stale network state after a delivery stall.
    if (this.remoteSnapshots.length > 2) this.remoteSnapshots.shift();
  }

  /** Advances the display-only remote playback once per render frame. */
  updateRemotePlayback(now = Date.now()): void {
    if (!this.remotePlayback || this.remoteSnapshots.length === 0) return;

    const renderAt = now - this.REMOTE_INTERPOLATION_DELAY_MS;

    // Discard samples that are fully behind the render point, retaining the
    // latest one as the interpolation source.
    while (
      this.remoteSnapshots.length >= 2 &&
      this.remoteSnapshots[1].receivedAt <= renderAt
    ) {
      this.remoteSnapshots.shift();
    }

    const from = this.remoteSnapshots[0];
    const to = this.remoteSnapshots[1];
    let alpha = 0;
    if (to) {
      const duration = to.receivedAt - from.receivedAt;
      alpha = duration > 0 ? (renderAt - from.receivedAt) / duration : 1;
      alpha = Math.max(0, Math.min(1, alpha));
    }

    this.ballMap.forEach((bd) => {
      const key = String(bd.number);
      const fromBall = from.balls[key];
      if (!fromBall) return;

      const toBall = to?.balls[key] || fromBall;
      const vx = fromBall.vel[0] + (toBall.vel[0] - fromBall.vel[0]) * alpha;
      const vy = fromBall.vel[1] + (toBall.vel[1] - fromBall.vel[1]) * alpha;

      let x = fromBall.pos[0] + (toBall.pos[0] - fromBall.pos[0]) * alpha;
      let y = fromBall.pos[1] + (toBall.pos[1] - fromBall.pos[1]) * alpha;

      // If packets arrive late, keep the motion alive briefly using the last
      // authoritative velocity rather than freezing until the next packet.
      if (!to && renderAt > from.receivedAt) {
        const elapsedSteps =
          Math.min(
            renderAt - from.receivedAt,
            this.REMOTE_MAX_EXTRAPOLATION_MS,
          ) / this.MATTER_BASE_STEP_MS;
        x = fromBall.pos[0] + fromBall.vel[0] * elapsedSteps;
        y = fromBall.pos[1] + fromBall.vel[1] * elapsedSteps;
      }

      bd.sprite.setPosition(x, y);
      bd.sprite.setVelocity(vx, vy);
    });
  }

  getRemotePlaybackDiagnostics(): RemotePlaybackDiagnostics {
    return {
      active: this.remotePlayback,
      bufferedSnapshots: this.remoteSnapshots.length,
      predictionErrorPx: this.remotePredictionErrorPx,
    };
  }

  private measureSnapshotPredictionError(
    previousSnapshot: TimedPhysicsSnapshot,
    nextSnapshot: PhysicsSnapshot,
    receivedAt: number,
  ): number {
    const elapsedSteps =
      (receivedAt - previousSnapshot.receivedAt) / this.MATTER_BASE_STEP_MS;
    let largestError = 0;

    Object.entries(nextSnapshot).forEach(([num, nextBall]) => {
      const previousBall = previousSnapshot.balls[num];
      if (!previousBall) return;

      const expectedX =
        previousBall.pos[0] + previousBall.vel[0] * elapsedSteps;
      const expectedY =
        previousBall.pos[1] + previousBall.vel[1] * elapsedSteps;
      largestError = Math.max(
        largestError,
        Math.hypot(nextBall.pos[0] - expectedX, nextBall.pos[1] - expectedY),
      );
    });

    return largestError;
  }

  private applyPhysicsSnapshotImmediately(snapshot: PhysicsSnapshot): void {
    Object.entries(snapshot).forEach(([numStr, data]) => {
      const num = parseInt(numStr, 10);
      const bd = this.ballMap.get(num);
      if (bd && bd.sprite.visible) {
        bd.sprite.setPosition(data.pos[0], data.pos[1]);
        bd.sprite.setVelocity(data.vel[0], data.vel[1]);

        const shadow = this.shadowMap.get(num);
        if (shadow) {
          shadow.setPosition(data.pos[0] + 2.5, data.pos[1] + 3.5);
        }
      }
    });
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
