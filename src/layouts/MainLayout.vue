<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useLayoutStore } from '@/stores/layout'
import AppSidebar from './components/AppSidebar.vue'
import AppNavbar from './components/AppNavbar.vue'
import AppFooter from './components/AppFooter.vue'

const layout = useLayoutStore()
const route = useRoute()

const layoutClass = computed(() => ({
  'layout--mini': layout.sidebarMini,
  'layout--mobile': layout.isMobile,
  'layout--mobile-open': layout.isMobile && layout.mobileSidebarOpen
}))

// Tutup drawer mobile setiap kali pindah halaman
watch(() => route.fullPath, () => layout.closeMobileSidebar())
</script>

<template>
  <div class="layout" :class="layoutClass">
    <AppSidebar />

    <div
      v-if="layout.isMobile && layout.mobileSidebarOpen"
      class="layout__mask"
      @click="layout.closeMobileSidebar"
    />

    <div class="layout__main">
      <AppNavbar />

      <main class="layout__content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="route.path" />
        </RouterView>
      </main>

      <AppFooter />
    </div>
  </div>
</template>
