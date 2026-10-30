<script setup>
import { config, DropdownToolbar, MdEditor, NormalToolbar } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { computed, nextTick, ref } from 'vue';
import { shortcodeImageHtml, splitEmojiText } from '../../../src/lib/emoji.ts';
import { MEDIA_COMPONENTS, planMediaInsertion } from '../../../src/lib/mdx-media.ts';
import { uploadPostImage } from '../api.js';
import { errorMessage } from '../errors.js';
import MediaPicker from './MediaPicker.vue';
import ShortcodePicker from './ShortcodePicker.vue';
import { useDarkMode } from '../use-dark-mode.js';

const MEDIA_COMPONENT_LIST = Object.values(MEDIA_COMPONENTS);
const MEDIA_COMPONENT_NAMES = MEDIA_COMPONENT_LIST.map((component) => component.name).join('|');
const MEDIA_TAG_RE = new RegExp(`<(${MEDIA_COMPONENT_NAMES})\\b([^<]*?)\\/>`, 'gu');
const MEDIA_IMPORT_LINE_RE = new RegExp(
  `^import\\s+(?:${MEDIA_COMPONENT_NAMES})\\s+from\\s+['"][^'"]+['"];?\\s*$`,
  'u',
);

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/gu,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}

function decodeAttribute(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#92;', '\\')
    .replaceAll('&#10;', '\n')
    .replaceAll('&#13;', '\r')
    .replaceAll('&amp;', '&');
}

