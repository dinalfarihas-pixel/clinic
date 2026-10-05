<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { menu } from '@/config/menu'
import { useLayoutStore } from '@/stores/layout'
import { useAuthStore } from '@/stores/auth'
import { usePoliStore } from '@/stores/poli'
import AppMenuItem from './AppMenuItem.vue'

const layout = useLayoutStore()
const auth = useAuthStore()
const poli = usePoliStore()

// Isi sub-menu dinamis: grup `dynamic: 'poli'` berisi satu item per poli klinik
const menuTampil = computed(() =>
  menu.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.dynamic === 'poli'
        ? {
            ...item,
            items: poli.list.length
              ? poli.list.map((p) => ({ label: p.NAMA, to: `/rawat-jalan/${encodeURIComponent(p.KODE)}` }))
              : [{ label: poli.loading ? 'Memuat poli…' : 'Belum ada poli', to: '/rawat-jalan' }]
          }
        : item
    )
  }))
)

// Muat daftar poli setelah login; kosongkan saat logout
watch(
  () => auth.idClient,
  (id) => (id ? poli.load() : poli.reset()),
  { immediate: true }
)
const appName = import.meta.env.VITE_APP_NAME || 'Klinik'

// Logo klinik dari profil; kembali ke ikon bawaan jika gagal dimuat
const logoError = ref(false)
watch(() => auth.logo, () => (logoError.value = false))

onMounted(() => {
  // Sesi lama yang belum punya profil klinik
  if (auth.isLoggedIn && !auth.company) auth.loadProfile()
})
</script>

<template>
  <aside class="sidebar" aria-label="Navigasi utama">
    <RouterLink to="/" class="sidebar__brand" :title="auth.company || appName">
      <img
        v-if="auth.logo && !logoError"
        :src="auth.logo"
        alt=""
        class="sidebar__logo sidebar__logo--img"
        @error="logoError = true"
      />
      <span v-else class="sidebar__logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" /></svg>
      </span>
      <span v-if="!layout.sidebarMini" class="sidebar__brand-text">
        <strong class="sidebar__company">{{ auth.company || appName }}</strong>
        <small>Sistem Informasi Klinik</small>
      </span>
    </RouterLink>

    <nav class="sidebar__nav">
      <section v-for="group in menuTampil" :key="group.section" class="sidebar__section">
        <h2 v-if="!layout.sidebarMini" class="sidebar__section-title">{{ group.section }}</h2>
        <hr v-else class="sidebar__divider" />
        <ul class="sidebar__list">
          <AppMenuItem v-for="item in group.items" :key="item.label" :item="item" />
        </ul>
      </section>
    </nav>

    <div
      v-if="auth.user"
      class="sidebar__user"
      v-tooltip.right="layout.sidebarMini ? auth.user.name : null"
    >
      <Avatar :label="auth.initials" shape="circle" class="sidebar__avatar" />
      <div v-if="!layout.sidebarMini" class="sidebar__user-text">
        <strong>{{ auth.user.name }}</strong>
        <small>{{ auth.user.role }}</small>
      </div>
    </div>

    <div v-if="!layout.sidebarMini" class="sidebar__footer">
      <span class="sidebar__status-dot" aria-hidden="true" />
      <span>Terhubung ke server</span>
    </div>
  </aside>
</template>
