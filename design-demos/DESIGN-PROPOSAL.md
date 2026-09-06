# 设计方案：「雾粉手帖」— 莫兰迪 × Apple 版式 × Bento 首页

> 由 Top3（13 莫兰迪水彩 / 09 Apple HIG / 07 便当盒）融合而成。
> 合成预览：`16-synthesis.html`（含暗色切换）。确认后按本方案回到 Astro 实现。

## 1. 设计原则

1. **安静温柔为先**：低饱和灰调（莫兰迪）色块，无强对比、无荧光、无重阴影。
2. **内容优先**：文章页是主角——大标题、舒适栏宽、克制的排版；装饰（水彩晕染、有机形状）只出现在首页与页头。
3. **圆角语言统一**：卡片 20–24px、胶囊/按钮 999px、代码块 14–16px；全站不用直角。
4. **柔和层次**：分隔靠"色面差异"而非硬线；阴影低透明度、大扩散、暖色调。
5. **二次元克制**：Q 版头像 + 有机 blob 框 + 水彩晕染 + 空状态颜文字，不上大立绘。

## 2. 色板

### 亮色（默认）
| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#EDEAE4` | 页面底（雾纸） |
| `--surface` | `#FAF8F4` | 卡片（暖白） |
| `--ink` | `#4A443C` | 标题 |
| `--body` | `#5C564D` | 正文 |
| `--sub` | `#8F887D` | 次要文字 |
| `--line` | `rgba(93,84,72,.12)` | 细边框 |
| wash-粉 | `#CBB3B5`（深 `#A9807E`） | **主强调**：链接、激活态、logo |
| wash-雾蓝 | `#AEB6C2`（深 `#7F8A9B`） | 技术 分类、提示 |
| wash-灰绿 | `#B3BFB4`（深 `#7E9184`） | 笔记 分类、成功 |
| wash-陶土 | `#C2A8A0`（深 `#9C7B72`） | 资源 分类、警告 |
| wash-杏 | `#D6CBB8`（深 `#A5947A`） | 公告 分类 |
| `--code-bg` | `#4A443C` | 代码块（暖炭底 + 米色字） |

- 分类 → wash 色固定映射：**资源=陶土 / 技术=雾蓝 / 笔记=灰绿 / 公告=杏**（文章卡左色条、分类胶囊、callout 共用）。
- 水彩晕染 = 2–4 层 wash 色 radial-gradient + blur(40px+)，透明度 ≤0.55，只做背景氛围。

### 暗色（莫兰迪暗调，暖炭基底）
| Token | 值 |
|---|---|
| `--bg` | `#262320` |
| `--surface` | `#302C27` |
| `--ink` | `#EAE4D9` |
| `--body` | `#CDC5B8` |
| `--sub` | `#9C9485` |
| `--line` | `rgba(234,228,217,.12)` |
| wash 四色 | 各提亮一档降饱和：粉 `#B09395` / 雾蓝 `#93A0B0` / 灰绿 `#9AAB9E` / 陶土 `#B3968C` / 杏 `#C0B39C` |
| `--code-bg` | `#1E1B18` |

延续现有 class 策略暗色切换（localStorage + prefers-color-scheme），giscus 同步 postMessage 不变。

## 3. 字体

| 用途 | 字体 | 说明 |
|---|---|---|
| 标题/站名/数字小标 | **Noto Serif SC**（400/600/700） | 自托管 woff2 分片（unicode-range 流式加载，实际增量约 100–300KB），`font-display: swap`；fallback: Source Han Serif SC → 宋体 |
| 正文/UI | 系统黑体栈 | `"Segoe UI", "Microsoft YaHei", PingFang SC, system-ui`，15.5–16px / 1.85 |
| 代码 | `"Cascadia Code", Consolas, monospace` | 13.5px |

- 标题衬线 + 正文黑体：杂志感与长文可读性兼得（Windows 下中文衬线正文渲染差，故正文不用衬线）。
- 站名/大标题加 `letter-spacing: 0.06–0.12em`，是这套设计的气质来源之一。

## 4. 版式

- 容器：导航内容 1200px / 首页 1080px / 文章栏 **720px**。
- 导航：**Apple 式磨砂 sticky**（`rgba(237,234,228,.8)` + blur 18px，暗色对应暖炭），左侧 serif 站名，右侧链接 + 搜索 + 主题切换；全宽。
- **首页**（自上而下）：
  1. **Hero（莫兰迪水彩）**：多层水彩晕染背景（缓慢漂移）+ 有机 blob 头像 + serif 大标题 + 副题 + 统计胶囊；
  2. **Bento 信息区**（便当盒）：统计 ×4（文章/说说/封面/天数）→ 封面墙（专辑封面，2×3）→ 最近说说气泡 → 正在循环 → 标签云 → 快捷入口；
  3. **文章列表**：spine 横卡（左 5px 分类色条 + 封面 72px + 标题 + 分类胶囊 + 日期）。
- **文章页**（Apple 式）：大 serif 标题区（分类胶囊 + 日期/字数/时长 meta）→ 720px 正文 → 上一篇/下一篇圆角卡 → giscus。TOC 维持 ≥2xl 外置（v2 决策），样式换莫兰迪。
- 其余页：归档（按年 serif 大数字）、分类/标签（wash 色胶囊 + 水彩小头图）、说说（气泡时间线）、友链（圆角卡）、搜索（Pagefind 换肤）、404（blob 头像 + 颜文字）。
- `imas-album` 皮肤（imas-hires 专辑网格）换用同一套 token 重绘。

## 5. 组件清单（Astro 落地时的改造范围）

| 组件 | 处理 |
|---|---|
| `global.css` | 全量替换为 token 体系（@theme + 暗色变量 + wash 色） |
| Header / Footer | 磨砂导航重绘；页脚水彩色条 |
| `index.astro` | 重写：水彩 hero + bento 区 + spine 列表 |
| PostCard / 分页 / 上下篇 | spine 卡与圆角卡 |
| Callout（warning/danger/success/center） | 四色 wash 提示框（陶土=警告、雾蓝=提示、灰绿=成功、杏=居中） |
| 代码块 | 暖炭底圆角；Shiki 双主题调为 light=one-light / dark=暖炭自定义 |
| Toc / Lightbox / 搜索 / Giscus 外壳 / ThemeToggle | 换肤不改逻辑 |
| ImasAlbum 皮肤 | 用 token 重绘网格与模糊揭示 |

URL、集合、Pagefind、giscus 配置、ClientRouter 事件模式全部不动。

## 6. 动效

- 页面切换：fade + 8px 上移，出 90ms / 入 200ms（安静，不弹跳）；`prefers-reduced-motion` 全局降级。
- 卡片 hover：translateY(-2~-3px) + 阴影加深，200ms ease-out。
- 水彩晕染：20s+ 极慢漂移（reduced-motion 关闭）。
- bento 单元进入：50ms 级联 fade（一次性，不循环）。

## 7. 待确认（看 16-synthesis 后回答即可）

1. 标题衬线 + 正文黑体的组合 OK？（备选：全衬线更有旧杂志感，或全黑体更现代）
2. 首页保留 Bento 小组件区 OK？（备选：去掉组件只留水彩 hero + 文章列表）
3. 暗色模式按"莫兰迪暖炭"做 OK？
4. 主强调色用灰粉、四分类各配 wash 色 OK？
