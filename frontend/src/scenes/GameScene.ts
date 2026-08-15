import Phaser from "phaser";
import { wsClient } from "../network/wsClient";
import { config as gameCfg } from "../config";
import { LANG } from "../lang";
import { evaluateShot, Group } from "../rules";
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
  CUSHION_W,
} from "../gameConfig";
import { TableRenderer } from "../rendering/TableRenderer";
import { BallRenderer } from "../rendering/BallRenderer";
import { HUD } from "../rendering/HUD";
import { PhysicsDebugPanel } from "../rendering/PhysicsDebugPanel";
import { NetworkDiagnosticsPanel } from "../rendering/NetworkDiagnosticsPanel";
import { addUniqueNumbers, getCollisionPairs } from "../utils/collisionPairs";
import { AimSample, sampleAim, TrajectoryFrame } from "../utils/trajectory";

interface PendingAuthoritativeShotResult {
  ball_positions: Record<string, [number, number]> | null;
  pocketed: number[];
  cuePocketed: boolean;
  ballInHand: boolean;
}

export class GameScene extends Phaser.Scene {
  // Ball renderer
  private ballRenderer!: BallRenderer;

  // Input state
  private isMyTurn = false;
  private myPlayerNum = 1;
  private aimAngle = 0;
  private aimPower = 0;
  private isAiming = false;

  // Opponent aim state (driven by the recorded aim replay)
  private opponentAimAngle = 0;
  private opponentAimPower = 0;

  // Aim recording (shooter side) — recorded at ~50 FPS, replayed by the viewer
  private aimSessionActive = false;
  private aimRecording = false;
  private aimRecordStart = 0;
  private lastAimRecordTime = Number.NEGATIVE_INFINITY;
  private recordedAimSamples: AimSample[] = [];
  private lastAimChunkSendTime = 0;
  private readonly AIM_RECORD_INTERVAL_MS = 20; // 50 FPS >= 45 FPS
  private readonly AIM_CHUNK_INTERVAL_MS = 500;
  private readonly AIM_CHUNK_SAMPLE_THRESHOLD = 25;
  private aimChunkSequence = 0;

  // Aim replay (viewer side) — plays before the ball trajectory replay
  private aimSamples: AimSample[] = [];
  private aimReplayActive = false;
  private aimReplayStartAt = 0;

  // Simulation settle state
  private isSimulating = false;
  private settleFrameCount = 0;
  private readonly SIM_TIMEOUT = 6000;
  private readonly SETTLE_FRAMES = 5;
  private isLocalShot = true;
  private simStartTime = 0;
  private pocketedBalls: number[] = [];
  private cuePocketed = false;
  private firstContact: number | null = null;
  private pocketSensors: MatterJS.Body[] = [];

  // Trajectory chunk stream (recorded, replayed once fully transferred)
  private lastChunkSendTime = 0;
  private readonly TRAJECTORY_CHUNK_INTERVAL_MS = 1000;
  private shotChunkSequence = 0;
  private pendingAuthoritativeShotResult: PendingAuthoritativeShotResult | null =
    null;
  private remoteShotReplayStarted = false;

  // Physics debug overlay
  private debugPanel!: PhysicsDebugPanel;
  private networkDiagnostics!: NetworkDiagnosticsPanel;
  private wallBodies: MatterJS.Body[] = [];

  // Game state & Profile data
  private player1Name = "";
  private player2Name = "";
  private player1Id = "";
  private player2Id = "";
  private player1Avatar = "";
  private player2Avatar = "";
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
    this.player1Avatar = gd.player1_avatar || "";
    this.player2Id = gd.player2_id || "";
    this.player2Name = gd.player2_name || "";
    this.player2Avatar = gd.player2_avatar || "";

    this.pocketedBalls = [];
    this.cuePocketed = false;
    this.firstContact = null;
    this.isSimulating = false;
    this.settleFrameCount = 0;
    this.pocketedByPlayer1 = [];
    this.pocketedByPlayer2 = [];
    this.player1Group = null;
    this.player2Group = null;
    this.opponentAimAngle = 0;
    this.opponentAimPower = 0;
    this.aimSessionActive = false;
    this.aimRecording = false;
    this.recordedAimSamples = [];
    this.aimSamples = [];
    this.aimReplayActive = false;
    this.pendingAuthoritativeShotResult = null;
    this.remoteShotReplayStarted = false;
    this.lastChunkSendTime = 0;
    this.shotChunkSequence = 0;
    this.aimChunkSequence = 0;

