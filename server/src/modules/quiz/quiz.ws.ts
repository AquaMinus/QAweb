import type { ServerWebSocket } from '../../index.js';
import type { WSMessage } from '../../shared/types.js';

/**
 * Main WebSocket message router for quiz game actions.
 *
 * Routes incoming player/host messages to the QuizEngine.
 * To be wired up in index.ts after quiz.engine.ts is implemented.
 */

export function handleMessage(
  ws: ServerWebSocket,
  msg: WSMessage,
  pin: string,
  sessionToken: string,
): void {
  // TODO: Implement in Phase 3
  // This will delegate to QuizEngine methods:
  //
  // switch (msg.type) {
  //   case 'player:join':
  //     engine.joinRoom(pin, msg.payload.name, ws);
  //     break;
  //   case 'player:reconnect':
  //     engine.reconnectPlayer(pin, sessionToken, ws);
  //     break;
  //   case 'player:answer':
  //     engine.submitAnswer(pin, sessionToken, msg.payload.questionId, msg.payload.optionId);
  //     break;
  //   case 'host:start':
  //     engine.startQuiz(pin, sessionToken, msg.payload.advanceMode);
  //     break;
  //   case 'host:next':
  //     engine.advancePhase(pin, sessionToken);
  //     break;
  //   case 'host:end':
  //     engine.endQuiz(pin, sessionToken);
  //     break;
  //   case 'host:kick':
  //     engine.kickPlayer(pin, sessionToken, msg.payload.playerSessionToken);
  //     break;
  //   case 'host:lock':
  //     engine.lockRoom(pin, sessionToken, msg.payload.locked);
  //     break;
  // }

  console.log(`[quiz.ws] Unhandled message: ${msg.type} from ${sessionToken.slice(0, 8)}...`);
}

export function handleDisconnect(pin: string, sessionToken: string): void {
  // TODO: Implement in Phase 3
  // engine.handleDisconnect(pin, sessionToken);
  console.log(`[quiz.ws] Disconnect: pin=${pin}, token=${sessionToken.slice(0, 8)}...`);
}
