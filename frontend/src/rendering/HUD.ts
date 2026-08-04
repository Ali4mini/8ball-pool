/**
 * Handles HUD UI overlays, player turn headers, power meter UI component,
 * cue stick drawing, and aiming trajectory predictions (ghost ball & deflection lines).
 */
import Phaser from "phaser";
import { PowerControl } from "./PowerControl";
import {
  PLAY_L,
  PLAY_R,
  PLAY_T,
  PLAY_B,
  BALL_RADIUS,
  TABLE_X,
  TABLE_W,
} from "../gameConfig";

export interface TrajectoryHit {
  type: "ball" | "cushion";
  ghostX: number;
  ghostY: number;
  hitBallNumber?: number;
  hitBallX?: number;
  hitBallY?: number;
  targetBallDirX?: number;
  targetBallDirY?: number;
  cueDeflectDirX?: number;
  cueDeflectDirY?: number;
  reflectionDirX?: number;
  reflectionDirY?: number;
}

export class HUD {
  private scene: Phaser.Scene;

  // Graphics objects
  private aimGraphics: Phaser.GameObjects.Graphics;
  public cueStick: Phaser.GameObjects.Graphics;

  // Power Control Component
  public powerControl!: PowerControl;

  // UI Texts
  private infoText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private p1NameText!: Phaser.GameObjects.Text;
  private p2NameText!: Phaser.GameObjects.Text;
  private groupText!: Phaser.GameObjects.Text;
  private foulText!: Phaser.GameObjects.Text;

  // Avatar containers (left and right side of table)
  private p1Avatar!: Phaser.GameObjects.Container;
  private p2Avatar!: Phaser.GameObjects.Container;

  // Group ball indicators (visual pocket targets)
  private p1GroupIndicators!: Phaser.GameObjects.Container;
  private p2GroupIndicators!: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.aimGraphics = scene.add.graphics();
    this.aimGraphics.setDepth(10);
    this.cueStick = scene.add.graphics();
    this.cueStick.setDepth(11);