    if (gd.player_number) {
      this.myPlayerNum = gd.player_number;
    } else if (gd.player2_id && gameCfg.playerId === gd.player2_id) {
      this.myPlayerNum = 2;
    } else {
      this.myPlayerNum = 1;
    }

    if (this.myPlayerNum === 1 && !this.player1Avatar) {
      this.player1Avatar = gameCfg.playerAvatar;
    } else if (this.myPlayerNum === 2 && !this.player2Avatar) {
      this.player2Avatar = gameCfg.playerAvatar;
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
      this.player1Avatar,
      this.player2Avatar,
    );
    this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);

    // Start turn timer for break player
    const activePlayerNum: 1 | 2 = this.isMyTurn
      ? this.myPlayerNum === 2
        ? 2
        : 1
      : this.myPlayerNum === 1
        ? 2
        : 1;
    this.hud.startTurnTimer(activePlayerNum, 60);

    this.hud.setupPowerCallbacks(
      (power: number) => {
        this.aimPower = power;
        this.startAimSession();
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

    this.networkDiagnostics = new NetworkDiagnosticsPanel(this);
  }

  // ─── Collision handler (pocket detection + first contact) ─
  private setupCollisionHandler(): void {
    this.matter.world.on(
      "collisionstart",
      (event: any, bodyA: any, bodyB: any) => {
        getCollisionPairs(event, bodyA, bodyB).forEach((pair) => {
          this.handleCollision(pair.bodyA, pair.bodyB);
        });
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
      if (this.cuePocketed) return;
      this.cuePocketed = true;
      this.ballRenderer.respawnCue();
    } else {
      const previousCount = this.pocketedBalls.length;
      addUniqueNumbers(this.pocketedBalls, [ballNum]);
      if (this.pocketedBalls.length === previousCount) return;
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
      this.countOwnRemaining(),
      this.countOwnRemaining(),
    );
  }

  private updateRemainingDisplay(): void {
    this.hud.updateGroupDisplay(
      this.myPlayerNum,
      this.player1Group,
      this.player2Group,
      this.pocketedByPlayer1,
      this.pocketedByPlayer2,
      this.countOwnRemaining(),
      this.countOwnRemaining(),
    );
  }

  private countOwnRemaining(): number {
    const ownGroup =
      this.myPlayerNum === 1 ? this.player1Group : this.player2Group;
    if (!ownGroup) return 7;

    const isSolids = ownGroup === "solids";
    const isStripes = ownGroup === "stripes";

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

  private drawCueStick(): void {
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;
    this.hud.drawCueStickAt(
      cue.x,
      cue.y,
      this.aimAngle || 0,
      0.45,
      this.aimPower,
    );
  }

  private drawOpponentAimAndCue(): void {
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue || !cue.visible) {
      this.hud.cueStick.setAlpha(0);
      return;
    }

    const ballsList: { number: number; x: number; y: number }[] = [];
    this.ballRenderer.getAllBalls().forEach((bd) => {
      if (bd.sprite.visible && bd.sprite.x > 0) {
        ballsList.push({ number: bd.number, x: bd.sprite.x, y: bd.sprite.y });
      }
    });

    const opponentGroup =
      this.myPlayerNum === 1 ? this.player2Group : this.player1Group;

    this.hud.drawCueStickAt(
      cue.x,
      cue.y,
      this.opponentAimAngle,
      0.45,
      this.opponentAimPower,
    );

    this.hud.drawAim(
      cue.x,
      cue.y,
      this.opponentAimAngle,
      this.opponentAimPower,
      ballsList,
      opponentGroup,
      7,
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
    this.startAimSession();
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

  /**
   * The aim preview is recorded like the shot trajectory, transferred in
   * chunks, and only rendered by the viewer once fully received. This method
   * lazily opens the recording session and throttles samples to >= 45 FPS.
   */
  private startAimSession(): void {
    this.aimSessionActive = true;
  }

  private recordAimSample(): void {
    if (!this.isMyTurn || this.isSimulating || !this.aimSessionActive) return;

    if (!this.aimRecording) {
      this.aimRecording = true;
      this.aimRecordStart = Date.now();
      this.lastAimRecordTime = Number.NEGATIVE_INFINITY;
    }

    const now = Date.now();
    const t = now - this.aimRecordStart;
    if (t - this.lastAimRecordTime < this.AIM_RECORD_INTERVAL_MS) return;
    this.lastAimRecordTime = t;

    this.recordedAimSamples.push({
      t,
      a: (this.aimAngle * 180) / Math.PI,
      p: this.aimPower,
    });

    const shouldSend =
      this.recordedAimSamples.length >= this.AIM_CHUNK_SAMPLE_THRESHOLD ||
      (this.recordedAimSamples.length > 0 &&
        now - this.lastAimChunkSendTime >= this.AIM_CHUNK_INTERVAL_MS);
    if (!shouldSend) return;

    const samples = this.recordedAimSamples;
    this.recordedAimSamples = [];
    this.lastAimChunkSendTime = now;
    wsClient.send({
      type: "aim_chunk",
      sequence: ++this.aimChunkSequence,
      samples,
    });
  }

  private flushAimRecording(): void {
    if (this.aimRecording && this.aimSessionActive) {
      this.recordedAimSamples.push({
        t: Date.now() - this.aimRecordStart,
        a: (this.aimAngle * 180) / Math.PI,
        p: this.aimPower,
      });
    }
    if (this.recordedAimSamples.length > 0) {
      wsClient.send({
        type: "aim_chunk",
        sequence: ++this.aimChunkSequence,
        samples: this.recordedAimSamples,
      });
    }
    this.recordedAimSamples = [];
    this.aimRecording = false;
    this.aimSessionActive = false;
  }

  /** Advances the recorded opponent aim replay once per render frame. */
  private advanceAimReplay(): void {
    if (!this.aimReplayActive) return;

    const state = sampleAim(
      this.aimSamples,
      Date.now() - this.aimReplayStartAt,
    );
    this.opponentAimAngle = (state.angleDeg * Math.PI) / 180;
    this.opponentAimPower = state.power;
    if (state.finished) this.aimReplayActive = false;
  }

  private beginAimReplay(): void {
    this.aimReplayActive = this.aimSamples.length > 0;
    this.aimReplayStartAt = Date.now();
  }

  private resetAimReplay(): void {
    this.aimSamples = [];
    this.aimReplayActive = false;
  }

  // ═══════════════════════════════════════════════════════════
  //  SHOT EXECUTION
  // ═══════════════════════════════════════════════════════════
  private executeShot(): void {
    if (this.isSimulating || !this.isMyTurn || this.aimPower <= 0) return;

    this.isMyTurn = false;
    this.isSimulating = true;
    this.isLocalShot = true;
    this.isAiming = false;
    this.settleFrameCount = 0;

    this.hud.hideAim();
    this.hud.stopTurnTimer();
    this.hud.setPowerEnabled(false);
    this.hud.updateTurnUI(this.myPlayerNum, false);

    this.pocketedBalls = [];
    this.cuePocketed = false;
    this.firstContact = null;
    this.simStartTime = Date.now();
    this.lastChunkSendTime = 0;
    this.shotChunkSequence = 0;
    this.flushAimRecording();
    this.ballRenderer.beginTrajectoryRecording();

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

    wsClient.send({
      type: "shot_init",
      angle_deg: (this.aimAngle * 180) / Math.PI,
      power: this.aimPower,
      cue_ball_position: [cue.x, cue.y],
      ball_positions: this.ballRenderer.getPositionsSnapshot(),
    });

    this.hud.setInfo(LANG.simulating);
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE LOOP
  // ═══════════════════════════════════════════════════════════
  update(_time: number, delta: number): void {
    this.ballRenderer.updateRemotePlayback();

    // Record the local aim preview for transfer (>= 45 FPS sampling).
    if (this.aimSessionActive) this.recordAimSample();

    // Advance the opponent's recorded aim replay.
    this.advanceAimReplay();

    // Start the ball replay once the aim replay has finished AND the full
    // trajectory is buffered.
    if (
      !this.aimReplayActive &&
      this.pendingAuthoritativeShotResult &&
      !this.remoteShotReplayStarted
    ) {
      this.remoteShotReplayStarted = this.ballRenderer.startRemoteReplay(
        Date.now(),
      );
    }

    // Apply the authoritative final state once the replay has finished.
    if (
      this.pendingAuthoritativeShotResult &&
      this.ballRenderer.isRemoteReplayFinished()
    ) {
      this.finishRemoteShotVisual(this.pendingAuthoritativeShotResult);
      this.pendingAuthoritativeShotResult = null;
    }

    this.ballRenderer.updateShadows();
    this.hud.updateTimer(); // Update 60s active turn avatar ring frame by frame
    this.networkDiagnostics.recordFrame(
      delta,
      this.isSimulating && !this.isLocalShot,
      this.ballRenderer.getRemotePlaybackDiagnostics(),
    );

    if (this.aimReplayActive) {
      this.drawOpponentAimAndCue();
    } else if (!this.isSimulating) {
      if (this.isMyTurn) {
        this.drawCueStick();
      }
    } else {
      this.hud.cueStick.setAlpha(0);
    }

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

    if (this.isLocalShot) {
      const now = Date.now();
      this.ballRenderer.recordTrajectoryFrame(now - this.simStartTime);

      if (now - this.lastChunkSendTime >= this.TRAJECTORY_CHUNK_INTERVAL_MS) {
        this.lastChunkSendTime = now;
        const frames = this.ballRenderer.takeTrajectoryChunk();
        if (frames.length > 0) {
          wsClient.send({
            type: "shot_chunk",
            sequence: ++this.shotChunkSequence,
            shot_elapsed_ms: now - this.simStartTime,
            frames,
          });
        }
      }
    }

    let allSettled = true;
    this.ballRenderer.getAllBalls().forEach((bd) => {
      const rawBody = bd.sprite.body as any;
      if (rawBody && bd.sprite.visible) {
        if (rawBody.speed < 0.18) {
          MBody.setVelocity(rawBody, { x: 0, y: 0 });
          MBody.setAngularVelocity(rawBody, 0);
        } else {
          allSettled = false;
        }
      }
    });

    if (Date.now() - this.simStartTime > this.SIM_TIMEOUT) {
      if (this.isLocalShot) this.processShotResult();
      return;
    }

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

    // Flush any remaining trajectory frames before the authoritative result so
    // the viewer always buffers the complete trajectory ahead of shot_result.
    const remainingFrames = this.ballRenderer.takeTrajectoryChunk();
    if (remainingFrames.length > 0) {
      wsClient.send({
        type: "shot_chunk",
        sequence: ++this.shotChunkSequence,
        shot_elapsed_ms: Date.now() - this.simStartTime,
        frames: remainingFrames,
      });
    }
    this.ballRenderer.endTrajectoryRecording();

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

        this.hud.stopTurnTimer();
        this.showGameOverOverlay(won);

        this.time.delayedCall(1500, () => {
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
    const isRemoteViewer = this.isSimulating && !this.isLocalShot;

    if (isRemoteViewer) {
      this.networkDiagnostics.finishRemoteShot();
    }

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

    if (isRemoteViewer) {
      // The visual final state is applied only after the recorded replay has
      // finished, so pocketing / cue-respawn line up with the animation.
      this.pendingAuthoritativeShotResult = {
        ball_positions: ballPositions,
        pocketed,
        cuePocketed,
        ballInHand,
      };
      this.remoteShotReplayStarted = this.ballRenderer.startRemoteReplay(
        Date.now(),
      );
      this.isSimulating = true;
    } else {
      if (ballPositions) {
        this.ballRenderer.setPositions(ballPositions);
      }

      pocketed.forEach((num: number) => this.ballRenderer.pocketBall(num));

      if (cuePocketed || ballInHand) {
        this.ballRenderer.respawnCue();
      }

      this.isSimulating = false;
    }

    const shooter = data.player || this.myPlayerNum;
    const legalPockets = pocketed.filter((b) => b !== 0 && b !== 8);
    if (legalPockets.length > 0) {
      if (shooter === 1) {
        addUniqueNumbers(this.pocketedByPlayer1, legalPockets);
      } else {
        addUniqueNumbers(this.pocketedByPlayer2, legalPockets);
      }
      this.updateGroupDisplay();
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

    const nextPlayer = data.current_player;
    this.isMyTurn = nextPlayer === this.myPlayerNum;

    // Reset 60s turn timer for next player
    this.hud.startTurnTimer(nextPlayer as 1 | 2, 60);

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
      this.player1Avatar =
        data.player1_avatar ||
        (this.myPlayerNum === 1 ? gameCfg.playerAvatar : "");
      this.player2Id = data.player2_id;
      this.player2Name = data.player2_name;
      this.player2Avatar =
        data.player2_avatar ||
        (this.myPlayerNum === 2 ? gameCfg.playerAvatar : "");

      this.hud.setNames(
        this.player1Id,
        this.player1Name || LANG.player1,
        this.player2Id,
        this.player2Name || LANG.player2,
        this.player1Avatar,
        this.player2Avatar,
      );

      if (data.ball_positions) {
        this.ballRenderer.setPositions(data.ball_positions);
      }

      const activePlayer = data.break_player || 1;
      this.hud.startTurnTimer(activePlayer as 1 | 2, 60);
    });

    wsClient.on("your_turn", (data: any) => {
      const isMe =
        data.player === this.myPlayerNum || data.player_id === gameCfg.playerId;
      this.hud.startTurnTimer(data.player as 1 | 2, 60);
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
      this.hud.startTurnTimer(data.player as 1 | 2, 60);
      if (!isMe) {
        this.isMyTurn = false;
        this.hud.setTurnText(LANG.opponentTurn, "#aaaaaa");
        this.hud.setInfo(LANG.waitingOpponent);
        this.hud.updateTurnUI(this.myPlayerNum, false);
      }
    });

    wsClient.on("aim_chunk", (data: any) => {
      if (this.isMyTurn || this.isLocalShot) return;
      const samples = data.samples as AimSample[] | undefined;
      if (!samples || samples.length === 0) return;
      this.aimSamples.push(...samples);
    });

    wsClient.on("shot_result", (data: any) => {
      this.animateShotResult(data);
    });

    wsClient.on("shot_init", (data: any) => {
      this.playOpponentShot(data);
    });

    wsClient.on("shot_chunk", (data: any) => {
      if (this.isLocalShot || !this.isSimulating) return;
      const frames = data.frames as TrajectoryFrame[] | undefined;
      if (!frames || frames.length === 0) return;

      this.ballRenderer.appendTrajectoryChunk(frames);
      this.networkDiagnostics.recordChunk(
        this.ballRenderer.getRemotePlaybackDiagnostics(),
      );
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
      this.player1Avatar = data.player1_avatar || "";
      this.player2Id = data.player2_id;
      this.player2Name = data.player2_name;
      this.player2Avatar = data.player2_avatar || "";
      this.myPlayerNum = data.player_number;
      this.isMyTurn = data.is_my_turn;

      this.hud.setNames(
        this.player1Id,
        this.player1Name,
        this.player2Id,
        this.player2Name,
        this.player1Avatar,
        this.player2Avatar,
      );
      this.hud.updateTurnUI(this.myPlayerNum, this.isMyTurn);
      this.hud.startTurnTimer(data.current_player as 1 | 2, 60);

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

      this.hud.stopTurnTimer();

      const won = gameCfg.playerId === data.winner;
      this.showGameOverOverlay(won);

      this.time.delayedCall(1500, () => {
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
    this.hud.stopTurnTimer();
    this.hud.setTurnText(LANG.opponentTurn, "#aaaaaa");
    this.hud.setInfo(LANG.waitingShotData);
    this.hud.updateTurnUI(this.myPlayerNum, false);

    const cuePos = data.cue_ball_position;
    const cue = this.ballRenderer.getCueBallSprite();
    if (!cue) return;

    if (data.ball_positions) {
      this.ballRenderer.setPositions(data.ball_positions);
    }
    if (Array.isArray(cuePos) && cuePos.length === 2) {
      cue.setPosition(cuePos[0], cuePos[1]);
    }

    this.ballRenderer.beginRemotePlayback();
    this.remoteShotReplayStarted = false;
    this.pendingAuthoritativeShotResult = null;
    this.networkDiagnostics.beginRemoteShot();
    this.beginAimReplay();
  }

  /** Applies the server-confirmed final state once the recorded replay ends. */
  private finishRemoteShotVisual(
    state: PendingAuthoritativeShotResult,
  ): void {
    this.ballRenderer.endRemotePlayback();

    if (state.ball_positions) {
      this.ballRenderer.setPositions(state.ball_positions);
    }

    state.pocketed.forEach((num: number) => this.ballRenderer.pocketBall(num));

    if (state.cuePocketed || state.ballInHand) {
      this.ballRenderer.respawnCue();
    }

    this.isSimulating = false;
    this.resetAimReplay();
  }
}
