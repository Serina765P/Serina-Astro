<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import SitePanel from './panels/SitePanel.vue';

const PLACEHOLDER_TABS = [
  {
    id: 'posts',
    label: '文章',
    kicker: 'Posts',
    icon: 'M6 3h7l5 5v13H6zM13 3v5h5M9 13h6M9 17h4',
    summary: '文章列表、Markdown 双栏编辑、Frontmatter 表单与插图上传将在后续工单接入。',
    points: ['按标题、分类、标签检索', 'md-editor-v3 写作与短代码选择器', 'slug 校验、封面与图片资产'],
  },
  {
    id: 'shuoshuo',
    label: '说说',
    kicker: 'Shuoshuo',
    icon: 'M4 5h16v11H10l-6 5zM8 9h8M8 12h5',
    summary: '说说发布、跨年分片迁移与置顶将在后续工单接入。',
    points: ['东八区时间与 local_ 标识', '分片 count 同步', '全量聚合、编辑与删除'],
  },
  {
    id: 'taxonomy',
    label: 'URI 对照',
    kicker: 'Taxonomy',
    icon: 'M4 11V4h7l9 9-7 7zM8 8h.01',
    summary: '分类与标签的中英文 URI 映射、未映射词条审计将在后续工单接入。',
    points: ['taxonomy.json 增删改', '全站未映射词条扫描', '莫兰迪 wash 色选择'],
  },
  {
    id: 'assets',
    label: '素材管理',
    kicker: 'Assets',
    icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    summary: '表情与贴纸注册表、短代码重命名与正文引用扫描将在后续工单接入。',
    points: ['套装前缀与关键词维护', '两阶段安全重命名', '全站引用扫描'],
  },
];

const SITE_TAB = {
  id: 'site',
  label: '站点与友链',
  kicker: 'Site & Links',
  icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5',
};

const TABS = [...PLACEHOLDER_TABS, SITE_TAB];
const TAB_IDS = new Set(TABS.map((tab) => tab.id));

function tabFromHash() {
  const id = window.location.hash.replace(/^#\/?/u, '');
  return TAB_IDS.has(id) ? id : 'site';
}

const activeId = ref(tabFromHash());
const activeTab = computed(() => TABS.find((tab) => tab.id === activeId.value) ?? SITE_TAB);

function selectTab(id) {
  if (!TAB_IDS.has(id)) return;
  activeId.value = id;
  if (window.location.hash !== `#${id}`) {
    window.history.replaceState(null, '', `#${id}`);
  }
}

function onTabKey(event, index) {
  const handled = [
    'ArrowDown',
    'ArrowRight',
    'ArrowUp',
    'ArrowLeft',
    'Home',
    'End',
  ];
  if (!handled.includes(event.key)) return;
  event.preventDefault();
  let next = index;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    next = (index + 1) % TABS.length;
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    next = (index - 1 + TABS.length) % TABS.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = TABS.length - 1;
  }
  selectTab(TABS[next].id);
  nextTick(() => document.getElementById(`tab-${TABS[next].id}`)?.focus());
}

function syncFromHash() {
  activeId.value = tabFromHash();
}

onMounted(() => {
  if (!window.location.hash) window.history.replaceState(null, '', '#site');
  window.addEventListener('hashchange', syncFromHash);
});

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncFromHash);
});
</script>

<template>
  <div class="shell">
    <aside class="rail">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">芹</span>
        <span class="brand-text">
          <strong>管理后台</strong>
          <span>Serina · Admin</span>
        </span>
      </div>

      <nav class="tab-list" aria-label="管理后台面板" role="tablist" aria-orientation="vertical">
        <button
          v-for="(tab, index) in TABS"
          :id="`tab-${tab.id}`"
          :key="tab.id"
          class="tab"
          type="button"
          role="tab"
          :aria-selected="activeId === tab.id"
          :aria-controls="`panel-${tab.id}`"
          :tabindex="activeId === tab.id ? 0 : -1"
          @click="selectTab(tab.id)"
          @keydown="onTabKey($event, index)"
        >
          <svg
            class="tab-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="tab.icon" />
          </svg>
          <span class="tab-text">
            <span class="tab-label">{{ tab.label }}</span>
            <span class="tab-kicker">{{ tab.kicker }}</span>
          </span>
        </button>
      </nav>

      <footer class="rail-foot">
        <span class="local-badge">
          <span class="local-dot" aria-hidden="true"></span>
          仅本机 · 127.0.0.1:4320
        </span>
        <span>所有改动直接写入工作区文件，不会自动提交或推送。</span>
        <a href="http://127.0.0.1:4321/" target="_blank" rel="noreferrer">博客开发服务器 ↗</a>
      </footer>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ activeTab.kicker }}</p>
          <h1>{{ activeTab.label }}</h1>
        </div>
        <span class="local-chip"><span class="local-dot" aria-hidden="true"></span>本地写入模式</span>
      </header>

      <SitePanel v-show="activeId === 'site'" :active="activeId === 'site'" />

      <section
        v-for="tab in PLACEHOLDER_TABS"
        v-show="activeId === tab.id"
        :id="`panel-${tab.id}`"
        :key="tab.id"
        class="panel placeholder"
        role="tabpanel"
        :aria-labelledby="`tab-${tab.id}`"
        tabindex="0"
      >
        <span class="chip">后续工单</span>
        <h2>{{ tab.label }}</h2>
        <p>{{ tab.summary }}</p>
        <ul>
          <li v-for="point in tab.points" :key="point">{{ point }}</li>
        </ul>
        <p class="placeholder-note">当前工单已交付导航骨架与「站点与友链」完整切片。</p>
      </section>
    </main>
  </div>
</template>
