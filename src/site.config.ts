// 站点配置：菜单、侧栏、页脚、评论、分类/标签 slug 映射等集中于此。
// 结构沿用旧主题配置文件（MD3 风格 Hexo 主题 _config.yml），图标名为 Material Symbols。
// 标签/分类映射与侧栏文案抽到了 src/data/*.json（本地工作台 Astro-WebUI 直接读写 JSON，
// 不碰 TS），这里按原导出名 re-export，消费方无感。

import taxonomy from './data/taxonomy.json';
import siteInfo from './data/site-info.json';
import avatarImage from './assets/images/fav.webp';
import heroImage from './assets/images/hero.webp';

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

// S20：值为 astro:assets 的 ImageMetadata（原为 public 路径字符串），消费方用 <Image> 渲染；
// image（hero.webp）目前全站无消费，随 avatar 一并迁入资产管线，产物不再包含未压缩原图。
export const HERO = {
  avatar: avatarImage,
  image: heroImage,
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

export const GISCUS = {
  enable: true,
  repo: 'Serina765P/Serina-Astro',
  repoId: 'R_kgDOUQxXBQ',
  category: 'General',
  categoryId: 'DIC_kwDOUQxXBc4DFC6S',
  mapping: 'pathname',
  strict: '0',
  reactionsEnabled: '1',
  inputPosition: 'top',
  lang: 'zh-CN',
};

export const SIDEBAR = {
  description: siteInfo.description,
  social: siteInfo.social,
  friendLinks: siteInfo.friendLinks,
};

// 中文分类/标签 → URL slug（沿用旧站 _config.yml 的映射，保证 URL 不变）
export const CATEGORY_SLUGS: Record<string, string> = taxonomy.categorySlugs;

export const TAG_SLUGS: Record<string, string> = taxonomy.tagSlugs;

export function categorySlug(name: string): string {
  return CATEGORY_SLUGS[name] ?? name;
}

// 分类 → 莫兰迪 wash 色（文章卡色条、分类胶囊、封面占位块共用）
// 取值为 global.css 中的 CSS 变量，亮/暗自动跟随
export const CATEGORY_COLORS: Record<string, string> = taxonomy.categoryColors;

export function categoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? 'var(--wash-pink)';
}

// 分类 → 分类胶囊的 fill 工具类（P0-3：暗色下不能再用 wash 原色当实底）。
// 与 CATEGORY_COLORS 同源，按 wash 变量名映射，避免再维护第二份分类清单；
// 类名字面量写在这里，Tailwind 才能扫到并产出对应工具类。
const CATEGORY_FILL_CLASSES: Record<string, string> = {
  'var(--wash-pink)': 'bg-cat-fill-pink',
  'var(--wash-mist)': 'bg-cat-fill-mist',
  'var(--wash-sage)': 'bg-cat-fill-sage',
  'var(--wash-sand)': 'bg-cat-fill-sand',
  'var(--wash-clay)': 'bg-cat-fill-clay',
  'var(--wash-rose)': 'bg-cat-fill-rose',
};

export function categoryFillClass(name: string): string {
  return CATEGORY_FILL_CLASSES[categoryColor(name)] ?? 'bg-cat-fill-pink';
}

export function tagSlug(name: string): string {
  return TAG_SLUGS[name] ?? name;
}
