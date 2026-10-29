# 自定义贴纸维护

贴纸是 300px 级的动画 WebP，和表情（`docs/custom-emoji.md`）共用 `:短代码:` 语法，但资源和注册表各自独立。当前只有一套：`ml` / 偶像大师百万现场。

## 数据与资源

- 注册表：`src/data/stickers.json`，按导入顺序（原始文件名字典序）排列。
- 动画：`public/sticker/<code>.webp`，行内短代码与图鉴下载按钮使用它。
- 尾帧：`public/sticker/<code>-still.webp`，图鉴卡片默认显示，悬停/聚焦时换成动画。尾帧由导入脚本用 sharp 从最后一帧生成（quality 72），不单独维护。

字段与表情一致（`code` / `label` / `set` / `setLabel` / `src` / `width` / `height` / `keywords`），另外多了 `poster`。注册表里不保存原始素材文件名。

## 导入

```powershell
npm run sticker:import -- --input "C:\Users\Serina\Downloads\百万表情包\网站用WebP" --names .shots/sticker-names.json
```

- `--input` 必填，可以是文件或目录；目录内按文件名字典序登记。
- `--set` / `--label` 默认 `ml` / `偶像大师百万现场`。
- `--names <json>` 可选，`{ "原文件名": { "label": "名称", "keywords": ["台词"] } }`，给首次导入填初始名字。
- 注册表不存原始文件名：素材条数与注册表条数一致时按文件名字典序逐条对齐，保留已编辑的名称与关键词；条数变化则整表按 `--names` 或文件名重建。
- `--dry-run` 只打印计划和帧数；`--force` 允许在输入比现有注册表少时重建。
- 脚本会重建整份 `stickers.json`，并删除 `public/sticker/` 里不再被引用的文件。
- 短代码由 `label` 派生：保留字母、数字、`_`、`-`，其余折叠为 `_`，所以 `早安！` 得到 `:ml_早安:`。

## 改名字

```powershell
npm run sticker:editor
```

打开 `http://127.0.0.1:4319/`：每行是缩略图（悬停播放）、名称、关键词、派生出的短代码与原文件名。保存时会：

1. 校验名称非空、短代码不重复；
2. 两阶段重命名 `public/sticker/` 下的动画与尾帧文件；
3. 重写 `stickers.json` 的 `code` / `src` / `poster` / `label` / `keywords`。

关键词只存“额外”的那一条（台词、角色名等），`label`、`setLabel`、`set` 保存时自动补回。不要在 JSON 里手改 `code` / `src` / `poster`，它们必须与文件名一致。

## 在内容里使用

```md
Live 结束后的心情 :ml_太好了:
```

文章 Markdown/MDX 与说说正文一样会展开；未知短代码、行内代码、代码块和链接地址保持原样。行内按 `6em` 高度自动循环，图鉴卡片默认停在尾帧。

## 图鉴

`/emoji/` 顶部有「表情 / 贴纸」两个标签页，`?tab=sticker` 可直接打开贴纸页。贴纸网格在首次切到该标签时才渲染，卡片单击复制短代码，右上角按钮下载动图原文件。
