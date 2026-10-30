<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import {
  POST_FRONTMATTER_FIELDS,
  POST_SKINS,
} from '../../../src/lib/post-frontmatter.ts';
import { SLUG_PATTERN as SLUG_RE, SLUG_PATTERN_SOURCE } from '../../../src/lib/taxonomy.ts';
import { formatDate } from '../../../src/lib/utils.ts';
import {
  createPost,
  deletePost,
  fetchPost,
  fetchPosts,
  fetchTaxonomy,
  updatePost,
} from '../api.js';

const toast = useToast();

const SLUG_PATTERN = SLUG_PATTERN_SOURCE;
const SLUG_HINT = '只能使用小写 ASCII 字母、数字与连字符，例如 my-new-post';
const ALL_FILTER = '__all';
const NO_SKIN = '__none';
const KNOWN_FIELDS = [...POST_FRONTMATTER_FIELDS];
const SKIN_LABELS = { 'imas-album': 'imas-album · 专辑封面网格' };
const SKIN_OPTIONS = [
  { label: '无皮肤', value: NO_SKIN },
  ...POST_SKINS.map((value) => ({ value, label: SKIN_LABELS[value] ?? value })),
];
const SORT_OPTIONS = [
  { label: '发布日期 · 新 → 旧', value: 'date-desc' },
  { label: '发布日期 · 旧 → 新', value: 'date-asc' },
  { label: '标题 · A → Z', value: 'title' },
];
const collator = new Intl.Collator('zh-CN');
const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const status = ref('loading');
const statusMessage = ref('');
const posts = ref([]);
const taxonomy = ref({ categorySlugs: {}, tagSlugs: {}, used: { categories: [], tags: [] } });
const filters = reactive({ query: '', category: ALL_FILTER, tag: ALL_FILTER, sort: 'date-desc' });

const editorOpen = ref(false);
const editorLoading = ref(false);
const detail = ref(null);
const saving = ref(false);
const unknownKeys = ref([]);
const baselineForm = ref(null);
const form = reactive(emptyForm());

const createOpen = ref(false);
const creating = ref(false);
const createError = ref('');
const createForm = reactive({ slug: '', title: '', date: '' });

const deleteTarget = ref(null);
const deleteOpen = ref(false);
const removeAssets = ref(false);
const deleting = ref(false);
const deleteError = ref('');

function todayShanghai() {
  return shanghaiDate.format(new Date());
}

function emptyForm() {
  return {
    title: '',
    date: todayShanghai(),
    updated: '',
    tags: [],
    categories: [],
    keywords: [],
    description: '',
    cover: '',
    pinned: false,
    toc: true,
    skin: NO_SKIN,
  };
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** 只取前台可编辑字段；缺失的 schema 默认值在这里补齐，保存时用 diff 决定是否回写。 */
function normalizeForm(frontmatter = {}) {
  return {
    title: asText(frontmatter.title),
    date: asText(frontmatter.date),
    updated: asText(frontmatter.updated),
    tags: asList(frontmatter.tags),
    categories: asList(frontmatter.categories),
    keywords: asList(frontmatter.keywords),
    description: asText(frontmatter.description),
    cover: asText(frontmatter.cover),
    pinned: frontmatter.pinned === true,
    toc: frontmatter.toc !== false,
    skin:
      typeof frontmatter.skin === 'string' && frontmatter.skin.trim()
        ? frontmatter.skin.trim()
        : NO_SKIN,
  };
}

function copyForm(source) {
  return {
    ...source,
    tags: [...source.tags],
    categories: [...source.categories],
    keywords: [...source.keywords],
  };
}

function setForm(next) {
  Object.assign(form, copyForm(next));
}

const normalizedForm = computed(() => normalizeForm(form));

const dirty = computed(
  () =>
    editorOpen.value &&
    baselineForm.value !== null &&
    JSON.stringify(normalizedForm.value) !== JSON.stringify(baselineForm.value),
);

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))].sort(
    collator.compare,
  );
}

