import Phaser from 'phaser';
import { wsClient } from '../network/wsClient';
import { LANG } from '../lang';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Load minimal assets for the waiting screen
    // Gradients and UI are drawn programmatically
  }

  create(): void {
    // Hide the HTML loading screen now that Phaser has actually rendered.
    const loadingEl = document.getElementById('loading-screen');
    if (loadingEl) loadingEl.style.display = 'none';

    const { width, height } = this.scale;
    const params = new URLSearchParams(window.location.search);

    // Isolated renderer playground: intentionally does not connect to the game.
    if (params.get('scene') === 'ball-lab') {
      this.scene.start('BallAnimationLabScene');
      return;
    }

    // Debug: skip to GameScene directly with practice data
    if (params.get('scene') === 'game') {
      const mockData = {
        player1_id: 'p1_debug',
        player1_name: 'شما',
        player2_id: 'p2_debug',
        player2_name: 'حریف',
        break_player: 1,
        ball_positions: null,
      };
      this.scene.start('GameScene', { gameData: mockData });
      return;
    }

    // Debug: skip to ResultScene
    if (params.get('scene') === 'result') {
      const isWinner = params.get('win') !== '0';
      this.scene.start('ResultScene', {
        result: {
          winner: isWinner ? 'p1_debug' : 'p2_debug',
          winner_name: isWinner ? 'شما' : 'حریف',
          reason: 'pocketed_8_ball',
        },
      });
      return;
    }

    // Background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0f0c29, 0x302b63, 0x24243e, 0x24243e, 1);
    bg.fillRect(0, 0, width, height);

    // Title
    this.add.text(width / 2, height * 0.25, LANG.bootTitle, {
      fontSize: '42px',
      fontFamily: 'IRANSans, Vazir, Tahoma, Arial, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Connecting text
    const statusText = this.add.text(width / 2, height * 0.5, LANG.connecting, {
      fontSize: '24px',
      fontFamily: 'IRANSans, Vazir, Tahoma, Arial, sans-serif',
      color: '#f97316',
    }).setOrigin(0.5);

    // Animated dots
    let dots = 0;
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        dots = (dots + 1) % 4;
        statusText.setText(LANG.connecting + ' .'.repeat(dots));
      },
    });

    // Set up connection timeout
    const timeout = this.time.delayedCall(10000, () => {
      statusText.setText(LANG.connectionFailedRetry);
    });

    // Connect WebSocket
    wsClient.connect()
      .then(() => {
        timeout.destroy();
        this.scene.start('WaitingScene');
      })
      .catch((err) => {
        console.error('Connection error:', err);
        statusText.setText(LANG.connectionFailedRefresh);
      });
  }
}
