<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { authApi, ApiError } from '$lib/api';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';
  import { onMount } from 'svelte';

  let displayName = $state('');
  let message = $state('');
  let error = $state('');
  let loading = $state(false);

  onMount(() => {
    if (!auth.isLoggedIn) {
      goto('/host/login');
      return;
    }
    displayName = auth.host?.displayName || '';
  });

  async function handleSave(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    message = '';
    loading = true;

    try {
      const res = await authApi.updateProfile(displayName);
      auth.updateHost(res.host);
      message = '昵称已更新';
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.message;
      } else {
        error = '更新失败';
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] px-4 py-8">
  <div class="max-w-sm mx-auto">
    <a href="/host/dashboard" class="text-sm text-gray-500 hover:text-gray-400 mb-6 inline-block">← 返回控制台</a>

    <h1 class="text-2xl font-bold text-white mb-6">个人信息</h1>

    <form onsubmit={handleSave} class="space-y-4">
      <!-- Username (read-only) -->
      <div>
        <label class="block text-sm text-gray-400 mb-1">用户名</label>
        <input
          type="text"
          value={auth.host?.username || ''}
          disabled
          class="w-full px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700 text-gray-500 cursor-not-allowed"
        />
        <p class="text-xs text-gray-600 mt-1">用户名不可修改，用于登录</p>
      </div>

      <!-- Email (read-only) -->
      <div>
        <label class="block text-sm text-gray-400 mb-1">邮箱</label>
        <input
          type="text"
          value={auth.host?.email || '未设置'}
          disabled
          class="w-full px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700 text-gray-500 cursor-not-allowed"
        />
        <p class="text-xs text-gray-600 mt-1">邮箱不可修改</p>
      </div>

      <!-- Display name -->
      <div>
        <label for="name" class="block text-sm text-gray-400 mb-1">昵称</label>
        <input
          id="name"
          type="text"
          bind:value={displayName}
          required
          maxlength="30"
          class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      <!-- Message -->
      {#if message}
        <div class="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-green-400 text-sm">{message}</div>
      {/if}
      {#if error}
        <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">{error}</div>
      {/if}

      <Button type="submit" variant="primary" fullWidth disabled={loading}>
        {#if loading}<Spinner size="sm" class="mr-2" />{/if}
        保存修改
      </Button>
    </form>

    <div class="mt-8 pt-6 border-t border-gray-800 space-y-3">
      <a href="/host/change-password" class="block text-sm text-indigo-400 hover:text-indigo-300">修改密码 →</a>
    </div>
  </div>
</div>
