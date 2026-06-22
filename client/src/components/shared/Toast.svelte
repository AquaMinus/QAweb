<script lang="ts">
  interface ToastMsg { id: number; text: string; type: 'info' | 'error' | 'success'; }
  let toasts = $state<ToastMsg[]>([]);
  let nextId = 0;

  export function show(text: string, type: ToastMsg['type'] = 'info', duration = 3000) {
    const id = nextId++;
    toasts = [...toasts, { id, text, type }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, duration);
  }
</script>

{#if toasts.length > 0}
  <div class="fixed top-4 right-4 z-[999] flex flex-col gap-2">
    {#each toasts as t (t.id)}
      <div class={[
        'px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all animate-score-pop',
        t.type === 'error' ? 'bg-red-600 text-white' : '',
        t.type === 'success' ? 'bg-emerald-600 text-white' : '',
        t.type === 'info' ? 'bg-gray-700 text-white' : '',
      ]}>{t.text}</div>
    {/each}
  </div>
{/if}
