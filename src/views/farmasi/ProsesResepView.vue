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
const racikanInduk = ref([])
const obatList = ref([])
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
    const [daftarObat, detail] = await Promise.all([
      getDaftarObat(),
      getDetailResep(trans, { tanggal: route.query.tanggal, nomr: route.query.nomr, noregister: route.query.noregister })
    ])
    obatList.value = daftarObat
    obatByBarcode.value = new Map(daftarObat.map((o) => [o.IDBARANG, o]))
    header.value = detail.header
    items.value = detail.items.map(petakanItem)
    racikanInduk.value = detail.racikan
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

// ── Racikan ──────────────────────────────────────────────────
// Bahan racikan yang diketik bebas oleh dokter tersimpan dengan barcode 00000 (tanpa stok).
// Supaya bisa diberikan & memotong stok, apoteker mencocokkannya dengan sediaan di apotek:
// BARCODE/NAMABARANG diganti sediaan terpilih, ketikan dokter tetap ada di BARCODE_REQ/NAMABARANG_REQ.
const BARCODE_BEBAS = '00000'
const isBebas = (item) => String(item.BARCODE ?? '').trim() === BARCODE_BEBAS
const isDicocokkan = (item) => String(item.BARCODE_REQ ?? '').trim() === BARCODE_BEBAS && !isBebas(item)
const jumlahBelumCocok = computed(() => items.value.filter(isBebas).length)

// Baris tabel: judul racikan disisipkan di atas bahan-bahannya (urut ITEMSEQNO). Bahan = baris
// ber-JENIS_R kosong sesudah induk, sampai bertemu item resep biasa (JENIS_R 'R/') berikutnya.
const barisTampil = computed(() => {
  const semua = [
    ...racikanInduk.value.map((data) => ({ induk: true, data })),
    ...items.value.map((data) => ({ induk: false, data }))
  ].sort((a, b) => Number(a.data.ITEMSEQNO) - Number(b.data.ITEMSEQNO))
  let induk = null
  return semua.map((baris) => {
    if (baris.induk) induk = baris.data
    else if (baris.data.JENIS_R) induk = null
    return { ...baris, racikan: baris.induk ? null : induk }
  })
})
const racikanDari = (item) => barisTampil.value.find((b) => b.data === item)?.racikan || null
const ringkasRacikan = (r) => [r.NAMABARANG, [r.QTY, r.MEREK].filter(Boolean).join(' ')].filter(Boolean).join(' · ')

const cocokDialog = ref({ visible: false, item: null, keyword: '', pilih: null })

function bukaCocokDialog(item) {
  // Kata kunci awal: kata pertama ketikan dokter (tanpa dosis), mis. "Ambroxol 30mg" -> "Ambroxol"
  const kata = String(item.NAMABARANG_REQ || item.NAMABARANG || '').match(/[A-Za-z]{3,}/)
  cocokDialog.value = { visible: true, item, keyword: kata ? kata[0] : '', pilih: null }
}

const sediaanCocok = computed(() => {
  const kata = cocokDialog.value.keyword.toLowerCase().split(/\s+/).filter(Boolean)
  if (!kata.length) return []
  return obatList.value
    .filter((o) => {
      const teks = `${o.NAMA || ''} ${o.GROUPING || ''} ${o.IDBARANG || ''}`.toLowerCase()
      return kata.every((k) => teks.includes(k))
    })
    .slice(0, 50)
})

