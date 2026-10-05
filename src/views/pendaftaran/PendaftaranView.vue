<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useRoute } from 'vue-router'
import { getPasienLokal, getPesertaBpjs, getStatistikPendaftaran, MODE_CARI } from '@/services/pendaftaran'
import { formatTanggal, hitungUmurTahun, toYmd } from '@/utils/tanggal'
import PasienInfoCard from './components/PasienInfoCard.vue'
import CariPasienDialog from './components/CariPasienDialog.vue'
import FormPendaftaran from './components/FormPendaftaran.vue'
import PasienBaruDialog from './components/PasienBaruDialog.vue'

const toast = useToast()
const route = useRoute()
// Dibuka dari halaman Data Pasien (?norm=...): pasien langsung dimuat
const normAwal = typeof route.query.norm === 'string' ? route.query.norm.trim() : ''

// ── Kartu ringkasan (data_referensi/statistik_pendaftaran) ───
const statistik = ref(null)

const summary = computed(() => {
  const s = statistik.value
  return [
    { label: 'Total pasien', value: s?.total_pasien, icon: 'pi pi-users' },
    { label: 'Daftar hari ini', value: s?.daftar_hari_ini, icon: 'pi pi-user-plus' },
    { label: 'Pasien BPJS hari ini', value: s?.pasien_bpjs, icon: 'pi pi-id-card' },
    { label: 'Batal hari ini', value: s?.batal, icon: 'pi pi-times-circle' }
  ]
})

async function muatStatistik() {
  try {
    statistik.value = await getStatistikPendaftaran(toYmd(new Date()))
  } catch (err) {
    toast.add({ severity: 'warn', summary: 'Statistik', detail: err.message, life: 4000 })
  }
}

// ── Data pasien terpilih ─────────────────────────────────────
function emptyPasien() {
  return {
    noMR: '',
    nama: '',
    nik: '',
    noKartu: '',
    sex: '',
    tglLahir: '',
    tglLahirText: '',
    umur: '',
    noTelepon: '',          
    alamat: '',
    statusPeserta: null,
    jenisPeserta: null,
    hakKelas: null,
    provUmum: null
  }
}

const pasien = ref(emptyPasien())
const showCari = ref(false)
const searching = ref(false)
const bannerDismissed = ref(false)

watch(() => pasien.value.noMR, () => (bannerDismissed.value = false))

function hitungUmur(tgl) {
  const umur = hitungUmurTahun(tgl)
  return umur === null ? '' : `${umur} tahun`
}

/** Gabungkan data pasien lokal (NOMR, NAMAPASIEN, ...) dan peserta BPJS menjadi satu bentuk. */
function toPasien(lokal, bpjs) {
  const tglLahir = bpjs?.tglLahir || lokal?.TGLLAHIR || ''
  return {
    ...emptyPasien(),
    noMR: lokal?.NOMR || bpjs?.mr?.noMR || '',
    nama: bpjs?.nama || lokal?.NAMAPASIEN || '',
    nik: bpjs?.nik || lokal?.NOKTP || '',
    noKartu: bpjs?.noKartu || lokal?.NO_KARTU || '',
    sex: bpjs?.sex || lokal?.JENISKELAMIN || '',
    tglLahir,
    tglLahirText: formatTanggal(tglLahir),
    umur: bpjs?.umur?.umurSekarang || hitungUmur(tglLahir),
    noTelepon: lokal?.NOTELP || bpjs?.mr?.noTelepon || '',
    alamat: lokal?.ALAMAT || '',
    statusPeserta: bpjs?.statusPeserta || null,
    jenisPeserta: bpjs?.jenisPeserta || null,
    hakKelas: bpjs?.hakKelas || null,
    provUmum: bpjs?.provUmum || null
  }
}

function notify(severity, summary, detail) {
  toast.add({ severity, summary, detail, life: severity === 'error' ? 5000 : 4000 })
}

// BPJS boleh gagal (mis. maintenance): pencarian tetap lanjut dengan data lokal
async function cekBpjs(nomor) {
  try {
    return await getPesertaBpjs(nomor)
  } catch (err) {
    notify('warn', 'Data BPJS tidak tersedia', err.message)
    return null
  }
}

// ── Pencarian (alur sama dengan SIMRS) ───────────────────────
// No. RM      : cari lokal dulu, lalu lengkapi status BPJS dari nomor kartunya
// No. BPJS/NIK: cek BPJS dulu, lalu cari lokal berdasarkan nomor kartu
async function cariPasien({ mode, keyword }) {
  if (!keyword) {
    notify('warn', 'Kata kunci kosong', mode === 'rm' ? 'Masukkan No. RM.' : 'Masukkan No. BPJS atau NIK.')
    return
  }
  searching.value = true
  try {
    let lokal = null
    let bpjs = null

    if (mode === 'rm') {
      lokal = await getPasienLokal(MODE_CARI.NO_RM, keyword)
      if (lokal?.NO_KARTU) bpjs = await cekBpjs(lokal.NO_KARTU)
    } else {
      bpjs = await cekBpjs(keyword)
      lokal = await getPasienLokal(MODE_CARI.NO_KARTU, bpjs?.noKartu || keyword)
    }

    if (!lokal && !bpjs) {
      pasien.value = emptyPasien()
      notify('info', 'Belum ada di data lokal', 'Silakan lengkapi sebagai pasien baru.')
      pasienBaru(mode === 'bpjs' ? keyword : '')
      return
    }

    pasien.value = toPasien(lokal, bpjs)
    if (!lokal) {
      // Peserta BPJS belum punya RM: langsung buka form pasien baru dengan data BPJS
      notify('info', 'Belum punya rekam medis', 'Peserta BPJS ditemukan. Lengkapi data untuk mendaftarkan sebagai pasien baru.')
      pasienBaru()
    }
  } catch (err) {
    notify('error', 'Gagal mencari pasien', err.message)
  } finally {
    searching.value = false
  }
}

