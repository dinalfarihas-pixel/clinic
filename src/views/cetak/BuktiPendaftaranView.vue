<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getPendaftaran, CARA_BAYAR_BPJS } from '@/services/pendaftaran'
import { formatTanggal, hitungUmurTahun } from '@/utils/tanggal'

const route = useRoute()
const auth = useAuthStore()

const data = ref(null)
const loading = ref(true)
const error = ref('')

// Ukuran kertas: struk printer thermal 80 mm atau A5
const FORMAT_KEY = 'klinik.cetak.bukti.format'
const formatOptions = [
  { label: 'Struk 80 mm', value: 'struk' },
  { label: 'A5', value: 'a5' }
]
function formatAwal() {
  if (['struk', 'a5'].includes(route.query.format)) return route.query.format
  try {
    return localStorage.getItem(FORMAT_KEY) || 'struk'
  } catch {
    return 'struk'
  }
}
const format = ref(formatAwal())

// @page tidak bisa di-scope, jadi disisipkan sebagai <style> sesuai format
let pageStyle = null
function terapkanUkuranHalaman() {
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    document.head.appendChild(pageStyle)
  }
  pageStyle.textContent =
    format.value === 'struk' ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A5 portrait; margin: 10mm; }'
}
watch(format, (f) => {
  terapkanUkuranHalaman()
  try {
    localStorage.setItem(FORMAT_KEY, f)
  } catch {
    /* abaikan */
  }
})

// ── Data tampilan ────────────────────────────────────────────
const isBpjs = computed(() => data.value?.KODECARABAYAR == CARA_BAYAR_BPJS)

const jenisKelamin = computed(() => {
  const jk = String(data.value?.JENISKELAMIN || '').toUpperCase()
  if (jk.startsWith('L')) return 'Laki-laki'
  if (jk.startsWith('P')) return 'Perempuan'
  return ''
})

const umur = computed(() => {
  const u = data.value?.USIA_PASIEN
  if (u?.tahun != null) return `${u.tahun} th ${u.bulan ?? 0} bl`
  const th = hitungUmurTahun(data.value?.TGLLAHIR)
  return th == null ? '' : `${th} tahun`
})

const baris = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: 'No. registrasi', value: d.NOPENDAFTARAN, mono: true },
    { label: 'Tanggal', value: d.MASUKPOLY_DISPLAY },
    { label: 'No. RM', value: d.NOMR, mono: true, strong: true },
    { label: 'Nama', value: d.NAMAPASIEN, strong: true },
    { label: 'Jenis kelamin', value: jenisKelamin.value },
    { label: 'Tgl. lahir', value: [formatTanggal(d.TGLLAHIR), umur.value && `(${umur.value})`].filter(Boolean).join(' ') },
    { label: 'Pasien', value: d.JENISPASIEN },
    { label: 'Poli', value: d.POLI, strong: true },
    { label: 'Dokter', value: d.NAMADOKTER },
    { label: 'Cara bayar', value: d.CARABAYAR },
    ...(isBpjs.value
      ? [
          { label: 'No. BPJS', value: d.NOJAMINAN || d.NO_KARTU, mono: true },
          { label: 'No. SEP', value: d.NOSEP, mono: true }
        ]
      : [])
  ].filter((r) => r.value)
})

const dicetak = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

function cetak() {
  window.print()
}

function tutup() {
  window.close()
}

