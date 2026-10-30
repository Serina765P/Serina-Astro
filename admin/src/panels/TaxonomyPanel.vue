<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import {
  SLUG_PATTERN as SLUG_RE,
  SLUG_PATTERN_SOURCE,
  WASH_VALUES,
} from '../../../src/lib/taxonomy.ts';
import { fetchTaxonomy, saveTaxonomy } from '../api.js';

const toast = useToast();

const SLUG_PATTERN = SLUG_PATTERN_SOURCE;
const SLUG_HINT = '只能使用小写字母、数字与连字符，例如 comic-book';
const DEFAULT_COLOR = WASH_VALUES[0];
const WASH_LABELS = {
  'var(--wash-pink)': '粉 · wash-pink',
  'var(--wash-mist)': '雾 · wash-mist',
  'var(--wash-sage)': '鼠尾草 · wash-sage',
  'var(--wash-sand)': '沙 · wash-sand',
  'var(--wash-clay)': '陶土 · wash-clay',
  'var(--wash-rose)': '玫瑰 · wash-rose',
};
const WASH_OPTIONS = WASH_VALUES.map((value) => ({ value, label: WASH_LABELS[value] ?? value }));

const status = ref('loading');
const statusMessage = ref('');
const saving = ref(false);
const registeringKey = ref('');
const savedSnapshot = ref('');
const savedTaxonomy = ref(null);
const used = ref({ categories: [], tags: [] });
const unmapped = ref({ categories: [], tags: [] });

const draft = reactive({ categorySlugs: {}, tagSlugs: {}, categoryColors: {} });
const newCategory = reactive({ name: '', slug: '', color: DEFAULT_COLOR });
const newTag = reactive({ name: '', slug: '' });
const inlineSlugs = reactive({});

const categoryNames = computed(() => Object.keys(draft.categorySlugs));
const tagNames = computed(() => Object.keys(draft.tagSlugs));
const totalUnmapped = computed(
  () => unmapped.value.categories.length + unmapped.value.tags.length,
);
const dirty = computed(
  () => status.value === 'ready' && serialize(draft) !== savedSnapshot.value,
);

const footerState = computed(() => {
  if (status.value === 'error') {
    return { color: 'error', icon: 'i-lucide-alert-circle', text: '读取失败' };
  }
  if (saving.value) {
    return { color: 'neutral', icon: 'i-lucide-loader-circle', text: '保存中…' };
  }
  if (dirty.value) {
    return { color: 'warning', icon: 'i-lucide-pencil-line', text: '有未保存的修改' };
  }
  return { color: 'success', icon: 'i-lucide-check', text: '已与磁盘同步' };
});

