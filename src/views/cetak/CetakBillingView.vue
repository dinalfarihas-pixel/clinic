<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getPendaftaran } from '@/services/pendaftaran'
import { getBillingKunjungan } from '@/services/kasir'
import { formatTanggal, hitungUmurTahun } from '@/utils/tanggal'

const route = useRoute()
const auth = useAuthStore()
const noReg = String(route.params.noreg)

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

const loading = ref(true)
const error = ref('')
const kunjungan = ref(null)
const billing = ref(null)

// Ukuran kertas: A4 (kantor/berkas) atau struk printer thermal 80 mm (kertas roll)
const FORMAT_KEY = 'klinik.cetak.billing.format'
const formatOptions = [
  { label: 'A4', value: 'a4' },
  { label: 'Struk 80 mm', value: 'struk' }
]
function formatAwal() {
  if (['a4', 'struk'].includes(route.query.format)) return route.query.format
  try {
    return localStorage.getItem(FORMAT_KEY) || 'a4'
  } catch {
    return 'a4'
  }
}
const format = ref(formatAwal())

let pageStyle = null
function terapkanUkuranHalaman() {
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    document.head.appendChild(pageStyle)
  }
  pageStyle.textContent = format.value === 'struk' ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A4 portrait; margin: 15mm; }'
}
watch(format, (f) => {
  terapkanUkuranHalaman()
  try {
    localStorage.setItem(FORMAT_KEY, f)
  } catch {
    /* abaikan */
  }
})

// ── Tampilan pasien & kunjungan ────────────────────────────────
const jk = (v) => (String(v).toUpperCase().startsWith('P') ? 'Perempuan' : String(v).toUpperCase().startsWith('L') ? 'Laki-laki' : '')
const usia = computed(() => {
  const u = kunjungan.value?.USIA_PASIEN
  if (u?.tahun != null) return `${u.tahun} th ${u.bulan ?? 0} bl`
  const th = hitungUmurTahun(kunjungan.value?.TGLLAHIR)
  return th == null ? '' : `${th} tahun`
})
const sudahLunas = computed(() => String(kunjungan.value?.LUNAS) === '1')

