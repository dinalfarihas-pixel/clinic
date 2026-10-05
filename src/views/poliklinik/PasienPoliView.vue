<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { usePoliStore } from '@/stores/poli'
import { getPasienPoli, panggilPasien } from '@/services/poliklinik'
import { CARA_BAYAR_BPJS } from '@/services/pendaftaran'
import { toYmd, formatTanggal } from '@/utils/tanggal'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const poliStore = usePoliStore()

// ── Poli aktif (dari menu / URL) ─────────────────────────────
const kodePoli = computed(() => (route.params.kode ? String(route.params.kode) : ''))
const poli = computed(() => poliStore.byKode(kodePoli.value))
const namaPoli = computed(() => poli.value?.NAMA || (kodePoli.value ? `Poli ${kodePoli.value}` : 'Pasien poliklinik'))

watch(namaPoli, (n) => (document.title = `${n} · ${import.meta.env.VITE_APP_NAME || 'Klinik'}`), { immediate: true })

function pilihPoli(kode) {
  if (kode && kode !== kodePoli.value) router.push({ name: 'rawat-jalan', params: { kode } })
}

// ── Filter server ────────────────────────────────────────────
const tglAwal = ref(new Date())
const tglAkhir = ref(new Date())

// ── Data ─────────────────────────────────────────────────────
const pasien = ref([])
const loading = ref(false)
const lastUpdated = ref(null)
const now = ref(new Date())

