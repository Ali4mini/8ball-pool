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
import {
  buildTrajectoryFrame,
  sampleTrajectory,
  TrajectoryFrame,
} from "../utils/trajectory";
import { RollingBall } from "./RollingBall";

export interface BallData {
  number: number;
  sprite: Phaser.Physics.Matter.Image;
  visual: RollingBall;
}

export interface RemotePlaybackDiagnostics {
  active: boolean;
  bufferedFrames: number;
  progressMs: number;
  finished: boolean;
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
  // renders a recorded trajectory once it has fully arrived, so playback is
  // purely local and time-based — no network jitter can reach the animation.
  private remotePlayback = false;
  private trajectoryFrames: TrajectoryFrame[] = [];
  private replayActive = false;
  private replayStartedAt = 0;
  private replayProgressMs = 0;
  private replayFinished = false;

  // Last rendered positions used to make rotation proportional to actual
  // movement rather than to render frequency or reported velocity.
  private previousRenderPositions = new Map<number, { x: number; y: number }>();
  private readonly TELEPORT_DISTANCE = BALL_RADIUS * 4;

  // Shooter-side trajectory recording (drained into network chunks).
  private trajectoryRecording = false;
  private recordedFrames: TrajectoryFrame[] = [];
  // Capture at ~30 Hz; the viewer interpolates back up to 60 FPS on playback.
  private readonly TRAJECTORY_RECORD_INTERVAL_MS = 33;

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
        const lighterColor = this.adjustColor(mainColor, 40);
        const darkerColor = this.adjustColor(mainColor, -50);
        this.draw3DSphere(ctx, r, lighterColor, mainColor, darkerColor);

        ctx.save();
        ctx.beginPath();
        ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
        ctx.clip();

        const stripeGrad = ctx.createLinearGradient(0, r - 7, 0, r + 7);
        stripeGrad.addColorStop(0, "#ffffff");
        stripeGrad.addColorStop(0.5, "#f8fafc");
        stripeGrad.addColorStop(1, "#dbe3ed");

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
    this.previousRenderPositions.clear();
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
      img.setAlpha(0);

      const visual = this.createVisualBall(num, x, y);

