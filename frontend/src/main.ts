/**
 * 8-Ball Pool - Main Entry Point
 * Phaser 3 game with Matter.js physics
 * Mobile-first: game dimensions match viewport for full-screen feel
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WaitingScene } from './scenes/WaitingScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { GAME_W, GAME_H } from './gameConfig';

// Fixed game world with margin around the table.
// Phaser's FIT + CENTER_BOTH handles responsive scaling and centering.
// Use Canvas renderer for WebView compatibility (some Android WebViews
// have WebGL issues that cause black screens).
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  parent: 'game-container',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      enableSleeping: true,
      sleepThreshold: 30,
      debug: false,
      positionIterations: 15,
      velocityIterations: 10,
    } as any,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  pixelArt: false,
  // resolution: use type assertion — property exists at runtime but missing from phaser 3.80 types
  ...({ resolution: Math.min(window.devicePixelRatio || 1, 2) } as any),
  scene: [BootScene, WaitingScene, GameScene, ResultScene],
  input: {
    activePointers: 2,
  },
  dom: {
    createContainer: true,
  },
};

// Remove loading screen when game bootstraps
const loadingEl = document.getElementById('loading-screen');
if (loadingEl) {
  loadingEl.style.display = 'none';
}

// Lock to landscape on mobile (Android + supported browsers)
if ((screen?.orientation as any)?.lock) {
  (screen.orientation as any).lock('landscape').catch(() => {
    // Silently fail on unsupported devices (iOS, etc.)
  });
}

const game = new Phaser.Game(config);

// Expose game instance for debugging/testing
(window as any).__game = game;
