import Phaser from "phaser";

export type RollingModel = "baseline" | "displacement" | "directional";

export const ROLLING_MODEL_LABELS: Record<RollingModel, string> = {
  baseline: "Scalar rotation (baseline)",
  displacement: "Displacement marker",
  directional: "Directional surface (recommended)",
};

export interface RollingBallOptions {
  radius?: number;
  color?: number;
  number?: string;
}

/**
 * A renderer-only ball. It accepts travelled movement, not a physics body,
 * which makes it suitable for simulations, recorded trajectories and the lab.
 */
export class RollingBall {
  readonly container: Phaser.GameObjects.Container;
  private readonly radius: number;
  private readonly ball: Phaser.GameObjects.Graphics;
  private readonly surface: Phaser.GameObjects.Graphics;
  private readonly numberText: Phaser.GameObjects.Text;
  private distance = 0;
  private visualRotation = 0;
  private heading = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, options: RollingBallOptions = {}) {
    this.radius = options.radius ?? 86;
    const color = options.color ?? 0x1677c8;
    this.container = scene.add.container(x, y);

    const shadow = scene.add.ellipse(x + 8, y + this.radius * 0.88, this.radius * 1.7, this.radius * 0.42, 0x000000, 0.35);
    shadow.setDepth(0);

    this.ball = scene.add.graphics();
    this.surface = scene.add.graphics();
    this.numberText = scene.add.text(0, 0, options.number ?? "8", {
      color: "#111827",
      fontFamily: "Arial, sans-serif",
      fontSize: `${Math.round(this.radius * 0.45)}px`,
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.container.add([this.ball, this.surface, this.numberText]);
    this.container.setDepth(2);
    this.drawBase(color);
    this.drawSurface("directional");
  }

  reset(): void {
    this.distance = 0;
    this.visualRotation = 0;
    this.heading = 0;
    this.container.setRotation(0);
    this.drawSurface("directional");
  }

  /** Advance the visual by a movement delta. Stationary deltas do nothing. */
  update(dx: number, dy: number, model: RollingModel): void {
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) return;
    this.distance += distance;
    this.heading = Math.atan2(dy, dx);

    if (model === "baseline") {
      this.visualRotation += (distance / this.radius) * Math.cos(this.heading - Math.PI / 8);
      this.container.setRotation(this.visualRotation);
    } else {
      this.container.setRotation(0);
    }
    this.drawSurface(model);
  }

  private drawBase(color: number): void {
    const r = this.radius;
    this.ball.clear();
    this.ball.fillStyle(0x07111f, 0.5).fillCircle(5, 7, r + 2);
    this.ball.fillStyle(color, 1).fillCircle(0, 0, r);
    this.ball.fillStyle(0xffffff, 0.14).fillCircle(-r * 0.28, -r * 0.3, r * 0.72);
    this.ball.lineStyle(2, 0x06101d, 0.5).strokeCircle(0, 0, r);
    this.ball.fillStyle(0xffffff, 0.7).fillCircle(-r * 0.32, -r * 0.38, r * 0.12);
  }

  private drawSurface(model: RollingModel): void {
    const r = this.radius;
    const phase = this.distance / r;
    this.surface.clear();
    this.numberText.setPosition(0, 0).setScale(1).setRotation(0);

    if (model === "baseline") {
      this.numberText.setPosition(r * 0.1, -r * 0.02);
      return;
    }

    if (model === "displacement") {
      const marker = Math.sin(phase) * r * 0.52;
      this.numberText.setPosition(marker, -r * 0.04);
      this.numberText.setScale(Math.max(0.16, Math.cos(phase)) , 1);
      this.surface.lineStyle(3, 0xffffff, 0.28).lineBetween(marker, -r * 0.65, marker, r * 0.65);
      return;
    }

    // The apparent equator is perpendicular to travel. Its changing width,
    // plus the patch crossing the surface, gives a lightweight pseudo-3D cue.
    const width = Math.max(3, Math.abs(Math.cos(phase)) * r * 1.7);
    this.surface.setRotation(this.heading + Math.PI / 2);
    this.surface.lineStyle(4, 0xf8fafc, 0.62).strokeEllipse(0, 0, width, r * 1.65);
    this.surface.lineStyle(2, 0x06101d, 0.25).strokeEllipse(0, 0, width * 0.72, r * 1.7);
    this.surface.setRotation(0);
    this.numberText.setPosition(Math.sin(phase) * r * 0.48, -r * 0.03);
    this.numberText.setScale(Math.max(0.18, Math.abs(Math.cos(phase))), 1);
  }
}
