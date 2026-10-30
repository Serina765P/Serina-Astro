<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { fetchAssets, renameAssetPrefix, saveAssets } from '../api.js';
import { errorMessage } from '../errors.js';

const toast = useToast();

const CODE_PATTERN = /^[a-z0-9]+_[\p{L}\p{N}_-]+$/u;
const PREFIX_PATTERN = /^[a-z0-9]+$/u;
const ALL_SETS = '__all';

const status = ref('loading');
const statusMessage = ref('');
const saving = ref(false);

const kind = ref('emoji');
const query = ref('');
const activeSet = ref(ALL_SETS);
const onlyDirty = ref(false);

const data = ref({ emoji: [], stickers: [] });
const usage = ref({});
const records = reactive({ emoji: [], sticker: [] });
const setLabels = reactive({});
const lastWarnings = ref([]);

const prefixModal = reactive({
  open: false,
  kind: 'emoji',
  set: '',
  newPrefix: '',
  count: 0,
  submitting: false,
  error: '',
});

const usageModal = reactive({
  open: false,
  code: '',
  refs: [],
});

const preRenameModal = reactive({
  open: false,
  affected: [],
});

function assetSlug(label) {
  return label.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/gu, '');
}

function deriveCode(set, label) {
  return `${set}_${assetSlug(label)}`;
}

function formatKeywords(keywords) {
  if (Array.isArray(keywords)) {
    return keywords.join(', ');
  }
  return String(keywords ?? '');
}

function hydrate(assetKind, list) {
  records[assetKind] = list.map((record) => {
    const kw = formatKeywords(record.keywords);
    return {
      ...record,
      nextCode: record.code,
      label: record.label,
      keywords: kw,
      follow: true,
      error: '',
      original: {
        label: record.label,
        nextCode: record.code,
        keywords: kw,
      },
    };
  });
  for (const record of list) {
    if (setLabels[record.set] === undefined) {
      setLabels[record.set] = record.setLabel;
    }
  }
}

function refreshErrors() {
  const counts = new Map();
  for (const k of ['emoji', 'sticker']) {
    for (const item of records[k]) {
      counts.set(item.nextCode, (counts.get(item.nextCode) ?? 0) + 1);
    }
  }

  for (const k of ['emoji', 'sticker']) {
    for (const item of records[k]) {
      const labelTrimmed = item.label.trim();
      if (!labelTrimmed) {
        item.error = '名称不能为空';
      } else if (labelTrimmed.length > 40) {
        item.error = '名称最多 40 字';
      } else if (!CODE_PATTERN.test(item.nextCode)) {
        item.error = '短代码格式无效（仅支持小写字母、数字、下划线与中横线）';
      } else if (!item.nextCode.startsWith(`${item.set}_`)) {
        item.error = `必须以 ${item.set}_ 开头`;
      } else if (counts.get(item.nextCode) > 1) {
        item.error = '短代码冲突';
      } else {
        item.error = '';
      }
    }
  }
}

function isItemDirty(item) {
  return (
    item.label !== item.original.label ||
    item.nextCode !== item.original.nextCode ||
    item.keywords !== item.original.keywords ||
    setLabels[item.set] !== item.setLabel
  );
}

const currentList = computed(() => records[kind.value] || []);

const setOptions = computed(() => {
  const sets = new Map();
  for (const item of currentList.value) {
    if (!sets.has(item.set)) {
      sets.set(item.set, setLabels[item.set] || item.setLabel || item.set);
    }
  }
  return [
    { value: ALL_SETS, label: '全部套装' },
    ...[...sets].map(([value, label]) => ({ value, label })),
  ];
});

