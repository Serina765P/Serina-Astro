import { createRouter, createWebHistory } from 'vue-router';
import { PLACEHOLDER_TABS } from './navigation.js';
import AssetPanel from './panels/AssetPanel.vue';
import PlaceholderPanel from './panels/PlaceholderPanel.vue';
import PostPanel from './panels/PostPanel.vue';
import ShuoshuoPanel from './panels/ShuoshuoPanel.vue';
import SitePanel from './panels/SitePanel.vue';
import TaxonomyPanel from './panels/TaxonomyPanel.vue';

const placeholderRoutes = PLACEHOLDER_TABS.map((tab) => ({
  path: tab.path,
  name: tab.id,
  component: PlaceholderPanel,
  meta: { tabId: tab.id },
}));

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/site' },
    ...placeholderRoutes,
    {
      path: '/posts',
      name: 'posts',
      component: PostPanel,
      meta: { tabId: 'posts' },
    },
    {
      path: '/shuoshuo',
      name: 'shuoshuo',
      component: ShuoshuoPanel,
      meta: { tabId: 'shuoshuo' },
    },
    {
      path: '/assets',
      name: 'assets',
      component: AssetPanel,
      meta: { tabId: 'assets' },
    },
    { path: '/site', name: 'site', component: SitePanel, meta: { tabId: 'site' } },
    {
      path: '/taxonomy',
      name: 'taxonomy',
      component: TaxonomyPanel,
      meta: { tabId: 'taxonomy' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/site' },
  ],
});
