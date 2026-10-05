<template>
  <main class="blank-layout">
    <RouterView />
  </main>
</template>

<style scoped>
.blank-layout {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: var(--app-bg);
}
</style>
