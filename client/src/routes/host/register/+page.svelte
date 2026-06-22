<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { authApi, ApiError } from '$lib/api';
  import Button from '$components/shared/Button.svelte';
  import Spinner from '$components/shared/Spinner.svelte';

  let email = $state('');
  let displayName = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';

    if (password !== confirmPassword) {
      error = '两次输入的密码不一致';
      return;
    }
    if (password.length < 6) {
      error = '密码长度至少6位';
      return;
    }

    loading = true;

    try {
      const res = await authApi.register(email, password, displayName);
      auth.setAuth(res.host, res.token);
      goto('/host/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_TAKEN') {
          error = '该邮箱已被注册';
        } else {
          error = err.message;
        }
      } else {
        error = '注册失败，请重试';
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-dvh flex items-center justify-center px-4 bg-[var(--color-bg)]">
  <div class="max-w-sm w-full">
    <a href="/" class="block text-center mb-8">
      <h1 class="text-3xl font-bold text-white">QAweb</h1>
      <p class="text-gray-400 text-sm mt-1">创建主持人账号</p>
    </a>

    <form onsubmit={handleSubmit} class="space-y-4">
      <!-- Display Name -->
      <div>
        <label for="name" class="block text-sm text-gray-400 mb-1">昵称</label>
        <input
          id="name"
          type="text"
          bind:value={displayName}
          required
          placeholder="你的昵称"
          class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      <!-- Email -->
      <div>
        <label for="email" class="block text-sm text-gray-400 mb-1">邮箱</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          required
          placeholder="your@email.com"
          class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      <!-- Password -->
      <div>
        <label for="password" class="block text-sm text-gray-400 mb-1">密码</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          placeholder="至少6位密码"
          class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      <!-- Confirm Password -->
      <div>
        <label for="confirm" class="block text-sm text-gray-400 mb-1">确认密码</label>
        <input
          id="confirm"
          type="password"
          bind:value={confirmPassword}
          required
          placeholder="再次输入密码"
          class="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      <!-- Error -->
      {#if error}
        <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">
          {error}
        </div>
      {/if}

      <!-- Submit -->
      <Button type="submit" variant="primary" fullWidth disabled={loading}>
        {#if loading}
          <Spinner size="sm" class="mr-2" />
          注册中...
        {:else}
          注册
        {/if}
      </Button>
    </form>

    <p class="mt-6 text-center text-sm text-gray-500">
      已有账号？
      <a href="/host/login" class="text-indigo-400 hover:text-indigo-300 ml-1">立即登录</a>
    </p>

    <p class="mt-3 text-center">
      <a href="/" class="text-sm text-gray-600 hover:text-gray-400">← 返回首页</a>
    </p>
  </div>
</div>
