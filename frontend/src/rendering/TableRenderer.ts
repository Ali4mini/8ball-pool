/**
 * Renders the 8-ball pool table, cushions, pockets, walls, and background.
 * Pure visual + physics body setup — no game state dependency.
 */
import Phaser from 'phaser';
import {
  GAME_W, GAME_H,
  TABLE_X, TABLE_Y, TABLE_W, TABLE_H,
  PLAY_L, PLAY_T, PLAY_R, PLAY_B, PLAY_W, PLAY_H,
  BALL_RADIUS, POCKET_R, POCKET_R_INSET, CUSHION_W,
  CUE_SPOT_X, RACK_X, RACK_Y,
} from '../gameConfig';

export interface TableSkin {
  cloth: number;
  cushion: number;
  pocket: number;
}

export const SKIN_COLORS: Record<string, TableSkin> = {
  classic: { cloth: 0x35654d, cushion: 0x6b3a1f, pocket: 0x222222 },
  premium: { cloth: 0x1a5276, cushion: 0x8b6914, pocket: 0x111111 },
  neon: { cloth: 0x0d2818, cushion: 0x00ff88, pocket: 0x111111 },
  crimson: { cloth: 0x4a0e1c, cushion: 0x8b4513, pocket: 0x111111 },
};

export interface TableAssets {
  wallBodies: MatterJS.Body[];
  pocketSensors: MatterJS.Body[];
}

export class TableRenderer {
  static draw(scene: Phaser.Scene, skinName: string): TableAssets {
    const skin = SKIN_COLORS[skinName] || SKIN_COLORS.classic;
    TableRenderer.drawBackground(scene);
    TableRenderer.drawTable(scene, skin);
    TableRenderer.createPocketGraphics(scene, skin.pocket);
    TableRenderer.createCushionGraphics(scene);
    const wallBodies = TableRenderer.createWallBodies(scene);
    const pocketSensors = TableRenderer.createPocketSensors(scene);
    return { wallBodies, pocketSensors };
  }