function mediaAttribute(attrs, name) {
  const quoted = new RegExp(`\\b${name}="([^"]*)"`, 'u').exec(attrs);
  if (quoted) return decodeAttribute(quoted[1]);
  const expression = new RegExp(`\\b${name}=\\{([\\s\\S]*?)\\}`, 'u').exec(attrs);
  if (!expression) return '';
  const raw = expression[1].trim();
  try {
    return String(JSON.parse(raw));
  } catch {
    return raw.replace(/^['"]|['"]$/gu, '');
  }
}

/** 预览里组件不会真的运行：换成带参数的占位块，方便确认插对了位置 */
function mediaPlaceholder(name, attrs, inline) {
  const component = MEDIA_COMPONENT_LIST.find((item) => item.name === name);
  const label = component?.label ?? name;
  let detail = '';
  if (name === 'BilibiliPlayer') {
    const bvid = mediaAttribute(attrs, 'bvid');
    const page = mediaAttribute(attrs, 'p');
    const title = mediaAttribute(attrs, 'title');
    detail = [bvid, page && page !== '1' ? `P${page}` : '', title].filter(Boolean).join(' · ');
  } else {
    const track = mediaAttribute(attrs, 'track');
    detail = track ? `单曲 ${track}` : '整张歌单';
  }
  if (inline) {
    return `<span class="md-media-placeholder md-media-placeholder-inline inline-flex items-center gap-1 rounded border border-dashed border-default bg-elevated/40 px-2 py-0.5 text-xs text-muted">${escapeHtml(label)}${detail ? ` · ${escapeHtml(detail)}` : ''}</span>`;
  }
  return `<div class="md-media-placeholder my-3 flex items-center gap-3 rounded-lg border border-dashed border-default bg-elevated/40 px-3 py-2.5 text-sm">
  <span class="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">${name === 'BilibiliPlayer' ? '▶' : '♪'}</span>
  <span class="min-w-0"><strong class="block text-default">${escapeHtml(label)}</strong>${detail ? `<span class="block truncate text-xs text-muted">${escapeHtml(detail)}</span>` : ''}</span>
  <span class="ml-auto shrink-0 text-[11px] text-muted">预览占位</span>
</div>`;
}

function mediaPreviewPlugin(md) {
  md.core.ruler.after('inline', 'serina-media-embeds', (state) => {
    // 预览没有模块系统：媒体组件的 import 行只留噪声，整行删掉
    for (let i = state.tokens.length - 3; i >= 0; i -= 1) {
      const open = state.tokens[i];
      const inline = state.tokens[i + 1];
      const close = state.tokens[i + 2];
      if (
        open?.type !== 'paragraph_open' ||
        inline?.type !== 'inline' ||
        close?.type !== 'paragraph_close' ||
        !(inline.children ?? []).every(
          (child) => child.type === 'text' || child.type === 'softbreak',
        )
      ) {
        continue;
      }
      const lines = inline.content.split('\n');
      const kept = lines.filter((line) => !MEDIA_IMPORT_LINE_RE.test(line.trim()));
      if (kept.length === lines.length) continue;
      if (kept.every((line) => !line.trim())) {
        state.tokens.splice(i, 3);
      } else {
        inline.content = kept.join('\n');
        const textToken = new state.Token('text', '', 0);
        textToken.content = inline.content;
        inline.children = [textToken];
      }
    }

    for (const token of state.tokens) {
      if (token.type === 'html_block') {
        const source = token.content;
        token.content = source.replace(MEDIA_TAG_RE, (_match, name, attrs, offset) => {
          // 同一 HTML 块里可能有独占一行的组件，也有夹在正文里的组件：按行首判断
          const atLineStart = /(?:^|\n)[ \t]*$/u.test(source.slice(0, offset));
          return mediaPlaceholder(name, attrs, !atLineStart);
        });
      } else if (token.type === 'inline') {
        for (const child of token.children ?? []) {
          if (child.type !== 'html_inline') continue;
          child.content = child.content.replace(MEDIA_TAG_RE, (_match, name, attrs) =>
            mediaPlaceholder(name, attrs, true),
          );
        }
      }
    }
  });
}

config({
  markdownItConfig(md) {
    md.set({ html: true });
    mediaPreviewPlugin(md);
    md.core.ruler.after('inline', 'serina-custom-emoji', (state) => {
      for (const blockToken of state.tokens) {
        if (blockToken.type !== 'inline' || !blockToken.children) continue;
        const nextChildren = [];
        for (const token of blockToken.children) {
          if (token.type !== 'text') {
            nextChildren.push(token);
            continue;
          }
          const segments = splitEmojiText(token.content);
          if (!segments.some((segment) => segment.type === 'shortcode')) {
            nextChildren.push(token);
            continue;
          }
          for (const segment of segments) {
            if (segment.type === 'text') {
              const textToken = new state.Token('text', '', 0);
              textToken.content = segment.value;
              nextChildren.push(textToken);
            } else {
              const htmlToken = new state.Token('html_inline', '', 0);
              htmlToken.content = shortcodeImageHtml(segment.shortcode);
              nextChildren.push(htmlToken);
            }
          }
        }
        blockToken.children = nextChildren;
      }
    });
  },
});


const props = defineProps({
  modelValue: { type: String, default: '' },
  slug: { type: String, required: true },
  format: { type: String, default: 'md' },
});
const emit = defineEmits(['update:modelValue', 'save']);

const toast = useToast();
const isDark = useDarkMode();
const editorRef = ref(null);
const pickerOpen = ref(false);
const calloutOpen = ref(false);
const mediaMenuOpen = ref(false);
const mediaOpen = ref(false);
const mediaKind = ref('music');
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
  1,
  2,
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
function openMedia(kind) {
  mediaMenuOpen.value = false;
  if (props.format !== 'mdx') {
    toast.add({
      title: '需要 .mdx 文章',
      description:
        '音乐与 B 站播放器是 MDX 组件，当前文章是 .md。新建文章时选 .mdx，或把文件扩展名改为 .mdx 后再插入。',
      color: 'warning',
      icon: 'i-lucide-file-warning',
    });
    return;
  }
  mediaKind.value = kind;
  mediaOpen.value = true;
}

function insertMedia(snippet) {
  const view = editorRef.value?.getEditorView?.();
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const plan = planMediaInsertion(view.state.doc.toString(), from, to, snippet);
  view.dispatch({
    changes: plan.changes,
    selection: { anchor: plan.anchor },
    scrollIntoView: true,
  });
  view.focus();
  mediaOpen.value = false;
}

const CALLOUT_PRESETS = [
  {
    type: 'warning',
    label: '陶土黄 · 警告 / 声明',
    color: 'var(--wash-clay)',
    template: (body) => `<div class="callout callout-warning">\n  <strong>🤖 声明：</strong>${body}\n</div>\n`,
  },
  {
    type: 'success',
    label: '灰绿 · 成果 / 结论',
    color: 'var(--wash-sage)',
    template: (body) => `<div class="callout callout-success">\n  <strong>结论：</strong>${body}\n</div>\n`,
  },
  {
    type: 'danger',
    label: '豆沙红 · 注意 / 危险',
    color: 'var(--wash-rose)',
    template: (body) => `<div class="callout callout-danger">\n  <strong>注意：</strong>${body}\n</div>\n`,
  },
  {
    type: 'default',
    label: '沙色 · 备忘 / 普通',
    color: 'var(--wash-sand)',
    template: (body) => `<div class="callout">\n  <strong>备忘：</strong>${body}\n</div>\n`,
  },
];

function insertCallout(type) {
  calloutOpen.value = false;
  const preset = CALLOUT_PRESETS.find((p) => p.type === type) ?? CALLOUT_PRESETS[0];
  editorRef.value?.focus();
  editorRef.value?.insert((selectedText) => {
    const body = selectedText.trim() || '提示内容...';
    return {
      targetValue: preset.template(body),
      select: false,
    };
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
        <DropdownToolbar
          title="插入提示框 (Callout)"
          :visible="calloutOpen"
          @onChange="calloutOpen = $event"
        >
          <template #trigger>
            <svg
              class="md-editor-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
          </template>
          <template #overlay>
            <div class="toolbar-menu">
              <button
                v-for="item in CALLOUT_PRESETS"
                :key="item.type"
                type="button"
                class="toolbar-menu-item"
                @click="insertCallout(item.type)"
              >
                <span class="toolbar-menu-dot" :style="{ backgroundColor: item.color }"></span>
                <span>{{ item.label }}</span>
              </button>
            </div>
          </template>
        </DropdownToolbar>
        <DropdownToolbar
          title="插入媒体组件"
          :visible="mediaMenuOpen"
          @onChange="mediaMenuOpen = $event"
        >
          <template #trigger>
            <svg
              class="md-editor-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="m10 9 5 3-5 3V9z" fill="currentColor" stroke="none" />
            </svg>
          </template>
          <template #overlay>
            <div class="toolbar-menu">
              <button
                type="button"
                class="toolbar-menu-item"
                @click="openMedia('music')"
              >
                <UIcon name="i-lucide-music" class="size-4" />
                <span>网易云音乐播放器</span>
              </button>
              <button
                type="button"
                class="toolbar-menu-item"
                @click="openMedia('bilibili')"
              >
                <UIcon name="i-lucide-play" class="size-4" />
                <span>B 站视频播放器</span>
              </button>
            </div>
          </template>
        </DropdownToolbar>
      </template>
    </MdEditor>

    <ShortcodePicker v-model:open="pickerOpen" @select="insertShortcode" />
    <MediaPicker v-model:open="mediaOpen" :kind="mediaKind" @insert="insertMedia" />
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
.toolbar-menu {
  display: flex;
  flex-direction: column;
  min-width: 11.5rem;
  padding: 0.35rem;
  background-color: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e2e8f0);
  border-radius: var(--ui-radius, 0.5rem);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
}

.toolbar-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  color: var(--ui-text, #334155);
  text-align: left;
  transition: background-color 0.15s;
  cursor: pointer;
}

.toolbar-menu-item:hover {
  background-color: var(--ui-bg-elevated, #f1f5f9);
}

.toolbar-menu-dot {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
  flex-shrink: 0;
}
</style>
