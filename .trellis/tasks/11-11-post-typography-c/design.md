# 技术设计：文章正文排版精修（C 方向）

## 1. 范围与边界

只改阅读层：`src/styles/global.css`、`src/styles/post-prose.css`、`src/layouts/PostLayout.astro` 的 scoped 样式，以及 `visual-system.md`。不改组件 DOM、不改 `CodeBlock.astro` 的脚本、不改管理后台的编辑器结构（`post-prose.css` 与后台共用，callout 字号变化会同步过去，这是期望的）。

不动的部分：调色板、卡片 / 媒体 0 圆角规则、chip 胶囊、TOC、导航、动效、`astro:assets` 的 constrained 布局。

## 2. 层序策略

`@tailwindcss/typography` 产出在 `utilities` 层，`components` 层的规则压不过它（S18 已踩过）。因此本次新增 / 覆盖的正文规则统一落在 `global.css` 末尾现有的 `@layer utilities` 块里：

| 规则 | 选择器 | 特异性 | 压过谁 |
| --- | --- | --- | --- |
| 正文档 | `.prose.prose` | (0,2,0) | typography `.prose` (0,1,0) |
| 段落 | `.prose > p` | (0,1,1) | `.prose :where(p)` (0,1,0) |
| 标题 | `.prose h2` / `h3` / `h4` | (0,1,1) | `.prose :where(h2)` (0,1,0) |
| 行内 code | `.prose.prose :not(pre) > code` | (0,2,1) | `.prose :where(code)` (0,1,0) |
| 引用 | `.prose.prose blockquote` | (0,2,1) | typography blockquote (0,1,0) |
| 表格 | `.prose.prose table`（替换现有块） | (0,2,1) | typography table (0,1,0) |
| 图片 | `.prose img` | (0,1,1) | `.prose :where(img)` (0,1,0) |
| 代码块内边距 / 字号 | `.prose.prose .astro-code` | (0,3,0) | typography `pre` (0,1,0) |

`h1` 只在文章页出现，改 `PostLayout.astro` 的 scoped `.post-title`（Astro scoped 样式不在 Tailwind 层里，天然胜出）。

不再新增 `!important`；`.astro-code` 既有的 `background-color !important` 保留（压 shiki 内联样式）。

## 3. 逐项设计

### 3.1 正文档

```css
@theme {
  --prose-size: 1.0625rem;                 /* 17px，正文档专用，不进五档 */
  --measure: calc(40 * var(--prose-size)); /* 17px 下 680px */
}
.prose {
  max-width: var(--measure);
}
.prose.prose {
  --tw-prose-body: var(--body);   /* 原为 --ink，改柔一档 */
  font-size: var(--prose-size);
  line-height: 1.85;
  letter-spacing: 0.01em;
}
.prose > p {
  margin: 1.05em 0;
  text-wrap: pretty;
}
```

- `--measure` 从 `40em` 改为 `calc(40 * --prose-size)`：17px 下仍是 680px（约 40 个汉字/行），但不再依赖使用方元素的字号。PostLayout 的 `.post-panel > header` 是 16px 上下文，若沿用 `40em` 会解析成 640px，标题列与正文列错开 20px（验证时实测发现）；改成绝对长度后两者都是 680px。
- 1024 宽面板内容盒 625px，`max-width` 自适应收窄，不溢出。
- 字距 0.01em 只对 CJK 长读生效，拉丁字母观感变化可忽略。

### 3.2 标题

```css
@theme {
  --font-serif:
    'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', 'SimSun', serif;
}
```

- 正文仍 `--font-sans`，不加载任何字体文件；`font-synthesis-weight: none` 保留。
- 思源宋体优先；Windows 无思源时落到 SimSun，macOS 落到 Songti SC，Linux 落到 Noto Serif CJK SC。
- 只在文章 h1 / h2 使用衬线；h3 / h4 保持系统无衬线，避免小字号宋体发虚。

```css
POSTTITLE (PostLayout scoped):
  font-family: var(--font-serif);
  font-size: clamp(1.75rem, 2.5vw, 2.3rem);
  line-height: 1.4;
  letter-spacing: 0.02em;
  font-weight: 700;

.prose h2 { font-family: var(--font-serif); font-size: 1.55em; line-height: 1.45;
            font-weight: 700; letter-spacing: 0.035em; margin: 2.4em 0 0.9em; }
.prose h3 { font-size: 1.18em; line-height: 1.55; font-weight: 600;
            letter-spacing: 0.01em; margin: 1.9em 0 0.65em; }
.prose h4 { font-size: 1.06em; font-weight: 600; color: var(--ink);
            letter-spacing: 0.01em; margin: 1.7em 0 0.55em; }
.prose :is(h2, h3, h4) + * { margin-top: 0; }
```

- 17px 下：h2 26.35px、h3 20.06px、h4 18.02px。
- h2 的 1.55em 相对 `.prose` 的 17px，不进入页面 chrome 的五档。

### 3.3 引用与提示框

```css
.prose.prose blockquote {
  margin: 1.7em 0;
  padding: 0 0 0 1.15em;
  border-left: 2px solid var(--wash-mist-deep);
  border-radius: 0;
  background: none;
  color: var(--body);
}
```

`post-prose.css`（共享给后台预览）：

```css
.callout { font-size: 1em; border-left-width: 3px; padding: 0.8em 1.1em; }
```

- 去掉 blockquote 的淡蓝底与右侧圆角：那是「卡片」语言，把引用做成第二个组件；引用只保留左线，提示框才用淡底。
- callout 从 0.95em（15.2px）回到正文档 1em；后台预览同步变大。

