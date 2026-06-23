<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { roomsApi, ApiError } from '$lib/api';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';

  let rooms = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let expandedRoom = $state<string | null>(null);
  let detail = $state<any>(null);
  let detailLoading = $state(false);

  onMount(() => {
    if (!auth.isLoggedIn) { goto('/host/login'); return; }
    loadHistory();
  });

  async function loadHistory() {
    loading = true;
    error = '';
    try {
      const res = await roomsApi.getHistory();
      rooms = res.rooms || [];
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.message;
      } else {
        error = '加载历史记录失败';
      }
    } finally {
      loading = false;
    }
  }

  async function toggleDetail(gameRoomId: string) {
    if (expandedRoom === gameRoomId) {
      expandedRoom = null;
      detail = null;
      return;
    }
    expandedRoom = gameRoomId;
    detailLoading = true;
    try {
      detail = await roomsApi.getHistoryDetail(gameRoomId);
    } catch {
      detail = null;
    } finally {
      detailLoading = false;
    }
  }

  function handleExport(gameRoomId: string) {
    const token = auth.token || '';
    const url = roomsApi.getExportUrl(gameRoomId);
    // Create a temporary anchor to trigger download with auth
    const a = document.createElement('a');
    a.href = url;
    // We need to fetch with auth headers, so use fetch + blob
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const downloadUrl = URL.createObjectURL(blob);
        const a2 = document.createElement('a');
        a2.href = downloadUrl;
        a2.download = `qaweb-history-${gameRoomId.slice(0, 8)}.xlsx`;
        a2.click();
        URL.revokeObjectURL(downloadUrl);
      });
  }

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleString('zh-CN');
  }

  function formatDuration(startedAt: number, endedAt: number): string {
    const diff = Math.round((endedAt - startedAt) / 1000);
    if (diff < 60) return `${diff}秒`;
    const min = Math.floor(diff / 60);
    const sec = diff % 60;
    return `${min}分${sec}秒`;
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)]">
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-white">📊 历史记录</h1>
        <p class="text-gray-400 text-sm mt-1">查看已结束的游戏房间</p>
      </div>
      <Button variant="secondary" onclick={() => goto('/host/dashboard')}>← 返回控制台</Button>
    </div>

    {#if loading}
      <div class="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    {:else if error}
      <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p class="text-red-400">{error}</p>
        <Button variant="secondary" onclick={loadHistory} class="mt-4">重试</Button>
      </div>
    {:else if rooms.length === 0}
      <div class="text-center py-16 text-gray-500">
        <p class="text-5xl mb-4">📭</p>
        <p class="text-lg">暂无历史记录</p>
        <p class="text-sm mt-2">完成一场游戏后记录会出现在这里</p>
      </div>
    {:else}
      <!-- Room list -->
      <div class="space-y-3">
        {#each rooms as room}
          <div class="rounded-xl bg-[var(--color-surface)] border border-gray-800 overflow-hidden">
            <button
              onclick={() => toggleDetail(room.id)}
              class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-800/30 transition-colors text-left"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-1">
                  <span class="text-white font-semibold truncate">{room.questionSetTitle || '题库'}</span>
                  <span class="text-gray-500 text-xs bg-gray-800 px-2 py-0.5 rounded">PIN: {room.pin}</span>
                </div>
                <div class="flex items-center gap-4 text-sm text-gray-400">
                  <span>{formatDate(room.endedAt)}</span>
                  <span>👥 {room.playerCount} 人</span>
                  <span>📝 {room.questionCount} 题</span>
                  <span>⏱ {formatDuration(room.startedAt, room.endedAt)}</span>
                </div>
              </div>
              <span class="text-gray-500 ml-4 text-xl">{expandedRoom === room.id ? '▾' : '▸'}</span>
            </button>

            {#if expandedRoom === room.id}
              <div class="border-t border-gray-800 px-6 py-4">
                {#if detailLoading}
                  <div class="flex justify-center py-8"><Spinner size="sm" /></div>
                {:else if detail}
                  <!-- Rankings -->
                  <div class="mb-6">
                    <h3 class="text-white font-semibold mb-3">🏆 玩家排名</h3>
                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="text-gray-400 border-b border-gray-800">
                            <th class="text-left py-2 pr-4">排名</th>
                            <th class="text-left py-2 pr-4">玩家</th>
                            <th class="text-right py-2 pr-4">总分</th>
                            <th class="text-right py-2 pr-4">正确</th>
                            <th class="text-right py-2 pr-4">错误</th>
                            <th class="text-right py-2 pr-4">未答</th>
                            <th class="text-right py-2">连击</th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each detail.players as p}
                            <tr class="border-b border-gray-800/50 text-white">
                              <td class="py-2 pr-4">
                                {#if p.final_rank === 1}🥇
                                {:else if p.final_rank === 2}🥈
                                {:else if p.final_rank === 3}🥉
                                {:else}{p.final_rank}
                                {/if}
                              </td>
                              <td class="py-2 pr-4">{p.player_name}</td>
                              <td class="py-2 pr-4 text-right font-bold">{p.total_score}</td>
                              <td class="py-2 pr-4 text-right text-green-400">{p.correct_count}</td>
                              <td class="py-2 pr-4 text-right text-red-400">{p.wrong_count}</td>
                              <td class="py-2 pr-4 text-right text-gray-500">{p.unanswered_count}</td>
                              <td class="py-2 text-right text-yellow-400">{p.max_streak > 1 ? `🔥${p.max_streak}` : '-'}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Per-question statistics -->
                  {#if detail.answers?.length > 0}
                    {@const questionIds = [...new Set(detail.answers.map((a: any) => a.question_id))]}
                    <div class="mb-6">
                      <h3 class="text-white font-semibold mb-3">📊 答题详情</h3>
                      <div class="space-y-4">
                        {#each questionIds as qid, qi}
                          {@const qAnswers = detail.answers.filter((a: any) => a.question_id === qid)}
                          {@const qText = qAnswers[0]?.question_text || `题目 ${qi + 1}`}
                          {@const total = qAnswers.length}
                          {@const correctCount = qAnswers.filter((a: any) => a.is_correct).length}
                          <div class="bg-gray-800/50 rounded-lg p-3">
                            <div class="flex items-center justify-between mb-2">
                              <p class="text-white text-sm font-medium truncate flex-1 mr-2">{qi + 1}. {qText}</p>
                              <span class="text-xs text-gray-400 whitespace-nowrap">{correctCount}/{total} 正确 ({total > 0 ? Math.round(correctCount / total * 100) : 0}%)</span>
                            </div>
                            <div class="flex gap-2">
                              {#each (['red', 'blue', 'yellow', 'green'] as const) as color}
                                {@const count = qAnswers.filter((a: any) => a.option_color === color).length}
                                {@const pct = total > 0 ? Math.round(count / total * 100) : 0}
                                <div class="flex-1 text-center">
                                  <div class={['rounded h-2 mb-1', {
                                    red: 'bg-red-500', blue: 'bg-blue-500', yellow: 'bg-yellow-500', green: 'bg-green-500',
                                  }[color]]} style="width: 100%"></div>
                                  <span class="text-xs text-gray-400">{{
                                    red: '🔴', blue: '🔵', yellow: '🟡', green: '🟢'
                                  }[color]} {count}</span>
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <!-- Export button -->
                  <div class="flex gap-3">
                    <Button variant="primary" onclick={() => handleExport(room.id)}>📥 导出 Excel</Button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
