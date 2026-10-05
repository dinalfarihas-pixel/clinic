<template>
  <div class="not-found">
    <p class="not-found__code">404</p>
    <h1>Halaman tidak ditemukan</h1>
    <p>Alamat yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
    <RouterLink to="/"><Button label="Kembali ke dashboard" icon="pi pi-home" /></RouterLink>
  </div>
</template>

<style scoped>
.not-found {
  text-align: center;
  max-width: 28rem;
}
.not-found__code {
  font-size: 4rem;
  font-weight: 700;
  margin: 0;
  color: var(--p-primary-color);
  line-height: 1;
}
.not-found h1 {
  margin: 0.75rem 0 0.25rem;
  font-size: 1.375rem;
}
.not-found p {
  color: var(--app-text-muted);
  margin: 0 0 1.5rem;
}
</style>
