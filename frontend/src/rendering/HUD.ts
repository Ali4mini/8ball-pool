/**
 * Heads-Up Display for the 8-ball game.
 * Top-corner player cards show: avatar, username, ball type to pocket.
 * Turn border, aim line, cue stick, power bar, foul text, info text.
 */
import Phaser from 'phaser';
import { LANG } from '../lang';
import { Group } from '../rules';
import { config as gameCfg } from '../config';

// ─── Deterministic avatar color from player ID ──────────────
const AVATAR_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0x2980b9, 0x27ae60, 0xc0392b,
  0x16a085, 0x8e44ad, 0xd35400, 0x2c3e50, 0xf1c40f,
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return Math.abs(h);
}

function avatarColorFor(id: string): number {
  return AVATAR_COLORS[hashId(id) % AVATAR_COLORS.length];
}

function avatarLetter(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

// ─── Ball type icon constants ───────────────────────────────
const SOLIDS_COLOR = 0xf1c40f;
const STRIPES_COLOR = 0xf1c40f;
const EIGHT_COLOR = 0x111111;

export interface PlayerInfo {
  name: string;
  id: string;
}

export class HUD {
  private scene: Phaser.Scene;

  // Player cards
  private p1Card!: Phaser.GameObjects.Graphics;
  private p2Card!: Phaser.GameObjects.Graphics;
  private p1Avatar!: Phaser.GameObjects.Graphics;
  private p2Avatar!: Phaser.GameObjects.Graphics;
  private p1AvatarText!: Phaser.GameObjects.Text;
  private p2AvatarText!: Phaser.GameObjects.Text;
  private p1NameText!: Phaser.GameObjects.Text;
  private p2NameText!: Phaser.GameObjects.Text;

  // Ball-type indicators (graphics + text per card)
  private p1BallIcon!: Phaser.GameObjects.Graphics;
  private p2BallIcon!: Phaser.GameObjects.Graphics;
  private p1BallText!: Phaser.GameObjects.Text;
  private p2BallText!: Phaser.GameObjects.Text;

  // Pocketed count
  private p1PocketedText!: Phaser.GameObjects.Text;
  private p2PocketedText!: Phaser.GameObjects.Text;

  // Turn indicator dot
  private turnDot1!: Phaser.GameObjects.Graphics;
  private turnDot2!: Phaser.GameObjects.Graphics;

  // Turn pill
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
    const cardY = 8;
    const cardH = 64;
    const cardW = 160;
    const avatarR = 14;              // avatar circle radius
    const avatarXOff = 12;           // avatar left offset within card
    const avatarY = cardY + 6;       // avatar top
    const avatarCX = avatarXOff + avatarR;
    const avatarCY = avatarY + avatarR;
    const nameX = avatarCX + avatarR + 6;

    // ── P1 card (left) ──
    this.p1Card = this.scene.add.graphics();

    // Avatar circle + letter
    this.p1Avatar = this.scene.add.graphics();
    this.p1AvatarText = this.scene.add.text(avatarCX, avatarCY, '', {
      fontSize: '15px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.p1NameText = this.scene.add.text(nameX, avatarCY - 6, '', {
      fontSize: '12px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', fontStyle: 'bold',
    });

    // Ball type indicator
    this.p1BallIcon = this.scene.add.graphics();
    this.p1BallText = this.scene.add.text(avatarXOff, cardY + 40, '', {
      fontSize: '10px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#cccccc',
    });

    // Pocketed count
    this.p1PocketedText = this.scene.add.text(cardW - 8, avatarCY - 6, '', {
      fontSize: '11px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#888888',
    }).setOrigin(1, 0.5);

    // ── P2 card (right) ──
    const p2x = width - 10 - cardW;
    this.p2Card = this.scene.add.graphics();

    this.p2Avatar = this.scene.add.graphics();
    const p2AvatarCX = p2x + avatarXOff + avatarR;
    const p2AvatarCY = avatarY + avatarR;
    this.p2AvatarText = this.scene.add.text(p2AvatarCX, p2AvatarCY, '', {
      fontSize: '15px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const p2NameX = p2AvatarCX + avatarR + 6;
    this.p2NameText = this.scene.add.text(p2NameX, p2AvatarCY - 6, '', {
      fontSize: '12px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', fontStyle: 'bold',
    });

    this.p2BallIcon = this.scene.add.graphics();
    this.p2BallText = this.scene.add.text(p2x + avatarXOff, cardY + 40, '', {
      fontSize: '10px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#cccccc',
    });

    this.p2PocketedText = this.scene.add.text(p2x + cardW - 8, p2AvatarCY - 6, '', {
      fontSize: '11px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#888888',
    }).setOrigin(1, 0.5);

    // ── Turn indicator dots ──
    this.turnDot1 = this.scene.add.graphics().setVisible(false);
    this.turnDot2 = this.scene.add.graphics().setVisible(false);

    // ── Turn pill ──
    const turnBg = this.scene.add.graphics();
    turnBg.fillStyle(0xf97316, 0.15);
    turnBg.fillRoundedRect(width / 2 - 70, 8, 140, 26, 13);
    turnBg.lineStyle(1, 0xf97316, 0.3);
    turnBg.strokeRoundedRect(width / 2 - 70, 8, 140, 26, 13);
    this.turnText = this.scene.add.text(width / 2, 21, '', {
      fontSize: '12px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#f97316', fontStyle: 'bold',
    }).setOrigin(0.5);

    // ── Info text ──
    this.infoText = this.scene.add.text(width / 2, height - 14, '', {
      fontSize: '12px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#888888',
    }).setOrigin(0.5, 1);

    // ── Power bar ──
    const pbX = width - 32, pbY = height * 0.3, pbH = height * 0.35;
    const pbBg = this.scene.add.graphics();
    pbBg.fillStyle(0x222222, 0.8);
    pbBg.fillRoundedRect(pbX - 6, pbY, 12, pbH, 6);
    pbBg.lineStyle(1, 0x444444, 0.5);
    pbBg.strokeRoundedRect(pbX - 6, pbY, 12, pbH, 6);
    for (let i = 1; i < 10; i++) {
      pbBg.fillStyle(0xffffff, 0.05); pbBg.fillRect(pbX - 4, pbY + i * (pbH / 10), 8, 1);
    }
    this.powerBarBg = pbBg;
    this.powerBarBg.setAlpha(0);
    this.powerBar = this.scene.add.graphics();
    this.powerBar.setAlpha(0);
    this.powerLabel = this.scene.add.text(pbX, pbY + pbH + 10, '0%', {
      fontSize: '10px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#888888',
    }).setOrigin(0.5, 0).setAlpha(0);

    // ── Aim line + cue stick ──
    this.aimLine = this.scene.add.graphics();
    this.aimLine.setAlpha(0.5);
    this.cueStick = this.scene.add.graphics();
    this.cueStick.setAlpha(0);

    // ── Foul text ──
    this.foulText = this.scene.add.text(width / 2, height * 0.35, '', {
      fontSize: '24px', fontFamily: 'IRANSans, Vazir, Tahoma, Arial', color: '#ff4444', fontStyle: 'bold',
      backgroundColor: '#000000aa', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setAlpha(0);
  }

  // ─── Draw ball-type icon (circle) ─────────────────────────
  private drawBallIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, group: Group): void {
    g.clear();
    if (group === 'solids') {
      g.fillStyle(SOLIDS_COLOR, 1);
      g.fillCircle(x, y, r);
      g.lineStyle(1, 0xffffff, 0.3);
      g.strokeCircle(x, y, r);
    } else if (group === 'stripes') {
      // White circle with yellow stripe band through middle
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y, r);
      g.fillStyle(STRIPES_COLOR, 1);
      g.fillRect(x - r, y - r * 0.35, r * 2, r * 0.7);
      g.lineStyle(1, 0x999999, 0.4);
      g.strokeCircle(x, y, r);
      // Thin stripe lines
      g.lineStyle(1, STRIPES_COLOR, 0.6);
      g.beginPath(); g.moveTo(x - r, y - r * 0.15); g.lineTo(x + r, y - r * 0.15); g.strokePath();
      g.beginPath(); g.moveTo(x - r, y + r * 0.15); g.lineTo(x + r, y + r * 0.15); g.strokePath();
    } else {
      // 8-ball icon (no group yet)
      g.fillStyle(EIGHT_COLOR, 1);
      g.fillCircle(x, y, r);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y, r * 0.45);
      g.fillStyle(EIGHT_COLOR, 1);
      g.fillCircle(x, y, r * 0.25);
      g.lineStyle(1, 0xffffff, 0.2);
      g.strokeCircle(x, y, r);
    }
  }

  // ─── Draw avatar circle ───────────────────────────────────
  private drawAvatar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
    g.clear();
    g.fillStyle(color, 1);
    g.fillCircle(x, y, r);
    g.lineStyle(1.5, 0xffffff, 0.15);
    g.strokeCircle(x, y, r);
  }

  // ─── Set player names + generate avatars ──────────────────
  setNames(p1Id: string, p1Name: string, p2Id: string, p2Name: string): void {
    const cardY = 8;
    const avatarR = 14;
    const avatarXOff = 12;
    const avatarY = cardY + 6;
    const avatarCX = avatarXOff + avatarR;
    const avatarCY = avatarY + avatarR;

    // P1 avatar
    const c1 = avatarColorFor(p1Id);
    this.drawAvatar(this.p1Avatar, avatarCX, avatarCY, avatarR, c1);
    this.p1AvatarText.setText(avatarLetter(p1Name));

    // P2 avatar
    const { width } = this.scene.scale;
    const cardW = 160;
    const p2x = width - 10 - cardW;
    const p2AvatarCX = p2x + avatarXOff + avatarR;
    const p2AvatarCY = avatarY + avatarR;
    const c2 = avatarColorFor(p2Id);
    this.drawAvatar(this.p2Avatar, p2AvatarCX, p2AvatarCY, avatarR, c2);
    this.p2AvatarText.setText(avatarLetter(p2Name));

    // Names
    this.p1NameText.setText(p1Name || LANG.player1);
    this.p2NameText.setText(p2Name || LANG.player2);
  }

  // ─── Turn indicator ───────────────────────────────────────
  updateTurnUI(myPlayerNum: number, isMyTurn: boolean): void {
    const { width } = this.scene.scale;
    const cardY = 8; const cardH = 64; const cardW = 160;
    const p2x = width - 10 - cardW;
    const activeNum = isMyTurn ? myPlayerNum : (myPlayerNum === 1 ? 2 : 1);

    // Card borders
    this.p1Card.clear();
    this.p1Card.fillStyle(0x000000, 0.35);
    this.p1Card.fillRoundedRect(10, cardY, cardW, cardH, 10);
    this.p1Card.lineStyle(2, activeNum === 1 ? 0xf97316 : 0x444444, activeNum === 1 ? 0.8 : 0.3);
    this.p1Card.strokeRoundedRect(10, cardY, cardW, cardH, 10);

    this.p2Card.clear();
    this.p2Card.fillStyle(0x000000, 0.35);
    this.p2Card.fillRoundedRect(p2x, cardY, cardW, cardH, 10);
    this.p2Card.lineStyle(2, activeNum === 2 ? 0xf97316 : 0x444444, activeNum === 2 ? 0.8 : 0.3);
    this.p2Card.strokeRoundedRect(p2x, cardY, cardW, cardH, 10);

    this.p1NameText.setColor(activeNum === 1 ? '#f97316' : '#888888');
    this.p2NameText.setColor(activeNum === 2 ? '#f97316' : '#888888');

    // Turn dot
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

  // ─── Foul text ────────────────────────────────────────────
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
    _remainingP1: number,
    _remainingP2: number,
  ): void {
    const cardW = 160;
    const p2x = this.scene.scale.width - 10 - cardW;

    // P1 ball type
    this.drawBallIcon(this.p1BallIcon, 20, 52, 7, player1Group);
    this.p1BallText.setText(
      player1Group === 'solids' ? 'توپ ساده' :
      player1Group === 'stripes' ? 'توپ خط‌دار' :
      '🎱'
    );

    // P2 ball type
    this.drawBallIcon(this.p2BallIcon, p2x + 20, 52, 7, player2Group);
    this.p2BallText.setText(
      player2Group === 'solids' ? 'توپ ساده' :
      player2Group === 'stripes' ? 'توپ خط‌دار' :
      '🎱'
    );

    // Pocketed counts
    this.p1PocketedText.setText(pocketedByPlayer1.length > 0 ? `${pocketedByPlayer1.length}` : '');
    this.p2PocketedText.setText(pocketedByPlayer2.length > 0 ? `${pocketedByPlayer2.length}` : '');
  }

  // ─── Ball-type helper for outside use (e.g. GameScene) ─────
  setGroupOnly(playerNum: number, group: Group, p1Group: Group, p2Group: Group): void {
    const cardW = 160;
    const p2x = this.scene.scale.width - 10 - cardW;
    const g = playerNum === 1 ? p1Group : p2Group;

    if (playerNum === 1) {
      this.drawBallIcon(this.p1BallIcon, 20, 52, 7, g);
      this.p1BallText.setText(
        g === 'solids' ? 'توپ ساده' :
        g === 'stripes' ? 'توپ خط‌دار' : '🎱'
      );
    } else {
      this.drawBallIcon(this.p2BallIcon, p2x + 20, 52, 7, g);
      this.p2BallText.setText(
        g === 'solids' ? 'توپ ساده' :
        g === 'stripes' ? 'توپ خط‌دار' : '🎱'
      );
    }
  }

  // ─── Game-over overlay ────────────────────────────────────
  showGameOverOverlay(won: boolean): void {
    const { width, height } = this.scene.scale;
    const overlay = this.scene.add.graphics().setDepth(50);
    overlay.fillStyle(won ? 0x004400 : 0x440000, 0.4);
    overlay.fillRect(0, 0, width, height).setAlpha(0);
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
    this.aimLine.lineStyle(1, 0xffffff, 0.2);
    for (let i = 0; i < 40; i += 2) {
      const t1 = i / 40, t2 = (i + 1) / 40;
      this.aimLine.beginPath();
      this.aimLine.moveTo(cx + Math.cos(angle) * t1 * lineLen, cy + Math.sin(angle) * t1 * lineLen);
      this.aimLine.lineTo(cx + Math.cos(angle) * t2 * lineLen, cy + Math.sin(angle) * t2 * lineLen);
      this.aimLine.strokePath();
    }
    this.drawCueStickAt(cx, cy, angle, 0.9, power);
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

  drawCueStickAt(cx: number, cy: number, angle: number, alpha: number, pullPower: number = 0): void {
    this.cueStick.clear();
    if (alpha <= 0) { this.cueStick.setAlpha(0); return; }
    this.cueStick.setAlpha(alpha);
    const stickAngle = angle + Math.PI;
    // Stick extends as you pull back — visual feedback of power
    const stickLen = 200 + pullPower * 6;
    const pullOffset = pullPower * 2.5;
    const sx = cx + Math.cos(stickAngle) * (18 + pullOffset), sy = cy + Math.sin(stickAngle) * (18 + pullOffset);
    const ex = cx + Math.cos(stickAngle) * (stickLen + 18 + pullOffset), ey = cy + Math.sin(stickAngle) * (stickLen + 18 + pullOffset);
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2;
    this.cueStick.lineStyle(9, 0x000000, 0.2);
    this.cueStick.beginPath(); this.cueStick.moveTo(sx + 1, sy + 2); this.cueStick.lineTo(ex + 1, ey + 2); this.cueStick.strokePath();
    this.cueStick.lineStyle(6, 0xd4a574, 0.9);
    this.cueStick.beginPath(); this.cueStick.moveTo(sx, sy); this.cueStick.lineTo(midX, midY); this.cueStick.strokePath();
    this.cueStick.lineStyle(6, 0x5c3317, 0.9);
    this.cueStick.beginPath(); this.cueStick.moveTo(midX, midY); this.cueStick.lineTo(ex, ey); this.cueStick.strokePath();
    this.cueStick.lineStyle(4, 0xeeeeee, 0.8);
    this.cueStick.beginPath(); this.cueStick.moveTo(sx, sy);
    this.cueStick.lineTo(sx + Math.cos(stickAngle) * 14, sy + Math.sin(stickAngle) * 14); this.cueStick.strokePath();
    this.cueStick.fillStyle(0x3355aa, 0.6);
    this.cueStick.fillCircle(sx, sy, 4);
  }

  drawOpponentCueStick(cx: number, cy: number, angleRad: number): void {
    const stick = this.scene.add.graphics();
    const stickAngle = angleRad + Math.PI;
    const stickLen = 200;
    const sx = cx + Math.cos(stickAngle) * 18, sy = cy + Math.sin(stickAngle) * 18;
    const ex = cx + Math.cos(stickAngle) * (stickLen + 18), ey = cy + Math.sin(stickAngle) * (stickLen + 18);
    const midX = (sx + ex) / 2, midY = (sy + ey) / 2;
    stick.lineStyle(9, 0x000000, 0.25);
    stick.beginPath(); stick.moveTo(sx + 1, sy + 2); stick.lineTo(ex + 1, ey + 2); stick.strokePath();
    stick.lineStyle(6, 0xd4a574, 0.95);
    stick.beginPath(); stick.moveTo(sx, sy); stick.lineTo(midX, midY); stick.strokePath();
    stick.lineStyle(6, 0x5c3317, 0.95);
    stick.beginPath(); stick.moveTo(midX, midY); stick.lineTo(ex, ey); stick.strokePath();
    stick.lineStyle(4, 0xeeeeee, 0.85);
    stick.beginPath(); stick.moveTo(sx, sy);
    stick.lineTo(sx + Math.cos(stickAngle) * 14, sy + Math.sin(stickAngle) * 14); stick.strokePath();
    stick.fillStyle(0x3355aa, 0.7); stick.fillCircle(sx, sy, 4);
    this.scene.tweens.add({ targets: stick, alpha: 0, duration: 500, onComplete: () => stick.destroy() });
  }

  private updatePowerBar(power: number): void {
    const { width, height } = this.scene.scale;
    const pbX = width - 32, pbY = height * 0.3, pbH = height * 0.35;
    const pct = Math.round((power / 14) * 100);
    this.powerLabel.setText(`${pct}%`);
    this.powerBar.clear();
    if (power > 0) {
      const fillH = (power / 14) * pbH;
      const color = power > 10 ? 0xff4444 : power > 7 ? 0xff8800 : 0x44ff44;
      this.powerBar.fillStyle(color, 0.8);
      this.powerBar.fillRoundedRect(pbX - 6, pbY + pbH - fillH, 12, fillH, 3);
      this.powerBar.setAlpha(1);
    }
  }
}