async function muat({ diam = false } = {}) {
  if (!kodePoli.value || loading.value) return
  loading.value = !diam
  try {
    pasien.value = await getPasienPoli({
      kodePoli: kodePoli.value,
      tglAwal: toYmd(tglAwal.value),
      tglAkhir: toYmd(tglAkhir.value)
    })
    lastUpdated.value = new Date()
  } catch (err) {
    if (!diam) toast.add({ severity: 'error', summary: 'Gagal memuat pasien', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

watch([tglAwal, tglAkhir], () => muat())

// Muat ulang otomatis tiap menit selama rentang tanggal mencakup hari ini (antrian berjalan)
let timer = null
const mencakupHariIni = computed(() => {
  const hariIni = toYmd(new Date())
  return toYmd(tglAwal.value) <= hariIni && hariIni <= toYmd(tglAkhir.value)
})

const labelUpdate = computed(() => {
  if (!lastUpdated.value) return ''
  const menit = Math.floor((now.value - lastUpdated.value) / 60000)
  return menit < 1 ? 'Baru saja diperbarui' : `Diperbarui ${menit} menit lalu`
})

// ── Filter lokal ─────────────────────────────────────────────
const STATUS_KEY = 'klinik.poli.status'
const statusOptions = [
  { label: 'Belum dilayani', value: 'belum' },
  { label: 'Sudah dilayani', value: 'sudah' },
  { label: 'Semua', value: 'semua' }
]
function statusAwal() {
  try {
    return localStorage.getItem(STATUS_KEY) || 'belum'
  } catch {
    return 'belum'
  }
}
const status = ref(statusAwal())
watch(status, (v) => {
  try {
    localStorage.setItem(STATUS_KEY, v)
  } catch {
    /* abaikan */
  }
})

const keyword = ref('')
const filterDokter = ref(null)
const filterUsia = ref(null)

const belumDilayani = (p) => String(p.STATUS ?? '0') === '0'
const isBpjs = (p) => p.KODECARABAYAR == CARA_BAYAR_BPJS || /BPJS/i.test(p.CARABAYAR || '')
const umurTahun = (p) => Number(p.USIA_PASIEN?.tahun ?? 0)

const KELOMPOK_USIA = [
  { label: 'Bayi', range: '< 1 th', min: 0, max: 1 },
  { label: 'Balita', range: '1–5 th', min: 1, max: 5 },
  { label: 'Anak', range: '5–12 th', min: 5, max: 12 },
  { label: 'Remaja', range: '12–18 th', min: 12, max: 18 },
  { label: 'Dewasa', range: '18–60 th', min: 18, max: 60 },
  { label: 'Lansia', range: '≥ 60 th', min: 60, max: 999 }
]

// Setelah filter status & kata kunci (dasar hitungan chip dokter/usia)
const pasienDasar = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return pasien.value.filter((p) => {
    if (status.value === 'belum' && !belumDilayani(p)) return false
    if (status.value === 'sudah' && belumDilayani(p)) return false
    if (!q) return true
    return [p.NAMAPASIEN, p.NOMR, p.ALAMAT, p.NOMORANTRIAN, p.NOPENDAFTARAN]
      .some((v) => String(v ?? '').toLowerCase().includes(q))
  })
})

const pasienTampil = computed(() =>
  pasienDasar.value.filter((p) => {
    if (filterDokter.value && (p.NAMADOKTER || '').trim() !== filterDokter.value) return false
    if (filterUsia.value && !(umurTahun(p) >= filterUsia.value.min && umurTahun(p) < filterUsia.value.max)) return false
    return true
  })
)

const chipDokter = computed(() => {
  const counts = new Map()
  pasienDasar.value.forEach((p) => {
    const nama = (p.NAMADOKTER || '').trim()
    if (nama) counts.set(nama, (counts.get(nama) || 0) + 1)
  })
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([nama, jumlah]) => ({ nama, jumlah }))
})

const chipUsia = computed(() =>
  KELOMPOK_USIA.map((g) => ({
    ...g,
    jumlah: pasienDasar.value.filter((p) => umurTahun(p) >= g.min && umurTahun(p) < g.max).length
  })).filter((g) => g.jumlah > 0)
)

function toggleDokter(nama) {
  filterDokter.value = filterDokter.value === nama ? null : nama
}
function toggleUsia(g) {
  filterUsia.value = filterUsia.value?.label === g.label ? null : g
}

const ringkasan = computed(() => {
  const semua = pasien.value
  const belum = semua.filter(belumDilayani).length
  return [
    { label: 'Total pasien', value: semua.length, icon: 'pi pi-users' },
    { label: 'Belum dilayani', value: belum, icon: 'pi pi-clock' },
    { label: 'Sudah dilayani', value: semua.length - belum, icon: 'pi pi-check-circle' },
    { label: 'Pasien BPJS', value: semua.filter(isBpjs).length, icon: 'pi pi-id-card' }
  ]
})

// ── Tampilan baris ───────────────────────────────────────────
const jk = (v) => (String(v).toUpperCase().startsWith('P') ? 'P' : String(v).toUpperCase().startsWith('L') ? 'L' : '')
const usia = (p) => (p.USIA_PASIEN ? `${p.USIA_PASIEN.tahun ?? 0} th ${p.USIA_PASIEN.bulan ?? 0} bl` : '')
const jamMasuk = (p) => (p.MASUKPOLY_DISPLAY || '').split(' ')[1] || p.MASUKPOLY_DISPLAY || '—'

// Lama menunggu sejak masuk poli, hanya untuk pasien yang belum dilayani
function waktuTunggu(p) {
  if (!belumDilayani(p) || !p.MASUKPOLY) return null
  const masuk = new Date(String(p.MASUKPOLY).replace(' ', 'T'))
  if (isNaN(masuk)) return null
  const menit = Math.floor((now.value - masuk) / 60000)
  if (menit < 0) return null
  const jam = Math.floor(menit / 60)
  return {
    label: jam > 0 ? `${jam} j ${menit % 60} m` : `${menit} m`,
    severity: menit < 30 ? 'success' : menit < 60 ? 'warn' : 'danger'
  }
}

// ── Panggil pasien ───────────────────────────────────────────
const memanggil = ref(null)

function konfirmasiPanggil(p) {
  confirm.require({
    header: 'Panggil pasien?',
    message: `${p.NOMORANTRIAN ? `Antrian ${p.NOMORANTRIAN} · ` : ''}${p.NAMAPASIEN} akan dipanggil ke ${namaPoli.value}.`,
    icon: 'pi pi-volume-up',
    acceptLabel: 'Panggil',
    rejectLabel: 'Batal',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => panggil(p)
  })
}

async function panggil(p) {
  memanggil.value = p.NOPENDAFTARAN
  try {
    await panggilPasien(p)
    toast.add({ severity: 'success', summary: 'Pasien dipanggil', detail: p.NAMAPASIEN, life: 3000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memanggil', detail: err.message, life: 5000 })
  } finally {
    memanggil.value = null
  }
}

// ── Periksa (isi SOAP) ───────────────────────────────────────
function periksa(p) {
  router.push({ name: 'pemeriksaan', params: { noreg: p.NOPENDAFTARAN } })
}

// ── Detail ───────────────────────────────────────────────────
const detail = ref(null)
const detailBaris = computed(() => {
  const p = detail.value
  if (!p) return []
  return [
    ['No. registrasi', p.NOPENDAFTARAN],
    ['No. antrian', p.NOMORANTRIAN],
    ['No. RM', p.NOMR],
    ['Tgl. lahir', [formatTanggal(p.TGLLAHIR), usia(p) && `(${usia(p)})`].filter(Boolean).join(' ')],
    ['Alamat', [p.ALAMAT, p.NAMAKECAMATAN].filter(Boolean).join(', ')],
    ['No. telepon', p.NOTELP],
    ['Dokter', p.NAMADOKTER],
    ['Cara bayar', p.CARABAYAR],
    ['No. BPJS', p.NOJAMINAN],
    ['No. SEP', p.NOSEP],
    ['Diagnosa awal', [p.DIAGNOSA_AWAL, p.DX_CAPTION].filter(Boolean).join(' - ')],
    ['Masuk poli', p.MASUKPOLY_DISPLAY],
    ['Keluar poli', p.KELUARPOLY && p.KELUARPOLY !== '-' ? p.KELUARPOLY : ''],
    ['Status', belumDilayani(p) ? 'Belum dilayani' : p.STTS_PULANG || 'Sudah dilayani']
  ].filter(([, v]) => v)
})

// ── Ekspor CSV ───────────────────────────────────────────────
function eksporCsv() {
  const kolom = [
    ['No. antrian', (p) => p.NOMORANTRIAN],
    ['No. registrasi', (p) => p.NOPENDAFTARAN],
    ['No. RM', (p) => p.NOMR],
    ['Nama', (p) => p.NAMAPASIEN],
    ['JK', (p) => jk(p.JENISKELAMIN)],
    ['Usia', usia],
    ['Dokter', (p) => p.NAMADOKTER],
    ['Cara bayar', (p) => p.CARABAYAR],
    ['Masuk poli', (p) => p.MASUKPOLY_DISPLAY],
    ['Keluar poli', (p) => p.KELUARPOLY],
    ['Status', (p) => (belumDilayani(p) ? 'Belum dilayani' : p.STTS_PULANG || 'Sudah dilayani')]
  ]
  const sel = (v) => {
    const s = String(v ?? '')
    return /^\d{9,}$/.test(s) ? `="${s}"` : `"${s.replace(/"/g, '""')}"`
  }
  const isi = [
    kolom.map(([h]) => sel(h)).join(';'),
    ...pasienTampil.value.map((p) => kolom.map(([, f]) => sel(f(p))).join(';'))
  ].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' }))
  a.download = `pasien-${(namaPoli.value || 'poli').toLowerCase().replace(/\s+/g, '-')}-${toYmd(tglAwal.value)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Siklus hidup ─────────────────────────────────────────────
onMounted(() => {
  poliStore.load()
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
    <!-- Belum memilih poli: tampilkan pilihan poli -->
    <template v-if="!kodePoli">
      <header class="page-header">
        <div>
          <h1 class="page-title">Pasien poliklinik</h1>
          <p class="page-subtitle">Pilih poli untuk melihat daftar pasiennya.</p>
        </div>
      </header>
      <section class="panel">
        <p v-if="poliStore.loading" class="muted"><i class="pi pi-spin pi-spinner" /> Memuat daftar poli…</p>
        <Message v-else-if="poliStore.error" severity="error">{{ poliStore.error }}</Message>
        <p v-else-if="!poliStore.list.length" class="muted">Belum ada poli rawat jalan untuk klinik ini.</p>
        <div v-else class="poli-grid">
          <RouterLink
            v-for="p in poliStore.list"
            :key="p.KODE"
            :to="{ name: 'rawat-jalan', params: { kode: p.KODE } }"
            class="poli-card"
          >
            <i class="pi pi-heart poli-card__icon" />
            <span class="poli-card__nama">{{ p.NAMA }}</span>
            <small class="poli-card__kode">{{ p.KODE }}<template v-if="p.KODE_BPJS"> · BPJS {{ p.KODE_BPJS }}</template></small>
          </RouterLink>
        </div>
      </section>
    </template>

    <!-- Daftar pasien poli -->
    <template v-else>
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ namaPoli }}</h1>
          <p class="page-subtitle">
            Daftar pasien rawat jalan
            <template v-if="labelUpdate"> · {{ labelUpdate }}</template>
            <template v-if="mencakupHariIni"> · diperbarui otomatis tiap menit</template>
          </p>
        </div>
        <div class="page-actions">
          <Select
            :modelValue="kodePoli"
            :options="poliStore.list"
            optionLabel="NAMA"
            optionValue="KODE"
            placeholder="Ganti poli"
            :loading="poliStore.loading"
            class="poli-select"
            aria-label="Ganti poli"
            @update:modelValue="pilihPoli"
          />
          <Button icon="pi pi-refresh" severity="secondary" outlined :loading="loading" aria-label="Muat ulang" v-tooltip.bottom="'Muat ulang'" @click="muat()" />
        </div>
      </header>

      <!-- Ringkasan -->
      <section class="summary" aria-label="Ringkasan">
        <div v-for="s in ringkasan" :key="s.label" class="summary__item">
          <i :class="s.icon" class="summary__icon" />
          <div>
            <p class="summary__value">{{ s.value }}</p>
            <p class="summary__label">{{ s.label }}</p>
          </div>
        </div>
      </section>

      <section class="panel">
        <!-- Filter -->
        <div class="filters">
          <div class="filters__row">
            <div class="field">
              <label for="p-awal">Dari</label>
              <DatePicker v-model="tglAwal" inputId="p-awal" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :maxDate="tglAkhir || undefined" fluid />
            </div>
            <div class="field">
              <label for="p-akhir">Sampai</label>
              <DatePicker v-model="tglAkhir" inputId="p-akhir" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :minDate="tglAwal || undefined" fluid />
            </div>
            <div class="field field--grow">
              <label for="p-cari">Cari</label>
              <IconField>
                <InputIcon class="pi pi-search" />
                <InputText id="p-cari" v-model="keyword" placeholder="Nama, No. RM, alamat, no. antrian" fluid />
              </IconField>
            </div>
          </div>
          <div class="filters__row filters__row--between">
            <SelectButton v-model="status" :options="statusOptions" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" />
            <Button label="Ekspor CSV" icon="pi pi-file-export" size="small" severity="secondary" outlined :disabled="!pasienTampil.length" @click="eksporCsv" />
          </div>

          <div v-if="chipDokter.length > 1 || chipUsia.length" class="chips">
            <template v-if="chipDokter.length > 1">
              <span class="chips__label">Dokter</span>
              <button
                v-for="d in chipDokter"
                :key="d.nama"
                type="button"
                class="chip"
                :class="{ 'chip--on': filterDokter === d.nama }"
                :aria-pressed="filterDokter === d.nama"
                @click="toggleDokter(d.nama)"
              >
                {{ d.nama }} <span class="chip__count">{{ d.jumlah }}</span>
              </button>
            </template>
            <template v-if="chipUsia.length">
              <span class="chips__label">Usia</span>
              <button
                v-for="g in chipUsia"
                :key="g.label"
                type="button"
                class="chip"
                :class="{ 'chip--on': filterUsia?.label === g.label }"
                :aria-pressed="filterUsia?.label === g.label"
                :title="g.range"
                @click="toggleUsia(g)"
              >
                {{ g.label }} <span class="chip__count">{{ g.jumlah }}</span>
              </button>
            </template>
          </div>
        </div>

        <DataTable
          :value="pasienTampil"
          :loading="loading"
          dataKey="NOPENDAFTARAN"
          size="small"
          stripedRows
          paginator
          :rows="25"
          :rowsPerPageOptions="[25, 50, 100]"
          scrollable
        >
          <template #empty>
            <p class="empty">
              {{ pasien.length ? 'Tidak ada pasien yang cocok dengan filter.' : `Belum ada pasien terdaftar di ${namaPoli} pada rentang tanggal ini.` }}
            </p>
          </template>

          <Column header="Antrian" style="width: 6rem">
            <template #body="{ data: p }">
              <span class="antrian">{{ p.NOMORANTRIAN || '—' }}</span>
            </template>
          </Column>
          <Column header="Pasien" style="min-width: 15rem">
            <template #body="{ data: p }">
              <span class="strong">{{ p.NAMAPASIEN }}</span>
              <small class="sub">
                RM {{ p.NOMR }}<template v-if="jk(p.JENISKELAMIN)"> · {{ jk(p.JENISKELAMIN) }}</template><template v-if="usia(p)"> · {{ usia(p) }}</template>
              </small>
            </template>
          </Column>
          <Column header="Dokter" style="min-width: 12rem">
            <template #body="{ data: p }">{{ p.NAMADOKTER || '—' }}</template>
          </Column>
          <Column header="Cara bayar">
            <template #body="{ data: p }">
              <Tag :value="p.CARABAYAR || '—'" :severity="isBpjs(p) ? 'success' : 'secondary'" />
            </template>
          </Column>
          <Column header="Masuk" style="min-width: 7rem">
            <template #body="{ data: p }">
              <span class="mono">{{ jamMasuk(p) }}</span>
              <Tag
                v-if="waktuTunggu(p)"
                :value="waktuTunggu(p).label"
                :severity="waktuTunggu(p).severity"
                icon="pi pi-hourglass"
                class="tunggu"
                v-tooltip.top="'Lama menunggu'"
              />
            </template>
          </Column>
          <Column header="Status" style="min-width: 9rem">
            <template #body="{ data: p }">
              <Tag v-if="belumDilayani(p)" value="Belum dilayani" severity="warn" />
              <Tag v-else :value="p.STTS_PULANG || 'Sudah dilayani'" severity="success" />
            </template>
          </Column>
          <Column header="Aksi" frozen alignFrozen="right" style="width: 11.5rem">
            <template #body="{ data: p }">
              <div class="actions">
                <Button label="Periksa" icon="pi pi-file-edit" size="small" @click="periksa(p)" />
                <Button
                  icon="pi pi-volume-up"
                  text
                  rounded
                  severity="secondary"
                  size="small"
                  :loading="memanggil === p.NOPENDAFTARAN"
                  aria-label="Panggil pasien"
                  v-tooltip.top="'Panggil'"
                  @click="konfirmasiPanggil(p)"
                />
                <Button
                  icon="pi pi-eye"
                  text
                  rounded
                  severity="secondary"
                  size="small"
                  aria-label="Detail pasien"
                  v-tooltip.top="'Detail'"
                  @click="detail = p"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </section>
    </template>

    <!-- Detail pasien -->
    <Dialog
      :visible="!!detail"
      header="Detail kunjungan"
      modal
      :style="{ width: '32rem' }"
      :breakpoints="{ '575px': '94vw' }"
      @update:visible="(v) => !v && (detail = null)"
    >
      <template v-if="detail">
        <p class="detail__nama">{{ detail.NAMAPASIEN }}</p>
        <dl class="detail__list">
          <div v-for="[label, value] in detailBaris" :key="label">
            <dt>{{ label }}</dt>
            <dd>{{ value }}</dd>
          </div>
        </dl>
      </template>
      <template #footer>
        <Button label="Tutup" severity="secondary" outlined @click="detail = null" />
        <Button v-if="detail" label="Panggil" icon="pi pi-volume-up" severity="secondary" outlined @click="konfirmasiPanggil(detail)" />
        <Button v-if="detail" label="Periksa" icon="pi pi-file-edit" @click="periksa(detail)" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.poli-select {
  min-width: 12rem;
}
.muted {
  margin: 0;
  color: var(--app-text-muted);
}

/* Pilihan poli */
.poli-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.75rem;
}
.poli-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  transition: border-color var(--transition), background var(--transition);
}
.poli-card:hover {
  border-color: var(--p-primary-color);
  background: var(--app-bg);
}
.poli-card__icon {
  color: var(--p-primary-color);
  margin-bottom: 0.25rem;
}
.poli-card__nama {
  font-weight: 600;
}
.poli-card__kode {
  color: var(--app-text-muted);
}

/* Ringkasan */
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
  padding: 1rem 1.25rem;
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
  font-size: 1.375rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.summary__label {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

/* Filter */
.filters {
  display: grid;
  gap: 0.875rem;
  margin-bottom: 1rem;
}
.filters__row {
  display: flex;
  gap: 1rem;
  align-items: end;
  flex-wrap: wrap;
}
.filters__row--between {
  justify-content: space-between;
  align-items: center;
}
.field {
  display: grid;
  gap: 0.375rem;
  width: 11rem;
}
.field--grow {
  flex: 1;
  min-width: 14rem;
  width: auto;
}
.field label {
  font-size: 0.875rem;
  font-weight: 600;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}
.chips__label {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  margin: 0 0.25rem 0 0.5rem;
}
.chips__label:first-child {
  margin-left: 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-panel);
  color: var(--app-text);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.chip:hover {
  border-color: var(--p-primary-color);
}
.chip--on {
  border-color: var(--p-primary-color);
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}
.chip__count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Tabel */
.antrian {
  font-size: 1.125rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--p-primary-color);
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
.mono {
  font-variant-numeric: tabular-nums;
}
.tunggu {
  display: flex;
  width: fit-content;
  margin-top: 0.25rem;
  font-size: 0.75rem;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}

/* Detail */
.detail__nama {
  margin: 0 0 0.75rem;
  font-size: 1.0625rem;
  font-weight: 700;
}
.detail__list {
  margin: 0;
}
.detail__list > div {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
  gap: 1rem;
  padding: 0.4375rem 0;
}
.detail__list > div + div {
  border-top: 1px solid var(--app-border);
}
.detail__list dt {
  color: var(--app-text-muted);
  font-size: 0.875rem;
}
.detail__list dd {
  margin: 0;
  word-break: break-word;
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
  .field {
    width: calc(50% - 0.5rem);
  }
  .field--grow {
    width: 100%;
  }
}
</style>
