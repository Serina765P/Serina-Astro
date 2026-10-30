<script setup>
import { MdEditor, NormalToolbar } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { computed, nextTick, ref } from 'vue';
import { uploadPostImage } from '../api.js';
import { errorMessage } from '../errors.js';
import ShortcodePicker from './ShortcodePicker.vue';
import { useDarkMode } from '../use-dark-mode.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  slug: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue', 'save']);

const toast = useToast();
const isDark = useDarkMode();
const editorRef = ref(null);
const pickerOpen = ref(false);

const TOOLBARS = [
  'bold',
  'italic',
  'strikeThrough',
  '-',
  'title',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'code',
  'codeRow',
  'link',
  'image',
  'table',
  '-',
  0,
  '=',
  'revoke',
  'next',
  'save',
  '=',
  'pageFullscreen',
  'fullscreen',
  'preview',
  'catalog',
];
const FOOTERS = ['markdownTotal', '=', 'scrollSwitch'];

const text = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const theme = computed(() => (isDark.value ? 'dark' : 'light'));

function altText(filename) {
  const base = String(filename ?? '')
    .replace(/\.[^.]*$/u, '')
    .trim();
  return base || '图片';
}

async function uploadImages(files) {
  const urls = await Promise.all(
    files.map(async (file) => {
      const result = await uploadPostImage(props.slug, file);
      return { url: result.relativePath, alt: altText(file.name), title: '' };
    }),
  );
  toast.add({
    title: `已上传 ${urls.length} 张图片`,
    description: `写入 src/content/posts/${props.slug}/`,
    color: 'success',
    icon: 'i-lucide-image-plus',
  });
  return urls;
}

async function onUploadImg(files, callback) {
  try {
    callback(await uploadImages(files));
  } catch (error) {
    // 不能用 callback([])：md-editor-v3 会以空数组生成负偏移选区，光标在文档开头时会抛错。
    toast.add({
      title: '图片上传失败',
      description: errorMessage(error),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
  }
}

/** md-editor-v3 只把 drop 事件抛给宿主，这里补齐拖拽图片的直传与插入。 */
async function onDrop(event) {
  const files = [...(event.dataTransfer?.files ?? [])].filter((file) =>
    file.type.startsWith('image/'),
  );
  if (files.length === 0) return;
  event.preventDefault();
  try {
    const urls = await uploadImages(files);
    void nextTick(() => {
      editorRef.value?.focus();
      editorRef.value?.insert(() => ({
        targetValue: urls.map((item) => `![${item.alt}](${item.url})`).join('\n'),
        select: false,
      }));
    });
  } catch (error) {
    toast.add({
      title: '图片上传失败',
      description: errorMessage(error),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
  }
}

/** 正文里的 `<slug>/file` 交给后台图片回读端点，预览才能显示尚未构建的文章插图。 */
function resolveImageUrl(src) {
  if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/iu.test(src)) return src;
  const clean = src.replace(/^\.\//u, '');
  const prefix = `${props.slug}/`;
  if (!clean.startsWith(prefix)) return src;
  const name = clean.slice(prefix.length);
  if (!name || name.includes('/')) return src;
  return `/api/posts/${encodeURIComponent(props.slug)}/images/${encodeURIComponent(name)}`;
}

/** md-editor-v3 的 transformImgUrl 只处理插入事件；预览 HTML 需要在这里改写 img src。 */
function rewritePreviewImages(html) {
  return html.replace(
    /(<img\b[^>]*?\bsrc=")([^"]*)(")/giu,
    (_match, head, src, tail) => `${head}${resolveImageUrl(src)}${tail}`,
  );
}

function insertShortcode(code) {
  void nextTick(() => {
    editorRef.value?.focus();
    editorRef.value?.insert(() => ({ targetValue: `:${code}:`, select: false }));
  });
}
</script>

<template>
  <div class="flex h-full min-h-[30rem] flex-col">
    <MdEditor
      ref="editorRef"
      v-model="text"
      class="post-markdown-editor"
      :theme="theme"
      language="zh-CN"
      preview-theme="github"
      code-theme="github"
      :toolbars="TOOLBARS"
      :footers="FOOTERS"
      :style="{ height: '100%' }"
      placeholder="用 Markdown 写正文；可直接粘贴或拖入图片，工具栏可插入表情/贴纸短代码。"
      :transform-img-url="resolveImageUrl"
      :sanitize="rewritePreviewImages"
      :scroll-auto="true"
      @onUploadImg="onUploadImg"
      @onDrop="onDrop"
      @onSave="emit('save')"
    >
      <template #defToolbars>
        <NormalToolbar title="插入表情/贴纸短代码" @onClick="pickerOpen = true">
          <svg
            class="md-editor-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none" />
            <path d="M8.5 15c1 .9 2.1 1.35 3.5 1.35s2.5-.45 3.5-1.35" />
          </svg>
        </NormalToolbar>
      </template>
    </MdEditor>

    <ShortcodePicker v-model:open="pickerOpen" @select="insertShortcode" />
  </div>
</template>

<style scoped>
.post-markdown-editor {
  flex: 1;
  min-height: 0;
}

.post-markdown-editor :deep(.md-editor) {
  border-color: var(--ui-border);
  border-radius: var(--ui-radius);
}
</style>
