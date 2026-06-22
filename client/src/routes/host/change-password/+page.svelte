<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { authApi, ApiError } from '$lib/api';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';
  import { onMount } from 'svelte';

  let oldPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let message = $state('');
  let error = $state('');
  let loading = $state(false);

  onMount(() => {
    if (!auth.isLoggedIn) goto('/host/login');
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    message = '';

    if (newPassword !== confirmPassword) {
      error = '两次输入的新密码不一致';
      return;
    }
    if (newPassword.length < 6) {
      error = '新密码至少6位';
      return;
    }

    loading = true;
    try {
      await authApi.changePassword(oldPassword, newPassword);
      message = '密码修改成功';
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.code === 'WRONG_PASSWORD' ? '当前密码不正确' : err.message;
      } else {
        error = '修改失败';
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-dvh bg-[var(--color-bg)] px-4 py-8">
  <div class="max-w-sm mx-auto">
    <a href="/host/profile" class="text-sm text-gray-500 hover:text-gray-400 mb-6 inline-block">← 返回个人信息</a>

    <h1 class="text-2xl font-bold text-white mb-6">修改密码</h1>

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label for="old" class="block text-sm text-gray-400 mb-1">当前密码</label>
        <input id="old" type="password" bind:value={oldPassword} required
          class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
      </div>
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

      {#if message}
        <div class="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-green-400 text-sm">{message}</div>
      {/if}
      {#if error}
        <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">{error}</div>
      {/if}

      <Button type="submit" variant="primary" fullWidth disabled={loading}>
        {#if loading}<Spinner size="sm" class="mr-2" />{/if}
        修改密码
      </Button>
    </form>
  </div>
</div>
