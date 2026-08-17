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
  striped?: boolean;
  showShadow?: boolean;
}

/**
 * A renderer-only ball. It accepts travelled movement, not a physics body,
 * which makes it suitable for simulations, recorded trajectories and the lab.
 */
export class RollingBall {
  readonly container: Phaser.GameObjects.Container;
  private radius: number;
  private readonly color: number;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly ball: Phaser.GameObjects.Graphics;
  private readonly surface: Phaser.GameObjects.Graphics;
  private readonly numberPatch: Phaser.GameObjects.Graphics;
  private readonly numberText: Phaser.GameObjects.Text;
  private distance = 0;
  private visualRotation = 0;
  private heading = 0;
  private striped: boolean;
  private model: RollingModel = "directional";
  private readonly hasNumber: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, options: RollingBallOptions = {}) {
    this.radius = options.radius ?? 86;
    this.color = options.color ?? 0x1677c8;
    this.striped = options.striped ?? false;
    this.hasNumber = (options.number ?? "8").length > 0;
    this.container = scene.add.container(x, y);

    this.shadow = scene.add.ellipse(8, this.radius * 0.88, this.radius * 1.7, this.radius * 0.42, 0x000000, 0.35);
    this.shadow.setDepth(0);
    this.shadow.setVisible(options.showShadow ?? true);

    this.ball = scene.add.graphics();
    this.surface = scene.add.graphics();
    this.numberPatch = scene.add.graphics();
    this.numberText = scene.add.text(0, 0, options.number ?? "8", {
      color: "#111827",
      fontFamily: "Arial, sans-serif",
      fontSize: `${Math.round(this.radius * 0.45)}px`,
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.numberText.setVisible(this.hasNumber);
    this.container.add([this.shadow, this.ball, this.surface, this.numberPatch, this.numberText]);
    this.container.setDepth(2);
    this.drawBase();
    this.drawSurface(this.model);
  }

  reset(): void {
    this.distance = 0;
    this.visualRotation = 0;
    this.heading = 0;
    this.container.setRotation(0);
    this.drawSurface(this.model);
  }

  setRadius(radius: number): void {
    this.radius = Phaser.Math.Clamp(radius, 48, 120);
    this.shadow
      .setPosition(8, this.radius * 0.88)
      .setSize(this.radius * 1.7, this.radius * 0.42);
    this.numberText.setFontSize(`${Math.round(this.radius * 0.45)}px`);
    this.drawBase();
    this.drawSurface(this.model);
  }

  setStriped(striped: boolean): void {
    this.striped = striped;
    this.drawBase();
    this.drawSurface(this.model);
  }

  isStriped(): boolean {
    return this.striped;
  }

  /** Advance the visual by a movement delta. Stationary deltas do nothing. */
  update(dx: number, dy: number, model: RollingModel): void {
    this.model = model;
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

  private drawBase(): void {
    const r = this.radius;
    this.ball.clear();
    this.ball.fillStyle(this.color, 1).fillCircle(0, 0, r);

    if (this.striped) {
      this.drawStripe(r, 0xf3f4f6, 0.98);
      const stripeEdge = Math.sqrt(r * r - (r * 0.26) ** 2);
      this.ball.lineStyle(1, 0x06101d, 0.12)
        .lineBetween(-stripeEdge, -r * 0.26, stripeEdge, -r * 0.26)
        .lineBetween(-stripeEdge, r * 0.26, stripeEdge, r * 0.26);
    }

    // Model the studio light with restrained layered shapes. A broad,
    // low-alpha elliptical reflection gives soft falloff, while the smaller
    // highlight layers provide a glossy specular response without reading as
    // a painted white circle.
    this.ball.fillStyle(0xffffff, 0.08).fillEllipse(
      -r * 0.24,
      -r * 0.27,
      r * 0.82,
      r * 0.52,
    );
    this.ball.fillStyle(0xffffff, 0.13).fillEllipse(
      -r * 0.32,
      -r * 0.37,
      r * 0.42,
      r * 0.22,
    );
    this.ball.fillStyle(0xffffff, 0.28).fillEllipse(
      -r * 0.39,
      -r * 0.42,
      r * 0.19,
      r * 0.1,
    );
    this.ball.fillStyle(0xffffff, 0.52).fillCircle(-r * 0.42, -r * 0.44, r * 0.045);

    // A very subtle reflected shadow on the opposite side reinforces the
    // sphere's volume while leaving the marking and rolling cue prominent.
    this.ball.fillStyle(0x020817, 0.1).fillEllipse(
      r * 0.3,
      r * 0.36,
      r * 0.9,
      r * 0.62,
    );
    this.ball
      .lineStyle(1, 0xffffff, 0.12)
      .beginPath()
      .arc(
        0,
        0,
        r * 0.96,
        Phaser.Math.DegToRad(205),
        Phaser.Math.DegToRad(320),
      )
      .strokePath();
  }

  /** Fill a horizontal latitude band that stays inside the circular sphere. */
  private drawStripe(r: number, color: number, alpha: number): void {
    const top = -r * 0.26;
    const bottom = r * 0.26;
    const edge = Math.sqrt(r * r - top * top);

    // At both band boundaries the sphere is `edge` pixels wide. The
    // rectangle is therefore fully contained by the circular silhouette,
    // while its straight upper/lower edges read as a real pool-ball stripe.
    this.ball
      .fillStyle(color, alpha)
      .fillRect(-edge, top, edge * 2, bottom - top);
  }

  private drawSurface(model: RollingModel): void {
    const r = this.radius;
    // Keep the rolling cue and the numbered patch as separate visual
    // systems. They are synchronized to travelled distance, but the cue
    // must not disappear just because the numbered surface is back-facing.
    const rollingPhase = this.distance / r;
    const numberPhase = rollingPhase;
    this.surface.clear();
    this.numberPatch.clear();
    this.numberText.setPosition(0, 0).setScale(1).setRotation(0);
    this.numberPatch.setVisible(this.hasNumber && model !== "baseline");
    this.numberText.setVisible(this.hasNumber && model !== "baseline");
    this.numberPatch.setAlpha(1);
    this.numberText.setAlpha(1);

    if (model === "baseline") {
      this.numberText.setPosition(r * 0.1, -r * 0.02);
      return;
    }

    if (model === "displacement") {
      const marker = Math.sin(numberPhase) * r * 0.52;
      this.numberText.setPosition(marker, -r * 0.04);
      const facing = Math.max(0, Math.cos(numberPhase));
      this.numberText.setScale(Math.max(0.02, facing), 1);
      this.numberText.setAlpha(facing);
      this.numberPatch
        .fillStyle(0xffffff, facing)
        .fillEllipse(marker, -r * 0.04, r * 0.92 * facing, r * 0.92);
      this.surface.lineStyle(3, 0xffffff, 0.28).lineBetween(marker, -r * 0.65, marker, r * 0.65);
      return;
    }

    // A marking is a small surface patch, not a second sprite on top of the
    // ball. `facing` is the dot product between its simulated normal and the
    // camera direction. Back-facing patches are occluded by the sphere;
    // front-facing patches are foreshortened by their projected width.
    const facing = Math.max(0, Math.cos(numberPhase));
    const patchX = Math.sin(numberPhase) * r * 0.48;
    const patchHeight = r * 0.92;
    const patchWidth = patchHeight * facing;
    const visibility = Phaser.Math.Clamp((facing - 0.03) / 0.17, 0, 1);

    this.numberPatch
      .fillStyle(0xffffff, visibility)
      .fillEllipse(patchX, -r * 0.03, patchWidth, patchHeight);
    this.numberText.setPosition(patchX, -r * 0.03);
    this.numberText.setScale(Math.max(0.01, facing), 1);
    this.numberText.setAlpha(visibility);
    this.numberPatch.setVisible(this.hasNumber && visibility > 0);
    this.numberText.setVisible(this.hasNumber && visibility > 0);

    // The number's position and foreshortening provide the rolling cue. Keep
    // the surface layer free of guide rings that would read as decals.
  }
}
