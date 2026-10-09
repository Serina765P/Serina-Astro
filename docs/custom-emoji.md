# 自定义表情维护

站内表情由 `src/data/emoji.json` 注册，图片统一放在 `public/emoji/`。正常新增或替换时，用 `npm run emoji:import` 一次完成图片转换、尺寸读取和注册表更新。

## 新增表情

图片支持 PNG、GIF 和 WebP。文件名就是中文显示名，例如 `wink.png`、`你好.png`。批量导入时，目录内每个支持的图片都会按文件名登记；若文件名带方括号，括号会自动去掉。

新增单张表情：

```powershell
npm run emoji:import -- --input "C:\Users\Serina\Downloads\开心.png" --set 765pro --label 765PRO --keywords "高兴,笑"
```

批量导入一个目录：

```powershell
npm run emoji:import -- --input "C:\Users\Serina\Downloads\new-stamps" --set sc --label 闪耀色彩
```

创建新套装时，给 `--set` 选一个稳定、全小写且唯一的前缀，给 `--label` 写图鉴里显示的名称：

```powershell
npm run emoji:import -- --input "C:\Users\Serina\Downloads\new-stamps" --set myset --label 我的新套装
```

短代码由套装前缀和文件名组成，例如 `开心.png` 配 `--set 765pro` 会得到 `:765pro_开心:`。中文文件名会保留；同一套装的显示名必须一致，同一套装内不能重复使用相同短代码。导入已有短代码会失败，明确要更新时添加 `--replace`。`--dry-run` 可以先检查匹配、尺寸和输出大小，不写文件。

现有套装前缀和显示名：`765pro` / `765PRO`、`afterglow` / `Afterglow`、`sweet` / `甜蜜时光`、`scclassic` / `闪耀色彩古韵新辉`、`sc` / `闪耀色彩`。

新图片会转换为 WebP：静态图用 quality 65、effort 6；透明层质量保持 100。GIF 会按动画方式解码，并保留全部帧、帧间隔和循环设置。已有 WebP 会直接登记，不再重复有损压缩。更新时请从未压缩的原图重新导入并加 `--replace`。

## 一次迁移现有表情

首次把原始 `stamp` 目录中的旧 PNG/GIF 转成 WebP 时，可运行：

```powershell
npm run emoji:import -- --all --input "C:\Users\Serina\Downloads\stamp"
```

这条迁移命令按当前五套既有素材目录和注册表配对，需要完整的原始 `stamp` 根目录。它用于首轮迁移；之后新增或更新表情请使用前面的普通导入命令，更新短代码时加 `--replace`。

## 在内容里使用

文章 Markdown/MDX 和说说正文使用相同的 `:短代码:` 语法。未知短代码会原样显示。文章中的行内代码、代码块、HTML 属性和链接地址不会转换；说说按纯文本处理，其中的网址保持原样。

```md
今天状态不错 :765pro_微笑: 做完事情来喝茶 :afterglow_饮茶:
```