function switchKind(newKind) {
  if (kind.value === newKind) return;
  kind.value = newKind;
  activeSet.value = ALL_SETS;
  query.value = '';
}

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase();
  return currentList.value.filter((item) => {
    if (activeSet.value !== ALL_SETS && item.set !== activeSet.value) return false;
    if (onlyDirty.value && !isItemDirty(item)) return false;
    if (!q) return true;
    const haystack = [
      item.code,
      item.nextCode,
      item.label,
      item.set,
      setLabels[item.set] || '',
      item.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
});

const groups = computed(() => {
  const bySet = new Map();
  for (const item of filteredItems.value) {
    if (!bySet.has(item.set)) {
      bySet.set(item.set, {
        set: item.set,
        setLabel: setLabels[item.set] || item.setLabel || item.set,
        items: [],
      });
    }
    bySet.get(item.set).items.push(item);
  }
  return [...bySet.values()];
});

const conflicts = computed(() => {
  let count = 0;
  for (const item of currentList.value) {
    if (item.error) count += 1;
  }
  return count;
});

const currentDirtyCount = computed(() => {
  let count = 0;
  for (const item of currentList.value) {
    if (isItemDirty(item)) count += 1;
  }
  return count;
});

const totalDirtyCount = computed(() => {
  let count = 0;
  for (const k of ['emoji', 'sticker']) {
    for (const item of records[k]) {
      if (isItemDirty(item)) count += 1;
    }
  }
  return count;
});

const dirty = computed(() => totalDirtyCount.value > 0);

const canSave = computed(() => currentDirtyCount.value > 0 && conflicts.value === 0 && !saving.value);

const footerState = computed(() => {
  if (status.value === 'error') {
    return { color: 'error', icon: 'i-lucide-alert-circle', text: '读取失败' };
  }
  if (saving.value) {
    return { color: 'neutral', icon: 'i-lucide-loader-circle', text: '保存中…' };
  }
  if (conflicts.value > 0) {
    return {
      color: 'error',
      icon: 'i-lucide-alert-circle',
      text: `${conflicts.value} 处短代码错误或冲突`,
    };
  }
  if (currentDirtyCount.value > 0) {
    return {
      color: 'warning',
      icon: 'i-lucide-pencil-line',
      text: `${currentDirtyCount.value} 处未保存的修改`,
    };
  }
  if (totalDirtyCount.value > 0) {
    return {
      color: 'warning',
      icon: 'i-lucide-pencil-line',
      text: `另有 ${totalDirtyCount.value} 处其他分类的修改`,
    };
  }
  return { color: 'success', icon: 'i-lucide-check', text: '已与磁盘同步' };
});

function onLabelChange(item) {
  if (item.follow) {
    item.nextCode = deriveCode(item.set, item.label);
  }
  // 关键词同步：若关键词中包含旧名称，同步替换为新名称
  if (item.original.label && item.keywords.includes(item.original.label)) {
    item.keywords = item.keywords
      .split(/[,，、]+/u)
      .map((w) => (w.trim() === item.original.label ? item.label.trim() : w.trim()))
      .filter(Boolean)
      .join(', ');
  }
  refreshErrors();
}

function onCodeChange(item) {
  item.follow = false;
  refreshErrors();
}

function toggleFollow(item) {
  item.follow = !item.follow;
  if (item.follow) {
    item.nextCode = deriveCode(item.set, item.label);
  }
  refreshErrors();
}

function resetCode(item) {
  item.follow = true;
  item.nextCode = deriveCode(item.set, item.label);
  refreshErrors();
}

function resetItem(item) {
  item.label = item.original.label;
  item.nextCode = item.original.nextCode;
  item.keywords = item.original.keywords;
  item.follow = true;
  refreshErrors();
}

function resetAll() {
  for (const item of currentList.value) {
    resetItem(item);
  }
  toast.add({ title: '已撤回当前类型的未保存修改', color: 'neutral' });
}

function openUsage(code) {
  usageModal.code = code;
  usageModal.refs = usage.value[code] || [];
  usageModal.open = true;
}

function openPrefix(set) {
  const count = records[kind.value].filter((item) => item.set === set).length;
  prefixModal.kind = kind.value;
  prefixModal.set = set;
  prefixModal.newPrefix = set;
  prefixModal.count = count;
  prefixModal.error = '';
  prefixModal.open = true;
}

async function submitPrefix() {
  const prefix = prefixModal.newPrefix.trim();
  if (!PREFIX_PATTERN.test(prefix)) {
    prefixModal.error = '前缀只能使用小写英文字母和数字';
    return;
  }
  if (prefix === prefixModal.set) {
    prefixModal.error = '新前缀与当前前缀相同';
    return;
  }

  prefixModal.submitting = true;
  prefixModal.error = '';
  try {
    const result = await renameAssetPrefix({
      kind: prefixModal.kind,
      set: prefixModal.set,
      prefix,
    });
    hydrate(prefixModal.kind, result.records);
    usage.value = result.usage || {};
    refreshErrors();
    prefixModal.open = false;
    lastWarnings.value = result.warnings || [];
    const filesCount = prefixModal.count * (prefixModal.kind === 'sticker' ? 2 : 1);
    toast.add({
      title: '前缀修改成功',
      description: `套装 ${prefixModal.set} 已更名为 ${prefix}，两阶段重命名了 ${filesCount} 个文件。`,
      color: 'success',
    });
  } catch (error) {
    prefixModal.error = errorMessage(error);
  } finally {
    prefixModal.submitting = false;
  }
}

async function load() {
  status.value = 'loading';
  statusMessage.value = '';
  try {
    const payload = await fetchAssets();
    data.value = payload;
    usage.value = payload.usage || {};
    hydrate('emoji', payload.emoji || []);
    hydrate('sticker', payload.stickers || []);
    refreshErrors();
    status.value = 'ready';
  } catch (error) {
    status.value = 'error';
    statusMessage.value = errorMessage(error);
  }
}

async function refresh() {
  await load();
  toast.add({ title: '素材数据与引用已刷新', color: 'neutral' });
}

function onSaveClick() {
  if (!canSave.value) return;

  // 重命名前全站引用预警检查
  const affected = currentList.value
    .filter((item) => isItemDirty(item) && item.nextCode !== item.code && (usage.value[item.code]?.length > 0))
    .map((item) => ({
      code: item.code,
      nextCode: item.nextCode,
      refs: usage.value[item.code] || [],
    }));

  if (affected.length > 0) {
    preRenameModal.affected = affected;
    preRenameModal.open = true;
    return;
  }

  performSave();
}

async function performSave() {
  preRenameModal.open = false;
  saving.value = true;
  lastWarnings.value = [];
  try {
    const items = currentList.value
      .filter((item) => isItemDirty(item))
      .map((item) => ({
        code: item.code,
        nextCode: item.nextCode,
        label: item.label,
        keywords: item.keywords,
      }));

    const result = await saveAssets({
      kind: kind.value,
      items,
      setLabels: { ...setLabels },
    });

    hydrate(kind.value, result.records);
    usage.value = result.usage || {};
    refreshErrors();
    lastWarnings.value = result.warnings || [];

    if (result.warnings?.length > 0) {
      toast.add({
        title: '素材已保存，但有正文仍引用旧短代码',
        description: `共 ${result.warnings.length} 处引用待处理，详情见页面顶部预警`,
        color: 'warning',
      });
    } else {
      toast.add({ title: '素材已成功保存到磁盘', color: 'success' });
    }
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: errorMessage(error),
      color: 'error',
    });
  } finally {
    saving.value = false;
  }
}

