<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import {
  POST_FORMATS,
  POST_FRONTMATTER_FIELDS,
  POST_LICENSES,
  POST_SKINS,
} from '../../../src/lib/post-frontmatter.ts';
import {
  buildTaxonomyEntryPatch,
  SLUG_PATTERN as SLUG_RE,
  SLUG_PATTERN_SOURCE,
} from '../../../src/lib/taxonomy.ts';
import { formatDate } from '../../../src/lib/utils.ts';
import {
  createPost,
  deletePost,
  fetchPost,
  fetchPosts,
  fetchTaxonomy,
  saveTaxonomy,
  updatePost,
} from '../api.js';
import MarkdownEditor from '../components/MarkdownEditor.vue';
import { errorMessage } from '../errors.js';
import { DEFAULT_WASH, nextWashColor, WASH_OPTIONS } from '../wash.js';

const toast = useToast();

const SLUG_PATTERN = SLUG_PATTERN_SOURCE;
const SLUG_HINT = '只能使用小写 ASCII 字母、数字与连字符，例如 my-new-post';
const ALL_FILTER = '__all';
const NO_SKIN = '__none';
const NO_LICENSE = '__none';
const KNOWN_FIELDS = [...POST_FRONTMATTER_FIELDS];
const SKIN_LABELS = { 'imas-album': 'imas-album · 专辑封面网格' };
const SKIN_OPTIONS = [
  { label: '无皮肤', value: NO_SKIN },
  ...POST_SKINS.map((value) => ({ value, label: SKIN_LABELS[value] ?? value })),
];
const LICENSE_LABELS = { original: 'original · CC BY-NC-SA 4.0' };
const LICENSE_OPTIONS = [
  { label: '未标注（不声明 CC）', value: NO_LICENSE },
  ...POST_LICENSES.map((value) => ({ value, label: LICENSE_LABELS[value] ?? value })),
];
const FORMAT_LABELS = {
  md: 'Markdown (.md)',
  mdx: 'MDX (.mdx) · 可插入音乐 / B 站播放器',
};
const CREATE_FORMATS = POST_FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value] }));
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
const taxonomy = ref({
  categorySlugs: {},
  tagSlugs: {},
  categoryColors: {},
  used: { categories: [], tags: [] },
});
const filters = reactive({ query: '', category: ALL_FILTER, tag: ALL_FILTER, sort: 'date-desc' });

const editorOpen = ref(false);
const editorLoading = ref(false);
const detail = ref(null);
const saving = ref(false);
const unknownKeys = ref([]);
const baselineForm = ref(null);
const form = reactive(emptyForm());

const content = ref('');
const baselineContent = ref('');
const bodyStatus = ref('idle');
const bodySavedAt = ref('');
const frontmatterOpen = ref(false);
let bodyTimer = null;
let bodySavePromise = null;

const createOpen = ref(false);
const creating = ref(false);
const createError = ref('');
const createForm = reactive({ slug: '', format: 'md', title: '', date: '' });

const deleteTarget = ref(null);
const deleteOpen = ref(false);
const removeAssets = ref(false);
const deleting = ref(false);
const deleteError = ref('');

const registerOpen = ref(false);
const registerTarget = ref(null);
const registerSlug = ref('');
const registerColor = ref(DEFAULT_WASH);
const registerError = ref('');
const registering = ref(false);

const panelUi = computed(() =>
  editorOpen.value
    ? { body: 'p-0 sm:p-0 flex-1 min-h-0 overflow-hidden' }
    : { body: 'p-4 sm:p-6' },
);

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
    license: NO_LICENSE,
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
    license:
      typeof frontmatter.license === 'string' && frontmatter.license.trim()
        ? frontmatter.license.trim()
        : NO_LICENSE,
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

const bodyDirty = computed(() => content.value !== baselineContent.value);
const hasUnsaved = computed(() => dirty.value || bodyDirty.value);

const bodyStatusMeta = computed(() => {
  switch (bodyStatus.value) {
    case 'saving':
      return { color: 'neutral', icon: 'i-lucide-loader-circle', text: '正文保存中…' };
    case 'pending':
      return { color: 'warning', icon: 'i-lucide-timer', text: '正文等待自动保存' };
    case 'error':
      return { color: 'error', icon: 'i-lucide-alert-circle', text: '正文自动保存失败' };
    case 'saved':
      return {
        color: 'success',
        icon: 'i-lucide-check',
        text: `正文已自动保存${bodySavedAt.value ? ` · ${bodySavedAt.value}` : ''}`,
      };
    default:
      return { color: 'success', icon: 'i-lucide-check', text: '正文已与磁盘同步' };
  }
});

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

