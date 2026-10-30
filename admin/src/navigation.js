export const TABS = [
  {
    id: 'posts',
    path: '/posts',
    label: '文章',
    icon: 'i-lucide-file-text',
    placeholder: true,
    summary: '文章列表、Markdown 双栏编辑、Frontmatter 表单与插图上传将在后续工单接入。',
    points: ['按标题、分类、标签检索', 'Markdown 写作与短代码选择器', 'slug 校验、封面与图片资产'],
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
    placeholder: true,
    summary: '表情与贴纸注册表、短代码重命名与正文引用扫描将在后续工单接入。',
    points: ['套装前缀与关键词维护', '两阶段安全重命名', '全站引用扫描'],
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
