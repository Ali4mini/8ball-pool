/**
 * Heads-Up Display for the 8-ball game.
 * Owns all UI elements: player cards, turn indicator, group badges,
 * pocketed/remaining counters, aim line, cue stick, power bar,
 * foul text, info text, and game-over overlay.
 */
import Phaser from 'phaser';
import { LANG } from '../lang';
import { Group } from '../rules';
import { config as gameCfg } from '../config';

export interface PlayerInfo {
  name: string;
  id: string;
}

export class HUD {
  private scene: Phaser.Scene;

  // Player cards
  private p1Card!: Phaser.GameObjects.Graphics;
  private p2Card!: Phaser.GameObjects.Graphics;
  private p1NameText!: Phaser.GameObjects.Text;
  private p2NameText!: Phaser.GameObjects.Text;

  // Group tracking
  private p1GroupBadge!: Phaser.GameObjects.Graphics;
  private p2GroupBadge!: Phaser.GameObjects.Graphics;
  private p1PocketedText!: Phaser.GameObjects.Text;
  private p2PocketedText!: Phaser.GameObjects.Text;
  private p1RemainingText!: Phaser.GameObjects.Text;
  private p2RemainingText!: Phaser.GameObjects.Text;
  private groupTexts: Phaser.GameObjects.Text[] = [];

  // Turn indicator
  private turnDot1!: Phaser.GameObjects.Graphics;
  private turnDot2!: Phaser.GameObjects.Graphics;
  private turnText!: Phaser.GameObjects.Text;

  // Aim / shot
  aimLine!: Phaser.GameObjects.Graphics;
  cueStick!: Phaser.GameObjects.Graphics;
  private powerBar!: Phaser.GameObjects.Graphics;
  private powerBarBg!: Phaser.GameObjects.Graphics;
  private powerLabel!: Phaser.GameObjects.Text;