const usedCategoryNames = computed(() =>
  (taxonomy.value.used?.categories ?? []).map((entry) => entry.name),
);
const usedTagNames = computed(() => (taxonomy.value.used?.tags ?? []).map((entry) => entry.name));

const categorySuggestions = computed(() =>
  uniqueSorted([
    ...Object.keys(taxonomy.value.categorySlugs ?? {}),
    ...usedCategoryNames.value,
    ...posts.value.flatMap((post) => post.categories),
  ]),
);
const tagSuggestions = computed(() =>
  uniqueSorted([
    ...Object.keys(taxonomy.value.tagSlugs ?? {}),
    ...usedTagNames.value,
    ...posts.value.flatMap((post) => post.tags),
  ]),
);
const keywordSuggestions = computed(() =>
  uniqueSorted(posts.value.flatMap((post) => post.keywords)),
);

const categoryFilterOptions = computed(() => [
  { label: '全部分类', value: ALL_FILTER },
  ...uniqueSorted(posts.value.flatMap((post) => post.categories)).map((name) => ({
    label: name,
    value: name,
  })),
]);
const tagFilterOptions = computed(() => [
  { label: '全部标签', value: ALL_FILTER },
  ...uniqueSorted(posts.value.flatMap((post) => post.tags)).map((name) => ({
    label: name,
    value: name,
  })),
]);

const hasFilters = computed(
  () =>
    Boolean(filters.query.trim()) ||
    filters.category !== ALL_FILTER ||
    filters.tag !== ALL_FILTER,
);

function postTime(post) {
  const time = post.date ? Date.parse(post.date) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NaN;
}

const visiblePosts = computed(() => {
  const query = filters.query.trim().toLowerCase();
  const rows = posts.value.filter((post) => {
    if (filters.category !== ALL_FILTER && !post.categories.includes(filters.category)) {
      return false;
    }
    if (filters.tag !== ALL_FILTER && !post.tags.includes(filters.tag)) return false;
    if (!query) return true;
    return [
      post.title,
      post.slug,
      post.description,
      ...post.categories,
      ...post.tags,
      ...post.keywords,
    ]
      .join('\n')
      .toLowerCase()
      .includes(query);
  });

  return [...rows].sort((a, b) => {
    if (filters.sort === 'title') {
      return collator.compare(a.title || a.slug, b.title || b.slug);
    }
    const aTime = postTime(a);
    const bTime = postTime(b);
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
      return filters.sort === 'date-asc' ? aTime - bTime : bTime - aTime;
    }
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return collator.compare(a.slug, b.slug);
  });
});

const unmappedSelected = computed(() => {
  const categories = form.categories.filter(
    (name) => !Object.hasOwn(taxonomy.value.categorySlugs ?? {}, name),
  );
  const tags = form.tags.filter((name) => !Object.hasOwn(taxonomy.value.tagSlugs ?? {}, name));
  return [...categories.map((name) => `分类「${name}」`), ...tags.map((name) => `标签「${name}」`)];
});

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

function formatPostDate(value) {
  if (!value) return '未设置日期';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatDate(date);
}

function clearFilters() {
  filters.query = '';
  filters.category = ALL_FILTER;
  filters.tag = ALL_FILTER;
}

async function refreshList() {
  const data = await fetchPosts();
  posts.value = Array.isArray(data.posts) ? data.posts : [];
}

async function load() {
  status.value = 'loading';
  statusMessage.value = '';
  try {
    const [list, tax] = await Promise.all([fetchPosts(), fetchTaxonomy()]);
    posts.value = Array.isArray(list.posts) ? list.posts : [];
    taxonomy.value = {
      categorySlugs: tax.taxonomy?.categorySlugs ?? {},
      tagSlugs: tax.taxonomy?.tagSlugs ?? {},
      used: tax.used ?? { categories: [], tags: [] },
    };
    status.value = 'ready';
  } catch (error) {
    statusMessage.value = errorMessage(error);
    status.value = 'error';
  }
}

