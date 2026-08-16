import Phaser from "phaser";
import { RollingBall, RollingModel, ROLLING_MODEL_LABELS } from "../rendering/RollingBall";

const MODELS: RollingModel[] = ["baseline", "displacement", "directional"];

export class BallAnimationLabScene extends Phaser.Scene {
  private ball!: RollingBall;
  private direction = -Math.PI / 6;
  private speed = 180;
  private playing = true;
  private reverse = false;
  private model: RollingModel = "directional";
  private ballPosition = new Phaser.Math.Vector2(430, 310);
  private joystickCenter = new Phaser.Math.Vector2(108, 238);
  private joystickRadius = 62;
  private directionLine!: Phaser.GameObjects.Graphics;
  private readout!: Phaser.GameObjects.Text;

  constructor() { super({ key: "BallAnimationLabScene" }); }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x08111f).setOrigin(0);
    this.add.rectangle(0, 0, width, 92, 0x101d31).setOrigin(0);
    this.add.text(34, 24, "BALL ANIMATION LAB", { fontSize: "28px", color: "#f8fafc", fontStyle: "bold" });
    this.add.text(36, 59, "Renderer-only playground · no physics, networking, or replay", { fontSize: "14px", color: "#8fa3bb" });

    const stage = this.add.graphics();
    stage.fillStyle(0x123354, 1).fillRoundedRect(248, 126, width - 286, height - 164, 22);
    stage.lineStyle(2, 0x2b5680, 0.8).strokeRoundedRect(248, 126, width - 286, height - 164, 22);
    stage.lineStyle(1, 0x2b5680, 0.22);
    for (let x = 280; x < width - 50; x += 56) stage.lineBetween(x, 145, x, height - 56);
    for (let y = 160; y < height - 55; y += 56) stage.lineBetween(268, y, width - 58, y);

    this.ball = new RollingBall(this, this.ballPosition.x, this.ballPosition.y, { radius: 88, color: 0x1677c8 });
    this.directionLine = this.add.graphics().setDepth(5);
    this.drawJoystick();
    this.createControls(width);
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && this.distanceToJoystick(pointer.x, pointer.y) <= this.joystickRadius * 1.65) this.setDirectionFromPointer(pointer.x, pointer.y);
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.distanceToJoystick(pointer.x, pointer.y) <= this.joystickRadius * 1.65) this.setDirectionFromPointer(pointer.x, pointer.y);
    });
    this.events.once("shutdown", () => this.input.removeAllListeners());
  }

  update(_time: number, delta: number): void {
    if (!this.playing || this.speed <= 0) return;
    const signedSpeed = this.reverse ? -this.speed : this.speed;
    const dx = Math.cos(this.direction) * signedSpeed * delta / 1000;
    const dy = Math.sin(this.direction) * signedSpeed * delta / 1000;
    this.ballPosition.x += dx;
    this.ballPosition.y += dy;
    const bounds = { left: 350, right: this.scale.width - 100, top: 205, bottom: this.scale.height - 86 };
    if (this.ballPosition.x < bounds.left || this.ballPosition.x > bounds.right) { this.direction = Math.PI - this.direction; this.ballPosition.x = Phaser.Math.Clamp(this.ballPosition.x, bounds.left, bounds.right); }
    if (this.ballPosition.y < bounds.top || this.ballPosition.y > bounds.bottom) { this.direction = -this.direction; this.ballPosition.y = Phaser.Math.Clamp(this.ballPosition.y, bounds.top, bounds.bottom); }
    this.ball.container.setPosition(this.ballPosition.x, this.ballPosition.y);
    this.ball.update(dx, dy, this.model);
    this.drawJoystick();
    this.updateReadout();
  }

  private createControls(width: number): void {
    const panelX = 26;
    this.add.text(panelX, 126, "DIRECTION", { fontSize: "12px", color: "#7f9bb8", fontStyle: "bold" });
    this.add.text(panelX, 317, "Drag the joystick", { fontSize: "12px", color: "#8fa3bb" });
    this.add.text(panelX, 347, "MODEL", { fontSize: "12px", color: "#7f9bb8", fontStyle: "bold" });
    MODELS.forEach((model, index) => {
      const button = this.add.text(panelX, 370 + index * 27, `○  ${ROLLING_MODEL_LABELS[model]}`, { fontSize: "11px", color: model === this.model ? "#fbbf24" : "#c4d2e1", fixedWidth: 210 })
        .setInteractive({ useHandCursor: true });
      button.on("pointerdown", () => { this.model = model; this.ball.reset(); this.updateReadout(); });
      button.on("pointerover", () => button.setColor("#fbbf24"));
      button.on("pointerout", () => button.setColor(model === this.model ? "#fbbf24" : "#c4d2e1"));
    });
    this.add.text(panelX, 460, "SPEED", { fontSize: "12px", color: "#7f9bb8", fontStyle: "bold" });
    const speedBar = this.add.rectangle(panelX + 4, 486, 190, 8, 0x29445f).setOrigin(0, 0.5).setInteractive();
    const speedFill = this.add.rectangle(panelX + 4, 486, this.speed / 360 * 190, 8, 0xf97316).setOrigin(0, 0.5);
    speedBar.on("pointerdown", (pointer: Phaser.Input.Pointer) => { this.speed = Phaser.Math.Clamp(((pointer.x - (panelX + 4)) / 190) * 360, 0, 360); speedFill.width = this.speed / 360 * 190; this.updateReadout(); });
    const play = this.add.text(panelX, 510, "Ⅱ  Pause", { fontSize: "14px", color: "#f8fafc", backgroundColor: "#1d3854", padding: { x: 12, y: 8 } }).setInteractive({ useHandCursor: true });
    play.on("pointerdown", () => { this.playing = !this.playing; play.setText(this.playing ? "Ⅱ  Pause" : "▶  Play"); });
    const reverse = this.add.text(panelX + 104, 510, "↔ Reverse", { fontSize: "14px", color: "#f8fafc", backgroundColor: "#1d3854", padding: { x: 12, y: 8 } }).setInteractive({ useHandCursor: true });
    reverse.on("pointerdown", () => { this.reverse = !this.reverse; reverse.setColor(this.reverse ? "#fbbf24" : "#f8fafc"); });
    const reset = this.add.text(panelX, 550, "Reset position and roll", { fontSize: "13px", color: "#fbbf24", backgroundColor: "#3b2811", padding: { x: 12, y: 8 } }).setInteractive({ useHandCursor: true });
    reset.on("pointerdown", () => { this.ballPosition.set(430, 310); this.direction = -Math.PI / 6; this.ball.container.setPosition(this.ballPosition.x, this.ballPosition.y); this.ball.reset(); });
    this.readout = this.add.text(width - 350, 145, "", { fontSize: "14px", color: "#dbeafe", backgroundColor: "#0b1b2d", padding: { x: 14, y: 10 } });
    this.updateReadout();
  }

  private drawJoystick(): void {
    this.directionLine.clear();
    this.directionLine.lineStyle(2, 0xfbbf24, 0.7).lineBetween(this.joystickCenter.x, this.joystickCenter.y, this.joystickCenter.x + Math.cos(this.direction) * 48, this.joystickCenter.y + Math.sin(this.direction) * 48);
    this.directionLine.fillStyle(0x1b3550, 1).fillCircle(this.joystickCenter.x, this.joystickCenter.y, this.joystickRadius);
    this.directionLine.lineStyle(2, 0x6b88a4, 1).strokeCircle(this.joystickCenter.x, this.joystickCenter.y, this.joystickRadius);
    this.directionLine.fillStyle(0xfbbf24, 1).fillCircle(this.joystickCenter.x + Math.cos(this.direction) * 48, this.joystickCenter.y + Math.sin(this.direction) * 48, 13);
  }

  private setDirectionFromPointer(x: number, y: number): void { this.direction = Math.atan2(y - this.joystickCenter.y, x - this.joystickCenter.x); this.drawJoystick(); this.updateReadout(); }
  private distanceToJoystick(x: number, y: number): number { return Phaser.Math.Distance.Between(x, y, this.joystickCenter.x, this.joystickCenter.y); }
  private updateReadout(): void { if (this.readout) this.readout.setText(`${ROLLING_MODEL_LABELS[this.model]}\nDirection ${Math.round(Phaser.Math.RadToDeg(this.direction))}°  ·  ${Math.round(this.speed)} px/s${this.reverse ? "  ·  reverse" : ""}`); }
}
