import Phaser from 'phaser';
import { wsClient } from '../network/wsClient';
import { LANG } from '../lang';

export class WaitingScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private opponentText!: Phaser.GameObjects.Text;
  private animatedCircle!: Phaser.GameObjects.Graphics;
  private ready = false;
  private angle = 0;

  constructor() {
    super({ key: 'WaitingScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a1a, 0x16213e, 0x0a0a14, 0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);

    // Vignette
    const vig = this.add.graphics();
    vig.fillGradientStyle(0x000000, 0x000000, 0x00000000, 0x00000000, 1);
    vig.fillRect(0, 0, width, 80);
    const vigB = this.add.graphics();
    vigB.fillGradientStyle(0x00000000, 0x00000000, 0x000000, 0x000000, 1);
    vigB.fillRect(0, height - 80, width, 80);

    // Title — large billiard emoji
    this.add.text(width / 2, height * 0.18, '🎱', {
      fontSize: '80px',
    }).setOrigin(0.5);

    // Waiting text
    this.add.text(width / 2, height * 0.30, LANG.waitingTitle, {
      fontSize: '28px',
      fontFamily: 'IRANSans, Vazir, Tahoma, Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.38, LANG.waitingForOpponent, {
      fontSize: '16px',
      fontFamily: 'IRANSans, Vazir, Tahoma, Arial, sans-serif',
      color: '#999999',
    }).setOrigin(0.5);

    // Animated pulsing circle
    this.animatedCircle = this.add.graphics();
    this.drawPulsingCircle(width / 2, height * 0.52);

    // Status text (dots)
    this.statusText = this.add.text(width / 2, height * 0.52, '', {
      fontSize: '28px',
      fontFamily: 'IRANSans, Vazir, Tahoma, Arial, sans-serif',
      color: '#f97316',
    }).setOrigin(0.5);

    let dots = 0;
    this.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        dots = (dots + 1) % 4;
        this.statusText.setText('.'.repeat(dots));
      },
    });

    // Opponent info area (hidden until they join)
    this.opponentText = this.add.text(width / 2, height * 0.62, '', {
      fontSize: '16px',
      fontFamily: 'IRANSans, Vazir, Tahoma, Arial, sans-serif',
      color: '#44ff44',
    }).setOrigin(0.5).setAlpha(0);

    // Cancel button
    const cancelBtn = this.add.text(width / 2, height * 0.82, LANG.cancel, {
      fontSize: '16px',
      fontFamily: 'IRANSans, Vazir, Tahoma, Arial, sans-serif',
      color: '#ff6666',
      backgroundColor: '#331111',
      padding: { x: 28, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    cancelBtn.on('pointerover', () => cancelBtn.setColor('#ff4444'));
    cancelBtn.on('pointerout', () => cancelBtn.setColor('#ff6666'));
    cancelBtn.on('pointerdown', () => {
      wsClient.disconnect();
      window.history.back();
    });

    // Listen for game_start event
    wsClient.on('game_start', (data: any) => {
      this.scene.start('GameScene', { gameData: data });
    });

    wsClient.on('opponent_joined', (data: any) => {
      this.opponentText.setText(LANG.opponentFound(data.opponent_name));
      this.opponentText.setAlpha(1);
      // Pulse the text
      this.tweens.add({
        targets: this.opponentText,
        scaleX: { from: 1.2, to: 1 },
        scaleY: { from: 1.2, to: 1 },
        duration: 500,
        ease: 'Back.easeOut',
      });
    });

    wsClient.on('room_joined', (data: any) => {
      // no-op
    });

    wsClient.on('waiting_for_opponent', () => {
      // no-op
    });

    wsClient.on('error', (data: any) => {
      this.statusText.setText(data.message || 'خطا رخ داد');
      this.statusText.setColor('#ff4444');
    });
  }

  update(): void {
    this.angle += 0.02;
    if (this.animatedCircle) {
      this.drawPulsingCircle(this.scale.width / 2, this.scale.height * 0.52);
    }
  }

  private drawPulsingCircle(cx: number, cy: number): void {
    this.animatedCircle.clear();
    const pulse = Math.sin(this.angle) * 4;
    const r = 10 + pulse;
    this.animatedCircle.lineStyle(2, 0xf97316, 0.6);
    this.animatedCircle.strokeCircle(cx, cy, r);
    this.animatedCircle.fillStyle(0xf97316, 0.15);
    this.animatedCircle.fillCircle(cx, cy, r);
  }
}
