import { connectionManager } from '../../ws/connection-manager.js';
import { createMessage, stringify } from '../../ws/protocol.js';
import type { ServerWebSocket } from '../../index.js';
import type { Room } from './quiz.types.js';

/** Send a message to the room host. */
export function sendToHost(room: Room, type: string, payload: unknown): void {
  const msg = createMessage(type, payload, room.currentQuestionIndex);
  connectionManager.sendToHost(room.hostWs, stringify(msg));
}

/** Send a message to a specific player. */
export function sendToPlayer(room: Room, sessionToken: string, type: string, payload: unknown): void {
  const msg = createMessage(type, payload, room.currentQuestionIndex);
  connectionManager.sendToPlayer(room.pin, sessionToken, stringify(msg));
}

/** Send a message to all players in the room (optionally excluding one). */
export function broadcastToPlayers(room: Room, type: string, payload: unknown, excludeSession?: string): void {
  const msg = createMessage(type, payload, room.currentQuestionIndex);
  connectionManager.broadcast(room.pin, stringify(msg), excludeSession);
}

/** Send a message to ALL in room (host + players). */
export function broadcastToRoom(room: Room, type: string, payload: unknown): void {
  const msg = createMessage(type, payload, room.currentQuestionIndex);
  const data = stringify(msg);
  connectionManager.sendToHost(room.hostWs, data);
  connectionManager.broadcast(room.pin, data);
}
