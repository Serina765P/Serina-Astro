<script setup>
import { zh_cn } from '@nuxt/ui/locale';
import { NAV_ITEMS } from './navigation.js';
</script>

<template>
  <UApp :locale="zh_cn" :toaster="{ position: 'top-right' }">
    <UDashboardGroup storage="local" unit="rem">
      <UDashboardSidebar
        id="admin"
        collapsible
        class="bg-elevated/25"
        :ui="{ footer: 'border-t border-default' }"
      >
        <template #header="{ collapsed }">
          <div class="flex items-center gap-2 overflow-hidden px-1">
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-inverted"
            >
              芹
            </span>
            <div v-if="!collapsed" class="min-w-0 leading-tight">
              <p class="truncate text-sm font-semibold text-highlighted">管理后台</p>
              <p class="truncate text-[10px] tracking-[0.16em] text-muted uppercase">
                Serina · Admin
              </p>
            </div>
          </div>
        </template>

        <template #default="{ collapsed }">
          <UNavigationMenu
            :collapsed="collapsed"
            :items="NAV_ITEMS"
            color="primary"
            orientation="vertical"
            tooltip
          />
        </template>

        <template #footer="{ collapsed }">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1">
              <UColorModeButton square />
              <UButton
                :label="collapsed ? undefined : '博客'"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                to="http://127.0.0.1:4321/"
                target="_blank"
              />
            </div>
            <div
              v-if="!collapsed"
              class="flex items-center gap-2 px-1 text-xs text-muted"
            >
              <span class="size-1.5 rounded-full bg-success" />
              仅本机 · 127.0.0.1:4320
            </div>
          </div>
        </template>
      </UDashboardSidebar>

      <RouterView />
    </UDashboardGroup>
  </UApp>
</template>
