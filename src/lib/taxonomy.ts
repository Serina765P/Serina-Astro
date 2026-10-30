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

export type TaxonomyKind = 'category' | 'tag';

export interface TaxonomyMaps {
  categorySlugs: Record<string, string>;
  tagSlugs: Record<string, string>;
  categoryColors: Record<string, string>;
}

export interface TaxonomyMappingInput {
  kind: TaxonomyKind;
  name: string;
  slug: string;
  color?: string;
}

/**
 * 管理后台的 taxonomy PUT 语义是整表替换而非深合并；登记单个词条时必须带回
 * 现有映射，否则会把其它分类/标签的 slug 与配色一起清空。
 */
export function buildTaxonomyEntryPatch(
  current: TaxonomyMaps,
  { kind, name, slug, color }: TaxonomyMappingInput,
): Partial<TaxonomyMaps> {
  if (kind === 'category') {
    return {
      categorySlugs: { ...current.categorySlugs, [name]: slug },
      categoryColors: { ...current.categoryColors, [name]: color ?? WASH_VALUES[0] },
    };
  }
  return { tagSlugs: { ...current.tagSlugs, [name]: slug } };
}