function sortedMap(map) {
  return Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function serialize(taxonomy) {
  return JSON.stringify({
    categorySlugs: sortedMap(taxonomy.categorySlugs ?? {}),
    tagSlugs: sortedMap(taxonomy.tagSlugs ?? {}),
    categoryColors: sortedMap(taxonomy.categoryColors ?? {}),
  });
}

function cloneTaxonomy(taxonomy) {
  return {
    categorySlugs: { ...taxonomy.categorySlugs },
    tagSlugs: { ...taxonomy.tagSlugs },
    categoryColors: { ...taxonomy.categoryColors },
  };
}

function setDraft(taxonomy) {
  draft.categorySlugs = { ...taxonomy.categorySlugs };
  draft.tagSlugs = { ...taxonomy.tagSlugs };
  draft.categoryColors = { ...taxonomy.categoryColors };
}

function normalizeAudit(value) {
  const list = (entries) =>
    Array.isArray(entries)
      ? entries
          .filter((entry) => entry && typeof entry.name === 'string')
          .map((entry) => ({
            name: entry.name,
            count: Number.isFinite(entry.count) ? entry.count : 0,
          }))
      : [];
  return { categories: list(value?.categories), tags: list(value?.tags) };
}

function apply(data) {
  const taxonomy = cloneTaxonomy(data.taxonomy ?? {});
  for (const name of Object.keys(taxonomy.categorySlugs)) {
    if (!taxonomy.categoryColors[name]) taxonomy.categoryColors[name] = DEFAULT_COLOR;
  }
  setDraft(taxonomy);
  savedTaxonomy.value = cloneTaxonomy(taxonomy);
  savedSnapshot.value = serialize(taxonomy);
  used.value = normalizeAudit(data.used);
  unmapped.value = normalizeAudit(data.unmapped);
  status.value = 'ready';
  statusMessage.value = '';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : '操作失败';
}

function toastError(title, error) {
  toast.add({
    title,
    description: errorMessage(error),
    color: 'error',
    icon: 'i-lucide-alert-circle',
  });
}

async function load() {
  status.value = 'loading';
  statusMessage.value = '';
  try {
    apply(await fetchTaxonomy());
  } catch (error) {
    statusMessage.value = errorMessage(error);
    status.value = 'error';
  }
}

function refresh() {
  if (dirty.value && !window.confirm('有未保存的修改，重新审计会丢弃这些修改。继续？')) return;
  void load();
}

function nextColor() {
  const taken = new Set(Object.values(draft.categoryColors));
  return WASH_OPTIONS.find((option) => !taken.has(option.value))?.value ?? DEFAULT_COLOR;
}

function buildPayload() {
  const toSlugMap = (map, label) => {
    const result = {};
    const seen = new Map();
    for (const [name, rawSlug] of Object.entries(map)) {
      const slug = String(rawSlug ?? '').trim();
      if (!slug) throw new Error(`${label}「${name}」还没有填写 slug`);
      if (!SLUG_RE.test(slug)) throw new Error(`${label}「${name}」的 slug ${SLUG_HINT}`);
      if (seen.has(slug)) {
        throw new Error(`${label}「${name}」与「${seen.get(slug)}」使用了相同的 slug：${slug}`);
      }
      seen.set(slug, name);
      result[name] = slug;
    }
    return result;
  };

  const categorySlugs = toSlugMap(draft.categorySlugs, '分类');
  const tagSlugs = toSlugMap(draft.tagSlugs, '标签');
  const categoryColors = {};
  for (const name of Object.keys(categorySlugs)) {
    const color = draft.categoryColors[name] ?? DEFAULT_COLOR;
    if (!WASH_VALUES.includes(color)) throw new Error(`分类「${name}」必须选择莫兰迪配色`);
    categoryColors[name] = color;
  }
  const orphan = Object.keys(draft.categoryColors).find(
    (name) => !Object.hasOwn(categorySlugs, name),
  );
  if (orphan) throw new Error(`分类颜色「${orphan}」没有对应的分类映射`);

  return { categorySlugs, tagSlugs, categoryColors };
}

async function save() {
  if (saving.value || status.value !== 'ready' || !dirty.value) return false;
  let payload;
  try {
    payload = buildPayload();
  } catch (error) {
    toastError('无法保存', error);
    return false;
  }

  saving.value = true;
  try {
    apply(await saveTaxonomy(payload));
    toast.add({
      title: '已保存',
      description: 'src/data/taxonomy.json',
      color: 'success',
      icon: 'i-lucide-check-circle',
    });
    return true;
  } catch (error) {
    toastError('保存失败', error);
    return false;
  } finally {
    saving.value = false;
  }
}

function inlineKey(kind, name) {
  return `${kind}:${name}`;
}

async function registerUnmapped(kind, name) {
  if (saving.value) return;
  const key = inlineKey(kind, name);
  const slug = String(inlineSlugs[key] ?? '').trim();
  if (!slug) {
    toastError('无法补录', new Error(`请先为「${name}」填写英文 slug`));
    return;
  }
  if (!SLUG_RE.test(slug)) {
    toastError('无法补录', new Error(`「${name}」的 slug ${SLUG_HINT}`));
    return;
  }
  const map = kind === 'category' ? draft.categorySlugs : draft.tagSlugs;
  if (Object.values(map).includes(slug)) {
    toastError('无法补录', new Error(`slug ${slug} 已被其它${kind === 'category' ? '分类' : '标签'}占用`));
    return;
  }
  if (
    dirty.value &&
    !window.confirm('补录会连同当前面板其它未保存修改一起写入 taxonomy.json，继续？')
  ) {
    return;
  }

  registeringKey.value = key;
  if (kind === 'category') {
    draft.categorySlugs[name] = slug;
    if (!draft.categoryColors[name]) draft.categoryColors[name] = nextColor();
  } else {
    draft.tagSlugs[name] = slug;
  }

  const saved = await save();
  if (saved) delete inlineSlugs[key];
  registeringKey.value = '';
}

function addCategory() {
  if (saving.value) return;
  const name = newCategory.name.trim();
  const slug = newCategory.slug.trim();
  if (!name) {
    toastError('无法添加分类', new Error('分类名不能为空'));
    return;
  }
  if (Object.hasOwn(draft.categorySlugs, name)) {
    toastError('无法添加分类', new Error(`分类「${name}」已经在列表中`));
    return;
  }
  if (!SLUG_RE.test(slug)) {
    toastError('无法添加分类', new Error(`分类「${name}」的 slug ${SLUG_HINT}`));
    return;
  }
  if (Object.values(draft.categorySlugs).includes(slug)) {
    toastError('无法添加分类', new Error(`slug ${slug} 已被其它分类占用`));
    return;
  }
  draft.categorySlugs[name] = slug;
  draft.categoryColors[name] = newCategory.color;
  newCategory.name = '';
  newCategory.slug = '';
  newCategory.color = nextColor();
}

function addTag() {
  if (saving.value) return;
  const name = newTag.name.trim();
  const slug = newTag.slug.trim();
  if (!name) {
    toastError('无法添加标签', new Error('标签名不能为空'));
    return;
  }
  if (Object.hasOwn(draft.tagSlugs, name)) {
    toastError('无法添加标签', new Error(`标签「${name}」已经在列表中`));
    return;
  }
  if (!SLUG_RE.test(slug)) {
    toastError('无法添加标签', new Error(`标签「${name}」的 slug ${SLUG_HINT}`));
    return;
  }
  if (Object.values(draft.tagSlugs).includes(slug)) {
    toastError('无法添加标签', new Error(`slug ${slug} 已被其它标签占用`));
    return;
  }
  draft.tagSlugs[name] = slug;
  newTag.name = '';
  newTag.slug = '';
}

function isUsed(kind, name) {
  const entries = kind === 'category' ? used.value.categories : used.value.tags;
  return entries.some((entry) => entry.name === name);
}

function removeCategory(name) {
  if (
    isUsed('category', name) &&
    !window.confirm(`分类「${name}」仍有文章使用；删除映射后这些文章会降级为中文 URL。继续？`)
  ) {
    return;
  }
  delete draft.categorySlugs[name];
  delete draft.categoryColors[name];
}

function removeTag(name) {
  if (
    isUsed('tag', name) &&
    !window.confirm(`标签「${name}」仍有文章使用；删除映射后这些文章会降级为中文 URL。继续？`)
  ) {
    return;
  }
  delete draft.tagSlugs[name];
}

function reset() {
  if (savedTaxonomy.value) setDraft(savedTaxonomy.value);
}

function onKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save();
  }
}

