# Component Guidelines

> `.astro` 组件的写法与边界。组件只负责标记与构建期数据，交互交给 `src/scripts/`。

## 文件形状

```astro
---
// 一段注释说明组件边界与为什么存在（复杂组件必须有）。
interface Props {
  width: 'narrow' | 'content' | 'standard' | 'wide';
  class?: string;
}
const { width, class: className = '', ...rest } = Astro.props;
const WIDTHS = {
  narrow: 'max-w-narrow',
  content: 'max-w-content',
  standard: 'max-w-standard',
  wide: 'max-w-wide',
} as const;
---
<div class:list={['mx-auto w-full px-4 sm:px-6', WIDTHS[width], className]} {...rest}>
  <slot />
</div>
```

参考：`src/components/primitives/Container.astro`、`src/components/primitives/Card.astro`。

## Props

- 每个组件显式声明 `interface Props`；可选值在解构时给默认值。
- 透传 `class` 与 `...rest` 只用于基元（`Container`、`Card`、`TagChip`）；业务组件不要把未知属性直接铺到 DOM。
- 构建期能校验的参数就在 frontmatter 抛错：`ArticleMusicPlayer.astro` 对非数字 `track`、快照缺失的曲目直接 `throw new Error`。
- `Astro.props` 在 Astro 里是 `Record<string, any>`；需要类型时只断言一次（`Astro.props as Props`），不要散落 `any`。

## 基元优先

- 页面宽度：`<Container width="narrow|content|standard|wide">`；四档对应 `global.css` 的 `--container-*`。
- 卡片：`<Card as="article|a" lift={false}>`；外观 recipe 在 `global.css` 的 `@utility card-surface` / `card-lift`。
- 标签/社交 chip：`<TagChip size="compact|cloud|social">`；三档尺寸是有意保留的，不要抹平。
- 新基元只有在至少两个消费点重复同一套 recipe 时才提取。

## 样式

- 优先 Tailwind 语义工具类：`text-ink`、`text-sub`、`bg-surface`、`border-line`、`wash-*`、`chip-*`。
- 不在组件里写死色值；颜色唯一来源是 `src/styles/global.css` 的 `--paint-*` / `--wash-*` / `--color-*`。
- 复杂内部布局用 scoped `<style>`；祖先条件用 `:global()`（例如 `:global(.dark) &`）。
- 不要重复实现 `Container` 的宽度或锚点偏移；`[id]` 的 `scroll-margin-top` 只在 `global.css` 定义。
- 正文排版用 `Prose.astro` 的 `prose` 类；不要加 `prose-headings:scroll-mt-*`（会覆盖全局锚点规则）。

## 可访问性

- 装饰性图标加 `aria-hidden="true"`；交互按钮必须有可访问名称（`aria-label` 或可见文本）。
- 状态提示用 `role="status"` + `sr-only`（参考 `BilibiliPlayer.astro`）。
- 可点区域不小于 24×24（`TagChip` 的 `min-h-6` 就是为此）。
- 焦点样式用 `focus-visible:outline-*`；不要移除 outline 而不给替代。
- 动画/滚动逻辑尊重 `prefers-reduced-motion`（`src/scripts/toc.ts`）。

## 图片与媒体

- 构建期图片走 `astro:assets` 的 `<Image>`；固定尺寸组件用 `layout="fixed"`，首屏图 `loading="eager"` + `fetchpriority="high"`（`src/pages/index.astro` 的头像）。
- Markdown 相对图片由 `astro.config.mjs` 的 `image.layout: 'constrained'` 生成候选尺寸；不要开 `responsiveStyles`。
- B 站/网易云播放器：构建期只输出标记与入口；点击后才插入 iframe 或加载运行时（`src/components/media/BilibiliPlayer.astro`、`src/components/music/ArticleMusicPlayer.astro`）。

## 反模式

- 在业务组件里直接 `document.querySelector`：交互属于 `src/scripts/`。
- 在组件里维护第二份 taxonomy/颜色/宽度映射。
- 为一次性需求新增全局 CSS 类；先看现有 utility 与 token。
- 把 `class` 字符串拼成动态模板（Tailwind 扫不到）；用静态映射表。
