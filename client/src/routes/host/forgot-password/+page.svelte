<script lang="ts">
  import { authApi } from '$lib/api';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';

  let username = $state('');
  let sent = $state(false);
  let loading = $state(false);
  let error = $state('');

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    loading = true;
    try {
      await authApi.forgotPassword(username);
      sent = true;
    } catch {
      // Always show success to prevent user enumeration
      sent = true;
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] flex items-center justify-center px-4">
  <div class="max-w-sm w-full">
    <a href="/host/login" class="text-sm text-gray-500 hover:text-gray-400 mb-6 inline-block">← 返回登录</a>

    <h1 class="text-2xl font-bold text-white mb-2">忘记密码</h1>
    <p class="text-gray-400 text-sm mb-6">输入用户名或注册邮箱，我们会发送重置链接</p>

    {#if sent}
      <div class="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
        <div class="text-3xl mb-3">📧</div>
        <p class="text-green-400 text-sm">如果该账号已注册，重置链接已发送（开发环境中请查看后端终端日志）</p>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="login" class="block text-sm text-gray-400 mb-1">用户名或邮箱</label>
          <input id="login" type="text" bind:value={username} required
            class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
        </div>
        {#if error}
          <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">{error}</div>
        {/if}
        <Button type="submit" variant="primary" fullWidth disabled={loading}>
          {#if loading}<Spinner size="sm" class="mr-2" />{/if}
          发送重置链接
        </Button>
      </form>
    {/if}
  </div>
</div>
