<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getDetailPemesanan } from '@/services/pemesanan'

const route = useRoute()
const auth = useAuthStore()

const head = ref(null)
const details = ref([])
const grandTotal = ref(0)
const loading = ref(true)
const error = ref('')

// baris kosong agar tabel selalu terisi seperti formulir surat pesanan
const MIN_BARIS = 15
const barisKosong = computed(() => Math.max(0, MIN_BARIS - details.value.length))

// pratinjau layar diperkecil proporsional (rasio A4 tetap) bila jendela lebih sempit dari 210mm
const skala = ref(1)
function hitungSkala() {
  skala.value = Math.min(1, (window.innerWidth - 32) / (210 * 3.7795))
}

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
const tanggalPanjang = (tgl) => (tgl ? new Date(tgl).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')

// @page tidak bisa di-scope, disisipkan sebagai <style> — surat pesanan selalu A4
let pageStyle = null
function terapkanUkuranHalaman() {
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    document.head.appendChild(pageStyle)
  }
  pageStyle.textContent = '@page { size: A4 portrait; margin: 15mm; }'
}

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
    const detail = await getDetailPemesanan(String(route.params.id))
    head.value = detail.head
    details.value = detail.details
    grandTotal.value = detail.grand_total
    document.title = `Surat Pesanan ${head.value.no_sp}`
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
  if (!auth.noSipa) auth.muatHakAkses()
  hitungSkala()
  window.addEventListener('resize', hitungSkala)
  muat()
})
onBeforeUnmount(() => {
  pageStyle?.remove()
  window.removeEventListener('resize', hitungSkala)
})
</script>

<template>
  <div class="cetak">
    <div class="toolbar no-print">
      <div class="toolbar__right">
        <Button label="Tutup" severity="secondary" text size="small" @click="tutup" />
        <Button label="Cetak" icon="pi pi-print" size="small" :disabled="!head" @click="cetak" />
      </div>
    </div>

    <div v-if="loading" class="status no-print"><i class="pi pi-spin pi-spinner" /> Memuat surat pesanan…</div>
    <Message v-else-if="error" severity="error" icon="pi pi-exclamation-circle" class="no-print">{{ error }}</Message>

    <article v-else-if="head" class="kertas" :style="{ zoom: skala }">
      <header class="kop">
        <div class="kop__slot"><img v-if="auth.logo" :src="auth.logo" alt="" class="kop__logo" /></div>
        <div class="kop__text">
          <strong class="kop__nama">{{ auth.companyApotek || auth.company || 'APOTEK' }}</strong>
          <span v-if="auth.alamat" class="kop__alamat">{{ auth.alamat }}</span>
        </div>
        <div class="kop__slot"></div>
      </header>

      <h1 class="judul">Surat Pesanan Obat</h1>
      <p class="nomor">No : {{ head.no_sp }}</p>

      <section class="info">
        <table class="info__kiri">
          <tbody>
            <tr>
              <td>Apoteker</td>
              <td>: {{ auth.user?.name || '..........................' }}</td>
            </tr>
            <tr>
              <td>SIPA</td>
              <td>: {{ auth.noSipa || '..........................' }}</td>
            </tr>
            <tr v-if="head.no_referensi">
              <td>No. referensi</td>
              <td>: {{ head.no_referensi }}</td>
            </tr>
          </tbody>
        </table>
        <div class="info__kanan">
          <p>Kepada YTH</p>
          <p class="info__supplier">{{ head.nama_supplier }}</p>
          <p v-if="head.alamat_supplier" class="info__alamat">{{ head.alamat_supplier }}</p>
        </div>
      </section>

      <p class="pengantar">Bersama ini kami sampaikan pesanan sebagai berikut :</p>

      <table class="tabel">
        <thead>
          <tr>
            <th style="width: 7%">No</th>
            <th>Nama Barang</th>
            <th style="width: 16%">Qty</th>
            <th style="width: 16%">Satuan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, idx) in details" :key="d.id_detail_pemesanan">
            <td class="tengah">{{ idx + 1 }}</td>
            <td>{{ d.nama_barang }}</td>
            <td class="tengah">{{ d.qty_pesan }}</td>
            <td class="tengah">{{ d.satuan }}</td>
          </tr>
          <tr v-for="n in barisKosong" :key="'kosong-' + n">
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <p v-if="head.keterangan" class="keterangan">Keterangan: {{ head.keterangan }}</p>

      <section class="ttd">
        <div class="ttd__blok">
          <p>Nagan Raya, {{ tanggalPanjang(head.tanggal_sp) }}</p>
          <p>Apoteker Penanggung Jawab</p>
          <div class="ttd__ruang"></div>
          <p class="ttd__nama">{{ auth.user?.name || '( ___________________ )' }}</p>
          <p v-if="auth.noSipa" class="ttd__sub">SIPA: {{ auth.noSipa }}</p>
        </div>
      </section>
    </article>
  </div>
</template>

<style scoped>
.cetak {
  --ink: #111;
  width: 100%;
  max-width: 210mm;
  display: grid;
  gap: 1rem;
  justify-items: center;
}

.toolbar {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
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
  font-family: var(--app-font);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  width: 210mm;
  min-height: 297mm;
  max-width: 100%;
  padding: 15mm;
  font-size: 11pt;
}

.kop {
  display: grid;
  grid-template-columns: 40mm 1fr 40mm;
  align-items: center;
  gap: 4mm;
  padding-bottom: 2mm;
  border-bottom: 2px solid var(--ink);
  text-align: center;
}
.kop__slot {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.kop__logo {
  width: 40mm;
  height: 18mm;
  object-position: left center;
  object-fit: contain;
}
.kop__text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  text-align: center;
  line-height: 1.3;
}
.kop__nama {
  font-size: 1.3em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.kop__alamat {
  white-space: pre-line;
  font-size: 0.8em;
}

.judul {
  margin: 8mm 0 0;
  font-size: 1.2em;
  text-align: center;
  text-transform: uppercase;
  text-decoration: underline;
}
.nomor {
  margin: 1mm 0 8mm;
  text-align: center;
  font-weight: 700;
}

.info {
  display: flex;
  justify-content: space-between;
  gap: 8mm;
  margin-bottom: 5mm;
}
.info__kiri td {
  padding: 0 3mm 0 0;
  vertical-align: top;
}
.info__kanan {
  min-width: 60mm;
}
.info__kanan p {
  margin: 0;
}
.info__supplier {
  font-weight: 700;
}
.info__alamat {
  font-size: 0.9em;
}

.pengantar {
  margin: 0 0 1mm;
}

.tabel {
  width: 100%;
  border-collapse: collapse;
}
.tabel th,
.tabel td {
  border: 1px solid var(--ink);
  padding: 0.8mm 2mm;
  text-align: left;
  height: 6mm;
}
.tabel th {
  text-align: center;
  font-weight: 700;
}
.tabel .tengah {
  text-align: center;
}

.keterangan {
  margin: 3mm 0 0;
  font-size: 0.9em;
}

.ttd {
  display: flex;
  justify-content: flex-end;
  margin-top: 8mm;
}
.ttd__blok {
  text-align: left;
  min-width: 70mm;
}
.ttd__blok p {
  margin: 0;
}
.ttd__ruang {
  height: 15mm;
}
.ttd__nama {
  text-decoration: underline;
}
.ttd__sub {
  font-size: 0.9em;
}

@media print {
  .tabel thead { display: table-header-group; }
  .tabel tr,
  .ttd { break-inside: avoid; }
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
    zoom: 1 !important;
    width: 100%;
    min-height: 0;
    padding: 0 !important;
  }
}
</style>
