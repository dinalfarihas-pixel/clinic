<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="no-access">
    <p class="no-access__icon"><i class="pi pi-lock" /></p>
    <h1>Anda tidak memiliki akses</h1>
    <p>
      <template v-if="route.query.menu">Menu <strong>{{ route.query.menu }}</strong> belum diberikan untuk akun Anda.</template>
      <template v-else>Menu ini belum diberikan untuk akun Anda.</template>
      Hubungi admin untuk meminta hak akses.
    </p>
    <RouterLink to="/"><Button label="Kembali ke dashboard" icon="pi pi-home" /></RouterLink>
  </div>
</template>

<style scoped>
.no-access {
  text-align: center;
  max-width: 28rem;
}
.no-access__icon {
  font-size: 3rem;
  margin: 0;
  color: var(--p-primary-color);
  line-height: 1;
}
.no-access h1 {
  margin: 0.75rem 0 0.25rem;
  font-size: 1.375rem;
}
.no-access p {
  color: var(--app-text-muted);
  margin: 0 0 1.5rem;
}
</style>
