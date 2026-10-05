<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getDetailResep, simpanProsesResep, refundItemResep } from '@/services/resep'
import { getDaftarObat, getDetailStok } from '@/services/obat'
import { getIdClient, getIdLokasi } from '@/services/session'
import { formatTanggal } from '@/utils/tanggal'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
const trans = route.params.trans
const isPreview = computed(() => route.query.preview === '1')

const loading = ref(true)
const saving = ref(false)
const header = ref(null)
const items = ref([])
const obatByBarcode = ref(new Map())

const isSelesai = computed(() => header.value?.STATUS_PROGRESS === 'C')
const readOnly = computed(() => isPreview.value || isSelesai.value)
const adaPerubahan = computed(() => items.value.some((i) => Number(i.CHANGING_ITEM) === 1))

function petakanItem(raw) {
  let batch = null
  if (raw.JSON_FILE) {
    try {
      const arr = JSON.parse(raw.JSON_FILE)
      if (Array.isArray(arr) && arr[0]) batch = arr[0]
    } catch {
      /* JSON_FILE lama/tidak valid, abaikan */
    }
  }
  return { ...raw, _batch: batch, CHANGING_ITEM: 0 }
}

async function muat() {
  loading.value = true
  try {
    const [obatList, detail] = await Promise.all([
      getDaftarObat(),
      getDetailResep(trans, { tanggal: route.query.tanggal, nomr: route.query.nomr, noregister: route.query.noregister })
    ])
    obatByBarcode.value = new Map(obatList.map((o) => [o.IDBARANG, o]))
    header.value = detail.header
    items.value = detail.items.map(petakanItem)
    if (!header.value) {
      toast.add({ severity: 'warn', summary: 'Resep tidak ditemukan', detail: trans, life: 5000 })
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat resep', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

const subtotalLive = computed(() => items.value.reduce((s, i) => s + (Number(i.TOTALAMOUNT) || 0), 0))
const grandTotalLive = computed(() => {
  const potongan = Number(header.value?.POTONGAN) || 0
  const pajak = Number(header.value?.TAXAMOUNT) || 0
  return subtotalLive.value - potongan + pajak
})

function statusItemSeverity(item) {
  const diberikan = Number(item.QTY) || 0
  const diminta = Number(item.QTY_REQ) || 0
  if (diberikan <= 0) return 'danger'
  if (diberikan < diminta) return 'warn'
  return 'success'
}

// ── Dialog pilih batch stok ────────────────────────────────────
const batchDialog = ref({ visible: false, item: null, loading: false, list: [], pilih: null, qty: null })

async function bukaBatchDialog(item) {
  batchDialog.value = { visible: true, item, loading: true, list: [], pilih: null, qty: null }
  const obat = obatByBarcode.value.get(item.BARCODE)
  if (!obat) {
    toast.add({ severity: 'error', summary: 'Obat tidak ditemukan', detail: `${item.NAMABARANG} (${item.BARCODE}) tidak terdaftar di master obat.`, life: 5000 })
    batchDialog.value.loading = false
    return
  }
  try {
    // barang_stock_detail mencari berdasarkan ID internal (numerik), bukan BARCODE/kode obat
    const rows = await getDetailStok(obat.ID)
    batchDialog.value.list = rows.filter((b) => !Number(b.ARSIPKAN) && Number(b.QTY) > 0)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat stok', detail: err.message, life: 5000 })
  } finally {
    batchDialog.value.loading = false
  }
}

function pilihBaris(row) {
  batchDialog.value.pilih = row
  const sisaDiminta = Math.max((Number(batchDialog.value.item?.QTY_REQ) || 0) - (Number(batchDialog.value.item?.QTY) || 0), 0)
  batchDialog.value.qty = Math.min(sisaDiminta || Number(row.QTY) || 1, Number(row.QTY) || 0) || null
}

function konfirmasiBatch() {
  const { item, pilih, qty } = batchDialog.value
  if (!pilih) return
  if (!qty || qty <= 0) {
    toast.add({ severity: 'warn', summary: 'Validasi', detail: 'Qty harus lebih dari 0', life: 3000 })
    return
  }
  if (qty > Number(pilih.QTY)) {
    toast.add({ severity: 'warn', summary: 'Validasi', detail: `Qty melebihi stok tersedia (${pilih.QTY})`, life: 3500 })
    return
  }

  const obat = obatByBarcode.value.get(item.BARCODE)
  const hargaJual = Number(pilih.HARGAJUAL) || Number(pilih.HARGA) || 0
  const hargaBeli = Number(pilih.HARGA) || 0

  // Satuan diambil dari master obat (SATUAN_KECIL), bukan MEREK bawaan baris resep — baris resep
  // sering kosong (mis. request lama tanpa satuan), sedangkan master obat selalu terisi.
  const satuan = obat?.SATUAN_KECIL || item.SATUAN || ''

  item._batch = { SUB_BARCODE: pilih.SUB_BARCODE, BATCH_NUMBER: pilih.BATCH_NUMBER, TGL_EXPIRED: pilih.TGL_EXPIRED, HARGA: hargaBeli, HARGAJUAL: hargaJual }
  item.QTY = qty
  item.HARGA = hargaJual
  item.HARGABELI = hargaBeli
  item.TOTALAMOUNT = qty * hargaJual
  item.MEREK = satuan
  item.JSON_FILE = JSON.stringify([
    {
      SUB_BARCODE: pilih.SUB_BARCODE || '',
      BARCODE: item.BARCODE || '',
      QTY_APROVED: qty,
      BATCH_NUMBER: pilih.BATCH_NUMBER || '',
      TGL_EXPIRED: pilih.TGL_EXPIRED || '',
      HARGA: hargaBeli, 
      HARGAJUAL: hargaJual,
      NAMA_ITEM_APPROVEVAL: item.NAMABARANG || '',
      SATUAN: satuan,
      COPY_R: 0,
      ITEM_SEQ: item.ITEMSEQNO,
      RECEIPT_NO: header.value?.RECEIPT_NO ?? ''
    }
  ])
  item.CHANGING_ITEM = 1
  batchDialog.value.visible = false
  toast.add({ severity: 'success', summary: 'Batch dipilih', detail: `${item.NAMABARANG} — qty ${qty}`, life: 3000 })
}

// ── Hapus item (refund) ────────────────────────────────────────
const delDialog = ref({ visible: false, item: null })
const deletingItem = ref(false)

function bukaHapusItem(item) {
  delDialog.value = { visible: true, item }
}
async function prosesHapusItem() {
  const item = delDialog.value.item
  if (!item) return
  deletingItem.value = true
  try {
    await refundItemResep({
      RECEIPT_NO: header.value.RECEIPT_NO,
      ITEMSEQNO: item.ITEMSEQNO,
      BARCODE: item.BARCODE,
      JSON_FILE: item.JSON_FILE || '',
      ID_LOKASI: getIdLokasi(),
      TANGGAL: header.value.TANGGAL
    })
    toast.add({ severity: 'success', summary: 'Item dihapus', detail: item.NAMABARANG, life: 3500 })
    delDialog.value.visible = false
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menghapus item', detail: err.message, life: 5000 })
  } finally {
    deletingItem.value = false
  }
}

// ── Simpan ───────────────────────────────────────────────────
function buildPayload(statusProgress) {
  const h = header.value
  return {
    header: {
      RECEIPT_NO: h.RECEIPT_NO,
      MEMBERSHIP_ID: h.MEMBERSHIP_ID,
      SALESNO: h.SALESNO ?? 0,
      IDUSER: h.IDUSER,
      TANGGAL: h.TANGGAL,
      IDPAYEMENT: h.IDPAYEMENT ?? 5,
      NOTE: h.NOTE,
      SUBTOTAL: subtotalLive.value,
      TAXPERCENT: Number(h.TAXPERCENT) || 0,
      TAXAMOUNT: Number(h.TAXAMOUNT) || 0,
      TOTALBAYAR: Number(h.TOTALBAYAR) || 0,
      POTONGAN: Number(h.POTONGAN) || 0,
      MODE: h.MODE ?? 'REG',
      IDCLIENT: getIdClient(),
      GRANDTOTAL: grandTotalLive.value,
      KEMBALIAN: Number(h.KEMBALIAN) || 0,
      ID_LOKASI: getIdLokasi(),
      ROOM_TABLE_NUMBER: h.ROOM_TABLE_NUMBER ?? 0,
      RESV_ID: h.RESV_ID ?? 0,
      NO_REGISTER: h.NOREGISTER,
      SERVER_ID: h.SERVER_ID ?? 0,
      POLI_RUANG: h.POLI_RUANG ?? route.query.poli ?? null,
      DPJP: h.DPJP ?? null,
      SERVER_NAME: h.SERVER_NAME ?? null,
      STATUS_PROGRESS: statusProgress,
      OBAT_OBATAN: h.OBAT_OBATAN ?? 1,
      TGL_SELESAI: h.TGL_SELESAI ?? '',
      JENIS_RESEP: h.JENIS_RESEP ?? null,
      CARAPAKAI_RACIK: h.CARAPAKAI_RACIK ?? null,
      JML_RACIK: h.JML_RACIK ?? 0,
      BENTUK_RACIK: h.BENTUK_RACIK ?? null,
      details: items.value.map((item) => ({
        ID_BARANG: item.BARCODE,
        BARCODE: item.BARCODE,
        BARCODE_REQ: item.BARCODE_REQ || item.BARCODE,
        SUB_BARCODE_APP: item._batch?.SUB_BARCODE ?? '',
        RECEIPT_NO: h.RECEIPT_NO,
        NAMA: item.NAMABARANG,
        NAMABARANG_REQ: item.NAMABARANG_REQ || item.NAMABARANG,
        JENIS: item.JENIS ?? null,
        QTY: Number(item.QTY) || 0,
        QTY_REQ: Number(item.QTY_REQ) || 0,
        QTY_COPY: Number(item.QTY_COPY) || 0,
        DISCOUNT: Number(item.DISCOUNT) || 0,
        HARGABELI: Number(item.HARGABELI) || 0,
        HARGA: Number(item.HARGA) || 0,
        EST_HARGA_COPY: Number(item.EST_HARGA_COPY) || 0,
        POTONGSTOCK: item.POTONGSTOCK ?? 0,
        TOTAL_ITEM: Number(item.TOTAL_ITEM) || 0,
        // Fallback ke satuan master obat bila baris resep ini belum pernah diisi (mis. belum
        // pernah dipilih batch-nya di sesi ini/sebelumnya).
        MEREK: item.MEREK   || '',
        SATUAN:item.SATUAN,
        TOTALAMOUNT: 0,
        FLAG: item.FLAG ?? 'EXISTING LINE',
        CHANGING_ITEM: item.CHANGING_ITEM ?? 0,
        TANGGAL_TRANS: item.TANGGAL_TRANS ?? h.TANGGAL,
        ITEMSEQNO: item.ITEMSEQNO,
        SUBITEMSEQNO: item.SUBITEMSEQNO ?? 0,
        STATUS: item.STATUS ?? '',
        REMARK_ITEM: item.REMARK_ITEM ?? '',
        AS_PARENT: item.AS_PARENT ?? 0,
        STATUS_PROGRESS: item.STATUS_PROGRESS ?? '',
        ID_LOKASI: getIdLokasi(),
        JSON_FILE: item.JSON_FILE ?? '',
        SAVED_ITEM: item.SAVED_ITEM ?? 1,
        KETERANGAN: item.KETERANGAN ?? ''
      }))
    }
  }
}

async function simpan(statusProgress) {
  saving.value = true
  try {
    await simpanProsesResep(buildPayload(statusProgress))
    toast.add({
      severity: 'success',
      summary: statusProgress === 'C' ? 'Resep selesai' : 'Tersimpan',
      detail: statusProgress === 'C' ? 'Resep ditandai selesai' : 'Perubahan disimpan, bisa dilanjutkan nanti',
      life: 3500
    })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

function simpanLanjutkanNanti() {
  if (!adaPerubahan.value) {
    toast.add({ severity: 'info', summary: 'Info', detail: 'Tidak ada perubahan untuk disimpan', life: 3000 })
    return
  }
  simpan('P')
}

function konfirmasiSelesaikan() {
  confirm.require({
    header: 'Selesaikan resep?',
    message: 'Resep akan ditandai selesai. Item yang belum dipilih batchnya akan dianggap tidak diberikan.',
    icon: 'pi pi-check-circle',
    acceptLabel: 'Selesaikan',
    rejectLabel: 'Batal',
    accept: () => simpan('C')
  })
}

function kembali() {
  router.push({ name: 'farmasi-resep' })
}

async function salinNoResep() {
  try {
    await navigator.clipboard.writeText(String(trans))
    toast.add({ severity: 'success', summary: 'Disalin', detail: trans, life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Gagal menyalin', life: 3000 })
  }
}

function cetakResep() {
  const url = router.resolve({
    name: 'cetak-resep',
    params: { trans },
    query: {
      tanggal: route.query.tanggal || header.value?.TANGGAL || '',
      nomr: route.query.nomr || '',
      noregister: route.query.noregister || header.value?.NOREGISTER || '',
      nama: route.query.nama || '',
      poli: route.query.poli || '',
      print: '1'
    }
  }).href
  window.open(url, '_blank')
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Proses resep{{ route.query.nama ? ' — ' + route.query.nama : '' }}</h1>
        <p class="page-subtitle">
          {{ route.query.nomr ? 'RM ' + route.query.nomr : '' }}<template v-if="route.query.poli"> · {{ route.query.poli }}</template
          ><template v-if="header?.TANGGAL"> · {{ formatTanggal(header.TANGGAL) }}</template>
        </p>
        <p class="no-resep">
          <span class="mono">{{ trans }}</span>
          <Button icon="pi pi-copy" text rounded size="small" severity="secondary" aria-label="Salin no. resep" v-tooltip.top="'Salin no. resep'" @click="salinNoResep" />
        </p>
      </div>
      <div class="header-actions">
        <Button label="Cetak Resep" icon="pi pi-print" severity="secondary" outlined :disabled="loading || !header" @click="cetakResep" />
        <Button label="Kembali" icon="pi pi-arrow-left" severity="secondary" outlined :disabled="saving" @click="kembali" />
      </div>
    </header>

    <p v-if="loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat resep...</p>

    <template v-else-if="!header">
      <Message severity="warn">Resep {{ trans }} tidak ditemukan.</Message>
    </template>

    <template v-else>
      <div class="status-row">
        <Tag :value="isSelesai ? 'Selesai' : 'Diproses'" :severity="isSelesai ? 'success' : 'warn'" />
        <span v-if="isPreview" class="preview-note"><i class="pi pi-eye" /> Mode lihat saja</span>
      </div>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">Item resep</h2>
        </header>

        <table class="items-table">
          <thead>
            <tr>
              <th style="min-width: 12rem">Nama obat</th>
              <th style="width: 7rem; text-align: center">Diminta</th>
              <th style="width: 7rem; text-align: center">Diberikan</th>
              <th style="min-width: 10rem">Batch dipilih</th>
              <th style="width: 9rem; text-align: right">Harga</th>
              <th style="width: 9rem; text-align: right">Subtotal</th>
              <th style="width: 6rem; text-align: center">Status</th>
              <th v-if="!readOnly" style="width: 8rem; text-align: center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.ITEMSEQNO">
              <td>
                <span class="strong">{{ item.NAMABARANG }}</span>
                <small v-if="item.NAMABARANG_REQ && item.NAMABARANG_REQ !== item.NAMABARANG" class="sub">Diminta: {{ item.NAMABARANG_REQ }}</small>
              </td>
              <td class="mono" style="text-align: center">{{ item.QTY_REQ }} {{ item.MEREK }}</td>
              <td class="mono strong" style="text-align: center">{{ item.QTY }}</td>
              <td>
                <template v-if="item._batch">
                  <span class="mono">{{ item._batch.BATCH_NUMBER || '—' }}</span>
                  <small v-if="item._batch.TGL_EXPIRED" class="sub">Exp. {{ formatTanggal(item._batch.TGL_EXPIRED) }}</small>
                </template>
                <span v-else class="belum-dipilih">Belum dipilih</span>
              </td>
              <td class="mono" style="text-align: right">{{ item.HARGA ? rupiah.format(item.HARGA) : '—' }}</td>
              <td class="mono strong" style="text-align: right">{{ item.TOTALAMOUNT ? rupiah.format(item.TOTALAMOUNT) : '—' }}</td>
              <td style="text-align: center">
                <Tag :value="`${item.QTY}/${item.QTY_REQ}`" :severity="statusItemSeverity(item)" />
              </td>
              <td v-if="!readOnly" style="text-align: center">
                <div class="actions">
                  <Button :label="item._batch ? 'Ubah' : 'Pilih batch'" size="small" text @click="bukaBatchDialog(item)" />
                  <Button icon="pi pi-trash" text rounded severity="danger" size="small" aria-label="Hapus item" v-tooltip.top="'Hapus item (refund)'" @click="bukaHapusItem(item)" />
                </div>
              </td>
            </tr>
            <tr v-if="!items.length">
              <td :colspan="readOnly ? 7 : 8" class="empty">Tidak ada item pada resep ini.</td>
            </tr>
          </tbody>
          <tfoot v-if="subtotalLive > 0">
            <tr>
              <td :colspan="readOnly ? 5 : 6" class="items-table__total-label">Grand total</td>
              <td class="items-table__total" colspan="2">{{ rupiah.format(grandTotalLive) }}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <footer v-if="!readOnly" class="form-actions">
        <Button label="Kembali" severity="secondary" outlined :disabled="saving" @click="kembali" />
        <Button label="Simpan (lanjutkan nanti)" severity="secondary" :loading="saving" @click="simpanLanjutkanNanti" />
        <Button label="Simpan & selesaikan" icon="pi pi-check" :loading="saving" @click="konfirmasiSelesaikan" />
      </footer>
    </template>

    <!-- Dialog pilih batch stok -->
    <Dialog v-model:visible="batchDialog.visible" header="Pilih batch stok" modal :style="{ width: '40rem', maxWidth: '96vw' }">
      <p v-if="batchDialog.item" class="dialog-sub">
        <strong>{{ batchDialog.item.NAMABARANG }}</strong> · diminta {{ batchDialog.item.QTY_REQ }} {{ batchDialog.item.MEREK }}
      </p>
      <p v-if="batchDialog.loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat stok...</p>
      <template v-else>
        <p v-if="!batchDialog.list.length" class="empty">Tidak ada stok tersedia untuk obat ini.</p>
        <table v-else class="batch-table">
          <thead>
            <tr>
              <th></th>
              <th>Batch</th>
              <th style="text-align: center">Stok</th>
              <th>Expired</th>
              <th style="text-align: right">Harga jual</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in batchDialog.list"
              :key="b.ID"
              class="batch-row"
              :class="{ 'batch-row--selected': batchDialog.pilih === b }"
              @click="pilihBaris(b)"
            >
              <td><RadioButton :modelValue="batchDialog.pilih" :value="b" @update:modelValue="pilihBaris(b)" /></td>
              <td class="mono">{{ b.BATCH_NUMBER || '—' }}</td>
              <td class="mono" style="text-align: center">{{ b.QTY }}</td>
              <td class="mono">{{ Number(b.USE_EXP) ? formatTanggal(b.TGL_EXPIRED) || '—' : '—' }}</td>
              <td class="mono" style="text-align: right">{{ rupiah.format(b.HARGAJUAL || 0) }}</td>
            </tr>
          </tbody>
        </table>

        <div v-if="batchDialog.pilih" class="field mt">
          <label for="batch-qty">Qty diberikan</label>
          <InputNumber id="batch-qty" v-model="batchDialog.qty" :min="0" :max="Number(batchDialog.pilih.QTY)" fluid />
        </div>
      </template>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined @click="batchDialog.visible = false" />
        <Button label="Pilih" icon="pi pi-check" :disabled="!batchDialog.pilih" @click="konfirmasiBatch" />
      </template>
    </Dialog>

    <!-- Konfirmasi hapus item -->
    <Dialog v-model:visible="delDialog.visible" header="Hapus item resep?" modal :closable="!deletingItem" :style="{ width: '26rem' }">
      <Message severity="warn" icon="pi pi-exclamation-triangle">
        Item <strong>{{ delDialog.item?.NAMABARANG }}</strong> akan dihapus dari resep ini. Stok yang sudah dipotong untuk item ini akan dikembalikan.
      </Message>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="deletingItem" @click="delDialog.visible = false" />
        <Button label="Ya, hapus" icon="pi pi-trash" severity="danger" :loading="deletingItem" @click="prosesHapusItem" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.preview-note {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.no-resep {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.items-table th {
  text-align: left;
  padding: 0.375rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
  white-space: nowrap;
}
.items-table td {
  padding: 0.375rem 0.5rem;
  vertical-align: middle;
  border-bottom: 1px solid var(--app-border);
}
.items-table__total-label {
  text-align: right;
  font-weight: 600;
  padding: 0.5rem;
}
.items-table__total {
  font-weight: 700;
  padding: 0.5rem;
  white-space: nowrap;
}
.strong {
  font-weight: 600;
}
.mono {
  font-variant-numeric: tabular-nums;
}
.sub {
  display: block;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.belum-dipilih {
  font-size: 0.8125rem;
  color: var(--p-orange-500, #f97316);
  font-style: italic;
}
.actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
}

.dialog-sub {
  margin: 0 0 0.875rem;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.batch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.batch-table th {
  text-align: left;
  padding: 0.375rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
}
.batch-row {
  cursor: pointer;
}
.batch-row td {
  padding: 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.batch-row:hover td {
  background: var(--p-surface-50, #f8fafc);
}
.batch-row--selected td {
  background: var(--p-primary-50);
}
:global(.app-dark) .batch-row--selected td {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}
.field {
  display: grid;
  gap: 0.375rem;
}
.field label {
  font-size: 0.875rem;
  font-weight: 600;
}
.mt {
  margin-top: 0.875rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}
@media (max-width: 575px) {
  .form-actions {
    flex-wrap: wrap;
  }
}
</style>
