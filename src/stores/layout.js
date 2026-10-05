import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const MOBILE_BREAKPOINT = 992
const STORAGE_KEY = 'klinik.layout'

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

export const useLayoutStore = defineStore('layout', () => {
  const prefs = loadPrefs()

  const sidebarCollapsed = ref(prefs.sidebarCollapsed ?? false) // mode ikon saja (desktop)
  const mobileSidebarOpen = ref(false) // drawer di layar kecil
  const darkMode = ref(prefs.darkMode ?? false)
  const isMobile = ref(window.innerWidth < MOBILE_BREAKPOINT)

  const sidebarMini = computed(() => !isMobile.value && sidebarCollapsed.value)

  function toggleSidebar() {
    if (isMobile.value) mobileSidebarOpen.value = !mobileSidebarOpen.value
    else sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function expandSidebar() {
    sidebarCollapsed.value = false
  }

  function closeMobileSidebar() {
    mobileSidebarOpen.value = false
  }

  function toggleDarkMode() {
    darkMode.value = !darkMode.value
  }

  function applyDarkMode(value) {
    document.documentElement.classList.toggle('app-dark', value)
  }

  function onResize() {
    isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
    if (!isMobile.value) mobileSidebarOpen.value = false
  }

  window.addEventListener('resize', onResize)
  applyDarkMode(darkMode.value)

  watch(darkMode, applyDarkMode)
  watch([sidebarCollapsed, darkMode], () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sidebarCollapsed: sidebarCollapsed.value, darkMode: darkMode.value })
      )
    } catch {
      /* abaikan jika storage tidak tersedia */
    }
  })

  return {
    sidebarCollapsed,
    mobileSidebarOpen,
    darkMode,
    isMobile,
    sidebarMini,
    toggleSidebar,
    expandSidebar,
    closeMobileSidebar,
    toggleDarkMode
  }
})
