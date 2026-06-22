<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { player } from '$lib/stores/player.svelte';
  import { quiz } from '$lib/stores/quiz.svelte';
  import { connect, disconnect, send, on } from '$lib/ws';
  import type { PlayerQuestionPayload } from '$lib/types';

  let pin = $derived($page.params.pin);
  let cleanupFns: (() => void)[] = [];

  onMount(() => {
    if (!player.isInRoom) {
      // Player must have come through the join page
      return;
    }

    connect(pin);

    // Register WS handlers
    cleanupFns.push(on('room:state', (msg) => {
      quiz.phase = msg.payload.phase;
    }));

    cleanupFns.push(on('quiz:question_player', (msg) => {
      const payload = msg.payload as PlayerQuestionPayload;
      quiz.phase = 'question';
      quiz.currentQuestion = payload;
      quiz.hasAnswered = false;
      quiz.answerLocked = false;
      quiz.myAnswerId = null;
      quiz.startQuestionTimer(payload.timeLimitSec);
    }));

    cleanupFns.push(on('quiz:answer_accepted', () => {
      quiz.answerLocked = true;
    }));

    cleanupFns.push(on('quiz:result_player', (msg) => {
      quiz.phase = 'question_result';
      quiz.lastResult = msg.payload;
      quiz.stopTimer();
    }));

    cleanupFns.push(on('quiz:leaderboard', (msg) => {
      quiz.phase = 'leaderboard';
      quiz.leaderboard = msg.payload;
    }));

    cleanupFns.push(on('quiz:podium', (msg) => {
      quiz.phase = 'podium';
      quiz.podium = msg.payload;
    }));

    cleanupFns.push(on('quiz:ended', () => {
      quiz.phase = 'ended';
    }));

    cleanupFns.push(on('player:kicked', () => {
      quiz.reset();
      disconnect();
    }));

    // Send join message
    send('player:join', { pin, name: player.name });

    // Cleanup on unmount
    return () => {
      cleanupFns.forEach(fn => fn());
    };
  });

  onDestroy(() => {
    cleanupFns.forEach(fn => fn());
  });

  const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
  const COLOR_EMOJI: Record<string, string> = {
    red: '🔴',
    blue: '🔵',
    yellow: '🟡',
    green: '🟢',
  };

  function handleAnswer(color: string) {
    if (quiz.answerLocked || !quiz.currentQuestion) return;
    const optionIndex = quiz.currentQuestion.colors.indexOf(color as any);
    const optionId = `opt_${optionIndex}`;
    quiz.myAnswerId = optionId;
    quiz.hasAnswered = true;
    send('player:answer', { questionId: quiz.currentQuestion.questionId, optionId });
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] no-select">
  {#if quiz.phase === 'lobby'}
    <!-- Waiting screen -->
    <div class="flex flex-col items-center justify-center min-h-dvh px-4 text-center">
      <div class="text-6xl mb-6 animate-pulse-gentle">⏳</div>
      <h2 class="text-xl font-semibold text-white mb-2">你已成功加入！</h2>
      <p class="text-gray-400 mb-1">你的昵称是：<span class="text-white font-bold">{player.name}</span></p>
      <p class="text-gray-500 text-sm">请看大屏幕，等待主持人开始游戏...</p>
    </div>

  {:else if quiz.phase === 'countdown'}
    <!-- Countdown screen -->
    <div class="flex items-center justify-center min-h-dvh">
      <div class="text-8xl font-bold text-white animate-score-pop">3</div>
    </div>

  {:else if quiz.phase === 'question' && quiz.currentQuestion}
    <!-- Question active — show color grid -->
    <div class="min-h-dvh flex flex-col">
      <!-- Timer bar at top -->
      <div class="h-2 bg-gray-800">
        <div
          class="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
          style="width: {(quiz.timeLeft / quiz.currentQuestion.timeLimitSec) * 100}%"
        ></div>
      </div>

      <!-- Color grid (2x2) -->
      <div class="flex-1 grid grid-cols-2 gap-3 p-3">
        {#each quiz.currentQuestion.colors as color, i}
          <button
            onclick={() => handleAnswer(color)}
            disabled={quiz.answerLocked}
            class={[
              'rounded-2xl flex items-center justify-center text-4xl font-bold transition-all duration-300 cursor-pointer',
              color === 'red' ? 'bg-[var(--color-red)]' : '',
              color === 'blue' ? 'bg-[var(--color-blue)]' : '',
              color === 'yellow' ? 'bg-[var(--color-yellow)]' : '',
              color === 'green' ? 'bg-[var(--color-green)]' : '',
              quiz.answerLocked ? 'opacity-30 scale-95' : 'active:scale-95 hover:brightness-110',
              quiz.myAnswerId === `opt_${i}` ? 'ring-4 ring-white scale-95' : '',
            ].filter(Boolean).join(' ')}
          >
            <div class="text-center">
              <span class="block text-5xl mb-1">{COLOR_EMOJI[color]}</span>
              <span class="block text-white/70 text-sm font-normal">
                {['▲', '◆', '●', '■'][i]}
              </span>
            </div>
          </button>
        {/each}
      </div>

      <!-- Waiting indicator when answered -->
      {#if quiz.answerLocked}
        <div class="text-center py-4 bg-gray-900/50">
          <p class="text-gray-400 text-sm animate-pulse-gentle">
            正在等待其他玩家作答...
          </p>
        </div>
      {/if}
    </div>

  {:else if quiz.phase === 'question_result' && quiz.lastResult}
    <!-- Result feedback -->
    <div class={[
      'min-h-dvh flex flex-col items-center justify-center px-4 text-center transition-colors duration-500',
      quiz.lastResult.correct ? 'bg-green-600' : 'bg-red-600',
    ]}>
      <div class="text-6xl mb-4">
        {quiz.lastResult.correct ? '✅' : '❌'}
      </div>
      <h2 class="text-3xl font-bold text-white mb-2">
        {quiz.lastResult.correct ? '正确！' : quiz.lastResult.myAnswerId ? '错误' : '时间到！'}
      </h2>
      {#if !quiz.lastResult.correct && quiz.lastResult.myAnswerId === null}
        <p class="text-white/70 text-sm">很遗憾，超时了</p>
      {/if}
      <div class="mt-6 animate-score-pop">
        <p class="text-lg text-white/70">本题得分</p>
        <p class="text-5xl font-bold text-white">+{quiz.lastResult.scoreEarned}</p>
      </div>
      <div class="mt-4 text-white/60 text-sm">
        总分：{quiz.lastResult.totalScore}
        {#if quiz.lastResult.streak > 1}
          · 连续 {quiz.lastResult.streak} 题正确 🔥
        {/if}
      </div>
    </div>

  {:else if quiz.phase === 'leaderboard' && quiz.leaderboard}
    <!-- Personal leaderboard -->
    <div class="min-h-dvh flex flex-col items-center justify-center px-4">
      <h2 class="text-2xl font-bold text-white mb-2">当前排名</h2>
      <div class="text-5xl font-bold text-indigo-400 mb-4 animate-score-pop">
        #{quiz.leaderboard.myRank}
      </div>
      <p class="text-lg text-white mb-1">{quiz.leaderboard.myScore} 分</p>
      {#if quiz.leaderboard.diffToAbove !== null}
        <p class="text-sm text-gray-400">
          距离上一名还差 {quiz.leaderboard.diffToAbove} 分！
        </p>
      {:else if quiz.leaderboard.myRank === 1}
        <p class="text-sm text-yellow-400">👑 继续保持领先！</p>
      {/if}

      <!-- Top 5 mini list -->
      <div class="mt-8 w-full max-w-xs space-y-2">
        {#each quiz.leaderboard.top5 as entry}
          <div class={[
            'flex items-center justify-between px-4 py-2 rounded-lg text-sm',
            entry.rank === quiz.leaderboard.myRank ? 'bg-indigo-500/20 border border-indigo-500/30' : 'bg-gray-800/50',
          ]}>
            <span class="text-gray-400">#{entry.rank}</span>
            <span class="text-white flex-1 ml-3">{entry.name}</span>
            <span class="text-gray-300 font-mono">{entry.score}</span>
          </div>
        {/each}
      </div>
    </div>

  {:else if quiz.phase === 'podium' && quiz.podium}
    <!-- Final podium -->
    <div class="min-h-dvh flex flex-col items-center justify-center px-4 text-center">
      <h2 class="text-2xl font-bold text-white mb-8">🏆 最终排名 🏆</h2>

      <div class="flex items-end justify-center gap-4 mb-8">
        <!-- 2nd place -->
        <div class="text-center">
          <div class="text-3xl mb-2">🥈</div>
          <div class="bg-gray-500 rounded-t-xl w-20 h-24 flex flex-col justify-end pb-2">
            <p class="text-white font-bold text-sm">{quiz.podium.second.name}</p>
            <p class="text-white/70 text-xs">{quiz.podium.second.score}</p>
          </div>
        </div>

        <!-- 1st place -->
        <div class="text-center">
          <div class="text-4xl mb-2">👑</div>
          <div class="bg-yellow-500 rounded-t-xl w-24 h-32 flex flex-col justify-end pb-2">
            <p class="text-white font-bold">{quiz.podium.first.name}</p>
            <p class="text-white/70 text-xs">{quiz.podium.first.score}</p>
          </div>
        </div>

        <!-- 3rd place -->
        <div class="text-center">
          <div class="text-3xl mb-2">🥉</div>
          <div class="bg-amber-700 rounded-t-xl w-20 h-20 flex flex-col justify-end pb-2">
            <p class="text-white font-bold text-sm">{quiz.podium.third.name}</p>
            <p class="text-white/70 text-xs">{quiz.podium.third.score}</p>
          </div>
        </div>
      </div>

      <p class="text-gray-400 text-sm">感谢参与！</p>
    </div>

  {:else if quiz.phase === 'ended'}
    <div class="min-h-dvh flex items-center justify-center">
      <p class="text-gray-400">游戏已结束</p>
    </div>

  {:else}
    <!-- Fallback / initial state -->
    <div class="min-h-dvh flex items-center justify-center">
      <p class="text-gray-400">连接中...</p>
    </div>
  {/if}
</div>
