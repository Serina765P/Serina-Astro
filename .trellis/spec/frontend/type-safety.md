# Type Safety

> `strict` TypeScript + 内容 schema 作为真值；边界输入必须校验，不靠断言。

## 配置

- `tsconfig.json` 继承 `astro/tsconfigs/strict`；不要放宽 `strict`。
- Astro 组件 frontmatter 里的 `Astro.props` 是 `Record<string, any>`；需要类型时只断言一次（`Astro.props as Props`），并在注释里说明原因（`Toc.astro`、`ArticleMusicPlayer.astro`）。

## 内容 schema 是真值

- `src/content.config.ts` 用 zod 定义集合；字段的枚举从 `src/lib/post-frontmatter.ts` 导入（`POST_SKINS`、`POST_LICENSES`），不要在两处各写一份字面量。
- 新增 frontmatter 字段时同步三处：`src/content.config.ts`、`src/lib/post-frontmatter.ts` 的 `POST_FRONTMATTER_FIELDS`、`scripts/admin/lib/frontmatter.mjs` 的校验/写入。
- 日期字段用 `z.coerce.date()`；展示时用 `src/lib/utils.ts` 的 `formatDate` / `yearInShanghai`（显式 `Asia/Shanghai`）。

## 边界校验

- 外部/不信任输入先收窄再使用：
  - `isBvid`、`parsePage`（`src/lib/bilibili.ts`）；
  - `isTrackId`、`parseTracks`（`src/lib/music.ts`、`src/scripts/music.ts`）；
  - `parseAllowList`、`stripToken`（`worker/src/lib.js`）。
- 不用 `as` 把 `unknown` 直接变成业务类型；用类型守卫或 `filter` 收窄。
- JSON 数据（快照、taxonomy、分片）在读取处校验形状；坏数据宁可报错/跳过，也不要拼出错误 URL。

## 类型组织

- 共享数据结构在 `src/lib/` 导出 `interface`（`MusicTrack`、`MusicSnapshot`、`BilibiliEmbed`、`TaxonomyMaps`）。
- 常量用 `as const`，类型从常量派生（`type PostLicense = (typeof POST_LICENSES)[number]`）。
- 组件 Props 就近声明；跨组件复用的 Props 才提取。
- 不要用 `any` 绕过错误；确需放宽时限定在单行并写原因。

## 反模式

- 在组件里复制一份枚举/字段清单。
- `JSON.parse(...)` 后直接断言成业务类型。
- 用 `new Date(string)` 解析用户输入而不校验。
- 把 `Date` 当字符串传递；需要序列化时明确用 ISO。