function applyDetail(data) {
  detail.value = data;
  const normalized = normalizeForm(data.frontmatter ?? {});
  setForm(normalized);
  baselineForm.value = copyForm(normalized);
  unknownKeys.value = Object.keys(data.frontmatter ?? {}).filter(
    (key) => !KNOWN_FIELDS.includes(key),
  );
}

async function openEditor(post) {
  if (editorOpen.value && dirty.value && !window.confirm('有未保存的修改，切换文章会丢弃它们。继续？')) {
    return;
  }
  editorOpen.value = true;
  editorLoading.value = true;
  detail.value = null;
  baselineForm.value = null;
  unknownKeys.value = [];
  try {
    applyDetail(await fetchPost(post.slug));
  } catch (error) {
    editorOpen.value = false;
    toastError('读取文章失败', error);
  } finally {
    editorLoading.value = false;
  }
}

function onEditorOpenChange(next) {
  if (!next && dirty.value && !window.confirm('有未保存的修改，确定关闭编辑面板吗？')) return;
  editorOpen.value = next;
}

function resetForm() {
  if (baselineForm.value) setForm(baselineForm.value);
}

function buildPatch() {
  if (!baselineForm.value) return {};
  const current = normalizedForm.value;
  const patch = {};
  for (const field of ['title', 'date', 'tags', 'categories', 'keywords', 'pinned', 'toc']) {
    if (JSON.stringify(current[field]) !== JSON.stringify(baselineForm.value[field])) {
      patch[field] = current[field];
    }
  }
  for (const field of ['updated', 'description', 'cover']) {
    if (current[field] !== baselineForm.value[field]) {
      patch[field] = current[field] || null;
    }
  }
  if (current.skin !== baselineForm.value.skin) {
    patch.skin = current.skin === NO_SKIN ? null : current.skin;
  }
  return patch;
}

async function save() {
  if (saving.value || !dirty.value || !detail.value) return;
  const patch = buildPatch();
  if (Object.keys(patch).length === 0) {
    toast.add({
      title: '没有需要保存的修改',
      description: '表单内容与磁盘一致。',
      color: 'neutral',
      icon: 'i-lucide-check',
    });
    return;
  }
  saving.value = true;
  try {
    applyDetail(await updatePost(detail.value.slug, patch));
    try {
      await refreshList();
    } catch (error) {
      toastError('Frontmatter 已保存，但列表刷新失败', error);
    }
    toast.add({
      title: 'Frontmatter 已保存',
      description: `${detail.value.file} · 原子写入`,
      color: 'success',
      icon: 'i-lucide-check-circle',
    });
  } catch (error) {
    toastError('保存失败', error);
  } finally {
    saving.value = false;
  }
}

function addListValue(list, value) {
  const name = String(value ?? '').trim();
  if (!name || list.includes(name)) return;
  list.push(name);
}

function addCategoryValue(value) {
  addListValue(form.categories, value);
}

function addTagValue(value) {
  addListValue(form.tags, value);
}

function addKeywordValue(value) {
  addListValue(form.keywords, value);
}

function openCreate() {
  createForm.slug = '';
  createForm.title = '';
  createForm.date = todayShanghai();
  createError.value = '';
  createOpen.value = true;
}

async function submitCreate() {
  if (creating.value) return;
  createError.value = '';
  const slug = createForm.slug.trim();
  const title = createForm.title.trim();
  const date = createForm.date.trim();
  if (!SLUG_RE.test(slug)) {
    createError.value = `文章 slug ${SLUG_HINT}`;
    return;
  }
  if (!title) {
    createError.value = '标题不能为空';
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    createError.value = '发布时间必须是 YYYY-MM-DD';
    return;
  }

  creating.value = true;
  try {
    const created = await createPost({ slug, frontmatter: { title, date } });
    createOpen.value = false;
    applyDetail(created);
    editorOpen.value = true;
    try {
      await refreshList();
    } catch (error) {
      toastError('文章已创建，但列表刷新失败', error);
    }
    toast.add({
      title: '文章已创建',
      description: `${created.file} · ${slug}`,
      color: 'success',
      icon: 'i-lucide-file-plus',
    });
  } catch (error) {
    createError.value = errorMessage(error);
  } finally {
    creating.value = false;
  }
}

