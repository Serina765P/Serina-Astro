import { describe, expect, it } from 'vitest';
import {
  buildTocTree,
  countTocNodes,
  shouldCollapseToc,
  type TocHeading,
  type TocNode,
} from './toc';

function heading(depth: number, slug: string): TocHeading {
  return { depth, slug, text: slug };
}

function subheadings(depth: number, parent: string, count: number): TocHeading[] {
  return Array.from({ length: count }, (_, index) => heading(depth, `${parent}-${index}`));
}

describe('buildTocTree', () => {
  it('相邻同级是兄弟，更深标题挂到前面最近的更浅节点下', () => {
    const tree = buildTocTree([
      heading(2, 'a'),
      heading(3, 'a1'),
      heading(3, 'a2'),
      heading(2, 'b'),
    ]);

    expect(tree.map((node) => node.slug)).toEqual(['a', 'b']);
    expect(tree[0].children.map((node) => node.slug)).toEqual(['a1', 'a2']);
    expect(tree[1].children).toEqual([]);
  });

  it('跳级标题挂在最近更浅的节点上，不凭空造中间层', () => {
    const tree = buildTocTree([heading(2, 'a'), heading(4, 'deep'), heading(3, 'mid')]);

    expect(tree.map((node) => node.slug)).toEqual(['a']);
    expect(tree[0].children.map((node) => node.slug)).toEqual(['deep', 'mid']);
  });

  it('只收 h2–h5', () => {
    const tree = buildTocTree([heading(1, 'title'), heading(2, 'a'), heading(6, 'fine')]);

    expect(tree.map((node) => node.slug)).toEqual(['a']);
  });
});

describe('countTocNodes', () => {
  it('统计包含所有层级的节点', () => {
    const tree: TocNode[] = [
      {
        depth: 2,
        slug: 'a',
        text: 'a',
        children: [{ depth: 3, slug: 'a1', text: 'a1', children: [] }],
      },
      { depth: 2, slug: 'b', text: 'b', children: [] },
    ];

    expect(countTocNodes(tree)).toBe(3);
  });
});

describe('shouldCollapseToc', () => {
  it('一级节不超过 3 个时不折叠', () => {
    const tree = buildTocTree([
      heading(2, 'a'),
      ...subheadings(3, 'a', 9),
      heading(2, 'b'),
      ...subheadings(3, 'b', 9),
      heading(2, 'c'),
      ...subheadings(3, 'c', 9),
    ]);

    expect(countTocNodes(tree)).toBeGreaterThanOrEqual(28);
    expect(shouldCollapseToc(tree)).toBe(false);
  });

  it('节点数没到门槛时不折叠', () => {
    const tree = buildTocTree([
      heading(2, 'a'),
      heading(3, 'a1'),
      heading(2, 'b'),
      heading(3, 'b1'),
      heading(2, 'c'),
      heading(3, 'c1'),
      heading(2, 'd'),
      heading(3, 'd1'),
    ]);

    expect(tree.length).toBe(4);
    expect(shouldCollapseToc(tree)).toBe(false);
  });

  it('一级节超过 3 个且总数达到 28 才折叠', () => {
    const headings = ['a', 'b', 'c', 'd'].flatMap((parent) => [
      heading(2, parent),
      ...subheadings(3, parent, 6),
    ]);
    const tree = buildTocTree(headings);

    expect(countTocNodes(tree)).toBe(28);
    expect(shouldCollapseToc(tree)).toBe(true);
  });
});