async function muat() {
  loading.value = true
  error.value = ''
  try {
    data.value = await getPendaftaran(String(route.params.noreg))
    document.title = `Bukti pendaftaran ${data.value.NOPENDAFTARAN}`
    if (route.query.print === '1') {
      await nextTick()
      // Tunggu logo termuat agar ikut tercetak
      setTimeout(cetak, 400)
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  terapkanUkuranHalaman()
  muat()
})

onBeforeUnmount(() => pageStyle?.remove())
</script>

<template>
  <div class="cetak" :class="`cetak--${format}`">
    <!-- Toolbar (tidak ikut tercetak) -->
    <div class="toolbar no-print">
      <SelectButton v-model="format" :options="formatOptions" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" />
      <div class="toolbar__right">
        <Button label="Tutup" severity="secondary" text size="small" @click="tutup" />
        <Button label="Cetak" icon="pi pi-print" size="small" :disabled="!data" @click="cetak" />
      </div>
    </div>

    <div v-if="loading" class="status no-print">
      <i class="pi pi-spin pi-spinner" /> Memuat data pendaftaran…
    </div>
    <Message v-else-if="error" severity="error" icon="pi pi-exclamation-circle" class="no-print">{{ error }}</Message>

    <!-- Kertas -->
    <article v-else-if="data" class="kertas">
      <header class="kop">
        <img v-if="auth.logo" :src="auth.logo" alt="" class="kop__logo" />
        <div class="kop__text">
          <strong class="kop__nama">{{ auth.company || 'KLINIK' }}</strong>
          <span v-if="auth.alamat" class="kop__alamat">{{ auth.alamat }}</span>
        </div>
      </header>

      <h1 class="judul">Bukti Pendaftaran<small>Rawat Jalan</small></h1>

      <div v-if="data.NOMORANTRIAN" class="antrian">
        <span class="antrian__label">Nomor antrian</span>
        <strong class="antrian__nomor">{{ data.NOMORANTRIAN }}</strong>
        <span class="antrian__poli">{{ data.POLI }}</span>
      </div>

      <dl class="data">
        <div v-for="r in baris" :key="r.label" class="data__row">
          <dt>{{ r.label }}</dt>
          <dd :class="{ mono: r.mono, strong: r.strong }">{{ r.value }}</dd>
        </div>
      </dl>

      <p class="catatan">Simpan bukti ini dan tunjukkan kepada petugas saat dipanggil.</p>

      <footer class="kaki">
        <span>Petugas: {{ auth.user?.name || data.USER_ID || '-' }}</span>
        <span>Dicetak {{ dicetak }}</span>
      </footer>
    </article>
  </div>
</template>

<style scoped>
/* Kertas selalu putih-hitam agar pratinjau sama dengan hasil cetak */
.cetak {
  --ink: #111;
  --ink-muted: #555;
  --rule: #999;
  width: 100%;
  max-width: 40rem;
  display: grid;
  gap: 1rem;
  justify-items: center;
}

.toolbar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.625rem 0.75rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.toolbar__right {
  display: flex;
  gap: 0.5rem;
}
.status {
  color: var(--app-text-muted);
}

.kertas {
  background: #fff;
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  max-width: 100%; /* layar kecil; saat cetak lebar mengikuti kertas */
}
.cetak--struk .kertas {
  width: 80mm;
  padding: 4mm;
  font-size: 9pt;
}
.cetak--a5 .kertas {
  width: 148mm;
  min-height: 210mm;
  padding: 12mm;
  font-size: 10.5pt;
}

.kop {
  display: flex;
  align-items: center;
  gap: 3mm;
  padding-bottom: 2.5mm;
  border-bottom: 1.5px solid var(--ink);
}
.cetak--struk .kop {
  flex-direction: column;
  text-align: center;
  gap: 1.5mm;
}
.kop__logo {
  width: 12mm;
  height: 12mm;
  object-fit: contain;
}
.cetak--a5 .kop__logo {
  width: 16mm;
  height: 16mm;
}
.kop__text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.kop__nama {
  font-size: 1.2em;
  text-transform: uppercase;
}
.kop__alamat {
  font-size: 0.85em;
  color: var(--ink-muted);
}

.judul {
  margin: 3mm 0;
  font-size: 1.15em;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.judul small {
  display: block;
  font-size: 0.75em;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink-muted);
}

.antrian {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 0 3mm;
  padding: 2.5mm;
  border: 1.5px dashed var(--ink);
  line-height: 1.15;
}
.antrian__label,
.antrian__poli {
  font-size: 0.85em;
  color: var(--ink-muted);
}
.antrian__nomor {
  font-size: 3em;
  letter-spacing: 0.04em;
}

.data {
  margin: 0;
}
.data__row {
  display: grid;
  grid-template-columns: 24mm 1fr;
  gap: 2mm;
  padding: 0.8mm 0;
}
.cetak--a5 .data__row {
  grid-template-columns: 34mm 1fr;
  padding: 1.5mm 0;
  border-bottom: 0.5px dotted var(--rule);
}
.data dt {
  color: var(--ink-muted);
}
.data dd {
  margin: 0;
  word-break: break-word;
}
.strong {
  font-weight: 700;
}
.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
}

.catatan {
  margin: 3mm 0 2mm;
  padding-top: 2mm;
  border-top: 0.5px dashed var(--rule);
  font-size: 0.85em;
  text-align: center;
}
.kaki {
  display: flex;
  justify-content: space-between;
  gap: 2mm;
  font-size: 0.75em;
  color: var(--ink-muted);
}
.cetak--struk .kaki {
  flex-direction: column;
  align-items: center;
}

@media print {
  .no-print {
    display: none !important;
  }
  :global(body),
  :global(.blank-layout) {
    background: #fff !important;
    padding: 0 !important;
    display: block !important;
    min-height: 0 !important;
  }
  .cetak {
    max-width: none;
    display: block;
  }
  .kertas {
    box-shadow: none;
    padding: 0 !important;
    min-height: 0 !important;
  }
  .cetak--struk .kertas {
    width: 100%;
  }
  .cetak--a5 .kertas {
    width: 100%;
  }
}
</style>
