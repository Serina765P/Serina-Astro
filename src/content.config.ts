import { defineCollection, z } from 'astro:content';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    categories: z.array(z.string()).default([]),
    keywords: z.array(z.string()).optional(),
    description: z.string().optional(),
    /** 文章皮肤：对应 layouts/PostLayout 中按需挂载的皮肤组件 */
    skin: z.enum(['imas-album']).optional(),
  }),
});

// 说说：按年分片存放（src/data/shuoshuo/<沪年>.json），本 loader 合并全部 shard。
// 分片路径契约与 worker/src/lib.js 的 shardPath() 共享 —— 年份按东八区取，
// 与站内日期展示同口径（跨年条目不会写错文件）。
const shuoshuo = defineCollection({
  loader: {
    name: 'shuoshuo-shards',
    load: async ({ config, store, logger, parseData, watcher, generateDigest }) => {
      const rootDir = fileURLToPath(config.root);
      const dir = path.join(rootDir, 'src', 'data', 'shuoshuo');

      async function loadShards() {
        const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
        store.clear();
        const seen = new Set<string>();
        for (const file of files) {
          const filePath = path.join(dir, file);
          const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as { items?: unknown };
          const items = Array.isArray(raw.items) ? raw.items : [];
          for (const item of items as Array<Record<string, unknown>>) {
            const id = String(item.id ?? '');
            if (!id) {
              logger.warn(`说说分片 ${file} 有缺少 id 的条目，已跳过`);
              continue;
            }
            if (seen.has(id)) logger.warn(`说说 id 重复：${id}（${file}），后者覆盖前者`);
            seen.add(id);
            const data = await parseData({ id, data: item, filePath });
            store.set({
              id,
              data,
              digest: generateDigest(data),
              filePath: path.relative(rootDir, filePath).split(path.sep).join('/'),
            });
          }
          watcher?.add(filePath);
        }
        logger.debug(`已合并 ${files.length} 个说说分片，共 ${seen.size} 条`);
      }

      await loadShards();
      watcher?.add(dir);
      watcher?.on('change', async (changedPath) => {
        if (path.dirname(changedPath) !== dir) return;
        logger.info(`说说分片 ${path.basename(changedPath)} 变化，重载全部分片`);
        await loadShards();
      });
    },
  },
  schema: z.object({
    id: z.string(),
    /** 邮件来源的条目可以没有标题 */
    title: z.string().default(''),
    /** OPUS = B 站动态（历史数据），MAIL = 邮件发布 */
    type: z.string().default('OPUS'),
    content: z.string(),
    images: z
      .array(
        z.object({
          url: z.string(),
          width: z.number(),
          height: z.number(),
        }),
      )
      .default([]),
    /** 空字符串 = 无外链（邮件条目），说说页不渲染「原动态」 */
    link: z.string().default(''),
    like: z.number().default(0),
    published_at: z.coerce.date(),
  }),
});

export const collections = { posts, shuoshuo };
