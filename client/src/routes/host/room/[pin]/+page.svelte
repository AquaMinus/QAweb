<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { auth } from '$lib/stores/auth.svelte';
  import { roomsApi, ApiError } from '$lib/api';
  import { connect, disconnect, send, on, getWs } from '$lib/ws';
  import { syncClock } from '$lib/clock';
  import { startCountdown } from '$lib/timer';
  import type { HostQuestionPayload, HostResultPayload, LeaderboardEntry, PodiumPayload, AnswerDistribution, OptionColor } from '$lib/types';
  import Button from '$components/shared/Button.svelte';
  import QRCode from 'qrcode';

  const COLORS: Record<OptionColor, string> = { red: 'bg-[var(--color-red)]', blue: 'bg-[var(--color-blue)]', yellow: 'bg-[var(--color-yellow)]', green: 'bg-[var(--color-green)]' };
  const COLOR_BG: Record<OptionColor, string> = { red: 'bg-red-600/20', blue: 'bg-blue-600/20', yellow: 'bg-yellow-600/20', green: 'bg-green-600/20' };

  let pin = $derived($page.params.pin);
  let phase = $state<string>('connecting');
  let playerNames = $state<string[]>([]);
  let playerCount = $state(0);
  let locked = $state(false);
  let connecting = $state(true);

  // QR code
  let qrDataUrl = $state('');
  let joinUrl = $state('');
  let copied = $state(false);

  $effect(() => {
    if (browser && pin) {
      joinUrl = `${window.location.origin}/play?pin=${pin}`;
      QRCode.toDataURL(joinUrl, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
        .then((url: string) => { qrDataUrl = url; })
        .catch(() => {});
    }
  });

  function copyUrl() {
    if (!browser) return;
    navigator.clipboard.writeText(joinUrl).then(() => {
      copied = true;
      setTimeout(() => copied = false, 2000);
    });
  }

  // Question state
  let question = $state<HostQuestionPayload | null>(null);
  let result = $state<HostResultPayload | null>(null);
  let rankings = $state<LeaderboardEntry[]>([]);
  let podium = $state<PodiumPayload | null>(null);

  // ── rAF timer state (reactive, updated by rAF callback) ──
  let cleanupFns: (() => void)[] = [];
  let hostToken = $state('');
  let stopRaf = $state<(() => void) | null>(null);
  let displaySecs = $state(0);
  let barPct = $state(100);
  let nextCountdown = $state(0);
  let nextTimer: ReturnType<typeof setInterval> | null = null;
  let advanceMode = $state<'manual' | 'auto'>('manual');

  onMount(() => {
    if (!auth.isLoggedIn) { goto('/host/login'); return; }
    hostToken = auth.token || '';
    connectHost();
    return () => cleanupFns.forEach(f => f());
  });

  onDestroy(() => {
    cleanupFns.forEach(f => f());
    if (stopRaf) stopRaf();
    disconnect();
  });

  function connectHost() {
    connect(pin, { role: 'host', cred: hostToken });

    // Clock sync
    const ws = getWs();
    if (ws) {
      syncClock(ws).catch(() => {});
    }

    cleanupFns.push(on('room:host_bound', (msg: any) => {
      connecting = false;
      const p = msg.payload;
      phase = p.phase || 'lobby';
      playerCount = p.playerCount || 0;
      playerNames = p.playerNames || [];
      locked = p.locked || false;
      advanceMode = p.advanceMode || 'manual';
      if (p.question) question = p.question;
      if (p.result) result = p.result;
      if (p.rankings) rankings = p.rankings;
      if (p.podium) podium = p.podium;
    }));

    cleanupFns.push(on('room:player_joined', (msg: any) => {
      playerCount = msg.payload.playerCount;
      playerNames = [...playerNames, msg.payload.name];
    }));

    cleanupFns.push(on('room:player_left', (msg: any) => {
      playerCount = msg.payload.playerCount;
    }));

    cleanupFns.push(on('quiz:countdown', () => {
      phase = 'countdown';
    }));

    // ── Question: enter READING phase (3s countdown using readingEndsAt) ──
    cleanupFns.push(on('quiz:question', (msg: any) => {
      question = msg.payload;
      result = null;
      rankings = msg.payload.rankings || [];
      const readEnd = msg.payload.readingEndsAt || 0;
      const ansEnd = msg.payload.answerEndsAt || 0;
      const totalMs = ansEnd - readEnd || 3000;

      // Enter reading phase
      phase = 'reading';

      // Start rAF reading countdown: updates displaySecs+barPct reactively
      if (stopRaf) stopRaf();
      displaySecs = Math.ceil((readEnd - Date.now()) / 1000);
      barPct = 100;
      stopRaf = startCountdown(readEnd, totalMs, (secs, pct) => {
        displaySecs = secs;
        barPct = pct;
      });
    }));

    // ── Answer phase: switch to question with answer countdown ──
    cleanupFns.push(on('quiz:answer_phase', (msg: any) => {
      phase = 'question';

      const ansEnd = msg.payload.answerEndsAt || 0;
      const answerTimeMs = (msg.payload.answerTimeSec || 20) * 1000;

      if (stopRaf) stopRaf();
      displaySecs = Math.ceil((ansEnd - Date.now()) / 1000);
      barPct = 100;
      stopRaf = startCountdown(ansEnd, answerTimeMs, (secs, pct) => {
        displaySecs = secs;
        barPct = pct;
      });
    }));

    cleanupFns.push(on('quiz:result', (msg: any) => {
      result = msg.payload;
      rankings = msg.payload.rankings || [];
      phase = 'question_result';
      if (stopRaf) { stopRaf(); stopRaf = null; }
    }));

    cleanupFns.push(on('quiz:next_countdown', (msg: any) => {
      nextCountdown = msg.payload.seconds || 5;
      if (nextTimer) clearInterval(nextTimer);
      nextTimer = setInterval(() => { if (nextCountdown > 0) nextCountdown--; }, 1000);
    }));

    cleanupFns.push(on('quiz:leaderboard', (msg: any) => {
      rankings = msg.payload.rankings || [];
      phase = 'leaderboard';
    }));

    cleanupFns.push(on('quiz:podium', (msg: any) => {
      podium = msg.payload;
      phase = 'podium';
    }));

    cleanupFns.push(on('quiz:ended', () => { phase = 'ended'; }));

    cleanupFns.push(on('error', (msg: any) => {
      console.error('Server error:', msg.payload);
      connecting = false;
      phase = 'error';
      if (msg.payload?.code === 'ROOM_NOT_FOUND') {
        alert('房间不存在或已关闭');
        goto('/host/dashboard');
      } else if (msg.payload?.code === 'FORBIDDEN') {
        alert('无权访问该房间');
        goto('/host/dashboard');
      }
    }));
  }

  function handleStart() { send('host:start', { advanceMode }); }
  function handleReveal() { send('host:next'); }
  function handleNext(skip = false) { send('host:next', { skipLeaderboard: skip }); }
  function handleLockToggle() { locked = !locked; send('host:lock', { locked }); }
  function handleKick(token: string) { send('host:kick', { playerSessionToken: token }); }
  function handleEnd() { if (confirm('确定结束本场游戏？')) send('host:end'); }
  async function handleDissolve() {
    if (!confirm('确定解散房间？所有玩家将被踢出。')) return;
    try { await roomsApi.dissolve(pin); goto('/host/dashboard'); }
    catch { /* ignore */ }
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)]">
  {#if phase === 'error'}
    <div class="min-h-dvh flex flex-col items-center justify-center gap-4">
      <p class="text-red-400 text-lg">连接失败</p>
      <button onclick={() => goto('/host/dashboard')}
        class="px-4 py-2 rounded-xl bg-indigo-600 text-white cursor-pointer">返回控制台</button>
    </div>
  {:else if connecting}
    <div class="flex items-center justify-center min-h-dvh"><p class="text-gray-400">连接房间中...</p></div>

  {:else if phase === 'lobby'}
    <!-- ── LOBBY ── -->
    <div class="min-h-dvh flex flex-col items-center justify-center px-4 py-8">
      <div class="text-center mb-4">
        <p class="text-gray-400 text-sm mb-2">房间 PIN 码</p>
        <h1 class="text-7xl font-bold text-white tracking-widest font-mono">{pin}</h1>
      </div>

      <!-- QR code and join URL -->
      {#if qrDataUrl}
        <div class="mb-6 flex flex-col items-center gap-3">
          <div class="bg-white p-3 rounded-xl">
            <img src={qrDataUrl} alt="QR code" class="w-48 h-48" />
          </div>
          <p class="text-gray-400 text-xs">扫码或访问链接加入游戏</p>
          <div class="flex items-center gap-2">
            <code class="text-indigo-400 text-sm bg-gray-800 px-3 py-1.5 rounded-lg max-w-xs truncate">{joinUrl}</code>
            <button
              onclick={copyUrl}
              class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg cursor-pointer transition-colors whitespace-nowrap"
            >
              {copied ? '✅ 已复制' : '📋 复制'}
            </button>
          </div>
        </div>
      {/if}

      <div class="flex items-center gap-4 mb-6">
        <div class="text-3xl font-bold text-indigo-400">{playerCount}</div>
        <span class="text-gray-400 text-sm">人已加入</span>
      </div>

      <div class="flex gap-3 mb-8">
        <Button variant="secondary" onclick={handleLockToggle}>
          {locked ? '🔒 已锁定' : '🔓 锁定房间'}
        </Button>
        <Button variant="primary" disabled={playerCount < 1} onclick={handleStart}>
          🚀 开始游戏
        </Button>
      </div>

      {#if playerNames.length > 0}
        <div class="flex flex-wrap gap-2 justify-center max-w-md">
          {#each playerNames as name}
            <span class="px-3 py-1.5 rounded-full bg-gray-700 text-gray-200 text-sm">{name}</span>
          {/each}
        </div>
      {/if}

      <div class="mt-8">
        <Button variant="danger" onclick={handleDissolve}>解散房间</Button>
      </div>
    </div>

  {:else if phase === 'countdown'}
    <!-- ── COUNTDOWN (3-2-1 before game) ── -->
    <div class="min-h-dvh flex items-center justify-center">
      <div class="text-9xl font-bold text-white animate-score-pop">🎯</div>
    </div>

  {:else if phase === 'reading' && question}
    <!-- ── READING (3s countdown before answer phase) ── -->
    <div class="min-h-dvh flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <span class="text-gray-400 text-sm">题目 {question.questionNumber}/{question.totalQuestions}</span>
        <span class="text-3xl font-bold font-mono text-yellow-400">{displaySecs}</span>
        <div class="flex items-center gap-2">
          <span class="text-yellow-400 text-sm">⏱ 审题中</span>
          <button onclick={handleEnd} title="结束游戏"
            class="px-3 py-1.5 text-xs rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors cursor-pointer">⏹ 结束</button>
        </div>
      </div>

      <!-- Question preview + leaderboard -->
      <div class="flex-1 flex">
        <div class="flex-[7] flex flex-col items-center justify-center px-6 py-4">
          <h2 class="text-2xl font-bold text-white text-center mb-6">{question.text}</h2>
          <div class="grid grid-cols-2 gap-3 w-full max-w-xl">
            {#each question.options as opt}
              <div class={['p-5 rounded-2xl flex items-center gap-3 text-base font-semibold text-white opacity-50', COLORS[opt.color]]}>
                <span class="text-xl">{{ red: '▲', blue: '◆', yellow: '●', green: '■' }[opt.color]}</span>
                <span>{opt.text}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="flex-[3] border-l border-gray-800 bg-[var(--color-bg)]/50 p-4 flex flex-col">
          <h3 class="text-sm font-semibold text-gray-400 mb-3">🏆 实时排名</h3>
          {#if rankings.length > 0}
            <div class="flex-1 overflow-y-auto space-y-1">
              {#each rankings.slice(0, 10) as entry}
                <div class={['flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm', entry.rank === 1 ? 'bg-yellow-500/10' : '']}>
                  <span class={['font-bold w-6 text-center', entry.rank === 1 ? 'text-yellow-400' : entry.rank === 2 ? 'text-gray-300' : entry.rank === 3 ? 'text-amber-500' : 'text-gray-500']}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                  </span>
                  <span class="text-white truncate flex-1">{entry.name}</span>
                  <span class="text-indigo-400 font-mono font-bold">{entry.score}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-gray-600 text-sm text-center py-8">暂无排名数据</p>
          {/if}
        </div>
      </div>
    </div>

  {:else if phase === 'question' && question}
    <!-- ── QUESTION (answer phase) ── -->
    <div class="min-h-dvh flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div class="flex items-center gap-3">
          <span class="text-gray-400 text-sm">题目 {question.questionNumber}/{question.totalQuestions}</span>
          <span class={['text-2xl font-bold font-mono', displaySecs <= 5 ? 'text-red-400' : 'text-white']}>{displaySecs}</span>
          <div class="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full transition-none" style="width:{barPct}%"></div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          {#if advanceMode === 'manual'}
            <Button variant="secondary" onclick={handleReveal}>揭晓答案 →</Button>
          {:else}
            <span class="text-gray-500 text-sm mr-2">⏱ 自动播放</span>
          {/if}
          <button onclick={handleEnd} title="结束游戏"
            class="px-3 py-1.5 text-xs rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors cursor-pointer">⏹ 结束</button>
        </div>
      </div>

      <!-- Split layout: question left + leaderboard right -->
      <div class="flex-1 flex">
        <!-- Left: Question + Options (70%) -->
        <div class="flex-[7] flex flex-col items-center justify-center px-6 py-4">
          <h2 class="text-2xl font-bold text-white text-center mb-6">{question.text}</h2>
          <div class="grid grid-cols-2 gap-3 w-full max-w-xl">
            {#each question.options as opt}
              <div class={[
                'p-5 rounded-2xl flex items-center gap-3 text-base font-semibold text-white',
                COLORS[opt.color],
              ]}>
                <span class="text-xl">{{
                  red: '▲', blue: '◆', yellow: '●', green: '■',
                }[opt.color]}</span>
                <span>{opt.text}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Right: Mini Leaderboard (30%) -->
        <div class="flex-[3] border-l border-gray-800 bg-[var(--color-bg)]/50 p-4 flex flex-col">
          <h3 class="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">🏆 实时排名</h3>
          {#if rankings.length > 0}
            <div class="flex-1 overflow-y-auto space-y-1">
              {#each rankings.slice(0, 10) as entry}
                <div class={[
                  'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm',
                  entry.rank === 1 ? 'bg-yellow-500/10' : '',
                ]}>
                  <span class={[
                    'font-bold w-6 text-center',
                    entry.rank === 1 ? 'text-yellow-400' :
                    entry.rank === 2 ? 'text-gray-300' :
                    entry.rank === 3 ? 'text-amber-500' : 'text-gray-500',
                  ]}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                  </span>
                  <span class="text-white truncate flex-1">{entry.name}</span>
                  <span class="text-indigo-400 font-mono font-bold">{entry.score}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-gray-600 text-sm text-center py-8">暂无排名数据</p>
          {/if}
        </div>
      </div>
    </div>

  {:else if phase === 'question_result' && result}
    <!-- ── RESULT ── -->
    <div class="min-h-dvh flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <span class="text-gray-400">答案揭晓</span>
        {#if advanceMode === 'auto'}
          {#if nextCountdown > 0}
            <span class="text-indigo-400 font-bold">{nextCountdown}s 后进入下一题</span>
          {/if}
        {:else}
          <div class="flex gap-2">
            <Button variant="secondary" onclick={() => handleNext(true)}>跳过→下一题</Button>
            <Button variant="primary" onclick={() => handleNext(false)}>排行榜 →</Button>
          </div>
        {/if}
      </div>

      <!-- Split layout: result left + leaderboard right -->
      <div class="flex-1 flex">
        <!-- Left: Answer + Distribution (70%) -->
        <div class="flex-[7] flex flex-col items-center justify-center px-8">
          <div class={['w-24 h-24 rounded-2xl flex items-center justify-center text-4xl mb-6', COLORS[result.correctColor]]}>
            ✓
          </div>
          <!-- Bar chart -->
          <div class="w-full max-w-md space-y-3">
            {#each (['red', 'blue', 'yellow', 'green'] as OptionColor[]) as color}
              {@const count = result.distribution[color]}
              {@const pct = result.distribution.total > 0 ? (count / result.distribution.total) * 100 : 0}
              <div class="flex items-center gap-3">
                <div class={['w-12 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold', COLORS[color]]}>
                  {count}
                </div>
                <div class="flex-1 h-8 bg-gray-800 rounded-lg overflow-hidden">
                  <div class={['h-full rounded-lg transition-all duration-1000', COLORS[color]]} style="width: {pct}%"></div>
                </div>
                <span class="text-gray-500 text-xs w-10 text-right">{Math.round(pct)}%</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Right: Updated Leaderboard (30%) -->
        <div class="flex-[3] border-l border-gray-800 bg-[var(--color-bg)]/50 p-4 flex flex-col">
          <h3 class="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">🏆 当前排名</h3>
          {#if rankings.length > 0}
            <div class="flex-1 overflow-y-auto space-y-1">
              {#each rankings.slice(0, 10) as entry}
                <div class={[
                  'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm',
                  entry.rank === 1 ? 'bg-yellow-500/10' : '',
                ]}>
                  <span class={[
                    'font-bold w-6 text-center',
                    entry.rank === 1 ? 'text-yellow-400' :
                    entry.rank === 2 ? 'text-gray-300' :
                    entry.rank === 3 ? 'text-amber-500' : 'text-gray-500',
                  ]}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                  </span>
                  <span class="text-white truncate flex-1">{entry.name}</span>
                  <span class="text-indigo-400 font-mono font-bold">{entry.score}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-gray-600 text-sm text-center py-8">暂无排名数据</p>
          {/if}
        </div>
      </div>
    </div>

  {:else if phase === 'leaderboard'}
    <!-- ── LEADERBOARD ── -->
    <div class="min-h-dvh flex flex-col items-center justify-center px-4 py-8">
      <h2 class="text-2xl font-bold text-white mb-6">🏆 当前排名</h2>
      <div class="w-full max-w-lg space-y-2">
        {#each rankings.slice(0, 5) as entry, i}
          <div class={['flex items-center gap-4 px-5 py-3 rounded-xl',
            i === 0 ? 'bg-yellow-500/20 border border-yellow-500/30' : 'bg-[var(--color-surface)] border border-gray-700',
          ]}>
            <span class={['text-xl font-bold w-8', i === 0 ? 'text-yellow-400' : i < 3 ? 'text-gray-300' : 'text-gray-500']}>
              {i === 0 ? '👑' : `#${entry.rank}`}
            </span>
            <span class="flex-1 text-white font-semibold">{entry.name}</span>
            <span class="text-lg font-mono text-indigo-400">{entry.score}</span>
          </div>
        {/each}
      </div>
      <div class="mt-8">
        <Button variant="primary" onclick={() => handleNext(false)}>下一题 →</Button>
      </div>
    </div>

  {:else if phase === 'podium' && podium}
    <!-- ── PODIUM ── -->
    <div class="min-h-dvh flex flex-col items-center justify-center px-4">
      <h2 class="text-3xl font-bold text-white mb-12">🏆 最终排名 🏆</h2>
      <div class="flex items-end justify-center gap-6">
        <!-- 2nd -->
        <div class="text-center">
          <div class="text-4xl mb-2">🥈</div>
          <div class="bg-gray-400 rounded-t-xl w-24 flex flex-col items-center pt-4" style="height:100px">
            <p class="text-white font-bold text-sm">{podium.second.name}</p>
            <p class="text-white/80 text-xs">{podium.second.score}</p>
          </div>
        </div>
        <!-- 1st -->
        <div class="text-center">
          <div class="text-5xl mb-2">👑</div>
          <div class="bg-yellow-500 rounded-t-xl w-28 flex flex-col items-center pt-4" style="height:140px">
            <p class="text-white font-bold">{podium.first.name}</p>
            <p class="text-white/80 text-sm">{podium.first.score}</p>
          </div>
        </div>
        <!-- 3rd -->
        <div class="text-center">
          <div class="text-4xl mb-2">🥉</div>
          <div class="bg-amber-700 rounded-t-xl w-24 flex flex-col items-center pt-4" style="height:80px">
            <p class="text-white font-bold text-sm">{podium.third.name}</p>
            <p class="text-white/80 text-xs">{podium.third.score}</p>
          </div>
        </div>
      </div>
      <div class="mt-12"><Button variant="secondary" onclick={handleEnd}>结束</Button></div>
    </div>

  {:else if phase === 'ended'}
    <div class="min-h-dvh flex flex-col items-center justify-center">
      <h2 class="text-2xl font-bold text-white mb-4">游戏结束</h2>
      <p class="text-gray-400 mb-8">感谢所有玩家的参与！</p>
      <div class="flex gap-3">
        <Button variant="primary" onclick={() => goto('/host/dashboard')}>返回控制台</Button>
        <Button variant="secondary" onclick={() => goto('/host/room/create')}>创建新房间</Button>
      </div>
    </div>
  {/if}
</div>
