<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authApi, ApiError } from '$lib/api';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';

  // Token can be passed via query param: /host/reset-password?token=xxx
  let token = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let success = $state(false);
  let error = $state('');
  let loading = $state(false);

  $effect(() => {
    token = $page.url.searchParams.get('token') || '';
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (newPassword !== confirmPassword) {
      error = '两次输入的密码不一致';
      return;
    }
    if (newPassword.length < 6) {
      error = '新密码至少6位';
      return;
    }
    loading = true;
    try {
      await authApi.resetPassword(token, newPassword);
      success = true;
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.code === 'TOKEN_EXPIRED' ? '链接已过期' : err.code === 'INVALID_TOKEN' ? '链接无效或已使用' : err.message;
      } else {
        error = '重置失败';
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] flex items-center justify-center px-4">
  <div class="max-w-sm w-full">
    <a href="/host/login" class="text-sm text-gray-500 hover:text-gray-400 mb-6 inline-block">← 返回登录</a>

    <h1 class="text-2xl font-bold text-white mb-6">重置密码</h1>

    {#if success}
      <div class="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
        <div class="text-3xl mb-3">✅</div>
        <p class="text-green-400 text-sm mb-4">密码重置成功</p>
        <Button variant="primary" fullWidth onclick={() => goto('/host/login')}>去登录</Button>
      </div>
    {:else if !token}
      <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p class="text-red-400 text-sm">缺少重置令牌，请从邮件中的链接访问此页面</p>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="new1" class="block text-sm text-gray-400 mb-1">新密码</label>
          <input id="new1" type="password" bind:value={newPassword} required minlength="6" placeholder="至少6位"
            class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
        </div>
        <div>
          <label for="new2" class="block text-sm text-gray-400 mb-1">确认新密码</label>
          <input id="new2" type="password" bind:value={confirmPassword} required
            class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
        </div>
        {#if error}
          <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">{error}</div>
        {/if}
        <Button type="submit" variant="primary" fullWidth disabled={loading}>
          {#if loading}<Spinner size="sm" class="mr-2" />{/if}
          重置密码
        </Button>
      </form>
    {/if}
  </div>
</div>
