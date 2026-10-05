<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ route.meta.title }}</h1>
        <p class="page-subtitle">Halaman ini belum dibuat.</p>
      </div>
    </header>

    <section class="panel placeholder">
      <i class="pi pi-wrench placeholder__icon" />
      <p>
        Buat komponen di <code>src/views/</code>, lalu ganti <code>Placeholder</code>
        pada route <code>{{ route.path }}</code> di <code>src/router/index.js</code>.
      </p>
    </section>
  </div>
</template>

<style scoped>
.placeholder {
  text-align: center;
  padding: 3rem 1.5rem;
  color: var(--app-text-muted);
}
.placeholder__icon {
  font-size: 2rem;
  color: var(--p-primary-color);
  margin-bottom: 0.75rem;
}
.placeholder p {
  max-width: 34rem;
  margin: 0 auto;
}
code {
  font-size: 0.8125rem;
  background: var(--app-bg);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}
</style>
