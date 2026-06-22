<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import Button from '$components/shared/Button.svelte';
</script>

<div class="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--color-bg)]">
  <div class="text-center max-w-md w-full">
    <!-- Logo / Title -->
    <div class="mb-8">
      <h1 class="text-5xl font-bold text-white mb-2 tracking-tight">QAweb</h1>
      <p class="text-lg text-gray-400">在线互动答题平台</p>
    </div>

    <!-- Action Cards -->
    <div class="space-y-4">
      {#if auth.isLoggedIn}
        <!-- Host flow -->
        <p class="text-sm text-gray-400 mb-2">
          已登录：{auth.host?.displayName}
        </p>
        <Button variant="primary" fullWidth onclick={() => goto('/host/dashboard')}>
          进入控制台
        </Button>
        <Button variant="secondary" fullWidth onclick={() => goto('/host/room/create')}>
          创建答题房间
        </Button>
      {:else}
        <!-- Not logged in -->
        <Button variant="primary" fullWidth onclick={() => goto('/host/login')}>
          主持人登录
        </Button>
        <Button variant="secondary" fullWidth onclick={() => goto('/host/register')}>
          注册主持人账号
        </Button>
      {/if}

      <!-- Divider -->
      <div class="flex items-center gap-3 my-6">
        <div class="flex-1 h-px bg-gray-700"></div>
        <span class="text-gray-500 text-sm">或者</span>
        <div class="flex-1 h-px bg-gray-700"></div>
      </div>

      <!-- Player flow -->
      <Button variant="play" fullWidth onclick={() => goto('/play')}>
        加入游戏
      </Button>
    </div>

    <!-- Footer -->
    <p class="mt-12 text-xs text-gray-600">
      扫码或输入 PIN 码加入 · 无需注册
    </p>
  </div>
</div>
