<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useLayoutStore } from '@/stores/layout'

const props = defineProps({
  item: { type: Object, required: true },
  depth: { type: Number, default: 0 }
})

const route = useRoute()
const layout = useLayoutStore()

const hasChildren = computed(() => Array.isArray(props.item.items) && props.item.items.length > 0)

function containsRoute(item, path) {
  // `exact`: hanya aktif di path persis (untuk item yang path-nya induk dari item lain di menu)
  if (item.to && (path === item.to || (!item.exact && item.to !== '/' && path.startsWith(item.to + '/')))) return true
  return (item.items || []).some((child) => containsRoute(child, path))
}

const isActive = computed(() => containsRoute(props.item, route.path))
const open = ref(isActive.value)

// Buka grup otomatis jika route aktif berada di dalamnya
watch(isActive, (val) => {
  if (val) open.value = true
})

const showLabel = computed(() => !layout.sidebarMini || props.depth > 0)
const tooltip = computed(() => (layout.sidebarMini && props.depth === 0 ? props.item.label : null))

function toggleGroup() {
  if (layout.sidebarMini) {
    layout.expandSidebar()
    open.value = true
    return
  }
  open.value = !open.value
}
</script>

<template>
  <li class="menu-item" :class="{ 'menu-item--child': depth > 0 }">
    <!-- Grup dengan submenu -->
    <template v-if="hasChildren">
      <button
        type="button"
        class="menu-link"
        :class="{ 'menu-link--parent-active': isActive }"
        :aria-expanded="open"
        v-tooltip.right="tooltip"
        @click="toggleGroup"
      >
        <i v-if="item.icon" :class="item.icon" class="menu-link__icon" />
        <span v-if="showLabel" class="menu-link__label">{{ item.label }}</span>
        <i
          v-if="showLabel"
          class="pi pi-chevron-down menu-link__chevron"
          :class="{ 'menu-link__chevron--open': open }"
        />
      </button>
      <ul v-show="open && !layout.sidebarMini" class="menu-sub">
        <AppMenuItem v-for="child in item.items" :key="child.label" :item="child" :depth="depth + 1" />
      </ul>
    </template>

    <!-- Link tunggal -->
    <RouterLink
      v-else
      :to="item.to"
      class="menu-link"
      :class="{ 'menu-link--active': isActive }"
      v-tooltip.right="tooltip"
    >
      <i v-if="item.icon" :class="item.icon" class="menu-link__icon" />
      <span v-else-if="depth > 0" class="menu-link__bullet" aria-hidden="true" />
      <span v-if="showLabel" class="menu-link__label">{{ item.label }}</span>
      <span v-if="item.badge && showLabel" class="menu-link__badge">{{ item.badge }}</span>
      <span v-else-if="item.badge" class="menu-link__badge-dot" aria-hidden="true" />
    </RouterLink>
  </li>
</template>
