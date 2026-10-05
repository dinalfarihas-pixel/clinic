<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useLayoutStore } from '@/stores/layout'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const layout = useLayoutStore()
const auth = useAuthStore()

const breadcrumbHome = { icon: 'pi pi-home', route: '/' }
const breadcrumbItems = computed(() => (route.meta.breadcrumb || []).map((label) => ({ label })))

const today = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(new Date())

const userMenu = ref()
const userMenuItems = [
  { label: 'Profil saya', icon: 'pi pi-user', command: () => router.push('/pengaturan') },
  { label: 'Ganti unit', icon: 'pi pi-building' },
  { separator: true },
  { label: 'Keluar', icon: 'pi pi-sign-out', command: confirmLogout }
]

const notifPanel = ref()
const notifications = [
  { id: 1, icon: 'pi pi-ticket', text: '3 pasien baru menunggu di Poli Umum', time: '2 menit lalu' },
  { id: 2, icon: 'pi pi-box', text: 'Stok Amoxicillin 500 mg di bawah batas minimum', time: '1 jam lalu' },
  { id: 3, icon: 'pi pi-file', text: 'Hasil lab pasien RM-00231 sudah tersedia', time: '3 jam lalu' }
]

function confirmLogout() {
  confirm.require({
    header: 'Keluar dari aplikasi?',
    message: 'Sesi Anda akan diakhiri dan Anda perlu masuk kembali.',
    icon: 'pi pi-sign-out',
    acceptLabel: 'Keluar',
    rejectLabel: 'Batal',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => {
      auth.logout()
      router.push({ name: 'login' })
    }
  })
}
</script>

<template>
  <header class="navbar">
    <div class="navbar__left">
      <Button
        icon="pi pi-bars"
        text
        rounded
        severity="secondary"
        aria-label="Buka/tutup menu"
        @click="layout.toggleSidebar"
      />
      <Breadcrumb :home="breadcrumbHome" :model="breadcrumbItems" class="navbar__breadcrumb">
        <template #item="{ item }">
          <RouterLink v-if="item.route" :to="item.route" class="navbar__crumb">
            <i :class="item.icon" />
          </RouterLink>
          <span v-else class="navbar__crumb">{{ item.label }}</span>
        </template>
      </Breadcrumb>
    </div>

    <div class="navbar__right">
      <span class="navbar__date">{{ today }}</span>

      <Button
        :icon="layout.darkMode ? 'pi pi-sun' : 'pi pi-moon'"
        text
        rounded
        severity="secondary"
        :aria-label="layout.darkMode ? 'Mode terang' : 'Mode gelap'"
        v-tooltip.bottom="layout.darkMode ? 'Mode terang' : 'Mode gelap'"
        @click="layout.toggleDarkMode"
      />

      <OverlayBadge :value="notifications.length" severity="danger" size="small">
        <Button
          icon="pi pi-bell"
          text
          rounded
          severity="secondary"
          aria-label="Notifikasi"
          @click="notifPanel.toggle($event)"
        />
      </OverlayBadge>
      <Popover ref="notifPanel">
        <div class="notif">
          <p class="notif__title">Notifikasi</p>
          <ul class="notif__list">
            <li v-for="n in notifications" :key="n.id" class="notif__item">
              <i :class="n.icon" />
              <div>
                <p>{{ n.text }}</p>
                <small>{{ n.time }}</small>
              </div>
            </li>
          </ul>
        </div>
      </Popover>

      <button
        type="button"
        class="navbar__user"
        aria-haspopup="true"
        aria-controls="user-menu"
        @click="userMenu.toggle($event)"
      >
        <Avatar :label="auth.initials" shape="circle" class="navbar__avatar" />
        <span class="navbar__user-text">
          <strong>{{ auth.user?.name }}</strong>
          <small>{{ [auth.user?.role, auth.user?.unit].filter(Boolean).join(", ") }}</small>
        </span>
        <i class="pi pi-angle-down" />
      </button>
      <Menu id="user-menu" ref="userMenu" :model="userMenuItems" popup />
    </div>
  </header>
</template>
