<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { JENIS_CARI, cariPasien, hapusPasien } from '@/services/pasien'
import { getRiwayatSoap } from '@/services/soap'
import { formatTanggal } from '@/utils/tanggal'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

// ── Pencarian ────────────────────────────────────────────────
const jenisOptions = Object.entries(JENIS_CARI).map(([value, c]) => ({ value, label: c.label }))
const jenis = ref('nama')
const keyword = ref('')
const loading = ref(false)
const pasien = ref([])
// Pencarian terakhir: untuk muat ulang & teks keterangan hasil
const terakhir = ref(null)

const placeholder = computed(() => JENIS_CARI[jenis.value].placeholder)

async function cari(ulang = false) {
  const q = ulang ? terakhir.value : { jenis: jenis.value, keyword: keyword.value.trim() }
  if (!q) return
  const min = JENIS_CARI[q.jenis].min
  if (q.keyword.length < min) {
    toast.add({
      severity: 'warn',
      summary: 'Kata kunci terlalu pendek',
      detail: min > 1 ? `Ketik minimal ${min} huruf.` : 'Isi kata kunci pencarian.',
      life: 3000
    })
    return
  }
  loading.value = true
  try {
    pasien.value = await cariPasien(q.jenis, q.keyword)
    terakhir.value = q
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mencari pasien', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

// Saring hasil yang sudah dimuat
const saring = ref('')
const pasienTampil = computed(() => {
  const q = saring.value.trim().toLowerCase()
  if (!q) return pasien.value
  return pasien.value.filter((p) =>
    [p.NAMAPASIEN, p.NOMR, p.NOKTP, p.NO_KARTU, p.ALAMAT, p.namakelurahan, p.namakecamatan, p.NOTELP]
      .some((v) => String(v ?? '').toLowerCase().includes(q))
  )
})

const jk = (v) => (String(v).toUpperCase().startsWith('L') ? 'L' : String(v).toUpperCase().startsWith('P') ? 'P' : '—')
const wilayah = (p) => [p.namakelurahan, p.namakecamatan, p.namakota].filter(Boolean).join(', ')

// ── Aksi ─────────────────────────────────────────────────────
async function salin(teks, label) {
  try {
    await navigator.clipboard.writeText(String(teks))
    toast.add({ severity: 'success', summary: 'Disalin', detail: `${label} ${teks}`, life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Gagal menyalin', detail: label, life: 3000 })
  }
}

function daftarkan(p) {
  router.push({ name: 'pendaftaran', query: { norm: p.NOMR } })
}

// Riwayat kunjungan (SOAP lengkap — sama seperti dialog "Riwayat Kunjungan" di halaman Pemeriksaan)
const showRiwayat = ref(false)
const riwayatPasien = ref(null)
const riwayat = ref([])
const loadingRiwayat = ref(false)
const dokterRiwayat = ref(null)

const dokterRiwayatOpsi = computed(() => [...new Set(riwayat.value.map((r) => r.NAMADOKTER).filter(Boolean))])
const riwayatTersaring = computed(() => (dokterRiwayat.value ? riwayat.value.filter((r) => r.NAMADOKTER === dokterRiwayat.value) : riwayat.value))

function waktuLalu(tgl) {
  const t = new Date(tgl)
  if (isNaN(t)) return ''
  const hari = Math.floor((Date.now() - t) / 86400000)
  if (hari < 1) return 'Hari ini'
  if (hari === 1) return '1 hari yang lalu'
  if (hari < 7) return `${hari} hari yang lalu`
  if (hari < 30) return `${Math.floor(hari / 7)} minggu yang lalu`
  if (hari < 365) return `${Math.floor(hari / 30)} bulan yang lalu`
  return `${Math.floor(hari / 365)} tahun yang lalu`
}

async function bukaRiwayat(p) {
  riwayatPasien.value = p
  riwayat.value = []
  dokterRiwayat.value = null
  showRiwayat.value = true
  loadingRiwayat.value = true
  try {
    riwayat.value = await getRiwayatSoap(p.NOMR)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat riwayat', detail: err.message, life: 5000 })
  } finally {
    loadingRiwayat.value = false
  }
}

// Hapus (soft delete)
const menghapus = ref(null)

function konfirmasiHapus(p) {
  confirm.require({
    header: 'Hapus data pasien?',
    message: `${p.NAMAPASIEN} (RM ${p.NOMR}) akan dihapus dari daftar pasien dan tidak bisa dicari lagi. Riwayat kunjungannya tetap tersimpan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => hapus(p)
  })
}

async function hapus(p) {
  menghapus.value = p.IDPASIEN
  try {
    await hapusPasien(p.IDPASIEN)
    toast.add({ severity: 'success', summary: 'Pasien dihapus', detail: `${p.NAMAPASIEN} (RM ${p.NOMR})`, life: 3000 })
    pasien.value = pasien.value.filter((x) => x.IDPASIEN !== p.IDPASIEN)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menghapus', detail: err.message, life: 5000 })
  } finally {
    menghapus.value = null
  }
}

// Ekspor hasil ke CSV (bisa dibuka di Excel)
function eksporCsv() {
  const kolom = [
    ['No. RM', 'NOMR'],
    ['Nama', 'NAMAPASIEN'],
    ['JK', 'JENISKELAMIN'],
    ['Tgl. lahir', 'TGLLAHIR'],
    ['Usia', 'USIA_LENGKAP'],
    ['Alamat', 'ALAMAT'],
    ['Kelurahan', 'namakelurahan'],
    ['Kecamatan', 'namakecamatan'],
    ['No. telepon', 'NOTELP'],
    ['No. BPJS', 'NO_KARTU'],
    ['NIK', 'NOKTP']
  ]
  const sel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  // Nomor panjang diawali tanda = agar Excel tidak mengubahnya jadi notasi ilmiah
  const teks = (v) => (/^\d{9,}$/.test(String(v ?? '')) ? `="${v}"` : sel(v))
  const baris = [
    kolom.map(([h]) => sel(h)).join(';'),
    ...pasienTampil.value.map((p) => kolom.map(([, k]) => teks(p[k])).join(';'))
  ]
  const blob = new Blob(['﻿' + baris.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `data-pasien-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Data pasien</h1>
        <p class="page-subtitle">Cari pasien terdaftar, lihat riwayat kunjungan, atau daftarkan kunjungan baru.</p>
      </div>
    </header>

    <!-- Pencarian -->
    <section class="panel search">
      <form class="search__row" @submit.prevent="cari()">
        <SelectButton
          v-model="jenis"
          :options="jenisOptions"
          optionLabel="label"
          optionValue="value"
          :allowEmpty="false"
          aria-label="Cari berdasarkan"
        />
        <IconField class="search__input">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" :placeholder="placeholder" fluid autofocus />
        </IconField>
        <Button type="submit" label="Cari" icon="pi pi-search" :loading="loading" />
      </form>
    </section>

    <!-- Hasil -->
    <section class="panel">
      <header class="panel__header toolbar">
        <div class="toolbar__info">
          <h2 class="panel__title">Hasil pencarian</h2>
          <small v-if="terakhir">
            {{ JENIS_CARI[terakhir.jenis].label }} “{{ terakhir.keyword }}” · {{ pasien.length }} pasien
            <template v-if="terakhir.jenis === 'nama' && pasien.length >= 100">(maks. 100, persempit kata kunci)</template>
          </small>
        </div>
        <div class="toolbar__right">
          <IconField v-if="pasien.length" class="toolbar__filter">
            <InputIcon class="pi pi-filter" />
            <InputText v-model="saring" placeholder="Saring hasil" size="small" fluid />
          </IconField>
          <Button
            icon="pi pi-refresh"
            text
            rounded
            severity="secondary"
            :disabled="!terakhir"
            :loading="loading"
            aria-label="Muat ulang"
            v-tooltip.top="'Muat ulang'"
            @click="cari(true)"
          />
          <Button
            label="Ekspor CSV"
            icon="pi pi-file-export"
            size="small"
            severity="secondary"
            outlined
            :disabled="!pasienTampil.length"
            @click="eksporCsv"
          />
        </div>
      </header>

      <DataTable
        :value="pasienTampil"
        :loading="loading"
        dataKey="IDPASIEN"
        size="small"
        stripedRows
        paginator
        :rows="25"
        :rowsPerPageOptions="[10, 25, 50, 100]"
        scrollable
      >
        <template #empty>
          <div class="empty">
            <i class="pi pi-users empty__icon" />
            <p v-if="!terakhir">Cari pasien berdasarkan nama, No. RM, NIK, atau No. BPJS.</p>
            <p v-else-if="pasien.length">Tidak ada pasien yang cocok dengan saringan.</p>
            <p v-else>Pasien tidak ditemukan. Periksa kembali kata kunci.</p>
          </div>
        </template>

        <Column field="NOMR" header="No. RM" sortable style="min-width: 8rem">
          <template #body="{ data: p }">
            <span class="copyable">
              <span class="mono strong">{{ p.NOMR }}</span>
              <Button icon="pi pi-copy" text rounded size="small" severity="secondary" aria-label="Salin No. RM" @click="salin(p.NOMR, 'No. RM')" />
            </span>
          </template>
        </Column>
        <Column field="NAMAPASIEN" header="Nama pasien" sortable style="min-width: 14rem">
          <template #body="{ data: p }">
            <span class="strong">{{ p.NAMAPASIEN }}</span>
            <small v-if="p.NOTELP" class="sub">{{ p.NOTELP }}</small>
          </template>
        </Column>
        <Column field="JENISKELAMIN" header="JK" sortable style="width: 4rem">
          <template #body="{ data: p }">{{ jk(p.JENISKELAMIN) }}</template>
        </Column>
        <Column field="TGLLAHIR" header="Tgl. lahir" sortable style="min-width: 10rem">
          <template #body="{ data: p }">
            {{ formatTanggal(p.TGLLAHIR) || '—' }}
            <small v-if="p.USIA_LENGKAP" class="sub">{{ p.USIA_LENGKAP }}</small>
          </template>
        </Column>
        <Column field="ALAMAT" header="Alamat" style="min-width: 14rem">
          <template #body="{ data: p }">
            {{ p.ALAMAT || '—' }}
            <small v-if="wilayah(p)" class="sub">{{ wilayah(p) }}</small>
          </template>
        </Column>
        <Column field="NO_KARTU" header="No. BPJS" sortable style="min-width: 11rem">
          <template #body="{ data: p }">
            <span v-if="p.NO_KARTU" class="copyable">
              <span class="mono">{{ p.NO_KARTU }}</span>
              <Button icon="pi pi-copy" text rounded size="small" severity="secondary" aria-label="Salin No. BPJS" @click="salin(p.NO_KARTU, 'No. BPJS')" />
            </span>
            <span v-else class="muted">—</span>
          </template>
        </Column>
        <Column field="NOKTP" header="NIK" style="min-width: 12rem">
          <template #body="{ data: p }">
            <span v-if="p.NOKTP" class="copyable">
              <span class="mono">{{ p.NOKTP }}</span>
              <Button icon="pi pi-copy" text rounded size="small" severity="secondary" aria-label="Salin NIK" @click="salin(p.NOKTP, 'NIK')" />
            </span>
            <span v-else class="muted">—</span>
          </template>
        </Column>
        <Column header="Aksi" frozen alignFrozen="right" style="width: 12rem">
          <template #body="{ data: p }">
            <div class="actions">
              <Button label="Daftarkan" icon="pi pi-user-plus" size="small" @click="daftarkan(p)" />
              <Button
                icon="pi pi-history"
                text
                rounded
                severity="secondary"
                size="small"
                aria-label="Riwayat kunjungan"
                v-tooltip.top="'Riwayat kunjungan'"
                @click="bukaRiwayat(p)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                size="small"
                :loading="menghapus === p.IDPASIEN"
                aria-label="Hapus pasien"
                v-tooltip.top="'Hapus'"
                @click="konfirmasiHapus(p)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Riwayat kunjungan (SOAP) -->
    <Dialog
      v-model:visible="showRiwayat"
      header="Riwayat Kunjungan"
      modal
      :style="{ width: '1100px', maxWidth: '96vw' }"
    >
      <p v-if="riwayatPasien" class="riwayat__pasien">
        <strong>{{ riwayatPasien.NAMAPASIEN }}</strong> · RM {{ riwayatPasien.NOMR }}
        <small>50 kunjungan terakhir</small>
      </p>

      <div class="riwayat-filter">
        <label for="riwayat-dokter">Filter dokter</label>
        <Select inputId="riwayat-dokter" v-model="dokterRiwayat" :options="dokterRiwayatOpsi" placeholder="Semua dokter" showClear style="min-width: 16rem" />
      </div>

      <p v-if="loadingRiwayat" class="empty-sm"><i class="pi pi-spin pi-spinner" /> Memuat riwayat…</p>
      <p v-else-if="!riwayatTersaring.length" class="empty-sm">Belum ada kunjungan.</p>

      <div v-else class="riwayat-grid">
        <article v-for="r in riwayatTersaring" :key="r.NOREGISTER" class="panel riwayat-card">
          <div class="riwayat-card__col">
            <div class="riwayat-card__hdr"><i class="pi pi-calendar" /><h3>Kunjungan</h3></div>
            <Tag :value="formatTanggal(r.TGLREG) || r.NOREGISTER" />
            <span class="riwayat-card__ago">{{ waktuLalu(r.TGLREG) }}</span>
            <dl class="riwayat-card__detail">
              <div><dt>Dokter</dt><dd>{{ r.NAMADOKTER || '—' }}</dd></div>
              <div><dt>Poli</dt><dd>{{ r.POLI || '—' }}</dd></div>
              <div><dt>No. registrasi</dt><dd>{{ r.NOREGISTER }}</dd></div>
            </dl>
          </div>

          <div class="riwayat-card__col">
            <div class="riwayat-card__hdr"><i class="pi pi-heart-fill" /><h3>Pemeriksaan</h3></div>
            <div v-if="r.TENSI || r.SUHU || r.SP2O || r.NADI" class="riwayat-card__vitals">
              <span v-if="r.SUHU">Suhu {{ r.SUHU }}°C</span>
              <span v-if="r.TENSI">TD {{ r.TENSI }}</span>
              <span v-if="r.SP2O">SpO₂ {{ r.SP2O }}%</span>
              <span v-if="r.NADI">Nadi {{ r.NADI }}</span>
            </div>
            <dl class="riwayat-card__soap">
              <template v-if="r.SUBJEK"><dt>S</dt><dd>{{ r.SUBJEK }}</dd></template>
              <template v-if="r.OBJEK"><dt>O</dt><dd>{{ r.OBJEK }}</dd></template>
              <template v-if="r.ASSESMEN"><dt>A</dt><dd>{{ r.ASSESMEN }}</dd></template>
              <template v-if="r.PLAN"><dt>P</dt><dd>{{ r.PLAN }}</dd></template>
            </dl>
            <p v-if="!r.SUBJEK && !r.ASSESMEN" class="muted small">Tidak ada SOAP.</p>
          </div>
        </article>
      </div>

      <template #footer>
        <Button label="Tutup" severity="secondary" outlined @click="showRiwayat = false" />
        <Button
          v-if="riwayatPasien"
          label="Daftarkan kunjungan"
          icon="pi pi-user-plus"
          @click="(showRiwayat = false), daftarkan(riwayatPasien)"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.search {
  margin-bottom: 1.25rem;
}
.search__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.search__input {
  flex: 1;
  min-width: 14rem;
}

.toolbar {
  flex-wrap: wrap;
}
.toolbar__info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.toolbar__info small {
  color: var(--app-text-muted);
}
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.toolbar__filter {
  width: 14rem;
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
.muted {
  color: var(--app-text-muted);
}
.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.copyable {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
}
.copyable :deep(.p-button) {
  opacity: 0.45;
}
.copyable:hover :deep(.p-button),
.copyable :deep(.p-button:focus-visible) {
  opacity: 1;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.empty {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--app-text-muted);
}
.empty__icon {
  font-size: 1.75rem;
  color: var(--p-primary-color);
  margin-bottom: 0.5rem;
}
.empty p {
  margin: 0;
}
.empty-sm {
  margin: 0;
  padding: 1rem 0;
  text-align: center;
  color: var(--app-text-muted);
}

.riwayat__pasien {
  margin: 0 0 0.875rem;
}
.riwayat__pasien small {
  display: block;
  color: var(--app-text-muted);
}

.riwayat-filter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.625rem;
  margin-bottom: 1rem;
}
.riwayat-filter label {
  font-size: 0.875rem;
  font-weight: 600;
}
.riwayat-grid {
  display: grid;
  gap: 1rem;
  max-height: 65vh;
  overflow-y: auto;
  padding-right: 0.25rem;
}
.riwayat-card {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  gap: 1.5rem;
}
.riwayat-card__col {
  display: grid;
  gap: 0.625rem;
  align-content: start;
}
.riwayat-card__hdr {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.riwayat-card__hdr i {
  color: var(--p-primary-color);
}
.riwayat-card__hdr h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
}
.riwayat-card__ago {
  font-size: 0.8125rem;
  font-style: italic;
  color: var(--app-text-muted);
}
.riwayat-card__detail {
  display: grid;
  gap: 0.375rem;
  margin: 0;
}
.riwayat-card__detail div {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.riwayat-card__detail dt {
  color: var(--app-text-muted);
}
.riwayat-card__detail dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
.riwayat-card__vitals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}
.riwayat-card__vitals span {
  padding: 0.125rem 0.5rem;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.riwayat-card__soap {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  gap: 0.25rem 0.5rem;
  margin: 0;
  font-size: 0.875rem;
}
.riwayat-card__soap dt {
  font-weight: 800;
  color: var(--p-primary-color);
}
.riwayat-card__soap dd {
  margin: 0;
  white-space: pre-line;
  word-break: break-word;
}
@media (max-width: 640px) {
  .riwayat-card {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 575px) {
  .toolbar__filter {
    width: 100%;
  }
}
</style>
