import type { ScoringMode } from './quiz.types.js';

/**
 * Calculate the base score for a single answer.
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

/**
 * Calculate streak bonus for a given streak count.
 *
 * Streak 1: +0     Streak 2: +100   Streak 3: +200
 * Streak 4: +300   Streak 5: +400   Streak 6+: +500 (cap)
 */
export function getStreakBonus(streak: number, maxPoints: number): number {
  if (streak < 2) return 0;
  const bonusUnit = Math.round(maxPoints * 0.1); // 10% of max per streak level
  return Math.min((streak - 1) * bonusUnit, maxPoints * 0.5); // cap at 50% of max
}
