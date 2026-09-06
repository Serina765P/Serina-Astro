// 一次性迁移脚本：从旧 Hexo 站点(blogdev)搬运文章与数据到 Astro 内容目录。
// 用法：node scripts/migrate-posts.mjs [旧站根目录]
import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const OLD_ROOT = process.argv[2] ?? 'C:/Projects/blogdev';
const OLD_POSTS = path.join(OLD_ROOT, 'source/_posts');
const NEW_POSTS = new URL('../src/content/posts/', import.meta.url);
const NEW_DATA = new URL('../src/data/', import.meta.url);

// 会被整体丢弃的页面级字段（主题布局遗留，与文章无关）
const DROP_KEYS = new Set(['layout', 'type', 'comments', 'toc', 'custom_css']);

function skinFromCustomCss(value) {
  if (!value) return null;
  const name = String(value).trim().replace(/^\/?css\//, '').replace(/\.css$/, '');
  return name || null;
}

function transformFrontmatter(raw) {
  const lines = raw.split('\n');
  const out = [];
  for (const line of lines) {
    const m = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (m) {
      const key = m[1];
      const value = m[2].trim();
      if (key === 'custom_css') {
        const skin = skinFromCustomCss(value);
        if (skin) out.push(`skin: ${skin}`);
        continue;
      }
      if (DROP_KEYS.has(key)) continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function transformBody(raw, dirName) {
  return raw
    .replace(/^\s*<!--\s*custom_css:.*?-->\s*$/gim, '') // 脚本注入备用注释
    .replace(/\{%\s*asset_img\s+([^\s}]+)\s+([^%}]*)%\}/g, (_all, file, alt) => {
      const cleanAlt = alt.trim() || file;
      // Hexo asset_img 指向同名 post_asset_folder，Astro 中相对 md 文件引用
      return `![${cleanAlt}](${dirName}/${file})`;
    });
}

await mkdir(NEW_POSTS, { recursive: true });
await mkdir(NEW_DATA, { recursive: true });

const entries = await readdir(OLD_POSTS, { withFileTypes: true });
let postCount = 0;
let assetDirs = 0;
let rewritten = 0;

for (const entry of entries) {
  const src = path.join(OLD_POSTS, entry.name);
  if (entry.isFile() && entry.name.endsWith('.md')) {
    const original = await readFile(src, 'utf8');
    let text = original.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const dirName = entry.name.replace(/\.md$/, '');
    const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
    if (!fmMatch) throw new Error(`无法解析 frontmatter: ${entry.name}`);
    const [, fm, body] = fmMatch;
    const newFm = transformFrontmatter(fm);
    const newBody = transformBody(body, dirName);
    const result = `---\n${newFm.replace(/\n$/, '')}\n---\n${newBody}`;
    if (result !== original) rewritten++;
    await writeFile(new URL(entry.name, NEW_POSTS), result, 'utf8');
    postCount++;
  } else if (entry.isDirectory()) {
    // Hexo post_asset_folder：非空才随迁
    const files = await readdir(src);
    if (files.length > 0) {
      await cp(src, new URL(`${entry.name}/`, NEW_POSTS), { recursive: true });
      assetDirs++;
      console.log(`资源目录: ${entry.name} (${files.length} 个文件)`);
    }
  }
}

await cp(path.join(OLD_ROOT, 'source/_data/resources.csv'), new URL('resources.csv', NEW_DATA));
await cp(path.join(OLD_ROOT, 'source/_data/shuoshuo.json'), new URL('shuoshuo.json', NEW_DATA));

console.log(`完成: ${postCount} 篇文章 (${rewritten} 篇有改动), ${assetDirs} 个资源目录, resources.csv + shuoshuo.json`);
