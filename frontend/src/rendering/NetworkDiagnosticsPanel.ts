import Phaser from "phaser";
import { RemotePlaybackDiagnostics } from "./BallRenderer";

interface SyncSample {
  atMs: number;
  gapMs: number | null;
  bufferedFrames: number;
  progressMs: number;
}

interface PerformanceSample {
  atMs: number;
  fps: number;
  averageFrameMs: number;
  worstFrameMs: number;
  syncRatePerSecond: number;
  syncJitterMs: number;
}

interface ActiveRemoteShot {
  startedAt: number;
  lastSyncAt: number | null;
  lastPerformanceSampleAt: number;
  frameDurations: number[];
  syncSamples: SyncSample[];
  performanceSamples: PerformanceSample[];
}

export interface RemoteShotDiagnosticsLog {
  startedAt: string;
  durationMs: number;
  summary: {
    averageFps: number;
    averageFrameMs: number;
    worstFrameMs: number;
    chunkCount: number;
    chunkRatePerSecond: number;
    averageGapMs: number;
    jitterMs: number;
    maxGapMs: number;
    maxBufferedFrames: number;
  };
  snapshots: SyncSample[];
  performance: PerformanceSample[];
}

/**
 * Lightweight client-side diagnostics for distinguishing rendering stalls from
 * irregular opponent-physics delivery. Toggle it with N.
 */
export class NetworkDiagnosticsPanel {
  private readonly scene: Phaser.Scene;
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private visible = true;
  private frameDurations: number[] = [];
  private syncReceivedAt: number[] = [];
  private lastUpdatedAt = 0;
  private activeRemoteShot: ActiveRemoteShot | null = null;
  private readonly completedLogs: RemoteShotDiagnosticsLog[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.background = scene.add.graphics().setDepth(200);
    this.text = scene.add
      .text(12, 82, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#dbeafe",
        lineSpacing: 3,
      })
      .setDepth(201);

    this.drawBackground();
    scene.input.keyboard?.on("keydown-N", () => this.toggle());