const unmappedEntries = computed(() => {
  const categories = form.categories
    .filter((name) => !Object.hasOwn(taxonomy.value.categorySlugs ?? {}, name))
    .map((name) => ({ kind: 'category', name }));
  const tags = form.tags
    .filter((name) => !Object.hasOwn(taxonomy.value.tagSlugs ?? {}, name))
    .map((name) => ({ kind: 'tag', name }));
  return [...categories, ...tags];
});

const TAXONOMY_KINDS = {
  category: { label: '分类', mapKey: 'categorySlugs', route: 'categories', withColor: true },
  tag: { label: '标签', mapKey: 'tagSlugs', route: 'tags', withColor: false },
};

function kindMeta(kind) {
  return TAXONOMY_KINDS[kind] ?? TAXONOMY_KINDS.tag;
}

function kindMap(kind) {
  return taxonomy.value[kindMeta(kind).mapKey] ?? {};
}

function kindLabel(kind) {
  return kindMeta(kind).label;
}

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
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

function applyTaxonomyState(state) {
  taxonomy.value = {
    categorySlugs: state.taxonomy?.categorySlugs ?? {},
    tagSlugs: state.taxonomy?.tagSlugs ?? {},
    categoryColors: state.taxonomy?.categoryColors ?? {},
    used: state.used ?? { categories: [], tags: [] },
  };
}

