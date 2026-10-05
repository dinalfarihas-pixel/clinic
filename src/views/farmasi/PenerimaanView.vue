<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import {
  getSummaryPenerimaan,
  getDaftarPenerimaan,
  getDetailPenerimaan,
  batalPenerimaan,
  batalItemPenerimaan,
  JENIS_PENERIMAAN,
  severityPenerimaan
} from '@/services/penerimaan'
import { toYmd, formatTanggal } from '@/utils/tanggal'

const router = useRouter()
const toast = useToast()

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

// ── Ringkasan (minggu / bulan / tahun ini) ────────────────────
const summaryKosong = { jumlah: 0, total: 0 }
const summary = ref({ minggu_ini: summaryKosong, bulan_ini: summaryKosong, tahun_ini: summaryKosong })

async function muatSummary() {
  try {
    const res = await getSummaryPenerimaan()
    if (res) summary.value = res
  } catch {
    /* ringkasan opsional, gagal diam-diam */
  }
}

const ringkasan = computed(() => [
  { label: 'Minggu ini', icon: 'pi pi-calendar-clock', ...summary.value.minggu_ini },
  { label: 'Bulan ini', icon: 'pi pi-calendar', ...summary.value.bulan_ini },
  { label: 'Tahun ini', icon: 'pi pi-chart-bar', ...summary.value.tahun_ini }
])

// ── Daftar penerimaan (server-paginated) ──────────────────────
const daftar = ref([])
const totalRecords = ref(0)
const loading = ref(false)
const keyword = ref('')
const filterJenis = ref('semua')
const tglAwal = ref(null)
const tglAkhir = ref(null)
const page = ref(1)
const rowsPerPage = ref(20)

