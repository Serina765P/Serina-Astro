export const TABS = [
  {
    id: 'posts',
    path: '/posts',
    label: '文章',
    icon: 'i-lucide-file-text',
  },
  {
    id: 'shuoshuo',
    path: '/shuoshuo',
    label: '说说',
    icon: 'i-lucide-message-square-text',
  },
  {
    id: 'taxonomy',
    path: '/taxonomy',
    label: 'URI 对照',
    icon: 'i-lucide-tags',
  },
  {
    id: 'assets',
    path: '/assets',
    label: '素材管理',
    icon: 'i-lucide-images',
  },
  {
    id: 'site',
    path: '/site',
    label: '站点与友链',
    icon: 'i-lucide-user-round',
  },
];

export const PLACEHOLDER_TABS = TABS.filter((tab) => tab.placeholder);

export const NAV_ITEMS = TABS.map(({ label, icon, path }) => ({ label, icon, to: path }));
