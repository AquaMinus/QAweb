<script lang="ts">
  import { goto } from '$app/navigation';
  import { player } from '$lib/stores/player.svelte';
  import { roomsApi, ApiError } from '$lib/api';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';

  let pin = $state('');
  let name = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleJoin(e: SubmitEvent) {
    e.preventDefault();
    error = '';

    if (!pin.trim() || pin.trim().length !== 6) {
      error = '请输入6位房间 PIN 码'; return;
    }
    if (!name.trim()) {
      error = '请输入你的昵称'; return;
    }

    loading = true;
    try {
      // Check if room exists and is joinable
      const check = await fetch(`/api/rooms/${pin.trim()}/check`);
      const data = await check.json();
      if (!data.valid) {
        error = data.reason || '无法加入'; loading = false; return;
      }
      player.setIdentity(pin.trim(), name.trim());
      goto(`/play/${pin.trim()}`);
    } catch {
      error = '网络错误，请重试';
    }
    loading = false;
  }
</script>

<div class="min-h-dvh flex items-center justify-center px-4 bg-[var(--color-bg)]">
  <div class="max-w-sm w-full">
    <a href="/" class="block text-center mb-8">
      <h1 class="text-3xl font-bold text-white">QAweb</h1>
      <p class="text-gray-400 text-sm mt-1">加入答题游戏</p>
    </a>

    <form onsubmit={handleJoin} class="space-y-5">
      <div>
        <label for="pin" class="block text-sm text-gray-400 mb-1">房间 PIN 码</label>
        <input id="pin" type="text" inputmode="numeric" maxlength="6" bind:value={pin} required
          placeholder="输入6位数字"
          class="w-full px-4 py-4 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white text-center text-2xl font-mono tracking-widest placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
      </div>
      <div>
        <label for="name" class="block text-sm text-gray-400 mb-1">你的昵称</label>
        <input id="name" type="text" bind:value={name} required maxlength="20" placeholder="输入你的昵称"
          class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500" />
      </div>
      {#if error}
        <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">{error}</div>
      {/if}
      <Button type="submit" variant="play" fullWidth disabled={loading}>
        {#if loading}<Spinner size="sm" class="mr-2" />{/if} 加入房间
      </Button>
    </form>
    <p class="mt-8 text-center"><a href="/" class="text-sm text-gray-600 hover:text-gray-400">← 返回首页</a></p>
  </div>
</div>
