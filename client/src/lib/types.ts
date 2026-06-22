// ── Synced from server/src/shared/types.ts ──

export type ScoringMode = 'fixed' | 'time_decay';
export type OptionColor = 'red' | 'blue' | 'yellow' | 'green';
export type RoomPhase = 'lobby' | 'countdown' | 'question' | 'question_result' | 'leaderboard' | 'podium' | 'ended';
export type AdvanceMode = 'manual' | 'auto';

// ── Auth ──
export interface HostInfo {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  host: HostInfo;
  token: string;
}

// ── Question bank ──
export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  color: OptionColor;
  orderIndex: number;
}

export interface QuestionData {
  id: string;
  questionSetId: string;
  text: string;
  timeLimitSec: number;
  maxPoints: number;
  scoringMode: ScoringMode;
  orderIndex: number;
  imageUrl?: string | null;
  options: QuestionOption[];
}

export interface QuestionSetData {
  id: string;
  hostId: string;
  title: string;
  description: string;
  coverImageUrl?: string | null;
  createdAt: number;
  updatedAt: number;
  questionCount?: number;
}

// ── WebSocket protocol ──
export interface WSMessage {
  type: string;
  payload: any;
  ts: number;
  seq?: number;
}

// ── Game payloads ──
export interface PlayerQuestionPayload {
  questionId: string;
  questionNumber: number;
  totalQuestions: number;
  timeLimitSec: number;
  colors: OptionColor[];
}

export interface HostQuestionPayload {
  questionId: string;
  text: string;
  imageUrl?: string | null;
  options: { id: string; text: string; color: OptionColor }[];
  timeLimitSec: number;
  questionNumber: number;
  totalQuestions: number;
}

export interface AnswerDistribution {
  red: number;
  blue: number;
  yellow: number;
  green: number;
  total: number;
}

export interface PlayerResultPayload {
  correctOptionId: string;
  myAnswerId: string | null;
  correct: boolean;
  scoreEarned: number;
  totalScore: number;
  streak: number;
}

export interface HostResultPayload {
  correctOptionId: string;
  correctColor: OptionColor;
  distribution: AnswerDistribution;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  previousRank?: number;
}

export interface PlayerLeaderboardPayload {
  myRank: number;
  myScore: number;
  top5: LeaderboardEntry[];
  diffToAbove: number | null;
}

export interface PodiumPayload {
  first: { name: string; score: number };
  second: { name: string; score: number };
  third: { name: string; score: number };
}

export interface RoomStatePayload {
  pin: string;
  phase: RoomPhase;
  playerCount: number;
  playerNames: string[];
  locked: boolean;
  questionNumber: number;
  totalQuestions: number;
}
