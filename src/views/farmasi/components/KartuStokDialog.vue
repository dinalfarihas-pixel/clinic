<script setup>
import { ref, computed, watch } from 'vue'
import { getKartuStok } from '@/services/obat'
import { toYmd } from '@/utils/tanggal'

const props = defineProps({ obat: { type: Object, default: null } })
const visible = defineModel('visible', { type: Boolean, default: false })

const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

const awalBulan = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
const dariTgl = ref(awalBulan())
const sampaiTgl = ref(new Date())
const barang = ref(null)
const rows = ref([])
const loading = ref(false)
const error = ref('')

// JENIS_TRANS lama (SALES/REFUND) tetap dikenali agar histori lama tampil benar.
const MASUK = new Set(['IN', 'REFUND'])
const KELUAR = new Set(['OUT', 'SALES'])
const masuk = (r) => (MASUK.has(r.JENIS_TRANS) ? Math.abs(Number(r.QTY) || 0) : 0)
const keluar = (r) => (KELUAR.has(r.JENIS_TRANS) ? Math.abs(Number(r.QTY) || 0) : 0)

const totalMasuk = computed(() => rows.value.reduce((s, r) => s + masuk(r), 0))
const totalKeluar = computed(() => rows.value.reduce((s, r) => s + keluar(r), 0))
const saldoAkhir = computed(() => (rows.value.length ? Number(rows.value[rows.value.length - 1].SALDO) || 0 : null))
const satuan = computed(() => barang.value?.SATUAN_KECIL || props.obat?.SATUAN_KECIL || '')
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

const ringkasan = computed(() => [
  { label: 'Total masuk', value: angka.format(totalMasuk.value), icon: 'pi pi-arrow-down-left', tone: 'masuk' },
  { label: 'Total keluar', value: angka.format(totalKeluar.value), icon: 'pi pi-arrow-up-right', tone: 'keluar' },
  { label: 'Saldo akhir', value: saldoAkhir.value === null ? '—' : angka.format(saldoAkhir.value), icon: 'pi pi-box', tone: 'saldo' }
])

function tgl(v) {
  const d = new Date(String(v).replace(' ', 'T'))
  return isNaN(d) ? { hari: v, jam: '' } : {
    hari: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
    jam: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }
}

