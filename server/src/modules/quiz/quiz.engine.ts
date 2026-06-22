// Core game engine — to be implemented in Phase 3
// See plan at .claude/plans/cheeky-brewing-torvalds.md
//
// This is the heart of the system. The engine maintains an in-memory Map of
// Room objects and drives the quiz state machine:
//
//   lobby → countdown → question → question_result → leaderboard → (loop) → podium → ended
//
// Key methods:
// - createRoom, getRoom, destroyRoom
// - joinRoom, reconnectPlayer, handleDisconnect, removePlayer
// - kickPlayer, lockRoom
// - startQuiz, advancePhase, endQuiz
// - submitAnswer
// - Internal: transitionTo, showQuestion, revealResult, showLeaderboard, showPodium
