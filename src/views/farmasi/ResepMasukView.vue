<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { getDaftarResepMasuk, labelStatusResep, severityStatusResep, formatUsiaResep } from '@/services/resep'
import { toYmd, formatTanggal } from '@/utils/tanggal'

const router = useRouter()
const toast = useToast()

// ── Filter tanggal & pencarian ────────────────────────────────
const tglAwal = ref(new Date())
const tglAkhir = ref(new Date())
const keyword = ref('')
const filterJenisRawat = ref(null)

const jenisRawatOptions = [
  { label: 'Semua jenis rawat', value: null },
  { label: 'Rawat Jalan', value: 'JALAN' },
  { label: 'Rawat Inap', value: 'INAP' }
]

// ── Data ─────────────────────────────────────────────────────
const resep = ref([])
const loading = ref(false)
const lastUpdated = ref(null)
const now = ref(new Date())

async function muat({ diam = false } = {}) {
  if (tglAwal.value && tglAkhir.value && tglAwal.value > tglAkhir.value) {
    toast.add({ severity: 'warn', summary: 'Tanggal', detail: 'Tanggal awal melewati tanggal akhir.', life: 3000 })
    return
  }
  const awal = toYmd(tglAwal.value)
  const akhir = toYmd(tglAkhir.value)
  const selisihHari = Math.round((new Date(akhir) - new Date(awal)) / 86400000)
  if (selisihHari >= 20) {
    toast.add({ severity: 'warn', summary: 'Rentang tanggal', detail: 'Rentang tanggal maksimal 20 hari (dibatasi server).', life: 4500 })
    return
  }
  loading.value = !diam
  try {
    resep.value = await getDaftarResepMasuk({ tglAwal: awal, tglAkhir: akhir })
    lastUpdated.value = new Date()
  } catch (err) {
    if (!diam) toast.add({ severity: 'error', summary: 'Gagal memuat resep', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

function resetFilter() {
  keyword.value = ''
  filterJenisRawat.value = null
  filterStatus.value = 'ALL'
}

// ── Filter status (kartu ringkasan, klikable) ─────────────────
const filterStatus = ref('ALL')

function matchStatus(r, key) {
  if (key === 'ALL') return true
  if (key === 'M') return r.STATUS_PROGRESS !== 'P' && r.STATUS_PROGRESS !== 'C'
  return r.STATUS_PROGRESS === key
}
function toggleStatus(key) {
  filterStatus.value = filterStatus.value === key ? 'ALL' : key
}

// dasar: semua filter kecuali status (dipakai utk hitung angka tiap kartu ringkasan)
const dasar = computed(() => {
  let data = resep.value
  if (filterJenisRawat.value) data = data.filter((r) => (r.JENISRAWAT || '').toUpperCase() === filterJenisRawat.value)
  const q = keyword.value.trim().toLowerCase()
  if (q) {
    data = data.filter((r) =>
      [r.NAMA, r.NOMR, r.NOREGISTER, r.DPJP, r.POLI_RUANG, r.CARABAYAR].some((v) => String(v ?? '').toLowerCase().includes(q))
    )
  }
  return data
})

const dataTampil = computed(() => dasar.value.filter((r) => matchStatus(r, filterStatus.value)))

const ringkasan = computed(() => [
  { key: 'ALL', label: 'Total resep', icon: 'pi pi-file', severity: 'secondary', value: dasar.value.length },
  { key: 'M', label: 'Menunggu', icon: 'pi pi-clock', severity: 'danger', value: dasar.value.filter((r) => matchStatus(r, 'M')).length },
  { key: 'P', label: 'Proses', icon: 'pi pi-spin pi-spinner', severity: 'warn', value: dasar.value.filter((r) => matchStatus(r, 'P')).length },
  { key: 'C', label: 'Selesai', icon: 'pi pi-check-circle', severity: 'success', value: dasar.value.filter((r) => matchStatus(r, 'C')).length }
])

// ── Tampilan baris ───────────────────────────────────────────
const jk = (v) => (String(v).toUpperCase().startsWith('L') ? 'L' : String(v).toUpperCase().startsWith('P') ? 'P' : '')

function waktuTungguMenit(r) {
  if (!r.JAM_KIRIM_RESEP) return null
  const mulai = new Date(String(r.JAM_KIRIM_RESEP).replace(' ', 'T'))
  if (isNaN(mulai)) return null
  const akhir = r.STATUS_PROGRESS === 'C' && r.WAKTU_SELESAI ? new Date(String(r.WAKTU_SELESAI).replace(' ', 'T')) : now.value
  const menit = Math.floor((akhir - mulai) / 60000)
  return menit >= 0 ? menit : null
}
function labelWaktuTunggu(r) {
  const menit = waktuTungguMenit(r)
  if (menit == null) return '—'
  if (menit < 60) return `${menit} m`
  return `${Math.floor(menit / 60)} j ${menit % 60} m`
}
function severityWaktuTunggu(r) {
  const menit = waktuTungguMenit(r)
  if (menit == null) return 'secondary'
  if (menit <= 30) return 'success'
  if (menit <= 60) return 'warn'
  return 'danger'
}

function labelAksi(r) {
  if (r.STATUS_PROGRESS === 'C') return 'Lihat'
  if (r.STATUS_PROGRESS === 'P') return 'Lanjutkan'
  return 'Proses'
}
function bukaProses(r) {
  router.push({
    name: 'farmasi-resep-proses',
    params: { trans: r.TRANS },
    query: {
      nomr: r.NOMR || '',
      noregister: r.NOREGISTER || '',
      tanggal: toYmd(r.TANGGAL) || '',
      nama: r.NAMA || '',
      poli: r.POLI_RUANG || '',
      nomorantrian: r.NOMORANTRIAN || '',
      ...(r.STATUS_PROGRESS === 'C' ? { preview: '1' } : {})
    }
  })
}

const labelUpdate = computed(() => {
  if (!lastUpdated.value) return ''
  const menit = Math.floor((now.value - lastUpdated.value) / 60000)
  return menit < 1 ? 'Baru saja diperbarui' : `Diperbarui ${menit} menit lalu`
})

// ── Auto-refresh tiap menit selama rentang tanggal mencakup hari ini ──
let timer = null
const mencakupHariIni = computed(() => {
  const hariIni = toYmd(new Date())
  return toYmd(tglAwal.value) <= hariIni && hariIni <= toYmd(tglAkhir.value)
})

onMounted(() => {
  muat()
  timer = setInterval(() => {
    now.value = new Date()
    if (mencakupHariIni.value && !document.hidden) muat({ diam: true })
  }, 60000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Resep masuk</h1>
        <p class="page-subtitle">
          Monitoring resep dari poliklinik ke farmasi
          <template v-if="labelUpdate"> · {{ labelUpdate }}</template>
          <template v-if="mencakupHariIni"> · diperbarui otomatis tiap menit</template>
        </p>
      </div>
      <Button icon="pi pi-refresh" label="Muat ulang" severity="secondary" outlined :loading="loading" @click="muat()" />
    </header>

    <section class="summary" aria-label="Ringkasan status resep">
      <div
        v-for="s in ringkasan"
        :key="s.key"
        class="summary__item"
        :class="{ 'summary__item--active': filterStatus === s.key }"
        role="button"
        tabindex="0"
        @click="toggleStatus(s.key)"
        @keydown.enter="toggleStatus(s.key)"
      >
        <i :class="[s.icon, 'summary__icon', `summary__icon--${s.severity}`]" />
        <div>
          <p class="summary__value">{{ s.value }}</p>
          <p class="summary__label">{{ s.label }}</p>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="filters">
        <div class="filters__row">
          <div class="field">
            <label for="r-awal">Dari tanggal</label>
            <DatePicker v-model="tglAwal" inputId="r-awal" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :maxDate="tglAkhir || undefined" fluid />
          </div>
          <div class="field">
            <label for="r-akhir">Sampai tanggal</label>
            <DatePicker v-model="tglAkhir" inputId="r-akhir" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :minDate="tglAwal || undefined" fluid />
          </div>
          <div class="field field--grow">
            <label for="r-cari">Cari</label>
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText id="r-cari" v-model="keyword" placeholder="Nama, No. RM, DPJP, poli/ruang, cara bayar" fluid @keydown.enter="muat" />
            </IconField>
          </div>
          <div class="field">
            <label for="r-jenis">Jenis rawat</label>
            <Select v-model="filterJenisRawat" inputId="r-jenis" :options="jenisRawatOptions" optionLabel="label" optionValue="value" fluid />
          </div>
          <div class="filters__actions">
            <Button label="Cari" icon="pi pi-search" :loading="loading" @click="muat()" />
            <Button icon="pi pi-filter-slash" severity="secondary" outlined v-tooltip.top="'Reset pencarian & filter'" @click="resetFilter" />
          </div>
        </div>
      </div>

      <DataTable
        :value="dataTampil"
        :loading="loading"
        dataKey="TRANS"
        size="small"
        stripedRows
        paginator
        :rows="25"
        :rowsPerPageOptions="[25, 50, 100]"
        scrollable
      >
        <template #empty>
          <p class="empty">{{ resep.length ? 'Tidak ada resep yang cocok dengan filter.' : 'Belum ada resep pada rentang tanggal ini.' }}</p>
        </template>

        <Column header="Pasien" style="min-width: 15rem">
          <template #body="{ data: r }">
            <span class="strong">{{ r.NAMA }}</span>
            <small class="sub">
              RM {{ r.NOMR }}<template v-if="formatUsiaResep(r.USIA)"> · {{ formatUsiaResep(r.USIA) }}</template><template v-if="jk(r.JENISKELAMIN)"> · {{ jk(r.JENISKELAMIN) }}</template>
            </small>
            <div class="sub-tags">
              <Tag v-if="r.OBAT_PULANG === 'YA'" value="Obat pulang" severity="info" />
              <Tag v-if="r.STTS_PRB" :value="r.STTS_PRB" severity="warn" />
            </div>
          </template>
        </Column>
        <Column header="No. registrasi" style="min-width: 10rem">
          <template #body="{ data: r }"><span class="mono">{{ r.NOREGISTER }}</span></template>
        </Column>
        <Column header="DPJP" style="min-width: 11rem">
          <template #body="{ data: r }">{{ r.DPJP || '—' }}</template>
        </Column>
        <Column header="Jenis rawat" style="width: 8rem">
          <template #body="{ data: r }">
            <Tag :value="r.JENISRAWAT || '—'" :severity="(r.JENISRAWAT || '').toUpperCase() === 'JALAN' ? 'info' : 'warn'" />
          </template>
        </Column>
        <Column header="Cara bayar" style="min-width: 9rem">
          <template #body="{ data: r }">{{ r.CARABAYAR || '—' }}</template>
        </Column>
        <Column header="Poli / ruang" style="min-width: 8rem">
          <template #body="{ data: r }">{{ r.POLI_RUANG || '—' }}</template>
        </Column>
        <Column header="Masuk" style="width: 5.5rem">
          <template #body="{ data: r }"><span class="mono">{{ r.MASUK || '—' }}</span></template>
        </Column>
        <Column header="Proses" style="width: 5.5rem">
          <template #body="{ data: r }"><span class="mono">{{ r.PROSES || '—' }}</span></template>
        </Column>
        <Column header="Selesai" style="width: 5.5rem">
          <template #body="{ data: r }"><span class="mono">{{ r.SELESAI || '—' }}</span></template>
        </Column>
        <Column header="Tunggu" style="width: 6rem">
          <template #body="{ data: r }">
            <Tag :value="labelWaktuTunggu(r)" :severity="severityWaktuTunggu(r)" icon="pi pi-hourglass" />
          </template>
        </Column>
        <Column header="Tanggal" style="min-width: 7rem">
          <template #body="{ data: r }">{{ formatTanggal(r.TANGGAL) }}</template>
        </Column>
        <Column header="Status" style="min-width: 8rem">
          <template #body="{ data: r }">
            <Tag :value="labelStatusResep(r.STATUS_PROGRESS)" :severity="severityStatusResep(r.STATUS_PROGRESS)" />
          </template>
        </Column>
        <Column header="Aksi" frozen alignFrozen="right" style="width: 7rem">
          <template #body="{ data: r }">
            <Button :label="labelAksi(r)" size="small" :severity="r.STATUS_PROGRESS === 'C' ? 'secondary' : undefined" :outlined="r.STATUS_PROGRESS === 'C'" @click="bukaProses(r)" />
          </template>
        </Column>
      </DataTable>
    </section>
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
  cursor: pointer;
  transition: background var(--transition, 0.15s);
}
.summary__item:hover,
.summary__item:focus-visible {
  background: var(--p-surface-50, #f8fafc);
  outline: none;
}
.summary__item--active {
  background: var(--p-primary-50);
}
:global(.app-dark) .summary__item--active {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}
.summary__item + .summary__item {
  border-left: 1px solid var(--app-border);
}
.summary__icon {
  font-size: 1.125rem;
  width: 2.5rem;
  height: 2.5rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--p-surface-100, #f1f5f9);
  color: var(--app-text-muted);
}
.summary__icon--secondary {
  background: var(--p-surface-100, #f1f5f9);
  color: var(--app-text-muted);
}
.summary__icon--danger {
  background: var(--p-red-50, #fef2f2);
  color: var(--p-red-500, #ef4444);
}
.summary__icon--warn {
  background: var(--p-orange-50, #fff7ed);
  color: var(--p-orange-500, #f97316);
}
.summary__icon--success {
  background: var(--p-green-50, #f0fdf4);
  color: var(--p-green-500, #22c55e);
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

.filters {
  margin-bottom: 1rem;
}
.filters__row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 1rem;
  align-items: end;
}
.filters__actions {
  display: flex;
  gap: 0.5rem;
}
.field {
  display: grid;
  gap: 0.375rem;
}
.field--grow {
  min-width: 14rem;
}
.field label {
  font-size: 0.875rem;
  font-weight: 600;
}

.strong {
  font-weight: 600;
}
.sub {
  display: block;
  margin-top: 0.125rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.sub-tags {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
}
.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}

@media (max-width: 991px) {
  .filters__row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .filters__actions {
    grid-column: 1 / -1;
  }
}
@media (max-width: 768px) {
  .summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary__item:nth-child(3) {
    border-left: 0;
  }
  .summary__item:nth-child(n + 3) {
    border-top: 1px solid var(--app-border);
  }
}
@media (max-width: 575px) {
  .filters__row {
    grid-template-columns: 1fr;
  }
}
</style>