// ── Pasien baru ──────────────────────────────────────────────
const showPasienBaru = ref(false)
const prefillPasienBaru = ref(null)

function pasienBaru(searchKeyword = '') {
  // Peserta BPJS yang ditemukan tetapi belum punya RM: datanya dipakai sebagai isian awal
  if (pasien.value.nama && !pasien.value.noMR) {
    prefillPasienBaru.value = { ...pasien.value }
  } else if (searchKeyword) {
    // Sama sekali tidak ditemukan (lokal maupun BPJS): kata kunci yang diketik tetap diisikan
    // ke No. kartu BPJS / NIK agar bisa langsung dicek ulang di form pasien baru
    const digits = searchKeyword.replace(/\D/g, '')
    prefillPasienBaru.value = { ...emptyPasien(), ...(digits.length === 16 ? { nik: digits } : { noKartu: digits }) }
  } else {
    prefillPasienBaru.value = null
  }
  showCari.value = false
  showPasienBaru.value = true
}

async function onPasienBaruSaved(noRm) {
  showPasienBaru.value = false
  muatStatistik()
  // Langsung muat pasien yang baru dibuat agar bisa didaftarkan kunjungannya
  if (noRm) await cariPasien({ mode: 'rm', keyword: String(noRm) })
  else showCari.value = true
}

function restorePasien(data) {
  // Pasien pilihan dari Data Pasien tidak ditimpa pasien milik draft
  if (normAwal) return
  pasien.value = { ...emptyPasien(), ...data }
  showCari.value = false
}

function onSaved() {
  pasien.value = emptyPasien()
  muatStatistik()
}

onMounted(() => {
  muatStatistik()
  if (normAwal) cariPasien({ mode: 'rm', keyword: normAwal })
  else showCari.value = true
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Pendaftaran pasien</h1>
        <p class="page-subtitle">Cari pasien, lalu lengkapi data kunjungan rawat jalan.</p>
      </div>
      <div class="page-actions">
        <Button label="Riwayat" icon="pi pi-history" severity="secondary" text @click="$router.push('/riwayat-pendaftaran')" />
        <Button label="Pasien baru" icon="pi pi-user-plus" severity="secondary" outlined @click="pasienBaru" />
        <Button label="Cari pasien" icon="pi pi-search" @click="showCari = true" />
      </div>
    </header>

    <section class="summary" aria-label="Ringkasan pendaftaran">
      <div v-for="s in summary" :key="s.label" class="summary__item">
        <i :class="s.icon" class="summary__icon" />
        <div>
          <p class="summary__value">{{ s.value == null ? '—' : s.value.toLocaleString('id-ID') }}</p>
          <p class="summary__label">{{ s.label }}</p>
        </div>
      </div>
    </section>

    <div class="reg-layout">
      <aside class="reg-layout__side">
        <PasienInfoCard :pasien="pasien" />
      </aside>

      <div class="reg-layout__main">
        <Message
          v-if="!bannerDismissed && pasien.noKartu && pasien.statusPeserta && pasien.statusPeserta.keterangan !== 'AKTIF'"
          severity="error"
          icon="pi pi-exclamation-triangle"
          closable
          class="banner"
          @close="bannerDismissed = true"
        >
          <strong>Peserta BPJS tidak aktif.</strong>
          Status {{ pasien.nama }}: {{ pasien.statusPeserta.keterangan }}. Pastikan cara bayar sudah sesuai sebelum mendaftar.
        </Message>

        <FormPendaftaran
          :pasien="pasien"
          @cari-pasien="showCari = true"
          @restore-pasien="restorePasien"
          @saved="onSaved"
          @reset="pasien = emptyPasien()"
        />
      </div>
    </div>

    <CariPasienDialog
      v-model:visible="showCari"
      :pasien="pasien"
      :loading="searching"
      @cari="cariPasien"
      @pasien-baru="pasienBaru"
      @lanjut="showCari = false"
    />

    <PasienBaruDialog v-model:visible="showPasienBaru" :prefill="prefillPasienBaru" @saved="onPasienBaruSaved" />
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

.page-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.reg-layout {
  display: grid;
  grid-template-columns: minmax(16rem, 1fr) minmax(0, 3fr);
  gap: 1.25rem;
  align-items: start;
}
.reg-layout__side {
  position: sticky;
  top: calc(var(--navbar-height) + 1.5rem);
}
.banner {
  margin-bottom: 1rem;
}

@media (max-width: 1200px) {
  .reg-layout {
    grid-template-columns: 1fr;
  }
  .reg-layout__side {
    position: static;
  }
}
@media (max-width: 768px) {
  .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary__item:nth-child(3) { border-left: 0; }
  .summary__item:nth-child(n + 3) { border-top: 1px solid var(--app-border); }
}
</style>
