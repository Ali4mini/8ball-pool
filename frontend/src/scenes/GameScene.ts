import Phaser from "phaser";
import { wsClient } from "../network/wsClient";
import { sendToParent } from "../utils/bridge";
import { config as gameCfg } from "../config";
import { LANG } from "../lang";
import { evaluateShot, ShotEval, Group } from "../rules";
import {
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
  BALL_DIAM,
  POCKET_R,
  CUSHION_W,
  POCKET_R_INSET,
  CUE_SPOT_X,
  CUE_SPOT_Y,
  RACK_X,
  RACK_Y,
} from "../gameConfig";
import { TableRenderer } from "../rendering/TableRenderer";
import { BallRenderer } from "../rendering/BallRenderer";
import { HUD } from "../rendering/HUD";
import { PhysicsDebugPanel } from "../rendering/PhysicsDebugPanel";

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
  private player1Name = "";
  private player2Name = "";
  private player1Id = "";
  private player2Id = "";
  private skinName = gameCfg.tableSkin || "classic";
  private ballSet = gameCfg.ballSet || "classic";

  // Heads-up display
  private hud!: HUD;

  // Game state
  private player1Group: Group = null;
  private player2Group: Group = null;
  private pocketedByPlayer1: number[] = [];
  private pocketedByPlayer2: number[] = [];

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { gameData: any }): void {
    const gd = data.gameData || {};
    this.player1Id = gd.player1_id || "";
    this.player1Name = gd.player1_name || "";
    this.player2Id = gd.player2_id || "";
    this.player2Name = gd.player2_name || "";
    this.pocketedBalls = [];
    this.cuePocketed = false;
    this.firstContact = null;
    this.isSimulating = false;
    this.settleFrameCount = 0;
    this.pocketedByPlayer1 = [];
    this.pocketedByPlayer2 = [];
    this.player1Group = null;
    this.player2Group = null;

    // Robust player number resolution
    if (gd.player_number) {
      this.myPlayerNum = gd.player_number;
    } else if (gd.player2_id && gameCfg.playerId === gd.player2_id) {
      this.myPlayerNum = 2;
    } else {
      this.myPlayerNum = 1;
    }

    const breakPlayer = gd.break_player || 1;
    this.isMyTurn = this.myPlayerNum === breakPlayer;
  }

  // ═══════════════════════════════════════════════════════════
  //  CREATE
  // ═══════════════════════════════════════════════════════════
  create(): void {
    this.aimPower = 0;

    // Draw table + physics walls + pocket sensors
    const tableAssets = TableRenderer.draw(this, this.skinName);
    this.wallBodies = tableAssets.wallBodies;
    this.pocketSensors = tableAssets.pocketSensors;

    // Generate ball textures and create physics bodies
    this.ballRenderer = new BallRenderer(this, this.ballSet);
    this.ballRenderer.generateTextures();
    this.ballRenderer.createBalls();

    // HUD & Power Control Wiring
    this.hud = new HUD(this);
    this.hud.setNames(
      this.player1Id,
      this.player1Name || LANG.player1,
      this.player2Id,
      this.player2Name || LANG.player2,
    );
    this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);

    this.hud.setupPowerCallbacks(
      (power: number) => {
        this.aimPower = power;
        this.updateAimDisplay();
      },
      (power: number) => {
        this.aimPower = power;
        this.executeShot();
      },
    );

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
      this.wallBodies.forEach((b) => {
        (b as any)[key] = val;
      });
    };
  }

  // ─── Collision handler (pocket detection + first contact) ─
  private setupCollisionHandler(): void {
    this.matter.world.on(
      "collisionstart",
      (_event: any, bodyA: any, bodyB: any) => {
        this.handleCollision(bodyA, bodyB);
      },
    );
  }

  private handleCollision(bodyA: MatterJS.Body, bodyB: MatterJS.Body): void {
    const labelA = (bodyA as any).label || "";
    const labelB = (bodyB as any).label || "";

    const pocketBody =
      labelA === "pocket" ? bodyA : labelB === "pocket" ? bodyB : null;
    const ballBody = labelA.startsWith("ball_")
      ? bodyA
      : labelB.startsWith("ball_")
        ? bodyB
        : null;

    if (pocketBody && ballBody) {
      const ballNum = parseInt(
        (ballBody as any).label.replace("ball_", ""),
        10,
      );
      this.onBallPocketed(ballNum, ballBody);
    }

    if (this.firstContact === null && this.isSimulating) {
      let cueBody: MatterJS.Body | null = null;
      let otherBody: MatterJS.Body | null = null;

      if (labelA === "ball_0" && labelB.startsWith("ball_")) {
        cueBody = bodyA;
        otherBody = bodyB;
      } else if (labelB === "ball_0" && labelA.startsWith("ball_")) {
        cueBody = bodyB;
        otherBody = bodyA;
      }

      if (cueBody && otherBody) {
        const otherNum = parseInt(
          (otherBody as any).label.replace("ball_", ""),
          10,
        );
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
  //  GROUP TRACKING & UI
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
    const ownGroup =
      this.myPlayerNum === 1 ? this.player1Group : this.player2Group;
    if (!ownGroup) return 7;

    const isSolids =
      ownGroup === "solids" || ownGroup === 1 || (ownGroup as any) === "1";
    const isStripes =
      ownGroup === "stripes" || ownGroup === 2 || (ownGroup as any) === "2";

    let count = 0;
    this.ballRenderer.getAllBalls().forEach((bd) => {
      if (bd.sprite.visible && bd.sprite.x > 0) {
        if (isSolids && bd.number >= 1 && bd.number <= 7) {
          count++;
        } else if (isStripes && bd.number >= 9 && bd.number <= 15) {
          count++;
        }
      }
    });

    return count;
  }
  private assignGroupsLocally(): void {
    if (this.player1Group !== null || this.player2Group !== null) return;
    if (this.pocketedBalls.length === 0) return;

    const firstPocketed = this.pocketedBalls[0];
    if (firstPocketed === 0 || firstPocketed === 8) return;

    const group =
      firstPocketed >= 1 && firstPocketed <= 7 ? "solids" : "stripes";
    this.player1Group = group;
    this.player2Group = group === "solids" ? "stripes" : "solids";
    this.updateGroupDisplay();
  }

  private showGameOverOverlay(won: boolean): void {
    this.hud.showGameOverOverlay(won);
  }

  private updateTurnUI(): void {
    this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);
  }

  private drawCueStick(): void {
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;
    if (this.isAiming) return;
    this.hud.drawCueStickAt(
      cue.x,
      cue.y,
      this.aimAngle || 0,
      0.45,
      this.aimPower,
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  INPUT — Aiming via table pointer, Power via slider
  // ═══════════════════════════════════════════════════════════
  private setupInput(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.isMyTurn || this.isSimulating) return;
      if (
        this.hud.isDraggingPower() ||
        this.hud.isPointerOverPowerUI(pointer.x, pointer.y)
      )
        return;

      this.isAiming = true;
      this.updateAimAngle(pointer);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.isMyTurn || this.isSimulating) return;
      if (
        this.hud.isDraggingPower() ||
        this.hud.isPointerOverPowerUI(pointer.x, pointer.y)
      )
        return;

      if (this.isAiming) {
        this.updateAimAngle(pointer);
      }
    });

    this.input.on("pointerup", () => {
      this.isAiming = false;
    });
  }

  private updateAimAngle(pointer: Phaser.Input.Pointer): void {
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;
    const cx = cue.x;
    const cy = cue.y;
    const dx = pointer.worldX - cx;
    const dy = pointer.worldY - cy;
    if (Math.hypot(dx, dy) < 15) return;

    this.aimAngle = Math.atan2(dy, dx);
    this.updateAimDisplay();
  }

  private updateAimDisplay(): void {
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;

    const ballsList: { number: number; x: number; y: number }[] = [];
    this.ballRenderer.getAllBalls().forEach((bd) => {
      if (bd.sprite.visible && bd.sprite.x > 0) {
        ballsList.push({ number: bd.number, x: bd.sprite.x, y: bd.sprite.y });
      }
    });

    // Pass group assignment & remaining balls count
    const myGroup =
      this.myPlayerNum === 1 ? this.player1Group : this.player2Group;
    const ownRemaining = this.countOwnRemaining();

    this.hud.drawAim(
      cue.x,
      cue.y,
      this.aimAngle,
      this.aimPower,
      ballsList,
      myGroup,
      ownRemaining,
    );
  }
  // ═══════════════════════════════════════════════════════════
  //  SHOT EXECUTION
  // ═══════════════════════════════════════════════════════════
  private executeShot(): void {
    if (this.isSimulating || !this.isMyTurn || this.aimPower <= 0) return;

    // LOCK TURN IMMEDIATELY
    this.isMyTurn = false;
    this.isSimulating = true;
    this.isLocalShot = true;
    this.isAiming = false;
    this.settleFrameCount = 0;

    // Hide trajectory & disable power control
    this.hud.hideAim();
    this.hud.setPowerEnabled(false);
    this.hud.updateTurnUI(this.myPlayerNum, false);

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
      cue.setVelocity(
        Math.cos(this.aimAngle) * speed,
        Math.sin(this.aimAngle) * speed,
      );
    }

    // Tell opponent about shot
    wsClient.send({
      type: "shot_init",
      angle_deg: (this.aimAngle * 180) / Math.PI,
      power: this.aimPower,
      cue_ball_position: [cue.x, cue.y],
    });

    this.hud.setInfo(LANG.simulating);
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE LOOP
  // ═══════════════════════════════════════════════════════════
  update(): void {
    this.ballRenderer.updateShadows();

    if (this.isMyTurn && !this.isSimulating && !this.isAiming) {
      this.drawCueStick();
    } else if (!this.isMyTurn || this.isSimulating) {
      this.hud.cueStick.setAlpha(0);
    }

    // Teleport escaped balls back
    const MBody = (Phaser.Physics.Matter as any).Matter.Body;
    this.ballRenderer.getAllBalls().forEach((bd) => {
      if (!bd.sprite.visible) return;
      const x = bd.sprite.x;
      const y = bd.sprite.y;
      const margin = CUSHION_W * 2;
      if (
        x < TABLE_X - margin ||
        x > TABLE_X + TABLE_W + margin ||
        y < TABLE_Y - margin ||
        y > TABLE_Y + TABLE_H + margin
      ) {
        const rawBody = bd.sprite.body as any as MatterJS.Body;
        MBody.setPosition(rawBody, {
          x: PLAY_L + PLAY_W / 2 + Phaser.Math.Between(-20, 20),
          y: PLAY_T + PLAY_H / 2,
        });
        MBody.setVelocity(rawBody, { x: 0, y: 0 });
      }
    });

    if (!this.isSimulating) return;

    if (Date.now() - this.simStartTime > this.SIM_TIMEOUT) {
      this.processShotResult();
      return;
    }

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

    if (this.isSimulating && this.player1Group !== null) {
      this.updateRemainingDisplay();
    }
  }

  private processShotResult(): void {
    this.isSimulating = false;

    const ballPositions = this.ballRenderer.getPositionsSnapshot();

    wsClient.send({
      type: "shoot",
      angle_deg: (this.aimAngle * 180) / Math.PI,
      power: this.aimPower,
      pocketed: this.pocketedBalls,
      cue_pocketed: this.cuePocketed,
      first_contact: this.firstContact,
      ball_positions: ballPositions,
    });

    this.hud.resetPower();
    this.hud.setInfo(LANG.waitingServer);

    if (this.firstContact === null && this.pocketedBalls.length > 0) {
      this.firstContact = this.pocketedBalls[0];
    }

    this.assignGroupsLocally();

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
        const winnerName =
          winnerNum === 1 ? this.player1Name : this.player2Name;

        this.showGameOverOverlay(won);
        sendToParent("GAME_FINISHED", {
          winner: winnerId,
          winner_name: winnerName,
          reason: evalResult.reason,
        });

        this.time.delayedCall(2000, () => {
          this.scene.start("ResultScene", {
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
    const foulReason = data.foul_reason || "";
    const ballPositions = data.ball_positions || null;
    const ballInHand = data.ball_in_hand || false;

    if (data.player1_group && data.player2_group) {
      this.player1Group = data.player1_group;
      this.player2Group = data.player2_group;
      this.updateGroupDisplay();
    }

    if (ballPositions) {
      this.ballRenderer.setPositions(ballPositions);
    }

    pocketed.forEach((num: number) => this.ballRenderer.pocketBall(num));

    const shooter = data.player || this.myPlayerNum;
    const legalPockets = pocketed.filter((b) => b !== 0 && b !== 8);
    if (legalPockets.length > 0) {
      if (shooter === 1) {
        this.pocketedByPlayer1.push(...legalPockets);
      } else {
        this.pocketedByPlayer2.push(...legalPockets);
      }
      this.updateGroupDisplay();
    }

    if (cuePocketed || ballInHand) {
      this.ballRenderer.respawnCue();
    }

    if (foul) {
      const foulMessage =
        foulReason === "scratch"
          ? LANG.foulScratch
          : foulReason === "early_8_ball"
            ? LANG.foulEarly8
            : foulReason === "wrong_first_contact"
              ? LANG.foulWrongFirst
              : foulReason === "opponent_ball"
                ? LANG.foulOpponentBall
                : foulReason === "no_contact"
                  ? LANG.foulNoContact
                  : foulReason === "illegal_break"
                    ? LANG.foulIllegalBreak
                    : foulReason === "eight_ball_on_break"
                      ? LANG.foulEightOnBreak
                      : foulReason === "no_rail"
                        ? LANG.foulNoRail
                        : LANG.foul(foulReason);
      this.hud.showFoul(foulMessage);
    }

    this.hud.resetPower();

    // Authoritative turn state from server
    const nextPlayer = data.current_player;
    this.isMyTurn = nextPlayer === this.myPlayerNum;

    if (this.isMyTurn) {
      this.hud.setTurnText(LANG.yourTurn, "#f97316");
      this.hud.setInfo(ballInHand ? LANG.ballInHand : LANG.aimAndShoot);
    } else {
      this.hud.setTurnText(LANG.opponentTurn, "#aaaaaa");
      this.hud.setInfo(LANG.waitingOpponent);
    }
    this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);
  }

  // ═══════════════════════════════════════════════════════════
  //  WEBSOCKET HANDLERS
  // ═══════════════════════════════════════════════════════════
  private setupWebSocket(): void {
    wsClient.removeAllListeners();

    wsClient.on("game_start", (data: any) => {
      this.player1Id = data.player1_id;
      this.player1Name = data.player1_name;
      this.player2Id = data.player2_id;
      this.player2Name = data.player2_name;

      this.hud.setNames(
        this.player1Id,
        this.player1Name || LANG.player1,
        this.player2Id,
        this.player2Name || LANG.player2,
      );

      if (data.ball_positions) {
        this.ballRenderer.setPositions(data.ball_positions);
      }
    });

    wsClient.on("your_turn", (data: any) => {
      const isMe =
        data.player === this.myPlayerNum || data.player_id === gameCfg.playerId;
      if (isMe) {
        this.isMyTurn = true;
        this.hud.setTurnText(LANG.yourTurn, "#f97316");
        this.hud.setInfo(LANG.aimAndShoot);
        this.hud.updateTurnUI(this.myPlayerNum, true);
      } else {
        this.isMyTurn = false;
        this.hud.setTurnText(LANG.opponentTurn, "#aaaaaa");
        this.hud.setInfo(LANG.waitingOpponent);
        this.hud.updateTurnUI(this.myPlayerNum, false);
      }
    });

    wsClient.on("opponent_turn", (data: any) => {
      const isMe =
        data.player === this.myPlayerNum || data.player_id === gameCfg.playerId;
      if (!isMe) {
        this.isMyTurn = false;
        this.hud.setTurnText(LANG.opponentTurn, "#aaaaaa");
        this.hud.setInfo(LANG.waitingOpponent);
        this.hud.updateTurnUI(this.myPlayerNum, false);
      }
    });

    wsClient.on("shot_result", (data: any) => {
      this.animateShotResult(data);
    });

    wsClient.on("shot_init", (data: any) => {
      this.playOpponentShot(data);
    });

    wsClient.on("groups_assigned", (data: any) => {
      this.player1Group =
        data.player1_group === "solids" ? "solids" : "stripes";
      this.player2Group =
        data.player2_group === "solids" ? "solids" : "stripes";
      this.updateGroupDisplay();
    });

    wsClient.on("player_disconnected", (data: any) => {
      this.hud.setInfo(
        data.message || "حریف قطع شد. در حال انتظار برای اتصال مجدد...",
      );
    });

    wsClient.on("player_reconnected", (data: any) => {
      this.hud.setInfo(data.message || "حریف دوباره متصل شد");
    });

    wsClient.on("reconnected", (data: any) => {
      console.log("[GameScene] Reconnected to server:", data);

      this.player1Id = data.player1_id;
      this.player1Name = data.player1_name;
      this.player2Id = data.player2_id;
      this.player2Name = data.player2_name;
      this.myPlayerNum = data.player_number;
      this.isMyTurn = data.is_my_turn;

      this.hud.setNames(
        this.player1Id,
        this.player1Name,
        this.player2Id,
        this.player2Name,
      );
      this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);

      if (data.ball_positions) {
        this.ballRenderer.setPositions(data.ball_positions);
      }

      if (data.player1_group && data.player2_group) {
        this.player1Group = data.player1_group;
        this.player2Group = data.player2_group;
        this.updateGroupDisplay();
      }

      this.hud.setInfo("اتصال مجدد موفقیت‌آمیز بود");
    });

    wsClient.on("game_over", (data: any) => {
      this.isSimulating = true;
      this.isMyTurn = false;

      const won = gameCfg.playerId === data.winner;
      this.showGameOverOverlay(won);

      sendToParent("GAME_FINISHED", {
        winner: data.winner,
        winner_name: data.winner_name,
        reason: data.reason,
      });

      this.time.delayedCall(2000, () => {
        this.scene.start("ResultScene", { result: data });
      });
    });

    wsClient.on("error", (data: any) => {
      this.hud.setInfo(data.message || "خطا");
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  OPPONENT SHOT ANIMATION
  // ═══════════════════════════════════════════════════════════
  private playOpponentShot(data: any): void {
    if (data.player === this.myPlayerNum || this.isSimulating) return;

    this.isSimulating = true;
    this.isLocalShot = false;
    this.isMyTurn = false;
    this.isAiming = false;
    this.settleFrameCount = 0;

    this.pocketedBalls = [];
    this.cuePocketed = false;
    this.firstContact = null;
    this.simStartTime = Date.now();

    this.hud.hideAim();
    this.hud.setTurnText(LANG.opponentTurn, "#aaaaaa");
    this.hud.setInfo(LANG.simulating);
    this.hud.updateTurnUI(this.myPlayerNum, false);

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

    this.hud.drawOpponentCueStick(cue.x, cue.y, angleRad);
  }
}
