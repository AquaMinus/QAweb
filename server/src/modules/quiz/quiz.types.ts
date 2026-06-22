import type { ServerWebSocket } from '../../index.js';
import type {
  RoomPhase, AdvanceMode, ScoringMode,
  OptionColor, CachedQuestion,
} from '../../shared/types.js';

// Re-export shared types for convenience
export type { RoomPhase, AdvanceMode, ScoringMode, OptionColor };

// ── Cached question (loaded from DB at quiz start) ──
export interface CachedOption {
  id: string;
  text: string;
  color: OptionColor;
  isCorrect: boolean;
}

export interface CachedQuestion {
  id: string;
  text: string;
  timeLimitSec: number;
  maxPoints: number;
  scoringMode: ScoringMode;
  imageUrl?: string | null;
  options: CachedOption[];
}

// ── Player answer record ──
export interface PlayerAnswer {
  questionId: string;
  optionId: string;
  answerTimeMs: number;   // Milliseconds since question phase started
  score: number;
  correct: boolean;
}

// ── Player state ──
export interface Player {
  sessionToken: string;
  name: string;
  ws: ServerWebSocket | null;   // null if disconnected
  joinedAt: number;
  answers: Map<string, PlayerAnswer>;  // questionId -> answer
  totalScore: number;
  streak: number;               // Consecutive correct answers
  disconnected: boolean;
  disconnectSince?: number;     // Unix ms when disconnect started
}

// ── Room state (in-memory) ──
export interface Room {
  pin: string;
  hostId: string;
  hostWs: ServerWebSocket | null;
  questionSetId: string;
  questions: CachedQuestion[];
  currentQuestionIndex: number;  // 0-based, -1 if not started
  phase: RoomPhase;
  phaseEnteredAt: number;        // Unix ms
  players: Map<string, Player>;  // sessionToken -> Player
  playerOrder: string[];         // Join order for tie-breaking
  locked: boolean;
  advanceMode: AdvanceMode;
  settings: RoomSettings;
  createdAt: number;
  lastActivityAt: number;
  phaseTimer?: ReturnType<typeof setTimeout>;
  questionTimer?: ReturnType<typeof setTimeout>;
  readingPhase: boolean;     // true during 3s reading time (answers rejected)
  answerPhaseStartedAt: number; // Unix ms when answer countdown began
}

export interface RoomSettings {
  timeLimitSec: number;         // Per-question time limit
  maxPoints: number;            // Max points per question
  scoringMode: ScoringMode;     // 'fixed' | 'time_decay'
  advanceMode: AdvanceMode;     // 'manual' | 'auto'
  autoAdvanceDelayMs: number;   // Delay between phases in auto mode
}
