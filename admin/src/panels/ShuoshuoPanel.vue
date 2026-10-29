<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { yearInShanghai } from '../../../src/lib/utils.ts';
import {
  createShuoshuo,
  deleteShuoshuo,
  fetchShuoshuo,
  updateShuoshuo,
} from '../api.js';

const toast = useToast();

const LIMITS = { title: 200, content: 20000 };
const SHANGHAI = 'Asia/Shanghai';

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SHANGHAI,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const inputFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const status = ref('loading');
const statusMessage = ref('');
const items = ref([]);

const publishing = ref(false);
const publishForm = reactive({ title: '', content: '' });

const editingId = ref(null);
const editForm = reactive({ title: '', content: '', publishedAt: '' });
const editSnapshot = ref({ title: '', content: '', publishedAt: '' });
const savingId = ref(null);

const confirmingDeleteId = ref(null);
const deletingId = ref(null);

const publishYear = ref(yearInShanghai(new Date()));
const canPublish = computed(() => publishForm.content.trim().length > 0 && !publishing.value);

function itemYear(item) {
  return yearInShanghai(new Date(item.published_at));
}

function formatPublished(iso) {
  return dateTimeFormatter.format(new Date(iso));
}

/** ISO → <input type="datetime-local"> 的东八区值（精确到分钟）。 */
function toDatetimeLocal(iso) {
  const parts = Object.fromEntries(
    inputFormatter
      .formatToParts(new Date(iso))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** datetime-local 没有时区；后台与站点统一按东八区解释。 */
function fromDatetimeLocal(value) {
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}+08:00`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : '操作失败';
}

async function load({ silent = false } = {}) {
  publishYear.value = yearInShanghai(new Date());
  if (!silent) {
    status.value = 'loading';
    statusMessage.value = '';
  }
  try {
    const data = await fetchShuoshuo();
    items.value = Array.isArray(data.items) ? data.items : [];
    status.value = 'ready';
  } catch (error) {
    if (silent) {
      toast.add({
        title: '刷新失败',
        description: errorMessage(error),
        color: 'error',
        icon: 'i-lucide-alert-circle',
      });
      return;
    }
    statusMessage.value = errorMessage(error);
    status.value = 'error';
  }
}

async function publish() {
  const content = publishForm.content.trim();
  if (!content || publishing.value) return;
  publishYear.value = yearInShanghai(new Date());
  publishing.value = true;
  try {
    const result = await createShuoshuo({ title: publishForm.title.trim(), content });
    publishForm.title = '';
    publishForm.content = '';
    await load({ silent: true });
    toast.add({
      title: '已发布',
      description: `写入 ${result.year}.json 分片 · 东八区 ${formatPublished(result.item.published_at)}`,
      color: 'success',
      icon: 'i-lucide-check-circle',
    });
  } catch (error) {
    toast.add({
      title: '发布失败',
      description: errorMessage(error),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
  } finally {
    publishing.value = false;
  }
}

function startEdit(item) {
  confirmingDeleteId.value = null;
  editingId.value = item.id;
  editForm.title = item.title ?? '';
  editForm.content = item.content ?? '';
  editForm.publishedAt = toDatetimeLocal(item.published_at);
  editSnapshot.value = {
    title: editForm.title,
    content: editForm.content,
    publishedAt: editForm.publishedAt,
  };
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit(item) {
  if (savingId.value) return;
  if (!editForm.content.trim()) {
    toast.add({
      title: '内容不能为空',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
    return;
  }
  if (!editForm.publishedAt) {
    toast.add({
      title: '发布时间不能为空',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
    return;
  }

  const patch = {};
  if (editForm.title !== editSnapshot.value.title) patch.title = editForm.title;
  if (editForm.content !== editSnapshot.value.content) patch.content = editForm.content;
  if (editForm.publishedAt !== editSnapshot.value.publishedAt) {
    patch.published_at = fromDatetimeLocal(editForm.publishedAt);
  }
  if (Object.keys(patch).length === 0) {
    editingId.value = null;
    return;
  }

  savingId.value = item.id;
  try {
    const result = await updateShuoshuo(item.id, patch);
    editingId.value = null;
    await load({ silent: true });
    const moved = result.fromYear !== null && result.fromYear !== result.year;
    toast.add({
      title: moved ? '已跨年迁移' : '已保存',
      description: moved
        ? `条目已从 ${result.fromYear}.json 迁移到 ${result.year}.json`
        : `东八区 ${formatPublished(result.item.published_at)}`,
      color: 'success',
      icon: moved ? 'i-lucide-folder-symlink' : 'i-lucide-check-circle',
    });
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: errorMessage(error),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
  } finally {
    savingId.value = null;
  }
}

function requestDelete(item) {
  editingId.value = null;
  confirmingDeleteId.value = item.id;
}

async function confirmDelete(item) {
  if (deletingId.value) return;
  deletingId.value = item.id;
  try {
    const result = await deleteShuoshuo(item.id);
    confirmingDeleteId.value = null;
    await load({ silent: true });
    toast.add({
      title: '已删除',
      description: `已从 ${result.years.map((year) => `${year}.json`).join('、')} 移除`,
      color: 'success',
      icon: 'i-lucide-trash-2',
    });
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: errorMessage(error),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
  } finally {
    deletingId.value = null;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <UDashboardPanel id="shuoshuo">
    <template #header>
      <UDashboardNavbar title="说说">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UBadge color="neutral" variant="subtle" icon="i-lucide-message-square-text">
              {{ items.length }} 条
            </UBadge>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              square
              aria-label="刷新说说列表"
              :loading="status === 'loading'"
              @click="load()"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="max-w-5xl py-6">
        <div class="space-y-6">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-sm font-semibold text-highlighted">发布新说说</h2>
                <p class="mt-0.5 text-xs text-muted">
                  发布后立即写入当前上海年份分片，并置顶到该分片最前。
                </p>
              </div>
            </template>

            <form id="publish-shuoshuo" class="space-y-4" @submit.prevent="publish">
              <UFormField label="内容" required>
                <UTextarea
                  v-model="publishForm.content"
                  :rows="3"
                  autoresize
                  :maxrows="8"
                  :maxlength="LIMITS.content"
                  required
                  placeholder="现在在想什么…"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="标题（可选）">
                <UInput
                  v-model="publishForm.title"
                  :maxlength="LIMITS.title"
                  placeholder="给这条说说起个标题"
                  class="w-full"
                />
              </UFormField>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-xs text-muted">
                  发布时间自动取东八区当前时刻，写入
                  <code class="rounded bg-elevated px-1 py-0.5 text-[11px]">
                    src/data/shuoshuo/{{ publishYear }}.json
                  </code>
                </p>
                <UButton
                  type="submit"
                  icon="i-lucide-send"
                  label="发布说说"
                  :loading="publishing"
                  :disabled="!canPublish"
                />
              </div>
            </form>
          </UCard>

          <section class="space-y-4" aria-labelledby="shuoshuo-feed-title">
            <div class="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="shuoshuo-feed-title" class="text-base font-semibold text-highlighted">
                  全部说说
                </h2>
                <p class="mt-0.5 text-xs text-muted">
                  聚合 <code class="rounded bg-elevated px-1 py-0.5 text-[11px]">src/data/shuoshuo/*.json</code>，
                  按发布时间倒序。
                </p>
              </div>
              <span class="text-xs text-muted tabular-nums">{{ items.length }} 条</span>
            </div>

            <div v-if="status === 'loading'" class="space-y-3" role="status">
              <USkeleton class="h-32 w-full rounded-xl" />
              <USkeleton class="h-32 w-full rounded-xl" />
              <USkeleton class="h-32 w-full rounded-xl" />
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
                color="neutral"
                variant="outline"
                icon="i-lucide-refresh-cw"
                label="重新读取"
                @click="load()"
              />
            </div>

            <UCard v-else-if="items.length === 0">
              <div class="flex flex-col items-center gap-2 py-8 text-center">
                <UIcon name="i-lucide-message-square-dashed" class="size-8 text-muted" />
                <p class="text-sm text-muted">还没有说说，发布第一条吧。</p>
              </div>
            </UCard>

            <div v-else class="space-y-3">
              <UCard v-for="item in items" :key="item.id">
                <template #header>
                  <div v-if="editingId !== item.id" class="flex items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                      <h3 class="truncate text-sm font-semibold text-highlighted">
                        {{ item.title || '（无标题）' }}
                      </h3>
                      <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <UBadge color="neutral" variant="subtle">
                          {{ itemYear(item) }}
                        </UBadge>
                        <UBadge v-if="item.type === 'MAIL'" color="primary" variant="subtle">
                          MAIL
                        </UBadge>
                        <time :datetime="item.published_at">
                          {{ formatPublished(item.published_at) }}
                        </time>
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                      <UButton
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-pencil"
                        square
                        :aria-label="`编辑说说 ${item.id}`"
                        @click="startEdit(item)"
                      />
                      <UButton
                        color="error"
                        variant="ghost"
                        icon="i-lucide-trash-2"
                        square
                        :aria-label="`删除说说 ${item.id}`"
                        @click="requestDelete(item)"
                      />
                    </div>
                  </div>
                  <div v-else class="flex items-center justify-between gap-2">
                    <h3 class="text-sm font-semibold text-highlighted">编辑说说</h3>
                    <UBadge color="neutral" variant="subtle">
                      {{ itemYear(item) }}
                    </UBadge>
                  </div>
                </template>

                <form
                  v-if="editingId === item.id"
                  class="space-y-4"
                  @submit.prevent="saveEdit(item)"
                >
                  <UFormField label="标题">
                    <UInput
                      v-model="editForm.title"
                      :maxlength="LIMITS.title"
                      placeholder="给这条说说起个标题"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="内容" required>
                    <UTextarea
                      v-model="editForm.content"
                      :rows="3"
                      autoresize
                      :maxrows="10"
                      :maxlength="LIMITS.content"
                      required
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="发布时间（东八区）" required>
                    <UInput
                      v-model="editForm.publishedAt"
                      type="datetime-local"
                      step="60"
                      required
                      class="w-full sm:max-w-xs"
                    />
                  </UFormField>
                  <p class="text-xs text-muted">
                    修改到其它年份时，条目会自动从旧分片迁移到目标年份分片，计数同步刷新。
                  </p>
                  <div class="flex items-center justify-end gap-2">
                    <UButton
                      color="neutral"
                      variant="outline"
                      label="取消"
                      :disabled="savingId === item.id"
                      @click="cancelEdit"
                    />
                    <UButton
                      type="submit"
                      icon="i-lucide-save"
                      label="保存"
                      :loading="savingId === item.id"
                      :disabled="savingId === item.id"
                    />
                  </div>
                </form>

                <p v-else class="whitespace-pre-wrap break-words text-sm leading-6 text-default">
                  {{ item.content }}
                </p>

                <template v-if="editingId !== item.id" #footer>
                  <div
                    v-if="confirmingDeleteId === item.id"
                    class="flex flex-wrap items-center justify-between gap-2"
                  >
                    <p class="text-xs text-error">删除后无法恢复，确定移除这条说说？</p>
                    <div class="flex items-center gap-2">
                      <UButton
                        color="neutral"
                        variant="outline"
                        label="取消"
                        :disabled="deletingId === item.id"
                        @click="confirmingDeleteId = null"
                      />
                      <UButton
                        color="error"
                        icon="i-lucide-trash-2"
                        label="确认删除"
                        :loading="deletingId === item.id"
                        :disabled="deletingId === item.id"
                        @click="confirmDelete(item)"
                      />
                    </div>
                  </div>
                  <p v-else class="text-[11px] break-all text-muted">ID {{ item.id }}</p>
                </template>
              </UCard>
            </div>
          </section>
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
