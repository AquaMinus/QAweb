// ── Auth ──
export interface HostInfo {
  id: string;
  email: string;
  displayName: string;
}

// ── Question Bank ──
export type ScoringMode = 'fixed' | 'time_decay';
export type OptionColor = 'red' | 'blue' | 'yellow' | 'green';

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

// ── Room / Quiz Game ──
export type RoomPhase =
  | 'lobby'
  | 'countdown'
  | 'question'
  | 'question_result'
  | 'leaderboard'
  | 'podium'
  | 'ended';

export type AdvanceMode = 'manual' | 'auto';

// ── WebSocket Protocol ──
export interface WSMessage {
  type: string;
  payload: unknown;
  ts: number;
  seq?: number;
}

// Player-facing question (no answer info, no text — just colors)
export interface PlayerQuestionPayload {
  questionId: string;
  questionNumber: number;  // 1-based
  totalQuestions: number;
  timeLimitSec: number;
  colors: OptionColor[];   // e.g., ['red', 'blue', 'yellow', 'green']
}

// Host-facing question (full info including text)
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

export interface HostResultPayload {
  correctOptionId: string;
  correctColor: OptionColor;
  distribution: AnswerDistribution;
}

export interface PlayerResultPayload {
  correctOptionId: string;
  myAnswerId: string | null;  // null if timed out
  correct: boolean;
  scoreEarned: number;
  totalScore: number;
  streak: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  previousRank?: number;
}

export interface HostLeaderboardPayload {
  rankings: LeaderboardEntry[];
}

export interface PlayerLeaderboardPayload {
  myRank: number;
  myScore: number;
  top5: LeaderboardEntry[];
  diffToAbove: number | null;  // points needed to overtake next player
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
