<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { player } from '$lib/stores/player.svelte';
  import { quiz } from '$lib/stores/quiz.svelte';
  import { connect, disconnect, send, on, getSessionToken } from '$lib/ws';
  import type { PlayerQuestionPayload, PlayerResultPayload, PlayerLeaderboardPayload, PodiumPayload, OptionColor } from '$lib/types';

  const COLORS: Record<OptionColor, string> = { red: 'bg-[var(--color-red)]', blue: 'bg-[var(--color-blue)]', yellow: 'bg-[var(--color-yellow)]', green: 'bg-[var(--color-green)]' };

  let pin = $derived($page.params.pin);
  let cleanupFns: (() => void)[] = [];
  let connected = $state(false);
  let readingMode = $state(false);
  let nextInSec = $state(0);
  let nextTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    if (!player.isInRoom) { window.location.href = '/play'; return; }

    connect(pin);
    wireMessages();
    return () => cleanupFns.forEach(f => f());
  });

  onDestroy(() => cleanupFns.forEach(f => f()));

  let joinedToken = $state('');

  function wireMessages() {
    // When WS opens, send join or reconnect
    cleanupFns.push(on('ws:open', () => {
      if (joinedToken) {
        // Reconnecting — restore session
        send('player:reconnect', { pin, session_token: joinedToken });
      } else {
        // First connection
        send('player:join', { pin, name: player.name });
      }
    }));

    cleanupFns.push(on('room:joined', (msg: any) => {
      connected = true;
      quiz.phase = 'lobby';
      joinedToken = msg.payload.sessionToken;
      sessionStorage.setItem('qaweb_session', joinedToken);
    }));

    cleanupFns.push(on('error', (msg: any) => {
      if (msg.payload?.code === 'NAME_TAKEN') alert('昵称已被占用，请换一个');
    }));

    cleanupFns.push(on('room:state', (msg: any) => {
      quiz.phase = msg.payload.phase;
      if (msg.payload.myScore !== undefined) quiz.lastResult = { totalScore: msg.payload.myScore } as any;
    }));

    cleanupFns.push(on('quiz:countdown', () => { quiz.phase = 'countdown'; }));

    cleanupFns.push(on('quiz:question_player', (msg: any) => {
      const p = msg.payload as PlayerQuestionPayload;
      quiz.phase = 'question';
      quiz.currentQuestion = p;
      quiz.hasAnswered = false;
      quiz.answerLocked = false;
      quiz.myAnswerId = null;
      quiz.stopTimer();
      // 3s reading time — buttons locked, show reading indicator
      readingMode = true;
      quiz.timeLeft = (p as any).readingSec || 3;
      const readIv = setInterval(() => {
        if (quiz.timeLeft > 1) quiz.timeLeft--;
        else { clearInterval(readIv); }
      }, 1000);
      // Clear next-question countdown
      if (nextTimer) { clearInterval(nextTimer); nextTimer = null; }
      nextInSec = 0;
    }));

    cleanupFns.push(on('quiz:answer_phase', (msg: any) => {
      readingMode = false;
      quiz.answerLocked = false;
      quiz.startQuestionTimer(msg.payload.timeLimitSec);
    }));

    cleanupFns.push(on('quiz:answer_accepted', () => { quiz.answerLocked = true; }));

    cleanupFns.push(on('quiz:result_player', (msg: any) => {
      quiz.phase = 'question_result';
      quiz.lastResult = msg.payload;
      quiz.stopTimer();
    }));

    cleanupFns.push(on('quiz:next_countdown', (msg: any) => {
      nextInSec = msg.payload.seconds || 5;
      if (nextTimer) clearInterval(nextTimer);
      nextTimer = setInterval(() => { if (nextInSec > 0) nextInSec--; }, 1000);
    }));

    cleanupFns.push(on('quiz:leaderboard', (msg: any) => {
      quiz.phase = 'leaderboard';
      quiz.leaderboard = msg.payload;
    }));

    cleanupFns.push(on('quiz:podium', (msg: any) => {
      quiz.phase = 'podium';
      quiz.podium = msg.payload;
    }));

    cleanupFns.push(on('quiz:ended', () => { quiz.phase = 'ended'; }));

    cleanupFns.push(on('player:kicked', () => {
      quiz.reset(); disconnect(); connected = false;
      alert('你被主持人移出了房间');
      window.location.href = '/play';
    }));
  }

  function handleAnswer(color: OptionColor) {
    if (quiz.answerLocked || !quiz.currentQuestion) return;
    // Get the real option ID from the server-provided color→ID map
    const optionId = (quiz.currentQuestion as any).colorOptionIds?.[color];
    if (!optionId) return;
    // Lock immediately — no changing answers
    quiz.myAnswerId = optionId;
    quiz.hasAnswered = true;
    quiz.answerLocked = true;
    send('player:answer', { questionId: quiz.currentQuestion.questionId, optionId });
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] no-select">
  {#if !connected}
    <div class="flex items-center justify-center min-h-dvh">
      <div class="text-center"><div class="text-4xl mb-4 animate-pulse-gentle">⏳</div><p class="text-gray-400">连接中...</p></div>
    </div>

  {:else if quiz.phase === 'lobby'}
    <div class="flex flex-col items-center justify-center min-h-dvh px-4 text-center">
      <div class="text-6xl mb-6 animate-pulse-gentle">⏳</div>
      <h2 class="text-xl font-semibold text-white mb-2">你已加入！</h2>
      <p class="text-gray-400">昵称：<span class="text-white font-bold">{player.name}</span></p>
      <p class="text-gray-500 text-sm mt-4">请看大屏幕，等待主持人开始...</p>
    </div>

  {:else if quiz.phase === 'countdown'}
    <div class="min-h-dvh flex items-center justify-center">
      <div class="text-8xl font-bold text-white animate-score-pop">⏱</div>
    </div>

  {:else if quiz.phase === 'question' && quiz.currentQuestion}
    <div class="min-h-dvh flex flex-col">
      {#if readingMode}
        <!-- Reading phase: 3s to read question, cannot answer -->
        <div class="text-center py-6 bg-yellow-500/20">
          <p class="text-yellow-400 text-lg font-bold">📖 审题中... {quiz.timeLeft}s</p>
          <p class="text-yellow-400/60 text-sm mt-1">请阅读题目，倒计时结束后方可作答</p>
        </div>
      {:else}
        <div class="h-2 bg-gray-800">
          <div class="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
            style="width: {(quiz.timeLeft / quiz.currentQuestion.timeLimitSec) * 100}%"></div>
        </div>
      {/if}
      <div class="flex-1 grid grid-cols-2 gap-3 p-3">
        {#each quiz.currentQuestion.colors as color, i}
          <button onclick={() => handleAnswer(color)} disabled={quiz.answerLocked || readingMode}
            class={['rounded-2xl flex items-center justify-center text-4xl font-bold transition-all cursor-pointer',
              COLORS[color],
              (quiz.answerLocked || readingMode) ? 'opacity-30 scale-95' : 'active:scale-95 hover:brightness-110',
              (quiz.myAnswerId && quiz.currentQuestion) ? 'ring-4 ring-white scale-95' : '',
            ]}>
            <div class="text-center">
              <span class="block text-5xl mb-1">{{
                red: '🔴', blue: '🔵', yellow: '🟡', green: '🟢'
              }[color]}</span>
              <span class="block text-white/70 text-sm">{{
                red: '▲', blue: '◆', yellow: '●', green: '■'
              }[color]}</span>
            </div>
          </button>
        {/each}
      </div>
      {#if quiz.answerLocked && !readingMode}
        <div class="text-center py-4 bg-gray-900/50 text-gray-400 text-sm animate-pulse-gentle">等待其他玩家...</div>
      {/if}
    </div>

  {:else if quiz.phase === 'question_result' && quiz.lastResult}
    <div class={['min-h-dvh flex flex-col items-center justify-center px-4 text-center',
      quiz.lastResult.correct ? 'bg-green-600' : 'bg-red-600']}>
      <div class="text-6xl mb-4">{quiz.lastResult.correct ? '✅' : '❌'}</div>
      <h2 class="text-3xl font-bold text-white mb-2">
        {quiz.lastResult.correct ? '正确！' : quiz.lastResult.myAnswerId ? '错误' : '时间到！'}
      </h2>
      <div class="mt-6 animate-score-pop">
        <p class="text-lg text-white/70">本题得分</p>
        <p class="text-5xl font-bold text-white">+{quiz.lastResult.scoreEarned}</p>
      </div>
      <p class="mt-4 text-white/60 text-sm">总分：{quiz.lastResult.totalScore} {#if quiz.lastResult.streak > 1}· 🔥 {quiz.lastResult.streak}连击{/if}</p>
      {#if nextInSec > 0}
        <p class="mt-6 text-white/50 text-sm">{nextInSec}s 后进入下一题</p>
      {/if}
    </div>

  {:else if quiz.phase === 'leaderboard' && quiz.leaderboard}
    <div class="min-h-dvh flex flex-col items-center justify-center px-4">
      {#if nextInSec > 0}
        <p class="text-gray-400 text-sm mb-4">还有 {nextInSec}s 进入下一题</p>
      {/if}
      <h2 class="text-2xl font-bold text-white mb-2">当前排名</h2>
      <div class="text-5xl font-bold text-indigo-400 mb-4 animate-score-pop">#{quiz.leaderboard.myRank}</div>
      <p class="text-lg text-white mb-1">{quiz.leaderboard.myScore} 分</p>
      {#if quiz.leaderboard.diffToAbove}
        <p class="text-sm text-gray-400">距离上一名还差 {quiz.leaderboard.diffToAbove} 分！</p>
      {:else if quiz.leaderboard.myRank === 1}
        <p class="text-sm text-yellow-400">👑 继续保持领先！</p>
      {/if}
      <div class="mt-8 w-full max-w-xs space-y-2">
        {#each quiz.leaderboard.top5 as entry}
          <div class={['flex items-center justify-between px-4 py-2 rounded-lg text-sm',
            entry.rank === quiz.leaderboard.myRank ? 'bg-indigo-500/20 border border-indigo-500/30' : 'bg-gray-800/50']}>
            <span class="text-gray-400">#{entry.rank}</span>
            <span class="text-white flex-1 ml-3">{entry.name}</span>
            <span class="text-gray-300 font-mono">{entry.score}</span>
          </div>
        {/each}
      </div>
    </div>

  {:else if quiz.phase === 'podium' && quiz.podium}
    <div class="min-h-dvh flex flex-col items-center justify-center px-4 text-center">
      <h2 class="text-2xl font-bold text-white mb-8">🏆 最终排名 🏆</h2>
      <div class="flex items-end justify-center gap-4 mb-8">
        <div class="text-center">
          <div class="text-3xl mb-2">🥈</div>
          <div class="bg-gray-500 rounded-t-xl w-20 flex flex-col justify-end pb-2" style="height:80px">
            <p class="text-white font-bold text-xs">{quiz.podium.second.name}</p><p class="text-white/70 text-xs">{quiz.podium.second.score}</p>
          </div>
        </div>
        <div class="text-center">
          <div class="text-4xl mb-2">👑</div>
          <div class="bg-yellow-500 rounded-t-xl w-24 flex flex-col justify-end pb-2" style="height:110px">
            <p class="text-white font-bold">{quiz.podium.first.name}</p><p class="text-white/70 text-xs">{quiz.podium.first.score}</p>
          </div>
        </div>
        <div class="text-center">
          <div class="text-3xl mb-2">🥉</div>
          <div class="bg-amber-700 rounded-t-xl w-20 flex flex-col justify-end pb-2" style="height:60px">
            <p class="text-white font-bold text-xs">{quiz.podium.third.name}</p><p class="text-white/70 text-xs">{quiz.podium.third.score}</p>
          </div>
        </div>
      </div>
      <p class="text-gray-400 text-sm">感谢参与！</p>
    </div>

  {:else if quiz.phase === 'ended'}
    <div class="min-h-dvh flex items-center justify-center text-gray-400 text-lg">游戏已结束，感谢参与！</div>
  {/if}
</div>
