// 文章 Frontmatter 的字段清单与皮肤枚举唯一真值。
// content.config.ts、管理后台服务端校验与文章面板共用，避免列表漂移。

export const POST_FRONTMATTER_FIELDS = [
  'title',
  'date',
  'updated',
  'tags',
  'categories',
  'keywords',
  'description',
  'cover',
  'pinned',
  'toc',
  'skin',
  'license',
] as const;

export const POST_SKINS = ['imas-album'] as const;
export const POST_LICENSES = ['original'] as const;
export type PostLicense = (typeof POST_LICENSES)[number];