function konfirmasiCocok() {
  const { item, pilih } = cocokDialog.value
  if (!item || !pilih) return
  item.BARCODE_REQ = BARCODE_BEBAS
  item.NAMABARANG_REQ = item.NAMABARANG_REQ || item.NAMABARANG
  item.BARCODE = pilih.IDBARANG
  item.NAMABARANG = pilih.NAMA
  item.MEREK = pilih.SATUAN_KECIL || ''
  // Batch lama (bila ada) milik sediaan sebelumnya; stoknya dikembalikan backend saat disimpan
  item._batch = null
  item.JSON_FILE = ''
  item.QTY = 0
  item.HARGA = 0
  item.HARGABELI = 0
  item.TOTALAMOUNT = 0
  item.CHANGING_ITEM = 1
  cocokDialog.value.visible = false
  bukaBatchDialog(item)
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
  // Bahan ketikan bebas tidak punya jumlah diminta: apoteker mengisi sendiri sesuai dosis racikan
  if (!(Number(batchDialog.value.item?.QTY_REQ) > 0)) {
    batchDialog.value.qty = null
    return
  }
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
    message:
      'Resep akan ditandai selesai. Item yang belum dipilih batchnya akan dianggap tidak diberikan.' +
      (jumlahBelumCocok.value ? ` Masih ada ${jumlahBelumCocok.value} bahan racikan yang belum dicocokkan dengan sediaan apotek.` : ''),
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
            <template v-for="{ induk, data: item, racikan } in barisTampil" :key="item.ITEMSEQNO">
              <!-- Judul racikan: bukan stok, hanya konteks untuk bahan di bawahnya -->
              <tr v-if="induk" class="racikan-hdr">
                <td :colspan="readOnly ? 7 : 8">
                  <i class="pi pi-list" />
                  <span class="strong">Racikan: {{ item.NAMABARANG }}</span>
                  <span v-if="item.QTY" class="racikan-hdr__qty">{{ item.QTY }} {{ item.MEREK }}</span>
                  <span v-if="item.REMARK_ITEM" class="racikan-hdr__pakai">Aturan pakai: {{ item.REMARK_ITEM }}</span>
                </td>
              </tr>
              <tr v-else :class="{ 'racikan-bahan': racikan }">
                <td>
                  <span class="strong">{{ item.NAMABARANG }}</span>
                  <Tag v-if="isBebas(item)" value="Belum dicocokkan" severity="warn" class="tag-cocok" />
                  <small v-if="item.NAMABARANG_REQ && item.NAMABARANG_REQ !== item.NAMABARANG" class="sub">
                    {{ isDicocokkan(item) ? 'Ketikan dokter' : 'Diminta' }}: {{ item.NAMABARANG_REQ }}
                  </small>
                  <small v-if="racikan && item.REMARK_ITEM" class="sub">Dosis: {{ item.REMARK_ITEM }}</small>
                </td>
                <td class="mono" style="text-align: center">
                  <template v-if="Number(item.QTY_REQ) > 0">{{ item.QTY_REQ }} {{ item.MEREK }}</template>
                  <template v-else>—</template>
                </td>
                <td class="mono strong" style="text-align: center">{{ item.QTY }}</td>
                <td>
                  <template v-if="item._batch">
                    <span class="mono">{{ item._batch.BATCH_NUMBER || '—' }}</span>
                    <small v-if="item._batch.TGL_EXPIRED" class="sub">Exp. {{ formatTanggal(item._batch.TGL_EXPIRED) }}</small>
                  </template>
                  <span v-else class="belum-dipilih">{{ isBebas(item) ? 'Cocokkan dulu' : 'Belum dipilih' }}</span>
                </td>
                <td class="mono" style="text-align: right">{{ item.HARGA ? rupiah.format(item.HARGA) : '—' }}</td>
                <td class="mono strong" style="text-align: right">{{ item.TOTALAMOUNT ? rupiah.format(item.TOTALAMOUNT) : '—' }}</td>
                <td style="text-align: center">
                  <Tag :value="Number(item.QTY_REQ) > 0 ? `${item.QTY}/${item.QTY_REQ}` : String(item.QTY)" :severity="statusItemSeverity(item)" />
                </td>
                <td v-if="!readOnly" style="text-align: center">
                  <div class="actions">
                    <Button v-if="isBebas(item)" label="Cocokkan" icon="pi pi-link" size="small" text @click="bukaCocokDialog(item)" />
                    <template v-else>
                      <Button :label="item._batch ? 'Ubah' : 'Pilih batch'" size="small" text @click="bukaBatchDialog(item)" />
                      <Button
                        v-if="isDicocokkan(item)"
                        icon="pi pi-link"
                        text
                        rounded
                        severity="secondary"
                        size="small"
                        aria-label="Ganti sediaan"
                        v-tooltip.top="'Ganti sediaan yang dicocokkan'"
                        @click="bukaCocokDialog(item)"
                      />
                    </template>
                    <Button icon="pi pi-trash" text rounded severity="danger" size="small" aria-label="Hapus item" v-tooltip.top="'Hapus item (refund)'" @click="bukaHapusItem(item)" />
                  </div>
                </td>
              </tr>
            </template>
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
        <strong>{{ batchDialog.item.NAMABARANG }}</strong>
        <template v-if="Number(batchDialog.item.QTY_REQ) > 0"> · diminta {{ batchDialog.item.QTY_REQ }} {{ batchDialog.item.MEREK }}</template>
        <template v-else> · jumlah tidak ditentukan dokter, isi sesuai kebutuhan racikan</template>
      </p>
      <p v-if="batchDialog.item && racikanDari(batchDialog.item)" class="dialog-sub">
        Racikan {{ ringkasRacikan(racikanDari(batchDialog.item)) }}<template v-if="batchDialog.item.REMARK_ITEM"> · dosis {{ batchDialog.item.REMARK_ITEM }}</template>
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

    <!-- Dialog cocokkan ketikan dokter dengan sediaan apotek -->
    <Dialog v-model:visible="cocokDialog.visible" header="Cocokkan dengan sediaan apotek" modal :style="{ width: '44rem', maxWidth: '96vw' }">
      <template v-if="cocokDialog.item">
        <div class="cocok-asal">
          <span class="cocok-asal__label">Ketikan dokter</span>
          <strong>{{ cocokDialog.item.NAMABARANG_REQ || cocokDialog.item.NAMABARANG }}</strong>
          <small v-if="racikanDari(cocokDialog.item)" class="sub">
            Racikan {{ ringkasRacikan(racikanDari(cocokDialog.item)) }}<template v-if="cocokDialog.item.REMARK_ITEM"> · dosis {{ cocokDialog.item.REMARK_ITEM }}</template>
          </small>
        </div>

        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="cocokDialog.keyword" placeholder="Cari nama sediaan, zat aktif, atau kode" aria-label="Cari sediaan" autofocus fluid />
        </IconField>

        <p v-if="!cocokDialog.keyword.trim()" class="empty">Ketik nama sediaan untuk mencari.</p>
        <p v-else-if="!sediaanCocok.length" class="empty">Tidak ada sediaan yang cocok. Coba kata kunci lain.</p>
        <div v-else class="cocok-list">
          <table class="batch-table">
            <thead>
              <tr>
                <th></th>
                <th>Sediaan</th>
                <th style="text-align: center">Stok</th>
                <th style="text-align: right">Harga jual</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in sediaanCocok"
                :key="o.IDBARANG"
                class="batch-row"
                :class="{ 'batch-row--selected': cocokDialog.pilih === o }"
                @click="cocokDialog.pilih = o"
              >
                <td><RadioButton :modelValue="cocokDialog.pilih" :value="o" @update:modelValue="cocokDialog.pilih = o" /></td>
                <td>
                  <span class="strong">{{ o.NAMA }}</span>
                  <small class="sub mono">{{ o.IDBARANG }}<template v-if="o.GROUPING"> · {{ o.GROUPING }}</template></small>
                </td>
                <td class="mono" style="text-align: center">{{ Number(o.TOTAL_STOCK) || 0 }} {{ o.SATUAN_KECIL }}</td>
                <td class="mono" style="text-align: right">{{ rupiah.format(o.HARGAJUAL || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined @click="cocokDialog.visible = false" />
        <Button label="Cocokkan & pilih batch" icon="pi pi-link" :disabled="!cocokDialog.pilih" @click="konfirmasiCocok" />
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
.racikan-hdr td {
  background: color-mix(in srgb, var(--p-primary-color) 6%, transparent);
}
.racikan-hdr i {
  margin-right: 0.375rem;
  color: var(--p-primary-color);
}
.racikan-hdr__qty,
.racikan-hdr__pakai {
  margin-left: 0.75rem;
  color: var(--app-text-muted);
}
.racikan-bahan td:first-child {
  padding-left: 1.75rem;
}
.tag-cocok {
  margin-left: 0.375rem;
  font-size: 0.6875rem;
}
.cocok-asal {
  margin-bottom: 0.875rem;
  padding: 0.625rem 0.75rem;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-radius);
}
.cocok-asal__label {
  display: block;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.cocok-list {
  max-height: 20rem;
  margin-top: 0.75rem;
  overflow-y: auto;
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
