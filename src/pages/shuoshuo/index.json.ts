import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { serializeShuoshuo, sortShuoshuo } from '../../lib/shuoshuo';

export const GET: APIRoute = async () => {
  const items = sortShuoshuo((await getCollection('shuoshuo')).map(serializeShuoshuo));
  return new Response(JSON.stringify({ items, total: items.length }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
