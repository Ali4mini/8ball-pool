/**
 * Modern Mobile HUD for 8-Ball Game
 * Features profile avatar loading, 60s turn timer ring animation,
 * transparent top header, and mini ball type badges.
 */
import Phaser from "phaser";
import { PowerControl } from "./PowerControl";
import { BALL_RADIUS, PLAY_L, PLAY_R, PLAY_T, PLAY_B } from "../gameConfig";

export class HUD {
  private scene: Phaser.Scene;

  // Graphics objects
  private aimGraphics: Phaser.GameObjects.Graphics;
  public cueStick: Phaser.GameObjects.Graphics;
  private timerGraphics: Phaser.GameObjects.Graphics;

  // Last drawn aim parameters for caching
  private lastDrawnAngleRad = 0;
  private lastDrawnPower = 0;

  // Turn Timer State
  private timerActivePlayer: 1 | 2 | null = null;
  private timerStartTime = 0;
  private timerDuration = 60000; // 60 seconds in ms

  // Power Control Component
  public powerControl!: PowerControl;

  // Top Header UI
  private headerContainer!: Phaser.GameObjects.Container;
  private p1CardBg!: Phaser.GameObjects.Graphics;
  private p2CardBg!: Phaser.GameObjects.Graphics;

  private p1NameText!: Phaser.GameObjects.Text;
  private p2NameText!: Phaser.GameObjects.Text;
  private p1GroupBadge!: Phaser.GameObjects.Graphics;
  private p2GroupBadge!: Phaser.GameObjects.Graphics;

