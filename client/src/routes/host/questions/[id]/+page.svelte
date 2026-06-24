<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { questionsApi, ApiError } from '$lib/api';
  import type { QuestionSetData, QuestionData, QuestionOption, OptionColor } from '$lib/types';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';
  import BatchImport from '$components/shared/BatchImport.svelte';

  const COLORS: OptionColor[] = ['red', 'blue', 'yellow', 'green'];
  const SHAPES = ['▲', '◆', '●', '■'];

  let setId = $derived($page.params.id);
  let set = $state<QuestionSetData | null>(null);
  let questions = $state<QuestionData[]>([]);
  let loading = $state(true);
  let error = $state('');
  let fileInput = $state<HTMLInputElement | null>(null);
  let importLoading = $state(false);

  // Editor state
  let editing = $state<QuestionData | null>(null);
  let showEditor = $state(false);
  let editText = $state('');
  let editOpts = $state<{ text: string; isCorrect: boolean; color: OptionColor }[]>([
    { text: '', isCorrect: true, color: 'red' },
    { text: '', isCorrect: false, color: 'blue' },
    { text: '', isCorrect: false, color: 'yellow' },
    { text: '', isCorrect: false, color: 'green' },
  ]);

  onMount(() => {
    if (!auth.isLoggedIn) { goto('/host/login'); return; }
    loadSet();
  });

  async function loadSet() {
    loading = true;
    try {
      const res = await questionsApi.getSet(setId);
      set = res.set;
      questions = res.questions;
    } catch { error = '加载失败'; }
    finally { loading = false; }
  }

  function openEditor(q: any = null) {
    editing = q ?? null;
    editText = q?.text ?? '';
    editOpts = q?.options?.map((o: any) => ({ text: o.text, isCorrect: o.isCorrect, color: o.color }))
      ?? COLORS.map((c, i) => ({ text: '', isCorrect: i === 0, color: c }));
    showEditor = true;
  }

  function closeEditor() { showEditor = false; editing = null; }

  function toggleCorrect(idx: number) {
    editOpts = editOpts.map((o, i) => ({ ...o, isCorrect: i === idx }));
  }

  function addOption() {
    if (editOpts.length >= 6) return;
    const used = editOpts.map(o => o.color);
    const next = COLORS.find(c => !used.includes(c)) || 'red';
    editOpts = [...editOpts, { text: '', isCorrect: false, color: next }];
  }

  function removeOption(idx: number) {
    if (editOpts.length <= 2) return;
    editOpts = editOpts.filter((_, i) => i !== idx);
  }

  async function handleSave() {
    if (!editText.trim()) return;
    const validOpts = editOpts.filter(o => o.text.trim());
    if (validOpts.length < 2) return;
    if (!editOpts.some(o => o.isCorrect && o.text.trim())) return;

    const body = {
      text: editText,
      options: editOpts.map((o, i) => ({ ...o, text: o.text.trim(), orderIndex: i })),
    };

    try {
      if (editing) {
        await questionsApi.updateQuestion(setId, editing.id, body);
      } else {
        await questionsApi.addQuestion(setId, body);
      }
      closeEditor();
      await loadSet();
    } catch { error = '保存失败'; }
  }

  async function handleDeleteQuestion(q: QuestionData) {
    if (!confirm(`确定删除「${q.text.slice(0, 30)}...」？`)) return;
    try {
      await questionsApi.deleteQuestion(setId, q.id);
      await loadSet();
    } catch { error = '删除失败'; }
  }

  function triggerImport() {
    fileInput?.click();
  }

  async function handleDownloadTemplate(format: 'csv' | 'txt' | 'json') {
    try {
      const blob = await questionsApi.downloadTemplate(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `template.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('下载模板失败'); }
  }

  async function handleImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await questionsApi.importQuestions(setId, formData);
      alert(`导入完成！成功 ${res.imported} 题，${res.errors?.length || 0} 条错误`);
      if (res.errors?.length > 0) {
        console.warn('Import errors:', res.errors);
      }
      await loadSet();
    } catch { alert('导入失败，请检查文件格式'); }
    input.value = '';
  }

  async function handleBatchImport(format: 'csv' | 'json' | 'txt', content: string) {
    importLoading = true;
    error = '';
    try {
      const res = await questionsApi.importText(setId, format, content);
      await loadSet();
      alert(`导入完成！成功 ${res.imported} 题${res.errors?.length ? `，${res.errors.length} 条错误` : ''}`);
      if (res.errors?.length > 0) console.warn('Import errors:', res.errors);
    } catch (err) {
      throw err; // let BatchImport show the error
    } finally {
      importLoading = false;
    }
  }

  async function handleExport(format: 'json' | 'csv') {
    try {
      const blob = await questionsApi.exportQuestions(setId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${set?.title || 'questions'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] px-4 py-8">
  <div class="max-w-3xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <a href="/host/questions" class="text-sm text-gray-500 hover:text-gray-400">← 题库列表</a>
        <h1 class="text-2xl font-bold text-white mt-1">{set?.title ?? '加载中...'}</h1>
        {#if set?.description}
          <p class="text-gray-400 text-sm mt-0.5">{set.description}</p>
        {/if}
      </div>
    </div>

    <!-- Actions bar -->
    <div class="flex flex-wrap gap-2 mb-6">
      <Button variant="primary" onclick={() => openEditor()}>+ 添加题目</Button>
      <button onclick={triggerImport}
        class="px-4 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer inline-flex items-center">📂 导入文件</button>
      <!-- Hidden file input triggered by button above -->
      <input type="file" accept=".json,.csv,.txt" onchange={handleImport} class="hidden" bind:this={fileInput} />
      <button onclick={() => handleExport('json')}
        class="px-4 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer">📥 JSON</button>
      <button onclick={() => handleExport('csv')}
        class="px-4 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer">📥 CSV</button>
      <button onclick={() => handleDownloadTemplate('csv')}
        class="px-4 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer inline-flex items-center">📄 CSV模板</button>
      <button onclick={() => handleDownloadTemplate('txt')}
        class="px-4 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer inline-flex items-center">📄 TXT模板</button>
    </div>

    {#if error}
      <div class="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">{error}</div>
    {/if}

    <!-- Question list -->
    {#if loading}
      <div class="flex justify-center py-12"><Spinner size="lg" /></div>
    {:else if questions.length === 0}
      <div class="text-center py-16 text-gray-500">
        <div class="text-4xl mb-3">📝</div>
        <p class="text-lg">题目为空</p>
        <p class="text-sm mt-1">点击上方"添加题目"或导入文件</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each questions as q, i}
          <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 group">
            <span class="text-gray-500 text-sm font-mono w-8 text-right">#{i + 1}</span>
            <div class="flex-1 min-w-0">
              <p class="text-white text-sm truncate">{q.text}</p>
              <div class="flex gap-1 mt-1">
                {#each q.options as o}
                  <span class={[
                    'w-5 h-5 rounded text-xs flex items-center justify-center',
                    o.color === 'red' ? 'bg-[var(--color-red)]' : '',
                    o.color === 'blue' ? 'bg-[var(--color-blue)]' : '',
                    o.color === 'yellow' ? 'bg-[var(--color-yellow)]' : '',
                    o.color === 'green' ? 'bg-[var(--color-green)]' : '',
                    o.isCorrect ? 'ring-2 ring-white' : '',
                  ]}>
                    {o.isCorrect ? '✓' : ''}
                  </span>
                {/each}
              </div>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick={() => openEditor(q)} title="编辑"
                class="p-2 text-gray-400 hover:text-white transition-colors cursor-pointer">✏️</button>
              <button onclick={() => handleDeleteQuestion(q)} title="删除"
                class="p-2 text-gray-400 hover:text-red-400 transition-colors cursor-pointer">🗑</button>
            </div>
          </div>
        {/each}
      </div>
      <p class="text-gray-600 text-sm mt-4 text-center">共 {questions.length} 题</p>
    {/if}
  </div>
</div>

<!-- Question Editor Modal -->
{#if showEditor}
  <div class="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4 bg-black/70" onclick={closeEditor} onkeydown={(e) => e.key === 'Escape' && closeEditor()}>
    <div class="bg-[var(--color-surface)] border border-gray-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onclick={(e) => e.stopPropagation()}>
      <h2 class="text-lg font-semibold text-white mb-4">{editing ? '编辑题目' : '添加题目'}</h2>

      {#if !editing}
        <BatchImport onImport={handleBatchImport} loading={importLoading} showTitle={false} />
      {/if}

      <!-- Question text -->
      <div class="mb-3">
        <label class="block text-sm text-gray-400 mb-1">题干</label>
        <textarea bind:value={editText} rows="2" required
          class="w-full px-4 py-2 rounded-xl bg-[var(--color-bg)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500 resize-none"
        ></textarea>
      </div>

      <!-- Options -->
      <div class="mb-2">
        <label class="block text-sm text-gray-400 mb-2">选项（点击色块标记正确答案）</label>
        <div class="space-y-2">
          {#each editOpts as opt, i}
            <div class="flex items-center gap-2">
              <button
                onclick={() => toggleCorrect(i)}
                class={[
                  'w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-all cursor-pointer shrink-0',
                  opt.color === 'red' ? 'bg-[var(--color-red)]' : '',
                  opt.color === 'blue' ? 'bg-[var(--color-blue)]' : '',
                  opt.color === 'yellow' ? 'bg-[var(--color-yellow)]' : '',
                  opt.color === 'green' ? 'bg-[var(--color-green)]' : '',
                  opt.isCorrect ? 'ring-3 ring-white scale-105' : 'opacity-60',
                ]}
                title={opt.isCorrect ? '正确答案' : '点击设为正确'}
              >
                {SHAPES[i] || '?'}
              </button>
              <input type="text" bind:value={opt.text} placeholder="选项文字"
                class="flex-1 px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500" />
              {#if editOpts.length > 2}
                <button onclick={() => removeOption(i)}
                  class="p-1 text-gray-600 hover:text-red-400 cursor-pointer">✕</button>
              {/if}
            </div>
          {/each}
        </div>
        {#if editOpts.length < 6}
          <button onclick={addOption}
            class="mt-2 text-sm text-indigo-400 hover:text-indigo-300 cursor-pointer">+ 添加选项</button>
        {/if}
      </div>

      <!-- Actions -->
      <div class="flex gap-3 mt-6">
        <Button variant="primary" onclick={handleSave}>
          {editing ? '保存修改' : '添加题目'}
        </Button>
        <Button variant="secondary" onclick={closeEditor}>取消</Button>
      </div>
    </div>
  </div>
{/if}
