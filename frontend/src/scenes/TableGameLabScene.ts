import Phaser from "phaser";
import { TableRenderer } from "../rendering/TableRenderer";
import { BallRenderer } from "../rendering/BallRenderer";
import { PhysicsDebugPanel } from "../rendering/PhysicsDebugPanel";
import { PowerControl } from "../rendering/PowerControl";
import { CUSHION_W, TABLE_H, TABLE_W, TABLE_X, TABLE_Y } from "../gameConfig";
import { getCollisionPairs } from "../utils/collisionPairs";

/** A local-only playground for the production table and Matter simulation. */
export class TableGameLabScene extends Phaser.Scene {
  private balls!: BallRenderer;
  private physicsPanel!: PhysicsDebugPanel;
  private wallBodies: MatterJS.Body[] = [];
  private settleSpeed = 0.8;
  private aiming = false;
  private angle = 0;
  private power = 0;
  private simulating = false;
  private settledFrames = 0;
  private status!: Phaser.GameObjects.Text;
  private powerControl!: PowerControl;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private cueGraphics!: Phaser.GameObjects.Graphics;

  constructor() { super({ key: "TableGameLabScene" }); }

  create(): void {
    const assets = TableRenderer.draw(this, "classic");
    this.wallBodies = assets.wallBodies;
    this.balls = new BallRenderer(this, "classic");
    this.balls.generateTextures();
    this.balls.createBalls();
    this.aimGraphics = this.add.graphics().setDepth(8);
    this.cueGraphics = this.add.graphics().setDepth(9);

    this.add.text(20, 14, "TABLE & GAME LAB", { fontSize: "25px", color: "#f8fafc", fontStyle: "bold" }).setDepth(30);
    this.add.text(22, 45, "Local sandbox · production table, rack and Matter.js physics", { fontSize: "12px", color: "#9fb3c8" }).setDepth(30);
    this.status = this.add.text(20, 82, "", { fontSize: "12px", color: "#dbeafe", backgroundColor: "#0b1b2d", padding: { x: 8, y: 6 } }).setDepth(30);

    this.makeButton(20, 130, "Reset Rack", () => this.resetRack());
    this.makeButton(20, 164, "Physics Controls", () => this.physicsPanel.toggle());
    this.makeButton(20, 198, "Reset Physics Defaults", () => this.physicsPanel.resetDefaults());
    this.makeButton(20, 232, "Pause Simulation", () => this.togglePause());
    this.makeButton(20, 266, "Clear / Pocket All", () => this.balls.pocketAll());
    this.makeButton(20, 300, "Respawn Cue Ball", () => this.balls.respawnCue());
    this.add.text(20, 350, "Aim: drag on the table\nPower: pull the cue control", { fontSize: "12px", color: "#8fa3bb", lineSpacing: 5 }).setDepth(30);

    this.powerControl = new PowerControl(this, 1230, 450, {
      onPowerChanged: (value) => { this.power = value; },
      onShootTriggered: () => this.shoot(),
    });
    this.physicsPanel = new PhysicsDebugPanel(this);
    this.physicsPanel.onApplyBall = (key, value) => this.balls.getAllBalls().forEach((bd) => ((bd.sprite.body as any)[key] = value));
    this.physicsPanel.onApplyWall = (key, value) => this.wallBodies.forEach((body) => ((body as any)[key] = value));
    this.physicsPanel.onApplySettle = (value) => { this.settleSpeed = value; };
    this.setupInput();
    this.matter.world.on("collisionstart", (event: any, bodyA: any, bodyB: any) => {
      getCollisionPairs(event, bodyA, bodyB).forEach(({ bodyA: a, bodyB: b }) => {
        const ball = (a.label || "").startsWith("ball_") ? a : (b.label || "").startsWith("ball_") ? b : null;
        const pocket = a.label === "pocket" || b.label === "pocket";
        if (ball && pocket) {
          const num = Number(String(ball.label).replace("ball_", ""));
          if (num === 0) this.balls.respawnCue(); else this.balls.pocketBall(num);
        }
      });
    });
    this.events.once("shutdown", () => this.input.removeAllListeners());
    this.updateStatus();
  }

