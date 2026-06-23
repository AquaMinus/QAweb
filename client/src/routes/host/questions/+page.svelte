<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { questionsApi, ApiError } from '$lib/api';
  import type { QuestionSetData } from '$lib/types';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';

  let sets = $state<QuestionSetData[]>([]);
  let loading = $state(true);
  let error = $state('');
  let showCreate = $state(false);
  let newTitle = $state('');
  let newDesc = $state('');
  let exportOpen = $state<string | null>(null);

  onMount(() => {
    if (!auth.isLoggedIn) { goto('/host/login'); return; }
    loadSets();
  });

  async function loadSets() {
    loading = true;
    try {
      const res = await questionsApi.listSets();
      sets = res.sets;
    } catch { error = '加载失败'; }
    finally { loading = false; }
  }

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await questionsApi.createSet({ title: newTitle, description: newDesc });
      newTitle = ''; newDesc = ''; showCreate = false;
      await loadSets();
    } catch { error = '创建失败'; }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`确定删除「${title}」？\n题目将一并删除，不可恢复。`)) return;
    try {
      await questionsApi.deleteSet(id);
      await loadSets();
    } catch { error = '删除失败'; }
  }

  async function handleCopy(id: string) {
    try {
      await questionsApi.copySet(id);
      await loadSets();
    } catch { error = '复制失败'; }
  }

  async function handleExport(id: string, format: 'json' | 'csv') {
    try {
      const blob = await questionsApi.exportQuestions(id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `questions.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }

  async function handleShare(id: string) {
    const hours = prompt('分享链接有效期（小时）：', '24');
    if (!hours) return;
    try {
      const res = await questionsApi.createShareLink(id, parseInt(hours));
      const url = `${window.location.origin}/api/questions/shared/${res.token}`;
      await navigator.clipboard.writeText(url);
      alert(`分享链接已复制到剪贴板！\n有效期至：${new Date(res.expiresAt).toLocaleString()}`);
    } catch { alert('生成分享链接失败'); }
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] px-4 py-8">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <a href="/host/dashboard" class="text-sm text-gray-500 hover:text-gray-400">← 返回控制台</a>
        <h1 class="text-2xl font-bold text-white mt-1">题库管理</h1>
      </div>
      <Button variant="primary" onclick={() => showCreate = true}>+ 新建题集</Button>
    </div>

    <!-- Create form -->
    {#if showCreate}
      <div class="mb-6 p-6 rounded-2xl bg-[var(--color-surface)] border border-gray-700">
        <h2 class="text-lg font-semibold text-white mb-4">新建题集</h2>
        <form onsubmit={handleCreate} class="space-y-3">
          <input type="text" bind:value={newTitle} required placeholder="题集名称" maxlength="100"
            class="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500" />
          <input type="text" bind:value={newDesc} placeholder="简介（可选）" maxlength="500"
            class="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500" />
          <div class="flex gap-3">
            <Button type="submit" variant="primary">创建</Button>
            <Button variant="secondary" onclick={() => showCreate = false}>取消</Button>
          </div>
        </form>
      </div>
    {/if}

    <!-- Error -->
    {#if error}
      <div class="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">{error}</div>
    {/if}

    <!-- Set list -->
    {#if loading}
      <div class="flex justify-center py-12"><Spinner size="lg" /></div>
    {:else if sets.length === 0}
      <div class="text-center py-12 text-gray-500">
        <div class="text-4xl mb-3">📚</div>
        <p>还没有题集，点击上方按钮创建</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each sets as set}
          <div class="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-surface)] border border-gray-700 hover:border-gray-600 transition-colors">
            <button
              onclick={() => goto(`/host/questions/${set.id}`)}
              class="flex-1 text-left cursor-pointer"
            >
              <h3 class="text-white font-semibold">{set.title}</h3>
              <p class="text-gray-400 text-sm mt-0.5">
                {set.description || '无简介'} · {set.questionCount ?? 0} 题
              </p>
            </button>
            <div class="flex gap-1">
              <button onclick={() => handleShare(set.id)} title="分享"
                class="p-2 text-gray-500 hover:text-indigo-400 transition-colors cursor-pointer text-sm">🔗</button>
              <!-- Export dropdown -->
              <div class="relative"
                onmouseenter={() => exportOpen = set.id}
                onmouseleave={() => { setTimeout(() => { if (exportOpen === set.id) exportOpen = null; }, 200); }}
              >
                <button title="导出"
                  class="p-2 text-gray-500 hover:text-indigo-400 transition-colors cursor-pointer text-sm">📥</button>
                <div
                  class={[
                    'absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[120px]',
                    'transition-all duration-200 ease-out',
                    exportOpen === set.id ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none',
                  ]}
                  onmouseenter={() => exportOpen = set.id}
                  onmouseleave={() => exportOpen = null}
                >
                  <button
                    onclick={() => { handleExport(set.id, 'json'); exportOpen = null; }}
                    class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
                  >
                    📄 导出 JSON
                  </button>
                  <button
                    onclick={() => { handleExport(set.id, 'csv'); exportOpen = null; }}
                    class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
                  >
                    📊 导出 CSV
                  </button>
                </div>
              </div>
              <button onclick={() => handleCopy(set.id)} title="复制"
                class="p-2 text-gray-500 hover:text-indigo-400 transition-colors cursor-pointer text-sm">📋</button>
              <button onclick={() => handleDelete(set.id, set.title)} title="删除"
                class="p-2 text-gray-500 hover:text-red-400 transition-colors cursor-pointer text-sm">🗑</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
