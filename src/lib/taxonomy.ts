// 分类/标签 URL slug 与莫兰迪 wash token 的唯一真值。
// 管理后台的服务端校验（scripts/admin/lib/taxonomy.mjs）与 URI 对照面板共用，
// 避免两边各自维护正则或色板后出现「界面能填、服务端拒绝」的漂移。

export const SLUG_PATTERN_SOURCE = '[a-z0-9]+(?:-[a-z0-9]+)*';
export const SLUG_PATTERN = new RegExp(`^${SLUG_PATTERN_SOURCE}$`, 'u');

export const WASH_VALUES = [
  'var(--wash-pink)',
  'var(--wash-mist)',
  'var(--wash-sage)',
  'var(--wash-sand)',
  'var(--wash-clay)',
  'var(--wash-rose)',
] as const;
