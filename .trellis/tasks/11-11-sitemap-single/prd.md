# PRD：sitemap 改为单文件并修正搜索收录入口

## 背景

GSC 上传 `sitemap-index.xml` 后，索引本身「已成功处理」，但它引用的子 sitemap
`https://blog.serina.top/sitemap-0.xml` 显示**无法抓取**、0 个 URL。

抓取诊断：当前对 curl / Googlebot / bingbot 三个 UA 请求索引与子 sitemap 都是 200、
`content-type: application/xml`、无 Cloudflare challenge。时间线看，GSC 读取索引时线上仍是
上一版构建（索引里的 `<loc>` 还是旧域），子文件再 301 到新域，跨主机重定向被 Google 判失败。

## 决策

不再依赖「索引 → 分片」这层间接：构建期额外产出单文件 `/sitemap.xml`。

- 新增 `scripts/build-sitemap.mjs`：读 `dist/sitemap-0.xml`，原样写成 `dist/sitemap.xml`；
  分片超过一个时直接失败（那种规模应继续用索引，不能让单文件悄悄丢 URL）。
- `package.json` 的 `build` 在 `astro build` 之后、`check-build` 之前调用该脚本。
- `public/robots.txt` 的 `Sitemap:` 改指 `https://blog.serina.top/sitemap.xml`。
- 索引文件 `sitemap-index.xml` 保留（@astrojs/sitemap 的产物，站点变大时仍有意义）。

## 验收

- `npm run build` 输出 `[sitemap] dist/sitemap.xml 已生成（49 个 URL）`
- `dist/sitemap.xml` 与 `dist/sitemap-0.xml` 内容一致，49 条 `<loc>`
- `npm run lint` / `npm test` / `npm run check` 通过
- 部署后 `https://blog.serina.top/sitemap.xml` 200、49 条 URL；robots 指向它

## 验证记录（本机，2026-11-11）

- build / lint（91 文件）/ test（226 项）/ check 全部通过
- `dist/sitemap.xml` 3,326 B，`<loc>` 49 条
- 部署后由 GSC 侧改用 `https://blog.serina.top/sitemap.xml` 提交
