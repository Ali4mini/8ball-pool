/**
 * Parse URL parameters passed by the Porteghal app WebView,
 * with sessionStorage persistence for tab refreshes and reconnects.
 */
export interface GameConfig {
  playerId: string;
  playerName: string;
  playerAvatar: string;
  opponentId: string;
  opponentName: string;
  opponentAvatar: string;
  apiBaseUrl: string;
  wsUrl: string;
  betAmount: number;
  tableSkin: string;
  ballSet: string;
  cueSkin: string;
  roomId: string;
}

export function getConfig(): GameConfig {
  const params = new URLSearchParams(window.location.search);

  // 1. Resolve Room ID
  let roomId = params.get("roomId");
  if (!roomId) {
    roomId = sessionStorage.getItem("8ball_active_roomId");
    if (!roomId) {
      roomId = `room_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem("8ball_active_roomId", roomId);
    }
  } else {
    sessionStorage.setItem("8ball_active_roomId", roomId);
  }

  // 2. Resolve Player ID
  let playerId = params.get("playerId");
  if (!playerId) {
    playerId = sessionStorage.getItem("8ball_active_playerId");
    if (!playerId) {
      playerId = `guest_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("8ball_active_playerId", playerId);
    }
  } else {
    sessionStorage.setItem("8ball_active_playerId", playerId);
  }

  // 3. Resolve Player Name
  let playerName = params.get("playerName");
  if (!playerName) {
    playerName = sessionStorage.getItem("8ball_active_playerName") || "Player";
  } else {
    sessionStorage.setItem("8ball_active_playerName", playerName);
  }

  // 4. Resolve Player Avatar URL
  let playerAvatar = params.get("playerAvatar");
  if (!playerAvatar) {
    playerAvatar = sessionStorage.getItem("8ball_active_playerAvatar") || "";
  } else {
    sessionStorage.setItem("8ball_active_playerAvatar", playerAvatar);
  }

  // 5. Resolve Opponent Avatar URL
  let opponentAvatar = params.get("opponentAvatar") || "";

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsHost = params.get("wsUrl") || `${window.location.host}`;

  return {
    playerId,
    playerName,
    playerAvatar,
    opponentId: params.get("opponentId") || "",
    opponentName: params.get("opponentName") || "",
    opponentAvatar,
    apiBaseUrl: params.get("apiBaseUrl") || "",
    wsUrl: `${wsProtocol}//${wsHost}/ws/game/${roomId}`,
    betAmount: parseInt(params.get("betAmount") || "0", 10),
    tableSkin: params.get("tableSkin") || "classic",
    ballSet: params.get("ballSet") || "classic",
    cueSkin: params.get("cueSkin") || "standard",
    roomId,
  };
}

export const config = getConfig();
