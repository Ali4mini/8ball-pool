import Phaser from 'phaser';
import { wsClient } from '../network/wsClient';
import { sendToParent } from '../utils/bridge';
import { config as gameCfg } from '../config';
import { LANG } from '../lang';
import { evaluateShot, ShotEval, Group } from '../rules';
import {
  TABLE_X, TABLE_Y, TABLE_W, TABLE_H,
  PLAY_L, PLAY_T, PLAY_R, PLAY_B, PLAY_W, PLAY_H,
  BALL_RADIUS, BALL_DIAM, POCKET_R, CUSHION_W, POCKET_R_INSET,
  CUE_SPOT_X, CUE_SPOT_Y, RACK_X, RACK_Y,
} from '../gameConfig';
import { TableRenderer, SKIN_COLORS } from '../rendering/TableRenderer';
import { BallRenderer } from '../rendering/BallRenderer';
import { HUD } from '../rendering/HUD';
import { PhysicsDebugPanel } from '../rendering/PhysicsDebugPanel';

// ─── Constants ──────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  // Ball renderer
  private ballRenderer!: BallRenderer;

  // Input state
  private isMyTurn = false;
  private myPlayerNum = 1;
  private aimAngle = 0;
  private aimPower = 0;
  private isAiming = false;

  // Simulation settle state
  private isSimulating = false;
  private settleFrameCount = 0;
  private readonly SETTLE_SPEED = 2.0;
  private readonly SETTLE_FRAMES = 10;
  private readonly SIM_TIMEOUT = 8000;
  private isLocalShot = true;
  private simStartTime = 0;
  private pocketedBalls: number[] = [];
  private cuePocketed = false;
  private firstContact: number | null = null;
  private pocketSensors: MatterJS.Body[] = [];

  // Physics debug overlay
  private debugPanel!: PhysicsDebugPanel;
  private wallBodies: MatterJS.Body[] = [];

  // Game state
  private player1Name = '';
  private player2Name = '';
  private player1Id = '';
  private player2Id = '';
  private skinName = gameCfg.tableSkin || 'classic';
  private ballSet = gameCfg.ballSet || 'classic';

  // Heads-up display
  private hud!: HUD;

  // Game state
  private player1Group: Group = null;
  private player2Group: Group = null;
  private pocketedByPlayer1: number[] = [];
  private pocketedByPlayer2: number[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { gameData: any }): void {
    const gd = data.gameData;
    this.player1Id = gd.player1_id;
    this.player1Name = gd.player1_name;
    this.player2Id = gd.player2_id;
    this.player2Name = gd.player2_name;
    this.pocketedBalls = [];
    this.cuePocketed = false;
    this.firstContact = null;
    this.isSimulating = false;
    this.settleFrameCount = 0;
    this.pocketedByPlayer1 = [];
    this.pocketedByPlayer2 = [];
    this.player1Group = null;
    this.player2Group = null;
  
    // Determine player number from game_start data
    // Player 1 always breaks, so if we're player 1, it's our turn
    const isP1 = gameCfg.playerId === this.player1Id;
    this.myPlayerNum = isP1 ? 1 : 2;
    // The break_player from server tells us who shoots first
    const breakPlayer = gd.break_player || 1;
    this.isMyTurn = (this.myPlayerNum === breakPlayer);
  }

  // ═══════════════════════════════════════════════════════════
  //  CREATE
  // ═══════════════════════════════════════════════════════════
  create(): void {
    const { width, height } = this.scale;
    this.aimPower = 0;

    // Draw table + physics walls + pocket sensors
    const tableAssets = TableRenderer.draw(this, this.skinName);
    this.wallBodies = tableAssets.wallBodies;
    this.pocketSensors = tableAssets.pocketSensors;

    // Generate ball textures and create physics bodies
    this.ballRenderer = new BallRenderer(this, this.ballSet);
    this.ballRenderer.generateTextures();
    this.ballRenderer.createBalls();

    // HUD
    this.hud = new HUD(this);
    this.hud.setNames(this.player1Id, this.player1Name || LANG.player1, this.player2Id, this.player2Name || LANG.player2);
    this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);
    this.setupInput();
    this.setupWebSocket();
    this.setupCollisionHandler();

    // Physics debug overlay
    this.debugPanel = new PhysicsDebugPanel(this);
    this.debugPanel.onApplyBall = (key, val) => {
      this.ballRenderer.getAllBalls().forEach((bd) => {
        const raw = bd.sprite.body as any;
        if (raw) raw[key] = val;
      });
    };
    this.debugPanel.onApplyWall = (key, val) => {
      this.wallBodies.forEach((b) => { (b as any)[key] = val; });
    };
  }

  // ─── Collision handler (pocket detection + first contact) ─
  private setupCollisionHandler(): void {
    this.matter.world.on('collisionstart', (_event: any, bodyA: any, bodyB: any) => {
      this.handleCollision(bodyA, bodyB);
    });
  }

  private handleCollision(bodyA: MatterJS.Body, bodyB: MatterJS.Body): void {
    const labelA = (bodyA as any).label || '';
    const labelB = (bodyB as any).label || '';

    // Determine ball vs pocket
    const pocketBody = labelA === 'pocket' ? bodyA : labelB === 'pocket' ? bodyB : null;
    const ballBody = labelA.startsWith('ball_') ? bodyA : labelB.startsWith('ball_') ? bodyB : null;

    if (pocketBody && ballBody) {
      const ballNum = parseInt((ballBody as any).label.replace('ball_', ''), 10);
      this.onBallPocketed(ballNum, ballBody);
    }

    // First contact: cue ball hitting another ball
    if (this.firstContact === null && this.isSimulating) {
      let cueBody: MatterJS.Body | null = null;
      let otherBody: MatterJS.Body | null = null;

      if (labelA === 'ball_0' && labelB.startsWith('ball_')) {
        cueBody = bodyA;
        otherBody = bodyB;
      } else if (labelB === 'ball_0' && labelA.startsWith('ball_')) {
        cueBody = bodyB;
        otherBody = bodyA;
      }

      if (cueBody && otherBody) {
        const otherNum = parseInt((otherBody as any).label.replace('ball_', ''), 10);
        this.firstContact = otherNum;
      }
    }
  }

  private onBallPocketed(ballNum: number, _body: MatterJS.Body): void {
    if (ballNum === 0) {
      this.cuePocketed = true;
      this.ballRenderer.respawnCue();
    } else {
      if (!this.pocketedBalls.includes(ballNum)) {
        this.pocketedBalls.push(ballNum);
      }
      this.ballRenderer.pocketBall(ballNum);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  GROUP TRACKING
  // ═══════════════════════════════════════════════════════════

  private updateGroupDisplay(): void {
    this.hud.updateGroupDisplay(
      this.myPlayerNum,
      this.player1Group,
      this.player2Group,
      this.pocketedByPlayer1,
      this.pocketedByPlayer2,
      this.ballRenderer.countByGroup(this.player1Group),
      this.ballRenderer.countByGroup(this.player2Group),
    );
  }

  private updateRemainingDisplay(): void {
    this.hud.updateGroupDisplay(
      this.myPlayerNum,
      this.player1Group,
      this.player2Group,
      this.pocketedByPlayer1,
      this.pocketedByPlayer2,
      this.ballRenderer.countByGroup(this.player1Group),
      this.ballRenderer.countByGroup(this.player2Group),
    );
  }

  private countOwnRemaining(): number {
    const ownGroup = this.myPlayerNum === 1 ? this.player1Group : this.player2Group;
    return this.ballRenderer.countByGroup(ownGroup);
  }

  /** In debug mode, assign groups based on first pocket after break. */
  private assignGroupsLocally(): void {
    if (this.player1Group !== null || this.player2Group !== null) return;
    if (this.pocketedBalls.length === 0) return;

    const firstPocketed = this.pocketedBalls[0];
    if (firstPocketed === 0 || firstPocketed === 8) return;

    const group = (firstPocketed >= 1 && firstPocketed <= 7) ? 'solids' : 'stripes';
    this.player1Group = group;
    this.player2Group = group === 'solids' ? 'stripes' : 'solids';
    this.updateGroupDisplay();
  }

  private showGameOverOverlay(won: boolean): void {
    this.hud.showGameOverOverlay(won);
  }

  private updateTurnUI(): void {
    this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);
  }

  // ═══════════════════════════════════════════════════════════
  //  CUE STICK — always visible on your turn
  // ═══════════════════════════════════════════════════════════
  private drawCueStick(): void {
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;
    // During aiming, drawAim handles the cue stick and aim line.
    // Don't touch alpha here — it would override drawAim's work.
    if (this.isAiming) return;
    this.hud.drawCueStickAt(cue.x, cue.y, this.aimAngle || 0, 0.45, 0);
  }

  // ═══════════════════════════════════════════════════════════
  //  INPUT
  // ═══════════════════════════════════════════════════════════
  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.isMyTurn || this.isSimulating) return;
      this.isAiming = true;
      this.updateAim(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isAiming || !this.isMyTurn || this.isSimulating) return;
      this.updateAim(pointer);
    });

    this.input.on('pointerup', () => {
      this.onRelease();
    });

    this.input.on('pointerupoutside', () => {
      this.onRelease();
    });

    this.input.on('pointercancel', () => {
      this.onRelease();
    });
  }

  private onRelease(): void {
    if (!this.isAiming) return;
    this.isAiming = false;
    this.updatePowerDisplay();
    // Auto-shoot on release if enough power
    if (this.aimPower > 2) {
      this.executeShot();
    }
  }

  private updateAim(pointer: Phaser.Input.Pointer): void {
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;
    const cx = cue.x;
    const cy = cue.y;
    const dx = pointer.worldX - cx;
    const dy = pointer.worldY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) return;

    this.aimAngle = Math.atan2(-dy, -dx);    // slingshot: pull back → ball shoots opposite
    this.aimPower = Math.min(dist / 10, 14);

    this.hud.drawAim(cx, cy, this.aimAngle, this.aimPower);
  }

  private updatePowerDisplay(): void {
    this.hud.showPowerUI();
    this.hud.setInfo(this.aimPower > 2 ? LANG.shootHint : LANG.aimAndShoot);
  }

  // ═══════════════════════════════════════════════════════════
  //  SHOT EXECUTION (Matter.js physics)
  // ═══════════════════════════════════════════════════════════
  private executeShot(): void {
    if (this.isSimulating || !this.isMyTurn) return;
    this.isSimulating = true;
    this.isLocalShot = true;
    this.isAiming = false;
    this.settleFrameCount = 0;

    // Hide UI
    this.hud.hideAim();

    // Reset shot tracking
    this.pocketedBalls = [];
    this.cuePocketed = false;
    this.firstContact = null;
    this.simStartTime = Date.now();

    // Apply velocity to cue ball directly on the Matter body
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;
    const matterBody = (cue as any).body;
    if (matterBody) {
      matterBody.isSleeping = false;
      const speed = this.aimPower * 2.5;
      cue.setVelocity(Math.cos(this.aimAngle) * speed, Math.sin(this.aimAngle) * speed);
    }

    // Tell the opponent about the hit so they can animate it too
    wsClient.send({
      type: 'shot_init',
      angle_deg: (this.aimAngle * 180) / Math.PI,
      power: this.aimPower,
      cue_ball_position: [cue.x, cue.y],
    });

    this.hud.setInfo(LANG.simulating);
    this.updateTurnUI();
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE LOOP — settle detection
  // ═══════════════════════════════════════════════════════════
  update(): void {
    // Draw cue stick when it's the player's turn
    if (this.isMyTurn && !this.isSimulating) {
      this.drawCueStick();
    } else {
      this.hud.cueStick.setAlpha(0);
    }

    // Safety-net: teleport any ball that escaped the table back to the center
    const MBody = (Phaser.Physics.Matter as any).Matter.Body;
    this.ballRenderer.getAllBalls().forEach((bd) => {
      if (!bd.sprite.visible) return;
      const x = bd.sprite.x;
      const y = bd.sprite.y;
      const margin = CUSHION_W * 2;
      if (x < TABLE_X - margin || x > TABLE_X + TABLE_W + margin ||
          y < TABLE_Y - margin || y > TABLE_Y + TABLE_H + margin) {
        const rawBody = (bd.sprite.body as any) as MatterJS.Body;
        MBody.setPosition(rawBody, { x: PLAY_L + PLAY_W / 2 + Phaser.Math.Between(-20, 20), y: PLAY_T + PLAY_H / 2 });
        MBody.setVelocity(rawBody, { x: 0, y: 0 });
      }
    });

    if (!this.isSimulating) return;

    // Check timeout — reduced from 15s to 8s
    if (Date.now() - this.simStartTime > this.SIM_TIMEOUT) {
      this.processShotResult();
      return;
    }

    // Settle detection with frame confirmation
    // Requires SETTLE_FRAMES consecutive frames where ALL balls' speed
    // is below SETTLE_SPEED. This prevents micro-movement or single-frame
    // fluctuations from delaying the shot.
    let allSettled = true;
    this.ballRenderer.getAllBalls().forEach((bd) => {
      const matterBody = (bd.sprite.body as any).body;
      if (!matterBody || (matterBody.speed ?? Infinity) > this.SETTLE_SPEED) {
        allSettled = false;
      }
    });

    if (allSettled) {
      this.settleFrameCount++;
      if (this.settleFrameCount >= this.SETTLE_FRAMES && this.isLocalShot) {
        this.processShotResult();
      }
    } else {
      this.settleFrameCount = 0;
    }

    // Keep remaining-ball display live during simulation
    if (this.isSimulating && this.player1Group !== null) {
      this.updateRemainingDisplay();
    }
  }

  private processShotResult(): void {
    this.isSimulating = false;

    // Collect ball positions from physics bodies — use the snapshot helper
    const ballPositions = this.ballRenderer.getPositionsSnapshot();

    // Send to server
    wsClient.send({
      type: 'shoot',
      angle_deg: (this.aimAngle * 180) / Math.PI,
      power: this.aimPower,
      pocketed: this.pocketedBalls,
      cue_pocketed: this.cuePocketed,
      first_contact: this.firstContact,
      ball_positions: ballPositions,
    });

    this.hud.setInfo(LANG.waitingServer);

    // Fallback: if first contact wasn't detected but balls were pocketed,
    // infer first contact from the pocketed balls (must have hit something)
    if (this.firstContact === null && this.pocketedBalls.length > 0) {
      this.firstContact = this.pocketedBalls[0];
    }

    // Local group assignment (debug mode — no server response)
    this.assignGroupsLocally();

    // Local game-over detection (debug mode)
    if (this.isLocalShot && this.player1Group !== null) {
      const ownRemaining = this.countOwnRemaining();
      const evalResult = evaluateShot(
        this.pocketedBalls,
        this.cuePocketed,
        this.myPlayerNum,
        ownRemaining,
        this.player1Group,
        this.player2Group,
      );

      if (evalResult.groupsJustAssigned) {
        this.player1Group = evalResult.player1Group;
        this.player2Group = evalResult.player2Group;
        this.updateGroupDisplay();
      }

      if (evalResult.gameOver) {
        const winnerNum = evalResult.winner!;
        const won = winnerNum === this.myPlayerNum;
        const winnerId = winnerNum === 1 ? this.player1Id : this.player2Id;
        const winnerName = winnerNum === 1 ? this.player1Name : this.player2Name;

        this.showGameOverOverlay(won);
        sendToParent('GAME_FINISHED', {
          winner: winnerId,
          winner_name: winnerName,
          reason: evalResult.reason,
        });

        this.time.delayedCall(2000, () => {
          this.scene.start('ResultScene', {
            result: {
              winner: winnerId,
              winner_name: winnerName,
              reason: evalResult.reason,
            },
          });
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  ANIMATE SERVER RESPONSE
  // ═══════════════════════════════════════════════════════════
  private animateShotResult(data: any): void {
    this.isSimulating = false;

    const pocketed: number[] = data.pocketed || [];
    const cuePocketed = data.cue_pocketed || false;
    const foul = data.foul || false;
    const foulReason = data.foul_reason || '';
    const ballPositions = data.ball_positions || null;
    const ballInHand = data.ball_in_hand || false;

    // Apply authoritative final positions from the server
    if (ballPositions) {
      this.ballRenderer.setPositions(ballPositions);
    }

    // Remove pocketed balls using ballRenderer
    pocketed.forEach((num: number) => this.ballRenderer.pocketBall(num));

    // Track pocketed balls per player
    const shooter = data.player || this.myPlayerNum;
    const legalPockets = pocketed.filter(b => b !== 0 && b !== 8);
    if (legalPockets.length > 0) {
      if (shooter === 1) {
        this.pocketedByPlayer1.push(...legalPockets);
      } else {
        this.pocketedByPlayer2.push(...legalPockets);
      }
      this.updateGroupDisplay();
    }

    // Cue ball pocketed or ball-in-hand — respawn at head spot (server confirms)
    if (cuePocketed || ballInHand) {
      this.ballRenderer.respawnCue();
    }

    // Show foul
    if (foul) {
      const foulMessage =
        foulReason === 'scratch' ? LANG.foulScratch :
        foulReason === 'early_8_ball' ? LANG.foulEarly8 :
        foulReason === 'wrong_first_contact' ? LANG.foulWrongFirst :
        foulReason === 'opponent_ball' ? LANG.foulOpponentBall :
        foulReason === 'no_contact' ? LANG.foulNoContact :
        foulReason === 'illegal_break' ? LANG.foulIllegalBreak :
        foulReason === 'eight_ball_on_break' ? LANG.foulEightOnBreak :
        foulReason === 'no_rail' ? LANG.foulNoRail :
        LANG.foul(foulReason);
      this.hud.showFoul(foulMessage);
    }

    // Ball-in-hand hint
    if (ballInHand && this.isMyTurn) {
      this.hud.setInfo(LANG.ballInHand);
    } else {
      // Update turn from the authoritative current_player in shot_result
      const nextPlayer = data.current_player;
      this.isMyTurn = (nextPlayer === this.myPlayerNum);

      if (this.isMyTurn) {
        this.hud.setTurnText(LANG.yourTurn, '#f97316');
        this.hud.setInfo(LANG.aimAndShoot);
      } else {
        this.hud.setTurnText(LANG.opponentTurn, '#aaaaaa');
        this.hud.setInfo(LANG.waitingOpponent);
      }
      this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  WEBSOCKET HANDLERS
  // ═══════════════════════════════════════════════════════════
  private setupWebSocket(): void {
    wsClient.on('game_start', (data: any) => {
      this.player1Id = data.player1_id;
      this.player1Name = data.player1_name;
      this.player2Id = data.player2_id;
      this.player2Name = data.player2_name;

      // Update name texts
      this.hud.setNames(this.player1Id, this.player1Name || LANG.player1, this.player2Id, this.player2Name || LANG.player2);

      // Position balls from server data
      if (data.ball_positions) {
        this.ballRenderer.setPositions(data.ball_positions);
      }
    });

    wsClient.on('your_turn', (data: any) => {
      if (data.player_id === gameCfg.playerId) {
        this.isMyTurn = true;
        this.hud.setTurnText(LANG.yourTurn, '#f97316');
        this.hud.setInfo(LANG.aimAndShoot);
        this.hud.updateTurnUI(this.myPlayerNum, true);
      }
    });

    wsClient.on('opponent_turn', (data: any) => {
      if (data.player_id !== gameCfg.playerId) {
        this.isMyTurn = false;
        this.hud.setTurnText(LANG.opponentTurn, '#aaaaaa');
        this.hud.setInfo(LANG.waitingOpponent);
        this.hud.updateTurnUI(this.myPlayerNum, false);
      }
    });

    wsClient.on('shot_result', (data: any) => {
      this.animateShotResult(data);
    });

    wsClient.on('shot_init', (data: any) => {
      this.playOpponentShot(data);
    });

    wsClient.on('groups_assigned', (data: any) => {
      this.player1Group = data.player1_group === 'solids' ? 'solids' : 'stripes';
      this.player2Group = data.player2_group === 'solids' ? 'solids' : 'stripes';
      this.updateGroupDisplay();
    });

    wsClient.on('game_over', (data: any) => {
      this.isSimulating = true;
      this.isMyTurn = false;

      // Show overlay
      const won = gameCfg.playerId === data.winner;
      this.showGameOverOverlay(won);

      sendToParent('GAME_FINISHED', {
        winner: data.winner,
        winner_name: data.winner_name,
        reason: data.reason,
      });

      this.time.delayedCall(2000, () => {
        this.scene.start('ResultScene', { result: data });
      });
    });

    wsClient.on('error', (data: any) => {
      this.hud.setInfo(data.message || 'خطا');
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  OPPONENT SHOT ANIMATION
  // ═══════════════════════════════════════════════════════════
  private playOpponentShot(data: any): void {
    // Ignore if the message somehow targets us or the game is busy
    if (data.player === this.myPlayerNum || this.isSimulating) return;

    this.isSimulating = true;
    this.isLocalShot = false;
    this.isMyTurn = false;
    this.isAiming = false;
    this.settleFrameCount = 0;

    // Reset shot tracking
    this.pocketedBalls = [];
    this.cuePocketed = false;
    this.firstContact = null;
    this.simStartTime = Date.now();

    // Hide local aim UI
    this.hud.hideAim();

    this.hud.setTurnText(LANG.opponentTurn, '#aaaaaa');
    this.hud.setInfo(LANG.simulating);
    this.hud.updateTurnUI(this.myPlayerNum, false);

    // Sync cue ball position if provided, then apply the same velocity formula
    const angleRad = (data.angle_deg * Math.PI) / 180;
    const power = data.power || 0;
    const cuePos = data.cue_ball_position;
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;
    const matterBody = (cue as any).body;

    if (matterBody) {
      matterBody.isSleeping = false;
      if (Array.isArray(cuePos) && cuePos.length === 2) {
        cue.setPosition(cuePos[0], cuePos[1]);
      }
      const speed = power * 2.5;
      cue.setVelocity(Math.cos(angleRad) * speed, Math.sin(angleRad) * speed);
    }

    // Briefly draw the opponent's cue stick in the shot direction
    this.hud.drawOpponentCueStick(cue.x, cue.y, angleRad);
  }

  // ═══════════════════════════════════════════════════════════
  //  PHYSICS DEBUG OVERLAY (press D to toggle)
  // ═══════════════════════════════════════════════════════════
}