    (
      window as Window & {
        __8ballNetworkDiagnostics?: { logs: RemoteShotDiagnosticsLog[] };
      }
    ).__8ballNetworkDiagnostics = { logs: this.completedLogs };
  }

  beginRemoteShot(): void {
    this.syncReceivedAt = [];
    this.activeRemoteShot = {
      startedAt: Date.now(),
      lastSyncAt: null,
      lastPerformanceSampleAt: 0,
      frameDurations: [],
      syncSamples: [],
      performanceSamples: [],
    };
  }

  recordChunk(
    remotePlayback: RemotePlaybackDiagnostics,
    receivedAt = Date.now(),
  ): void {
    this.syncReceivedAt.push(receivedAt);
    this.prune(receivedAt);

    if (!this.activeRemoteShot) this.beginRemoteShot();
    const activeShot = this.activeRemoteShot!;
    activeShot.syncSamples.push({
      atMs: receivedAt - activeShot.startedAt,
      gapMs:
        activeShot.lastSyncAt === null
          ? null
          : receivedAt - activeShot.lastSyncAt,
      bufferedFrames: remotePlayback.bufferedFrames,
      progressMs: remotePlayback.progressMs,
    });
    activeShot.lastSyncAt = receivedAt;
  }

  recordFrame(
    deltaMs: number,
    isRemoteViewer: boolean,
    remotePlayback: RemotePlaybackDiagnostics,
  ): void {
    const now = Date.now();
    this.frameDurations.push(deltaMs);
    this.prune(now);

    const stats = this.currentStats(now);
    if (this.activeRemoteShot) {
      this.activeRemoteShot.frameDurations.push(deltaMs);
      if (now - this.activeRemoteShot.lastPerformanceSampleAt >= 250) {
        this.activeRemoteShot.performanceSamples.push({
          atMs: now - this.activeRemoteShot.startedAt,
          fps: stats.fps,
          averageFrameMs: stats.averageFrameMs,
          worstFrameMs: stats.worstFrameMs,
          syncRatePerSecond: stats.syncRate,
          syncJitterMs: stats.jitterMs,
        });
        this.activeRemoteShot.lastPerformanceSampleAt = now;
      }
    }

    // Text updates are intentionally throttled so the diagnostics themselves
    // do not meaningfully affect the result being measured.
    if (!this.visible || now - this.lastUpdatedAt < 250) return;
    this.lastUpdatedAt = now;

    this.text.setText([
      "NET DIAG (N to hide)",
      `view: ${isRemoteViewer ? "opponent replay" : "local physics"}`,
      `fps: ${stats.fps.toFixed(1)} | frame: ${stats.averageFrameMs.toFixed(1)} ms | worst: ${stats.worstFrameMs.toFixed(1)} ms`,
      isRemoteViewer
        ? `sync: ${stats.syncRate}/s | age: ${stats.lastSyncAgeMs ?? "--"} ms`
        : "sync: -- (not viewing opponent shot)",
      isRemoteViewer
        ? `gap: ${stats.averageGapMs.toFixed(1)} ms | jitter: ${stats.jitterMs.toFixed(1)} ms | max: ${stats.maxGapMs.toFixed(1)} ms`
        : "gap: --",
      isRemoteViewer
        ? `replay: ${remotePlayback.progressMs.toFixed(0)} ms | ${remotePlayback.finished ? "done" : "playing"} | buffered: ${remotePlayback.bufferedFrames}`
        : "replay: --",
    ]);
  }

  finishRemoteShot(): RemoteShotDiagnosticsLog | null {
    const activeShot = this.activeRemoteShot;
    if (!activeShot) return null;

    const endedAt = Date.now();
    const durationMs = endedAt - activeShot.startedAt;
    const gaps = activeShot.syncSamples
      .map((sample) => sample.gapMs)
      .filter((gap): gap is number => gap !== null);
    const bufferedFrames = activeShot.syncSamples.map(
      (sample) => sample.bufferedFrames,
    );
    const averageFrameMs = this.average(activeShot.frameDurations);
    const averageGapMs = this.average(gaps);
    const log: RemoteShotDiagnosticsLog = {
      startedAt: new Date(activeShot.startedAt).toISOString(),
      durationMs,
      summary: {
        averageFps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
        averageFrameMs,
        worstFrameMs: Math.max(...activeShot.frameDurations, 0),
        chunkCount: activeShot.syncSamples.length,
        chunkRatePerSecond:
          durationMs > 0
            ? (activeShot.syncSamples.length * 1000) / durationMs
            : 0,
        averageGapMs,
        jitterMs: this.standardDeviation(gaps, averageGapMs),
        maxGapMs: Math.max(...gaps, 0),
        maxBufferedFrames: Math.max(...bufferedFrames, 0),
      },
      snapshots: activeShot.syncSamples,
      performance: activeShot.performanceSamples,
    };

    this.completedLogs.push(log);
    if (this.completedLogs.length > 10) this.completedLogs.shift();
    this.activeRemoteShot = null;

    console.groupCollapsed(
      `[8-ball diagnostics] Opponent shot (${durationMs.toFixed(0)} ms)`,
    );
    console.table([log.summary]);
    console.table(log.snapshots);
    console.table(log.performance);
    console.log("Copyable JSON:", JSON.stringify(log, null, 2));
    console.groupEnd();
    window.dispatchEvent(
      new CustomEvent("8ball:network-diagnostics", { detail: log }),
    );

    return log;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.background.setVisible(this.visible);
    this.text.setVisible(this.visible);
  }

  private prune(now: number): void {
    const cutoff = now - 1000;
    this.frameDurations = this.frameDurations.slice(-120);
    this.syncReceivedAt = this.syncReceivedAt.filter((time) => time >= cutoff);
  }

  private currentStats(now: number): {
    fps: number;
    averageFrameMs: number;
    worstFrameMs: number;
    syncRate: number;
    averageGapMs: number;
    jitterMs: number;
    maxGapMs: number;
    lastSyncAgeMs: number | null;
  } {
    const averageFrameMs = this.average(this.frameDurations);
    const intervals = this.syncIntervals();
    const averageGapMs = this.average(intervals);
    return {
      fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
      averageFrameMs,
      worstFrameMs: Math.max(...this.frameDurations, 0),
      syncRate: this.syncReceivedAt.length,
      averageGapMs,
      jitterMs: this.standardDeviation(intervals, averageGapMs),
      maxGapMs: Math.max(...intervals, 0),
      lastSyncAgeMs: this.syncReceivedAt.length
        ? now - this.syncReceivedAt.at(-1)!
        : null,
    };
  }

  private syncIntervals(): number[] {
    return this.syncReceivedAt
      .slice(1)
      .map((time, index) => time - this.syncReceivedAt[index]);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private standardDeviation(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    return Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length,
    );
  }

  private drawBackground(): void {
    this.background.clear();
    this.background.fillStyle(0x07111f, 0.84);
    this.background.fillRoundedRect(6, 74, 330, 132, 6);
    this.background.lineStyle(1, 0x38bdf8, 0.55);
    this.background.strokeRoundedRect(6, 74, 330, 132, 6);
  }
}