function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (canSave.value) onSaveClick();
  }
}

function onBeforeUnload(event) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}

onBeforeRouteLeave((to, from, next) => {
  if (dirty.value) {
    const answer = window.confirm('素材管理中有未保存的修改，确定离开吗？未保存的内容将丢失。');
    if (!answer) {
      next(false);
      return;
    }
  }
  next();
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
  load();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<template>
  <UDashboardPanel id="assets">
    <template #header>
      <UDashboardNavbar title="素材管理">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UBadge color="neutral" variant="subtle" icon="i-lucide-images">
              {{ records.emoji.length }} 表情 · {{ records.sticker.length }} 贴纸
            </UBadge>
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              square
              aria-label="刷新素材与引用"
              :loading="status === 'loading'"
              @click="refresh"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="max-w-6xl py-6">
        <div v-if="status === 'loading'" class="space-y-6" role="status">
          <USkeleton class="h-20 w-full rounded-xl" />
          <USkeleton class="h-64 w-full rounded-xl" />
          <USkeleton class="h-64 w-full rounded-xl" />
        </div>

        <div v-else-if="status === 'error'" class="space-y-4">
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            title="读取素材失败"
            :description="statusMessage"
          />
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="重新读取"
            @click="load"
          />
        </div>

        <div v-else class="space-y-6">
          <UAlert
            v-if="lastWarnings.length > 0"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="`有 ${lastWarnings.length} 处正文仍引用了被修改的旧短代码`"
          >
            <template #description>
              <ul class="mt-2 list-disc space-y-1 pl-4 text-xs">
                <li v-for="(warn, i) in lastWarnings" :key="i">{{ warn }}</li>
              </ul>
            </template>
          </UAlert>

          <!-- 筛选与控制栏 -->
          <UCard>
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div class="flex items-center gap-2">
                <UButton
                  type="button"
                  icon="i-lucide-smile"
                  :label="`表情 (${records.emoji.length})`"
                  :color="kind === 'emoji' ? 'primary' : 'neutral'"
                  :variant="kind === 'emoji' ? 'subtle' : 'ghost'"
                  @click="switchKind('emoji')"
                />
                <UButton
                  type="button"
                  icon="i-lucide-sticker"
                  :label="`贴纸 (${records.sticker.length})`"
                  :color="kind === 'sticker' ? 'primary' : 'neutral'"
                  :variant="kind === 'sticker' ? 'subtle' : 'ghost'"
                  @click="switchKind('sticker')"
                />
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <UInput
                  v-model="query"
                  icon="i-lucide-search"
                  placeholder="按名称、短代码或关键词搜索…"
                  clearable
                  class="w-64"
                />
                <USelect
                  v-model="activeSet"
                  :items="setOptions"
                  class="w-44"
                  aria-label="按套装筛选"
                />
                <UCheckbox
                  v-model="onlyDirty"
                  :label="`只看已修改 (${currentDirtyCount})`"
                />
              </div>
            </div>
          </UCard>

          <!-- 套装列表 -->
          <div v-if="groups.length === 0" class="py-12 text-center text-sm text-muted">
            没有找到匹配的素材条目
          </div>

          <div v-else class="space-y-6">
            <UCard v-for="group in groups" :key="group.set" class="overflow-hidden">
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <UBadge color="neutral" variant="subtle" size="sm">
                      {{ group.set }}_*
                    </UBadge>
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs text-muted">套装显示名：</span>
                      <UInput
                        v-model="setLabels[group.set]"
                        size="xs"
                        class="w-40"
                        placeholder="例如 偶像大师百万现场"
                        @input="refreshErrors"
                      />
                    </div>
                    <span class="text-xs text-muted">共 {{ group.items.length }} 项</span>
                  </div>

                  <UButton
                    size="xs"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-pencil"
                    label="修改前缀"
                    @click="openPrefix(group.set)"
                  />
                </div>
              </template>

              <!-- 素材图鉴网格 -->
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                <div
                  v-for="item in group.items"
                  :key="item.code"
                  class="flex flex-col justify-between rounded-xl border p-3.5 transition-shadow hover:shadow-sm"
                  :class="[
                    isItemDirty(item)
                      ? 'border-primary/50 bg-primary/5 dark:bg-primary/10'
                      : 'border-line bg-surface',
                  ]"
                >
                  <!-- 预览区 -->
                  <div class="relative flex h-32 items-center justify-center rounded-lg bg-surface-2/60 p-2">
                    <img
                      :src="item.previewUrl"
                      :alt="item.label"
                      class="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />

                    <!-- 引用徽标 -->
                    <div class="absolute right-2 top-2">
                      <UBadge
                        v-if="usage[item.code]?.length > 0"
                        color="warning"
                        variant="subtle"
                        size="xs"
                        class="cursor-pointer"
                        @click="openUsage(item.code)"
                      >
                        引用 {{ usage[item.code].length }} 处
                      </UBadge>
                      <UBadge v-else color="neutral" variant="subtle" size="xs">
                        未引用
                      </UBadge>
                    </div>

                    <!-- 尺寸提示 -->
                    <div
                      v-if="item.width > 0 && item.height > 0"
                      class="absolute bottom-1 left-2 text-[10px] text-muted tabular-nums"
                    >
                      {{ item.width }}×{{ item.height }}
                    </div>
                  </div>

                  <!-- 表单编辑区 -->
                  <div class="mt-3 space-y-2.5">
                    <div>
                      <div class="flex items-center justify-between text-xs text-muted">
                        <span>显示名</span>
                        <UBadge
                          v-if="item.label !== item.original.label"
                          color="warning"
                          variant="subtle"
                          size="xs"
                        >
                          已改名
                        </UBadge>
                      </div>
                      <UInput
                        v-model="item.label"
                        size="xs"
                        class="mt-1 w-full"
                        placeholder="显示名称"
                        @input="onLabelChange(item)"
                      />
                    </div>

                    <div>
                      <div class="flex items-center justify-between text-xs text-muted">
                        <span>短代码</span>
                        <div class="flex items-center gap-1">
                          <UButton
                            size="xs"
                            :icon="item.follow ? 'i-lucide-link' : 'i-lucide-link-2-off'"
                            :color="item.follow ? 'primary' : 'neutral'"
                            variant="ghost"
                            :title="item.follow ? '已关联显示名自动派生' : '已断开关联，手动编辑'"
                            square
                            @click="toggleFollow(item)"
                          />
                          <UButton
                            v-if="!item.follow"
                            size="xs"
                            icon="i-lucide-rotate-ccw"
                            color="neutral"
                            variant="ghost"
                            title="恢复自动派生"
                            square
                            @click="resetCode(item)"
                          />
                        </div>
                      </div>
                      <UInput
                        v-model="item.nextCode"
                        size="xs"
                        class="mt-1 w-full font-mono"
                        :color="item.error ? 'error' : undefined"
                        @input="onCodeChange(item)"
                      />
                      <p v-if="item.error" class="mt-0.5 text-[11px] text-error">
                        {{ item.error }}
                      </p>
                    </div>

                    <div>
                      <div class="flex items-center justify-between text-xs text-muted">
                        <span>关键词</span>
                        <span class="text-[10px] text-muted">逗号分隔</span>
                      </div>
                      <UInput
                        v-model="item.keywords"
                        size="xs"
                        class="mt-1 w-full"
                        placeholder="标签/检索词"
                        @input="refreshErrors"
                      />
                    </div>
                  </div>

                  <!-- 条目底栏操作 -->
                  <div
                    v-if="isItemDirty(item)"
                    class="mt-3 flex items-center justify-between border-t border-line/60 pt-2"
                  >
                    <span class="text-[11px] text-warning font-medium">已做修改</span>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      label="撤销"
                      @click="resetItem(item)"
                    />
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </UContainer>
    </template>

    <template #footer>
      <div class="flex items-center justify-between border-t border-line bg-surface px-6 py-3">
        <div class="flex items-center gap-2">
          <UBadge :color="footerState.color" variant="subtle" :icon="footerState.icon">
            {{ footerState.text }}
          </UBadge>
        </div>

        <div class="flex items-center gap-3">
          <UButton
            v-if="currentDirtyCount > 0"
            type="button"
            color="neutral"
            variant="outline"
            label="放弃修改"
            :disabled="saving"
            @click="resetAll"
          />
          <UButton
            type="button"
            color="primary"
            icon="i-lucide-save"
            :label="saving ? '正在写入…' : '保存修改 (Ctrl+S)'"
            :loading="saving"
            :disabled="!canSave"
            @click="onSaveClick"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- 重命名前引用预警弹窗 -->
  <UModal
    v-model:open="preRenameModal.open"
    title="短代码重命名预警"
    description="即将修改在正文或说说明确引用的短代码，可能导致旧引用失效。"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="检测到全站正文引用"
          description="以下短代码已被正文或说说引用。重命名后旧短代码将不再渲染为素材，请在重命名后根据清单前往文章更新。"
        />

        <div class="space-y-3">
          <div
            v-for="aff in preRenameModal.affected"
            :key="aff.code"
            class="rounded-lg border border-line bg-surface-2/50 p-3"
          >
            <div class="font-mono text-xs font-semibold text-foreground">
              :{{ aff.code }}: → :{{ aff.nextCode }}:
            </div>
            <ul class="mt-1.5 space-y-1 font-mono text-[11px] text-muted">
              <li v-for="(refPath, i) in aff.refs" :key="i">
                {{ refPath }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="放弃"
          @click="preRenameModal.open = false"
        />
        <UButton
          color="primary"
          label="确认继续保存并更名"
          :loading="saving"
          @click="performSave"
        />
      </div>
    </template>
  </UModal>

  <!-- 修改前缀弹窗 -->
  <UModal
    v-model:open="prefixModal.open"
    title="修改套装前缀"
    description="批量重命名该套装下的全部短代码与文件。"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`将影响 ${prefixModal.count} 个素材文件`"
          description="将执行两阶段安全重命名。如果正文或说说明确引用了旧短代码，修改后旧代码会失效，系统将给出引用清单。"
        />

        <div>
          <label class="text-xs font-medium text-foreground">当前套装代码</label>
          <div class="mt-1 font-mono text-sm text-muted">{{ prefixModal.set }}</div>
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">新前缀（小写字母与数字）</label>
          <UInput
            v-model="prefixModal.newPrefix"
            placeholder="例如 million"
            class="mt-1 w-full font-mono"
            :disabled="prefixModal.submitting"
          />
          <p v-if="prefixModal.error" class="mt-1 text-xs text-error">
            {{ prefixModal.error }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="取消"
          :disabled="prefixModal.submitting"
          @click="prefixModal.open = false"
        />
        <UButton
          color="primary"
          label="确认修改"
          :loading="prefixModal.submitting"
          @click="submitPrefix"
        />
      </div>
    </template>
  </UModal>

  <!-- 引用详情弹窗 -->
  <UModal
    v-model:open="usageModal.open"
    :title="`短代码 :${usageModal.code}: 的全站引用`"
    :description="`共找到 ${usageModal.refs.length} 处引用`"
  >
    <template #body>
      <div class="space-y-2">
        <div v-if="usageModal.refs.length === 0" class="py-4 text-center text-sm text-muted">
          全站正文与说说未引用该短代码。
        </div>
        <ul v-else class="max-h-80 space-y-2 overflow-y-auto font-mono text-xs">
          <li
            v-for="(refItem, i) in usageModal.refs"
            :key="i"
            class="flex items-center justify-between rounded bg-surface-2 px-3 py-2 text-foreground"
          >
            <span>{{ refItem }}</span>
          </li>
        </ul>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <UButton color="neutral" variant="ghost" label="关闭" @click="usageModal.open = false" />
      </div>
    </template>
  </UModal>
</template>
