<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { getStatistikPendaftaran, getRiwayatPendaftaran, CARA_BAYAR_BPJS } from '@/services/pendaftaran'
import { toYmd } from '@/utils/tanggal'

const router = useRouter()
const toast = useToast()

const loading = ref(false)
const statistik = ref(null)
const pendaftaranHariIni = ref([])

const isBatal = (r) => String(r.BATAL) === '1'
const isSelesai = (r) => !!(r.KELUARPOLY && r.KELUARPOLY !== '-') || !!r.STTS_PULANG
const isBpjsRow = (r) => r.KODECARABAYAR == CARA_BAYAR_BPJS || /BPJS/i.test(r.CARABAYAR || '')

const aktifHariIni = computed(() => pendaftaranHariIni.value.filter((r) => !isBatal(r)))

const summary = computed(() => {
  const aktif = aktifHariIni.value
  const selesai = aktif.filter(isSelesai).length
  return [
    { label: 'Pasien hari ini', value: statistik.value?.daftar_hari_ini ?? aktif.length, icon: 'pi pi-users' },
    { label: 'Belum dilayani', value: aktif.length - selesai, icon: 'pi pi-clock' },
    { label: 'Selesai', value: selesai, icon: 'pi pi-check-circle' },
    { label: 'Pasien BPJS', value: statistik.value?.pasien_bpjs ?? aktif.filter(isBpjsRow).length, icon: 'pi pi-id-card' }
  ]
})

// Antrian terkini: pendaftaran terbaru hari ini, belum selesai diprioritaskan
const queue = computed(() =>
  [...aktifHariIni.value]
    .sort((a, b) => Number(isSelesai(a)) - Number(isSelesai(b)))
    .slice(0, 8)
    .map((r) => ({
      no: r.NOPENDAFTARAN,
      rm: r.NOMR,
      nama: r.NAMAPASIEN,
      poli: r.POLI || '—',
      penjamin: r.CARABAYAR || '—',
      status: isSelesai(r) ? 'Selesai' : 'Belum dilayani'
    }))
)

// Poli teraktif hari ini, dihitung dari data yang sama (tidak butuh endpoint tambahan)
const poliTeraktif = computed(() => {
  const counts = new Map()
  aktifHariIni.value.forEach((r) => {
    const key = r.POLI || 'Lainnya'
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([poli, jumlah]) => ({ poli, jumlah }))
})

const statusSeverity = { 'Belum dilayani': 'warn', Selesai: 'success' }

async function muat() {
  loading.value = true
  const hariIni = toYmd(new Date())
  try {
    const [stat, riwayat] = await Promise.all([
      getStatistikPendaftaran(hariIni).catch(() => null),
      getRiwayatPendaftaran({ tglAwal: hariIni, tglAkhir: hariIni })
    ])
    statistik.value = stat
    pendaftaranHariIni.value = riwayat
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat dashboard', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Ringkasan pelayanan klinik hari ini.</p>
      </div>
      <Button label="Daftarkan pasien" icon="pi pi-user-plus" @click="router.push('/pendaftaran')" />
    </header>

    <section class="summary" aria-label="Ringkasan hari ini">
      <div v-for="s in summary" :key="s.label" class="summary__item">
        <i :class="s.icon" class="summary__icon" />
        <div>
          <p class="summary__value">{{ loading ? '—' : s.value }}</p>
          <p class="summary__label">{{ s.label }}</p>
        </div>
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">Antrian terkini</h2>
          <Button label="Lihat semua" text size="small" @click="router.push('/riwayat-pendaftaran')" />
        </header>
        <DataTable :value="queue" :loading="loading" size="small" stripedRows responsiveLayout="scroll">
          <template #empty>
            <p class="empty">Belum ada pendaftaran hari ini.</p>
          </template>
          <Column field="no" header="No. registrasi" style="width: 9rem" />
          <Column field="rm" header="No. RM" />
          <Column field="nama" header="Nama pasien" />
          <Column field="poli" header="Poli" />
          <Column field="penjamin" header="Penjamin" />
          <Column field="status" header="Status">
            <template #body="{ data }">
              <Tag :value="data.status" :severity="statusSeverity[data.status]" />
            </template>
          </Column>
        </DataTable>
      </section>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">Poli teraktif hari ini</h2>
        </header>
        <ul v-if="poliTeraktif.length" class="schedule">
          <li v-for="p in poliTeraktif" :key="p.poli" class="schedule__item">
            <p class="schedule__name">{{ p.poli }}</p>
            <Tag :value="`${p.jumlah} pasien`" severity="secondary" />
          </li>
        </ul>
        <p v-else class="empty">{{ loading ? 'Memuat…' : 'Belum ada pendaftaran hari ini.' }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  margin-bottom: 1.25rem;
}
.summary__item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1.125rem 1.25rem;
}
.summary__item + .summary__item {
  border-left: 1px solid var(--app-border);
}
.summary__icon {
  font-size: 1.125rem;
  color: var(--p-primary-color);
  background: var(--p-primary-50);
  width: 2.5rem;
  height: 2.5rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
}
:global(.app-dark) .summary__icon {
  background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
}
.summary__value {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.summary__label {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}

.schedule {
  list-style: none;
  margin: 0;
  padding: 0;
}
.schedule__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 0;
}
.schedule__item + .schedule__item {
  border-top: 1px solid var(--app-border);
}
.schedule__name {
  margin: 0;
  font-weight: 600;
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}

@media (max-width: 1200px) {
  .dashboard-grid { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary__item:nth-child(3) { border-left: 0; }
  .summary__item:nth-child(n + 3) { border-top: 1px solid var(--app-border); }
}
</style>
