# 技术设计

## 1. 宽度（R1）

| 位置 | 现在 | 改为 | 依据 |
| --- | --- | --- | --- |
| `--measure`（`global.css`） | `36em` = 576px | `40em` = 640px | 中文每行 40 字，仍在 30–40 的可读区间上限 |
| `.post-panel`（`PostLayout.astro`） | `max-width: 46rem` = 736px | `52rem` = 832px | 1440 下文章栏 888px，面板 832px，两侧各 28px |
| `lg:p-10` 内边距 | 40px | 不变 | 内容盒 752px，文本列 640px 居中，两侧各 56px |

1024 宽（TOC 出现）：容器 976 − gap 40 − TOC 224 = 712px 给文章栏；面板取 712，内容盒 632 < 640，文本列自适应到 632，不溢出。

**文本列改为居中**：`.post-panel > header` 与 `.prose` 都用 `max-width: var(--measure); margin-inline: auto`。标题、元信息、正文因此共享同一条 640px 列并左右对称 —— 面板 832px 比文本列宽 192px，若仍左对齐，右侧会留下 112px 的参差；居中后两侧各 56px，读起来是一个刻意的文本列，而不是没铺满的容器。

## 1b. 宽屏（≥1600，R6）

```css
@media (min-width: 1600px) {
  :root {
    --container-wide: 80rem;      /* 1280 */
    --container-standard: 72rem;  /* 1152 */
  }
}
```

- 覆写在 `@layer base` 的 `:root` 上；`max-w-wide` / `max-w-standard` 在消费时才读变量，所以 media query 生效。
- 文章栏 `max-w-4xl`（896）→ `max-w-5xl`（1024），让 1280 容器里的文章栏能到 1016px。
- 阅读列仍是 640px。1920 下的预期：容器 1280、两侧留白 320、文章栏 1016、面板 832、文本列 640。
- 1440 不受影响（media query 不命中），保持容器 1152、面板 832。

## 2. TOC 折叠按钮（R2）

`TocTree.astro` 的 `.toc-item` 从 `flex-wrap: wrap` 改两列 grid：

```css
.toc-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}
.toc-item > .toc-list {
  grid-column: 1 / -1;
  padding-left: 0.75rem;
}
```

- 第一列 `minmax(0, 1fr)` 允许长标题在列内换行，不再把按钮挤走。
- 子列表跨两列，保持整行折下去。
- 没有 toggle 的条目第二列宽度为 0，不影响对齐。

## 3. 表格（R3）

```css
.prose.prose table {
  border-radius: 0;      /* 与 D3 的 0 圆角一致 */
  font-size: 1em;        /* 并入正文档，消掉 14.4px 这个第六档 */
}
.prose.prose :is(th, td) {
  overflow-wrap: anywhere;  /* 长无空格串（文件路径、短代码）可断行，不再抬高 min-content */
}
```

- `table-layout: auto` 保持；不写死列宽，避免另一张表被压。
- 移动端现有的 `display: block + overflow-x: auto` 规则保留。
- 验证：5.1 表前三列 ≥ 80px；若仍不足，再对 `th:first-child` 加 `white-space: nowrap`（逐表判断，不写成全局）。

## 4. 字体（R4）

`BaseLayout.astro` 删掉 1 个 preconnect + 4 个 `fontsapi.zeoseven.com` 样式表；`global.css`：

```css
--font-sans:
  system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
  'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC',
  'WenQuanYi Micro Hei', sans-serif;
```

- `system-ui` 负责拉丁与符号；CJK 逐级回退：macOS/iOS PingFang → 旧 Mac Hiragino → Windows 雅黑 → Linux Noto/思源 → 文泉驿。
- `font-synthesis-weight: none` 保留。Windows 雅黑只有 400/700，500/600 会落到最近的真实字重；这比合成假粗体可控。
- hero 的 `--font-hero` 与 `public/fonts/hero-mincho.css` 完全保留（本地子集，不联网）。
- 同步更新 `BaseLayout.astro` 的字体注释、`global.css` 的 `--font-sans` 注释、`AGENTS.md` 的「字体留在 CDN」一条，改成「正文用系统栈，hero 用本地子集」。

## 5. 文案（R5）

方法：逐文件读上下文，按 Humanizer 的 26 条规则核对；只对命中的串给修订。

中文对应的高频项：

| Humanizer | 中文表现 |
| --- | --- |
| §1 不是 X 而是 Y | 「不只是…更是…」「并非…而是…」 |
| §2 单行收尾 | 段末重复上一句的短句 |
| §3 箴言 | 「真正重要的是…」「本质上」 |
| §4 铺垫 | 「接下来让我们…」「首先来看」 |
| §6 强行三段 | 三个并列形容词/名词凑数 |
| §8 破折号串联 | 一句话里两个以上「——」 |
| §12 AI 高频词 | 旨在、致力于、赋能、打造、深度、全面、值得一提 |
| §13 拔高意义 | 「标志着」「为…奠定基础」「未来可期」 |
| §19 装饰性加粗 | 小标题里无信息量的加粗 |
| §20 装饰性标题 | 标题里的 emoji / 箭头 |

排除：文章正文、说说条目、表情名与短代码、标签名、`SITE.tagline`、MilliPachi 组件内的台词与战报模板（主题化文案）。

产出 `research/copy-audit.md`：按文件列出串、判定（保留/修改/排除）、修改项的前后对照。

## 风险

| 风险 | 处理 |
| --- | --- |
| 40em 在 1024 下接近内容盒上限 | 允许正文自适应收窄，不设 min-width |
| 去掉 IBM Plex 后字重跳变（雅黑只有 400/700） | 标题本来就用 600/700，正文 400；无 300 的用法需确认 |
| 表格 `overflow-wrap: anywhere` 可能把中文单词断开 | 中文本身可断行；英文路径才会被切开，可接受 |
| 文案改动面大且不可自动化 | 保守策略：只有明确命中才改，逐条留证 |
