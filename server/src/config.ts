const config = {
  port: parseInt(process.env.PORT || '3000'),
  jwtSecret: process.env.JWT_SECRET || 'qaweb-dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  dbPath: process.env.DB_PATH || './data/qaweb.db',

  // Room settings
  roomPinLength: 6,
  roomMaxInactiveHours: 2,    // Auto-destroy rooms inactive for 2 hours
  roomMaxLifetimeHours: 12,   // Max room lifetime
  roomCleanupIntervalMs: 30 * 60 * 1000, // Cleanup every 30 minutes

  // Player settings
  playerDisconnectGraceMs: 30 * 1000, // 30s grace before removing disconnected player
  playerHeartbeatIntervalMs: 15 * 1000,

  // Quiz defaults
  defaultTimeLimitSec: 20,
  defaultMaxPoints: 1000,
  defaultAutoAdvanceMs: 5000,
} as const;

export default config;
