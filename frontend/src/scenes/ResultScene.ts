import Phaser from "phaser";
import { config } from "../config";
import { LANG } from "../lang";
import { sendToParent } from "../utils/bridge";
import { wsClient } from "../network/wsClient";

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: "ResultScene" });
  }

  create(data: { result: any }): void {
    const { width, height } = this.scale;
    const result = data.result || {};
    const isWinner = result.winner === config.playerId;

    // Background
    const bg = this.add.graphics();
    if (isWinner) {
      bg.fillGradientStyle(0x0a1a0a, 0x1a4a1a, 0x0a1a0a, 0x1a4a1a, 1);
    } else {
      bg.fillGradientStyle(0x1a0a0a, 0x4a1a1a, 0x1a0a0a, 0x4a1a1a, 1);
    }
    bg.fillRect(0, 0, width, height);

    // Vignette
    const vig = this.add.graphics();
    vig.fillGradientStyle(0x000000, 0x000000, 0x00000000, 0x00000000, 1);
    vig.fillRect(0, 0, width, 100);
    const vigB = this.add.graphics();
    vigB.fillGradientStyle(0x00000000, 0x00000000, 0x000000, 0x000000, 1);
    vigB.fillRect(0, height - 100, width, 100);

    // Trophy / sad face with entrance animation
    const emoji = this.add
      .text(width / 2, -60, isWinner ? "🏆" : "😔", {
        fontSize: "90px",
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: emoji,
      y: height * 0.14,
      duration: 800,
      ease: "Bounce.easeOut",
    });

    // Win/Lose text
    const winText = this.add
      .text(width / 2, height * 0.28, isWinner ? LANG.win : LANG.lose, {
        fontSize: "34px",
        fontFamily: "IRANSans, Vazir, Tahoma, Arial, sans-serif",
        fontStyle: "bold",
        color: isWinner ? "#44ff44" : "#ff4444",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: winText,
      alpha: 1,
      duration: 600,
      delay: 400,
    });

    // Winner name
    if (!isWinner && result.winner_name) {
      const winnerLabel = this.add
        .text(width / 2, height * 0.38, LANG.playerWon(result.winner_name), {
          fontSize: "18px",
          fontFamily: "IRANSans, Vazir, Tahoma, Arial, sans-serif",
          color: "#cccccc",
        })
        .setOrigin(0.5)
        .setAlpha(0);

      this.tweens.add({
        targets: winnerLabel,
        alpha: 1,
        duration: 600,
        delay: 600,
      });
    }

    // Reason card
    const reasonMap: Record<string, string> = {
      pocketed_8_ball: LANG.pocketed8,
      early_8_ball: LANG.early8Ball,
      opponent_disconnected: LANG.opponentDisconnected,
      time_out: "پایان مهلت زمان (تایم‌اوت)",
    };
    const reasonText = reasonMap[result.reason] || LANG.gameEnded;

    const reasonCard = this.add.graphics();
    reasonCard.fillStyle(0x000000, 0.3);
    reasonCard.fillRoundedRect(width / 2 - 140, height * 0.45, 280, 40, 8);

    this.add
      .text(width / 2, height * 0.47, reasonText, {
        fontSize: "15px",
        fontFamily: "IRANSans, Vazir, Tahoma, Arial, sans-serif",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    // Divider line
    const divider = this.add.graphics();
    divider.lineStyle(1, 0xffffff, 0.1);
    divider.beginPath();
    divider.moveTo(width * 0.25, height * 0.56);
    divider.lineTo(width * 0.75, height * 0.56);
    divider.strokePath();

    // Play Again button
    const playAgainBtn = this.add
      .text(width / 2, height * 0.64, LANG.playAgain, {
        fontSize: "18px",
        fontFamily: "IRANSans, Vazir, Tahoma, Arial, sans-serif",
        color: "#ffffff",
        backgroundColor: "#f97316",
        padding: { x: 36, y: 14 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0);

    this.tweens.add({
      targets: playAgainBtn,
      alpha: 1,
      duration: 400,
      delay: 800,
    });

    playAgainBtn.on("pointerover", () =>
      playAgainBtn.setBackgroundColor("#ff8c42"),
    );
    playAgainBtn.on("pointerout", () =>
      playAgainBtn.setBackgroundColor("#f97316"),
    );
    playAgainBtn.on("pointerdown", async () => {
      playAgainBtn.setAlpha(0.5);
      wsClient.disconnect();

      // Generate a fresh room ID for matchmaking
      const newRoomId = `room_${Math.random().toString(36).slice(2, 10)}`;
      config.roomId = newRoomId;
      sessionStorage.setItem("8ball_active_roomId", newRoomId);

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost =
        new URLSearchParams(window.location.search).get("wsUrl") ||
        `${window.location.host}`;
      config.wsUrl = `${wsProtocol}//${wsHost}/ws/game/${newRoomId}`;

      try {
        await wsClient.connect();
        this.scene.start("WaitingScene");
      } catch (e) {
        console.error("Reconnection error:", e);
        window.location.reload();
      }
    });

    // Back to lobby / Exit button
    const lobbyBtn = this.add
      .text(width / 2, height * 0.76, LANG.backToLobby, {
        fontSize: "15px",
        fontFamily: "IRANSans, Vazir, Tahoma, Arial, sans-serif",
        color: "#888888",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0);

    this.tweens.add({
      targets: lobbyBtn,
      alpha: 1,
      duration: 400,
      delay: 1000,
    });

    lobbyBtn.on("pointerover", () => lobbyBtn.setColor("#ffffff"));
    lobbyBtn.on("pointerout", () => lobbyBtn.setColor("#888888"));
    lobbyBtn.on("pointerdown", () => {
      wsClient.disconnect();
      sendToParent("GAME_FINISHED", result);
    });

    // Winner celebration particles
    if (isWinner) {
      this.time.addEvent({
        delay: 100,
        repeat: 15,
        callback: () => {
          const px = Phaser.Math.Between(50, width - 50);
          const py = Phaser.Math.Between(50, height * 0.5);
          const particle = this.add.graphics();
          const colors = [0xffd700, 0xf97316, 0x44ff44, 0x00ffff, 0xff44ff];
          particle.fillStyle(
            colors[Phaser.Math.Between(0, colors.length - 1)],
            0.8,
          );
          particle.fillCircle(0, 0, Phaser.Math.Between(2, 5));
          particle.setPosition(px, py);

          this.tweens.add({
            targets: particle,
            y: py + Phaser.Math.Between(50, 150),
            alpha: 0,
            duration: Phaser.Math.Between(800, 1500),
            ease: "Quad.easeOut",
            onComplete: () => particle.destroy(),
          });
        },
      });
    }

    // Auto-close after 30 seconds idle timeout
    this.time.delayedCall(30000, () => {
      wsClient.disconnect();
      sendToParent("GAME_FINISHED", result);
    });
  }
}
