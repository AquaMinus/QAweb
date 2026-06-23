/**
 * Clock synchronization via WebSocket Ping-Pong.
 * Computes timeOffset so that getSyncedTime() returns the estimated server time.
 */

let timeOffset = 0;
let synced = false;

/** Estimated server time in milliseconds. */
export function getSyncedTime(): number {
  return Date.now() + timeOffset;
}

/** Whether clock sync has completed at least once. */
export function isSynced(): boolean {
  return synced;
}

/**
 * Start a clock sync handshake over an open WebSocket.
 * Returns a promise that resolves with the computed offset.
 */
export function syncClock(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    const t0 = Date.now();

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'sync:pong') {
          ws.removeEventListener('message', handler);
          const t1 = Date.now();
          const serverTime = msg.payload.serverTime as number;

          // One-way delay estimate
          const rtt = t1 - t0;
          const delay = rtt / 2;

          // offset = what to add to local Date.now() to get server time
          // serverTime was recorded at t_server_sent.
          // At t1 (client receive time), server was at approximately serverTime + delay.
          // So at t1, server ≈ serverTime + delay
          // Client at t1 = Date.now() (which is t1)
          // offset = (serverTime + delay) - t1
          timeOffset = (serverTime + delay) - t1;
          synced = true;

          console.log(`[Clock] Synced — RTT=${rtt}ms, delay=${delay.toFixed(1)}ms, offset=${timeOffset.toFixed(1)}ms`);
          resolve(timeOffset);
        }
      } catch { /* ignore non-JSON messages */ }
    };

    ws.addEventListener('message', handler);

    // Send sync ping
    ws.send(JSON.stringify({
      type: 'sync:ping',
      payload: { clientTime: t0 },
      ts: t0,
    }));
  });
}

/**
 * Convert a client-side timestamp (from Date.now()) to estimated server time.
 */
export function toServerTime(clientTime: number): number {
  return clientTime + timeOffset;
}
