/**
 * PowerControl UI Component
 * Renders a cue stick inside a frame box.
 * Player pulls the stick down to charge power, and releases to shoot.
 */
import Phaser from "phaser";

export interface PowerControlCallbacks {
  onPowerChanged?: (power: number) => void;
  onShootTriggered?: (power: number) => void;
}

export class PowerControl {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  // Graphics Layers
  private boxBg: Phaser.GameObjects.Graphics;
  private powerGradeFill: Phaser.GameObjects.Graphics;
  private stickGraphics: Phaser.GameObjects.Graphics;
  private boxFrame: Phaser.GameObjects.Graphics;
  private powerText: Phaser.GameObjects.Text;

  // Dimensions & Config
  private readonly boxW = 54;
  private readonly boxH = 180;
  private readonly maxPull = 120; // Max pixels stick can be pulled down
  private readonly maxGamePower = 14;

  // State
  private powerRatio: number = 0; // 0.0 to 1.0
  private startPointerY: number = 0;
  private isDragging: boolean = false;
  private enabled: boolean = true;

  // Callbacks
  private callbacks?: PowerControlCallbacks;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    callbacks?: PowerControlCallbacks,
  ) {
    this.scene = scene;
    this.callbacks = callbacks;

    // Container placed at bottom-right
    this.container = scene.add.container(x, y).setDepth(25);

    this.boxBg = scene.add.graphics();
    this.powerGradeFill = scene.add.graphics();
    this.stickGraphics = scene.add.graphics();
    this.boxFrame = scene.add.graphics();

    this.powerText = scene.add
      .text(0, this.boxH / 2 + 18, "PULL", {
        font: "bold 12px Arial, sans-serif",
        color: "#94a3b8",
      })
      .setOrigin(0.5);

    this.container.add([
      this.boxBg,
      this.powerGradeFill,
      this.stickGraphics,
      this.boxFrame,
      this.powerText,
    ]);

    this.drawBoxFrame();
    this.updateVisuals(0);
    this.setupInteractivity();
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDERING & VISUALS
  // ═══════════════════════════════════════════════════════════

  private drawBoxFrame(): void {
    const halfW = this.boxW / 2;
    const halfH = this.boxH / 2;
    const radius = 12;

    // Outer shadow
    this.boxBg.fillStyle(0x000000, 0.5);
    this.boxBg.fillRoundedRect(
      -halfW + 2,
      -halfH + 4,
      this.boxW,
      this.boxH,
      radius,
    );

    // Box Dark Background
    this.boxBg.fillStyle(0x0f172a, 0.95);
    this.boxBg.fillRoundedRect(-halfW, -halfH, this.boxW, this.boxH, radius);

    // Metallic outer border
    this.boxFrame.lineStyle(2, 0x334155, 1);
    this.boxFrame.strokeRoundedRect(
      -halfW,
      -halfH,
      this.boxW,
      this.boxH,
      radius,
    );

    // Top tip target guide mark
    this.boxFrame.lineStyle(1.5, 0x38bdf8, 0.6);
    this.boxFrame.lineBetween(-12, -halfH + 20, 12, -halfH + 20);
  }

  private updateVisuals(pulledY: number): void {
    this.powerRatio = Phaser.Math.Clamp(pulledY / this.maxPull, 0, 1);
    const halfW = this.boxW / 2;
    const halfH = this.boxH / 2;

    // 1. Color-Graded Background Fill
    this.powerGradeFill.clear();
    if (this.powerRatio > 0) {
      const color = this.getPowerColor(this.powerRatio);
      const filledH = this.powerRatio * (this.boxH - 8);

      // Gradient glowing fill rising from top to bottom (following the pull)
      this.powerGradeFill.fillStyle(color, 0.35 + this.powerRatio * 0.45);
      this.powerGradeFill.fillRoundedRect(
        -halfW + 4,
        -halfH + 4,
        this.boxW - 8,
        filledH,
        8,
      );

      // Vibrant top edge line
      this.powerGradeFill.lineStyle(2, color, 1);
      this.powerGradeFill.lineBetween(
        -halfW + 6,
        -halfH + 4 + filledH,
        halfW - 6,
        -halfH + 4 + filledH,
      );
    }

    // 2. Draw Cue Stick sitting/pulled inside the box
    this.drawCueStickInsideBox(pulledY);

    // 3. Percentage Text
    if (this.powerRatio > 0) {
      const pct = Math.round(this.powerRatio * 100);
      this.powerText.setText(`${pct}%`).setColor("#ffffff");
    } else {
      this.powerText.setText("PULL").setColor("#94a3b8");
    }
  }

  /**
   * Draws a realistic vertical cue stick shifted down by `pulledY`
   */
  private drawCueStickInsideBox(pulledY: number): void {
    const g = this.stickGraphics;
    g.clear();

    const halfH = this.boxH / 2;
    const startY = -halfH + 18 + pulledY; // Top tip of stick
    const stickLength = 135;

    // Shadow
    g.lineStyle(6, 0x000000, 0.3);
    g.lineBetween(2, startY, 2, startY + stickLength);

    // Cue Tip (Leather Blue)
    g.lineStyle(4, 0x0284c7, 1);
    g.lineBetween(0, startY, 0, startY + 4);

    // Ferrule (White)
    g.lineStyle(4, 0xfffffe, 1);
    g.lineBetween(0, startY + 4, 0, startY + 10);

    // Shaft (Light Maple Wood)
    g.lineStyle(5, 0xfef08a, 1);
    g.lineBetween(0, startY + 10, 0, startY + 70);

    // Decorative Linen Wrap / Grip (Pattern)
    g.lineStyle(6, 0x1e293b, 1);
    g.lineBetween(0, startY + 70, 0, startY + 115);

    // Gold Ring Accents
    g.lineStyle(6, 0xf59e0b, 1);
    g.lineBetween(0, startY + 70, 0, startY + 73);
    g.lineBetween(0, startY + 115, 0, startY + 118);

    // Butt (Dark Mahogany)
    g.lineStyle(7, 0x451a03, 1);
    g.lineBetween(0, startY + 118, 0, startY + stickLength);

    // Bumper (Rubber bottom)
    g.fillStyle(0x0f172a, 1);
    g.fillCircle(0, startY + stickLength, 3.5);
  }

  private getPowerColor(ratio: number): number {
    if (ratio < 0.5) {
      return Phaser.Display.Color.Interpolate.ColorWithColor(
        { r: 34, g: 197, b: 94 }, // Green
        { r: 234, g: 179, b: 8 }, // Yellow
        100,
        ratio * 200,
      ).color;
    } else {
      return Phaser.Display.Color.Interpolate.ColorWithColor(
        { r: 234, g: 179, b: 8 }, // Yellow
        { r: 239, g: 68, b: 68 }, // Red
        100,
        (ratio - 0.5) * 200,
      ).color;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  INTERACTIVITY & PULL-RELEASE
  // ═══════════════════════════════════════════════════════════

  private setupInteractivity(): void {
    const halfW = this.boxW / 2;
    const halfH = this.boxH / 2;

    // Mobile Optimization: Expanded touch region (60px padding) around the box for thumb support
    const hitArea = new Phaser.Geom.Rectangle(
      -halfW - 30,
      -halfH - 20,
      this.boxW + 60,
      this.boxH + 40,
    );
    this.container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    this.container.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      this.isDragging = true;
      this.startPointerY = pointer.y;
    });

    // Track movement globally (even if thumb slides slightly outside the box)
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging || !this.enabled) return;

      const dy = pointer.y - this.startPointerY;
      const pulledY = Phaser.Math.Clamp(dy, 0, this.maxPull);

      this.updateVisuals(pulledY);

      if (this.callbacks?.onPowerChanged) {
        this.callbacks.onPowerChanged(this.getScaledPower());
      }
    });

    // Catch pointerup and pointerupoutside for mobile screen edges
    const releaseShot = () => {
      if (!this.isDragging) return;
      this.isDragging = false;

      const shotPower = this.getScaledPower();
      if (shotPower > 0.5) {
        this.animateStickRelease(() => {
          if (this.callbacks?.onShootTriggered) {
            this.callbacks.onShootTriggered(shotPower);
          }
        });
      } else {
        this.resetPower();
      }
    };

    this.scene.input.on("pointerup", releaseShot);
    this.scene.input.on("pointerupoutside", releaseShot); // Crucial for mobile screen edges!
  }
  private animateStickRelease(onComplete?: () => void): void {
    const startPulledY = this.powerRatio * this.maxPull;
    const animObj = { y: startPulledY };

    this.scene.tweens.add({
      targets: animObj,
      y: 0,
      duration: 90,
      ease: "Back.easeOut",
      onUpdate: () => {
        this.updateVisuals(animObj.y);
      },
      onComplete: () => {
        this.resetPower();
        if (onComplete) onComplete();
      },
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  PUBLIC HELPERS
  // ═══════════════════════════════════════════════════════════

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.container.setAlpha(enabled ? 1.0 : 0.4);
  }

  public resetPower(): void {
    this.powerRatio = 0;
    this.updateVisuals(0);
  }

  public getScaledPower(): number {
    return this.powerRatio * this.maxGamePower;
  }

  public isDraggingPower(): boolean {
    return this.isDragging;
  }

  public isPointerOver(x: number, y: number): boolean {
    const cx = this.container.x;
    const cy = this.container.y;
    const halfW = this.boxW / 2 + 15;
    const halfH = this.boxH / 2 + 15;
    return (
      x >= cx - halfW && x <= cx + halfW && y >= cy - halfH && y <= cy + halfH
    );
  }
}
