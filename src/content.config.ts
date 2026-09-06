import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { parseResourcesCsv } from './lib/resource-data.js';

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

const resources = defineCollection({
  loader: file('src/data/resources.csv', {
    parser: (text) => parseResourcesCsv(text),
  }),
  schema: z.object({
    id: z.string(),
    企划: z.string(),
    资源类型: z.string(),
    系列: z.string(),
    名称: z.string(),
    别名: z.string(),
    年份: z.string(),
    格式: z.string(),
    大小: z.string(),
    网盘路径: z.string(),
    分享链接: z.string(),
    提取码: z.string(),
    有效期: z.string(),
    状态: z.enum(['可用', '待分享', '更新中', '已失效']),
    更新时间: z.string(),
    排序值: z.string(),
  }),
});

const shuoshuo = defineCollection({
  loader: file('src/data/shuoshuo.json', {
    parser: (text) => {
      const data = JSON.parse(text) as {
        items: Array<Record<string, unknown> & { id: string }>;
      };
      return data.items;
    },
  }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    content: z.string(),
    images: z.array(
      z.object({
        url: z.string(),
        width: z.number(),
        height: z.number(),
      }),
    ),
    link: z.string(),
    like: z.number(),
    published_at: z.coerce.date(),
  }),
});

export const collections = { posts, resources, shuoshuo };