  // Avatars
  private p1AvatarContainer?: Phaser.GameObjects.Container;
  private p2AvatarContainer?: Phaser.GameObjects.Container;

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
    this.timerGraphics = scene.add.graphics().setDepth(25);

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
      font: "bold 32px Tahoma, Arial, sans-serif",
      color: "#38bdf8",
      stroke: "#000000",
      strokeThickness: 5,
    });
    this.p1GroupBadge = this.scene.add.graphics();

    this.headerContainer.add([
      this.p1CardBg,
      this.p1NameText,
      this.p1GroupBadge,
    ]);

    // 2. Player 2 Scorecard (Right)
    this.p2CardBg = this.scene.add.graphics();
    this.p2NameText = this.scene.add
      .text(screenW - 80, 8, "Player 2", {
        font: "bold 32px Tahoma, Arial, sans-serif",
        color: "#f43f5e",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(1, 0);
    this.p2GroupBadge = this.scene.add.graphics();

    this.headerContainer.add([
      this.p2CardBg,
      this.p2NameText,
      this.p2GroupBadge,
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
  //  TURN TIMEOUT RING ANIMATION (60s Counter-Clockwise Draining)
  // ═══════════════════════════════════════════════════════════

  public startTurnTimer(playerNum: 1 | 2, durationSec: number = 60): void {
    this.timerActivePlayer = playerNum;
    this.timerStartTime = Date.now();
    this.timerDuration = durationSec * 1000;
  }

  public stopTurnTimer(): void {
    this.timerActivePlayer = null;
    if (this.timerGraphics) {
      this.timerGraphics.clear();
    }
  }

  public updateTimer(): void {
    if (!this.timerActivePlayer) {
      if (this.timerGraphics) this.timerGraphics.clear();
      return;
    }

    const elapsed = Date.now() - this.timerStartTime;
    const remaining = Math.max(0, this.timerDuration - elapsed);
    const ratio = remaining / this.timerDuration; // 1.0 -> 0.0

    const { width: screenW } = this.scene.scale;
    const posX = this.timerActivePlayer === 1 ? 40 : screenW - 40;
    const posY = 40;
    const radius = 33;

    this.timerGraphics.clear();

    if (ratio <= 0) return;

    // Color transition: Neon Orange (>25% left) -> Warning Red (<=25% left)
    const color = ratio > 0.25 ? 0xf97316 : 0xef4444;

    // Start angle top (-90 degrees) draining counter-clockwise
    const startAngle = Phaser.Math.DegToRad(-90);
    const endAngle = startAngle + Phaser.Math.DegToRad(360 * ratio);

    // Subtle dark background guide ring
    this.timerGraphics.lineStyle(5, 0x000000, 0.5);
    this.timerGraphics.strokeCircle(posX, posY, radius);

    // Draining timer arc
    this.timerGraphics.lineStyle(5, color, 1);
    this.timerGraphics.beginPath();
    this.timerGraphics.arc(posX, posY, radius, startAngle, endAngle, false);
    this.timerGraphics.strokePath();
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
    const angleChanged =
      Math.abs(angleRad - this.lastDrawnAngleRad) > 0.01;
    const powerChanged = Math.abs(power - this.lastDrawnPower) > 0.1;

    if (!angleChanged && !powerChanged) {
      this.drawCueStickAt(cx, cy, angleRad, 1, power);
      return;
    }

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

      g.lineStyle(4, 0x000000, 0.4);
      g.lineBetween(cx, cy, hit.ghostX, hit.ghostY);
      g.lineStyle(2, lineColor, lineAlpha);
      g.lineBetween(cx, cy, hit.ghostX, hit.ghostY);

      if (isLegal) {
        g.fillStyle(0xffffff, 0.15);
        g.fillCircle(hit.ghostX, hit.ghostY, BALL_RADIUS);
        g.lineStyle(1.5, 0xffffff, 0.85);
        g.strokeCircle(hit.ghostX, hit.ghostY, BALL_RADIUS);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(hit.ghostX, hit.ghostY, 2);

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
          const bounceLen = 80;
          const bounceEndX = hit.ghostX + (hit.reflectionDirX || 0) * bounceLen;
          const bounceEndY = hit.ghostY + (hit.reflectionDirY || 0) * bounceLen;

          g.lineStyle(3, 0x000000, 0.4);
          g.lineBetween(hit.ghostX, hit.ghostY, bounceEndX, bounceEndY);
          g.lineStyle(1.5, 0x38bdf8, 0.9);
          g.lineBetween(hit.ghostX, hit.ghostY, bounceEndX, bounceEndY);
        }
      } else {
        this.drawCancelIcon(g, hit.ghostX, hit.ghostY, BALL_RADIUS + 3);
        if (hit.hitBallX !== undefined && hit.hitBallY !== undefined) {
          this.drawCancelIcon(g, hit.hitBallX, hit.hitBallY, BALL_RADIUS + 5);
        }
      }
    }

    this.drawCueStickAt(cx, cy, angleRad, 1, power);

    this.lastDrawnAngleRad = angleRad;
    this.lastDrawnPower = power;
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
  ) {
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    const r = BALL_RADIUS;
    const minX = PLAY_L + r;
    const maxX = PLAY_R - r;
    const minY = PLAY_T + r;
    const maxY = PLAY_B - r;

    let closestDist = Infinity;
    let bestHit: any = null;

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
    let reflDx = 0;
    let reflDy = 0;

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
    const offsetBack = BALL_RADIUS + 8 + power * 4;

    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    const startX = cx - dx * offsetBack;
    const startY = cy - dy * offsetBack;
    const endX = startX - dx * length;
    const endY = startY - dy * length;

    this.cueStick.lineStyle(6, 0x000000, 0.35);
    this.cueStick.lineBetween(startX + 2, startY + 2, endX + 2, endY + 2);

    this.cueStick.lineStyle(5, 0xc084fc, 1);
    this.cueStick.lineBetween(startX, startY, endX, endY);

    const tipX = startX - dx * 10;
    const tipY = startY - dy * 10;
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
  //  BALL TYPE MINI BADGES
  // ═══════════════════════════════════════════════════════════

  private drawGroupBadge(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    group: "solids" | "stripes",
  ): void {
    g.clear();
    const r = 14;

    if (group === "solids") {
      g.fillStyle(0xf1c40f, 1);
      g.fillCircle(x, y, r);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y, 6);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(x - 4, y - 4, 3);
      g.lineStyle(2, 0x000000, 0.6);
      g.strokeCircle(x, y, r);
    } else {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y, r);
      g.fillStyle(0x2980b9, 1);
      g.fillRect(x - 13, y - 6, 26, 12);
      g.lineStyle(2, 0x000000, 0.6);
      g.strokeCircle(x, y, r);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y, 5);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(x - 4, y - 4, 3);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  STATE UPDATES & PLAYER AVATARS
  // ═══════════════════════════════════════════════════════════

  public setNames(
    p1Id: string,
    p1Name: string,
    p2Id: string,
    p2Name: string,
    p1Avatar?: string,
    p2Avatar?: string,
  ): void {
    this.p1Id = p1Id;
    this.p1Name = p1Name;
    this.p2Id = p2Id;
    this.p2Name = p2Name;

    this.p1NameText.setText(p1Name);
    this.p2NameText.setText(p2Name);

    this.renderPlayerAvatar(p1Id, p1Name, 0x38bdf8, p1Avatar, false);
    this.renderPlayerAvatar(p2Id, p2Name, 0xf43f5e, p2Avatar, true);
  }

  private renderPlayerAvatar(
    id: string,
    name: string,
    color: number,
    avatarUrl: string | undefined,
    isRight: boolean,
  ): void {
    const { width: screenW } = this.scene.scale;
    const posX = isRight ? screenW - 40 : 40;
    const posY = 40;
    const textureKey = `avatar_${id || (isRight ? "p2" : "p1")}`;

    if (isRight && this.p2AvatarContainer) {
      this.p2AvatarContainer.destroy();
    } else if (!isRight && this.p1AvatarContainer) {
      this.p1AvatarContainer.destroy();
    }

    const container = this.scene.add.container(posX, posY);
    this.headerContainer.add(container);

    if (isRight) this.p2AvatarContainer = container;
    else this.p1AvatarContainer = container;

    // 1. If texture already exists in Phaser
    if (this.scene.textures.exists(textureKey)) {
      this.addAvatarSpriteToContainer(container, textureKey, color);
      return;
    }

    // 2. Load cross-origin remote image with Canvas clipping
    if (
      avatarUrl &&
      (avatarUrl.startsWith("http://") ||
        avatarUrl.startsWith("https://") ||
        avatarUrl.startsWith("data:image"))
    ) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = avatarUrl;
      img.onload = () => {
        if (this.scene && this.scene.textures) {
          if (this.scene.textures.exists(textureKey)) {
            this.scene.textures.remove(textureKey);
          }

          const size = 64;
          const canvasTex = this.scene.textures.createCanvas(
            textureKey,
            size,
            size,
          );
          if (canvasTex) {
            const ctx = canvasTex.context;
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, 0, 0, size, size);
            canvasTex.refresh();
          }

          this.addAvatarSpriteToContainer(container, textureKey, color);
        }
      };
      img.onerror = () => {
        // Fallback to letter avatar
        this.generateAvatarTexture(name, color, textureKey);
        this.addAvatarSpriteToContainer(container, textureKey, color);
      };
    } else {
      // Fallback to letter avatar
      this.generateAvatarTexture(name, color, textureKey);
      this.addAvatarSpriteToContainer(container, textureKey, color);
    }
  }

  private addAvatarSpriteToContainer(
    container: Phaser.GameObjects.Container,
    textureKey: string,
    borderHex: number,
  ): void {
    const sprite = this.scene.add.image(0, 0, textureKey);
    sprite.setDisplaySize(58, 58);

    // Outer glow ring
    const ring = this.scene.add.graphics();
    ring.lineStyle(3, borderHex, 1);
    ring.strokeCircle(0, 0, 29);

    container.add([sprite, ring]);
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

    const letter = (name || "?").charAt(0).toUpperCase();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Tahoma, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, size / 2, size / 2 + 2);

    canvasTex.refresh();
  }

  public setTurnText(msg: string, color: string = "#f97316"): void {
    // No-op
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
    const { width: screenW } = this.scene.scale;

    if (!p1Group) {
      this.p1GroupBadge.clear();
      this.p2GroupBadge.clear();
      return;
    }

    const grp1 =
      p1Group === "solids" || p1Group === 1 || p1Group === "1"
        ? "solids"
        : "stripes";
    const grp2 =
      p2Group === "solids" || p2Group === 1 || p2Group === "1"
        ? "solids"
        : "stripes";

    this.drawGroupBadge(this.p1GroupBadge, 96, 52, grp1);
    this.drawGroupBadge(this.p2GroupBadge, screenW - 96, 52, grp2);
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
