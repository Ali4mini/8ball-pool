/**
 * Shared 8-ball game dimensions so the Phaser world and the table
 * stay in sync. Reduced margins for a full-screen feel.
 */

// World size (what Phaser scales to fit the screen)
// Reduced from 1360×820 for better phone rendering
export const GAME_W = 960;
export const GAME_H = 580;

// Table — near edge-to-edge with a slim 16px margin
export const MARGIN = 16;
export const TABLE_W = GAME_W - 2 * MARGIN;  // 1328
export const TABLE_H = GAME_H - 2 * MARGIN;  // 788
export const TABLE_X = MARGIN;
export const TABLE_Y = MARGIN;

// Play area — inset from table edge by cushion width (30px for tunneling prevention)
export const CUSHION_W = 30;
export const PLAY_L = TABLE_X + CUSHION_W;    // 46 (was 40)
export const PLAY_T = TABLE_Y + CUSHION_W;    // 46 (was 40)
export const PLAY_R = TABLE_X + TABLE_W - CUSHION_W;  // 1314 (was 1320)
export const PLAY_B = TABLE_Y + TABLE_H - CUSHION_W;  // 774 (was 780)
export const PLAY_W = PLAY_R - PLAY_L;        // 1268 (was 1280)
export const PLAY_H = PLAY_B - PLAY_T;        // 728 (was 740)

// Ball and pocket sizing
export const BALL_RADIUS = 11;
export const BALL_DIAM = BALL_RADIUS * 2;
export const POCKET_R = 16;
export const POCKET_R_INSET = 20;

// Standard shot positions (in world coordinates) — proportional to play area
export const CUE_SPOT_X = PLAY_L + 151;
export const CUE_SPOT_Y = PLAY_T + PLAY_H / 2;
export const RACK_X = PLAY_L + 630;
export const RACK_Y = PLAY_T + PLAY_H / 2;
