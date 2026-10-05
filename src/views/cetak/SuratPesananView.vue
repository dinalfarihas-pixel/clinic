<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
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
  muat()
})
onBeforeUnmount(() => pageStyle?.remove())
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

    <article v-else-if="head" class="kertas">
      <header class="kop">
        <img v-if="auth.logo" :src="auth.logo" alt="" class="kop__logo" />
        <div class="kop__text">
          <strong class="kop__nama">{{ auth.company || 'KLINIK' }}</strong>
          <span v-if="auth.alamat" class="kop__alamat">{{ auth.alamat }}</span>
        </div>
      </header>

      <h1 class="judul">Surat Pesanan Obat</h1>
      <div class="ringkas">
        <span>No. {{ head.no_sp }}</span>
        <span>{{ tanggalPanjang(head.tanggal_sp) }}</span>
      </div>

      <section class="tujuan">
        <p class="tujuan__label">Kepada Yth.</p>
        <p class="tujuan__nama">{{ head.nama_supplier }}</p>
        <p v-if="head.alamat_supplier" class="tujuan__alamat">{{ head.alamat_supplier }}</p>
      </section>

      <p class="pengantar">Dengan ini kami memesan barang dengan rincian sebagai berikut:</p>

      <table class="tabel">
        <thead>
          <tr>
            <th style="width: 3%">No.</th>
            <th style="width: 37%">Nama barang</th>
            <th style="width: 10%">Qty</th>
            <th style="width: 12%">Satuan</th>
            <th style="width: 18%">Harga satuan</th>
            <th style="width: 20%">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, idx) in details" :key="d.id_detail_pemesanan">
            <td>{{ idx + 1 }}</td>
            <td>{{ d.nama_barang }}</td>
            <td>{{ d.qty_pesan }}</td>
            <td>{{ d.satuan }}</td>
            <td>{{ rupiah.format(d.harga_satuan) }}</td>
            <td>{{ rupiah.format(d.total_harga) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" class="tabel__total-label">Grand total</td>
            <td class="tabel__total">{{ rupiah.format(grandTotal) }}</td>
          </tr>
        </tfoot>
      </table>

      <p v-if="head.keterangan" class="keterangan">Keterangan: {{ head.keterangan }}</p>
      <p v-if="head.no_referensi" class="keterangan">No. referensi: {{ head.no_referensi }}</p>

      <section class="ttd">
        <div class="ttd__blok">
          <p>Hormat kami,</p>
          <div class="ttd__ruang"></div>
          <p class="ttd__nama">{{ head.nama_pj || '( ___________________ )' }}</p>
          <p v-if="head.no_sipa" class="ttd__sub">No. SIPA: {{ head.no_sipa }}</p>
        </div>
      </section>
    </article>
  </div>
</template>

<style scoped>
.cetak {
  --ink: #111;
  --ink-muted: #555;
  --rule: #999;
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
  font-family: Arial, Helvetica, sans-serif;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  width: 210mm;
  min-height: 297mm;
  max-width: 100%;
  padding: 15mm;
  font-size: 10.5pt;
}

.kop {
  display: flex;
  align-items: center;
  gap: 4mm;
  padding-bottom: 3mm;
  border-bottom: 2px solid var(--ink);
}
.kop__logo {
  width: 18mm;
  height: 18mm;
  object-fit: contain;
}
.kop__text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.kop__nama {
  font-size: 1.3em;
  text-transform: uppercase;
}
.kop__alamat {
  font-size: 0.85em;
  color: var(--ink-muted);
}

.judul {
  margin: 5mm 0 1mm;
  font-size: 1.15em;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-decoration: underline;
}
.ringkas {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5mm;
  font-size: 0.9em;
  color: var(--ink-muted);
}

.tujuan {
  margin-bottom: 4mm;
}
.tujuan p {
  margin: 0;
}
.tujuan__label {
  color: var(--ink-muted);
}
.tujuan__nama {
  font-weight: 700;
}

.pengantar {
  margin: 0 0 3mm;
}

.tabel {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}
.tabel th,
.tabel td {
  border: 1px solid var(--rule);
  padding: 1.5mm 2mm;
  text-align: left;
}
.tabel th {
  background: #f3f4f6;
}
.tabel__total-label {
  text-align: right;
  font-weight: 700;
}
.tabel__total {
  font-weight: 700;
}

.keterangan {
  margin: 3mm 0 0;
  font-size: 0.9em;
  color: var(--ink-muted);
}

.ttd {
  display: flex;
  justify-content: flex-end;
  margin-top: 12mm;
}
.ttd__blok {
  text-align: center;
  min-width: 55mm;
}
.ttd__blok p {
  margin: 0;
}
.ttd__ruang {
  height: 18mm;
}
.ttd__nama {
  font-weight: 700;
  text-decoration: underline;
}
.ttd__sub {
  font-size: 0.85em;
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
    width: 100%;
    min-height: 0;
    padding: 0 !important;
  }
}
</style>
