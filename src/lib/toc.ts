// 目录（TOC）数据工具：把 Astro 给出的扁平 headings 折成嵌套树。
//
// 拓扑口径对齐 mediawiki-skins-Citizen 的 getTableOfContentsSectionsData()：
// 相邻同级标题是兄弟，更深的标题挂到前面最近的更浅节点下。
// 那边是「按层级递归切段」，这里是等价的栈式归并 —— 合法 Markdown（层级单调）
// 下结果一致，但对跳级标题（h2 直接到 h4）更宽容：不会凭空造出不存在的中间层。

export interface TocHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface TocNode extends TocHeading {
  children: TocNode[];
}

/** 参与目录的标题深度（与既有实现一致：h1 是文章标题，h6 太细不给） */
export const TOC_MIN_DEPTH = 2;
export const TOC_MAX_DEPTH = 5;

/** 折叠门槛：对齐 Citizen 的 TableOfContentsCollapseAtCount 默认值 */
export const TOC_COLLAPSE_AT_COUNT = 28;
/** 一级节至少这么多才值得折叠（Citizen 同款） */
export const TOC_COLLAPSE_MIN_TOP_LEVEL = 3;

export function buildTocTree(headings: TocHeading[]): TocNode[] {
  const tree: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const heading of headings) {
    if (heading.depth < TOC_MIN_DEPTH || heading.depth > TOC_MAX_DEPTH) continue;

    const node: TocNode = { ...heading, children: [] };

    // 回退到比当前标题更浅的节点；栈里留下的那个就是它的父级
    while (stack.length > 0 && stack[stack.length - 1].depth >= node.depth) {
      stack.pop();
    }

    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else tree.push(node);

    stack.push(node);
  }

  return tree;
}

export function countTocNodes(nodes: TocNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countTocNodes(node.children), 0);
}

/**
 * 是否启用折叠。与 Citizen 同口径：一级节超过 3 个、且标题总数达到门槛。
 * 结果是「短文章的目录完全不受影响」——多数博客正文都到不了这个量级。
 */
export function shouldCollapseToc(tree: TocNode[]): boolean {
  return tree.length > TOC_COLLAPSE_MIN_TOP_LEVEL && countTocNodes(tree) >= TOC_COLLAPSE_AT_COUNT;
}
