import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * 跟随 Nuxt UI 的明暗主题：直接观察 <html class="dark">，避免另建一份 @vueuse 状态，
 * 点击侧栏 UColorModeButton 后 md-editor-v3 的 theme 能立即同步。
 */
export function useDarkMode() {
  const isDark = ref(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  let observer = null;
  const sync = () => {
    isDark.value = document.documentElement.classList.contains('dark');
  };

  onMounted(() => {
    sync();
    observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return isDark;
}
