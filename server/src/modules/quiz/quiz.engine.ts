import { v4 as uuidv4 } from 'uuid';
import type { ServerWebSocket } from '../../index.js';
import type {
  Room, Player, PlayerAnswer, CachedQuestion, RoomSettings,
  LeaderboardEntry, AnswerDistribution, OptionColor,
} from './quiz.types.js';
import { calculateScore, getStreakBonus } from './quiz.scoring.js';
import {
  sendToHost, sendToPlayer, broadcastToPlayers, broadcastToRoom,
} from './quiz.broadcast.js';
import { connectionManager } from '../../ws/connection-manager.js';
import { saveGameRoom } from '../rooms/rooms.persistence.js';
import config from '../../config.js';

// ═══════════════════════════════════════════════════════
//  Quiz Engine — Singleton managing all active rooms
// ═══════════════════════════════════════════════════════

class QuizEngine {
  private rooms = new Map<string, Room>();
  private hostRooms = new Map<string, Set<string>>(); // hostId -> Set<pin>
  private cleanupTimer: ReturnType<typeof setInterval>;

  /** Get all active room PINs for a host. */
  getHostRooms(hostId: string): string[] {
    return Array.from(this.hostRooms.get(hostId) ?? []);
  }

  constructor() {
    // Periodic cleanup of abandoned rooms
    this.cleanupTimer = setInterval(() => this.cleanupStaleRooms(), config.roomCleanupIntervalMs);
  }

  // ── Room Lifecycle ──

  createRoom(
    hostId: string,
    hostWs: ServerWebSocket | null,
    questionSetId: string,
    questionSetTitle: string,
    questions: CachedQuestion[],
    settings: Partial<RoomSettings> = {},
  ): Room {
    const pin = this.generatePin();
    const now = Date.now();

    const room: Room = {
      pin,
      hostId,
      hostWs,
      questionSetId,
      questionSetTitle,
      questions,
      currentQuestionIndex: -1,
      phase: 'lobby',
      phaseEnteredAt: now,
      players: new Map(),
      playerOrder: [],
      locked: false,
      gameStartedAt: 0,
      advanceMode: settings.advanceMode || 'manual',
      settings: {
        timeLimitSec: settings.timeLimitSec || config.defaultTimeLimitSec,
        maxPoints: settings.maxPoints || config.defaultMaxPoints,
        scoringMode: settings.scoringMode || 'fixed',
        advanceMode: settings.advanceMode || 'manual',
        autoAdvanceDelayMs: settings.autoAdvanceDelayMs || config.defaultAutoAdvanceMs,
        showQuestionText: settings.showQuestionText || false,
        streakBonus: settings.streakBonus || false,
      },
      createdAt: now,
      lastActivityAt: now,
      readingPhase: true,
      answerPhaseStartedAt: now,
    };

    this.rooms.set(pin, room);
    // Track host's rooms
    if (!this.hostRooms.has(hostId)) this.hostRooms.set(hostId, new Set());
    this.hostRooms.get(hostId)!.add(pin);
    return room;
  }

  getRoom(pin: string): Room | undefined {
    return this.rooms.get(pin);
  }

  destroyRoom(pin: string): void {
    const room = this.rooms.get(pin);
    if (!room) return;

    // Notify all players
    broadcastToRoom(room, 'quiz:ended', { reason: 'room_closed' });

    // Clear timers
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    if (room.questionTimer) clearTimeout(room.questionTimer);

    // Close all connections for this room
    connectionManager.removeRoom(pin);
    // Remove from host tracking
    const hostSet = this.hostRooms.get(room.hostId);
    if (hostSet) { hostSet.delete(pin); if (hostSet.size === 0) this.hostRooms.delete(room.hostId); }
    this.rooms.delete(pin);
    console.log(`[Engine] Room ${pin} destroyed`);
  }

  // ── Player Lifecycle ──

  joinRoom(pin: string, name: string, ws: ServerWebSocket): { player: Player; sessionToken: string } {
    const room = this.rooms.get(pin);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.locked) throw new Error('ROOM_LOCKED');
    if (room.phase !== 'lobby') throw new Error('GAME_IN_PROGRESS');

