<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLayoutStore } from '@/stores/layout'
import { useAuthStore } from '@/stores/auth'

// Inisialisasi store agar preferensi (dark mode, sidebar) langsung diterapkan
useLayoutStore()

const auth = useAuthStore()
const router = useRouter()

// Jika sesi sudah habis (idle > 3 jam) saat tab dibuka/aktif kembali, paksa kembali ke login
function checkSessionExpiry() {
  if (auth.isLoggedIn && auth.isSessionExpired()) {
    auth.logout()
    router.replace({ name: 'login' })
  }
}

// Ikon tab browser mengikuti logo klinik dari profil; kembali ke favicon bawaan jika kosong/gagal dimuat
const DEFAULT_FAVICON = '/favicon.svg'
function setFavicon(href) {
  let link = document.querySelector('link[rel~="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.removeAttribute('type')
  link.href = href
}

watch(
  () => auth.logoKlinik,
  (logo) => {
    if (!logo) return setFavicon(DEFAULT_FAVICON)
    const img = new Image()
    img.onload = () => setFavicon(logo)
    img.onerror = () => setFavicon(DEFAULT_FAVICON)
    img.src = logo
  },
  { immediate: true }
)

let activityThrottled = false
function onUserActivity() {
  if (activityThrottled || !auth.isLoggedIn) return
  activityThrottled = true
  setTimeout(() => { activityThrottled = false }, 60000)
  auth.touchActivity()
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') checkSessionExpiry()
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart']
let idleCheckInterval = null

onMounted(() => {
  checkSessionExpiry()
  ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onUserActivity, { passive: true }))
  document.addEventListener('visibilitychange', onVisibilityChange)
  idleCheckInterval = setInterval(checkSessionExpiry, 60000)
})

onUnmounted(() => {
  ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onUserActivity))
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (idleCheckInterval) clearInterval(idleCheckInterval)
})
</script>

<template>
  <Toast position="top-right" />
  <ConfirmDialog />
  <RouterView />
</template>
