import type { ScoringMode } from './quiz.types.js';

/**
 * Calculate the score for a single answer using the chosen scoring mode.
 *
 * - Fixed mode: always returns maxPoints for a correct answer.
 * - Time-decay mode: score decreases linearly from maxPoints to 25% of maxPoints
 *   based on how long the player took to answer.
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

  // Time-decay: linear from maxPoints down to floor (25% of max)
  const elapsedRatio = Math.min(answerTimeMs / timeLimitMs, 1.0);
  const raw = Math.round(maxPoints * (1 - elapsedRatio));
  const floor = Math.floor(maxPoints * 0.25);
  return Math.max(raw, floor);
}