async function load() {
  status.value = 'loading';
  statusMessage.value = '';
  try {
    const [list, tax] = await Promise.all([fetchPosts(), fetchTaxonomy()]);
    posts.value = Array.isArray(list.posts) ? list.posts : [];
    applyTaxonomyState(tax);
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
  content.value = typeof data.content === 'string' ? data.content : '';
  baselineContent.value = content.value;
  bodyStatus.value = 'idle';
  bodySavedAt.value = '';
}

function clearBodyTimer() {
  if (bodyTimer) {
    clearTimeout(bodyTimer);
    bodyTimer = null;
  }
}

async function openEditor(post) {
  if (
    editorOpen.value &&
    hasUnsaved.value &&
    !window.confirm('有未保存的修改，切换文章会丢弃它们。继续？')
  ) {
    return;
  }
  clearBodyTimer();
  if (bodySavePromise) await bodySavePromise;
  editorOpen.value = true;
  editorLoading.value = true;
  detail.value = null;
  baselineForm.value = null;
  unknownKeys.value = [];
  content.value = '';
  baselineContent.value = '';
  bodyStatus.value = 'idle';
  bodySavedAt.value = '';
  try {
    applyDetail(await fetchPost(post.slug));
  } catch (error) {
    editorOpen.value = false;
    toastError('读取文章失败', error);
  } finally {
    editorLoading.value = false;
  }
}

async function closeEditor() {
  clearBodyTimer();
  if (bodyDirty.value) {
    const saved = await flushBody();
    if (!saved && !window.confirm('正文自动保存失败，关闭会丢失正文修改。继续？')) return;
  }
  if (dirty.value && !window.confirm('有未保存的 frontmatter 修改，确定关闭编辑面板吗？')) return;
  editorOpen.value = false;
  detail.value = null;
  baselineForm.value = null;
  unknownKeys.value = [];
  content.value = '';
  baselineContent.value = '';
  bodyStatus.value = 'idle';
  bodySavedAt.value = '';
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
  if (current.license !== baselineForm.value.license) {
    patch.license = current.license === NO_LICENSE ? null : current.license;
  }
  return patch;
}

function scheduleBodySave() {
  clearBodyTimer();
  if (!editorOpen.value || !detail.value || !bodyDirty.value) return;
  bodyStatus.value = 'pending';
  bodyTimer = setTimeout(() => {
    bodyTimer = null;
    void flushBody();
  }, 1200);
}

/** 正文自动保存：只提交 content，避免把尚未确认的 Frontmatter 修改一并写盘。 */
async function flushBody() {
  clearBodyTimer();
  if (bodySavePromise) await bodySavePromise;
  if (!editorOpen.value || !detail.value || !bodyDirty.value) return true;
  if (saving.value) {
    scheduleBodySave();
    return !bodyDirty.value;
  }
  const slug = detail.value.slug;
  const target = content.value;
  bodyStatus.value = 'saving';
  bodySavePromise = (async () => {
    try {
      const saved = await updatePost(slug, { content: target });
      baselineContent.value = typeof saved.content === 'string' ? saved.content : target;
      bodyStatus.value = 'saved';
      bodySavedAt.value = nowTime();
      if (editorOpen.value && detail.value?.slug === slug && content.value !== baselineContent.value) {
        scheduleBodySave();
      }
      return true;
    } catch (error) {
      bodyStatus.value = 'error';
      toastError('正文自动保存失败', error);
      return false;
    } finally {
      bodySavePromise = null;
    }
  })();
  return bodySavePromise;
}

async function save() {
  if (saving.value || !detail.value) return;
  clearBodyTimer();
  if (bodySavePromise) await bodySavePromise;
  if (saving.value) return;
  const patch = buildPatch();
  const sendContent = bodyDirty.value;
  if (Object.keys(patch).length === 0 && !sendContent) {
    toast.add({
      title: '没有需要保存的修改',
      description: 'Frontmatter 与正文都与磁盘一致。',
      color: 'neutral',
      icon: 'i-lucide-check',
    });
    return;
  }
  const payload = {};
  if (Object.keys(patch).length > 0) payload.frontmatter = patch;
  if (sendContent) payload.content = content.value;

  const slug = detail.value.slug;
  const contentAtSend = content.value;
  saving.value = true;
  if (sendContent) bodyStatus.value = 'saving';
  try {
    const saved = await updatePost(slug, payload);
    if (!editorOpen.value || detail.value?.slug !== slug) return;
    const liveContent = content.value;
    applyDetail(saved);
    if (liveContent !== contentAtSend) content.value = liveContent;
    bodyStatus.value = 'saved';
    bodySavedAt.value = nowTime();
    try {
      await refreshList();
    } catch (error) {
      toastError('文章已保存，但列表刷新失败', error);
    }
    toast.add({
      title: '文章已保存',
      description: `${detail.value.file} · ${sendContent ? 'Frontmatter 与正文' : 'Frontmatter'}已原子写入`,
      color: 'success',
      icon: 'i-lucide-check-circle',
    });
  } catch (error) {
    if (sendContent) bodyStatus.value = 'error';
    toastError('保存失败', error);
  } finally {
    saving.value = false;
  }
}

function addListValue(list, value) {
  const name = String(value ?? '').trim();
  if (!name || list.includes(name)) return false;
  list.push(name);
  return true;
}

function addCategoryValue(value) {
  const name = String(value ?? '').trim();
  if (!addListValue(form.categories, name)) return;
  if (!Object.hasOwn(taxonomy.value.categorySlugs ?? {}, name)) openRegister('category', name);
}

function addTagValue(value) {
  const name = String(value ?? '').trim();
  if (!addListValue(form.tags, name)) return;
  if (!Object.hasOwn(taxonomy.value.tagSlugs ?? {}, name)) openRegister('tag', name);
}

function addKeywordValue(value) {
  addListValue(form.keywords, value);
}

function openRegister(kind, name) {
  if (registering.value) return;
  if (Object.hasOwn(kindMap(kind), name)) return;
  registerTarget.value = { kind, name };
  registerSlug.value = '';
  registerColor.value = nextWashColor(Object.values(taxonomy.value.categoryColors ?? {}));
  registerError.value = '';
  registerOpen.value = true;
}

function closeRegister() {
  if (registering.value) return;
  registerOpen.value = false;
}

async function submitRegister() {
  const target = registerTarget.value;
  if (!target || registering.value) return;
  const slug = registerSlug.value.trim();
  const label = kindLabel(target.kind);
  const meta = kindMeta(target.kind);
  if (!SLUG_RE.test(slug)) {
    registerError.value = `${label} slug ${SLUG_HINT}`;
    return;
  }
  if (Object.values(kindMap(target.kind)).includes(slug)) {
    registerError.value = `slug ${slug} 已被其它${label}占用`;
    return;
  }
  const patch = buildTaxonomyEntryPatch(
    {
      categorySlugs: taxonomy.value.categorySlugs,
      tagSlugs: taxonomy.value.tagSlugs,
      categoryColors: taxonomy.value.categoryColors,
    },
    {
      kind: target.kind,
      name: target.name,
      slug,
      color: registerColor.value,
    },
  );

  registering.value = true;
  registerError.value = '';
  try {
    const state = await saveTaxonomy(patch);
    applyTaxonomyState(state);
    registerOpen.value = false;
    toast.add({
      title: `${label}「${target.name}」已登记`,
      description: `src/data/taxonomy.json · /${meta.route}/${slug}/`,
      color: 'success',
      icon: 'i-lucide-tags',
    });
  } catch (error) {
    registerError.value = errorMessage(error);
  } finally {
    registering.value = false;
  }
}

function openCreate() {
  createForm.slug = '';
  createForm.format = 'md';
  createForm.title = '';
  createForm.date = todayShanghai();
  createError.value = '';
  createOpen.value = true;
}

async function submitCreate() {
  if (creating.value) return;
  createError.value = '';
  const slug = createForm.slug.trim();
  const format = createForm.format;
  const title = createForm.title.trim();
  const date = createForm.date.trim();
  if (!SLUG_RE.test(slug)) {
    createError.value = `文章 slug ${SLUG_HINT}`;
    return;
  }
  if (!POST_FORMATS.includes(format)) {
    createError.value = '文章格式必须是 md 或 mdx';
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
    const created = await createPost({ slug, format, frontmatter: { title, date } });
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
      clearBodyTimer();
      editorOpen.value = false;
      baselineForm.value = null;
      detail.value = null;
      content.value = '';
      baselineContent.value = '';
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
  if (!hasUnsaved.value) return;
  event.preventDefault();
  event.returnValue = '';
}

watch(content, () => {
  if (!editorOpen.value) return;
  if (bodyDirty.value) {
    scheduleBodySave();
    return;
  }
  clearBodyTimer();
  if (bodyStatus.value === 'pending') bodyStatus.value = 'idle';
});

onBeforeRouteLeave(async () => {
  clearBodyTimer();
  if (bodyDirty.value) await flushBody();
  if (hasUnsaved.value && !window.confirm('有未保存的修改，确定离开文章面板吗？')) {
    if (bodyDirty.value) scheduleBodySave();
    return false;
  }
  return true;
});

onMounted(() => {
  void load();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
  clearBodyTimer();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<template>
  <UDashboardPanel id="posts" class="h-svh" :ui="panelUi">
    <template #header>
      <UDashboardNavbar :title="editorOpen ? '编辑文章' : '文章'">
        <template #leading>
          <UButton
            v-if="editorOpen"
            type="button"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            label="返回列表"
            @click="closeEditor"
          />
          <UDashboardSidebarCollapse v-else />
        </template>
        <template #right>
          <div v-if="editorOpen" class="flex items-center gap-2">
            <UBadge
              :color="bodyStatusMeta.color"
              :icon="bodyStatusMeta.icon"
              variant="subtle"
              class="hidden sm:inline-flex"
            >
              {{ bodyStatusMeta.text }}
            </UBadge>
            <UBadge v-if="dirty" color="warning" variant="subtle" icon="i-lucide-pencil-line">
              Frontmatter 未保存
            </UBadge>
            <UButton
              type="button"
              color="neutral"
              variant="outline"
              icon="i-lucide-panel-top"
              :label="frontmatterOpen ? '收起 Frontmatter' : '展开 Frontmatter'"
              @click="frontmatterOpen = !frontmatterOpen"
            />
            <UButton
              type="button"
              color="primary"
              icon="i-lucide-save"
              label="保存"
              :loading="saving"
              :disabled="(!dirty && !bodyDirty) || saving"
              @click="save"
            />
          </div>
          <div v-else class="flex items-center gap-2">
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
      <div v-if="editorOpen" class="flex h-full min-h-0 flex-col">
        <div v-if="editorLoading" class="space-y-4 p-6" role="status">
          <USkeleton class="h-14 w-full rounded-xl" />
          <USkeleton class="h-96 w-full rounded-xl" />
        </div>

        <div v-else-if="detail" class="flex h-full min-h-0 flex-col">
          <div
            class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-default px-4 py-2 text-xs text-muted"
          >
            <code class="rounded bg-elevated px-1 py-0.5">{{ detail.file }}</code>
            <span>换行 {{ detail.lineEnding === 'crlf' ? 'CRLF' : 'LF' }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ detail.hasAssets ? '有随文图片目录' : '无随文图片' }}</span>
            <span aria-hidden="true">·</span>
            <span>正文自动保存，图片可粘贴或拖入</span>
          </div>

          <div
            v-show="frontmatterOpen"
            class="max-h-[46%] min-h-0 overflow-y-auto border-b border-default bg-elevated/10 px-4 py-4"
          >
            <div v-if="unmappedEntries.length > 0" class="mb-4">
              <UAlert
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                title="这些词条还没有 URI 映射"
              >
                <template #description>
                  <div class="space-y-2">
                    <p class="text-xs leading-5">
                      发布后会降级为中文 URL。可就地登记 slug，或稍后到「URI 对照」面板补录。
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <UButton
                        v-for="entry in unmappedEntries"
                        :key="`${entry.kind}-${entry.name}`"
                        type="button"
                        size="xs"
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-tag"
                        :label="`登记${kindLabel(entry.kind)}「${entry.name}」`"
                        @click="openRegister(entry.kind, entry.name)"
                      />
                    </div>
                  </div>
                </template>
              </UAlert>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="标题" required class="sm:col-span-2">
                <UInput v-model="form.title" class="w-full" aria-label="文章标题" />
              </UFormField>

              <UFormField label="发布时间" required help="YYYY-MM-DD 或带时区的 ISO 时间。">
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
                help="输入可搜索已有分类；新建词条会立即弹出 slug 登记。"
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

              <UFormField
                label="标签"
                class="sm:col-span-2"
                help="同样支持自动补全；新标签可当场登记 URI。"
              >
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

              <UFormField
                label="版权声明"
                help="选择 original 时，页脚将显示 CC BY-NC-SA 4.0 声明与官方链接。"
              >
                <USelect
                  v-model="form.license"
                  :items="LICENSE_OPTIONS"
                  class="w-full"
                  aria-label="文章版权声明"
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
                  :rows="2"
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

            <div v-if="unknownKeys.length > 0" class="mt-4 rounded-lg border border-default p-3">
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
            </div>

            <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                icon="i-lucide-undo-2"
                label="撤销 Frontmatter 修改"
                :disabled="!dirty || saving"
                @click="resetForm"
              />
              <UButton
                type="button"
                color="primary"
                variant="subtle"
                icon="i-lucide-save"
                label="保存 Frontmatter"
                :loading="saving"
                :disabled="!dirty || saving"
                @click="save"
              />
            </div>
          </div>

          <div class="min-h-0 flex-1 p-3">
            <MarkdownEditor
              v-model="content"
              :slug="detail.slug"
              :format="detail.format"
              @save="save"
            />
          </div>
        </div>
      </div>

      <UContainer v-else class="max-w-6xl py-6">
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
                        v-if="post.license === 'original'"
                        color="success"
                        variant="subtle"
                        size="sm"
                      >
                        CC BY-NC-SA 4.0
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
    description="写入 src/content/posts/<slug>.<md|mdx>，slug 必须为小写 ASCII。"
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
            src/content/posts/{{ createForm.slug || '…' }}.{{ createForm.format }}
          </code>
        </p>
        <UFormField
          label="文件格式"
          help="需要插入音乐或 B 站播放器时选 .mdx；.md 不支持 MDX 组件。"
        >
          <USelect
            v-model="createForm.format"
            :items="CREATE_FORMATS"
            class="w-full"
            aria-label="新文章文件格式"
          />
        </UFormField>
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

  <UModal
    v-model:open="registerOpen"
    :title="registerTarget ? `登记${kindLabel(registerTarget.kind)}「${registerTarget.name}」` : '登记词条'"
    description="写入 src/data/taxonomy.json；登记后文章保存即可生成英文 URL。"
    :ui="{ content: 'max-w-lg' }"
    :dismissible="!registering"
    :close="!registering"
  >
    <template #body>
      <div v-if="registerTarget" class="space-y-4">
        <UAlert
          v-if="registerError"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="registerError"
        />
        <div class="rounded-lg border border-default bg-elevated/40 p-3 text-xs text-muted">
          <p>
            {{ kindLabel(registerTarget.kind) }}
            <strong class="text-default">{{ registerTarget.name }}</strong>
            还没有英文 slug。发布后会降级为中文 URL。
          </p>
        </div>
        <UFormField label="URL slug" required :help="SLUG_HINT">
          <UInput
            v-model="registerSlug"
            :pattern="SLUG_PATTERN"
            :title="SLUG_HINT"
            placeholder="comic-book"
            spellcheck="false"
            autocomplete="off"
            class="w-full"
            aria-label="词条 slug"
            @keydown.enter.prevent="submitRegister"
          />
        </UFormField>
        <p class="text-[11px] leading-5 text-muted">
          路由预览
          <code class="rounded bg-elevated px-1 py-0.5">
            /{{ kindMeta(registerTarget.kind).route }}/{{ registerSlug || '…' }}/
          </code>
        </p>
        <UFormField
          v-if="kindMeta(registerTarget.kind).withColor"
          label="莫兰迪配色"
          help="分类胶囊与分类页使用的 wash 色。"
        >
          <USelect
            v-model="registerColor"
            :items="WASH_OPTIONS"
            class="w-full"
            aria-label="分类配色"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <p class="text-[11px] text-muted">登记后不会自动保存文章 Frontmatter。</p>
        <div class="flex items-center gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            label="取消"
            :disabled="registering"
            @click="closeRegister"
          />
          <UButton
            type="button"
            color="primary"
            icon="i-lucide-tags"
            label="写入 taxonomy.json"
            :loading="registering"
            :disabled="registering || !registerSlug.trim()"
            @click="submitRegister"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