async function muatDaftar() {
  loading.value = true
  try {
    const { rows, total } = await getDaftarPenerimaan({
      search: keyword.value,
      jenis: filterJenis.value,
      tglAwal: toYmd(tglAwal.value) || '',
      tglAkhir: toYmd(tglAkhir.value) || '',
      page: page.value,
      limit: rowsPerPage.value
    })
    daftar.value = rows
    totalRecords.value = total
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat penerimaan', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

function cariSekarang() {
  page.value = 1
  muatDaftar()
}
function resetFilter() {
  keyword.value = ''
  filterJenis.value = 'semua'
  tglAwal.value = null
  tglAkhir.value = null
  page.value = 1
  muatDaftar()
}
function onPage(event) {
  page.value = event.page + 1
  rowsPerPage.value = event.rows
  muatDaftar()
}

function statusRendah(row) {
  return (row.status_label || '').toLowerCase()
}
function bisaTerima(row) {
  return row.type === 'sp' && ['dikirim', 'diterima'].includes(statusRendah(row))
}
function bisaDetail(row) {
  return row.type === 'direct' || (row.type === 'sp' && statusRendah(row) === 'selesai')
}
function bisaBatal(row) {
  return row.type === 'direct' && statusRendah(row) === 'selesai'
}

function bukaTambahLangsung() {
  router.push({ name: 'farmasi-penerimaan-langsung' })
}
function terimaBarang(row) {
  router.push({ name: 'farmasi-penerimaan-terima', params: { idPemesanan: row.id_pemesanan } })
}

// ── Detail dialog ──────────────────────────────────────────────
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref(null)
const detailRow = ref(null)

async function bukaDetail(row) {
  if (row.type === 'sp') return terimaBarang(row)
  detailVisible.value = true
  detailLoading.value = true
  detailData.value = null
  detailRow.value = row
  try {
    detailData.value = await getDetailPenerimaan(row.no_penerimaan)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat detail', detail: err.message, life: 5000 })
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

// ── Batalkan penerimaan (langsung) ────────────────────────────
const batalKonfirmasi = ref({ visible: false, row: null, keterangan: '' })
const batalLoading = ref(false)

function konfirmasiBatal(row) {
  batalKonfirmasi.value = { visible: true, row, keterangan: '' }
}
async function prosesBatal() {
  const row = batalKonfirmasi.value.row
  if (!row) return
  batalLoading.value = true
  try {
    await batalPenerimaan(row.no_penerimaan, batalKonfirmasi.value.keterangan)
    batalKonfirmasi.value.visible = false
    toast.add({ severity: 'success', summary: 'Penerimaan dibatalkan', detail: row.no_penerimaan, life: 3500 })
    await muatDaftar()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membatalkan', detail: err.message, life: 5000 })
  } finally {
    batalLoading.value = false
  }
}

// ── Batalkan satu item dalam detail ────────────────────────────
const batalItemDialog = ref({ visible: false, item: null, keterangan: '' })
const batalItemLoading = ref(null)

function bukaBatalItem(d) {
  batalItemDialog.value = { visible: true, item: d, keterangan: '' }
}
async function prosesBatalItem() {
  const d = batalItemDialog.value.item
  if (!d || !detailRow.value) return
  batalItemLoading.value = d.id_barang
  try {
    const { semuaItemBatal } = await batalItemPenerimaan(detailRow.value.no_penerimaan, d.id_barang, batalItemDialog.value.keterangan)
    batalItemDialog.value.visible = false
    toast.add({ severity: 'success', summary: 'Item dibatalkan', detail: d.nama_barang, life: 3500 })
    const idx = detailData.value?.details?.findIndex((x) => x.id_barang === d.id_barang)
    if (idx >= 0) detailData.value.details[idx] = { ...detailData.value.details[idx], is_batal: 1 }
    if (semuaItemBatal) {
      detailRow.value = { ...detailRow.value, is_batal: 1 }
      await muatDaftar()
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membatalkan item', detail: err.message, life: 5000 })
  } finally {
    batalItemLoading.value = null
  }
}

onMounted(() => {
  muatDaftar()
  muatSummary()
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Penerimaan barang</h1>
        <p class="page-subtitle">Terima barang dari surat pesanan atau langsung dari supplier.</p>
      </div>
      <Button label="Penerimaan langsung" icon="pi pi-plus" @click="bukaTambahLangsung" />
    </header>

    <section class="summary" aria-label="Ringkasan penerimaan">
      <div v-for="s in ringkasan" :key="s.label" class="summary__item">
        <i :class="s.icon" class="summary__icon" />
        <div>
          <p class="summary__value">{{ s.jumlah }} <span class="summary__unit">transaksi</span></p>
          <p class="summary__label">{{ s.label }}</p>
          <p class="summary__total">{{ rupiah.format(s.total || 0) }}</p>
        </div>
      </div>
    </section>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="No. SP, no. penerimaan, atau supplier" fluid @keydown.enter="cariSekarang" />
        </IconField>
        <Select v-model="filterJenis" :options="JENIS_PENERIMAAN" optionLabel="label" optionValue="value" style="min-width: 11rem" @change="cariSekarang" />
        <DatePicker v-model="tglAwal" placeholder="Dari tanggal" dateFormat="dd/mm/yy" showIcon iconDisplay="input" style="min-width: 10rem" @update:modelValue="cariSekarang" />
        <DatePicker v-model="tglAkhir" placeholder="Sampai tanggal" dateFormat="dd/mm/yy" showIcon iconDisplay="input" style="min-width: 10rem" @update:modelValue="cariSekarang" />
        <div class="toolbar__right">
          <Button label="Cari" icon="pi pi-search" :loading="loading" @click="cariSekarang" />
          <Button icon="pi pi-refresh" text rounded severity="secondary" v-tooltip.top="'Reset filter'" @click="resetFilter" />
        </div>
      </header>

      <DataTable
        :value="daftar"
        :loading="loading"
        size="small"
        stripedRows
        lazy
        paginator
        :rows="rowsPerPage"
        :totalRecords="totalRecords"
        :rowsPerPageOptions="[20, 50, 100]"
        scrollable
        @page="onPage"
      >
        <template #empty>
          <p class="empty">Belum ada penerimaan yang cocok dengan filter.</p>
        </template>

        <Column header="No. referensi" style="min-width: 11rem">
          <template #body="{ data }">
            <span class="mono strong">{{ data.type === 'sp' ? data.no_sp : data.no_penerimaan }}</span>
          </template>
        </Column>
        <Column header="Jenis" style="width: 8rem">
          <template #body="{ data }">
            <Tag :value="data.type === 'sp' ? 'Dari SP' : 'Langsung'" :severity="data.type === 'sp' ? 'info' : 'secondary'" />
          </template>
        </Column>
        <Column header="Supplier" style="min-width: 12rem">
          <template #body="{ data }">{{ data.nama_supplier }}</template>
        </Column>
        <Column header="Tanggal" style="min-width: 8rem">
          <template #body="{ data }">{{ formatTanggal(data.tanggal) }}</template>
        </Column>
        <Column header="Jml item" style="width: 6rem">
          <template #body="{ data }">{{ data.jumlah_penerimaan ?? '—' }}</template>
        </Column>
        <Column header="Grand total" style="min-width: 9rem">
          <template #body="{ data }">{{ data.grand_total ? rupiah.format(data.grand_total) : '—' }}</template>
        </Column>
        <Column header="Status" style="min-width: 9rem">
          <template #body="{ data }">
            <Tag
              :value="`${data.status_label}${data.persentase != null ? ' ' + Math.round(data.persentase) + '%' : ''}`"
              :severity="severityPenerimaan(data.status_label)"
            />
          </template>
        </Column>
        <Column header="Aksi" frozen alignFrozen="right" style="width: 9.5rem">
          <template #body="{ data }">
            <div class="actions">
              <Button
                v-if="bisaTerima(data)"
                label="Terima"
                icon="pi pi-arrow-down"
                size="small"
                severity="info"
                @click="terimaBarang(data)"
              />
              <Button
                v-if="bisaDetail(data)"
                icon="pi pi-eye"
                text
                rounded
                severity="secondary"
                size="small"
                :aria-label="`Detail ${data.no_penerimaan}`"
                v-tooltip.top="'Detail'"
                @click="bukaDetail(data)"
              />
              <Button
                v-if="bisaBatal(data)"
                icon="pi pi-times"
                text
                rounded
                severity="danger"
                size="small"
                :aria-label="`Batalkan ${data.no_penerimaan}`"
                v-tooltip.top="'Batalkan'"
                @click="konfirmasiBatal(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Dialog detail penerimaan -->
    <Dialog v-model:visible="detailVisible" modal :closable="!detailLoading" :style="{ width: '54rem', maxWidth: '96vw' }">
      <template #header>
        <div class="det-header">
          <span class="mono strong">{{ detailData?.header?.no_penerimaan ?? detailRow?.no_penerimaan }}</span>
          <Tag v-if="detailRow?.is_batal" value="Dibatalkan" severity="danger" />
        </div>
      </template>

      <p v-if="detailLoading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat detail penerimaan...</p>
      <template v-else-if="detailData">
        <Message v-if="detailRow?.is_batal" severity="warn" icon="pi pi-exclamation-triangle" class="mb">
          Penerimaan ini telah dibatalkan
          <template v-if="detailRow.nama_batalkan_oleh"> oleh <strong>{{ detailRow.nama_batalkan_oleh }}</strong></template>
          <template v-if="detailRow.tanggal_batal"> · {{ detailRow.tanggal_batal }}</template>
          <template v-if="detailRow.keterangan_batal || detailData?.header?.keterangan_batal">
            <br />Keterangan: <em>{{ detailRow.keterangan_batal || detailData.header.keterangan_batal }}</em>
          </template>
        </Message>

        <div class="det-stat-row">
          <div class="det-stat-card">
            <span class="det-stat-lbl">Tanggal</span>
            <span class="det-stat-val mono">{{ detailData.header?.tanggal_penerimaan || '—' }}</span>
          </div>
          <div class="det-stat-card">
            <span class="det-stat-lbl">No. faktur</span>
            <span class="det-stat-val mono">{{ detailData.header?.no_faktur || '—' }}</span>
          </div>
          <div class="det-stat-card">
            <span class="det-stat-lbl">Cara bayar</span>
            <span class="det-stat-val">{{ Number(detailData.header?.payment_id) === 1 ? 'Tunai' : 'Kredit' }}</span>
          </div>
          <div class="det-stat-card">
            <span class="det-stat-lbl">Status lunas</span>
            <Tag :value="Number(detailData.header?.status_lunas) === 1 ? 'Lunas' : 'Belum lunas'" :severity="Number(detailData.header?.status_lunas) === 1 ? 'success' : 'warn'" />
          </div>
        </div>

        <div class="det-info-grid">
          <div class="det-info-box">
            <div class="det-box-title">Supplier</div>
            <div class="det-kv"><span class="det-k">Nama</span><span class="det-v strong">{{ detailData.header?.nama_supplier || '—' }}</span></div>
            <div class="det-kv"><span class="det-k">No. telp</span><span class="det-v mono">{{ detailData.header?.no_telp || '—' }}</span></div>
            <div v-if="Number(detailData.header?.payment_id) !== 1" class="det-kv"><span class="det-k">Jatuh tempo</span><span class="det-v mono">{{ detailData.header?.jatuh_tempo || '—' }}</span></div>
          </div>
          <div class="det-info-box det-total-box">
            <div class="det-box-title">Ringkasan total</div>
            <div class="det-kv"><span class="det-k">Pajak</span><span class="det-v">{{ detailData.header?.PAJAK ?? '—' }}%</span></div>
            <div class="det-kv"><span class="det-k">Sub total</span><span class="det-v mono">{{ detailData.header?.SUB_TOTAL ? rupiah.format(detailData.header.SUB_TOTAL) : '—' }}</span></div>
            <div class="det-kv det-kv-grand"><span class="det-k">Grand total</span><span class="det-v mono grand">{{ detailData.header?.GRAND_TOTAL ? rupiah.format(detailData.header.GRAND_TOTAL) : '—' }}</span></div>
          </div>
        </div>

        <p class="det-box-title mt">Item diterima ({{ detailData.details?.length ?? 0 }})</p>
        <table class="det-table">
          <thead>
            <tr>
              <th>Nama barang</th>
              <th style="text-align: center">Qty</th>
              <th>Satuan</th>
              <th style="text-align: right">Harga satuan</th>
              <th style="text-align: right">Total</th>
              <th>No. batch</th>
              <th>Tgl. expired</th>
              <th v-if="!detailRow?.is_batal" style="text-align: center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in detailData.details" :key="d.id_barang" :class="{ 'row-batal': d.is_batal }">
              <td class="strong">{{ d.nama_barang }}</td>
              <td class="mono" style="text-align: center">{{ d.qty_diterima }}</td>
              <td>{{ d.satuan }}</td>
              <td class="mono" style="text-align: right">{{ d.harga_satuan ? rupiah.format(d.harga_satuan) : '—' }}</td>
              <td class="mono strong" style="text-align: right">{{ d.HARGA_TOTAL ? rupiah.format(d.HARGA_TOTAL) : '—' }}</td>
              <td class="mono">{{ d.no_batch || '—' }}</td>
              <td class="mono">{{ d.tgl_expired || '—' }}</td>
              <td v-if="!detailRow?.is_batal" style="text-align: center" class="no-strike">
                <span v-if="d.is_batal" class="dibatalkan-label">Dibatalkan</span>
                <Button
                  v-else
                  icon="pi pi-times"
                  text
                  rounded
                  severity="danger"
                  size="small"
                  v-tooltip.top="'Batal item'"
                  :loading="batalItemLoading === d.id_barang"
                  @click="bukaBatalItem(d)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </Dialog>

    <!-- Konfirmasi batalkan penerimaan -->
    <Dialog v-model:visible="batalKonfirmasi.visible" header="Batalkan penerimaan?" modal :closable="!batalLoading" :style="{ width: '28rem' }">
      <Message severity="warn" icon="pi pi-exclamation-triangle">
        Penerimaan <strong>{{ batalKonfirmasi.row?.no_penerimaan }}</strong> akan dibatalkan dan stok yang sudah masuk akan dikembalikan.
      </Message>
      <div class="field mt">
        <label for="batal-keterangan">Keterangan pembatalan <small>(opsional)</small></label>
        <Textarea id="batal-keterangan" v-model="batalKonfirmasi.keterangan" rows="2" autoResize fluid :disabled="batalLoading" />
      </div>
      <template #footer>
        <Button label="Kembali" severity="secondary" outlined :disabled="batalLoading" @click="batalKonfirmasi.visible = false" />
        <Button label="Ya, batalkan" icon="pi pi-times-circle" severity="danger" :loading="batalLoading" @click="prosesBatal" />
      </template>
    </Dialog>

    <!-- Konfirmasi batal item -->
    <Dialog v-model:visible="batalItemDialog.visible" header="Batalkan item penerimaan?" modal :closable="!batalItemLoading" :style="{ width: '28rem' }">
      <p>Item <strong>{{ batalItemDialog.item?.nama_barang }}</strong> akan dibatalkan dan stok dikembalikan. Tindakan ini tidak dapat diurungkan.</p>
      <div class="field mt">
        <label for="batal-item-keterangan">Keterangan pembatalan <small>(opsional)</small></label>
        <Textarea id="batal-item-keterangan" v-model="batalItemDialog.keterangan" rows="2" autoResize fluid :disabled="!!batalItemLoading" />
      </div>
      <template #footer>
        <Button label="Tidak" severity="secondary" outlined :disabled="!!batalItemLoading" @click="batalItemDialog.visible = false" />
        <Button label="Ya, batalkan item" icon="pi pi-times" severity="danger" :loading="!!batalItemLoading" @click="prosesBatalItem" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  flex-shrink: 0;
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
.summary__unit {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--app-text-muted);
}
.summary__label {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.summary__total {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  font-weight: 600;
}

.toolbar {
  flex-wrap: wrap;
}
.toolbar__search {
  flex: 1;
  min-width: 14rem;
  max-width: 20rem;
}
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
}
.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.strong {
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 0.125rem;
  justify-content: flex-end;
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.field {
  display: grid;
  gap: 0.375rem;
}
.field label small {
  font-weight: 400;
  color: var(--app-text-muted);
}
.mt {
  margin-top: 0.875rem;
}
.mb {
  margin-bottom: 0.875rem;
}

.det-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.det-stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.625rem;
  margin-bottom: 0.875rem;
}
.det-stat-card {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 0.625rem 0.75rem;
}
.det-stat-lbl {
  font-size: 0.6875rem;
  color: var(--app-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.det-stat-val {
  font-size: 0.8125rem;
  font-weight: 700;
}
.det-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.625rem;
  margin-bottom: 0.5rem;
}
.det-info-box {
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 0.75rem 0.875rem;
}
.det-total-box {
  background: var(--p-primary-50);
}
:global(.app-dark) .det-total-box {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}
.det-box-title {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-primary-color);
  margin: 0 0 0.5rem;
}
.det-box-title.mt {
  margin-top: 1rem;
}
.det-kv {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 0.375rem;
  padding: 0.1875rem 0;
  font-size: 0.8125rem;
}
.det-kv-grand {
  border-top: 1px solid var(--app-border);
  padding-top: 0.5rem;
  margin-top: 0.25rem;
}
.det-k {
  color: var(--app-text-muted);
}
.grand {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--p-primary-color);
}
.det-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.det-table th {
  text-align: left;
  padding: 0.4375rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
  white-space: nowrap;
}
.det-table td {
  padding: 0.4375rem 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.det-table tr.row-batal {
  opacity: 0.5;
}
.det-table tr.row-batal td:not(.no-strike) {
  text-decoration: line-through;
}
.dibatalkan-label {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--p-red-500);
}

@media (max-width: 768px) {
  .summary {
    grid-template-columns: 1fr;
  }
  .summary__item + .summary__item {
    border-left: 0;
    border-top: 1px solid var(--app-border);
  }
  .det-stat-row,
  .det-info-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 575px) {
  .toolbar__search {
    max-width: none;
  }
}
</style>
