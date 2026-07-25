/**
 * Parse URL parameters passed by the Porteghal app WebView.
 */
export interface GameConfig {
  playerId: string;
  playerName: string;
  opponentId: string;
  opponentName: string;
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
  
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = params.get('wsUrl') || `${window.location.host}`;
  const roomId = params.get('roomId') || `room_${Math.random().toString(36).slice(2, 10)}`;
  
  return {
    playerId: params.get('playerId') || `guest_${Math.random().toString(36).slice(2, 8)}`,
    playerName: params.get('playerName') || 'Player',
    opponentId: params.get('opponentId') || '',
    opponentName: params.get('opponentName') || '',
    apiBaseUrl: params.get('apiBaseUrl') || '',
    wsUrl: `${wsProtocol}//${wsHost}/ws/game/${roomId}`,
    betAmount: parseInt(params.get('betAmount') || '0', 10),
    tableSkin: params.get('tableSkin') || 'classic',
    ballSet: params.get('ballSet') || 'classic',
    cueSkin: params.get('cueSkin') || 'standard',
    roomId,
  };
}

export const config = getConfig();