    this.createUIElements();
    this.createPowerControlUI();
  }

  private createUIElements(): void {
    const { width: w } = this.scene.scale;

    // Info message text (bottom center)
    this.infoText = this.scene.add
      .text(w / 2, 554, "", {
        font: "20px Arial, sans-serif",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Turn indicator text (top center)
    this.turnText = this.scene.add
      .text(w / 2, 14, "", {
        font: "bold 24px Arial, sans-serif",
        color: "#f97316",
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Player names (top)
    this.p1NameText = this.scene.add
      .text(40, 14, "Player 1", {
        font: "bold 18px Arial, sans-serif",
        color: "#38bdf8",
      })
      .setDepth(20);

    this.p2NameText = this.scene.add
      .text(w - 40, 14, "Player 2", {
        font: "bold 18px Arial, sans-serif",
        color: "#f43f5e",
      })
      .setOrigin(1, 0)
      .setDepth(20);

    // Group info text
    this.groupText = this.scene.add
      .text(w / 2, 38, "", {
        font: "16px Arial, sans-serif",
        color: "#cbd5e1",
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Foul banner text
    this.foulText = this.scene.add
      .text(w / 2, 120, "", {
        font: "bold 26px Arial, sans-serif",
        color: "#ef4444",
        backgroundColor: "#000000cc",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    // Avatar containers
    this.p1Avatar = this.scene.add
      .container(0, 0)
      .setDepth(20)
      .setVisible(false);
    this.p2Avatar = this.scene.add
      .container(0, 0)
      .setDepth(20)
      .setVisible(false);

    // Group ball indicators
    this.p1GroupIndicators = this.scene.add
      .container(0, 0)
      .setDepth(19)
      .setVisible(false);
    this.p2GroupIndicators = this.scene.add
      .container(0, 0)
      .setDepth(19)
      .setVisible(false);
  }

  // ═══════════════════════════════════════════════════════════
  //  POWER CONTROL INTEGRATION
  // ═══════════════════════════════════════════════════════════

  private createPowerControlUI(): void {
    const { width: screenW, height: screenH } = this.scene.scale;
    const x = screenW - 65;
    const y = screenH - 125;

    this.powerControl = new PowerControl(this.scene, x, y);
  }

  public setupPowerCallbacks(
    onPowerChanged: (power: number) => void,
    onShootTriggered: (power: number) => void,
  ): void {
    const { width: screenW, height: screenH } = this.scene.scale;
    const x = screenW - 65;
    const y = screenH - 125;

    this.powerControl = new PowerControl(this.scene, x, y, {
      onPowerChanged,
      onShootTriggered,
    });
  }

  public isPointerOverPowerUI(x: number, y: number): boolean {
    return this.powerControl ? this.powerControl.isPointerOver(x, y) : false;
  }

  public setPowerEnabled(enabled: boolean): void {
    if (this.powerControl) {
      this.powerControl.setEnabled(enabled);
    }
  }

  public resetPower(): void {
    if (this.powerControl) {
      this.powerControl.resetPower();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  AIMING TRAJECTORY & GHOST BALL PREDICTION
  // ═══════════════════════════════════════════════════════════

  public drawAim(
    cx: number,
    cy: number,
    angleRad: number,
    power: number,
    balls: { number: number; x: number; y: number }[],
  ): void {
    this.aimGraphics.clear();

    // 1. Raycast collision prediction
    const hit = this.calculateTrajectory(cx, cy, angleRad, balls);

    if (hit) {
      const g = this.aimGraphics;

      // A) Main Aiming Line (Cue ball -> Ghost ball)
      g.lineStyle(4, 0x000000, 0.4);
      g.lineBetween(cx, cy, hit.ghostX, hit.ghostY);
      g.lineStyle(2, 0xffffff, 0.95);
      g.lineBetween(cx, cy, hit.ghostX, hit.ghostY);

      // B) Ghost Target Ball Ring
      g.fillStyle(0xffffff, 0.15);
      g.fillCircle(hit.ghostX, hit.ghostY, BALL_RADIUS);
      g.lineStyle(1.5, 0xffffff, 0.85);
      g.strokeCircle(hit.ghostX, hit.ghostY, BALL_RADIUS);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(hit.ghostX, hit.ghostY, 2);

      // C) Collision Path Predictions
      if (
        hit.type === "ball" &&
        hit.hitBallX !== undefined &&
        hit.hitBallY !== undefined
      ) {
        // --- Target Ball Path Vector ---
        const tbLen = 90;
        const tbEndX = hit.hitBallX + (hit.targetBallDirX || 0) * tbLen;
        const tbEndY = hit.hitBallY + (hit.targetBallDirY || 0) * tbLen;

        g.lineStyle(3, 0x000000, 0.4);
        g.lineBetween(hit.hitBallX, hit.hitBallY, tbEndX, tbEndY);
        g.lineStyle(1.5, 0xfacc15, 0.95); // Bright gold for target ball
        g.lineBetween(hit.hitBallX, hit.hitBallY, tbEndX, tbEndY);
        g.fillStyle(0xfacc15, 1);
        g.fillCircle(tbEndX, tbEndY, 3);

        // --- Cue Ball Tangent Deflection Vector ---
        const cbLen = 60;
        const cbEndX = hit.ghostX + (hit.cueDeflectDirX || 0) * cbLen;
        const cbEndY = hit.ghostY + (hit.cueDeflectDirY || 0) * cbLen;

        g.lineStyle(3, 0x000000, 0.3);
        g.lineBetween(hit.ghostX, hit.ghostY, cbEndX, cbEndY);
        g.lineStyle(1.5, 0xffffff, 0.7);
        g.lineBetween(hit.ghostX, hit.ghostY, cbEndX, cbEndY);
      } else if (hit.type === "cushion") {
        // --- Cushion Bounce Vector ---
        const bounceLen = 100;
        const bounceEndX = hit.ghostX + (hit.reflectionDirX || 0) * bounceLen;
        const bounceEndY = hit.ghostY + (hit.reflectionDirY || 0) * bounceLen;

        g.lineStyle(3, 0x000000, 0.4);
        g.lineBetween(hit.ghostX, hit.ghostY, bounceEndX, bounceEndY);
        g.lineStyle(1.5, 0x38bdf8, 0.9); // Cyan bounce line
        g.lineBetween(hit.ghostX, hit.ghostY, bounceEndX, bounceEndY);
      }
    }

    // 2. Draw Cue Stick positioned behind cue ball
    this.drawCueStickAt(cx, cy, angleRad, 1, power);
  }

  public hideAim(): void {
    this.aimGraphics.clear();
    this.cueStick.clear();
  }

  private calculateTrajectory(
    cueX: number,
    cueY: number,
    angleRad: number,
    balls: { number: number; x: number; y: number }[],
  ): TrajectoryHit | null {
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    const r = BALL_RADIUS;
    const minX = PLAY_L + r;
    const maxX = PLAY_R - r;
    const minY = PLAY_T + r;
    const maxY = PLAY_B - r;

    let closestDist = Infinity;
    let bestHit: TrajectoryHit | null = null;

    // ─── Check Collisions with Target Balls ───
    const combinedR = r * 2;
    const combinedR2 = combinedR * combinedR;

    for (const b of balls) {
      if (b.number === 0) continue; // Skip cue ball

      const vx = b.x - cueX;
      const vy = b.y - cueY;

      const t = vx * dx + vy * dy;
      if (t <= 0) continue;

      const d2 = vx * vx + vy * vy - t * t;
      if (d2 > combinedR2) continue;

      const tImpact = t - Math.sqrt(combinedR2 - d2);
      if (tImpact > 0 && tImpact < closestDist) {
        closestDist = tImpact;

        const ghostX = cueX + dx * tImpact;
        const ghostY = cueY + dy * tImpact;

        const nx = (b.x - ghostX) / combinedR;
        const ny = (b.y - ghostY) / combinedR;

        let tx = -ny;
        let ty = nx;
        const dotT = dx * tx + dy * ty;
        if (dotT < 0) {
          tx = -tx;
          ty = -ty;
        }

        bestHit = {
          type: "ball",
          ghostX,
          ghostY,
          hitBallNumber: b.number,
          hitBallX: b.x,
          hitBallY: b.y,
          targetBallDirX: nx,
          targetBallDirY: ny,
          cueDeflectDirX: tx,
          cueDeflectDirY: ty,
        };
      }
    }

    // ─── Check Collisions with Cushion Walls ───
    let wallDist = Infinity;
    let wallGhostX = 0;
    let wallGhostY = 0;
    let reflDx = dx;
    let reflDy = dy;

    if (dx > 0) {
      const t = (maxX - cueX) / dx;
      if (t > 0) {
        const yAtX = cueY + dy * t;
        if (yAtX >= minY && yAtX <= maxY && t < wallDist) {
          wallDist = t;
          wallGhostX = maxX;
          wallGhostY = yAtX;
          reflDx = -dx;
          reflDy = dy;
        }
      }
    } else if (dx < 0) {
      const t = (minX - cueX) / dx;
      if (t > 0) {
        const yAtX = cueY + dy * t;
        if (yAtX >= minY && yAtX <= maxY && t < wallDist) {
          wallDist = t;
          wallGhostX = minX;
          wallGhostY = yAtX;
          reflDx = -dx;
          reflDy = dy;
        }
      }
    }

    if (dy > 0) {
      const t = (maxY - cueY) / dy;
      if (t > 0) {
        const xAtY = cueX + dx * t;
        if (xAtY >= minX && xAtY <= maxX && t < wallDist) {
          wallDist = t;
          wallGhostX = xAtY;
          wallGhostY = maxY;
          reflDx = dx;
          reflDy = -dy;
        }
      }
    } else if (dy < 0) {
      const t = (minY - cueY) / dy;
      if (t > 0) {
        const xAtY = cueX + dx * t;
        if (xAtY >= minX && xAtY <= maxX && t < wallDist) {
          wallDist = t;
          wallGhostX = xAtY;
          wallGhostY = minY;
          reflDx = dx;
          reflDy = -dy;
        }
      }
    }

    if (wallDist < closestDist) {
      return {
        type: "cushion",
        ghostX: wallGhostX,
        ghostY: wallGhostY,
        reflectionDirX: reflDx,
        reflectionDirY: reflDy,
      };
    }

    return bestHit;
  }

  // ═══════════════════════════════════════════════════════════
  //  CUE STICK RENDERING ON TABLE
  // ═══════════════════════════════════════════════════════════

  public drawCueStickAt(
    cx: number,
    cy: number,
    angleRad: number,
    alpha: number = 1,
    power: number = 0,
  ): void {
    this.cueStick.clear();
    this.cueStick.setAlpha(alpha);

    const length = 320;
    const offsetBack = BALL_RADIUS + 6 + power * 4; // Pull back as power increases

    const backAngle = angleRad + Math.PI;
    const dirX = Math.cos(backAngle);
    const dirY = Math.sin(backAngle);

    const startX = cx + dirX * offsetBack;
    const startY = cy + dirY * offsetBack;
    const endX = startX + dirX * length;
    const endY = startY + dirY * length;

    // Outer dark shadow
    this.cueStick.lineStyle(6, 0x000000, 0.35);
    this.cueStick.lineBetween(startX + 2, startY + 2, endX + 2, endY + 2);

    // Main wood stick body
    this.cueStick.lineStyle(5, 0xc084fc, 1);
    this.cueStick.lineBetween(startX, startY, endX, endY);

    // Tip & Ferrule
    const tipX = startX + dirX * 10;
    const tipY = startY + dirY * 10;
    this.cueStick.lineStyle(5, 0xffffff, 1);
    this.cueStick.lineBetween(startX, startY, tipX, tipY);
  }

  public drawOpponentCueStick(cx: number, cy: number, angleRad: number): void {
    this.drawCueStickAt(cx, cy, angleRad, 0.8, 4);
    this.scene.time.delayedCall(600, () => this.hideAim());
  }

  // ═══════════════════════════════════════════════════════════
  //  HUD UI HELPERS
  // ═══════════════════════════════════════════════════════════

  public setNames(
    p1Id: string,
    p1Name: string,
    p2Id: string,
    p2Name: string,
  ): void {
    this.p1NameText.setText(p1Name);
    this.p2NameText.setText(p2Name);

    const p1Color = 0x38bdf8;
    const p1Key = `avatar_${p1Id || "p1"}`;
    this.generateAvatarTexture(p1Name, p1Color, p1Key);
    const p1AvatarX = TABLE_X - 70;
    const p1AvatarY = 300;

    this.p1Avatar.removeAll(true);
    const p1Img = this.scene.add.image(0, 0, p1Key);
    const p1Label = this.scene.add
      .text(22, 0, p1Name, {
        font: "bold 16px Arial, sans-serif",
        color: "#38bdf8",
      })
      .setOrigin(0, 0.5);
    this.p1Avatar.add([p1Img, p1Label]);
    this.p1Avatar.setPosition(p1AvatarX, p1AvatarY);
    this.p1Avatar.setVisible(true);

    const p2Color = 0xf43f5e;
    const p2Key = `avatar_${p2Id || "p2"}`;
    this.generateAvatarTexture(p2Name, p2Color, p2Key);
    const p2AvatarX = TABLE_X + TABLE_W + 70;
    const p2AvatarY = 300;

    this.p2Avatar.removeAll(true);
    const p2Img = this.scene.add.image(0, 0, p2Key);
    const p2Label = this.scene.add
      .text(22, 0, p2Name, {
        font: "bold 16px Arial, sans-serif",
        color: "#f43f5e",
      })
      .setOrigin(0, 0.5);
    this.p2Avatar.add([p2Img, p2Label]);
    this.p2Avatar.setPosition(p2AvatarX, p2AvatarY);
    this.p2Avatar.setVisible(true);
  }

  private generateAvatarTexture(
    name: string,
    color: number,
    textureKey: string,
  ): void {
    if (this.scene.textures.exists(textureKey)) return;
    const size = 36;
    const canvasTex = this.scene.textures.createCanvas(textureKey, size, size);
    if (!canvasTex) return;
    const ctx = canvasTex.context;

    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const letter = name.charAt(0).toUpperCase();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, size / 2, size / 2 + 0.5);

    canvasTex.refresh();
  }

  public setTurnText(msg: string, color: string = "#f97316"): void {
    this.turnText.setText(msg).setColor(color);
  }

  public updateTurnUI(myNum: number, isMyTurn: boolean): void {
    if (isMyTurn) {
      this.setTurnText("نوبت شماست", "#f97316");
      this.setPowerEnabled(true);
    } else {
      this.setTurnText("نوبت حریف", "#94a3b8");
      this.setPowerEnabled(false);
    }
  }

  public setInfo(msg: string): void {
    this.infoText.setText(msg);
  }

  public showFoul(msg: string): void {
    this.foulText.setText(msg).setVisible(true);
    this.scene.time.delayedCall(2500, () => this.foulText.setVisible(false));
  }

  public updateGroupDisplay(
    myNum: number,
    p1Group: any,
    p2Group: any,
    p1Pockets: number[],
    p2Pockets: number[],
    remP1: number,
    remP2: number,
  ): void {
    if (!p1Group) {
      this.groupText.setText("");
      this.p1GroupIndicators.setVisible(false);
      this.p2GroupIndicators.setVisible(false);
      return;
    }
    this.groupText.setText(
      `P1: ${p1Group} (${remP1} left) | P2: ${p2Group} (${remP2} left)`,
    );

    this.buildGroupIndicator(
      p1Group,
      p1Pockets,
      this.p1GroupIndicators,
      TABLE_X - 70,
      350,
    );
    this.buildGroupIndicator(
      p2Group,
      p2Pockets,
      this.p2GroupIndicators,
      TABLE_X + TABLE_W + 70,
      350,
    );
    this.p1GroupIndicators.setVisible(true);
    this.p2GroupIndicators.setVisible(true);
  }

  private buildGroupIndicator(
    group: string,
    pocketed: number[],
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
  ): void {
    container.removeAll(true);
    container.setPosition(x, y);

    const isSolids = group === "solids";
    const ballNums = isSolids
      ? [1, 2, 3, 4, 5, 6, 7]
      : [9, 10, 11, 12, 13, 14, 15];

    const ballColors: Record<number, string> = {
      1: "#f1c40f",
      2: "#2980b9",
      3: "#e74c3c",
      4: "#8e44ad",
      5: "#e67e22",
      6: "#27ae60",
      7: "#78281f",
      9: "#f1c40f",
      10: "#2980b9",
      11: "#e74c3c",
      12: "#8e44ad",
      13: "#e67e22",
      14: "#27ae60",
      15: "#78281f",
    };

    const dotR = 7;
    const spacing = 18;

    ballNums.forEach((num, idx) => {
      const isPocketed = pocketed.includes(num);
      const dx = idx * spacing;
      const g = this.scene.add.graphics();

      if (isPocketed) {
        g.fillStyle(0x333333, 0.5);
        g.fillCircle(dx, 0, dotR);
        g.lineStyle(1.5, 0x555555, 0.4);
        g.strokeCircle(dx, 0, dotR);
      } else {
        const color = Phaser.Display.Color.HexStringToColor(
          ballColors[num] || "#888888",
        ).color;
        g.fillStyle(color, 1);
        g.fillCircle(dx, 0, dotR);
        g.fillStyle(0xffffff, 0.25);
        g.fillCircle(dx - 2, -2, dotR * 0.35);
        g.lineStyle(1, 0x000000, 0.3);
        g.strokeCircle(dx, 0, dotR);

        const label = this.scene.add
          .text(dx, 0, String(num), {
            font: "bold 8px Arial, sans-serif",
            color: "#ffffff",
          })
          .setOrigin(0.5, 0.5);
        container.add(label);
      }

      container.add(g);
    });
  }

  public showGameOverOverlay(won: boolean): void {
    const { width: w, height: h } = this.scene.scale;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x000000, 0.75);
    bg.fillRect(0, 0, w, h);

    const txt = won ? "🏆 شما برنده شدید!" : "باختید!";
    const color = won ? "#22c55e" : "#ef4444";

    this.scene.add
      .text(w / 2, h / 2, txt, {
        font: "bold 36px Arial, sans-serif",
        color,
      })
      .setOrigin(0.5)
      .setDepth(40);
  }

  public isDraggingPower(): boolean {
    return this.powerControl ? this.powerControl.isDraggingPower() : false;
  }
}
