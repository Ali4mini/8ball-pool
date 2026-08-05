/**
 * Modern Mobile HUD for 8-Ball Game
 * Features clean top header (Avatars, Names, Group Badges),
 * 2x font sizes, auto-fading toast notifications,
 * and 🚫 prohibition warnings for illegal target balls.
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

  // Top Header UI
  private headerContainer!: Phaser.GameObjects.Container;
  private p1CardBg!: Phaser.GameObjects.Graphics;
  private p2CardBg!: Phaser.GameObjects.Graphics;

  private p1NameText!: Phaser.GameObjects.Text;
  private p2NameText!: Phaser.GameObjects.Text;
  private p1GroupLabel!: Phaser.GameObjects.Text;
  private p2GroupLabel!: Phaser.GameObjects.Text;

  // Avatars
  private p1AvatarImg?: Phaser.GameObjects.Image;
  private p2AvatarImg?: Phaser.GameObjects.Image;

  // Floating Toast / Banners
  private toastContainer!: Phaser.GameObjects.Container;
  private toastText!: Phaser.GameObjects.Text;
  private foulText!: Phaser.GameObjects.Text;

  // State
  private p1Name: string = "Player 1";
  private p2Name: string = "Player 2";
  private p1Id: string = "";
  private p2Id: string = "";

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.aimGraphics = scene.add.graphics().setDepth(10);
    this.cueStick = scene.add.graphics().setDepth(11);

    this.createHeaderUI();
    this.createToastUI();
    this.createPowerControlUI();
  }

  // ═══════════════════════════════════════════════════════════
  //  TOP SCOREBOARD HEADER UI
  // ═══════════════════════════════════════════════════════════

  private createHeaderUI(): void {
    const { width: screenW } = this.scene.scale;
    this.headerContainer = this.scene.add.container(0, 0).setDepth(20);

    // 1. Player 1 Scorecard (Left)
    this.p1CardBg = this.scene.add.graphics();
    this.p1NameText = this.scene.add.text(80, 8, "Player 1", {
      font: "bold 36px Tahoma, Arial, sans-serif",
      color: "#38bdf8",
      stroke: "#000000",
      strokeThickness: 5,
    });
    this.p1GroupLabel = this.scene.add.text(80, 48, "", {
      font: "bold 26px Tahoma, Arial, sans-serif",
      color: "#cbd5e1",
      stroke: "#000000",
      strokeThickness: 4,
    });

    this.headerContainer.add([
      this.p1CardBg,
      this.p1NameText,
      this.p1GroupLabel,
    ]);

    // 2. Player 2 Scorecard (Right)
    this.p2CardBg = this.scene.add.graphics();
    this.p2NameText = this.scene.add
      .text(screenW - 80, 8, "Player 2", {
        font: "bold 36px Tahoma, Arial, sans-serif",
        color: "#f43f5e",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(1, 0);
    this.p2GroupLabel = this.scene.add
      .text(screenW - 80, 48, "", {
        font: "bold 26px Tahoma, Arial, sans-serif",
        color: "#cbd5e1",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(1, 0);

    this.headerContainer.add([
      this.p2CardBg,
      this.p2NameText,
      this.p2GroupLabel,
    ]);

    // Foul Banner Text
    this.foulText = this.scene.add
      .text(screenW / 2, 100, "", {
        font: "bold 32px Tahoma, Arial, sans-serif",
        color: "#ef4444",
        backgroundColor: "#000000ee",
        padding: { x: 24, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);
  }

  // ═══════════════════════════════════════════════════════════
  //  FLOATING TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════

  private createToastUI(): void {
    const { width: screenW, height: screenH } = this.scene.scale;

    this.toastContainer = this.scene.add
      .container(screenW / 2, screenH - 45)
      .setDepth(20)
      .setAlpha(0);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.lineStyle(2, 0x475569, 1);
    bg.fillRoundedRect(-220, -26, 440, 52, 26);
    bg.strokeRoundedRect(-220, -26, 440, 52, 26);

    this.toastText = this.scene.add
      .text(0, 0, "", {
        font: "bold 28px Tahoma, Arial, sans-serif",
        color: "#f1f5f9",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.toastContainer.add([bg, this.toastText]);
  }

  public setInfo(msg: string): void {
    if (!msg) {
      this.toastContainer.setAlpha(0);
      return;
    }

    this.toastText.setText(msg);
    this.toastContainer.setAlpha(1);

    this.scene.tweens.killTweensOf(this.toastContainer);
    this.scene.tweens.add({
      targets: this.toastContainer,
      alpha: 0,
      delay: 2200,
      duration: 400,
    });
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

  public isDraggingPower(): boolean {
    return this.powerControl ? this.powerControl.isDraggingPower() : false;
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
  //  AIMING TRAJECTORY PREDICTION & CUE STICK
  // ═══════════════════════════════════════════════════════════

  public drawAim(
    cx: number,
    cy: number,
    angleRad: number,
    power: number,
    balls: { number: number; x: number; y: number }[],
    myGroup: any = null,
    ownRemaining: number = 7,
  ): void {
    this.aimGraphics.clear();

    const hit = this.calculateTrajectory(cx, cy, angleRad, balls);

    if (hit) {
      const g = this.aimGraphics;

      let isLegal = true;
      if (hit.type === "ball" && hit.hitBallNumber !== undefined) {
        isLegal = this.isTargetBallLegal(
          hit.hitBallNumber,
          myGroup,
          ownRemaining,
        );
      }

      const lineColor = isLegal ? 0xffffff : 0xef4444;
      const lineAlpha = isLegal ? 0.95 : 0.85;

      // A) Main Aiming Line (Cue ball -> Ghost ball)
      g.lineStyle(4, 0x000000, 0.4);
      g.lineBetween(cx, cy, hit.ghostX, hit.ghostY);
      g.lineStyle(2, lineColor, lineAlpha);
      g.lineBetween(cx, cy, hit.ghostX, hit.ghostY);

      if (isLegal) {
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
          const tbLen = 90;
          const tbEndX = hit.hitBallX + (hit.targetBallDirX || 0) * tbLen;
          const tbEndY = hit.hitBallY + (hit.targetBallDirY || 0) * tbLen;

          g.lineStyle(3, 0x000000, 0.4);
          g.lineBetween(hit.hitBallX, hit.hitBallY, tbEndX, tbEndY);
          g.lineStyle(1.5, 0xfacc15, 0.95);
          g.lineBetween(hit.hitBallX, hit.hitBallY, tbEndX, tbEndY);
          g.fillStyle(0xfacc15, 1);
          g.fillCircle(tbEndX, tbEndY, 3);

          const cbLen = 60;
          const cbEndX = hit.ghostX + (hit.cueDeflectDirX || 0) * cbLen;
          const cbEndY = hit.ghostY + (hit.cueDeflectDirY || 0) * cbLen;

          g.lineStyle(3, 0x000000, 0.3);
          g.lineBetween(hit.ghostX, hit.ghostY, cbEndX, cbEndY);
          g.lineStyle(1.5, 0xffffff, 0.7);
          g.lineBetween(hit.ghostX, hit.ghostY, cbEndX, cbEndY);
        } else if (hit.type === "cushion") {
          const bounceLen = 100;
          const bounceEndX = hit.ghostX + (hit.reflectionDirX || 0) * bounceLen;
          const bounceEndY = hit.ghostY + (hit.reflectionDirY || 0) * bounceLen;

          g.lineStyle(3, 0x000000, 0.4);
          g.lineBetween(hit.ghostX, hit.ghostY, bounceEndX, bounceEndY);
          g.lineStyle(1.5, 0x38bdf8, 0.9);
          g.lineBetween(hit.ghostX, hit.ghostY, bounceEndX, bounceEndY);
        }
      } else {
        // 🚫 ILLEGAL TARGET WARNING
        this.drawCancelIcon(g, hit.ghostX, hit.ghostY, BALL_RADIUS + 3);
        if (hit.hitBallX !== undefined && hit.hitBallY !== undefined) {
          this.drawCancelIcon(g, hit.hitBallX, hit.hitBallY, BALL_RADIUS + 5);
        }
      }
    }

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

    const combinedR = r * 2;
    const combinedR2 = combinedR * combinedR;

    for (const b of balls) {
      if (b.number === 0) continue;

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
          wallGhostY = maxY;
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
    const offsetBack = BALL_RADIUS + 6 + power * 4;

    const backAngle = angleRad + Math.PI;
    const dirX = Math.cos(backAngle);
    const dirY = Math.sin(backAngle);

    const startX = cx + dirX * offsetBack;
    const startY = cy + dirY * offsetBack;
    const endX = startX + dirX * length;
    const endY = startY + dirY * length;

    this.cueStick.lineStyle(6, 0x000000, 0.35);
    this.cueStick.lineBetween(startX + 2, startY + 2, endX + 2, endY + 2);

    this.cueStick.lineStyle(5, 0xc084fc, 1);
    this.cueStick.lineBetween(startX, startY, endX, endY);

    const tipX = startX + dirX * 10;
    const tipY = startY + dirY * 10;
    this.cueStick.lineStyle(5, 0xffffff, 1);
    this.cueStick.lineBetween(startX, startY, tipX, tipY);
  }

  public drawOpponentCueStick(cx: number, cy: number, angleRad: number): void {
    this.drawCueStickAt(cx, cy, angleRad, 0.8, 4);
    this.scene.time.delayedCall(600, () => this.hideAim());
  }

  private isTargetBallLegal(
    ballNum: number,
    myGroup: any,
    ownRemaining: number,
  ): boolean {
    if (ballNum === 0) return false;

    let groupType: "solids" | "stripes" | null = null;
    if (myGroup === "solids" || myGroup === 1 || myGroup === "1") {
      groupType = "solids";
    } else if (myGroup === "stripes" || myGroup === 2 || myGroup === "2") {
      groupType = "stripes";
    }

    if (!groupType) {
      return ballNum !== 8;
    }

    if (ownRemaining > 0) {
      if (groupType === "solids") {
        return ballNum >= 1 && ballNum <= 7;
      } else if (groupType === "stripes") {
        return ballNum >= 9 && ballNum <= 15;
      }
    }

    if (ownRemaining === 0) {
      return ballNum === 8;
    }

    return true;
  }

  private drawCancelIcon(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
  ): void {
    g.fillStyle(0xef4444, 0.3);
    g.fillCircle(x, y, radius);

    g.lineStyle(3, 0xef4444, 1);
    g.strokeCircle(x, y, radius);

    const offset = radius * 0.707;
    g.lineStyle(3, 0xef4444, 1);
    g.lineBetween(x - offset, y - offset, x + offset, y + offset);
  }

  // ═══════════════════════════════════════════════════════════
  //  STATE UPDATES & PLAYER AVATARS
  // ═══════════════════════════════════════════════════════════

  public setNames(
    p1Id: string,
    p1Name: string,
    p2Id: string,
    p2Name: string,
  ): void {
    this.p1Id = p1Id;
    this.p1Name = p1Name;
    this.p2Id = p2Id;
    this.p2Name = p2Name;

    this.p1NameText.setText(p1Name);
    this.p2NameText.setText(p2Name);

    const p1Key = `avatar_${p1Id || "p1"}`;
    this.generateAvatarTexture(p1Name, 0x38bdf8, p1Key);
    if (this.p1AvatarImg) this.p1AvatarImg.destroy();
    this.p1AvatarImg = this.scene.add.image(40, 40, p1Key);
    this.headerContainer.add(this.p1AvatarImg);

    const p2Key = `avatar_${p2Id || "p2"}`;
    this.generateAvatarTexture(p2Name, 0xf43f5e, p2Key);
    if (this.p2AvatarImg) this.p2AvatarImg.destroy();
    this.p2AvatarImg = this.scene.add.image(
      this.scene.scale.width - 40,
      40,
      p2Key,
    );
    this.headerContainer.add(this.p2AvatarImg);
  }

  private generateAvatarTexture(
    name: string,
    color: number,
    textureKey: string,
  ): void {
    if (this.scene.textures.exists(textureKey)) return;
    const size = 64;
    const canvasTex = this.scene.textures.createCanvas(textureKey, size, size);
    if (!canvasTex) return;
    const ctx = canvasTex.context;

    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();

    const letter = name.charAt(0).toUpperCase();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Tahoma, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, size / 2, size / 2 + 2);

    canvasTex.refresh();
  }

  public setTurnText(msg: string, color: string = "#f97316"): void {
    // No-op (turn badge removed from top)
  }

  public updateTurnUI(myNum: number, isMyTurn: boolean): void {
    this.setPowerEnabled(isMyTurn);
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
      this.p1GroupLabel.setText("");
      this.p2GroupLabel.setText("");
      return;
    }

    this.p1GroupLabel.setText(p1Group === "solids" ? "تک‌رنگ" : "دو‌رنگ");
    this.p2GroupLabel.setText(p2Group === "solids" ? "تک‌رنگ" : "دو‌رنگ");
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
        font: "bold 44px Tahoma, Arial, sans-serif",
        color,
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(40);
  }
}
