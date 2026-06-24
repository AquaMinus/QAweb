<script lang="ts">
  let format = $state<'csv' | 'json' | 'txt'>('csv');
  let content = $state('');
  let expanded = $state(false);
  let previewCount = $state(0);

  interface Props {
    onImport: (title: string, format: 'csv' | 'json' | 'txt', content: string) => Promise<void>;
    loading?: boolean;
  }

  let { onImport, loading = false }: Props = $props();

  function detectFormat(text: string): 'csv' | 'json' | 'txt' {
    const t = text.trim();
    if (t.startsWith('{') || t.startsWith('[')) return 'json';
    if (t.includes(',') && t.split('\n').filter(l => l.trim()).length >= 1) return 'csv';
    return 'txt';
  }

  function quickPreview(text: string): number {
    const t = text.trim();
    if (!t) return 0;
    if (format === 'csv') {
      const lines = t.split('\n').filter(l => l.trim() && l.includes(','));
      // Exclude header line if present
      if (lines.length > 0 && /^(question|题目|题干|text)/i.test(lines[0].trim())) return lines.length - 1;
      return lines.length;
    }
    if (format === 'json') {
      try {
        const d = JSON.parse(t);
        return Array.isArray(d) ? d.length : d.questions?.length || 0;
      } catch { return 0; }
    }
    if (format === 'txt') return t.split('\n\n').filter(b => b.trim()).length;
    return 0;
  }

  function handleChange(e: Event) {
    const text = (e.target as HTMLTextAreaElement).value;
    content = text;
    // Auto-detect format if empty or after paste
    if (text.trim() && (!content || format !== detectFormat(text))) {
      format = detectFormat(text);
    }
    previewCount = quickPreview(text);
  }

  let title = $state('');

  async function handleSubmit() {
    if (!title.trim()) return;
    if (!content.trim()) return;
    await onImport(title.trim(), format, content.trim());
  }
</script>

<div class="border-t border-gray-700 pt-4 mt-4">
  <button
    onclick={() => expanded = !expanded}
    class="text-sm text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
  >
    {expanded ? '▾ 收起批量录入' : '▸ 点击批量录入（粘贴 CSV / JSON / TXT）'}
  </button>

  {#if expanded}
    <div class="mt-3 space-y-3">
      <!-- Title -->
      <input
        type="text"
        bind:value={title}
        required
        placeholder="题集名称"
        maxlength="100"
        class="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
      />

      <!-- Format tabs -->
      <div class="flex gap-2">
        {#each (['csv', 'json', 'txt'] as const) as fmt}
          <button
            onclick={() => { format = fmt; previewCount = quickPreview(content); }}
            class={['px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
              format === fmt ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
            ]}
          >
            {fmt.toUpperCase()}
          </button>
        {/each}
      </div>

      <!-- Textarea -->
      <textarea
        value={content}
        oninput={handleChange}
        placeholder={format === 'csv'
          ? "题目,*正确答案,错误选项2,错误选项3,错误选项4\n法国的首都是？,*巴黎,伦敦,柏林,马德里"
          : format === 'json'
          ? '{"questions":[{"text":"法国的首都是？","options":[{"text":"巴黎","isCorrect":true,"color":"red"},...]}]}'
          : "法国的首都是？\n伦敦\n*巴黎\n柏林\n马德里"}
        rows={8}
        class="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-gray-700 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-sm font-mono resize-y"
      ></textarea>

      <!-- Preview count -->
      {#if previewCount > 0}
        <p class="text-xs text-green-400">
          ✅ 检测到约 {previewCount} 道题目（{format.toUpperCase()} 格式）
        </p>
      {:else if content.trim()}
        <p class="text-xs text-yellow-400">
          ⚠ 未检测到题目，请检查格式是否正确
        </p>
      {/if}

      <!-- Submit -->
      <button
        onclick={handleSubmit}
        disabled={!title.trim() || !content.trim() || loading}
        class={['w-full py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer',
          title.trim() && content.trim() && !loading
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed',
        ]}
      >
        {loading ? '导入中...' : '导入并创建题集'}
      </button>
    </div>
  {/if}
</div>
