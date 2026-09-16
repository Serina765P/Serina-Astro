import type { ImageMetadata } from 'astro';

const coverAssets = import.meta.glob('../content/posts/**/*.{avif,jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, ImageMetadata>;

export function getPostCover(id: string, cover?: string): ImageMetadata | undefined {
  if (!cover) return undefined;
  const filename = cover.replace(/^\.\//, '');
  return coverAssets[`../content/posts/${id}/${filename}`];
}
