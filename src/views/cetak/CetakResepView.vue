<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getDetailResep } from '@/services/resep'
import { getPendaftaran } from '@/services/pendaftaran'
import { formatTanggal, hitungUmurTahun } from '@/utils/tanggal'

const route = useRoute()
const auth = useAuthStore()
const trans = String(route.params.trans)

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

const loading = ref(true)
const error = ref('')
const header = ref(null)
const items = ref([])
const pasien = ref(null)

// Struk printer thermal 80 mm (kertas roll) — beda dengan cetak A4/A5 lain di app ini
let pageStyle = null
function terapkanUkuranHalaman() {
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    document.head.appendChild(pageStyle)
  }
  pageStyle.textContent = '@page { size: 80mm auto; margin: 3mm; }'
}

const jenisKelamin = computed(() => {
  const jk = String(pasien.value?.JENISKELAMIN || '').toUpperCase()
  if (jk.startsWith('L')) return 'Laki-laki'
  if (jk.startsWith('P')) return 'Perempuan'
  return ''
})
const umur = computed(() => {
  const u = pasien.value?.USIA_PASIEN
  if (u?.tahun != null) return `${u.tahun} th ${u.bulan ?? 0} bl`
  const th = hitungUmurTahun(pasien.value?.TGLLAHIR)
  return th == null ? '' : `${th} tahun`
})

const namaPasien = computed(() => pasien.value?.NAMAPASIEN || route.query.nama || '')
const noRm = computed(() => pasien.value?.NOMR || route.query.nomr || '')
const poli = computed(() => pasien.value?.POLI || route.query.poli || '')
const dokter = computed(() => pasien.value?.NAMADOKTER || '')

const itemsTampil = computed(() =>
  items.value.map((it) => ({
    nama: it.NAMABARANG,
    qty: Number(it.QTY) || 0,
    satuan: it.MEREK || '',
    harga: Number(it.HARGA) || 0,
    subtotal: Number(it.TOTALAMOUNT) || 0,
    signa: (it.REMARK_ITEM || '').trim()
  }))
)