  update(): void {
    this.balls.updateShadows();
    this.drawAimAndCue();
    if (this.simulating) {
      let moving = false;
      this.balls.getAllBalls().forEach((bd) => {
        const body = bd.sprite.body as any;
        if (body && body.speed > this.settleSpeed) moving = true;
        if (body && body.speed < this.settleSpeed) bd.sprite.setVelocity(0, 0);
      });
      this.settledFrames = moving ? 0 : this.settledFrames + 1;
      if (this.settledFrames > 8) { this.simulating = false; this.powerControl.setEnabled(true); }
    }
    this.updateStatus();
  }

  private setupInput(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.simulating || this.powerControl.isDraggingPower() || pointer.x < TABLE_X || pointer.x > TABLE_X + TABLE_W || pointer.y < TABLE_Y || pointer.y > TABLE_Y + TABLE_H) return;
      this.aiming = true; this.setAngle(pointer);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => { if (this.aiming) this.setAngle(pointer); });
    this.input.on("pointerup", () => { this.aiming = false; });
  }

  private setAngle(pointer: Phaser.Input.Pointer): void {
    const cue = this.balls.getCueBallSprite();
    if (cue) this.angle = Math.atan2(pointer.worldY - cue.y, pointer.worldX - cue.x);
  }

  private shoot(): void {
    const cue = this.balls.getCueBallSprite();
    if (!cue || this.simulating || this.power <= 0) return;
    cue.setVelocity(Math.cos(this.angle) * this.power * 2.5, Math.sin(this.angle) * this.power * 2.5);
    (cue.body as any).isSleeping = false;
    this.simulating = true; this.settledFrames = 0; this.powerControl.setEnabled(false);
  }

  private drawAimAndCue(): void {
    this.aimGraphics.clear();
    this.cueGraphics.clear();
    const cue = this.balls.getCueBallSprite();
    if (!cue || !cue.visible || this.simulating) return;

    const x = cue.x;
    const y = cue.y;
    const aimLength = 360;
    const aimX = x + Math.cos(this.angle) * aimLength;
    const aimY = y + Math.sin(this.angle) * aimLength;

    // A clear guide line makes the intended shot direction easy to read.
    this.aimGraphics.lineStyle(2, 0xfbbf24, 0.8);
    this.aimGraphics.lineBetween(x, y, aimX, aimY);
    this.aimGraphics.lineStyle(1, 0xffffff, 0.3);
    this.aimGraphics.strokeCircle(x, y, 17);

    // Draw the cue behind the cue ball, matching the production cue direction.
    const cueLength = 180;
    const startX = x - Math.cos(this.angle) * (cueLength + 20);
    const startY = y - Math.sin(this.angle) * (cueLength + 20);
    const endX = x - Math.cos(this.angle) * 18;
    const endY = y - Math.sin(this.angle) * 18;
    this.cueGraphics.lineStyle(8, 0x451a03, 1);
    this.cueGraphics.lineBetween(startX, startY, endX, endY);
    this.cueGraphics.lineStyle(4, 0xfef08a, 1);
    this.cueGraphics.lineBetween(endX, endY, x - Math.cos(this.angle) * 42, y - Math.sin(this.angle) * 42);
    this.cueGraphics.lineStyle(3, 0x0284c7, 1);
    this.cueGraphics.lineBetween(x - Math.cos(this.angle) * 18, y - Math.sin(this.angle) * 18, x - Math.cos(this.angle) * 25, y - Math.sin(this.angle) * 25);
  }

  private resetRack(): void {
    this.simulating = false; this.power = 0; this.balls.resetRack(); this.powerControl.setEnabled(true);
  }

  private togglePause(): void {
    if (this.matter.world.enabled) this.matter.world.pause(); else this.matter.world.resume();
  }

  private makeButton(x: number, y: number, label: string, callback: () => void): void {
    const button = this.add.text(x, y, label, { fontSize: "12px", color: "#f8fafc", backgroundColor: "#1d3854", padding: { x: 9, y: 6 } }).setDepth(30).setInteractive({ useHandCursor: true });
    button.on("pointerdown", callback);
  }

  private updateStatus(): void {
    if (!this.status || !this.balls) return;
    let moving = 0;
    let cueSpeed = 0;
    this.balls.getAllBalls().forEach((bd) => { const speed = (bd.sprite.body as any)?.speed || 0; if (speed > this.settleSpeed) moving++; if (bd.number === 0) cueSpeed = speed; });
    this.status.setText(`Simulation: ${this.matter.world.enabled ? (this.simulating ? "active" : "settled") : "paused"}  ·  moving ${moving}  ·  cue ${cueSpeed.toFixed(2)}  ·  balls ${this.balls.getAllBalls().size}`);
  }
}
