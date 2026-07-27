/**
 * Pure Code / Procedural 8-ball table renderer.
 * Generates realistic lighting, radial felt gradients, 3D wood frame,
 * and pockets using Phaser Graphics & Canvas Textures — 0 image assets required.
 */
import Phaser from "phaser";
import {
  GAME_W,
  GAME_H,
  TABLE_X,
  TABLE_Y,
  TABLE_W,
  TABLE_H,
  PLAY_L,
  PLAY_T,
  PLAY_R,
  PLAY_B,
  PLAY_W,
  PLAY_H,
  BALL_RADIUS,
  POCKET_R,
  POCKET_R_INSET,
  CUSHION_W,
  CUE_SPOT_X,
  CUE_SPOT_Y,
  RACK_X,
  RACK_Y,
} from "../gameConfig";

export interface TableSkin {
  clothCenter: number; // Center spotlight color (brighter)
  clothEdge: number; // Felt border color (darker)
  cushionMain: number; // Wood rail main color
  cushionDark: number; // Wood rail shadow color
  pocketColor: number; // Pocket hole color
}

export const SKIN_COLORS: Record<string, TableSkin> = {
  classic: {
    clothCenter: 0x228b57, // Bright felt green center
    clothEdge: 0x114229, // Dark felt green edges
    cushionMain: 0x7a3e1d, // Glossy mahogany wood
    cushionDark: 0x421f0b,
    pocketColor: 0x0f0f0f,
  },
  premium: {
    clothCenter: 0x2980b9, // Bright pool blue center
    clothEdge: 0x1a365d, // Dark navy edges
    cushionMain: 0x2c3e50, // Dark sleek wood/metal
    cushionDark: 0x111923,
    pocketColor: 0x0a0a0a,
  },
  crimson: {
    clothCenter: 0x9b2c2c, // Rich red center
    clothEdge: 0x4a0e17, // Deep wine red edges
    cushionMain: 0x5c2c16, // Oak wood
    cushionDark: 0x2b1308,
    pocketColor: 0x0a0a0a,
  },
  neon: {
    clothCenter: 0x00c853, // Vibrant green
    clothEdge: 0x003311, // Deep shadow
    cushionMain: 0x121212, // Pitch black frame
    cushionDark: 0x000000,
    pocketColor: 0x050505,
  },
};

export interface TableAssets {
  wallBodies: MatterJS.Body[];
  pocketSensors: MatterJS.Body[];
}

export class TableRenderer {
  static draw(scene: Phaser.Scene, skinName: string = "classic"): TableAssets {
    const skin = SKIN_COLORS[skinName] || SKIN_COLORS.classic;

    TableRenderer.drawBackground(scene);
    TableRenderer.drawFloorShadow(scene);
    TableRenderer.drawWoodFrame(scene, skin);
    TableRenderer.drawFeltRadial(scene, skinName, skin);
    TableRenderer.drawPocketHoles(scene, skin);
    TableRenderer.drawCushionsAndBevels(scene, skin);
    TableRenderer.drawInnerShadows(scene);
    TableRenderer.drawTableMarkings(scene);
    TableRenderer.drawRailDiamonds(scene);

    const wallBodies = TableRenderer.createWallBodies(scene);
    const pocketSensors = TableRenderer.createPocketSensors(scene);

    return { wallBodies, pocketSensors };
  }

  /**
   * Room background with subtle ambient light
   */
  private static drawBackground(scene: Phaser.Scene): void {
    const { width: w, height: h } = scene.scale;
    const bg = scene.add.graphics();
    bg.fillGradientStyle(0x0e131f, 0x182238, 0x0a0d14, 0x121929, 1);
    bg.fillRect(0, 0, w, h);
  }

