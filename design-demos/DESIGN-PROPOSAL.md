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
| wash-粉 | `#CBB3B5`（深 `#9E6E6B`） | **主强调**：链接、激活态、logo |
| wash-雾蓝 | `#A9B4C0`（深 `#7F8A9B`） | 技术 分类、提示 |
| wash-灰绿 | `#AFC0B1`（深 `#7E9184`） | 笔记 分类、成功 |
| wash-陶土 | `#C2A8A0`（深 `#9C7B72`） | 资源 分类、警告 |
| wash-杏 | `#D6CBB8`（深 `#A5947A`） | 公告 分类 |
| `--code-bg` | `#4A443C` | 代码块（暖炭底 + 米色字） |

- 分类 → wash 色固定映射：**资源=陶土 / 技术=雾蓝 / 笔记=灰绿 / 公告=杏**（文章卡左色条、分类胶囊、callout 共用）。
- 水彩晕染 = 2–4 层 wash 色 radial-gradient + blur(40px+)，透明度 ≤0.55，只做背景氛围；暗色下透明度略升（.34）保持氛围感。
- 色值已参照经典莫兰迪色卡（雾蓝 `#c1cbd7`、烟粉、豆绿一类低饱和灰调）校准；因 wash 色要承担 UI 功能色（白字胶囊、色条、callout 边条），比纯装饰色卡整体略深一档以保证可读性。

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
| 标题/站名/数字 | **霞鹜975圆体 SC**（LXGW 975 Yuan SC，400W） | 圆体，用户指定；OFL-1.1 可自由商用。加载见下 |
| 正文/UI | 系统黑体栈 | `"Segoe UI", "Microsoft YaHei", PingFang SC, system-ui`，15.5–16px / 1.85 |
| 代码 | `"Cascadia Code", Consolas, monospace` | 13.5px |

- **CDN 挂载（已验证可用）**：ZeoSeven FontsAPI（国内 ICP 备案服务，IPv4/IPv6 双栈）——
  `<link rel="stylesheet" href="https://fontsapi.zeoseven.com/184/main/result.css">`，
  CSS 中使用 `font-family: "LXGW 975 Yuan SC 400W"`；woff2 分片按需加载（单片约 6KB，CSS 约 150KB，仅命中的分片会下载）。备选：jsDelivr 上的 `cn-fontsource-975-maru-sc-*-regular` 分片包。
- **正式实现建议**：构建时自托管分片（ZSFT 提供离线分片包，或用 cn-font-split 自行切分），零第三方依赖、国内访问最稳；ZeoSeven CDN 作为兜底/过渡方案。
- 圆体自带字重偏粗（975 系列只出较重字重），**展示层一律 `font-weight: normal`**，避免浏览器伪加粗糊掉圆角笔画；站名/大标题保留 `letter-spacing: 0.06–0.12em`。

## 4. 版式

- 容器：导航内容 1200px / 首页 1080px / 文章栏 **720px**。
- 导航：**Apple 式磨砂 sticky**（`rgba(237,234,228,.8)` + blur 18px，暗色对应暖炭），左侧 serif 站名，右侧链接 + 搜索 + 主题切换；全宽。
- **首页**（自上而下）：
  1. **Hero（莫兰迪水彩）**：多层水彩晕染背景（缓慢漂移）+ 有机 blob 头像（背景色块与图像用同一圆角形状、居中对齐，v1 的偏移旋转已修正）+ 圆体大标题 + 副题 + 统计胶囊；
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

## 7. 已确认的决策（2026-09-06 用户反馈）

1. ✅ **字体**：标题层改用霞鹜975圆体 SC（用户指定），已在合成 demo 中通过 ZeoSeven CDN 实装验证。
2. ✅ **首页保留 Bento 小组件区**；头像 blob 偏斜已修正（背景色块与图像同形居中）。
3. ✅ **暗色模式**按"莫兰迪暖炭"做（用户认为暗色更好看，暗色水彩晕染略微增强）。
4. ✅ **配色**：灰粉主轴 + 四分类 wash 色，已参照经典莫兰迪色卡微调（粉深 `#9E6E6B`、雾蓝 `#A9B4C0`、灰绿 `#AFC0B1`）。

**下一步**：按本方案回到 Astro 实现（改造范围见第 5 节），功能与 URL 不动。
