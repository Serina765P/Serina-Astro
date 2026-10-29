<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { fetchSiteInfo, saveSiteInfo } from '../api.js';

const toast = useToast();

const formElement = ref(null);
const socialList = ref(null);
const friendList = ref(null);

const status = ref('loading');
const statusMessage = ref('');
const saving = ref(false);
const snapshot = ref('');

const LIMITS = { description: 2000, name: 120, href: 2048 };
const ICON_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*';

const form = reactive({
  description: '',
  social: [],
  friendLinks: [],
});

function serialize() {
  return JSON.stringify({
    description: form.description,
    social: form.social,
    friendLinks: form.friendLinks,
  });
}

const dirty = computed(() => status.value === 'ready' && serialize() !== snapshot.value);

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

function fillForm(data) {
  form.description = typeof data.description === 'string' ? data.description : '';
  form.social = Array.isArray(data.social)
    ? data.social.map((item) => ({
        name: item?.name ?? '',
        icon: item?.icon ?? '',
        href: item?.href ?? '',
      }))
    : [];
  form.friendLinks = Array.isArray(data.friendLinks)
    ? data.friendLinks.map((item) => ({
        name: item?.name ?? '',
        href: item?.href ?? '',
      }))
    : [];
}

function apply(data) {
  fillForm(data);
  snapshot.value = serialize();
  status.value = 'ready';
}

async function load() {
  status.value = 'loading';
  statusMessage.value = '';
  try {
    apply(await fetchSiteInfo());
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '读取失败';
    status.value = 'error';
  }
}

async function refresh() {
  if (status.value !== 'ready' || dirty.value || saving.value) return;
  try {
    const data = await fetchSiteInfo();
    if (dirty.value || saving.value) return;
    apply(data);
  } catch (error) {
    toast.add({
      title: '刷新失败',
      description: error instanceof Error ? error.message : '读取失败',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
  }
}

function buildPatch() {
  const saved = JSON.parse(snapshot.value);
  const patch = {};
  if (form.description !== saved.description) patch.description = form.description;
  if (JSON.stringify(form.social) !== JSON.stringify(saved.social)) patch.social = form.social;
  if (JSON.stringify(form.friendLinks) !== JSON.stringify(saved.friendLinks)) {
    patch.friendLinks = form.friendLinks;
  }
  return patch;
}

async function save() {
  if (saving.value || status.value !== 'ready' || !dirty.value) return;
  if (formElement.value && !formElement.value.reportValidity()) return;
  const patch = buildPatch();
  if (Object.keys(patch).length === 0) return;
  saving.value = true;
  try {
    apply(await saveSiteInfo(patch));
    toast.add({
      title: '已保存',
      description: 'src/data/site-info.json',
      color: 'success',
      icon: 'i-lucide-check-circle',
    });
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error instanceof Error ? error.message : '保存失败',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    });
  } finally {
    saving.value = false;
  }
}

function reset() {
  fillForm(JSON.parse(snapshot.value));
}

async function addSocial() {
  form.social.push({ name: '', icon: '', href: '' });
  await nextTick();
  const rows = socialList.value?.querySelectorAll('.link-row--social');
  rows?.[rows.length - 1]?.querySelector('input')?.focus();
}

async function addFriendLink() {
  form.friendLinks.push({ name: '', href: '' });
  await nextTick();
  const rows = friendList.value?.querySelectorAll('.link-row--friend');
  rows?.[rows.length - 1]?.querySelector('input')?.focus();
}

function removeSocial(index) {
  form.social.splice(index, 1);
}

function removeFriendLink(index) {
  form.friendLinks.splice(index, 1);
}

function onKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save();
  }
}