async function muat() {
  if (!props.obat || !dariTgl.value) return
  loading.value = true
  error.value = ''
  try {
    const hasil = await getKartuStok(props.obat.ID, toYmd(dariTgl.value), toYmd(sampaiTgl.value || dariTgl.value))
    rows.value = hasil.rows || []
    barang.value = hasil.barang || null
  } catch (err) {
    rows.value = []
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// Export CSV (dibuka Excel) — tanpa dependensi tambahan; BOM supaya karakter tampil benar.
function exportCsv() {
  const kolom = ['Tanggal', 'Keterangan', 'No. Referensi', 'Batch', 'Masuk', 'Keluar', 'Harga Satuan', 'Saldo', 'Saldo Batch', 'Lokasi']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const baris = rows.value.map((r) =>
    [r.TANGGAL_TRANS, r.CAPTION || r.JENIS_TRANS, r.REFF_NUMBER, r.SUB_BARCODE, masuk(r) || '', keluar(r) || '', r.HARGA_SATUAN, r.SALDO, r.SALDO_SUB, r.LOKASI].map(esc).join(',')
  )
  const BOM = String.fromCharCode(0xfeff)
  const isi = [kolom.map(esc).join(','), ...baris].join(String.fromCharCode(13, 10))
  const blob = new Blob([BOM + isi], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Kartu_Stok_${barang.value?.IDBARANG || props.obat?.IDBARANG || props.obat?.ID}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

watch(visible, (v) => {
  if (!v) return
  dariTgl.value = awalBulan()
  sampaiTgl.value = new Date()
  muat()
})
</script>

<template>
  <Dialog v-model:visible="visible" modal maximizable :style="{ width: '62rem', maxWidth: '96vw' }" :contentStyle="{ padding: '0 1.25rem 1.25rem' }">
    <template #header>
      <div class="kartu__head">
        <span class="kartu__icon"><i class="pi pi-book" /></span>
        <div>
          <h2 class="kartu__title">Kartu stok</h2>
          <p class="kartu__sub">Riwayat mutasi stok per batch · qty dalam satuan kecil</p>
        </div>
      </div>
    </template>

    <div class="kartu__info">
      <div class="kartu__info-item"><span>ID Barang</span><strong class="kartu__mono">{{ barang?.IDBARANG || obat?.IDBARANG || '-' }}</strong></div>
      <div class="kartu__info-item"><span>Nama</span><strong>{{ barang?.NAMA || obat?.NAMA || '-' }}</strong></div>
      <div class="kartu__info-item"><span>Kategori</span><strong>{{ barang?.KATEGORI || '-' }}</strong></div>
      <div class="kartu__info-item"><span>Satuan</span><strong>{{ satuan || '-' }}</strong></div>
      <div class="kartu__info-item"><span>Barcode</span><strong class="kartu__mono">{{ barang?.BARCODE || '-' }}</strong></div>
      <Tag v-if="obat?.is_below_minimum" value="Stok di bawah minimum" severity="danger" class="kartu__tag" />
    </div>

    <div class="kartu__ringkasan">
      <div v-for="r in ringkasan" :key="r.label" class="kartu__card" :class="`kartu__card--${r.tone}`">
        <i :class="r.icon" />
        <div>
          <p class="kartu__card-label">{{ r.label }}</p>
          <p class="kartu__card-value">{{ r.value }} <small v-if="satuan && r.value !== '—'">{{ satuan }}</small></p>
        </div>
      </div>
    </div>

    <div class="kartu__filter">
      <div class="kartu__field">
        <label for="kartu-dari">Dari tanggal</label>
        <DatePicker id="kartu-dari" v-model="dariTgl" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :disabled="loading" />
      </div>
      <div class="kartu__field">
        <label for="kartu-sampai">Sampai tanggal</label>
        <DatePicker id="kartu-sampai" v-model="sampaiTgl" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :disabled="loading" />
      </div>
      <Button icon="pi pi-search" label="Tampilkan" size="small" :loading="loading" @click="muat" />
      <Button icon="pi pi-file-excel" severity="success" outlined size="small" :disabled="loading || !rows.length" v-tooltip.top="'Export (CSV, dibuka di Excel)'" @click="exportCsv" />
      <span class="kartu__count">{{ rows.length }} transaksi</span>
    </div>

    <Message v-if="error" severity="error" size="small" class="kartu__error">{{ error }}</Message>

    <DataTable :value="rows" :loading="loading" size="small" stripedRows scrollable scrollHeight="48vh" paginator :rows="20" class="kartu__table">
      <template #empty>
        <div class="kartu__empty">
          <i class="pi pi-inbox" />
          <p>Tidak ada pergerakan stok pada periode ini.</p>
        </div>
      </template>
      <Column header="#" style="width: 3rem">
        <template #body="{ index }"><span class="kartu__jam">{{ index + 1 }}</span></template>
      </Column>
      <Column header="Tanggal" style="min-width: 9rem">
        <template #body="{ data }">
          <div class="kartu__tgl">{{ tgl(data.TANGGAL_TRANS).hari }}</div>
          <div class="kartu__jam">{{ tgl(data.TANGGAL_TRANS).jam }}</div>
        </template>
      </Column>
      <Column header="Keterangan" style="min-width: 15rem">
        <template #body="{ data }">
          <Tag :value="masuk(data) ? 'Masuk' : keluar(data) ? 'Keluar' : data.JENIS_TRANS" :severity="masuk(data) ? 'success' : keluar(data) ? 'danger' : 'secondary'" class="kartu__tag" />
          <span class="kartu__caption">{{ data.CAPTION }}</span>
        </template>
      </Column>
      <Column header="Referensi" style="min-width: 9rem">
        <template #body="{ data }"><span class="kartu__mono">{{ data.REFF_NUMBER || '—' }}</span></template>
      </Column>
      <Column header="Batch" style="min-width: 8rem">
        <template #body="{ data }"><span class="kartu__mono">{{ data.SUB_BARCODE || '—' }}</span></template>
      </Column>
      <Column header="Masuk" headerClass="kartu__num" bodyClass="kartu__num" style="min-width: 6rem">
        <template #body="{ data }"><span v-if="masuk(data)" class="kartu__plus">+{{ angka.format(masuk(data)) }}</span></template>
      </Column>
      <Column header="Keluar" headerClass="kartu__num" bodyClass="kartu__num" style="min-width: 6rem">
        <template #body="{ data }"><span v-if="keluar(data)" class="kartu__minus">−{{ angka.format(keluar(data)) }}</span></template>
      </Column>
      <Column header="Harga satuan" headerClass="kartu__num" bodyClass="kartu__num" style="min-width: 8rem">
        <template #body="{ data }">{{ data.HARGA_SATUAN != null ? rupiah.format(data.HARGA_SATUAN) : '—' }}</template>
      </Column>
      <Column header="Saldo" headerClass="kartu__num" bodyClass="kartu__num" style="min-width: 6rem">
        <template #body="{ data }"><strong>{{ angka.format(Number(data.SALDO) || 0) }}</strong></template>
      </Column>
      <Column header="Saldo batch" headerClass="kartu__num" bodyClass="kartu__num" style="min-width: 7rem">
        <template #body="{ data }">{{ data.SALDO_SUB != null ? angka.format(Number(data.SALDO_SUB)) : '—' }}</template>
      </Column>
      <Column header="Lokasi" style="min-width: 8rem">
        <template #body="{ data }">{{ data.LOKASI || '—' }}</template>
      </Column>
    </DataTable>
  </Dialog>
</template>

<style scoped>
.kartu__head { display: flex; align-items: center; gap: 0.75rem; }
.kartu__icon {
  display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 0.625rem;
  background: var(--p-primary-50); color: var(--p-primary-color); font-size: 1.125rem;
}
.kartu__title { margin: 0; font-size: 1.125rem; font-weight: 600; }
.kartu__sub { margin: 0.125rem 0 0; font-size: 0.8125rem; color: var(--p-text-muted-color); }
.kartu__sub strong { color: var(--p-text-color); }

.kartu__info {
  display: flex; align-items: center; flex-wrap: wrap; gap: 1.25rem; padding: 0.625rem 0.875rem; margin: 0.25rem 0 0.75rem;
  background: var(--p-surface-50, #f8fafc); border: 1px solid var(--app-border, var(--p-surface-200)); border-radius: 0.5rem;
}
.kartu__info-item { display: flex; flex-direction: column; gap: 0.0625rem; }
.kartu__info-item span { font-size: 0.625rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--p-text-muted-color); }
.kartu__info-item strong { font-size: 0.8125rem; font-weight: 600; }
.kartu__field { display: flex; flex-direction: column; gap: 0.25rem; }
.kartu__filter { align-items: flex-end !important; }
.kartu__ringkasan { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin: 0 0 1rem; }
.kartu__card {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
  border: 1px solid var(--app-border, var(--p-surface-200)); border-radius: 0.75rem; background: var(--p-surface-0, #fff);
}
.kartu__card > i { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 50%; font-size: 1rem; }
.kartu__card--masuk > i { background: #dcfce7; color: #16a34a; }
.kartu__card--keluar > i { background: #fee2e2; color: #dc2626; }
.kartu__card--saldo > i { background: #e0f2fe; color: #0284c7; }
.kartu__card-label { margin: 0; font-size: 0.75rem; color: var(--p-text-muted-color); }
.kartu__card-value { margin: 0; font-size: 1.25rem; font-weight: 700; line-height: 1.3; }
.kartu__card-value small { font-size: 0.75rem; font-weight: 500; color: var(--p-text-muted-color); }

.kartu__filter { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.kartu__filter label { font-size: 0.8125rem; color: var(--p-text-muted-color); }
.kartu__count { margin-left: auto; font-size: 0.8125rem; color: var(--p-text-muted-color); }
.kartu__error { margin-bottom: 0.75rem; }

.kartu__tgl { font-weight: 500; }
.kartu__jam { font-size: 0.75rem; color: var(--p-text-muted-color); }
.kartu__tag { margin-right: 0.5rem; font-size: 0.6875rem; }
.kartu__caption { font-size: 0.875rem; }
.kartu__mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; }
.kartu__plus { color: #16a34a; font-weight: 600; }
.kartu__minus { color: #dc2626; font-weight: 600; }
.kartu__table :deep(.kartu__num) { text-align: right; justify-content: flex-end; }
.kartu__table :deep(th.kartu__num .p-datatable-column-header-content) { justify-content: flex-end; }

.kartu__empty { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2rem 1rem; color: var(--p-text-muted-color); }
.kartu__empty i { font-size: 1.75rem; }
.kartu__empty p { margin: 0; }

@media (max-width: 640px) {
  .kartu__ringkasan { grid-template-columns: 1fr; }
}
</style>
