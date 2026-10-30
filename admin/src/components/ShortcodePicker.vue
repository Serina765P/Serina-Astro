<script setup>
import { computed, ref, watch } from 'vue';
import { fetchAssets } from '../api.js';
import { errorMessage } from '../errors.js';

const open = defineModel('open', { type: Boolean, default: false });
const emit = defineEmits(['select']);

const KINDS = [
  { value: 'emoji', label: '表情', icon: 'i-lucide-smile' },
  { value: 'sticker', label: '贴纸', icon: 'i-lucide-sticker' },
];
const ALL_SETS = '__all';

const status = ref('idle');
const statusMessage = ref('');
const data = ref({ emoji: [], stickers: [] });
const kind = ref('emoji');
const query = ref('');
const activeSet = ref(ALL_SETS);

const currentItems = computed(() => {
  const key = kind.value === 'sticker' ? 'stickers' : 'emoji';
  return Array.isArray(data.value[key]) ? data.value[key] : [];
});

const setOptions = computed(() => {
  const sets = new Map();
  for (const item of currentItems.value) {
    if (!sets.has(item.set)) sets.set(item.set, item.setLabel || item.set);
  }
  return [
    { value: ALL_SETS, label: '全部套装' },
    ...[...sets].map(([value, label]) => ({ value, label })),
  ];
});

const filteredItems = computed(() => {
  const words = query.value
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
  return currentItems.value.filter((item) => {
    if (activeSet.value !== ALL_SETS && item.set !== activeSet.value) return false;
    if (words.length === 0) return true;
    const haystack = [item.code, item.label, item.set, item.setLabel, ...item.keywords]
      .join('\n')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
});

const groups = computed(() => {
  const grouped = new Map();
  for (const item of filteredItems.value) {
    if (!grouped.has(item.set)) {
      grouped.set(item.set, { set: item.set, label: item.setLabel || item.set, items: [] });
    }
    grouped.get(item.set).items.push(item);
  }
  return [...grouped.values()];
});

async function load() {
  if (status.value === 'loading') return;
  status.value = 'loading';
  statusMessage.value = '';
  try {
    const payload = await fetchAssets();
    data.value = {
      emoji: Array.isArray(payload.emoji) ? payload.emoji : [],
      stickers: Array.isArray(payload.stickers) ? payload.stickers : [],
    };
    status.value = 'ready';
  } catch (error) {
    statusMessage.value = errorMessage(error, '读取素材失败');
    status.value = 'error';
  }
}

watch(open, (value) => {
  if (value && status.value === 'idle') void load();
  if (value) query.value = '';
});

watch(kind, () => {
  activeSet.value = ALL_SETS;
});

function choose(item) {
  emit('select', item.code);
  open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="插入短代码"
    description="选择表情或贴纸，短代码会插入到编辑器当前光标处。"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-for="option in KINDS"
            :key="option.value"
            type="button"
            :icon="option.icon"
            :label="option.label"
            :color="kind === option.value ? 'primary' : 'neutral'"
            :variant="kind === option.value ? 'subtle' : 'ghost'"
            @click="kind = option.value"
          />
          <div class="ml-auto flex items-center gap-2">
            <UBadge v-if="status === 'ready'" color="neutral" variant="subtle">
              {{ filteredItems.length }} 项
            </UBadge>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            placeholder="搜索名称、短代码或关键词"
            clearable
            class="w-full"
            aria-label="搜索短代码"
            autofocus
          />
          <USelect
            v-model="activeSet"
            :items="setOptions"
            class="w-full"
            aria-label="按套装筛选短代码"
          />
        </div>

        <div v-if="status === 'loading'" class="grid grid-cols-3 gap-3 sm:grid-cols-5" role="status">
          <USkeleton v-for="index in 10" :key="index" class="h-28 rounded-lg" />
        </div>

        <div v-else-if="status === 'error'" class="space-y-3">
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            title="读取素材注册表失败"
            :description="statusMessage"
          />
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="重试"
            @click="load"
          />
        </div>

        <div
          v-else-if="filteredItems.length === 0"
          class="rounded-lg border border-dashed border-default py-10 text-center text-sm text-muted"
        >
          没有匹配的{{ kind === 'emoji' ? '表情' : '贴纸' }}。
        </div>

        <div v-else class="max-h-[52vh] space-y-5 overflow-y-auto pr-1">
          <section v-for="group in groups" :key="group.set" class="space-y-2">
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-semibold tracking-wide text-muted uppercase">
                {{ group.label }}
              </h3>
              <UBadge color="neutral" variant="outline" size="sm">{{ group.set }}</UBadge>
              <span class="text-[11px] text-muted">{{ group.items.length }} 项</span>
            </div>
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              <button
                v-for="item in group.items"
                :key="item.code"
                type="button"
                class="group flex flex-col items-center gap-1.5 rounded-lg border border-default bg-elevated/40 p-2 text-center transition hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
                :title="`:${item.code}:`"
                @click="choose(item)"
              >
                <img
                  :src="item.previewUrl"
                  :alt="item.label"
                  :width="Math.min(item.width || 96, 96)"
                  :height="Math.min(item.height || 96, 96)"
                  loading="lazy"
                  class="h-16 w-16 object-contain"
                />
                <span class="line-clamp-1 text-xs font-medium text-default">{{ item.label }}</span>
                <code class="line-clamp-1 text-[10px] text-muted">:{{ item.code }}:</code>
              </button>
            </div>
          </section>
        </div>
      </div>
    </template>
    <template #footer>
      <p class="text-xs text-muted">
        点击素材即插入；短代码与站点正文共用同一份注册表，代码块与链接里不会展开。
      </p>
    </template>
  </UModal>
</template>
