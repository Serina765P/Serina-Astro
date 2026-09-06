// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';

export default defineConfig({
  site: 'https://blog.serinap.top',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  integrations: [
    mdx(),
    sitemap(),
    icon({
      include: {
        'material-symbols': [
          'home',
          'archive',
          'category',
          'label',
          'library-music',
          'link',
          'chat',
          'person',
          'mail',
          'search',
          'menu',
          'close',
          'dark-mode',
          'light-mode',
          'keyboard-arrow-up',
          'keyboard-arrow-left',
          'keyboard-arrow-right',
          'calendar-month',
          'schedule',
          'article',
          'cloud-download',
          'open-in-new',
          'content-copy',
          'check-circle',
          'music-note',
          'album',
          'send',
          'favorite',
          'tag',
          'folder',
        ],
        'simple-icons': ['github', 'x', 'tencentqq', 'bilibili'],
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'one-light',
        dark: 'github-dark-dimmed',
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
