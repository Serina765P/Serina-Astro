// 把 @astrojs/sitemap 的「索引 + 分片」产物再合成一份单文件 /sitemap.xml。
//
// 为什么需要：索引本身只有几行指针，提交入口如果只认单文件（或者抓取时正好赶上域名迁移，
// 索引里还是旧域的子文件地址、子文件又 301 到新域），Google 会判「无法抓取」。
// 单文件把全部 URL 直接摊开，既好人工核对，也少一层跨主机引用。
//
// 规则：读 dist/sitemap-0.xml 的 <urlset>，原样写成 dist/sitemap.xml。
// 分片超过一个时（URL 数超过 sitemap 的 entryLimit，默认 45000）不再合并，直接失败 ——
// 那种规模应该继续用索引，而不是让单文件悄悄丢掉后面的分片。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const shard = join(dist, 'sitemap-0.xml');
const single = join(dist, 'sitemap.xml');

if (!existsSync(shard)) {
  console.error('[sitemap] 没找到 dist/sitemap-0.xml：@astrojs/sitemap 没有产出分片？');
  process.exit(1);
}

const shards = ['sitemap-0.xml', 'sitemap-1.xml'].filter((name) => existsSync(join(dist, name)));
if (shards.length > 1) {
  console.error('[sitemap] 分片不止一个，单文件会丢 URL；继续用 sitemap-index.xml 提交。');
  process.exit(1);
}

const xml = readFileSync(shard, 'utf8');
const count = (xml.match(/<loc>/g) ?? []).length;
writeFileSync(single, xml);
console.log(`[sitemap] dist/sitemap.xml 已生成（${count} 个 URL）`);
