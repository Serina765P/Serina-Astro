<script setup>
import { computed, ref, watch } from 'vue';
import playlist from '../../../src/data/music/netease-playlist.json';
import { MEDIA_COMPONENTS, mediaSnippet } from '../../../src/lib/mdx-media.ts';
import { NETEASE_PLAYLIST_ID } from '../../../src/lib/music.ts';
import { errorMessage } from '../errors.js';

const TRACK_OPTIONS = playlist.items.map((item) => ({
  label: `${item.title} — ${item.artist}`,
  value: item.id,
}));

const open = defineModel('open', { type: Boolean, default: false });
const props = defineProps({
  kind: { type: String, required: true },
});
const emit = defineEmits(['insert']);

const musicMode = ref('playlist');
const track = ref('');
const bvid = ref('');
const page = ref('1');
const title = ref('');
const cover = ref('');

const label = computed(() => MEDIA_COMPONENTS[props.kind]?.label ?? '媒体组件');

const result = computed(() => {
  try {
    if (props.kind === 'music') {
      const selected = track.value == null ? '' : String(track.value).trim();
      if (musicMode.value === 'track' && !selected) return {};
      return {
        snippet: mediaSnippet({
          kind: 'music',
          track: musicMode.value === 'track' ? selected : '',
        }),
      };
    }
    if (!bvid.value.trim()) return {};
    return {
      snippet: mediaSnippet({
        kind: 'bilibili',
        bvid: bvid.value,
        p: `${page.value ?? ''}`.trim() || 1,
        title: title.value,
        cover: cover.value,
      }),
    };
  } catch (error) {
    return { error: errorMessage(error) };
  }
});

watch(open, (value) => {
  if (!value) return;
  musicMode.value = 'playlist';
  track.value = '';
  bvid.value = '';
  page.value = '1';
  title.value = '';
  cover.value = '';
});

function confirm() {
  const snippet = result.value.snippet;
  if (!snippet) return;
  emit('insert', snippet);
  open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`插入：${label}`"
    description="组件标签插入到光标处；缺少 import 时自动补在正文顶部。只适用于 .mdx 文章。"
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <div class="space-y-4">
        <template v-if="kind === 'music'">
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              type="button"
              icon="i-lucide-list-music"
              label="整张歌单"
              :color="musicMode === 'playlist' ? 'primary' : 'neutral'"
              :variant="musicMode === 'playlist' ? 'subtle' : 'ghost'"
              :aria-pressed="musicMode === 'playlist'"
              @click="musicMode = 'playlist'"
            />
            <UButton
              type="button"
              icon="i-lucide-disc-3"
              label="单曲"
              :color="musicMode === 'track' ? 'primary' : 'neutral'"
              :variant="musicMode === 'track' ? 'subtle' : 'ghost'"
              :aria-pressed="musicMode === 'track'"
              @click="musicMode = 'track'"
            />
          </div>
          <p v-if="musicMode === 'playlist'" class="text-sm text-muted">
            插入全站固定歌单 {{ NETEASE_PLAYLIST_ID }}，读者可展开曲目列表逐首播放。
          </p>
          <UFormField
            v-else
            label="曲目"
            required
            help="来自全站歌单快照；运行 npm run music:snapshot 刷新快照。"
          >
            <USelectMenu
              v-model="track"
              :items="TRACK_OPTIONS"
              value-key="value"
              placeholder="搜索歌名或歌手"
              class="w-full"
              aria-label="网易云曲目"
            />
          </UFormField>
        </template>

        <template v-else>
          <UFormField label="BV 号" required help="形如 BV1aYxg6DEXb。">
            <UInput
              v-model="bvid"
              placeholder="BV1aYxg6DEXb"
              spellcheck="false"
              autocomplete="off"
              class="w-full"
              aria-label="B 站 BV 号"
              @keydown.enter.prevent="confirm"
            />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]">
            <UFormField label="分 P" help="从 1 开始">
              <UInput
                v-model="page"
                type="number"
                min="1"
                step="1"
                class="w-full"
                aria-label="B 站分 P"
                @keydown.enter.prevent="confirm"
              />
            </UFormField>
            <UFormField label="标题（可选）" help="用于播放器的可访问标题。">
              <UInput
                v-model="title"
                placeholder="不填则按 BV 号生成"
                class="w-full"
                aria-label="视频标题"
                @keydown.enter.prevent="confirm"
              />
            </UFormField>
          </div>
          <UFormField
            label="封面 URL（可选）"
            help="B 站视频封面绝对地址，例如 https://i0.hdslb.com/bfs/archive/….jpg；不填则入口保持纯色。"
          >
            <UInput
              v-model="cover"
              type="url"
              placeholder="https://i0.hdslb.com/bfs/archive/…"
              spellcheck="false"
              autocomplete="off"
              class="w-full"
              aria-label="视频封面地址"
              @keydown.enter.prevent="confirm"
            />
          </UFormField>
        </template>

        <UAlert
          v-if="result.error"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="result.error"
        />
        <div v-else-if="result.snippet" class="space-y-1.5">
          <p class="text-xs font-medium text-muted">将插入</p>
          <pre
            class="overflow-x-auto rounded-lg border border-default bg-elevated/50 p-2.5 text-xs leading-5 text-default"
          >{{ result.snippet.tag }}</pre>
        </div>
        <p v-else class="text-xs text-muted">填写必填项后，这里会预览将插入的标签。</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          label="取消"
          @click="open = false"
        />
        <UButton
          type="button"
          color="primary"
          icon="i-lucide-corner-down-left"
          label="插入正文"
          :disabled="!result.snippet"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
