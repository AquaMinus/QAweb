<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { questionsApi, roomsApi, ApiError } from '$lib/api';
  import type { QuestionSetData } from '$lib/types';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';
  import Toast from '$components/shared/Toast.svelte';

  let sets = $state<QuestionSetData[]>([]);
  let loading = $state(true);
  let selectedSet = $state('');
  let timeLimit = $state(20);
  let scoringMode = $state<'fixed' | 'time_decay'>('fixed');
  let advanceMode = $state<'manual' | 'auto'>('manual');
  let autoDelay = $state(5);
  let showQuestionText = $state(false);
  let creating = $state(false);

  onMount(async () => {
    if (!auth.isLoggedIn) { goto('/host/login'); return; }
    try {
      const res = await questionsApi.listSets();
      sets = res.sets.filter((s: any) => (s.questionCount || 0) > 0);
    } catch { /* ignore */ }
    loading = false;
  });

  async function handleCreate() {
    if (!selectedSet) return;
    creating = true;
    try {
      const res = await roomsApi.create({
        questionSetId: selectedSet,
        settings: {
          timeLimitSec: timeLimit,
          scoringMode,
          advanceMode,
          autoAdvanceDelayMs: autoDelay * 1000,
          showQuestionText,
        },
      });
      goto(`/host/room/${res.room.pin}`);
    } catch (err: any) {
      Toast.show(err instanceof ApiError ? err.message : '创建失败', 'error');
    }
    creating = false;
  }

  let durationMin = $derived(Math.ceil((sets.find(s => s.id === selectedSet)?.questionCount ?? 0) * (timeLimit + 10) / 60));
</script>

<Toast />

<div class="min-h-dvh bg-[var(--color-bg)] px-4 py-8">
  <div class="max-w-lg mx-auto">
    <a href="/host/dashboard" class="text-sm text-gray-500 hover:text-gray-400 mb-6 inline-block">← 返回控制台</a>
    <h1 class="text-2xl font-bold text-white mb-6">创建答题房间</h1>

    {#if loading}
      <Spinner size="lg" class="py-12" />
    {:else}
      <div class="space-y-5">
        <!-- Select question set -->
        <div>
          <label class="block text-sm text-gray-400 mb-2">选择题库</label>
          {#if sets.length === 0}
            <p class="text-gray-500 text-sm">暂无可用的题库，请先去<a href="/host/questions" class="text-indigo-400">创建题库</a></p>
          {:else}
            <select bind:value={selectedSet}
              class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500">
              <option value="">请选择题库...</option>
              {#each sets as s}
                <option value={s.id}>{s.title}（{s.questionCount}题）</option>
              {/each}
            </select>
          {/if}
        </div>

        <!-- Time limit -->
        <div>
          <label class="block text-sm text-gray-400 mb-2">每题答题时间（秒）</label>
          <div class="flex gap-2">
            {#each [10, 15, 20, 30] as t}
              <button onclick={() => timeLimit = t}
                class={['px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                  timeLimit === t ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                ]}>{t}s</button>
            {/each}
          </div>
        </div>

        <!-- Scoring mode -->
        <div>
          <label class="block text-sm text-gray-400 mb-2">计分模式</label>
          <div class="flex gap-2">
            <button onclick={() => scoringMode = 'fixed'}
              class={['px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                scoringMode === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              ]}>固定分值（1000分）</button>
            <button onclick={() => scoringMode = 'time_decay'}
              class={['px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                scoringMode === 'time_decay' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              ]}>时间衰减（越快越高分）</button>
          </div>
        </div>

        <!-- Advance mode -->
        <div>
          <label class="block text-sm text-gray-400 mb-2">推进模式</label>
          <div class="flex gap-2">
            <button onclick={() => advanceMode = 'manual'}
              class={['px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                advanceMode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              ]}>手动推进</button>
            <button onclick={() => advanceMode = 'auto'}
              class={['px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                advanceMode === 'auto' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              ]}>自动播放</button>
          </div>
          {#if advanceMode === 'auto'}
            <p class="text-gray-500 text-xs mt-2">每题结果展示 {autoDelay} 秒后自动下一题</p>
          {/if}
        </div>

        <!-- Show question text on player screens -->
        <div>
          <label class="block text-sm text-gray-400 mb-2">玩家端显示</label>
          <div class="flex gap-2">
            <button onclick={() => showQuestionText = false}
              class={['px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                !showQuestionText ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              ]}>仅颜色按钮</button>
            <button onclick={() => showQuestionText = true}
              class={['px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                showQuestionText ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              ]}>显示题干+选项</button>
          </div>
          <p class="text-gray-500 text-xs mt-2">开启后玩家手机端可看到题目内容，无需看大屏</p>
        </div>

        <!-- Duration estimate -->
        {#if selectedSet && durationMin > 0}
          <div class="bg-[var(--color-surface)] border border-gray-700 rounded-xl p-4">
            <span class="text-gray-400 text-sm">预估时长：约 </span>
            <span class="text-white font-semibold">{durationMin}</span>
            <span class="text-gray-400 text-sm"> 分钟</span>
          </div>
        {/if}

        <Button variant="primary" fullWidth disabled={!selectedSet || creating} onclick={handleCreate}>
          {#if creating}<Spinner size="sm" class="mr-2" />{/if}
          创建房间
        </Button>
      </div>
    {/if}
  </div>
</div>
