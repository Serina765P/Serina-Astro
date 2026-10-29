<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { PLACEHOLDER_TABS } from '../navigation.js';

const route = useRoute();
const tab = computed(
  () => PLACEHOLDER_TABS.find((item) => item.id === route.meta.tabId) ?? PLACEHOLDER_TABS[0],
);
</script>

<template>
  <UDashboardPanel :id="tab.id">
    <template #header>
      <UDashboardNavbar :title="tab.label">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge color="warning" variant="subtle">后续工单</UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="max-w-5xl py-6">
        <UCard>
          <div class="flex flex-col items-start gap-5">
            <div
              class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <UIcon :name="tab.icon" class="size-6" />
            </div>

            <div class="space-y-1.5">
              <h2 class="text-xl font-semibold text-highlighted">{{ tab.label }}</h2>
              <p class="max-w-prose text-sm leading-6 text-muted">{{ tab.summary }}</p>
            </div>

            <ul class="flex flex-col gap-2 text-sm text-default">
              <li v-for="point in tab.points" :key="point" class="flex items-center gap-2">
                <UIcon name="i-lucide-dot" class="size-4 text-primary" />
                {{ point }}
              </li>
            </ul>

            <UAlert
              color="neutral"
              variant="subtle"
              icon="i-lucide-hammer"
              title="尚未接入"
              description="当前工单已交付 Nuxt UI 骨架与「站点与友链」完整切片。"
            />
          </div>
        </UCard>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
