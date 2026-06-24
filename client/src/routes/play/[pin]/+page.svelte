<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { player } from '$lib/stores/player.svelte';
  import { quiz } from '$lib/stores/quiz.svelte';
  import { connect, disconnect, send, on, getSessionToken, getWs } from '$lib/ws';
  import { syncClock, getSyncedTime, toServerTime } from '$lib/clock';
  import { startCountdown } from '$lib/timer';
  import type { PlayerQuestionPayload, PlayerResultPayload, PlayerLeaderboardPayload, PodiumPayload, OptionColor } from '$lib/types';

  const COLORS: Record<OptionColor, string> = { red: 'bg-[var(--color-red)]', blue: 'bg-[var(--color-blue)]', yellow: 'bg-[var(--color-yellow)]', green: 'bg-[var(--color-green)]' };

  let pin = $derived($page.params.pin);
  let cleanupFns: (() => void)[] = [];
  let connected = $state(false);
  let readingMode = $state(false);
  let nextInSec = $state(0);
  let nextTimer: ReturnType<typeof setInterval> | null = null;

  // ── rAF timer state ──
  let stopRaf = $state<(() => void) | null>(null);
  let displaySecs = $state(0);
  let barPct = $state(100);

  onMount(() => {
    if (!player.isInRoom) { window.location.href = '/play'; return; }

    connect(pin);
    // Clock sync
    const ws = getWs();
    if (ws) syncClock(ws).catch(() => {});
    wireMessages();
    return () => { cleanupFns.forEach(f => f()); if (stopRaf) stopRaf(); };
  });

  onDestroy(() => { cleanupFns.forEach(f => f()); if (stopRaf) stopRaf(); });

  let joinedToken = $state('');

  function wireMessages() {
    cleanupFns.push(on('ws:open', () => {
      if (joinedToken) {
        send('player:reconnect', { pin, session_token: joinedToken });
      } else {
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

    // ── Question: enter READING phase ──
    cleanupFns.push(on('quiz:question_player', (msg: any) => {
      const p = msg.payload as PlayerQuestionPayload;
      quiz.phase = 'question';
      quiz.currentQuestion = p;
      quiz.hasAnswered = false;
      quiz.answerLocked = false;
      quiz.myAnswerId = null;
      readingMode = true;

      const readingEnd = msg.payload.readingEndsAt || 0;
      const answerEnd = msg.payload.answerEndsAt || 0;
      const totalMs = answerEnd - readingEnd || 3000;

      if (stopRaf) stopRaf();
      displaySecs = Math.ceil((readingEnd - Date.now()) / 1000);
      barPct = 100;
      stopRaf = startCountdown(readingEnd, totalMs, (secs, pct) => {
        displaySecs = secs;
        barPct = pct;
      });

      if (nextTimer) { clearInterval(nextTimer); nextTimer = null; }
      nextInSec = 0;
    }));

    // ── Answer phase starts ──
    cleanupFns.push(on('quiz:answer_phase', (msg: any) => {
      readingMode = false;
      quiz.answerLocked = false;

      const answerEnd = msg.payload.answerEndsAt || 0;
      const answerTimeMs = (msg.payload.answerTimeSec || 20) * 1000;

      if (stopRaf) stopRaf();
      displaySecs = Math.ceil((answerEnd - Date.now()) / 1000);
      barPct = 100;
      stopRaf = startCountdown(answerEnd, answerTimeMs, (secs, pct) => {
        displaySecs = secs;
        barPct = pct;
      });
    }));

    cleanupFns.push(on('quiz:answer_accepted', () => { quiz.answerLocked = true; }));

    cleanupFns.push(on('quiz:result_player', (msg: any) => {
      quiz.phase = 'question_result';
      quiz.lastResult = msg.payload;
      if (stopRaf) { stopRaf(); stopRaf = null; }
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
    const optionId = (quiz.currentQuestion as any).colorOptionIds?.[color];
    if (!optionId) return;
    quiz.myAnswerId = optionId;
    quiz.hasAnswered = true;
    quiz.answerLocked = true;
    // Send with estimated server-time of click
    const clientTime = toServerTime(Date.now());
    send('player:answer', { questionId: quiz.currentQuestion.questionId, optionId, clientTime });
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
        <!-- Reading phase: rAF-driven countdown -->
        <div class="text-center py-6 bg-yellow-500/20">
          <p class="text-yellow-400 text-lg font-bold">
            ⏱ <span class="font-mono">{displaySecs}</span>秒后开始答题
          </p>
          <p class="text-yellow-400/60 text-sm mt-1">请阅读题目</p>
        </div>
      {:else}
        <!-- Answer phase: rAF-driven countdown number + progress bar -->
        <div class="flex items-center gap-3 px-3 py-2">
          <span class={['text-xl font-bold font-mono w-8 text-right', displaySecs <= 5 ? 'text-red-400' : 'text-white']}>
            {displaySecs}
          </span>
          <div class="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full transition-none"
              style="width:{barPct}%"></div>
          </div>
        </div>
      {/if}

      <!-- Question text (shown if room setting enabled) -->
      {#if quiz.currentQuestion.questionText}
        <div class="px-4 py-3 text-center">
          <p class="text-white text-lg font-semibold">{quiz.currentQuestion.questionText}</p>
        </div>
      {/if}

      <div class="flex-1 grid grid-cols-2 gap-3 p-3">
        {#each quiz.currentQuestion.colors as color, i}
          <button onclick={() => handleAnswer(color)} disabled={quiz.answerLocked || readingMode}
            class={['rounded-2xl flex flex-col items-center justify-center gap-2 p-3 transition-all cursor-pointer min-h-0',
              COLORS[color],
              (quiz.answerLocked || readingMode) ? 'opacity-30 scale-95' : 'active:scale-95 hover:brightness-110',
              (quiz.myAnswerId === quiz.currentQuestion?.colorOptionIds?.[color]) ? 'ring-4 ring-white scale-95' : '',
            ]}>
            <span class="text-3xl leading-none">{{
              red: '🔴', blue: '🔵', yellow: '🟡', green: '🟢'
            }[color]}</span>
            {#if quiz.currentQuestion?.optionTexts?.[color]}
              <span class="text-white/90 font-semibold leading-tight text-center break-words line-clamp-3"
                style="font-size: clamp(0.75rem, 4.5vw, 1.35rem);">
                {quiz.currentQuestion.optionTexts[color]}
              </span>
            {/if}
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
      <div class="mt-4 text-white/60">
        <p>总分：<span class="text-white font-bold">{quiz.lastResult.totalScore}</span></p>
        {#if quiz.lastResult.streak > 1}
          <p class="mt-1">🔥 {quiz.lastResult.streak}连对！</p>
        {/if}
      </div>
      {#if nextInSec > 0}
        <p class="mt-6 text-white/50 text-sm animate-pulse-gentle">{nextInSec}秒后进入下一题</p>
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