  /**
   * Floor drop shadow under outer table
   */
  private static drawFloorShadow(scene: Phaser.Scene): void {
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.5);
    shadow.fillRoundedRect(
      TABLE_X - 12,
      TABLE_Y + 14,
      TABLE_W + 24,
      TABLE_H + 20,
      20,
    );
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillRoundedRect(
      TABLE_X - 22,
      TABLE_Y + 22,
      TABLE_W + 44,
      TABLE_H + 28,
      28,
    );
  }

  /**
   * Outer wooden table frame with bevels
   */
  private static drawWoodFrame(scene: Phaser.Scene, skin: TableSkin): void {
    const g = scene.add.graphics();

    // Dark frame base
    g.fillStyle(skin.cushionDark, 1);
    g.fillRoundedRect(TABLE_X, TABLE_Y, TABLE_W, TABLE_H, 16);

    // Inner wood color
    g.fillStyle(skin.cushionMain, 1);
    g.fillRoundedRect(TABLE_X + 4, TABLE_Y + 4, TABLE_W - 8, TABLE_H - 8, 14);

    // Bevel highlights & shadows
    const highlightColor = Phaser.Display.Color.ValueToColor(
      skin.cushionMain,
    ).lighten(20).color;
    g.lineStyle(2, highlightColor, 0.6);
    g.strokeRoundedRect(
      TABLE_X + 5,
      TABLE_Y + 5,
      TABLE_W - 10,
      TABLE_H - 10,
      13,
    );

    g.lineStyle(3, skin.cushionDark, 0.8);
    g.strokeRoundedRect(
      TABLE_X + CUSHION_W - 2,
      TABLE_Y + CUSHION_W - 2,
      PLAY_W + 4,
      PLAY_H + 4,
      2,
    );
  }

  /**
   * Generates a procedural radial gradient texture for the cloth felt
   * (Brighter in the center spotlight, darker near cushions)
   */
  private static drawFeltRadial(
    scene: Phaser.Scene,
    skinName: string,
    skin: TableSkin,
  ): void {
    const textureKey = `procedural_felt_${skinName}`;

    if (!scene.textures.exists(textureKey)) {
      const canvasTexture = scene.textures.createCanvas(
        textureKey,
        PLAY_W,
        PLAY_H,
      );
      if (canvasTexture) {
        const ctx = canvasTexture.context;
        const cColor = Phaser.Display.Color.ValueToColor(skin.clothCenter);
        const eColor = Phaser.Display.Color.ValueToColor(skin.clothEdge);

        const gradient = ctx.createRadialGradient(
          PLAY_W / 2,
          PLAY_H / 2,
          PLAY_H * 0.15,
          PLAY_W / 2,
          PLAY_H / 2,
          PLAY_W * 0.6,
        );
        gradient.addColorStop(0, `rgb(${(cColor as any).r}, ${(cColor as any).g}, ${(cColor as any).b})`);
        gradient.addColorStop(1, `rgb(${(eColor as any).r}, ${(eColor as any).g}, ${(eColor as any).b})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, PLAY_W, PLAY_H);
        canvasTexture.refresh();
      }
    }

    const feltImg = scene.add.image(PLAY_L, PLAY_T, textureKey);
    feltImg.setOrigin(0, 0);
  }

  /**
   * Recessed pocket holes with 3D drop shadows and metal trims
   */
  private static drawPocketHoles(scene: Phaser.Scene, skin: TableSkin): void {
    const positions = TableRenderer.getPocketPositions();
    const g = scene.add.graphics();

    positions.forEach((p) => {
      // Outer pocket drop shadow on wood
      g.fillStyle(0x000000, 0.6);
      g.fillCircle(p.x, p.y + 2, POCKET_R + 4);

      // Metallic pocket rim/leather pocket liner
      g.fillStyle(0x2a2a2a, 1);
      g.fillCircle(p.x, p.y, POCKET_R + 3);

      // Dark pocket hole interior
      g.fillStyle(skin.pocketColor, 1);
      g.fillCircle(p.x, p.y, POCKET_R);

      // Pocket depth inner shadow ring
      g.lineStyle(2, 0x000000, 0.8);
      g.strokeCircle(p.x, p.y, POCKET_R - 1);
    });
  }

  /**
   * Cushions along play area borders
   */
  private static drawCushionsAndBevels(
    scene: Phaser.Scene,
    skin: TableSkin,
  ): void {
    const g = scene.add.graphics();
    const cushionColor = Phaser.Display.Color.ValueToColor(
      skin.clothEdge,
    ).darken(10).color;

    g.fillStyle(cushionColor, 1);

    // Top, Bottom, Left, Right cushion edges
    g.fillRect(PLAY_L, PLAY_T - 4, PLAY_W, 4);
    g.fillRect(PLAY_L, PLAY_B, PLAY_W, 4);
    g.fillRect(PLAY_L - 4, PLAY_T, 4, PLAY_H);
    g.fillRect(PLAY_R, PLAY_T, 4, PLAY_H);
  }

  /**
   * Deep inner ambient shadow along cushions cast onto the felt
   */
  private static drawInnerShadows(scene: Phaser.Scene): void {
    const shadow = scene.add.graphics();
    const sDepth = 14;

    // Top cushion shadow onto cloth
    shadow.fillGradientStyle(
      0x000000,
      0x000000,
      0x000000,
      0x000000,
      0.5,
      0.5,
      0,
      0,
    );
    shadow.fillRect(PLAY_L, PLAY_T, PLAY_W, sDepth);

    // Left cushion shadow onto cloth
    shadow.fillGradientStyle(
      0x000000,
      0x000000,
      0x000000,
      0x000000,
      0.5,
      0,
      0.5,
      0,
    );
    shadow.fillRect(PLAY_L, PLAY_T, sDepth, PLAY_H);

    // Crisp inner edge border
    shadow.lineStyle(1.5, 0x000000, 0.6);
    shadow.strokeRect(PLAY_L, PLAY_T, PLAY_W, PLAY_H);
  }

  /**
   * Head line, cue spot, and head spot
   */
  private static drawTableMarkings(scene: Phaser.Scene): void {
    const g = scene.add.graphics();

    // Semi-transparent head string line
    g.lineStyle(2, 0xffffff, 0.25);
    g.beginPath();
    g.moveTo(CUE_SPOT_X, PLAY_T + 6);
    g.lineTo(CUE_SPOT_X, PLAY_B - 6);
    g.strokePath();

    // Cue spot point
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(CUE_SPOT_X, CUE_SPOT_Y, 2.5);

    // Head spot point
    g.fillCircle(RACK_X, RACK_Y, 2.5);
  }

  /**
   * Inlay diamond sights on the rails
   */
  private static drawRailDiamonds(scene: Phaser.Scene): void {
    const g = scene.add.graphics();
    const diamondR = 3;
    const topY = TABLE_Y + CUSHION_W / 2;
    const botY = TABLE_Y + TABLE_H - CUSHION_W / 2;
    const leftX = TABLE_X + CUSHION_W / 2;
    const rightX = TABLE_X + TABLE_W - CUSHION_W / 2;

    g.fillStyle(0xf0f0f0, 0.85);

    // Top & Bottom horizontal rail diamonds
    const xStep = PLAY_W / 4;
    for (let i = 1; i <= 3; i++) {
      g.fillCircle(PLAY_L + xStep * i, topY, diamondR);
      g.fillCircle(PLAY_L + xStep * i, botY, diamondR);
    }

    // Left & Right vertical rail diamonds
    const yStep = PLAY_H / 2;
    g.fillCircle(leftX, PLAY_T + yStep, diamondR);
    g.fillCircle(rightX, PLAY_T + yStep, diamondR);
  }

  private static getPocketPositions(): { x: number; y: number }[] {
    return [
      { x: PLAY_L, y: PLAY_T }, // Top-Left
      { x: PLAY_L + PLAY_W / 2, y: PLAY_T - 2 }, // Top-Middle
      { x: PLAY_R, y: PLAY_T }, // Top-Right
      { x: PLAY_L, y: PLAY_B }, // Bottom-Left
      { x: PLAY_L + PLAY_W / 2, y: PLAY_B + 2 }, // Bottom-Middle
      { x: PLAY_R, y: PLAY_B }, // Bottom-Right
    ];
  }

  private static createWallBodies(scene: Phaser.Scene): MatterJS.Body[] {
    const walls: MatterJS.Body[] = [];
    const WT = CUSHION_W;
    const wall = (cx: number, cy: number, w: number, h: number) => {
      const b = scene.matter.add.rectangle(cx, cy, w, h, {
        isStatic: true,
        restitution: 0.7,
        friction: 0.08,
        label: "wall",
      });
      walls.push(b);
    };

    wall(
      (PLAY_L + POCKET_R_INSET + PLAY_L + PLAY_W / 2 - POCKET_R_INSET) / 2,
      PLAY_T - WT / 2,
      PLAY_L + PLAY_W / 2 - POCKET_R_INSET - (PLAY_L + POCKET_R_INSET),
      WT,
    );
    wall(
      (PLAY_L + PLAY_W / 2 + POCKET_R_INSET + PLAY_R - POCKET_R_INSET) / 2,
      PLAY_T - WT / 2,
      PLAY_R - POCKET_R_INSET - (PLAY_L + PLAY_W / 2 + POCKET_R_INSET),
      WT,
    );
    wall(
      (PLAY_L + POCKET_R_INSET + PLAY_L + PLAY_W / 2 - POCKET_R_INSET) / 2,
      PLAY_B + WT / 2,
      PLAY_L + PLAY_W / 2 - POCKET_R_INSET - (PLAY_L + POCKET_R_INSET),
      WT,
    );
    wall(
      (PLAY_L + PLAY_W / 2 + POCKET_R_INSET + PLAY_R - POCKET_R_INSET) / 2,
      PLAY_B + WT / 2,
      PLAY_R - POCKET_R_INSET - (PLAY_L + PLAY_W / 2 + POCKET_R_INSET),
      WT,
    );
    wall(
      PLAY_L - WT / 2,
      (PLAY_T + POCKET_R_INSET + PLAY_B - POCKET_R_INSET) / 2,
      WT,
      PLAY_B - POCKET_R_INSET - (PLAY_T + POCKET_R_INSET),
    );
    wall(
      PLAY_R + WT / 2,
      (PLAY_T + POCKET_R_INSET + PLAY_B - POCKET_R_INSET) / 2,
      WT,
      PLAY_B - POCKET_R_INSET - (PLAY_T + POCKET_R_INSET),
    );

    return walls;
  }

  private static createPocketSensors(scene: Phaser.Scene): MatterJS.Body[] {
    return TableRenderer.getPocketPositions().map((p) =>
      scene.matter.add.circle(p.x, p.y, POCKET_R - 2, {
        isStatic: true,
        isSensor: true,
        label: "pocket",
      }),
    );
  }
}
