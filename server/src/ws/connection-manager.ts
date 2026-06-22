import type { ServerWebSocket } from '../index.js';

/**
 * Manages WebSocket connections per room.
 *
 * Structure: Map<roomPin, Map<sessionToken, WebSocket>>
 */
class ConnectionManager {
  private rooms: Map<string, Map<string, ServerWebSocket>> = new Map();

  /** Register a WebSocket connection for a player in a room. */
  add(pin: string, sessionToken: string, ws: ServerWebSocket): void {
    if (!this.rooms.has(pin)) {
      this.rooms.set(pin, new Map());
    }
    const room = this.rooms.get(pin)!;

    // Close any existing connection for this session token
    const existing = room.get(sessionToken);
    if (existing && existing !== ws) {
      try { existing.close(); } catch { /* ignore */ }
    }

    room.set(sessionToken, ws);
  }

  /** Remove a player's connection from a room. */
  remove(pin: string, sessionToken: string): void {
    const room = this.rooms.get(pin);
    if (room) {
      room.delete(sessionToken);
      if (room.size === 0) {
        this.rooms.delete(pin);
      }
    }
  }

  /** Get a player's WebSocket connection. */
  get(pin: string, sessionToken: string): ServerWebSocket | undefined {
    return this.rooms.get(pin)?.get(sessionToken);
  }

  /** Send a message to a specific player. */
  sendToPlayer(pin: string, sessionToken: string, data: string): boolean {
    const ws = this.get(pin, sessionToken);
    if (!ws) return false;
    try {
      ws.send(data);
      return true;
    } catch {
      this.remove(pin, sessionToken);
      return false;
    }
  }

  /** Broadcast a message to all players in a room. */
  broadcast(pin: string, data: string, excludeSession?: string): void {
    const room = this.rooms.get(pin);
    if (!room) return;

    for (const [token, ws] of room) {
      if (token === excludeSession) continue;
      try {
        ws.send(data);
      } catch {
        room.delete(token);
      }
    }
  }

  /** Send a message to the host's WebSocket. */
  sendToHost(hostWs: ServerWebSocket | null | undefined, data: string): boolean {
    if (!hostWs) return false;
    try {
      hostWs.send(data);
      return true;
    } catch {
      return false;
    }
  }

  /** Get all session tokens in a room. */
  getSessionTokens(pin: string): string[] {
    return Array.from(this.rooms.get(pin)?.keys() ?? []);
  }

  /** Get the number of connected players in a room. */
  getConnectedCount(pin: string): number {
    return this.rooms.get(pin)?.size ?? 0;
  }

  /** Remove all connections for a room (on room destroy). */
  removeRoom(pin: string): void {
    const room = this.rooms.get(pin);
    if (room) {
      for (const ws of room.values()) {
        try { ws.close(); } catch { /* ignore */ }
      }
      this.rooms.delete(pin);
    }
  }
}

export const connectionManager = new ConnectionManager();
