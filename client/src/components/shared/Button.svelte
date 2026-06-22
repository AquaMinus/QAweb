<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'danger' | 'play';
    fullWidth?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit';
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }

  let {
    variant = 'primary',
    fullWidth = false,
    disabled = false,
    type = 'button',
    onclick,
    children,
  }: Props = $props();
</script>

<button
  {type}
  {disabled}
  onclick={onclick}
  class={[
    'inline-flex items-center justify-center rounded-xl px-6 py-3 text-base font-semibold transition-all duration-200 active:scale-95 cursor-pointer',
    fullWidth ? 'w-full' : '',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/25',
      secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600',
      danger: 'bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-500/25',
      play: 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/25 text-lg py-4',
    }[variant],
  ].filter(Boolean).join(' ')}
>
  {@render children()}
</button>
