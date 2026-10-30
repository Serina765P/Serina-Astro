import { describe, expect, it } from 'vitest';
import { buildTaxonomyEntryPatch, WASH_VALUES } from './taxonomy.ts';

const current = {
  categorySlugs: { 技术分享: 'tech', 考据分析: 'analysis' },
  tagSlugs: { 偶像大师: 'idolmaster', MLTD: 'mltd' },
  categoryColors: {
    技术分享: WASH_VALUES[0],
    考据分析: WASH_VALUES[1],
  },
};

describe('buildTaxonomyEntryPatch', () => {
  it('登记分类时带回全部既有分类与配色，只追加新词条', () => {
    const patch = buildTaxonomyEntryPatch(current, {
      kind: 'category',
      name: '冒烟分类',
      slug: 'smoke-category',
      color: WASH_VALUES[2],
    });

    expect(patch.categorySlugs).toEqual({
      技术分享: 'tech',
      考据分析: 'analysis',
      冒烟分类: 'smoke-category',
    });
    expect(patch.categoryColors).toEqual({
      技术分享: WASH_VALUES[0],
      考据分析: WASH_VALUES[1],
      冒烟分类: WASH_VALUES[2],
    });
    expect(patch.tagSlugs).toBeUndefined();
  });

  it('登记标签时带回全部既有标签，不碰分类映射', () => {
    const patch = buildTaxonomyEntryPatch(current, {
      kind: 'tag',
      name: '冒烟标签',
      slug: 'smoke-tag',
    });

    expect(patch.tagSlugs).toEqual({
      偶像大师: 'idolmaster',
      MLTD: 'mltd',
      冒烟标签: 'smoke-tag',
    });
    expect(patch.categorySlugs).toBeUndefined();
    expect(patch.categoryColors).toBeUndefined();
  });

  it('分类未指定颜色时补默认 wash，满足服务端新分类必须有配色的约束', () => {
    const patch = buildTaxonomyEntryPatch(current, {
      kind: 'category',
      name: '无配色分类',
      slug: 'no-color',
    });

    expect(patch.categoryColors?.无配色分类).toBe(WASH_VALUES[0]);
  });

  it('不修改传入的现有映射', () => {
    buildTaxonomyEntryPatch(current, {
      kind: 'tag',
      name: '追加',
      slug: 'appended',
    });

    expect(current.tagSlugs).toEqual({ 偶像大师: 'idolmaster', MLTD: 'mltd' });
  });
});
