import { getSyncedTime } from './clock';

/**
 * Start a high-precision countdown driven by requestAnimationFrame.
 * Calls onTick(remainingSecs, progressPct) each frame.
 *
 * @param endTimeMs   Absolute Unix-ms timestamp when countdown reaches 0
 * @param totalMs     Total duration in ms (for progress percentage)
 * @param onTick      Called each rAF frame with (secs: number, pct: number)
 * @param onExpired   Called once when the countdown reaches 0
 * @returns           Cleanup function
 */
export function startCountdown(
  endTimeMs: number,
  totalMs: number,
  onTick: (secs: number, pct: number) => void,
  onExpired?: () => void,
): () => void {
  let rafId = 0;
  let expired = false;

  function tick() {
    const remaining = Math.max(0, endTimeMs - getSyncedTime());
    const secs = Math.ceil(remaining / 1000);
    const pct = totalMs > 0 ? Math.min(100, Math.max(0, (remaining / totalMs) * 100)) : 0;

    onTick(secs, pct);

    if (remaining <= 0 && !expired) {
      expired = true;
      onExpired?.();
      return;
    }

    if (remaining > 0) {
      rafId = requestAnimationFrame(tick);
    }
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
}
