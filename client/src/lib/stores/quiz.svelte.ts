import type { RoomPhase, PlayerQuestionPayload, PlayerResultPayload, PlayerLeaderboardPayload, PodiumPayload } from '../types';

class QuizStore {
  phase = $state<RoomPhase>('lobby');
  currentQuestion = $state<PlayerQuestionPayload | null>(null);
  myAnswerId = $state<string | null>(null);
  hasAnswered = $state<boolean>(false);
  answerLocked = $state<boolean>(false);
  lastResult = $state<PlayerResultPayload | null>(null);
  leaderboard = $state<PlayerLeaderboardPayload | null>(null);
  podium = $state<PodiumPayload | null>(null);
  timeLeft = $state<number>(0);
  questionTimer = $state<ReturnType<typeof setInterval> | null>(null);

  reset() {
    this.phase = 'lobby';
    this.currentQuestion = null;
    this.myAnswerId = null;
    this.hasAnswered = false;
    this.answerLocked = false;
    this.lastResult = null;
    this.leaderboard = null;
    this.podium = null;
    this.timeLeft = 0;
    if (this.questionTimer) {
      clearInterval(this.questionTimer);
      this.questionTimer = null;
    }
  }

  startQuestionTimer(timeLimitSec: number) {
    this.timeLeft = timeLimitSec;
    if (this.questionTimer) clearInterval(this.questionTimer);
    this.questionTimer = setInterval(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
      } else {
        if (this.questionTimer) {
          clearInterval(this.questionTimer);
          this.questionTimer = null;
        }
      }
    }, 1000);
  }

  stopTimer() {
    if (this.questionTimer) {
      clearInterval(this.questionTimer);
      this.questionTimer = null;
    }
  }
}

export const quiz = new QuizStore();
