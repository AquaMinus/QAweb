import type { ServerWebSocket } from '../../index.js';
import type { WSMessage } from '../../shared/types.js';
import { engine } from './quiz.engine.js';
import { connectionManager } from '../../ws/connection-manager.js';
import { createMessage, stringify } from '../../ws/protocol.js';

/**
 * Route an incoming WebSocket message from a player in a room.
 * The `sessionToken` param is the client's claimed identity.
 * For 'player:join', it's unused (server generates the token).
 * For all other messages, it identifies the player.
 */
export function handleMessage(
  ws: ServerWebSocket,
  msg: WSMessage,
  pin: string,
  sessionToken: string,
): void {
  try {
    switch (msg.type) {
      // ── Player Messages ──

      case 'player:join': {
        const payload = msg.payload as { pin?: string; name?: string };
        const name = payload?.name?.trim();
        const roomPin = payload?.pin || pin;

        if (!name) {
          ws.send(stringify(createMessage('error', { code: 'VALIDATION', message: '昵称不能为空' })));
          return;
        }

        try {
          const { player, sessionToken: newToken } = engine.joinRoom(roomPin, name, ws);
          // Store token on ws so index.ts can retrieve it for subsequent messages
          (ws as any)._qaSessionToken = newToken;
          // Send the session token back so client can store it
          ws.send(stringify(createMessage('room:joined', {
            sessionToken: newToken,
            pin: roomPin,
            name: player.name,
          })));
        } catch (err: any) {
          const code = err.message;
          const messages: Record<string, string> = {
            ROOM_NOT_FOUND: '房间不存在',
            ROOM_LOCKED: '房间已锁定',
            GAME_IN_PROGRESS: '游戏已开始',
            NAME_TAKEN: '昵称已被占用',
          };
          ws.send(stringify(createMessage('error', {
            code,
            message: messages[code] || '加入失败',
          })));
        }
        return;
      }

      case 'player:reconnect': {
        const payload = msg.payload as { pin?: string; session_token?: string };
        const reconnectPin = payload?.pin || pin;
        const reconnectToken = payload?.session_token || sessionToken;

        const player = engine.reconnectPlayer(reconnectPin, reconnectToken, ws);
        if (!player) {
          ws.send(stringify(createMessage('error', {
            code: 'RECONNECT_FAILED',
            message: '无法恢复连接，请重新加入',
          })));
        }
        // Note: Don't close WS — let client decide whether to re-join
        return;
      }

      case 'player:answer': {
        const payload = msg.payload as { questionId?: string; optionId?: string };
        if (payload?.optionId) {
          engine.submitAnswer(pin, sessionToken, payload.optionId);
        }
        return;
      }

      // ── Host Messages ──

      case 'host:start': {
        const payload = msg.payload as { advanceMode?: 'manual' | 'auto' };
        engine.startQuiz(pin, sessionToken, payload?.advanceMode);
        return;
      }

      case 'host:next': {
        const p = msg.payload as { skipLeaderboard?: boolean };
        engine.advancePhase(pin, sessionToken, !!p?.skipLeaderboard);
        return;
      }

      case 'host:end': {
        engine.endQuiz(pin, sessionToken);
        return;
      }

      case 'host:kick': {
        const payload = msg.payload as { playerSessionToken?: string };
        if (payload?.playerSessionToken) {
          engine.kickPlayer(pin, sessionToken, payload.playerSessionToken);
        }
        return;
      }

      case 'host:lock': {
        const payload = msg.payload as { locked?: boolean };
        engine.lockRoom(pin, sessionToken, !!payload?.locked);
        return;
      }

      default:
        // Unknown message type — ignore
        console.log(`[quiz.ws] Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    console.error(`[quiz.ws] Error handling ${msg.type}:`, err.message);
    try {
      ws.send(stringify(createMessage('error', { code: 'INTERNAL', message: 'Server error' })));
    } catch { /* */ }
  }
}

export function handleDisconnect(pin: string, sessionToken: string): void {
  engine.handleDisconnect(pin, sessionToken);
}