    // Check duplicate name
    for (const p of room.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase()) throw new Error('NAME_TAKEN');
    }

    const sessionToken = uuidv4();
    const player: Player = {
      sessionToken,
      name,
      ws,
      joinedAt: Date.now(),
      answers: new Map(),
      totalScore: 0,
      streak: 0,
      disconnected: false,
      clockOffset: 0,
      clockLatency: 0,
    };

    room.players.set(sessionToken, player);
    room.playerOrder.push(sessionToken);
    room.lastActivityAt = Date.now();

    // Register WS connection
    connectionManager.add(pin, sessionToken, ws);

    // Notify host
    sendToHost(room, 'room:player_joined', {
      name: player.name,
      playerCount: this.getConnectedPlayerCount(room),
      totalPlayers: room.players.size,
    });

    return { player, sessionToken };
  }

  reconnectPlayer(pin: string, sessionToken: string, ws: ServerWebSocket): Player | null {
    const room = this.rooms.get(pin);
    if (!room) return null;

    const player = room.players.get(sessionToken);
    if (!player) return null;
    if (room.phase === 'ended') return null;

    // Restore connection
    player.ws = ws;
    player.disconnected = false;
    player.disconnectSince = undefined;
    connectionManager.add(pin, sessionToken, ws);
    room.lastActivityAt = Date.now();

    // Send current state snapshot
    this.sendStateSnapshot(room, player);

    return player;
  }

  handleDisconnect(pin: string, sessionToken: string): void {
    const room = this.rooms.get(pin);
    if (!room) return;

    const player = room.players.get(sessionToken);
    if (!player) return;

    player.ws = null;
    player.disconnected = true;
    player.disconnectSince = Date.now();
    connectionManager.remove(pin, sessionToken);

    // Notify host
    const connectedCount = this.getConnectedPlayerCount(room);
    sendToHost(room, 'room:player_left', {
      name: player.name,
      playerCount: connectedCount,
      totalPlayers: room.players.size,
    });

    // In question phase: check if all remaining players answered
    if (room.phase === 'question') {
      this.checkAllAnswered(room);
    }
  }

  removePlayer(pin: string, sessionToken: string): void {
    const room = this.rooms.get(pin);
    if (!room) return;

    const player = room.players.get(sessionToken);
    if (!player) return;

    // Close WS if still connected
    if (player.ws) {
      try { player.ws.close(); } catch { /* ignore */ }
    }
    connectionManager.remove(pin, sessionToken);
    room.players.delete(sessionToken);
    room.playerOrder = room.playerOrder.filter(id => id !== sessionToken);
  }

  // ── Host Controls ──

  kickPlayer(pin: string, hostId: string, targetToken: string): void {
    const room = this.rooms.get(pin);
    if (!room || room.hostId !== hostId) return;

    sendToPlayer(room, targetToken, 'player:kicked', {});
    this.removePlayer(pin, targetToken);

    sendToHost(room, 'room:player_left', {
      playerCount: this.getConnectedPlayerCount(room),
      totalPlayers: room.players.size,
    });
  }

  lockRoom(pin: string, hostId: string, locked: boolean): void {
    const room = this.rooms.get(pin);
    if (!room || room.hostId !== hostId) return;
    room.locked = locked;
    broadcastToPlayers(room, 'room:locked', { locked });
  }

  startQuiz(pin: string, hostId: string, advanceMode?: 'manual' | 'auto'): void {
    const room = this.rooms.get(pin);
    if (!room || room.hostId !== hostId) return;
    if (room.questions.length === 0) {
      sendToHost(room, 'error', { message: '题库为空' });
      return;
    }

    if (advanceMode) {
      room.advanceMode = advanceMode;
      room.settings.advanceMode = advanceMode;
    }

    room.gameStartedAt = Date.now();
    this.transitionTo(room, 'countdown');
  }

  advancePhase(pin: string, hostId: string, skipLeaderboard = false): void {
    const room = this.rooms.get(pin);
    if (!room || room.hostId !== hostId) return;

    // Clear auto-advance timer
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    if (room.questionTimer) clearTimeout(room.questionTimer);
    room.phaseTimer = undefined;
    room.questionTimer = undefined;

    if (room.phase === 'question') {
      this.revealResult(room);
    } else if (room.phase === 'question_result') {
      if (skipLeaderboard) {
        this.goToNextOrPodium(room);
      } else {
        this.showLeaderboard(room);
      }
    } else if (room.phase === 'leaderboard') {
      this.goToNextOrPodium(room);
    }
  }

  // Move to next question or podium
  private goToNextOrPodium(room: Room): void {
    const isLast = room.currentQuestionIndex >= room.questions.length - 1;
    if (isLast) {
      this.showPodium(room);
    } else {
      room.currentQuestionIndex++;
      this.showQuestion(room);
    }
  }

  endQuiz(pin: string, hostId: string): void {
    const room = this.rooms.get(pin);
    if (!room || room.hostId !== hostId) return;
    this.transitionTo(room, 'ended');
  }

  // ── Player Actions ──

  submitAnswer(pin: string, sessionToken: string, optionId: string, clientTime?: number): void {
    const room = this.rooms.get(pin);
    if (!room) return;
    if (room.phase !== 'question') return;
    if (room.readingPhase) return;  // Still in 3s reading time

    const player = room.players.get(sessionToken);
    if (!player) return;
    if (player.disconnected) return;

    const question = room.questions[room.currentQuestionIndex];
    if (!question) return;

    // Prevent duplicate answers
    if (player.answers.has(question.id)) return;

    // ── Clock-synced answer time validation ──
    const answerOpensAt = room.answerPhaseStartedAt;
    const answerClosesAt = answerOpensAt + room.settings.timeLimitSec * 1000;
    let answerTimeMs: number;

    if (clientTime !== undefined && player.clockOffset !== undefined) {
      // Convert client time to server time using the stored offset
      const serverTime = clientTime - player.clockOffset;
      const now = Date.now();

      // Sanity check: serverTime must be within [not-too-far-past, now+latency]
      if (serverTime > now + player.clockLatency + 500) {
        console.log(`[Engine] Rejected: player=${player.name} serverTime=${serverTime} too far in future (now=${now})`);
        return; // Impossibly ahead — clock manipulation or bug
      }
      if (serverTime < answerOpensAt - 2000) {
        console.log(`[Engine] Rejected: player=${player.name} serverTime=${serverTime} before answer window opened at ${answerOpensAt}`);
        return; // Answer before window opened
      }

      // Compute elapsed from the answer window start
      answerTimeMs = Math.max(0, serverTime - answerOpensAt);
    } else {
      // Fallback: use server-side receive time (less accurate but always works)
      answerTimeMs = Date.now() - answerOpensAt;
    }

    // Validate answer is within the time window
    if (answerTimeMs > room.settings.timeLimitSec * 1000 + 500) {
      console.log(`[Engine] Answer too late: ${answerTimeMs}ms (limit=${room.settings.timeLimitSec * 1000}ms)`);
      return; // Too late — reject
    }

    const option = question.options.find(o => o.id === optionId);
    const correct = option?.isCorrect ?? false;
    const timeLimitMs = room.settings.timeLimitSec * 1000;
    const maxPoints = room.settings.maxPoints;
    const baseScore = correct ? calculateScore(answerTimeMs, timeLimitMs, maxPoints, room.settings.scoringMode) : 0;

    // Streak tracking
    if (correct) {
      player.streak++;
    } else {
      player.streak = 0;
    }

    // Streak bonus (only if enabled and answer is correct)
    const streakBonus = (correct && room.settings.streakBonus) ? getStreakBonus(player.streak, maxPoints) : 0;
    const totalPoints = baseScore + streakBonus;

    console.log(`[Engine] Answer: player=${player.name}, correct=${correct}, elapsed=${answerTimeMs}ms, base=${baseScore}, streak=${player.streak}, bonus=${streakBonus}, total=${totalPoints}`);

    player.totalScore += totalPoints;
    player.answers.set(question.id, {
      questionId: question.id,
      optionId,
      answerTimeMs,
      score: totalPoints,
      correct,
    });

    // Confirm to player
    sendToPlayer(room, sessionToken, 'quiz:answer_accepted', { questionId: question.id });

    // Check if all players answered
    this.checkAllAnswered(room);
  }

  // ── Internal: Phase Transitions ──

  private transitionTo(room: Room, phase: typeof room.phase): void {
    room.phase = phase;
    room.phaseEnteredAt = Date.now();
    room.lastActivityAt = Date.now();

    switch (phase) {
      case 'countdown':
        this.startCountdown(room);
        break;
      case 'question':
        // Handled by showQuestion
        break;
      case 'question_result':
        // Handled by revealResult
        break;
      case 'leaderboard':
        // Handled by showLeaderboard
        break;
      case 'podium':
        // Handled by showPodium
        break;
      case 'ended':
        broadcastToRoom(room, 'quiz:ended', {});
        // Persist game results to database
        try {
          saveGameRoom(room);
        } catch (err) {
          console.error('[Engine] Failed to persist game results:', err);
        }
        // Schedule room cleanup after 5 minutes
        setTimeout(() => this.destroyRoom(room.pin), 5 * 60 * 1000);
        break;
    }
  }

  private startCountdown(room: Room): void {
    const COUNTDOWN_SECONDS = 3;
    broadcastToRoom(room, 'quiz:countdown', { seconds: COUNTDOWN_SECONDS });

    room.phaseTimer = setTimeout(() => {
      room.currentQuestionIndex = 0;
      this.showQuestion(room);
    }, COUNTDOWN_SECONDS * 1000);
  }

  private showQuestion(room: Room): void {
    const question = room.questions[room.currentQuestionIndex];
    if (!question) return;

    const READING_SEC = 3;
    const READING_MS = READING_SEC * 1000;
    const answerTime = room.settings.timeLimitSec;
    const answerTimeMs = answerTime * 1000;
    const now = Date.now();

    // ── Absolute timestamps (single source of truth) ──
    const readingEndsAt = now + READING_MS;        // When players can start answering
    const answerEndsAt = readingEndsAt + answerTimeMs; // When answer window closes

    room.phase = 'question';
    room.phaseEnteredAt = now;
    room.readingPhase = true;

    // Build current leaderboard (scores before this question)
    const rankings = this.buildLeaderboard(room);

    // ── Send to HOST: question data + absolute reading end time ──
    sendToHost(room, 'quiz:question', {
      questionId: question.id,
      text: question.text,
      imageUrl: question.imageUrl,
      options: question.options.map(o => ({
        id: o.id,
        text: o.text,
        color: o.color,
      })),
      readingEndsAt,                              // Absolute: when reading phase ends
      answerEndsAt,                               // Absolute: when answer window closes
      readingSec: READING_SEC,                    // Informational only
      answerTimeSec: answerTime,                  // Informational only
      questionNumber: room.currentQuestionIndex + 1,
      totalQuestions: room.questions.length,
      rankings,
    });

    // ── Send to PLAYERS ──
    const optionMap: Record<string, string> = {};
    const optionTexts: Record<string, string> = {};
    for (const o of question.options) {
      optionMap[o.color] = o.id;
      optionTexts[o.color] = o.text;
    }
    const playerPayload: any = {
      questionId: question.id,
      questionNumber: room.currentQuestionIndex + 1,
      totalQuestions: room.questions.length,
      colors: question.options.map(o => o.color),
      colorOptionIds: optionMap,
      readingEndsAt,
      answerEndsAt,
      readingSec: READING_SEC,
      answerTimeSec: answerTime,
    };
    if (room.settings.showQuestionText) {
      playerPayload.questionText = question.text;
      playerPayload.optionTexts = optionTexts;
    }
    broadcastToPlayers(room, 'quiz:question_player', playerPayload);

    // ── Reading phase timer (server-side only for phase control) ──
    room.questionTimer = setTimeout(() => {
      room.readingPhase = false;
      room.answerPhaseStartedAt = Date.now();

      // Tell EVERYONE (host + players) that answer phase has started
      broadcastToRoom(room, 'quiz:answer_phase', {
        answerEndsAt,
        answerTimeSec: answerTime,
      });

      // Auto-reveal after answer time
      room.questionTimer = setTimeout(() => {
        this.revealResult(room);
      }, answerTimeMs);
    }, READING_MS);
  }

  private revealResult(room: Room): void {
    if (room.questionTimer) {
      clearTimeout(room.questionTimer);
      room.questionTimer = undefined;
    }

    room.phase = 'question_result';
    room.phaseEnteredAt = Date.now();

    const question = room.questions[room.currentQuestionIndex];
    if (!question) return;

    const correctOption = question.options.find(o => o.isCorrect)!;

    // Build answer distribution
    const distribution: AnswerDistribution = {
      red: 0, blue: 0, yellow: 0, green: 0, total: 0,
    };

    for (const [, player] of room.players) {
      const answer = player.answers.get(question.id);
      if (answer) {
        const opt = question.options.find(o => o.id === answer.optionId);
        if (opt && distribution[opt.color] !== undefined) {
          (distribution as any)[opt.color]++;
          distribution.total++;
        }
      }
    }

    // Build updated rankings (scores after this question)
    const resultRankings = this.buildLeaderboard(room);

    // Send to host
    sendToHost(room, 'quiz:result', {
      correctOptionId: correctOption.id,
      correctColor: correctOption.color,
      distribution,
      rankings: resultRankings,
    });

    // Send to each player
    for (const [, player] of room.players) {
      if (player.disconnected) continue;
      const answer = player.answers.get(question.id);
      const streakBonusEarned = (answer?.correct && room.settings.streakBonus)
        ? getStreakBonus(player.streak, room.settings.maxPoints) : 0;
      sendToPlayer(room, player.sessionToken, 'quiz:result_player', {
        correctOptionId: correctOption.id,
        myAnswerId: answer?.optionId || null,
        correct: answer?.correct ?? false,
        scoreEarned: answer?.score ?? 0,
        streakBonus: streakBonusEarned,
        totalScore: player.totalScore,
        streak: player.streak,
      });
    }

    // Auto-advance: skip separate leaderboard, go directly to next question or podium
    if (room.advanceMode === 'auto') {
      const delay = room.settings.autoAdvanceDelayMs;
      const isLast = room.currentQuestionIndex >= room.questions.length - 1;

      broadcastToRoom(room, 'quiz:next_countdown', {
        seconds: Math.floor(delay / 1000),
        isLast,
      });

      room.phaseTimer = setTimeout(() => {
        this.goToNextOrPodium(room);
      }, delay);
    }
  }

  private showLeaderboard(room: Room): void {
    room.phase = 'leaderboard';
    room.phaseEnteredAt = Date.now();

    const rankings = this.buildLeaderboard(room);

    // Send full rankings to host
    sendToHost(room, 'quiz:leaderboard', { rankings });

    // Send personal ranking to each player
    for (const [, player] of room.players) {
      if (player.disconnected) continue;
      const myRank = rankings.findIndex(r => r.name === player.name) + 1;
      const top5 = rankings.slice(0, 5);
      const diffToAbove = myRank > 1 ? (rankings[myRank - 2]?.score ?? 0) - player.totalScore : null;

      sendToPlayer(room, player.sessionToken, 'quiz:leaderboard', {
        myRank,
        myScore: player.totalScore,
        top5,
        diffToAbove,
      });
    }

    // Auto-advance or wait
    if (room.advanceMode === 'auto') {
      const isLastQuestion = room.currentQuestionIndex >= room.questions.length - 1;
      room.phaseTimer = setTimeout(() => {
        if (isLastQuestion) {
          this.showPodium(room);
        } else {
          room.currentQuestionIndex++;
          this.showQuestion(room);
        }
      }, room.settings.autoAdvanceDelayMs);
    } else {
      // In manual mode, host must click next; if last question, go to podium
      // (Host's "next" click will handle this in advancePhase)
    }
  }

  private showPodium(room: Room): void {
    room.phase = 'podium';
    room.phaseEnteredAt = Date.now();

    const rankings = this.buildLeaderboard(room);
    const top3 = rankings.slice(0, 3);

    const podium = {
      first: top3[0] ? { name: top3[0].name, score: top3[0].score } : { name: '—', score: 0 },
      second: top3[1] ? { name: top3[1].name, score: top3[1].score } : { name: '—', score: 0 },
      third: top3[2] ? { name: top3[2].name, score: top3[2].score } : { name: '—', score: 0 },
    };

    broadcastToRoom(room, 'quiz:podium', podium);

    // Auto-end after podium
    if (room.advanceMode === 'auto') {
      room.phaseTimer = setTimeout(() => this.transitionTo(room, 'ended'), 15000);
    }
  }

  // ── Helpers ──

  private buildLeaderboard(room: Room): LeaderboardEntry[] {
    const players = Array.from(room.players.values());
    players.sort((a, b) => b.totalScore - a.totalScore);
    return players.map((p, i) => ({
      rank: i + 1,
      name: p.name,
      score: p.totalScore,
    }));
  }

  private checkAllAnswered(room: Room): void {
    let allAnswered = true;
    let connectedCount = 0;
    let answeredCount = 0;
    for (const [, player] of room.players) {
      if (player.disconnected) continue;
      connectedCount++;
      const question = room.questions[room.currentQuestionIndex];
      if (question && player.answers.has(question.id)) {
        answeredCount++;
      } else {
        allAnswered = false;
      }
    }
    console.log(`[Engine] checkAllAnswered: connected=${connectedCount}, answered=${answeredCount}, allAnswered=${allAnswered}`);
    if (allAnswered && connectedCount > 0) {
      console.log(`[Engine] All players answered — auto-revealing result`);
      if (room.questionTimer) clearTimeout(room.questionTimer);
      this.revealResult(room);
    }
  }

  private sendStateSnapshot(room: Room, player: Player): void {
    const state: any = {
      pin: room.pin,
      phase: room.phase,
      playerCount: room.players.size,
      playerNames: Array.from(room.players.values()).map(p => p.name),
      locked: room.locked,
      questionNumber: room.currentQuestionIndex + 1,
      totalQuestions: room.questions.length,
    };

    // If in question phase, send current question
    if (room.phase === 'question') {
      const q = room.questions[room.currentQuestionIndex];
      state.currentQuestion = {
        questionId: q?.id,
        questionNumber: room.currentQuestionIndex + 1,
        totalQuestions: room.questions.length,
        timeLimitSec: q?.timeLimitSec,
        colors: q?.options.map(o => o.color),
        // Calculate remaining time
        timeLeft: Math.max(0, Math.floor((q?.timeLimitSec ?? 0) - (Date.now() - room.phaseEnteredAt) / 1000)),
      };

      // Check if player already answered
      if (q && player.answers.has(q.id)) {
        state.hasAnswered = true;
      }
    }

    // Send player's total score
    state.myScore = player.totalScore;

    sendToPlayer(room, player.sessionToken, 'room:state', state);
  }

  private getConnectedPlayerCount(room: Room): number {
    let count = 0;
    for (const [, p] of room.players) {
      if (p.ws) count++;
    }
    return count;
  }

  private generatePin(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      if (!this.rooms.has(pin)) return pin;
    }
    throw new Error('Cannot generate unique PIN');
  }

  private cleanupStaleRooms(): void {
    const now = Date.now();
    const maxInactive = config.roomMaxInactiveHours * 60 * 60 * 1000;
    const maxLifetime = config.roomMaxLifetimeHours * 60 * 60 * 1000;

    for (const [pin, room] of this.rooms) {
      if (
        (now - room.lastActivityAt > maxInactive) ||
        (now - room.createdAt > maxLifetime)
      ) {
        console.log(`[Engine] Cleaning up stale room ${pin}`);
        this.destroyRoom(pin);
      }
    }
  }
}

// Singleton
export const engine = new QuizEngine();