  // Info
  infoText!: Phaser.GameObjects.Text;
  private foulText!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildUI();
  }

  // ─── Build all UI elements ────────────────────────────────
  private buildUI(): void {
    const { width, height } = this.scene.scale;
    const cardY = 10;
    const cardH = 60;
    const cardW = 150;

    // ── P1 card (left) ──
    this.p1Card = this.scene.add.graphics();
    this.p1Card.fillStyle(0x000000, 0.4);
    this.p1Card.fillRoundedRect(10, cardY, cardW, cardH, 8);

    this.p1NameText = this.scene.add.text(16, cardY + 4, '', {
      fontSize: '13px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#f97316', fontStyle: 'bold',
    });
    this.groupTexts[0] = this.scene.add.text(16, cardY + 22, '', {
      fontSize: '10px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#888888',
    });
    this.p1GroupBadge = this.scene.add.graphics().setVisible(false);
    this.p1PocketedText = this.scene.add.text(16, cardY + 36, '', {
      fontSize: '10px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#666666',
    });
    this.p1RemainingText = this.scene.add.text(16, cardY + 48, '', {
      fontSize: '9px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#555555',
    });

    // ── P2 card (right) ──
    const p2x = width - 10 - cardW;
    this.p2Card = this.scene.add.graphics();
    this.p2Card.fillStyle(0x000000, 0.4);
    this.p2Card.fillRoundedRect(p2x, cardY, cardW, cardH, 8);

    this.p2NameText = this.scene.add.text(p2x + cardW - 16, cardY + 4, '', {
      fontSize: '13px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#aaaaaa', fontStyle: 'bold',
    }).setOrigin(1, 0);
    this.groupTexts[1] = this.scene.add.text(p2x + cardW - 16, cardY + 22, '', {
      fontSize: '10px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#888888',
    }).setOrigin(1, 0);
    this.p2GroupBadge = this.scene.add.graphics().setVisible(false);
    this.p2PocketedText = this.scene.add.text(p2x + cardW - 16, cardY + 36, '', {
      fontSize: '10px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#666666',
    }).setOrigin(1, 0);
    this.p2RemainingText = this.scene.add.text(p2x + cardW - 16, cardY + 48, '', {
      fontSize: '9px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#555555',
    }).setOrigin(1, 0);

    // ── Turn indicator dots ──
    this.turnDot1 = this.scene.add.graphics().setVisible(false);
    this.turnDot2 = this.scene.add.graphics().setVisible(false);

    // ── Turn indicator pill ──
    const turnBg = this.scene.add.graphics();
    turnBg.fillStyle(0xf97316, 0.15);
    turnBg.fillRoundedRect(width / 2 - 70, cardY + 2, 140, 28, 14);
    turnBg.lineStyle(1, 0xf97316, 0.3);
    turnBg.strokeRoundedRect(width / 2 - 70, cardY + 2, 140, 28, 14);
    this.turnText = this.scene.add.text(width / 2, cardY + 16, '', {
      fontSize: '13px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#f97316', fontStyle: 'bold',
    }).setOrigin(0.5);

    // ── Info text ──
    this.infoText = this.scene.add.text(width / 2, height - 16, '', {
      fontSize: '13px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#888888',
    }).setOrigin(0.5, 1);

    // ── Power bar ──
    const pbX = width - 32;
    const pbY = height * 0.3;
    const pbH = height * 0.35;
    const pbBg = this.scene.add.graphics();
    pbBg.fillStyle(0x222222, 0.8);
    pbBg.fillRoundedRect(pbX - 6, pbY, 12, pbH, 6);
    pbBg.lineStyle(1, 0x444444, 0.5);
    pbBg.strokeRoundedRect(pbX - 6, pbY, 12, pbH, 6);
    const tickH = pbH / 10;
    for (let i = 1; i < 10; i++) {
      pbBg.fillStyle(0xffffff, 0.05); pbBg.fillRect(pbX - 4, pbY + i * tickH, 8, 1);
    }
    this.powerBarBg = pbBg;
    this.powerBarBg.setAlpha(0);
    this.powerBar = this.scene.add.graphics();
    this.powerBar.setAlpha(0);
    this.powerLabel = this.scene.add.text(pbX, pbY + pbH + 10, '0%', {
      fontSize: '11px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#888888',
    }).setOrigin(0.5, 0).setAlpha(0);

    // ── Aim line + cue stick ──
    this.aimLine = this.scene.add.graphics();
    this.aimLine.setAlpha(0.5);
    this.cueStick = this.scene.add.graphics();
    this.cueStick.setAlpha(0);

    // ── Foul text ──
    this.foulText = this.scene.add.text(width / 2, height * 0.35, '', {
      fontSize: '26px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#ff4444', fontStyle: 'bold',
      backgroundColor: '#000000aa', padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setAlpha(0);
  }

  // ─── Player names ──────────────────────────────────────────
  setNames(p1Name: string, p2Name: string): void {
    this.p1NameText.setText(p1Name || LANG.player1);
    this.p2NameText.setText(p2Name || LANG.player2);
  }

  // ─── Turn indicator ───────────────────────────────────────
  updateTurnUI(myPlayerNum: number, isMyTurn: boolean): void {
    const { width } = this.scene.scale;
    const cardY = 10; const cardH = 60; const cardW = 150;
    const p2x = width - 10 - cardW;
    const activeNum = isMyTurn ? myPlayerNum : (myPlayerNum === 1 ? 2 : 1);

    this.p1Card.lineStyle(2, activeNum === 1 ? 0xf97316 : 0x444444, activeNum === 1 ? 0.8 : 0.3);
    this.p1Card.strokeRoundedRect(10, cardY, cardW, cardH, 8);
    this.p2Card.lineStyle(2, activeNum === 2 ? 0xf97316 : 0x444444, activeNum === 2 ? 0.8 : 0.3);
    this.p2Card.strokeRoundedRect(p2x, cardY, cardW, cardH, 8);
    this.p1NameText.setColor(activeNum === 1 ? '#f97316' : '#666666');
    this.p2NameText.setColor(activeNum === 2 ? '#f97316' : '#666666');

    const dotR = 5;
    this.turnDot1.clear(); this.turnDot2.clear();
    if (activeNum === 1) {
      this.turnDot1.fillStyle(0xf97316, 0.9);
      this.turnDot1.fillCircle(10 + cardW + 8, cardY + cardH / 2, dotR);
      this.turnDot1.setVisible(true); this.turnDot2.setVisible(false);
    } else {
      this.turnDot2.fillStyle(0xf97316, 0.9);
      this.turnDot2.fillCircle(p2x - 8, cardY + cardH / 2, dotR);
      this.turnDot2.setVisible(true); this.turnDot1.setVisible(false);
    }
  }

  setTurnText(text: string, color: string = '#f97316'): void {
    this.turnText.setText(text); this.turnText.setColor(color);
  }

  // ─── Info text ────────────────────────────────────────────
  setInfo(text: string): void { this.infoText.setText(text); }

  // ─── Foul text (auto-fade after 3s) ───────────────────────
  showFoul(message: string): void {
    this.foulText.setText(message);
    this.foulText.setAlpha(1);
    this.scene.tweens.add({ targets: this.foulText, alpha: 0, delay: 3000, duration: 500 });
  }

  // ─── Group & pocket tracking ──────────────────────────────
  updateGroupDisplay(
    myPlayerNum: number,
    player1Group: Group,
    player2Group: Group,
    pocketedByPlayer1: number[],
    pocketedByPlayer2: number[],
    remainingP1: number,
    remainingP2: number,
  ): void {
    const cardW = 150;
    const p2x = this.scene.scale.width - 10 - cardW;
    const myGroup = myPlayerNum === 1 ? player1Group : player2Group;
    const oppGroup = myPlayerNum === 1 ? player2Group : player1Group;

    this.groupTexts[0].setText(
      myPlayerNum === 1
        ? (myGroup ? LANG.yourGroup(myGroup) : '')
        : (oppGroup ? LANG.opponentGroup(oppGroup) : '')
    );
    this.groupTexts[1].setText(
      myPlayerNum === 1
        ? (oppGroup ? LANG.opponentGroup(oppGroup) : '')
        : (myGroup ? LANG.yourGroup(myGroup) : '')
    );

    this.drawGroupBadge(this.p1GroupBadge, player1Group, 130, 16);
    this.drawGroupBadge(this.p2GroupBadge, player2Group, p2x + 6, 16);
    this.p1PocketedText.setText(pocketedByPlayer1.length > 0 ? `📥 ${pocketedByPlayer1.length}` : '');
    this.p2PocketedText.setText(pocketedByPlayer2.length > 0 ? `📥 ${pocketedByPlayer2.length}` : '');
    this.p1GroupBadge.setVisible(player1Group !== null);
    this.p2GroupBadge.setVisible(player2Group !== null);
    this.p1RemainingText.setText(player1Group ? `◉ ${remainingP1} باقی` : '');
    this.p2RemainingText.setText(player2Group ? `◉ ${remainingP2} باقی` : '');
  }

  private drawGroupBadge(g: Phaser.GameObjects.Graphics, group: string | null, x: number, y: number): void {
    g.clear();
    if (!group) return;
    if (group === 'solids') { g.fillStyle(0xf1c40f, 1); g.fillCircle(x, y, 6); }
    else { g.fillStyle(0xffffff, 1); g.fillCircle(x, y, 6); g.fillStyle(0xf1c40f, 1); g.fillRect(x - 6, y - 1.5, 12, 3); }
    g.lineStyle(1, 0xffffff, 0.3); g.strokeCircle(x, y, 6);
  }

  // ─── Game-over overlay ────────────────────────────────────
  showGameOverOverlay(won: boolean): void {
    const { width, height } = this.scene.scale;
    const overlay = this.scene.add.graphics().setDepth(50);
    overlay.fillStyle(won ? 0x004400 : 0x440000, 0.4);
    overlay.fillRect(0, 0, width, height);
    overlay.setAlpha(0);
    this.scene.tweens.add({ targets: overlay, alpha: 1, duration: 400 });
    const text = this.scene.add.text(width / 2, height / 2, won ? LANG.youWon : LANG.youLost, {
      fontSize: '48px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial, sans-serif',
      fontStyle: 'bold', color: won ? '#44ff44' : '#ff4444',
    }).setOrigin(0.5).setDepth(51).setAlpha(0);
    this.scene.tweens.add({ targets: text, alpha: 1, duration: 500, delay: 300 });
  }

  // ─── Aim line + cue stick + power bar ─────────────────────
  drawAim(cx: number, cy: number, angle: number, power: number): void {
    this.aimLine.clear();
    this.aimLine.setAlpha(0.7);
    const lineLen = 400;
    // Dotted ghost line
    this.aimLine.lineStyle(1, 0xffffff, 0.2);
    for (let i = 0; i < 40; i += 2) {
      const t1 = i / 40, t2 = (i + 1) / 40;
      this.aimLine.beginPath();
      this.aimLine.moveTo(cx + Math.cos(angle) * t1 * lineLen, cy + Math.sin(angle) * t1 * lineLen);
      this.aimLine.lineTo(cx + Math.cos(angle) * t2 * lineLen, cy + Math.sin(angle) * t2 * lineLen);
      this.aimLine.strokePath();
    }
    // Cue stick
    this.drawCueStickAt(cx, cy, angle, 0.9);
    this.updatePowerBar(power);
  }

  hideAim(): void {
    this.aimLine.setAlpha(0);
    this.powerBar.setAlpha(0);
    this.powerBarBg.setAlpha(0);
    this.powerLabel.setAlpha(0);
    this.cueStick.setAlpha(0);
  }

  showPowerUI(): void {
    this.powerBarBg.setAlpha(1);
    this.powerLabel.setAlpha(1);
  }

  /** Draw the cue stick behind the cue ball. Used for both local and opponent visuals. */
  drawCueStickAt(cx: number, cy: number, angle: number, alpha: number): void {
    this.cueStick.clear();
    if (alpha <= 0) { this.cueStick.setAlpha(0); return; }
    this.cueStick.setAlpha(alpha);
    const stickAngle = angle + Math.PI;
    const stickLen = 140;
    const sx = cx + Math.cos(stickAngle) * 16, sy = cy + Math.sin(stickAngle) * 16;
    const ex = cx + Math.cos(stickAngle) * (stickLen + 16), ey = cy + Math.sin(stickAngle) * (stickLen + 16);
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2;

    this.cueStick.lineStyle(7, 0x000000, 0.15);
    this.cueStick.beginPath(); this.cueStick.moveTo(sx + 1, sy + 2); this.cueStick.lineTo(ex + 1, ey + 2); this.cueStick.strokePath();
    this.cueStick.lineStyle(5, 0xd4a574, 0.7);
    this.cueStick.beginPath(); this.cueStick.moveTo(sx, sy); this.cueStick.lineTo(midX, midY); this.cueStick.strokePath();
    this.cueStick.lineStyle(5, 0x5c3317, 0.7);
    this.cueStick.beginPath(); this.cueStick.moveTo(midX, midY); this.cueStick.lineTo(ex, ey); this.cueStick.strokePath();
    this.cueStick.lineStyle(3, 0xeeeeee, 0.6);
    this.cueStick.beginPath(); this.cueStick.moveTo(sx, sy);
    this.cueStick.lineTo(sx + Math.cos(stickAngle) * 10, sy + Math.sin(stickAngle) * 10); this.cueStick.strokePath();
    this.cueStick.fillStyle(0x3355aa, 0.5);
    this.cueStick.fillCircle(sx, sy, 3);
  }

  /** Draw opponent's cue stick as a separate fading graphic. */
  drawOpponentCueStick(cx: number, cy: number, angleRad: number): void {
    const stick = this.scene.add.graphics();
    const stickAngle = angleRad + Math.PI;
    const stickLen = 140;
    const sx = cx + Math.cos(stickAngle) * 16, sy = cy + Math.sin(stickAngle) * 16;
    const ex = cx + Math.cos(stickAngle) * (stickLen + 16), ey = cy + Math.sin(stickAngle) * (stickLen + 16);
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2;
    stick.lineStyle(7, 0x000000, 0.2);
    stick.beginPath(); stick.moveTo(sx + 1, sy + 2); stick.lineTo(ex + 1, ey + 2); stick.strokePath();
    stick.lineStyle(5, 0xd4a574, 0.9);
    stick.beginPath(); stick.moveTo(sx, sy); stick.lineTo(midX, midY); stick.strokePath();
    stick.lineStyle(5, 0x5c3317, 0.9);
    stick.beginPath(); stick.moveTo(midX, midY); stick.lineTo(ex, ey); stick.strokePath();
    stick.lineStyle(3, 0xeeeeee, 0.8);
    stick.beginPath(); stick.moveTo(sx, sy);
    stick.lineTo(sx + Math.cos(stickAngle) * 10, sy + Math.sin(stickAngle) * 10); stick.strokePath();
    stick.fillStyle(0x3355aa, 0.7); stick.fillCircle(sx, sy, 3);
    this.scene.tweens.add({ targets: stick, alpha: 0, duration: 500, onComplete: () => stick.destroy() });
  }

  private updatePowerBar(power: number): void {
    const { width, height } = this.scene.scale;
    const pbX = width - 32, pbY = height * 0.3, pbH = height * 0.35;
    const pct = Math.round((power / 20) * 100);
    this.powerLabel.setText(`${pct}%`);
    this.powerBar.clear();
    if (power > 0) {
      const fillH = (power / 20) * pbH;
      const color = power > 15 ? 0xff4444 : power > 10 ? 0xff8800 : 0x44ff44;
      this.powerBar.fillStyle(color, 0.8);
      this.powerBar.fillRoundedRect(pbX - 6, pbY + pbH - fillH, 12, fillH, 3);
      this.powerBar.setAlpha(1);
    }
  }
}
