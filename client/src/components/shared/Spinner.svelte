<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  }

  let { size = 'md', class: extraClass = '' }: Props = $props();
</script>

<div class={['flex items-center justify-center', extraClass]}>
  <div class={[
    'animate-spin rounded-full border-2 border-gray-600 border-t-indigo-400',
    { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size],
  ]}></div>
</div>
