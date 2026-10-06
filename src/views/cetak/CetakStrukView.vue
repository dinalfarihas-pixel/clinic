<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { angka, formatWaktu } from '@/utils/penjualan'

// Payload disimpan oleh bukaStruk() (utils/penjualan.js) lalu dibaca di tab baru ini.
const data = ref(null)
try {
  data.value = JSON.parse(sessionStorage.getItem('strukPenjualan') || 'null')
} catch {
  data.value = null
}

const FORMAT_KEY = 'klinik.cetak.struk.format'
const formatOptions = [
  { label: '80 mm', value: '80' },
  { label: '58 mm', value: '58' }
]
const format = ref(['80', '58'].includes(localStorage.getItem(FORMAT_KEY)) ? localStorage.getItem(FORMAT_KEY) : '80')

// @page tidak bisa di-scope, jadi disisipkan sebagai <style> sesuai format
let pageStyle = null
function terapkanUkuranHalaman() {
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    document.head.appendChild(pageStyle)
  }
  pageStyle.textContent = `@page { size: ${format.value}mm auto; margin: 2mm; }`
}
watch(format, (f) => {
  terapkanUkuranHalaman()
  try {
    localStorage.setItem(FORMAT_KEY, f)
  } catch {
    /* abaikan */
  }
})

const sisaLabel = computed(() => (data.value?.piutang ? 'Sisa piutang' : 'Kembalian'))
const sisaNilai = computed(() => (data.value?.piutang ? data.value.grandTotal : data.value?.kembalian))

const cetak = () => window.print()
const tutup = () => window.close()

onMounted(() => {
  terapkanUkuranHalaman()
  if (data.value) document.title = `Struk ${data.value.receiptNo}`
})
onBeforeUnmount(() => pageStyle?.remove())
</script>

<template>
  <div class="cetak">
    <div class="toolbar no-print">
      <SelectButton v-model="format" :options="formatOptions" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" />
      <div class="toolbar__right">
        <Button label="Tutup" severity="secondary" text size="small" @click="tutup" />
        <Button label="Cetak" icon="pi pi-print" size="small" :disabled="!data" @click="cetak" />
      </div>
    </div>

    <Message v-if="!data" severity="warn" class="no-print">Data struk tidak ditemukan. Buka dari Penjualan Langsung atau Riwayat Penjualan.</Message>

    <article v-else class="kertas" :class="`kertas--${format}`">
      <div class="tengah">
        <strong class="nama">{{ data.company || 'Apotek' }}</strong>
        <span v-if="data.alamat" class="alamat">{{ data.alamat }}</span>
      </div>
      <hr />
      <div class="baris"><span>No. Struk</span><span>{{ data.receiptNo }}</span></div>
      <div class="baris"><span>Tanggal</span><span>{{ formatWaktu(data.waktu) }}</span></div>
      <div class="baris"><span>Kasir</span><span>{{ data.kasir }}</span></div>
      <div v-if="data.pelanggan" class="baris"><span>Pelanggan</span><span>{{ data.pelanggan }}</span></div>
      <hr />
      <div v-for="(it, i) in data.items" :key="i" class="item">
        <div class="item__nama">{{ it.nama }}</div>
        <div class="baris">
          <span>
            {{ it.qty }}<template v-if="it.satuan"> {{ it.satuan }}</template><template v-if="it.harga"> x {{ angka.format(it.harga) }}</template><template v-if="it.diskon"> ({{ it.diskon }})</template>
          </span>
          <span>{{ angka.format(it.total) }}</span>
        </div>
      </div>
      <hr />
      <div class="baris"><span>Subtotal</span><span>{{ angka.format(data.subtotal) }}</span></div>
      <div v-if="data.potongan > 0" class="baris"><span>Potongan</span><span>-{{ angka.format(data.potongan) }}</span></div>
      <div class="baris tebal"><span>Grand Total</span><span>{{ angka.format(data.grandTotal) }}</span></div>
      <div class="baris"><span>{{ data.metode }}</span><span>{{ angka.format(data.totalBayar) }}</span></div>
      <div class="baris"><span>{{ sisaLabel }}</span><span>{{ angka.format(sisaNilai) }}</span></div>
      <template v-if="data.note">
        <hr />
        <div class="baris"><span>Catatan</span><span>{{ data.note }}</span></div>
      </template>
      <hr />
      <div class="tengah">Terima kasih atas kunjungan Anda</div>
    </article>
  </div>
</template>

<style scoped>
.cetak {
  --ink: #111;
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
.kertas {
  background: #fff;
  color: var(--ink);
  font-family: 'Courier New', monospace;
  font-size: 9pt;
  line-height: 1.35;
  padding: 3mm;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  max-width: 100%;
}
.kertas--80 {
  width: 80mm;
}
.kertas--58 {
  width: 58mm;
  font-size: 8pt;
}
.tengah {
  display: flex;
  flex-direction: column;
  text-align: center;
}
.nama {
  font-size: 1.15em;
  text-transform: uppercase;
}
.alamat {
  font-size: 0.85em;
}
hr {
  border: none;
  border-top: 1px dashed var(--ink);
  margin: 2mm 0;
}
.baris {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
}
.baris > span:last-child {
  text-align: right;
  white-space: nowrap;
}
.item {
  margin-bottom: 1.5mm;
}
.item__nama {
  font-weight: 700;
}
.tebal {
  font-weight: 700;
  font-size: 1.1em;
}

@media print {
  .kertas {
    box-shadow: none;
    padding: 0;
  }
}
</style>
