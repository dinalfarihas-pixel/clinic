import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'

export default defineConfig({
  base: '',//'/coreclinic/',
  plugins: [
    vue(),
    // Komponen PrimeVue (Button, DataTable, dll) otomatis ter-import saat dipakai di template
    Components({
      resolvers: [PrimeVueResolver()],
      dts: false
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173
    // proxy ke backend CI3, sesuaikan jika perlu:
    // proxy: { '/api': { target: 'http://localhost/klinik-api', changeOrigin: true } }
  }
})