const grandTotal = computed(() => {
  const subtotal = items.value.reduce((s, i) => s + (Number(i.TOTALAMOUNT) || 0), 0)
  const potongan = Number(header.value?.POTONGAN) || 0
  const pajak = Number(header.value?.TAXAMOUNT) || 0
  return subtotal - potongan + pajak
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
    const detail = await getDetailResep(trans, {
      tanggal: route.query.tanggal,
      nomr: route.query.nomr,
      noregister: route.query.noregister
    })
    if (!detail.header) throw new Error(`Resep ${trans} tidak ditemukan`)
    header.value = detail.header
    items.value = detail.items

    document.title = `Cetak resep ${trans}`

    const noReg = detail.header.NOREGISTER || route.query.noregister
    if (noReg) {
      try {
        pasien.value = await getPendaftaran(String(noReg))
      } catch {
        // Identitas pasien tetap bisa ditampilkan dari route.query bila kunjungan sudah tidak aktif
      }
    }

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
  <div class="cetak">
    <!-- Toolbar (tidak ikut tercetak) -->
    <div class="toolbar no-print">
      <span class="toolbar__title">Struk 80 mm</span>
      <div class="toolbar__right">
        <Button label="Tutup" severity="secondary" text size="small" @click="tutup" />
        <Button label="Cetak" icon="pi pi-print" size="small" :disabled="!header" @click="cetak" />
      </div>
    </div>

    <div v-if="loading" class="status no-print"><i class="pi pi-spin pi-spinner" /> Memuat resep...</div>
    <Message v-else-if="error" severity="error" icon="pi pi-exclamation-circle" class="no-print">{{ error }}</Message>

    <!-- Kertas -->
    <article v-else-if="header" class="kertas">
      <header class="kop">
        <img v-if="auth.logo" :src="auth.logo" alt="" class="kop__logo" />
        <div class="kop__text">
          <strong class="kop__nama">{{ auth.company || 'KLINIK' }}</strong>
          <span v-if="auth.alamat" class="kop__alamat">{{ auth.alamat }}</span>
        </div>
      </header>

      <h1 class="judul">Struk Pengambilan Obat<small>Resep {{ trans }}</small></h1>

      <dl class="data">
        <div v-if="noRm" class="data__row"><dt>No. RM</dt><dd class="mono strong">{{ noRm }}</dd></div>
        <div v-if="namaPasien" class="data__row"><dt>Nama</dt><dd class="strong">{{ namaPasien }}</dd></div>
        <div v-if="jenisKelamin || umur" class="data__row">
          <dt>JK / Usia</dt>
          <dd>{{ [jenisKelamin, umur].filter(Boolean).join(' · ') }}</dd>
        </div>
        <div v-if="poli" class="data__row"><dt>Poli</dt><dd>{{ poli }}</dd></div>
        <div v-if="dokter" class="data__row"><dt>Dokter</dt><dd>{{ dokter }}</dd></div>
        <div class="data__row"><dt>Tanggal</dt><dd>{{ formatTanggal(header.TANGGAL) || header.TANGGAL }}</dd></div>
      </dl>

      <div class="garis-tebal" />

      <div class="items">
        <div v-for="(it, i) in itemsTampil" :key="i" class="item">
          <div class="item__row1">
            <span class="item__nama">{{ it.nama }}</span>
            <span class="item__qty mono">{{ it.qty }} {{ it.satuan }}</span>
          </div>
          <div class="item__row2">
            <span v-if="it.signa" class="item__signa">S. {{ it.signa }}</span>
            <span v-else class="item__signa item__signa--kosong">—</span>
            <span class="item__harga mono">{{ rupiah.format(it.harga) }} × {{ it.qty }} = {{ rupiah.format(it.subtotal) }}</span>
          </div>
        </div>
        <p v-if="!itemsTampil.length" class="kosong">Tidak ada item pada resep ini.</p>
      </div>

      <div class="garis-putus" />

      <div class="total-row total-row--grand">
        <span>Total</span>
        <span class="mono">{{ rupiah.format(grandTotal) }}</span>
      </div>

      <p class="catatan">Obat sudah diperiksa saat penyerahan. Simpan struk ini sebagai bukti pengambilan.</p>

      <footer class="kaki">
        <span>Petugas: {{ auth.user?.name || header.NAMAUSER || '-' }}</span>
        <span>Dicetak {{ dicetak }}</span>
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
.toolbar__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--app-text-muted);
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
  width: 80mm;
  padding: 4mm;
  font-size: 9pt;
  max-width: 100%;
}

.kop {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.5mm;
  padding-bottom: 2.5mm;
  border-bottom: 1.5px solid var(--ink);
}
.kop__logo {
  width: 12mm;
  height: 12mm;
  object-fit: contain;
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
  font-size: 1.05em;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.judul small {
  display: block;
  font-size: 0.75em;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink-muted);
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
  margin: 2.5mm 0;
}
.garis-putus {
  width: 100%;
  border-top: 0.5px dashed var(--rule);
  margin: 2.5mm 0;
}

.items {
  display: grid;
  gap: 2mm;
}
.item {
  padding-bottom: 1.5mm;
  border-bottom: 0.5px dotted var(--rule);
}
.item:last-child {
  border-bottom: none;
}
.item__row1 {
  display: flex;
  justify-content: space-between;
  gap: 2mm;
  font-weight: 700;
}
.item__row2 {
  display: flex;
  justify-content: space-between;
  gap: 2mm;
  margin-top: 0.5mm;
  font-size: 0.85em;
  color: var(--ink-muted);
}
.item__signa {
  font-style: italic;
}
.item__signa--kosong {
  visibility: hidden;
}
.item__harga {
  white-space: nowrap;
}
.kosong {
  text-align: center;
  color: var(--ink-muted);
  font-size: 0.9em;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.95em;
}
.total-row--grand {
  font-weight: 700;
  font-size: 1.15em;
}

.catatan {
  margin: 3mm 0 2mm;
  padding-top: 2mm;
  border-top: 0.5px dashed var(--rule);
  font-size: 0.8em;
  text-align: center;
}
.kaki {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5mm;
  font-size: 0.75em;
  color: var(--ink-muted);
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
    width: 100%;
  }
}
</style>