  private static drawBackground(scene: Phaser.Scene): void {
    const { width: w, height: h } = scene.scale;
    const bg = scene.add.graphics();
    bg.fillGradientStyle(0x0a0a1a, 0x16213e, 0x0a0a14, 0x1a1a2e, 1);
    bg.fillRect(0, 0, w, h);

    const vig = scene.add.graphics();
    vig.fillGradientStyle(0x000000, 0x000000, 0x00000000, 0x00000000, 1);
    vig.fillRect(0, 0, w, 60);
    const vigB = scene.add.graphics();
    vigB.fillGradientStyle(0x00000000, 0x00000000, 0x000000, 0x000000, 1);
    vigB.fillRect(0, h - 60, w, 60);

    for (let i = 0; i < 12; i++) {
      const px = Phaser.Math.Between(0, w);
      const py = Phaser.Math.Between(0, h);
      const dot = scene.add.graphics();
      dot.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.02, 0.06));
      dot.fillCircle(0, 0, Phaser.Math.Between(1, 3));
      dot.setPosition(px, py);
      scene.tweens.add({
        targets: dot,
        y: py + Phaser.Math.Between(-20, 20),
        x: px + Phaser.Math.Between(-10, 10),
        alpha: { from: dot.alpha, to: dot.alpha * 0.3 },
        duration: Phaser.Math.Between(3000, 6000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  private static drawTable(scene: Phaser.Scene, skin: TableSkin): void {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(TABLE_X + 4, TABLE_Y + 6, TABLE_W, TABLE_H, 10);

    g.fillStyle(skin.cushion, 1);
    g.fillRoundedRect(TABLE_X, TABLE_Y, TABLE_W, TABLE_H, 10);

    g.lineStyle(2, 0xffffff, 0.06);
    g.strokeRoundedRect(TABLE_X + 2, TABLE_Y + 2, TABLE_W - 4, TABLE_H - 4, 9);

    const bevelColor = Phaser.Display.Color.ValueToColor(skin.cushion);
    bevelColor.darken(15);
    g.lineStyle(3, bevelColor.color, 0.5);
    g.strokeRoundedRect(TABLE_X + 6, TABLE_Y + 6, TABLE_W - 12, TABLE_H - 12, 7);

    g.fillStyle(skin.cloth, 1);
    g.fillRect(PLAY_L, PLAY_T, PLAY_W, PLAY_H);

    g.lineStyle(1, 0xffffff, 0.02);
    for (let y = PLAY_T; y < PLAY_B; y += 8) {
      g.beginPath(); g.moveTo(PLAY_L, y); g.lineTo(PLAY_R, y); g.strokePath();
    }

    const innerShadow = scene.add.graphics();
    innerShadow.fillStyle(0x000000, 0.08);
    innerShadow.fillRect(PLAY_L, PLAY_T, PLAY_W, 4);
    innerShadow.fillRect(PLAY_L, PLAY_T, 4, PLAY_H);

    g.lineStyle(2, 0x000000, 0.15);
    g.strokeRect(PLAY_L, PLAY_T, PLAY_W, PLAY_H);

    g.lineStyle(1, 0xffffff, 0.15);
    g.beginPath(); g.moveTo(CUE_SPOT_X, PLAY_T + 4); g.lineTo(CUE_SPOT_X, PLAY_B - 4); g.strokePath();

    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(RACK_X - 24, PLAY_T + PLAY_H / 2, 4);

    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(PLAY_L + PLAY_W / 2, PLAY_T + PLAY_H / 2, 3);
  }

  private static getPocketPositions(): { x: number; y: number }[] {
    return [
      { x: PLAY_L, y: PLAY_T },
      { x: PLAY_L + PLAY_W / 2, y: PLAY_T - 3 },
      { x: PLAY_R, y: PLAY_T },
      { x: PLAY_L, y: PLAY_B },
      { x: PLAY_L + PLAY_W / 2, y: PLAY_B + 3 },
      { x: PLAY_R, y: PLAY_B },
    ];
  }

  private static createPocketGraphics(scene: Phaser.Scene, pocketColor: number): void {
    const positions = TableRenderer.getPocketPositions();
    const g = scene.add.graphics();
    positions.forEach(p => {
      g.fillStyle(0x000000, 0.5);
      g.fillCircle(p.x + 1, p.y + 2, POCKET_R + 3);
      g.fillStyle(0x111111, 1);
      g.fillCircle(p.x, p.y, POCKET_R + 2);
      g.fillStyle(pocketColor, 1);
      g.fillCircle(p.x, p.y, POCKET_R);
      g.lineStyle(1, 0xffffff, 0.08);
      g.strokeCircle(p.x, p.y, POCKET_R - 2);
    });
  }

  private static createCushionGraphics(scene: Phaser.Scene): void {
    const positions = TableRenderer.getPocketPositions();
    const g = scene.add.graphics();
    g.fillStyle(0x111111, 0.6);
    positions.forEach(p => {
      if (p.x === PLAY_L || p.x === PLAY_R) {
        g.fillCircle(p.x, p.y, POCKET_R + 1);
      }
    });
  }

  private static createWallBodies(scene: Phaser.Scene): MatterJS.Body[] {
    const walls: MatterJS.Body[] = [];
    const WT = CUSHION_W;
    const wall = (cx: number, cy: number, w: number, h: number) => {
      const b = scene.matter.add.rectangle(cx, cy, w, h, {
        isStatic: true, restitution: 0.7, friction: 0.08, label: 'wall',
      });
      walls.push(b);
    };

    wall((PLAY_L + POCKET_R_INSET + PLAY_L + PLAY_W / 2 - POCKET_R_INSET) / 2, PLAY_T - WT / 2,
         (PLAY_L + PLAY_W / 2 - POCKET_R_INSET) - (PLAY_L + POCKET_R_INSET), WT);
    wall((PLAY_L + PLAY_W / 2 + POCKET_R_INSET + PLAY_R - POCKET_R_INSET) / 2, PLAY_T - WT / 2,
         (PLAY_R - POCKET_R_INSET) - (PLAY_L + PLAY_W / 2 + POCKET_R_INSET), WT);
    wall((PLAY_L + POCKET_R_INSET + PLAY_L + PLAY_W / 2 - POCKET_R_INSET) / 2, PLAY_B + WT / 2,
         (PLAY_L + PLAY_W / 2 - POCKET_R_INSET) - (PLAY_L + POCKET_R_INSET), WT);
    wall((PLAY_L + PLAY_W / 2 + POCKET_R_INSET + PLAY_R - POCKET_R_INSET) / 2, PLAY_B + WT / 2,
         (PLAY_R - POCKET_R_INSET) - (PLAY_L + PLAY_W / 2 + POCKET_R_INSET), WT);
    wall(PLAY_L - WT / 2, (PLAY_T + POCKET_R_INSET + PLAY_B - POCKET_R_INSET) / 2,
         WT, (PLAY_B - POCKET_R_INSET) - (PLAY_T + POCKET_R_INSET));
    wall(PLAY_R + WT / 2, (PLAY_T + POCKET_R_INSET + PLAY_B - POCKET_R_INSET) / 2,
         WT, (PLAY_B - POCKET_R_INSET) - (PLAY_T + POCKET_R_INSET));

    return walls;
  }

  private static createPocketSensors(scene: Phaser.Scene): MatterJS.Body[] {
    return TableRenderer.getPocketPositions().map(p =>
      scene.matter.add.circle(p.x, p.y, POCKET_R - 2, {
        isStatic: true, isSensor: true, label: 'pocket',
      })
    );
  }
}