// ── Billing dikelompokkan per kategori ─────────────────────────
const groupedByCategory = computed(() => {
  const detail = billing.value?.DETAIL
  if (!Array.isArray(detail)) return {}
  return detail.reduce((groups, item) => {
    const kat = item.KATEGORI || 'Lainnya'
    if (!groups[kat]) groups[kat] = []
    groups[kat].push(item)
    return groups
  }, {})
})
const totalTagihan = computed(() => (billing.value?.DETAIL || []).reduce((s, i) => s + (Number(i.TOTALAMOUNT) || 0), 0))
const adaTagihan = computed(() => Object.keys(groupedByCategory.value).length > 0)

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
    const k = await getPendaftaran(noReg)
    kunjungan.value = k
    document.title = `Billing ${noReg}`
    billing.value = await getBillingKunjungan(k.NOMR, noReg)
    if (route.query.print === '1') {
      await nextTick()
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
        <Button label="Cetak" icon="pi pi-print" size="small" :disabled="!kunjungan" @click="cetak" />
      </div>
    </div>

    <div v-if="loading" class="status no-print"><i class="pi pi-spin pi-spinner" /> Memuat data tagihan…</div>
    <Message v-else-if="error" severity="error" icon="pi pi-exclamation-circle" class="no-print">{{ error }}</Message>

    <!-- Kertas -->
    <article v-else-if="kunjungan" class="kertas">
      <header class="kop">
        <img v-if="auth.logo" :src="auth.logo" alt="" class="kop__logo" />
        <div class="kop__text">
          <strong class="kop__nama">{{ auth.company || 'KLINIK' }}</strong>
          <span v-if="auth.alamat" class="kop__alamat">{{ auth.alamat }}</span>
        </div>
      </header>

      <h1 class="judul">Rincian Tagihan<small>No. Registrasi {{ noReg }}</small></h1>

      <div class="status-row">
        <span :class="['status-badge', sudahLunas ? 'status-badge--lunas' : 'status-badge--belum']">
          {{ sudahLunas ? 'LUNAS' : 'BELUM LUNAS' }}
        </span>
        <span v-if="sudahLunas && kunjungan.LUNAS_BY" class="status-oleh">oleh {{ kunjungan.LUNAS_BY }}</span>
      </div>

      <div class="info-grid">
        <dl class="data">
          <div class="data__row"><dt>Nama</dt><dd class="strong">{{ kunjungan.NAMAPASIEN || '—' }}</dd></div>
          <div class="data__row"><dt>No. RM</dt><dd class="mono">{{ kunjungan.NOMR || '—' }}</dd></div>
          <div v-if="jk(kunjungan.JENISKELAMIN) || usia" class="data__row">
            <dt>JK / Usia</dt><dd>{{ [jk(kunjungan.JENISKELAMIN), usia].filter(Boolean).join(' · ') }}</dd>
          </div>
          <div v-if="kunjungan.ALAMAT" class="data__row"><dt>Alamat</dt><dd>{{ kunjungan.ALAMAT }}</dd></div>
        </dl>
        <dl class="data">
          <div class="data__row"><dt>Poli</dt><dd>{{ kunjungan.POLI || '—' }}</dd></div>
          <div class="data__row"><dt>Dokter</dt><dd>{{ kunjungan.NAMADOKTER || '—' }}</dd></div>
          <div class="data__row"><dt>Cara bayar</dt><dd>{{ kunjungan.CARABAYAR || '—' }}</dd></div>
          <div class="data__row"><dt>Masuk</dt><dd>{{ formatTanggal(kunjungan.MASUKPOLY) || kunjungan.MASUKPOLY_DISPLAY || '—' }}</dd></div>
        </dl>
      </div>

      <div class="garis-tebal" />

      <p v-if="!adaTagihan" class="kosong">Belum ada item tagihan untuk kunjungan ini.</p>
      <table v-else class="bill-table">
        <thead>
          <tr>
            <th class="col-item">Item / Layanan</th>
            <th class="col-num">Harga</th>
            <th class="col-qty">Qty</th>
            <th>Satuan</th>
            <th class="col-num">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(items, kategori) in groupedByCategory" :key="kategori">
            <tr class="bill-table__kategori"><td colspan="5">{{ kategori }}</td></tr>
            <tr v-for="(item, idx) in items" :key="idx">
              <td>{{ item.ITEM }}</td>
              <td class="mono col-num">{{ rupiah.format(item.HARGA || 0) }}</td>
              <td class="mono col-qty">{{ item.QTY }}</td>
              <td>{{ item.SATUAN }}</td>
              <td class="mono col-num">{{ rupiah.format(item.TOTALAMOUNT || 0) }}</td>
            </tr>
            <tr class="bill-table__subtotal">
              <td colspan="4">Subtotal <em>{{ kategori }}</em></td>
              <td class="mono col-num">{{ rupiah.format(items.reduce((s, i) => s + (Number(i.TOTALAMOUNT) || 0), 0)) }}</td>
            </tr>
          </template>
        </tbody>
      </table>

      <div class="total-row">
        <span>TOTAL TAGIHAN</span>
        <span class="mono">{{ rupiah.format(totalTagihan) }}</span>
      </div>

      <footer class="kaki">
        <div class="kaki__ttd">
          <span>Petugas Kasir</span>
          <span class="kaki__line" />
          <span>{{ kunjungan.LUNAS_BY || auth.user?.name || '(…………………)' }}</span>
        </div>
        <span class="kaki__cetak">Dicetak {{ dicetak }}</span>
      </footer>
    </article>
  </div>
</template>

<style scoped>
/* Kertas selalu putih-hitam agar pratinjau sama dengan hasil cetak (sama dengan BuktiPendaftaranView) */
.cetak {
  --ink: #111;
  --ink-muted: #555;
  --rule: #999;
  width: 100%;
  max-width: 46rem;
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
  max-width: 100%;
}
.cetak--a4 .kertas {
  width: 210mm;
  min-height: 297mm;
  padding: 15mm;
  font-size: 10.5pt;
}
.cetak--struk .kertas {
  width: 80mm;
  padding: 4mm;
  font-size: 9pt;
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
.cetak--a4 .kop__logo {
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

.status-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2mm;
  margin-bottom: 3mm;
}
.status-badge {
  padding: 1mm 4mm;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.85em;
  letter-spacing: 0.04em;
}
.status-badge--lunas {
  background: #dcfce7;
  color: #15803d;
}
.status-badge--belum {
  background: #fef3c7;
  color: #b45309;
}
.status-oleh {
  font-size: 0.8em;
  color: var(--ink-muted);
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4mm;
  margin-bottom: 3mm;
}
.cetak--struk .info-grid {
  grid-template-columns: 1fr;
  gap: 1.5mm;
}

.data {
  margin: 0;
}
.data__row {
  display: grid;
  grid-template-columns: 20mm 1fr;
  gap: 2mm;
  padding: 0.8mm 0;
}
.cetak--a4 .data__row {
  grid-template-columns: 26mm 1fr;
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
  letter-spacing: 0.02em;
}

.garis-tebal {
  width: 100%;
  border-top: 1.5px solid var(--ink);
  margin-bottom: 2.5mm;
}

.kosong {
  text-align: center;
  color: var(--ink-muted);
  font-size: 0.9em;
}

.bill-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}
.cetak--struk .bill-table {
  font-size: 0.85em;
}
.bill-table th {
  text-align: left;
  padding: 1.5mm 1mm;
  font-size: 0.8em;
  font-weight: 700;
  text-transform: uppercase;
  border-bottom: 1.5px solid var(--ink);
  white-space: nowrap;
}
.bill-table td {
  padding: 1.2mm 1mm;
  border-bottom: 0.5px solid var(--rule);
  vertical-align: top;
}
.col-item {
  min-width: 14mm;
}
.col-num {
  text-align: right;
}
.col-qty {
  text-align: center;
  width: 8mm;
}
.bill-table__kategori td {
  font-weight: 700;
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding-top: 2.5mm;
  border-bottom: 0.5px solid var(--ink);
}
.bill-table__subtotal td {
  font-style: italic;
  font-weight: 600;
  border-bottom: 1px solid var(--rule);
}
.bill-table__subtotal em {
  font-style: normal;
}

.total-row {
  display: flex;
  justify-content: space-between;
  margin-top: 3mm;
  padding-top: 2mm;
  border-top: 1.5px solid var(--ink);
  font-weight: 700;
  font-size: 1.05em;
}

.kaki {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 2mm;
  margin-top: 8mm;
  font-size: 0.8em;
  color: var(--ink-muted);
}
.cetak--struk .kaki {
  flex-direction: column;
  align-items: center;
  margin-top: 4mm;
}
.kaki__ttd {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1mm;
  min-width: 40mm;
  text-align: center;
}
.kaki__line {
  display: block;
  width: 36mm;
  border-top: 1px solid var(--ink);
  margin: 9mm 0 0.5mm;
}
.kaki__cetak {
  white-space: nowrap;
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
  .cetak--a4 .kertas {
    width: 100%;
  }
  .cetak--struk .kertas {
    width: 100%;
  }
}
</style>