function askDelete(post) {
  deleteTarget.value = post;
  removeAssets.value = false;
  deleteError.value = '';
  deleteOpen.value = true;
}

async function confirmDelete() {
  if (deleting.value || !deleteTarget.value) return;
  deleting.value = true;
  deleteError.value = '';
  const target = deleteTarget.value;
  try {
    const result = await deletePost(target.slug, { removeAssets: removeAssets.value });
    if (detail.value?.slug === target.slug) {
      editorOpen.value = false;
      baselineForm.value = null;
      detail.value = null;
    }
    deleteOpen.value = false;
    try {
      await refreshList();
    } catch (error) {
      toastError('文章已删除，但列表刷新失败', error);
    }
    toast.add({
      title: '文章已删除',
      description: result.assetsRemoved
        ? `${target.file} 与 ${target.slug}/ 资源目录已清理`
        : target.file,
      color: 'success',
      icon: 'i-lucide-trash-2',
    });
  } catch (error) {
    deleteError.value = errorMessage(error);
  } finally {
    deleting.value = false;
  }
}

function onKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (editorOpen.value) void save();
  }
}

function onBeforeUnload(event) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm('有未保存的 frontmatter 修改，确定离开文章面板吗？');
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
  <UDashboardPanel id="posts">
    <template #header>
      <UDashboardNavbar title="文章">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UBadge color="neutral" variant="subtle" icon="i-lucide-file-text">
              {{ posts.length }} 篇
            </UBadge>
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              square
              aria-label="刷新文章列表"
              :loading="status === 'loading'"
              @click="load()"
            />
            <UButton
              type="button"
              color="primary"
              icon="i-lucide-plus"
              label="新建文章"
              @click="openCreate"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="max-w-6xl py-6">
        <div v-if="status === 'loading'" class="space-y-6" role="status">
          <USkeleton class="h-24 w-full rounded-xl" />
          <USkeleton class="h-96 w-full rounded-xl" />
        </div>

        <div v-else-if="status === 'error'" class="space-y-4">
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            title="读取文章失败"
            :description="statusMessage"
          />
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="重新读取"
            @click="load()"
          />
        </div>

        <div v-else class="space-y-5">
          <UCard>
            <div
              class="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end"
            >
              <UFormField label="搜索">
                <UInput
                  v-model="filters.query"
                  icon="i-lucide-search"
                  placeholder="标题、slug、摘要、分类或标签"
                  clearable
                  class="w-full"
                  aria-label="搜索文章"
                />
              </UFormField>
              <UFormField label="分类">
                <USelect
                  v-model="filters.category"
                  :items="categoryFilterOptions"
                  class="w-full"
                  aria-label="按分类筛选"
                />
              </UFormField>
              <UFormField label="标签">
                <USelect
                  v-model="filters.tag"
                  :items="tagFilterOptions"
                  class="w-full"
                  aria-label="按标签筛选"
                />
              </UFormField>
              <UFormField label="排序">
                <USelect
                  v-model="filters.sort"
                  :items="SORT_OPTIONS"
                  class="w-full"
                  aria-label="文章排序"
                />
              </UFormField>
            </div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>显示 {{ visiblePosts.length }} / {{ posts.length }} 篇</span>
              <UButton
                v-if="hasFilters"
                type="button"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-filter-x"
                label="清除筛选"
                @click="clearFilters"
              />
            </div>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <div
              v-if="visiblePosts.length === 0"
              class="rounded-lg border border-dashed border-default py-12 text-center text-sm text-muted"
            >
              {{ posts.length === 0 ? '还没有文章，点击右上角新建。' : '没有匹配的文章。' }}
            </div>
            <ul v-else class="divide-y divide-default">
              <li v-for="post in visiblePosts" :key="post.slug" class="p-4 sm:p-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        class="break-words text-left text-sm font-semibold text-highlighted hover:text-primary disabled:cursor-not-allowed disabled:text-muted"
                        :disabled="Boolean(post.error)"
                        @click="openEditor(post)"
                      >
                        {{ post.title || '（无标题）' }}
                      </button>
                      <UBadge color="neutral" variant="subtle" size="sm">
                        {{ post.format }}
                      </UBadge>
                      <UBadge v-if="post.pinned" color="warning" variant="subtle" size="sm">
                        置顶
                      </UBadge>
                      <UBadge v-if="post.skin" color="primary" variant="subtle" size="sm">
                        {{ post.skin }}
                      </UBadge>
                      <UBadge
                        v-if="!post.toc"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        icon="i-lucide-list-x"
                      >
                        无目录
                      </UBadge>
                      <UBadge v-if="post.error" color="error" variant="subtle" size="sm">
                        frontmatter 错误
                      </UBadge>
                    </div>

                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>{{ formatPostDate(post.date) }}</span>
                      <span aria-hidden="true">·</span>
                      <code class="rounded bg-elevated px-1 py-0.5 text-[11px]">
                        {{ post.slug }}
                      </code>
                      <template v-if="post.updated">
                        <span aria-hidden="true">·</span>
                        <span>更新 {{ formatPostDate(post.updated) }}</span>
                      </template>
                      <template v-if="post.hasAssets">
                        <span aria-hidden="true">·</span>
                        <span>有随文图片</span>
                      </template>
                    </div>

                    <p v-if="post.description" class="line-clamp-2 text-xs leading-5 text-muted">
                      {{ post.description }}
                    </p>

                    <div v-if="post.categories.length || post.tags.length" class="flex flex-wrap gap-1.5">
                      <UBadge
                        v-for="name in post.categories"
                        :key="`category-${name}`"
                        color="primary"
                        variant="subtle"
                        size="sm"
                      >
                        {{ name }}
                      </UBadge>
                      <UBadge
                        v-for="name in post.tags"
                        :key="`tag-${name}`"
                        color="neutral"
                        variant="outline"
                        size="sm"
                      >
                        #{{ name }}
                      </UBadge>
                    </div>

                    <p v-if="post.error" class="text-xs leading-5 text-error">
                      {{ post.error }}
                    </p>
                  </div>

                  <div class="flex shrink-0 items-center gap-1 self-end sm:self-start">
                    <UButton
                      type="button"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-pencil-line"
                      square
                      :aria-label="`编辑 ${post.slug}`"
                      :disabled="Boolean(post.error)"
                      @click="openEditor(post)"
                    />
                    <UButton
                      type="button"
                      color="error"
                      variant="ghost"
                      icon="i-lucide-trash-2"
                      square
                      :aria-label="`删除 ${post.slug}`"
                      @click="askDelete(post)"
                    />
                  </div>
                </div>
              </li>
            </ul>
          </UCard>
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>

  <UModal
    v-model:open="createOpen"
    title="新建文章"
    description="写入 src/content/posts/<slug>.md，slug 必须为小写 ASCII。"
    :ui="{ content: 'max-w-lg' }"
    :dismissible="!creating"
    :close="!creating"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="createError"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="createError"
        />
        <UFormField label="slug" required :help="SLUG_HINT">
          <UInput
            v-model="createForm.slug"
            :pattern="SLUG_PATTERN"
            :title="SLUG_HINT"
            placeholder="my-new-post"
            spellcheck="false"
            autocomplete="off"
            class="w-full"
            aria-label="新文章 slug"
            @keydown.enter.prevent="submitCreate"
          />
        </UFormField>
        <p class="text-[11px] leading-5 text-muted">
          路由预览
          <code class="rounded bg-elevated px-1 py-0.5">/posts/{{ createForm.slug || '…' }}/</code>
          · 文件
          <code class="rounded bg-elevated px-1 py-0.5">
            src/content/posts/{{ createForm.slug || '…' }}.md
          </code>
        </p>
        <UFormField label="标题" required>
          <UInput
            v-model="createForm.title"
            placeholder="文章标题"
            class="w-full"
            aria-label="新文章标题"
            @keydown.enter.prevent="submitCreate"
          />
        </UFormField>
        <UFormField label="发布时间" required help="东八区日期，可稍后在编辑面板补充具体时间。">
          <UInput
            v-model="createForm.date"
            type="date"
            class="w-full"
            aria-label="新文章发布时间"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          label="取消"
          :disabled="creating"
          @click="createOpen = false"
        />
        <UButton
          type="button"
          color="primary"
          icon="i-lucide-file-plus"
          label="创建并编辑"
          :loading="creating"
          @click="submitCreate"
        />
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="deleteOpen"
    title="删除文章"
    :dismissible="!deleting"
    :close="!deleting"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-default">
          确定删除
          <strong>{{ deleteTarget?.title || deleteTarget?.slug }}</strong>
          ？文章文件会从磁盘移除，此操作不可撤销。
        </p>
        <p v-if="deleteTarget" class="text-xs text-muted">
          <code class="rounded bg-elevated px-1 py-0.5">{{ deleteTarget.file }}</code>
        </p>
        <UAlert
          v-if="deleteError"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="deleteError"
        />
        <div
          v-if="deleteTarget?.hasAssets"
          class="rounded-lg border border-default bg-elevated/50 p-3"
        >
          <UCheckbox
            v-model="removeAssets"
            label="同时删除随文图片资源文件夹"
            description="删除后无法恢复"
          />
          <p class="mt-2 text-[11px] text-muted">
            <code>src/content/posts/{{ deleteTarget.slug }}/</code>
          </p>
        </div>
        <p v-else class="rounded-lg border border-dashed border-default p-3 text-xs text-muted">
          这篇文章没有随文图片资源文件夹。
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          label="取消"
          :disabled="deleting"
          @click="deleteOpen = false"
        />
        <UButton
          type="button"
          color="error"
          icon="i-lucide-trash-2"
          label="删除文章"
          :loading="deleting"
          @click="confirmDelete"
        />
      </div>
    </template>
  </UModal>

  <USlideover
    :open="editorOpen"
    :ui="{ content: 'w-full sm:max-w-2xl' }"
    title="编辑文章 Frontmatter"
    @update:open="onEditorOpenChange"
  >
    <template #body>
      <div v-if="editorLoading" class="space-y-4" role="status">
        <USkeleton class="h-16 w-full rounded-xl" />
        <USkeleton class="h-96 w-full rounded-xl" />
      </div>

      <div v-else-if="detail" class="space-y-5">
        <div class="rounded-lg border border-default bg-elevated/40 p-3 text-xs text-muted">
          <p class="break-all">
            <code class="rounded bg-elevated px-1 py-0.5">{{ detail.file }}</code>
            · 换行 {{ detail.lineEnding === 'crlf' ? 'CRLF' : 'LF' }}
            · {{ detail.hasAssets ? '有随文图片目录' : '无随文图片' }}
          </p>
          <p class="mt-1">
            只保存 Frontmatter；正文与未知字段保持原样。图片上传请在 Markdown 编辑器中使用随文插图。
          </p>
        </div>

        <UAlert
          v-if="unmappedSelected.length > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="这些词条还没有 URI 映射"
        >
          <template #description>
            <p class="text-xs leading-5">
              {{ unmappedSelected.join('、') }}。发布后会降级为中文 URL，可保存后到「URI 对照」
              面板补录。
            </p>
          </template>
        </UAlert>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="标题" required class="sm:col-span-2">
            <UInput v-model="form.title" class="w-full" aria-label="文章标题" />
          </UFormField>

          <UFormField
            label="发布时间"
            required
            help="YYYY-MM-DD 或带时区的 ISO 时间。"
          >
            <UInput
              v-model="form.date"
              spellcheck="false"
              placeholder="2026-10-08T12:00:00+08:00"
              class="w-full"
              aria-label="发布时间"
            />
          </UFormField>

          <UFormField label="更新时间" help="留空即删除该字段。">
            <UInput
              v-model="form.updated"
              spellcheck="false"
              placeholder="2026-10-09T20:20:44+08:00"
              class="w-full"
              aria-label="更新时间"
            />
          </UFormField>

          <UFormField
            label="分类"
            class="sm:col-span-2"
            help="输入可搜索已有分类；按回车可创建新词条，保存后建议到「URI 对照」登记 slug。"
          >
            <UInputMenu
              v-model="form.categories"
              :items="categorySuggestions"
              multiple
              create-item
              placeholder="选择或输入分类"
              class="w-full"
              aria-label="文章分类"
              @create="addCategoryValue"
            />
          </UFormField>

          <UFormField label="标签" class="sm:col-span-2" help="同样支持从既有标签自动补全。">
            <UInputMenu
              v-model="form.tags"
              :items="tagSuggestions"
              multiple
              create-item
              placeholder="选择或输入标签"
              class="w-full"
              aria-label="文章标签"
              @create="addTagValue"
            />
          </UFormField>

          <UFormField label="关键词" class="sm:col-span-2" help="用于 SEO，可留空。">
            <UInputMenu
              v-model="form.keywords"
              :items="keywordSuggestions"
              multiple
              create-item
              placeholder="选择或输入关键词"
              class="w-full"
              aria-label="文章关键词"
              @create="addKeywordValue"
            />
          </UFormField>

          <UFormField label="文章皮肤">
            <USelect
              v-model="form.skin"
              :items="SKIN_OPTIONS"
              class="w-full"
              aria-label="文章皮肤"
            />
          </UFormField>

          <UFormField label="封面" help="文章目录内的相对文件名，例如 cover.avif。">
            <UInput
              v-model="form.cover"
              spellcheck="false"
              placeholder="cover.avif"
              class="w-full"
              aria-label="封面文件名"
            />
          </UFormField>

          <UFormField label="摘要" class="sm:col-span-2" help="留空即从 Frontmatter 删除。">
            <UTextarea
              v-model="form.description"
              :rows="3"
              autoresize
              placeholder="列表与分享卡片使用的摘要"
              class="w-full"
              aria-label="文章摘要"
            />
          </UFormField>

          <UFormField label="置顶">
            <div class="flex h-8 items-center">
              <USwitch v-model="form.pinned" aria-label="置顶文章" />
            </div>
          </UFormField>

          <UFormField label="显示目录">
            <div class="flex h-8 items-center">
              <USwitch v-model="form.toc" aria-label="显示文章目录" />
            </div>
          </UFormField>
        </div>

        <div v-if="unknownKeys.length > 0" class="rounded-lg border border-default p-3">
          <p class="text-xs font-medium text-default">未知字段将原样保留</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <UBadge
              v-for="key in unknownKeys"
              :key="key"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ key }}
            </UBadge>
          </div>
          <p class="mt-2 text-[11px] leading-5 text-muted">
            保存时只替换上方字段；这些键及其值不会丢失，正文与注释保持原样。
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div
        v-if="editorOpen && detail"
        class="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="dirty ? 'warning' : 'success'"
            :icon="dirty ? 'i-lucide-pencil-line' : 'i-lucide-check'"
            variant="subtle"
          >
            {{ dirty ? '有未保存的修改' : '已与磁盘同步' }}
          </UBadge>
          <span class="max-w-56 truncate text-xs text-muted">{{ detail.file }}</span>
        </div>
        <div class="flex items-center justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            icon="i-lucide-undo-2"
            label="撤销修改"
            :disabled="!dirty || saving"
            @click="resetForm"
          />
          <UButton
            type="button"
            color="primary"
            icon="i-lucide-save"
            label="保存 Frontmatter"
            :loading="saving"
            :disabled="!dirty || saving"
            @click="save"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