function onWindowFocus() {
  void refresh();
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
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('focus', onWindowFocus);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<template>
  <UDashboardPanel id="site">
    <template #header>
      <UDashboardNavbar title="站点与友链">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge color="neutral" variant="subtle" icon="i-lucide-hard-drive">
            本地写入
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="max-w-5xl py-6">
        <div v-if="status === 'loading'" class="space-y-6" role="status">
          <USkeleton class="h-44 w-full rounded-xl" />
          <USkeleton class="h-64 w-full rounded-xl" />
          <USkeleton class="h-44 w-full rounded-xl" />
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
            @click="load"
          />
        </div>

        <form
          v-else
          id="site-info-form"
          ref="formElement"
          class="space-y-6"
          novalidate
          @submit.prevent="save"
        >
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-highlighted">个人简介</h2>
                  <p class="mt-0.5 text-xs text-muted">首页侧栏与关于页共用的自我介绍。</p>
                </div>
                <span class="text-xs text-muted tabular-nums">
                  {{ form.description.length }} / {{ LIMITS.description }}
                </span>
              </div>
            </template>

            <UFormField name="description" label="简介" required>
              <UTextarea
                v-model="form.description"
                :rows="4"
                autoresize
                :maxrows="8"
                :maxlength="LIMITS.description"
                required
                class="w-full"
                placeholder="用一两句话介绍自己…"
              />
            </UFormField>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-highlighted">社交外链</h2>
                  <p class="mt-0.5 text-xs text-muted">
                    侧栏图标入口。图标使用 Iconify 名称，例如
                    <code class="rounded bg-elevated px-1 py-0.5 text-[11px]">simple-icons:github</code>。
                  </p>
                </div>
                <UBadge color="neutral" variant="subtle">{{ form.social.length }} 条</UBadge>
              </div>
            </template>

            <p
              v-if="form.social.length === 0"
              class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
            >
              还没有社交外链，点击下方按钮添加。
            </p>
            <div v-else ref="socialList" class="space-y-3">
              <div
                v-for="(item, index) in form.social"
                :key="`social-${index}`"
                class="link-row link-row--social rounded-lg border border-default bg-elevated/40 p-3"
              >
                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-end">
                  <UFormField label="名称" required>
                    <UInput
                      v-model="item.name"
                      :maxlength="LIMITS.name"
                      required
                      placeholder="GitHub"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="图标" required>
                    <UInput
                      v-model="item.icon"
                      :maxlength="LIMITS.name"
                      required
                      spellcheck="false"
                      autocomplete="off"
                      :pattern="ICON_PATTERN"
                      placeholder="simple-icons:github"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="链接" required>
                    <UInput
                      v-model="item.href"
                      :maxlength="LIMITS.href"
                      required
                      spellcheck="false"
                      autocomplete="off"
                      pattern="(https?://|mailto:).+"
                      placeholder="https://example.com"
                      class="w-full"
                    />
                  </UFormField>
                  <UButton
                    class="justify-self-end"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    square
                    :aria-label="`删除社交外链 ${item.name || index + 1}`"
                    @click="removeSocial(index)"
                  />
                </div>
              </div>
            </div>

            <UButton
              class="mt-3"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              label="添加社交外链"
              @click="addSocial"
            />
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-highlighted">友情链接</h2>
                  <p class="mt-0.5 text-xs text-muted">
                    展示在
                    <code class="rounded bg-elevated px-1 py-0.5 text-[11px]">/links/</code>
                    页面。链接必须使用 http(s) 地址。
                  </p>
                </div>
                <UBadge color="neutral" variant="subtle">{{ form.friendLinks.length }} 条</UBadge>
              </div>
            </template>

            <p
              v-if="form.friendLinks.length === 0"
              class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
            >
              还没有友情链接，点击下方按钮添加。
            </p>
            <div v-else ref="friendList" class="space-y-3">
              <div
                v-for="(item, index) in form.friendLinks"
                :key="`friend-${index}`"
                class="link-row link-row--friend rounded-lg border border-default bg-elevated/40 p-3"
              >
                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
                  <UFormField label="名称" required>
                    <UInput
                      v-model="item.name"
                      :maxlength="LIMITS.name"
                      required
                      placeholder="站点名称"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="链接" required>
                    <UInput
                      v-model="item.href"
                      :maxlength="LIMITS.href"
                      required
                      spellcheck="false"
                      autocomplete="off"
                      pattern="https?://.+"
                      placeholder="https://example.com/"
                      class="w-full"
                    />
                  </UFormField>
                  <UButton
                    class="justify-self-end"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    square
                    :aria-label="`删除友链 ${item.name || index + 1}`"
                    @click="removeFriendLink(index)"
                  />
                </div>
              </div>
            </div>

            <UButton
              class="mt-3"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              label="添加友情链接"
              @click="addFriendLink"
            />
          </UCard>
        </form>
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
            写入 src/data/site-info.json · 原子替换 · 2 空格缩进
          </span>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-undo-2"
            label="撤销修改"
            :disabled="!dirty || saving"
            @click="reset"
          />
          <UButton
            type="submit"
            form="site-info-form"
            color="primary"
            icon="i-lucide-save"
            label="保存更改"
            :loading="saving"
            :disabled="!dirty || saving"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
