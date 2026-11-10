# 闸门 B 复测 triage（14 条路由 × 1440/768/390）

复测时间：2026-11-10；报告在 `.taste-skill/after/`（本地数据，不提交）。

## 已清除

`gradient`、`shadow`（除文章页的素材阴影）、`eyebrow`、`icon-cards`（首页）、`micro-label`、`size-count`、`small-text`（除文章页内容里的一处）、`small-title`、`grey-body`、`measure`、`body-size`、`glass`、`contrast`、`hairline` 的 12/18 处。

## 剩余 FAIL 与判定

| 规则 | 命中路由 | 判定 | 依据 |
| --- | --- | --- | --- |
| `mono` | 14 | 误报 | CJK 全角字宽让启发式把 `IBM Plex Sans SC` / `ZhaohuaMinA Bold` 判成等宽 |
| `focal-point` | 14 | 有意保留 | hero 标题 60px（4.2vw）；探针期望 ~8.4vw。7 个汉字的标题放大到 120px 会挤掉头像位，需重构首屏才能满足 |
| `few-pictures` | 13 | 不适用 | 文字型博客；首页唯一的位图是有意的头像 |
| `still-page` | 12 | 有意保留 | 短页面的条目几乎都在首屏内，为避免闪烁它们在启用动效前就被标记为已入场；首屏以下仍会入场（实测 `/` 20 个、`/shuoshuo/` 7 个，阈值 8） |
| `empty-screens` | 3（about / archives / shuoshuo） | 不适用 | 内容量决定的短页面；这不是留白设计失误，补内容属于内容工作，不在本任务范围 |
| `emoji` | 3（links / post-imas-hires / shuoshuo） | 内容 | `✨ 🎧 📂 💡 🎵 😅` 是用户写的正文，不是装饰 |
| `covered-text` | 3 | 误报 | 粘性导航滚动途中掠过标题的瞬时状态；锚点落点已核验（`/about/#制作人时间线`：目标 top 87.6px > header 65px，`scroll-margin-top: 88px` 生效） |
| `off-centre` | 3 | 误报 | `scrollbar-gutter: stable` 预留 15px gutter；容器在滚动区内居中 |
| `headline-lines` | 2 | 内容约束 | 31 字中文标题在 390 宽必然超两行；标题是内容，不裁不改 |
| `hairline` | about / emoji / post-imas-hires | 混合 | `about` 的 3 处是正文 `<hr>`（内容）；`emoji` 是图鉴网格；`post-imas-hires` 是正文折叠面板的外框（内容组件） |
| `outlined-box` | emoji | 不适用 | 130 个表情格子本来就是网格 |
| `shadow` | post-imas-hires | 允许 | `--shadow-media`，压在内容之上的专辑封面 |
| `small-text` | post-imas-hires | 内容 | 正文表格里的角标 |
| `icon-cards` | tag-idolmaster | 有意保留 | 标签页的文章卡片带封面，是有内容的卡片而不是图标卡；改为无封面列表会丢失视觉信息 |

## 结论

剩余 FAIL 全部有判定与证据，没有未分类项。真正的设计问题（渐变、阴影、描边、字号坍塌、量度过宽、动效缺失）已全部清除。
