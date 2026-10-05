<script setup>
const year = new Date().getFullYear()
const appName = import.meta.env.VITE_APP_NAME || 'Klinik'
</script>

<template>
  <footer class="footer">
    <span>© {{ year }} {{ appName }}</span>
    <span>Versi 0.1.0</span>
  </footer>
</template>
