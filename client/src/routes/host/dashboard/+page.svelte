<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { roomsApi } from '$lib/api';
  import { onMount } from 'svelte';

  let activeRooms = $state<any[]>([]);

  onMount(() => {
    if (!auth.isLoggedIn) { goto('/host/login'); return; }
    loadRooms();
  });

  async function loadRooms() {
    try { const res = await roomsApi.getMine(); activeRooms = res.rooms; }
    catch { /* ignore */ }
  }

  function handleLogout() {
    auth.clearAuth();
    goto('/');
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] px-4 py-8">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-white">控制台</h1>
        <p class="text-gray-400 text-sm mt-1">欢迎回来，{auth.host?.displayName}</p>
      </div>
      <div class="flex gap-3">
        <a
          href="/host/profile"
          class="px-4 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer inline-flex items-center gap-1"
        >
          👤 {auth.host?.displayName}
        </a>
        <button
          onclick={() => goto('/host/questions')}
          class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors cursor-pointer"
        >
          题库管理
        </button>
        <button
          onclick={handleLogout}
          class="px-4 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer"
        >
          退出登录
        </button>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <button
        onclick={() => goto('/host/room/create')}
        class="p-6 rounded-2xl bg-[var(--color-surface)] border border-gray-700 hover:border-indigo-500 transition-all text-left group cursor-pointer"
      >
        <div class="text-2xl mb-2">🚀</div>
        <h3 class="text-lg font-semibold text-white group-hover:text-indigo-400">创建答题房间</h3>
        <p class="text-gray-400 text-sm mt-1">生成 PIN 码，邀请玩家加入</p>
      </button>

      <button
        onclick={() => goto('/host/questions')}
        class="p-6 rounded-2xl bg-[var(--color-surface)] border border-gray-700 hover:border-indigo-500 transition-all text-left group cursor-pointer"
      >
        <div class="text-2xl mb-2">📚</div>
        <h3 class="text-lg font-semibold text-white group-hover:text-indigo-400">管理题库</h3>
        <p class="text-gray-400 text-sm mt-1">创建、编辑、导入导出题目</p>
      </button>

      <button
        onclick={() => goto('/host/history')}
        class="p-6 rounded-2xl bg-[var(--color-surface)] border border-gray-700 hover:border-indigo-500 transition-all text-left group cursor-pointer"
      >
        <div class="text-2xl mb-2">📊</div>
        <h3 class="text-lg font-semibold text-white group-hover:text-indigo-400">历史记录</h3>
        <p class="text-gray-400 text-sm mt-1">查看往期游戏结果和统计</p>
      </button>
    </div>

    <!-- Active rooms -->
    <div class="rounded-2xl bg-[var(--color-surface)] border border-gray-700 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-white">我的活动房间</h2>
        <button onclick={loadRooms} class="text-sm text-gray-500 hover:text-gray-400 cursor-pointer">🔄 刷新</button>
      </div>
      {#if activeRooms.length === 0}
        <p class="text-gray-500 text-sm">暂无活动房间，点击上方"创建答题房间"开始</p>
      {:else}
        <div class="space-y-2">
          {#each activeRooms as r}
            <button onclick={() => goto(`/host/room/${r.pin}`)}
              class="w-full flex items-center gap-4 p-3 rounded-xl bg-[var(--color-bg)] hover:bg-gray-800 transition-colors text-left cursor-pointer">
              <span class="text-xl font-mono font-bold text-indigo-400">{r.pin}</span>
              <span class="text-white text-sm flex-1">{{
                lobby: '等待中', countdown: '倒计时', question: '答题中', question_result: '揭晓中', leaderboard: '排行榜', podium: '领奖台', ended: '已结束'
              }[r.phase] || r.phase}</span>
              <span class="text-gray-400 text-sm">{r.playerCount} 人</span>
              <span class="text-gray-500 text-sm">{r.questionCount}题</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
