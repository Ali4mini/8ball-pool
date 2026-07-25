/**
 * WebSocket client for 8-ball game.
 * Handles connection, reconnection, and message dispatch.
 */
import { config } from '../config';

export type MessageHandler = (data: any) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private intentionalClose = false;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.intentionalClose = false;
        this.ws = new WebSocket(config.wsUrl);

        this.ws.onopen = () => {
          console.log('[WS] Connected');
          this.connected = true;
          this.reconnectAttempts = 0;

          // Send join room
          this.send({
            type: 'join_room',
            player_id: config.playerId,
            player_name: config.playerName,
            opponent_id: config.opponentId,
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.dispatch(data.type, data);
          } catch (e) {
            console.error('[WS] Failed to parse message:', e);
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          if (!this.intentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[WS] Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
          }
        };

        this.ws.onerror = (err) => {
          console.error('[WS] Error:', err);
          reject(err);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  send(data: any): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      this.handlers.set(type, handlers.filter(h => h !== handler));
    }
  }

  private dispatch(type: string, data: any): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach(h => h(data));
    }
  }

  get isConnected(): boolean { return this.connected; }
}

export const wsClient = new WSClient();
