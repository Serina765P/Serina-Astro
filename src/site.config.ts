// 站点配置：菜单、侧栏、页脚、评论、分类/标签 slug 映射等集中于此。
// 结构沿用旧主题配置文件（MD3 风格 Hexo 主题 _config.yml），图标名为 Material Symbols。

export const SITE = {
  title: "SerinaP's Blog",
  subtitle: '芹菜P的部落阁',
  description: '已经不再是低眉顺眼的昨日，从今天开始我的传说',
  author: '芹菜P',
  keywords: ['blog', '博客', '个人博客', '芹菜P', '偶像大师', 'THE iDOLM@STER'],
  url: 'https://blog.serinap.top',
  lang: 'zh-CN',
  since: 2025,
};

export const HERO = {
  avatar: '/images/fav.webp',
  image: '/images/hero.webp',
};

export const NAV = [
  { label: '首页', icon: 'home', href: '/' },
  { label: '归档', icon: 'archive', href: '/archives/' },
  { label: '分类', icon: 'category', href: '/categories/' },
  { label: '标签', icon: 'label', href: '/tags/' },
  { label: '友链', icon: 'link', href: '/links/' },
  { label: '说说', icon: 'chat', href: '/shuoshuo/' },
  { label: '关于', icon: 'person', href: '/about/' },
];

export const SIDEBAR = {
  description: '这里是芹菜P，偶像大师新人制作人，\n涉猎广而不精的业余爱好者。\n写博客记录生活和学习的点滴。',
  social: [
    { name: 'GitHub', icon: 'simple-icons:github', href: 'https://github.com/Serina765P' },
    {
      name: 'QQ',
      icon: 'simple-icons:tencentqq',
      href: 'http://wpa.qq.com/msgrd?v=3&uin=2241439211&site=qq&menu=yes',
    },
    { name: 'X', icon: 'simple-icons:x', href: 'https://x.com/Serina765P' },
    { name: '邮箱', icon: 'material-symbols:mail', href: 'mailto:serinap@qq.com' },
  ],
  friendLinks: [{ name: '偶像大师中文维基', href: 'https://wikimas.org' }],
};

export const GISCUS = {
  enable: true,
  repo: 'Serina765P/SerinaP-Blog',
  repoId: 'R_kgDOQi6hvw',
  category: 'Announcements',
  categoryId: 'DICkwDOQi6hv84CzbAr',
  mapping: 'pathname',
  strict: '0',
  reactionsEnabled: '1',
  inputPosition: 'top',
  lang: 'zh-CN',
};

// 中文分类/标签 → URL slug（沿用旧站 _config.yml 的映射，保证 URL 不变）
export const CATEGORY_SLUGS: Record<string, string> = {
  公告: 'notice',
  资源分享: 'resources',
  技术分享: 'tech',
  学习笔记: 'notes',
};

export const TAG_SLUGS: Record<string, string> = {
  站务: 'site',
  偶像大师: 'idolmaster',
  学园偶像大师: 'gakumas',
  '765AS': '765as',
  'Hi-Res': 'hi-res',
  CD: 'cd',
  音乐资源: 'music',
  音频处理: 'audio',
  FFmpeg: 'ffmpeg',
  Windows: 'windows',
  输入法: 'input-method',
  Rime: 'rime',
  数据结构: 'data-structure',
  课堂笔记: 'lecture-notes',
  题库: 'question-bank',
};

export function categorySlug(name: string): string {
  return CATEGORY_SLUGS[name] ?? name;
}

export function tagSlug(name: string): string {
  return TAG_SLUGS[name] ?? name;
}
