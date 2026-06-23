import type { ScoringMode } from './quiz.types.js';

/**
 * Calculate the score for a single answer.
 *
 * - Fixed mode: always returns maxPoints for a correct answer.
 * - Time-decay mode: score = round((1 - elapsedMs / (2 * totalTimeMs)) * maxPoints)
 *   At 0ms → 100% points; at totalTimeMs (deadline) → 50% points; minimum 0.
 */
export function calculateScore(
  answerTimeMs: number,
  timeLimitMs: number,
  maxPoints: number,
  mode: ScoringMode,
): number {
  if (mode === 'fixed') {
    return maxPoints;
  }

  // Time-decay: linear from 100% at 0ms down to 50% at deadline
  // Formula: score = round((1 - elapsed / (2 * totalTime)) * maxPoints)
  const elapsedRatio = Math.min(answerTimeMs / (2 * timeLimitMs), 1.0);
  const raw = Math.round(maxPoints * (1 - elapsedRatio));
  return Math.max(raw, 0);
}