function onBeforeUnload(event) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm('有未保存的修改，确定离开当前面板吗？');
});

onMounted(() => {
  void load();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<template>
  <UDashboardPanel id="taxonomy">
    <template #header>
      <UDashboardNavbar title="URI 对照">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UBadge color="neutral" variant="subtle" icon="i-lucide-tags">
              {{ categoryNames.length }} 分类 · {{ tagNames.length }} 标签
            </UBadge>
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              square
              aria-label="重新扫描全站词条"
              :loading="status === 'loading'"
              @click="refresh"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="max-w-5xl py-6">
        <div v-if="status === 'loading'" class="space-y-6" role="status">
          <USkeleton class="h-36 w-full rounded-xl" />
          <USkeleton class="h-72 w-full rounded-xl" />
          <USkeleton class="h-64 w-full rounded-xl" />
        </div>

        <div v-else-if="status === 'error'" class="space-y-4">
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            title="读取失败"
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
            v-if="totalUnmapped > 0"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="`${totalUnmapped} 个词条正在文章中使用，但缺少 URI 映射`"
          >
            <template #description>
              <p class="text-xs leading-5">
                这些词条发布后会降级为中文 URL。填写英文 slug 后点击「补录」，会立即保存
                当前面板的修改；分类会自动分配莫兰迪色，可在下方调整。
              </p>
              <div class="mt-4 space-y-4">
                <div v-if="unmapped.categories.length > 0" class="space-y-2">
                  <p class="text-xs font-semibold text-default">分类</p>
                  <div
                    v-for="item in unmapped.categories"
                    :key="`category-${item.name}`"
                    class="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated/50 p-2"
                  >
                    <UBadge color="warning" variant="subtle">{{ item.name }}</UBadge>
                    <span class="text-xs text-muted">{{ item.count }} 篇文章</span>
                    <UInput
                      v-model="inlineSlugs[inlineKey('category', item.name)]"
                      size="sm"
                      :pattern="SLUG_PATTERN"
                      :title="SLUG_HINT"
                      spellcheck="false"
                      autocomplete="off"
                      placeholder="english-slug"
                      class="w-40"
                      :aria-label="`分类 ${item.name} 的英文 slug`"
                      @keydown.enter.prevent="registerUnmapped('category', item.name)"
                    />
                    <UButton
                      type="button"
                      size="xs"
                      color="warning"
                      variant="subtle"
                      icon="i-lucide-plus"
                      label="补录"
                      :loading="registeringKey === inlineKey('category', item.name)"
                      :disabled="saving"
                      @click="registerUnmapped('category', item.name)"
                    />
                  </div>
                </div>

                <div v-if="unmapped.tags.length > 0" class="space-y-2">
                  <p class="text-xs font-semibold text-default">标签</p>
                  <div
                    v-for="item in unmapped.tags"
                    :key="`tag-${item.name}`"
                    class="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated/50 p-2"
                  >
                    <UBadge color="warning" variant="subtle">{{ item.name }}</UBadge>
                    <span class="text-xs text-muted">{{ item.count }} 篇文章</span>
                    <UInput
                      v-model="inlineSlugs[inlineKey('tag', item.name)]"
                      size="sm"
                      :pattern="SLUG_PATTERN"
                      :title="SLUG_HINT"
                      spellcheck="false"
                      autocomplete="off"
                      placeholder="english-slug"
                      class="w-40"
                      :aria-label="`标签 ${item.name} 的英文 slug`"
                      @keydown.enter.prevent="registerUnmapped('tag', item.name)"
                    />
                    <UButton
                      type="button"
                      size="xs"
                      color="warning"
                      variant="subtle"
                      icon="i-lucide-plus"
                      label="补录"
                      :loading="registeringKey === inlineKey('tag', item.name)"
                      :disabled="saving"
                      @click="registerUnmapped('tag', item.name)"
                    />
                  </div>
                </div>
              </div>
            </template>
          </UAlert>

          <UAlert
            v-else
            color="success"
            variant="subtle"
            icon="i-lucide-shield-check"
            title="全站词条映射完整"
            :description="`已扫描 ${used.categories.length} 个分类与 ${used.tags.length} 个标签，全部命中 taxonomy.json。`"
          />

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-highlighted">分类</h2>
                  <p class="mt-0.5 text-xs text-muted">
                    中文名映射为 <code class="rounded bg-elevated px-1 py-0.5 text-[11px]">/categories/&lt;slug&gt;/</code>，
                    并决定分类胶囊与封面占位色。
                  </p>
                </div>
                <UBadge color="neutral" variant="subtle">{{ categoryNames.length }} 个</UBadge>
              </div>
            </template>

            <p
              v-if="categoryNames.length === 0"
              class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
            >
              还没有分类映射，在下方新增。
            </p>
            <div v-else class="space-y-3">
              <div
                v-for="name in categoryNames"
                :key="name"
                class="rounded-lg border border-default bg-elevated/40 p-3"
              >
                <div
                  class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-end"
                >
                  <UFormField label="分类名">
                    <UInput
                      :model-value="name"
                      :aria-label="`分类名 ${name}`"
                      disabled
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="URL slug" required>
                    <UInput
                      v-model="draft.categorySlugs[name]"
                      :aria-label="`分类 ${name} 的 URL slug`"
                      :pattern="SLUG_PATTERN"
                      :title="SLUG_HINT"
                      spellcheck="false"
                      autocomplete="off"
                      placeholder="comic"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="莫兰迪配色">
                    <div class="flex items-center gap-2">
                      <span
                        class="size-5 shrink-0 rounded-full border border-default"
                        :style="{ backgroundColor: draft.categoryColors[name] ?? DEFAULT_COLOR }"
                        aria-hidden="true"
                      />
                      <USelect
                        v-model="draft.categoryColors[name]"
                        :items="WASH_OPTIONS"
                        :aria-label="`分类 ${name} 的莫兰迪配色`"
                        class="w-full"
                      />
                    </div>
                  </UFormField>
                  <UButton
                    type="button"
                    class="justify-self-end"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    square
                    :aria-label="`删除分类 ${name}`"
                    @click="removeCategory(name)"
                  />
                </div>
                <p class="mt-2 text-[11px] text-muted">
                  链接预览：
                  <code>/categories/{{ draft.categorySlugs[name] || '…' }}/</code>
                </p>
              </div>
            </div>

            <div class="mt-3 rounded-lg border border-dashed border-default p-3">
              <p class="text-xs font-medium text-default">新增分类</p>
              <div
                class="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-end"
              >
                <UFormField label="中文名">
                  <UInput
                    v-model="newCategory.name"
                    aria-label="新分类中文名"
                    placeholder="例如：漫画"
                    class="w-full"
                    @keydown.enter.prevent="addCategory"
                  />
                </UFormField>
                <UFormField label="URL slug">
                  <UInput
                    v-model="newCategory.slug"
                    aria-label="新分类 URL slug"
                    :pattern="SLUG_PATTERN"
                    :title="SLUG_HINT"
                    spellcheck="false"
                    autocomplete="off"
                    placeholder="comic"
                    class="w-full"
                    @keydown.enter.prevent="addCategory"
                  />
                </UFormField>
                <UFormField label="莫兰迪配色">
                  <USelect
                    v-model="newCategory.color"
                    :items="WASH_OPTIONS"
                    aria-label="新分类莫兰迪配色"
                    class="w-full"
                  />
                </UFormField>
                <UButton
                  type="button"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  label="添加"
                  @click="addCategory"
                />
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-highlighted">标签</h2>
                  <p class="mt-0.5 text-xs text-muted">
                    中文名映射为 <code class="rounded bg-elevated px-1 py-0.5 text-[11px]">/tags/&lt;slug&gt;/</code>。
                    与分类共用 taxonomy.json，但使用独立的 slug 命名空间。
                  </p>
                </div>
                <UBadge color="neutral" variant="subtle">{{ tagNames.length }} 个</UBadge>
              </div>
            </template>

            <p
              v-if="tagNames.length === 0"
              class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
            >
              还没有标签映射，在下方新增。
            </p>
            <div v-else class="space-y-3">
              <div
                v-for="name in tagNames"
                :key="name"
                class="rounded-lg border border-default bg-elevated/40 p-3"
              >
                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-end">
                  <UFormField label="标签名">
                    <UInput
                      :model-value="name"
                      :aria-label="`标签名 ${name}`"
                      disabled
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="URL slug" required>
                    <UInput
                      v-model="draft.tagSlugs[name]"
                      :aria-label="`标签 ${name} 的 URL slug`"
                      :pattern="SLUG_PATTERN"
                      :title="SLUG_HINT"
                      spellcheck="false"
                      autocomplete="off"
                      placeholder="comic"
                      class="w-full"
                    />
                  </UFormField>
                  <UButton
                    type="button"
                    class="justify-self-end"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    square
                    :aria-label="`删除标签 ${name}`"
                    @click="removeTag(name)"
                  />
                </div>
                <p class="mt-2 text-[11px] text-muted">
                  链接预览：<code>/tags/{{ draft.tagSlugs[name] || '…' }}/</code>
                </p>
              </div>
            </div>

            <div class="mt-3 rounded-lg border border-dashed border-default p-3">
              <p class="text-xs font-medium text-default">新增标签</p>
              <div
                class="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-end"
              >
                <UFormField label="中文名">
                  <UInput
                    v-model="newTag.name"
                    aria-label="新标签中文名"
                    placeholder="例如：漫画"
                    class="w-full"
                    @keydown.enter.prevent="addTag"
                  />
                </UFormField>
                <UFormField label="URL slug">
                  <UInput
                    v-model="newTag.slug"
                    aria-label="新标签 URL slug"
                    :pattern="SLUG_PATTERN"
                    :title="SLUG_HINT"
                    spellcheck="false"
                    autocomplete="off"
                    placeholder="comic"
                    class="w-full"
                    @keydown.enter.prevent="addTag"
                  />
                </UFormField>
                <UButton
                  type="button"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  label="添加"
                  @click="addTag"
                />
              </div>
            </div>
          </UCard>
        </div>
      </UContainer>
    </template>

    <template #footer>
      <div
        v-if="status === 'ready'"
        class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="footerState.color" :icon="footerState.icon" variant="subtle">
            {{ footerState.text }}
          </UBadge>
          <span class="text-xs text-muted">
            写入 src/data/taxonomy.json · 原子替换 · 2 空格缩进
          </span>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            icon="i-lucide-undo-2"
            label="撤销修改"
            :disabled="!dirty || saving"
            @click="reset"
          />
          <UButton
            type="button"
            color="primary"
            icon="i-lucide-save"
            label="保存更改"
            :loading="saving"
            :disabled="!dirty || saving"
            @click="save"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