      const bd: BallData = { number: num, sprite: img, visual };
      this.ballMap.set(num, bd);
      this.previousRenderPositions.set(num, { x, y });
      if (num === 0) this.cueBall = bd;
    });
  }

  updateShadows(): void {
    this.ballMap.forEach((bd, num) => {
      const shadow = this.shadowMap.get(num);
      const sprite = bd.sprite;

      if (bd.visual.container.visible && sprite.x > -50) {
        const previous = this.previousRenderPositions.get(num);
        const dx = previous ? sprite.x - previous.x : 0;
        const dy = previous ? sprite.y - previous.y : 0;
        const distance = Math.hypot(dx, dy);
        this.previousRenderPositions.set(num, { x: sprite.x, y: sprite.y });
        bd.visual.container.setPosition(sprite.x, sprite.y);
        bd.visual.container.setVisible(true);

        if (shadow) {
          shadow.setVisible(true);
          shadow.setPosition(sprite.x + 2.5, sprite.y + 3.5);
        }

        // A large jump is a reposition/teleport (for example a safety
        // correction outside the table), not a travelled rolling distance.
        if (distance <= this.TELEPORT_DISTANCE) {
          bd.visual.update(dx, dy, "directional");
        } else {
          bd.visual.reset();
        }
      } else if (shadow) {
        shadow.setVisible(false);
        bd.visual.container.setVisible(false);
        this.previousRenderPositions.delete(num);
      }
    });
  }

  pocketBall(num: number): void {
    if (this.pocketedBallNumbers.has(num)) return;

    const bd = this.ballMap.get(num);
    if (!bd) return;

    this.pocketedBallNumbers.add(num);
    bd.sprite.setVisible(false);
    bd.visual.container.setVisible(false);
    bd.sprite.setPosition(-100, -100);
    bd.sprite.setVelocity(0, 0);
    (bd.sprite.body as any).isStatic = true;

    const shadow = this.shadowMap.get(num);
    if (shadow) shadow.setVisible(false);

    this.ballMap.delete(num);
    this.previousRenderPositions.delete(num);
  }

  respawnCue(): void {
    let cue = this.ballMap.get(0);
    if (!cue) {
      this.createSingleCue();
      cue = this.ballMap.get(0)!;
    }
    cue.sprite.setVisible(true);
    cue.sprite.setAlpha(0);
    cue.visual.container.setVisible(true);
    cue.sprite.setPosition(CUE_SPOT_X, CUE_SPOT_Y);
    cue.visual.container.setPosition(CUE_SPOT_X, CUE_SPOT_Y);
    cue.visual.reset();
    cue.sprite.setVelocity(0, 0);
    const rawBody = cue.sprite.body as any;
    rawBody.isStatic = false;
    this.previousRenderPositions.set(0, {
      x: CUE_SPOT_X,
      y: CUE_SPOT_Y,
    });

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

    img.setAlpha(0);
    const visual = this.createVisualBall(0, CUE_SPOT_X, CUE_SPOT_Y);
    this.cueBall = { number: 0, sprite: img, visual };
    this.ballMap.set(0, this.cueBall);
    this.previousRenderPositions.set(0, {
      x: CUE_SPOT_X,
      y: CUE_SPOT_Y,
    });
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

  private createVisualBall(num: number, x: number, y: number): RollingBall {
    const colors = BALL_COLORS[this.ballSet] || BALL_COLORS.classic;
    const color = parseInt(colors[num].replace("#", ""), 16);
    return new RollingBall(this.scene, x, y, {
      radius: BALL_RADIUS,
      color,
      number: num === 0 ? "" : String(num),
      striped: num >= 9,
      showShadow: false,
    });
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

  // ═══════════════════════════════════════════════════════════
  //  TRAJECTORY RECORDING (shooter side)
  // ═══════════════════════════════════════════════════════════

  beginTrajectoryRecording(): void {
    this.trajectoryRecording = true;
    this.recordedFrames = [];
  }

  /** Captures one compact frame per local simulation tick. */
  recordTrajectoryFrame(tMs: number): void {
    if (!this.trajectoryRecording) return;
    const lastT =
      this.recordedFrames.length > 0
        ? this.recordedFrames[this.recordedFrames.length - 1].t
        : Number.NEGATIVE_INFINITY;
    if (tMs - lastT < this.TRAJECTORY_RECORD_INTERVAL_MS) return;
    this.recordedFrames.push(
      buildTrajectoryFrame(tMs, this.getPositionsSnapshot()),
    );
  }

  /** Returns every frame recorded since the last call (and clears them). */
  takeTrajectoryChunk(): TrajectoryFrame[] {
    const chunk = this.recordedFrames;
    this.recordedFrames = [];
    return chunk;
  }

  endTrajectoryRecording(): void {
    this.trajectoryRecording = false;
  }

  // ═══════════════════════════════════════════════════════════
  //  TRAJECTORY REPLAY (viewer side)
  // ═══════════════════════════════════════════════════════════

  /**
   * Prepares display-only playback for an opponent shot. Matter bodies stay in
   * the world for rendering/collision metadata, but are made static so the
   * viewer does not run a divergent local simulation. Nothing animates until
   * the full trajectory has been buffered and startRemoteReplay() is called.
   */
  beginRemotePlayback(): void {
    this.remotePlayback = true;
    this.trajectoryFrames = [];
    this.replayActive = false;
    this.replayStartedAt = 0;
    this.replayProgressMs = 0;
    this.replayFinished = false;

    this.ballMap.forEach((bd) => {
      bd.sprite.setStatic(true);
      bd.sprite.setVelocity(0, 0);
      this.previousRenderPositions.set(bd.number, {
        x: bd.sprite.x,
        y: bd.sprite.y,
      });
    });
  }

  /** Buffers trajectory frames as they arrive. TCP ordering guarantees order. */
  appendTrajectoryChunk(frames: TrajectoryFrame[]): void {
    if (!this.remotePlayback || frames.length === 0) return;
    this.trajectoryFrames.push(...frames);
  }

  /** Begins time-based replay. Returns false if the trajectory is not ready. */
  startRemoteReplay(nowMs: number): boolean {
    if (
      !this.remotePlayback ||
      this.replayActive ||
      this.trajectoryFrames.length === 0
    ) {
      return false;
    }
    this.replayActive = true;
    this.replayStartedAt = nowMs;
    this.replayFinished = false;
    return true;
  }

  isRemoteReplayFinished(): boolean {
    return this.replayActive && this.replayFinished;
  }

  /** Returns control of the balls to the normal local Matter simulation. */
  endRemotePlayback(): void {
    if (!this.remotePlayback) return;

    this.remotePlayback = false;
    this.trajectoryFrames = [];
    this.replayActive = false;
    this.replayStartedAt = 0;
    this.replayProgressMs = 0;
    this.replayFinished = false;

    this.ballMap.forEach((bd) => {
      bd.sprite.setStatic(false);
      bd.sprite.setVelocity(0, 0);
      this.previousRenderPositions.set(bd.number, {
        x: bd.sprite.x,
        y: bd.sprite.y,
      });
    });
  }

  /** Advances the display-only remote replay once per render frame. */
  updateRemotePlayback(now = Date.now()): void {
    if (!this.remotePlayback || !this.replayActive) return;

    const elapsed = now - this.replayStartedAt;
    const sampled = sampleTrajectory(this.trajectoryFrames, elapsed);
    this.replayProgressMs = elapsed;
    this.replayFinished = sampled.finished;

    // Any ball absent from the current frame was pocketed. Hiding here keeps
    // the viewer in sync with the recorded trajectory in real time.
    const presentBalls = new Set(sampled.balls.map((b) => b.num));
    this.ballMap.forEach((bd) => {
      if (!presentBalls.has(bd.number)) this.pocketBall(bd.number);
    });

    sampled.balls.forEach((b) => {
      const bd = this.ballMap.get(b.num);
      if (!bd) return;
      bd.sprite.setPosition(b.x, b.y);
      bd.sprite.setVelocity(b.vx, b.vy);
    });
  }

  getRemotePlaybackDiagnostics(): RemotePlaybackDiagnostics {
    return {
      active: this.remotePlayback,
      bufferedFrames: this.trajectoryFrames.length,
      progressMs: this.replayProgressMs,
      finished: this.replayFinished,
    };
  }

  setPositions(ballPositions: Record<string, [number, number]>): void {
    Object.entries(ballPositions).forEach(([numStr, [x, y]]) => {
      const num = parseInt(numStr, 10);
      const bd = this.ballMap.get(num);
      if (bd) {
        bd.sprite.setPosition(x, y);
        bd.sprite.setVelocity(0, 0);
        bd.visual.container.setPosition(x, y);
        bd.visual.reset();
        this.previousRenderPositions.set(num, { x, y });
      }
      const shadow = this.shadowMap.get(num);
      if (shadow) shadow.setPosition(x + 2.5, y + 3.5);
    });
  }
}
