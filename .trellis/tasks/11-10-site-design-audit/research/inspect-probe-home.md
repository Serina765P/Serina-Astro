# 首页视觉探针（设计闸门 B 的工具验证 + 基线）

命令（已验证可跑）：

```bash
export CHROME_PATH=$HOME/.local/bin/chrome-nosandbox   # 包装脚本：--no-sandbox --disable-dev-shm-usage
node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4398 &
node /root/.agents/skills/design-taste-frontend/scripts/inspect.mjs \
  http://127.0.0.1:4398/ --out .taste-skill/probe
```

- 环境：Chromium 153（playwright 缓存），root 必须走 `--no-sandbox`。
- 单页耗时 17s（三宽度 + 截图）。
- 产物：`.taste-skill/probe/`（本地数据，不提交）。
- 结果：**11 FAIL / 10 WARN**。

## FAIL

| 规则 | 测量 | 判定 | 处理 |
| --- | --- | --- | --- |
| `eyebrow` | 4 处小标签压在标题上（文章→12篇、说说→4条、持续更新→340天、标签→22个） | 真问题 | 把信息并入标题或首句，删除标签（R4） |
| `mono` | 把 `IBM Plex Sans SC`、`ZhaohuaMinA Bold` 判为等宽 | **工具误报** | 两族都是非等宽；`allow mono`，理由写入报告 |
| `emoji` | 页面出现 `♪`（BGM 播放器） | 真问题 | 换成图标库已有图标或纯文字（R4） |
| `gradient` | `section.home-hero` 的 `linear-gradient(112deg, …)` | 真问题 | 首屏改平色或色阶（R4）；`prefers-reduced-motion` 与暗色态同步检查 |
| `shadow` | `img.hero-avatar` 用 `0 0 0 1px` box-shadow 做描边 | 真问题（轻微） | 改用 `--line` 描边或色阶（R4） |
| `hairline` | 11 条 1px 分隔线（header、hero 下边框、11 张卡片） | 真问题 | 换成留白/色阶；header 与卡片优先（R4） |
| `icon-cards` | 1 行 6 张同构图标卡 | 真问题 | 首页 `site-index` 区域重排（R4） |
| `body-size` | 正文主字号 14px | 真问题 | 提到 16px 以上（R4，涉及 `global.css` prose 变量） |
| `few-pictures` | 只有 1 张位图 | **不适用**（落地页规则） | `allow few-pictures`，博客首页以文字为主体 |
| `focal-point` | 最大字号 64px = 4.4vw，首屏无主导元素 | 部分成立 | 中文衬线 hero 的 64px 已偏大；结合 `measure` 一并判断，最多提到 5vw 级（R4） |
| `still-page` | 只有 1 个元素在加载/滚动中移动 | 真问题 | 补动效层：分区入场 + 控件反馈 + 一处图片位移（R4） |

## WARN

| 规则 | 测量 | 判定 | 处理 |
| --- | --- | --- | --- |
| `micro-label` | `芹菜P / SERINA` 小字大写加字距 | 真问题 | 改 sentence case 或去掉字距（R4） |
| `font-fallback` | `IBM Plex Sans SC` 声明了但未加载 | **A 级嫌疑** | 先查生产环境是否真的没加载（CDN/字体族名）；属于 R3 修复范围 |
| `size-count` | 10 个不同字号（12,13,14,15,16,20,23,29,32,64） | 真问题 | 收敛到 ≤5 档（R4，AC4） |
| `grey-body` | 正文灰 5.2:1 | 真问题 | 正文改用全墨色；改后必跑 `npm run contrast` |
| `no-footage` | 无视频 | 不适用 | 博客无素材需求，报告里说明 |
| `measure` | 最长段落 133 字符/行 | 真问题 | 收窄到 ≤75 字符（AC4） |
| `small-text` | 2 处 <13px | 真问题 | 提到 13px 以上 |
| `off-centre` | 左 225px / 右 264px | **疑似滚动条伪影** | 差值 39px ≈ 滚动条宽度；复测时隐藏滚动条确认，确认即 `allow` |
| `name-only-title` | h1 是裸名称，首屏没说明这是什么 | 部分成立 | 副标题提到 18px 以上并写清用途（R4） |
| `first-action` | 768/390 首屏无按钮 | **不适用** | 博客无主行动，`allow first-action` |

## 复用到其余 11 条路由前必须先确认

1. `mono`、`off-centre`、`few-pictures` 属于会让每条路由都报的规则 —— 判定一次、全局 `allow`，避免 12 条路由重复 triage。
2. 文章详情页要额外关注：代码块、表格（`inspect.mjs` 对 `<pre>`/`<table>` 有豁免，确认真的豁免生效）、TOC 侧栏在 768 宽的表现。
3. 暗色态：`inspect.mjs` 默认只测亮色。暗色必须用 `ThemeToggle` 的持久化机制单独跑一轮，或在报告里说明未覆盖。
