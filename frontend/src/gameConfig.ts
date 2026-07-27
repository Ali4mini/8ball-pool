/**
 * Shared 8-ball game dimensions so the Phaser world and the table
 * stay in sync. 
 *
 * The game world (GAME_W x GAME_H) is wider than the table to fill
 * phone landscape aspect ratios (~2.17:1). The table is centered
 * horizontally with decorative background on the sides. HUD elements
 * (player cards, power bar, debug panel) sit in the extra space.
 *
 * The play area (table surface) stays 868x488 regardless of canvas
 * width — ball physics and relative positions are unchanged.
 */

// World size
// 1280×580 → ~2.21:1 ratio — fills modern phone landscape screens
// (iPhone 14 landscape: 844×390 = 2.16:1, Pixel 7: 915×412 = 2.22:1)
export const GAME_W = 1280;
export const GAME_H = 580;

// Table — fixed size, centered in the wider canvas
export const MARGIN = 16;                 // minimum padding from canvas edge
export const TABLE_W = 928;               // fixed — play area stays 868 wide
export const TABLE_H = GAME_H - 2 * MARGIN; // 548
export const TABLE_X = (GAME_W - TABLE_W) / 2; // 176
export const TABLE_Y = MARGIN;            // 16

// Play area — inset from table edge by cushion width (for tunneling prevention)
export const CUSHION_W = 30;
export const PLAY_L = TABLE_X + CUSHION_W;    // 206
export const PLAY_T = TABLE_Y + CUSHION_W;    // 46
export const PLAY_R = TABLE_X + TABLE_W - CUSHION_W;  // 1074
export const PLAY_B = TABLE_Y + TABLE_H - CUSHION_W;  // 534
export const PLAY_W = PLAY_R - PLAY_L;        // 868
export const PLAY_H = PLAY_B - PLAY_T;        // 488

// Ball and pocket sizing
export const BALL_RADIUS = 11;
export const BALL_DIAM = BALL_RADIUS * 2;
export const POCKET_R = 16;
export const POCKET_R_INSET = 20;

// Shot positions (relative to play area — auto-scale with GAME_W)
export const CUE_SPOT_X = PLAY_L + 151;
export const CUE_SPOT_Y = PLAY_T + PLAY_H / 2;
export const RACK_X = PLAY_L + 630;
export const RACK_Y = PLAY_T + PLAY_H / 2;
