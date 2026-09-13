import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE } from '../site.config';

export async function GET(context) {
  const posts = (await getCollection('posts')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description ?? '',
      link: `/posts/${post.id}/`,
      categories: [...post.data.tags],
    })),
    customData: '<language>zh-CN</language>',
  });
}