### 3.4 表格

替换 `@layer utilities` 里的 `.prose.prose table` 整块：

```css
.prose.prose table {
  width: 100%; margin: 1.9em 0; border: 0; border-collapse: collapse;
  border-radius: 0; font-size: 1em; line-height: 1.65; overflow: visible;
}
.prose.prose thead th {
  background: none; border: 0;
  border-top: 1px solid var(--line);
  border-bottom: 1.5px solid color-mix(in srgb, var(--ink) 55%, transparent);
  padding: 0.62em 0.8em; vertical-align: bottom;
}
.prose.prose :is(tbody th, tbody td, tfoot td) {
  border: 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
  padding: 0.62em 0.8em; vertical-align: top;
}
.prose.prose tbody tr:last-child :is(th, td) { border-bottom: 1px solid var(--line); }
.prose.prose tbody tr:hover :is(th, td) {
  background: color-mix(in srgb, var(--surface-2) 40%, transparent);
}
```

- 保留 `overflow-wrap: anywhere` 与 ≥48rem 的 `min-width: 5rem`（长路径断行、短列不被挤爆）。
- 保留 ≤40rem 的 `display: block + overflow-x: auto + white-space: nowrap` 横滑规则；`border-collapse: collapse` 下横滑仍可用。
- 表格从「带外框的卡片」变成文档内容：只靠表头上下两条线建立层级。

### 3.5 图片

```css
.prose img { display: block; margin-inline: auto; margin-block: 2em; }
```

- 只加 `display` 与水平居中，不改 width/max-width；`astro:assets` 的 constrained 宽度与 srcset 不变。
- 窄图片（如 514px 截图）在 680px 列里居中，不再贴左。

### 3.6 代码块

```css
.prose.prose .astro-code {
  padding: 2.4rem 1.15rem 1.05rem;   /* 顶部给语言标签留位 */
  font-size: 0.82em;                  /* 17px 下 13.94px */
  line-height: 1.75;
}
```

`components` 层的 `.code-language` 去掉底色 / 内边距 / 圆角，与代码左内边距对齐：

```css
.code-language {
  position: absolute; top: 0.65rem; left: 1rem; z-index: var(--z-sticky-head);
  font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--code-ink) 45%, transparent);
}
```

- 角标压字的根因是 pre 顶部没有内边距，标签浮在首行上。2.4rem（38.4px）> 标签高度 + 顶部偏移，实测不再相交。
- 不改 DOM、不改 CodeBlock 脚本；折叠 / 复制 / 语言标签逻辑保持。
- 圆角沿用现有 `rounded-2xl`，不在本任务调整（圆角规则另议）。

### 3.7 其他小项

- `ul / ol`：`margin: 1.05em 0; padding-left: 1.4em`；`li` 间距 0.38em；marker 用 `--wash-mist-deep`。
- `hr`：`margin: 3em auto; width: 30%; border-top: 1px solid var(--line)`。
- 行内 code：`font-size: .86em; padding: .1em .36em; border: 0; border-radius: 5px; background: color-mix(in srgb, var(--surface-2) 55%, transparent); color: var(--wash-clay-deep)`，替换 components 层的旧 chip 规则。
- 删除 `components` 层里被 utilities 接管后失效的旧 blockquote / code / table 死规则，避免两套真值。

## 4. 兼容性与风险

| 风险 | 处理 |
| --- | --- |
| Windows 无思源宋体 → SimSun 观感偏旧 | 回退栈显式包含 SimSun；标题字号 ≥ 24px，SimSun 大字可接受；用户接受此差异，不引 webfont |
| macOS Songti SC 与 Noto Serif CJK 字形不同 | 只影响标题，正文不变；截图基线按本机 Noto 记录，不承诺逐像素一致 |
| `/about/`、`/links/` 也使用 `.prose` | 他们的正文同样变 17px / 1.85、表格同款；属于本次预期，需目视 |
| 管理后台预览共用 `post-prose.css` | 只有 callout 字号变化（15.2 → 16px 基准），可接受 |
| 移动端表格 390 宽 | 横滑规则保留；实测页面横向溢出 0 |
| 五档字号规范 | 正文档 17px 作为独立刻度记入 `visual-system.md`，页面 chrome 五档不变 |
| 表格去外框后长表可读性 | 表头上下线 + 行分隔线保层级；hover 淡底替代外框 |

## 5. 验证设计

1. 计算样式断言（Playwright，preview）：`.prose` 17px/1.85、h2 26.35px/700/serif、h3 20.06px、h4 18.02px、callout 17px、表格外框 0、图片 margin auto、语言标签与首行代码不相交。
2. 宽度：390 / 1024 / 1440 / 1920 的 `scrollWidth - clientWidth = 0`；1440 正文列 680px。
3. 视觉：亮 / 暗两态 five 宽度走查；`npm run shots` 对比。
4. 闸门：`npm run lint`、`npm test`、`npm run check`、`npm run build`、`npm run contrast`。
5. 记录到 `research/verify.md`。

## 6. 回滚点

- 回滚点 1：字体 token + 标题 + 正文档（`global.css` + `PostLayout.astro`）。若标题宋体不可接受，单独 revert 只影响标题，正文 17px 保留。
- 回滚点 2：组件细节（引用 / 表格 / 图片 / 代码块 / callout）。与回滚点 1 的文件重叠在 `global.css`，用 git 分段 revert 或临时注释。
- 整体回滚：`git revert <commit>`，无数据迁移。
