<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { fetchSiteInfo, saveSiteInfo } from '../api.js';

const props = defineProps({
  active: { type: Boolean, default: false },
});

const formElement = ref(null);
const socialList = ref(null);
const friendList = ref(null);

const status = ref('loading');
const statusMessage = ref('');
const saving = ref(false);
const notice = ref('');
const noticeKind = ref('success');
const snapshot = ref('');

const LIMITS = { description: 2000, name: 120, href: 2048 };
const ICON_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*';

const form = reactive({
  description: '',
  social: [],
  friendLinks: [],
});

let noticeTimer = 0;

function serialize() {
  return JSON.stringify({
    description: form.description,
    social: form.social,
    friendLinks: form.friendLinks,
  });
}

const dirty = computed(() => status.value === 'ready' && serialize() !== snapshot.value);
const statusTone = computed(() => {
  if (notice.value) return noticeKind.value;
  return dirty.value ? 'dirty' : 'synced';
});
const statusText = computed(() => {
  if (notice.value) return notice.value;
  return dirty.value ? '有未保存的修改' : '已与磁盘同步';
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

function flash(message, kind = 'success') {
  notice.value = message;
  noticeKind.value = kind;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = '';
  }, 5000);
}

async function load() {
  status.value = 'loading';
  statusMessage.value = '';
  notice.value = '';
  try {
    apply(await fetchSiteInfo());
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '读取失败';
    status.value = 'error';
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

async function refresh() {
  if (!props.active || status.value !== 'ready' || dirty.value || saving.value) return;
  try {
    const data = await fetchSiteInfo();
    if (!props.active || dirty.value || saving.value) return;
    apply(data);
  } catch (error) {
    flash(error instanceof Error ? `刷新失败：${error.message}` : '刷新失败', 'error');
  }
}

async function save() {
  if (saving.value || status.value !== 'ready' || !dirty.value) return;
  if (formElement.value && !formElement.value.reportValidity()) return;
  const patch = buildPatch();
  if (Object.keys(patch).length === 0) return;
  saving.value = true;
  notice.value = '';
  try {
    apply(await saveSiteInfo(patch));
    flash('已保存到 src/data/site-info.json');
  } catch (error) {
    flash(error instanceof Error ? error.message : '保存失败', 'error');
  } finally {
    saving.value = false;
  }
}

function reset() {
  fillForm(JSON.parse(snapshot.value));
  notice.value = '';
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
  if (!props.active) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save();
  }
}

function onWindowFocus() {
  if (props.active) void refresh();
}

function onBeforeUnload(event) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

watch(form, () => {
  if (notice.value && dirty.value) notice.value = '';
}, { deep: true });

watch(() => props.active, (active) => {
  if (active) void refresh();
});

onMounted(() => {
  void load();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
  window.clearTimeout(noticeTimer);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('focus', onWindowFocus);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<template>
  <section id="panel-site" class="panel site-panel" role="tabpanel" aria-labelledby="tab-site">
    <div v-if="status === 'loading'" class="state-card" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <p>正在读取 <code>src/data/site-info.json</code>…</p>
    </div>

    <div v-else-if="status === 'error'" class="state-card state-card--error" role="alert">
      <h2>读取失败</h2>
      <p>{{ statusMessage }}</p>
      <button class="button button--ghost" type="button" @click="load">重新读取</button>
    </div>

    <form v-else ref="formElement" class="site-form" novalidate @submit.prevent="save">
      <section class="card">
        <header class="card-head">
          <div>
            <h2>个人简介</h2>
            <p>首页侧栏与关于页共用的自我介绍。</p>
          </div>
          <span class="counter">{{ form.description.length }} / {{ LIMITS.description }}</span>
        </header>
        <label class="field">
          <span class="field-label">简介</span>
          <textarea
            v-model="form.description"
            rows="4"
            :maxlength="LIMITS.description"
            required
            placeholder="用一两句话介绍自己…"
          ></textarea>
        </label>
      </section>

      <section class="card">
        <header class="card-head">
          <div>
            <h2>社交外链</h2>
            <p>
              侧栏图标入口。图标使用 Iconify 名称，例如
              <code>simple-icons:github</code>。
            </p>
          </div>
          <span class="count-badge">{{ form.social.length }} 条</span>
        </header>

        <p v-if="form.social.length === 0" class="empty">还没有社交外链，点击下方按钮添加。</p>
        <div v-else ref="socialList" class="link-list">
          <div
            v-for="(item, index) in form.social"
            :key="`social-${index}`"
            class="link-row link-row--social"
          >
            <span class="row-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <label class="field">
              <span class="field-label">名称</span>
              <input v-model="item.name" :maxlength="LIMITS.name" required placeholder="GitHub" />
            </label>
            <label class="field">
              <span class="field-label">图标</span>
              <input
                v-model="item.icon"
                :maxlength="LIMITS.name"
                required
                spellcheck="false"
                autocomplete="off"
                :pattern="ICON_PATTERN"
                placeholder="simple-icons:github"
              />
            </label>
            <label class="field field--href">
              <span class="field-label">链接</span>
              <input
                v-model="item.href"
                :maxlength="LIMITS.href"
                required
                spellcheck="false"
                autocomplete="off"
                pattern="(https?://|mailto:).+"
                placeholder="https://example.com"
              />
            </label>
            <button
              class="remove"
              type="button"
              :aria-label="`删除社交外链 ${item.name || index + 1}`"
              @click="removeSocial(index)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <button class="button button--dashed" type="button" @click="addSocial">
          ＋ 添加社交外链
        </button>
      </section>

      <section class="card">
        <header class="card-head">
          <div>
            <h2>友情链接</h2>
            <p>展示在 <code>/links/</code> 页面。链接必须使用 http(s) 地址。</p>
          </div>
          <span class="count-badge">{{ form.friendLinks.length }} 条</span>
        </header>

        <p v-if="form.friendLinks.length === 0" class="empty">
          还没有友情链接，点击下方按钮添加。
        </p>
        <div v-else ref="friendList" class="link-list">
          <div
            v-for="(item, index) in form.friendLinks"
            :key="`friend-${index}`"
            class="link-row link-row--friend"
          >
            <span class="row-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <label class="field">
              <span class="field-label">名称</span>
              <input v-model="item.name" :maxlength="LIMITS.name" required placeholder="站点名称" />
            </label>
            <label class="field">
              <span class="field-label">链接</span>
              <input
                v-model="item.href"
                :maxlength="LIMITS.href"
                required
                spellcheck="false"
                autocomplete="off"
                pattern="https?://.+"
                placeholder="https://example.com/"
              />
            </label>
            <button
              class="remove"
              type="button"
              :aria-label="`删除友链 ${item.name || index + 1}`"
              @click="removeFriendLink(index)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <button class="button button--dashed" type="button" @click="addFriendLink">
          ＋ 添加友情链接
        </button>
      </section>

      <footer class="savebar">
        <p
          class="savebar-status"
          :class="`savebar-status--${statusTone}`"
          role="status"
          :aria-live="noticeKind === 'error' && notice ? 'assertive' : 'polite'"
        >
          {{ statusText }}
        </p>
        <div class="savebar-actions">
          <span class="savebar-hint" aria-hidden="true">⌘ / Ctrl + S</span>
          <button class="button button--ghost" type="button" :disabled="!dirty || saving" @click="reset">
            撤销修改
          </button>
          <button class="button button--primary" type="submit" :disabled="!dirty || saving">
            <span v-if="saving" class="spinner spinner--small" aria-hidden="true"></span>
            {{ saving ? '保存中…' : '保存更改' }}
          </button>
        </div>
      </footer>
      <p class="footnote">
        写入 <code>src/data/site-info.json</code> · 原子替换 · 2 空格缩进 · 不触碰
        <code>heroTitle</code> / <code>heroMark</code>
      </p>
    </form>
  </section>
</template>
