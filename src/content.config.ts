import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

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
