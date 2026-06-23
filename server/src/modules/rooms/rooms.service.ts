import { engine } from '../quiz/quiz.engine.js';
import type { CachedQuestion, RoomSettings } from '../quiz/quiz.types.js';
import * as questionSvc from '../questions/questions.service.js';

export interface RoomInfo {
  pin: string;
  phase: string;
  playerCount: number;
  playerNames: string[];
  locked: boolean;
  questionCount: number;
  settings: RoomSettings;
  createdAt: number;
}

/** Create a new room from a question set ID. */
export function createRoom(
  hostId: string,
  questionSetId: string,
  settings: Partial<RoomSettings> = {},
): RoomInfo {
  // Load questions from DB and cache in memory
  const questions = questionSvc.getQuestions(questionSetId);
  if (questions.length === 0) {
    throw new Error('EMPTY_QUESTION_SET');
  }

  const cachedQuestions: CachedQuestion[] = questions.map(q => ({
    id: q.id,
    text: q.text,
    timeLimitSec: q.timeLimitSec,
    maxPoints: q.maxPoints,
    scoringMode: q.scoringMode,
    imageUrl: q.imageUrl,
    options: q.options.map(o => ({
      id: o.id,
      text: o.text,
      color: o.color,
      isCorrect: o.isCorrect,
    })),
  }));

  const setInfo = questionSvc.getSetById(questionSetId);
  const title = setInfo?.title || '';
  const room = engine.createRoom(hostId, null, questionSetId, title, cachedQuestions, settings);
  return roomToInfo(room);
}

/** Get room info (for host or player check). */
export function getRoomInfo(pin: string): RoomInfo | null {
  const room = engine.getRoom(pin);
  if (!room) return null;
  return roomToInfo(room);
}

/** Dissolve a room. */
export function dissolveRoom(pin: string, hostId: string): boolean {
  const room = engine.getRoom(pin);
  if (!room || room.hostId !== hostId) return false;
  engine.destroyRoom(pin);
  return true;
}

function roomToInfo(room: ReturnType<typeof engine.getRoom>): RoomInfo {
  if (!room) throw new Error('Room not found');
  return {
    pin: room.pin,
    phase: room.phase,
    playerCount: room.players.size,
    playerNames: Array.from(room.players.values()).map(p => p.name),
    locked: room.locked,
    questionCount: room.questions.length,
    settings: room.settings,
    createdAt: room.createdAt,
  };
}
