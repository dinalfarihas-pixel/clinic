import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getDaftarPoli } from '@/services/poliklinik'

/**
 * Daftar poli rawat jalan klinik — dipakai menu sidebar "Rawat Jalan"
 * dan halaman daftar pasien per poli.
 */
export const usePoliStore = defineStore('poli', () => {
  const list = ref([]) // { KODE, NAMA, KODE_BPJS }
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  async function load(force = false) {
    if ((loaded.value && !force) || loading.value) return
    loading.value = true
    error.value = ''
    try {
      list.value = (await getDaftarPoli()).sort((a, b) => String(a.NAMA).localeCompare(String(b.NAMA)))
      loaded.value = true
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  function reset() {
    list.value = []
    loaded.value = false
    error.value = ''
  }

  const byKode = (kode) => list.value.find((p) => String(p.KODE) === String(kode)) || null

  return { list, loading, loaded, error, load, reset, byKode }
})
