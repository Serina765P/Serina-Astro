import { createRouter, createWebHistory } from 'vue-router';
import { PLACEHOLDER_TABS } from './navigation.js';
import PlaceholderPanel from './panels/PlaceholderPanel.vue';
import SitePanel from './panels/SitePanel.vue';

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
    { path: '/site', name: 'site', component: SitePanel, meta: { tabId: 'site' } },
    { path: '/:pathMatch(.*)*', redirect: '/site' },
  ],
});
