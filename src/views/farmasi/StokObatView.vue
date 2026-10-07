<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  getInfoLokasi,
  getDaftarObat,
  simpanObat,
  updateObat,
  hapusObat,
  getDetailStok,
  tambahBatchObat,
  updateBatchHarga,
  getDaftarRak,
  tambahRak,
  updateBatchRak,
  tambahStokBatch,
  arsipkanObat,
  aktifkanObat,
  arsipkanBatch,
  aktifkanBatch,
  getIdObatAkanExpired,
  getKategoriObat,
  getKlasifikasiObat,
  getBentukSediaan,
  getRutePemberian,
  getGroupingObat,
  tambahGrouping,
  GOLONGAN_OBAT
} from '@/services/obat'
import { toYmd } from '@/utils/tanggal'
import KartuStokDialog from './components/KartuStokDialog.vue'

const toast = useToast()
const confirm = useConfirm()

const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

// ── Lokasi (hanya gudang induk yang boleh menambah obat baru) ──
const lokasi = ref(null)
const bisaTambah = computed(() => lokasi.value?.IS_GUDANG !== false)

// ── Master pendukung form (kategori, klasifikasi, sediaan, rute, grouping) ──
const kategoriList = ref([])
const klasifikasiList = ref([])
const sediaanList = ref([])
const ruteList = ref([])
const groupingList = ref([])
const rakList = ref([])
const rakOptions = computed(() => [
  { label: 'Otomatis (ikut batch terakhir)', value: null },
  ...rakList.value.map((r) => ({ label: r.NAMA_RAK ? `${r.KODE_RAK} — ${r.NAMA_RAK}` : r.KODE_RAK, value: r.ID }))
])
function labelRak(idRak, kodeRak, namaRak) {
  if (kodeRak) return namaRak ? `${kodeRak} — ${namaRak}` : kodeRak
  if (!idRak) return '—'
  return rakList.value.find((r) => r.ID === idRak)?.KODE_RAK || '—'
}

// ── Daftar obat ──────────────────────────────────────────────
const obat = ref([])
const loading = ref(false)
const keyword = ref('')

const namaKlasifikasi = (kode) => klasifikasiList.value.find((k) => k.kode === kode)?.nama || kode || '—'
const satuan = (o) => [o.SATUAN_KECIL, o.SATUAN_SEDANG, o.SATUAN_BESAR].filter(Boolean).join(' / ')

// ── Harga per tier satuan (kecil/sedang/besar) untuk tabel Detail Batch ──
// Sama pola dengan M_master_barang::resolve_harga_beli_tiers()/resolve_harga_jual_tiers()
// di backend (dipakai backend saat batch_update_harga) — dihitung ulang di client di sini
// supaya batch_stock_detail tidak perlu diubah cuma untuk tampilan tabel.
function hargaTiers(o) {
  const tiers = [{ key: 'KECIL', label: o.SATUAN_KECIL }]
  if (o.SATUAN_SEDANG) tiers.push({ key: 'SEDANG', label: o.SATUAN_SEDANG })
  if (o.SATUAN_BESAR) tiers.push({ key: 'BESAR', label: o.SATUAN_BESAR })
  return tiers
}
function faktorTier(o, key) {
  if (key === 'SEDANG') return Number(o.ISI_SEDANG_KE_KECIL) || 1
  if (key === 'BESAR') return (Number(o.ISI_SEDANG_KE_KECIL) || 1) * (Number(o.ISI_BESAR_KE_SEDANG) || 1)
  return 1
}
// Harga beli murni turunan matematis dari HARGA batch (basis kecil) x faktor konversi.
function hargaBeliTier(o, b, key) {
  return Math.round((Number(b.HARGA) || 0) * faktorTier(o, key))
}
// Harga jual KECIL selalu dari HARGAJUAL; SEDANG/BESAR pakai nilai literal tersimpan
// kalau ada (boleh non-proporsional/promo grosir), kosong = fallback proporsional dari KECIL.
function hargaJualTier(o, b, key) {
  if (key === 'KECIL') return Number(b.HARGAJUAL) || 0
  const override = key === 'SEDANG' ? b.HARGAJUAL_SEDANG : b.HARGAJUAL_BESAR
  if (override != null && override !== '') return Number(override)
  return Math.round((Number(b.HARGAJUAL) || 0) * faktorTier(o, key))
}
// Qty selalu tersimpan dalam satuan kecil — pecah jadi kombinasi satuan dari
// yang terbesar ke terkecil (mis. "9 Box 2 Strip"), sisa di satuan terkecil
// ikut ditampilkan kalau tidak habis dibagi (mis. "9 Box 2 Strip 5 Tablet").
function qtyBreakdown(o, qtyKecil) {
  const tiers = hargaTiers(o) // kecil -> besar
  const urutan = [...tiers].reverse() // besar -> kecil
  let sisa = Math.round((Number(qtyKecil) || 0) * 100) / 100
  const bagian = []
  urutan.forEach((t, idx) => {
    const isTerkecil = idx === urutan.length - 1
    if (isTerkecil) {
      const jumlah = Math.round(sisa * 100) / 100
      if (jumlah > 0) bagian.push(`${jumlah} ${t.label}`)
    } else {
      const faktor = faktorTier(o, t.key) || 1
      const jumlah = Math.floor(sisa / faktor)
      sisa -= jumlah * faktor
      if (jumlah > 0) bagian.push(`${jumlah} ${t.label}`)
    }
  })
  return bagian.length ? bagian.join(' ') : `0 ${tiers[0].label}`
}
// Qty satu batch (t_stock_barang.QTY, basis kecil).
function qtyDisplay(o, b) {
  return qtyBreakdown(o, b.QTY)
}
// Total persediaan obat (barang_list.TOTAL_STOCK, basis kecil) — dipakai di daftar utama.
function stokDisplay(o) {
  return qtyBreakdown(o, o.TOTAL_STOCK)
}

// ── Edit inline: harga jual per tier + no. batch + tgl expired ────
const editingBatchId = ref(null)
const editObat = ref(null)
const editForm = ref({ tiers: {}, noBatch: '', tglExpired: null })
const savingEdit = ref(false)

function marginDariHarga(modal, harga) {
  if (!modal || harga == null || harga === '') return null
  return Math.round(((Number(harga) - modal) / modal) * 10000) / 100
}
function hargaDariMargin(modal, margin) {
  if (!modal || margin == null || margin === '') return null
  return Math.round(modal * (1 + Number(margin) / 100))
}

function bukaEditBatch(o, b) {
  editObat.value = o
  editingBatchId.value = b.ID
  const tiers = {}
  hargaTiers(o).forEach((t) => {
    const modal = hargaBeliTier(o, b, t.key)
    const harga = hargaJualTier(o, b, t.key)
    tiers[t.key] = { modal, harga, margin: marginDariHarga(modal, harga) }
  })
  editForm.value = {
    tiers,
    noBatch: b.BATCH_NUMBER || '',
    tglExpired: b.TGL_EXPIRED ? new Date(b.TGL_EXPIRED) : null
  }
}

function batalEditBatch() {
  editingBatchId.value = null
  editObat.value = null
}

function onEditHargaInput(key) {
  const t = editForm.value.tiers[key]
  t.margin = marginDariHarga(t.modal, t.harga)
}
function onEditMarginInput(key) {
  const t = editForm.value.tiers[key]
  const h = hargaDariMargin(t.modal, t.margin)
  if (h != null) t.harga = h
}

async function simpanEditBatch() {
  const kecil = editForm.value.tiers.KECIL
  if (!kecil?.harga || kecil.harga <= 0) {
    toast.add({ severity: 'warn', summary: 'Validasi', detail: 'Harga jual (satuan kecil) wajib diisi, lebih dari 0', life: 3500 })
    return
  }
  savingEdit.value = true
  try {
    const id = editingBatchId.value
    const obatId = editObat.value.ID
    await updateBatchHarga(id, {
      hargaJualKecil: kecil.harga,
      hargaJualSedang: editForm.value.tiers.SEDANG ? (editForm.value.tiers.SEDANG.harga ?? null) : undefined,
      hargaJualBesar: editForm.value.tiers.BESAR ? (editForm.value.tiers.BESAR.harga ?? null) : undefined,
      noBatch: editForm.value.noBatch.trim(),
      tglExpired: editForm.value.tglExpired ? toYmd(editForm.value.tglExpired) : null
    })
    toast.add({ severity: 'success', summary: 'Batch diperbarui', life: 3000 })
    batalEditBatch()
    await muatBatch(obatId)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memperbarui batch', detail: err.message, life: 5000 })
  } finally {
    savingEdit.value = false
  }
}

// ── Detail batch/stok per obat (lazy-load saat baris di-expand) ──
const expandedRows = ref({})
const batchByItem = ref({}) // { [ID]: { loading, rows, error } }

async function muatBatch(id) {
  batchByItem.value = { ...batchByItem.value, [id]: { loading: true, rows: batchByItem.value[id]?.rows || [], error: '' } }
  try {
    const rows = await getDetailStok(id)
    batchByItem.value = { ...batchByItem.value, [id]: { loading: false, rows, error: '' } }
  } catch (err) {
    batchByItem.value = { ...batchByItem.value, [id]: { loading: false, rows: [], error: err.message } }
  }
}

async function onRowExpand(event) {
  const id = event.data.ID
  if (batchByItem.value[id]) return
  await muatBatch(id)
}

// ── Tambah batch stok baru (di luar alur Penerimaan) ──────────
const showTambahBatch = ref(false)
const savingBatch = ref(false)
const errorsBatch = ref({})
const batchObat = ref(null)

function satuanBatchOptions(o) {
  return o ? [o.SATUAN_KECIL, o.SATUAN_SEDANG, o.SATUAN_BESAR].filter(Boolean) : []
}

function emptyFormBatch() {
  return {
    qty: null,
    satuan: null,
    hargaBeli: null,
    hargaJualKecil: null,
    hargaJualSedang: null,
    hargaJualBesar: null,
    noBatch: '',
    tglExpired: null,
    idRak: null,
    catatan: ''
  }
}
const formBatch = ref(emptyFormBatch())

function bukaTambahBatch(o) {
  batchObat.value = o
  formBatch.value = { ...emptyFormBatch(), satuan: o.SATUAN_KECIL, hargaBeli: Number(o.HARGABELI) || null, hargaJualKecil: Number(o.HARGAJUAL) || null }
  errorsBatch.value = {}
  showTambahBatch.value = true
}

function clearErrorBatch(key) {
  if (errorsBatch.value[key]) errorsBatch.value = { ...errorsBatch.value, [key]: '' }
}

function validateBatch() {
  const f = formBatch.value
  const e = {}
  if (!f.qty || f.qty <= 0) e.qty = 'Qty wajib diisi, lebih dari 0'
  if (f.hargaBeli == null || f.hargaBeli < 0) e.hargaBeli = 'Harga beli wajib diisi'
  if (!f.hargaJualKecil || f.hargaJualKecil <= 0) e.hargaJualKecil = 'Harga jual wajib diisi, lebih dari 0'
  errorsBatch.value = e
  return Object.keys(e).length === 0
}

async function simpanBatch() {
  if (!validateBatch()) return
  savingBatch.value = true
  try {
    const f = formBatch.value
    const id = batchObat.value.ID
    await tambahBatchObat(id, {
      qty: f.qty,
      satuan: f.satuan,
      hargaBeli: f.hargaBeli,
      hargaJualKecil: f.hargaJualKecil,
      hargaJualSedang: f.hargaJualSedang,
      hargaJualBesar: f.hargaJualBesar,
      noBatch: f.noBatch.trim(),
      tglExpired: f.tglExpired ? toYmd(f.tglExpired) : null,
      idRak: f.idRak,
      catatan: f.catatan.trim()
    })
    toast.add({ severity: 'success', summary: 'Batch ditambahkan', detail: batchObat.value.NAMA, life: 3500 })
    showTambahBatch.value = false
    await Promise.all([muatBatch(id), muat()])
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menambah batch', detail: err.message, life: 5000 })
  } finally {
    savingBatch.value = false
  }
}

// ── Tambah stok ke batch yang sudah ada ──────────────────────
const showTambahStok = ref(false)
const savingStok = ref(false)
const errorStok = ref('')
const stokTarget = ref({ obat: null, batch: null })
const formStok = ref({ qty: null, satuan: null, catatan: '' })

function bukaTambahStok(o, b) {
  stokTarget.value = { obat: o, batch: b }
  formStok.value = { qty: null, satuan: o.SATUAN_KECIL, catatan: '' }
  errorStok.value = ''
  showTambahStok.value = true
}

async function simpanTambahStok() {
  const f = formStok.value
  if (!f.qty || f.qty <= 0) {
    errorStok.value = 'Qty wajib diisi, lebih dari 0'
    return
  }
  savingStok.value = true
  try {
    const { obat: o, batch: b } = stokTarget.value
    await tambahStokBatch(b.ID, { qty: f.qty, satuan: f.satuan, catatan: f.catatan.trim() })
    toast.add({ severity: 'success', summary: 'Stok ditambahkan', detail: o.NAMA, life: 3500 })
    showTambahStok.value = false
    await Promise.all([muatBatch(o.ID), muatObat()])
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menambah stok', detail: err.message, life: 5000 })
  } finally {
    savingStok.value = false
  }
}

// ── Tambah rak baru (dari dalam dialog Tambah Batch atau Set Rak) ──
const showTambahRak = ref(false)
const savingRak = ref(false)
const errorRak = ref('')
const formRak = ref({ kodeRak: '', namaRak: '' })
const rakCreateTarget = ref('batch') // 'batch' | 'setrak' — field mana yang diisi dgn rak baru

function bukaTambahRak(target = 'batch') {
  rakCreateTarget.value = target
  formRak.value = { kodeRak: '', namaRak: '' }
  errorRak.value = ''
  showTambahRak.value = true
}

async function simpanRak() {
  const kode = formRak.value.kodeRak.trim()
  if (!kode) {
    errorRak.value = 'Kode rak wajib diisi'
    return
  }
  savingRak.value = true
  try {
    const id = await tambahRak({ kodeRak: kode, namaRak: formRak.value.namaRak.trim() })
    rakList.value = await getDaftarRak()
    if (rakCreateTarget.value === 'setrak') setRak.value.idRak = id
    else formBatch.value.idRak = id
    showTambahRak.value = false
    toast.add({ severity: 'success', summary: 'Rak ditambahkan', detail: kode, life: 3000 })
  } catch (err) {
    errorRak.value = err.message
  } finally {
    savingRak.value = false
  }
}

// ── Set rak untuk batch yang sudah ada (aksi per baris di Detail Batch) ──
const showSetRak = ref(false)
const savingSetRak = ref(false)
const setRak = ref({ obatId: null, batch: null, idRak: null })

function bukaSetRak(obatId, batch) {
  setRak.value = { obatId, batch, idRak: batch.ID_RAK || null }
  showSetRak.value = true
}

async function simpanSetRak() {
  savingSetRak.value = true
  try {
    await updateBatchRak(setRak.value.batch.ID, setRak.value.idRak)
    toast.add({ severity: 'success', summary: 'Rak batch diperbarui', detail: setRak.value.batch.SUB_BARCODE, life: 3000 })
    showSetRak.value = false
    await muatBatch(setRak.value.obatId)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mengubah rak', detail: err.message, life: 5000 })
  } finally {
    savingSetRak.value = false
  }
}

function formatTanggal(tgl) {
  if (!tgl) return null
  const d = new Date(tgl)
  return isNaN(d) ? tgl : d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function kelasKedaluwarsa(tgl) {
  if (!tgl) return ''
  const hari = Math.ceil((new Date(tgl) - new Date()) / 86400000)
  if (hari <= 30) return 'expired--merah'
  if (hari <= 90) return 'expired--oranye'
  return ''
}

// ── Filter: status (server), akan expired (server → Set ID), di bawah minimum (client) ──
const statusFilter = ref('0')
const statusOptions = [
  { label: 'Aktif', value: '0' },
  { label: 'Diarsipkan', value: '1' },
  { label: 'Semua status', value: '' }
]
const expiredMonths = ref(0)
const expiredOptions = [
  { label: 'Semua expired', value: 0 },
  { label: 'Expired ≤ 1 bulan', value: 1 },
  { label: 'Expired ≤ 3 bulan', value: 3 },
  { label: 'Expired ≤ 6 bulan', value: 6 }
]
const expiredIds = ref(null) // Set ID obat, null = filter mati
const belowMin = ref(false)

async function onExpiredChange() {
  if (!expiredMonths.value) {
    expiredIds.value = null
    return
  }
  try {
    expiredIds.value = await getIdObatAkanExpired(expiredMonths.value)
  } catch (err) {
    expiredIds.value = null
    toast.add({ severity: 'error', summary: 'Gagal memuat filter expired', detail: err.message, life: 5000 })
  }
}

async function muatObat() {
  loading.value = true
  try {
    obat.value = await getDaftarObat(statusFilter.value)
    batchByItem.value = {}
    if (expiredMonths.value) await onExpiredChange()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat obat', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

const obatTampil = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return obat.value.filter(
    (o) =>
      (!q || [o.NAMA, o.IDBARANG, o.SATUAN_KECIL].some((v) => String(v ?? '').toLowerCase().includes(q))) &&
      (!belowMin.value || o.is_below_minimum) &&
      (!expiredIds.value || expiredIds.value.has(Number(o.ID)))
  )
})

// ── Ringkasan header ───────────────────────────────────────────
const totalPersediaan = computed(() => obatTampil.value.reduce((sum, o) => sum + (Number(o.TOTAL_PERSEDIAAN) || 0), 0))
const ringkasan = computed(() => [
  { label: 'Total barang', icon: 'pi pi-box', value: obat.value.length },
  { label: 'Ditampilkan', icon: 'pi pi-eye', value: obatTampil.value.length },
  { label: 'Total persediaan', icon: 'pi pi-wallet', value: rupiah.format(totalPersediaan.value) }
])

async function muat() {
  loading.value = true
  const hasil = await Promise.allSettled([
    getInfoLokasi(),
    getDaftarObat(statusFilter.value),
    getKategoriObat(),
    getKlasifikasiObat(),
    getBentukSediaan(),
    getRutePemberian(),
    getGroupingObat(),
    getDaftarRak()
  ])
  const [l, o, kat, kls, sed, rute, grp, rak] = hasil
  if (l.status === 'fulfilled') lokasi.value = l.value
  else toast.add({ severity: 'error', summary: 'Gagal memuat info lokasi', detail: l.reason?.message, life: 5000 })
  if (o.status === 'fulfilled') obat.value = o.value
  else toast.add({ severity: 'error', summary: 'Gagal memuat obat', detail: o.reason?.message, life: 5000 })
  if (kat.status === 'fulfilled') kategoriList.value = kat.value
  if (kls.status === 'fulfilled') klasifikasiList.value = kls.value
  if (sed.status === 'fulfilled') sediaanList.value = sed.value
  if (rute.status === 'fulfilled') ruteList.value = rute.value
  if (grp.status === 'fulfilled') groupingList.value = grp.value
  if (rak.status === 'fulfilled') rakList.value = rak.value
  loading.value = false
}

// ── Form tambah / edit obat ──────────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const errors = ref({})
// ID obat yang sedang diedit; null = tambah baru
const editId = ref(null)
const isEdit = computed(() => editId.value !== null)

const showGolongan = computed(() => {
  const k = form.value.klasifikasi
  return k?.ada_sub_golongan === '1' || k?.ada_sub_golongan === 1
})

function onKlasifikasiChange() {
  if (!showGolongan.value) form.value.GOLONGAN = null
  clearError('GOLONGAN')
}

function emptyForm() {
  return {
    NAMA: '',
    KATEGORI: kategoriList.value[0] || null,
    ISKRONIS: false,
    ISKONSINYASI: false,
    klasifikasi: klasifikasiList.value.find((k) => k.kode === 'UMUM') || klasifikasiList.value[0] || null,
    GOLONGAN: null,
    SATUAN_KECIL: '',
    SATUAN_SEDANG: '',
    ISI_SEDANG_KE_KECIL: null,
    SATUAN_BESAR: '',
    ISI_BESAR_KE_SEDANG: null,
    GROUPING: '',
    sediaanPilih: null,
    rutePilih: null,
    KANDUNGAN: null,
    SATUAN_KANDUNGAN: '',
    VOLUME_UOM_NAME: '',
    HARGABELI: 0,
    HARGAJUAL: 0,
    STOCKMINIMUM: 0,
    CATATAN: ''
  }
}
const form = ref(emptyForm())

function bukaForm() {
  editId.value = null
  form.value = emptyForm()
  errors.value = {}
  showForm.value = true
}

function bukaEdit(o) {
  editId.value = o.ID
  form.value = {
    NAMA: o.NAMA || '',
    KATEGORI: kategoriList.value.find((k) => k.NAMA_KATEGORI === o.KATEGORI) || kategoriList.value[0] || null,
    ISKRONIS: !!Number(o.ISKRONIS),
    ISKONSINYASI: !!Number(o.ISKONSINYASI),
    klasifikasi: klasifikasiList.value.find((k) => k.kode === o.KLASIFIKASI_OBAT) || klasifikasiList.value[0] || null,
    GOLONGAN: o.GOLONGAN || null,
    SATUAN_KECIL: o.SATUAN_KECIL || '',
    SATUAN_SEDANG: o.SATUAN_SEDANG || '',
    ISI_SEDANG_KE_KECIL: o.ISI_SEDANG_KE_KECIL || null,
    SATUAN_BESAR: o.SATUAN_BESAR || '',
    ISI_BESAR_KE_SEDANG: o.ISI_BESAR_KE_SEDANG || null,
    GROUPING: o.GROUPING || '',
    sediaanPilih: sediaanList.value.find((s) => s.NAMA_SEDIAAN === o.BENTUK_SEDIAAN) || (o.BENTUK_SEDIAAN ? { NAMA_SEDIAAN: o.BENTUK_SEDIAAN, KODE_SEDIAAN: o.CODE_SEDIAAN || '' } : null),
    rutePilih: ruteList.value.find((r) => r.NAMA_RUTE === o.RUTE) || (o.RUTE ? { NAMA_RUTE: o.RUTE, KODE_RUTE: o.KODE_RUTE || '' } : null),
    KANDUNGAN: o.KANDUNGAN || null,
    SATUAN_KANDUNGAN: o.SATUAN_KANDUNGAN || '',
    VOLUME_UOM_NAME: o.VOLUME_UOM_NAME || '',
    HARGABELI: Number(o.HARGABELI) || 0,
    HARGAJUAL: Number(o.HARGAJUAL) || 0,
    STOCKMINIMUM: Number(o.STOCKMINIMUM) || 0,
    CATATAN: o.CATATAN || ''
  }
  errors.value = {}
  showForm.value = true
}

// ── Hapus ────────────────────────────────────────────────────
const deleting = ref(null) // ID yang sedang diproses

function konfirmasiHapus(o) {
  confirm.require({
    header: 'Hapus obat?',
    message: `Data obat "${o.NAMA}" akan dihapus dan tidak dapat dikembalikan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => hapus(o)
  })
}

async function hapus(o) {
  deleting.value = o.ID
  try {
    await hapusObat(o.ID)
    toast.add({ severity: 'success', summary: 'Obat dihapus', detail: o.NAMA, life: 3500 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menghapus', detail: err.message, life: 5000 })
  } finally {
    deleting.value = null
  }
}

// ── Arsip / aktifkan (obat & batch) + kartu stok ──────────────
const showKartu = ref(false)
const kartuObat = ref(null)
function bukaKartu(o) {
  kartuObat.value = o
  showKartu.value = true
}

// Satu Menu popup dipakai bareng semua baris (pola sama dengan ObatListView apotek).
const aksiMenuRef = ref(null)
const aksiMenuModel = ref([])
function toggleAksiMenu(event, items) {
  aksiMenuModel.value = items
  aksiMenuRef.value.toggle(event)
}
function obatAksiItems(o) {
  const diarsip = Number(o.ARSIPKAN) === 1
  return [
    { label: 'Kartu Stok', icon: 'pi pi-book', class: 'aksi-item-help', command: () => bukaKartu(o) },
    { label: 'Edit', icon: 'pi pi-pencil', class: 'aksi-item-warn', command: () => bukaEdit(o) },
    diarsip
      ? { label: 'Aktifkan', icon: 'pi pi-check-circle', class: 'aksi-item-success', command: () => konfirmasiArsip(o) }
      : { label: 'Arsipkan', icon: 'pi pi-inbox', class: 'aksi-item-warn', command: () => konfirmasiArsip(o) },
    { separator: true },
    { label: 'Hapus', icon: 'pi pi-trash', class: 'aksi-item-danger', command: () => konfirmasiHapus(o) }
  ]
}

function konfirmasiArsip(o) {
  const arsip = !Number(o.ARSIPKAN)
  confirm.require({
    header: arsip ? 'Arsipkan obat?' : 'Aktifkan obat?',
    message: arsip
      ? `"${o.NAMA}" tidak akan muncul di transaksi, tetapi riwayat tetap tersimpan.`
      : `"${o.NAMA}" akan kembali aktif.`,
    icon: 'pi pi-question-circle',
    acceptLabel: arsip ? 'Arsipkan' : 'Aktifkan',
    rejectLabel: 'Batal',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => ubahStatus(o.NAMA, () => (arsip ? arsipkanObat(o.ID) : aktifkanObat(o.ID)), arsip, muatObat)
  })
}

function konfirmasiArsipBatch(o, b) {
  const arsip = !Number(b.ARSIPKAN)
  confirm.require({
    header: arsip ? 'Arsipkan batch?' : 'Aktifkan batch?',
    message: `Batch ${b.BATCH_NUMBER || b.SUB_BARCODE} — ${o.NAMA}`,
    icon: 'pi pi-question-circle',
    acceptLabel: arsip ? 'Arsipkan' : 'Aktifkan',
    rejectLabel: 'Batal',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () =>
      ubahStatus(
        o.NAMA,
        () => (arsip ? arsipkanBatch(b.ID) : aktifkanBatch(b.ID)),
        arsip,
        async () => {
          await muatBatch(o.ID)
          obat.value = await getDaftarObat(statusFilter.value) // total stok ikut berubah
        }
      )
  })
}

async function ubahStatus(nama, aksi, arsip, sesudah) {
  try {
    await aksi()
    toast.add({ severity: 'success', summary: arsip ? 'Diarsipkan' : 'Diaktifkan', detail: nama, life: 3000 })
    await sesudah()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mengubah status', detail: err.message, life: 5000 })
  }
}

function clearError(key) {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: '' }
}

function validate() {
  const f = form.value
  const e = {}
  if (!f.NAMA.trim() || f.NAMA.trim().length < 2) e.NAMA = 'Nama obat wajib diisi, minimal 2 karakter'
  if (!f.KATEGORI) e.KATEGORI = 'Kategori wajib dipilih'
  if (!f.SATUAN_KECIL.trim()) e.SATUAN_KECIL = 'Satuan kecil wajib diisi'
  if (f.SATUAN_SEDANG.trim() && !f.ISI_SEDANG_KE_KECIL) e.ISI_SEDANG_KE_KECIL = 'Wajib diisi jika satuan sedang diisi'
  if (f.SATUAN_BESAR.trim() && !f.ISI_BESAR_KE_SEDANG) e.ISI_BESAR_KE_SEDANG = 'Wajib diisi jika satuan besar diisi'
  if (showGolongan.value && !f.GOLONGAN) e.GOLONGAN = 'Golongan wajib dipilih untuk klasifikasi ini'
  errors.value = e
  return Object.keys(e).length === 0
}

async function simpan() {
  if (!validate()) return
  saving.value = true
  try {
    const f = form.value
    const namaGroup = f.GROUPING.trim()
    if (namaGroup && !groupingList.value.some((g) => g.NAMA_GROUP === namaGroup)) {
      await tambahGrouping(namaGroup)
    }

    const payload = {
      NAMA: f.NAMA.trim(),
      SATUAN_KECIL: f.SATUAN_KECIL.trim(),
      SATUAN_SEDANG: f.SATUAN_SEDANG.trim(),
      ISI_SEDANG_KE_KECIL: f.ISI_SEDANG_KE_KECIL,
      SATUAN_BESAR: f.SATUAN_BESAR.trim(),
      ISI_BESAR_KE_SEDANG: f.ISI_BESAR_KE_SEDANG,
      GROUPING: namaGroup,
      BENTUK_SEDIAAN: f.sediaanPilih?.NAMA_SEDIAAN || '',
      CODE_SEDIAAN: f.sediaanPilih?.KODE_SEDIAAN || '',
      RUTE: f.rutePilih?.NAMA_RUTE || '',
      KODE_RUTE: f.rutePilih?.KODE_RUTE || '',
      KANDUNGAN: f.KANDUNGAN,
      SATUAN_KANDUNGAN: f.SATUAN_KANDUNGAN.trim(),
      VOLUME_UOM_NAME: f.VOLUME_UOM_NAME.trim(),
      HARGABELI: f.HARGABELI,
      HARGAJUAL: f.HARGAJUAL,
      STOCKMINIMUM: f.STOCKMINIMUM,
      ISKRONIS: f.ISKRONIS,
      ISKONSINYASI: f.ISKONSINYASI,
      klasifikasi: f.klasifikasi,
      GOLONGAN: f.GOLONGAN,
      CATATAN: f.CATATAN.trim()
    }
    if (isEdit.value) await updateObat(editId.value, payload)
    else await simpanObat(payload)

    toast.add({
      severity: 'success',
      summary: isEdit.value ? 'Obat diperbarui' : 'Obat ditambahkan',
      detail: f.NAMA,
      life: 3500
    })
    showForm.value = false
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Stok obat</h1>
        <p class="page-subtitle">Master data obat-obatan — nama, satuan, harga, dan batas stok minimum.</p>
      </div>
      <Button label="Tambah obat" icon="pi pi-plus" :disabled="!bisaTambah" v-tooltip.left="bisaTambah ? '' : 'Hanya lokasi gudang (induk) yang dapat menambah obat baru'" @click="bukaForm" />
    </header>

    <section class="summary" aria-label="Ringkasan stok obat">
      <div v-for="s in ringkasan" :key="s.label" class="summary__item">
        <i :class="s.icon" class="summary__icon" />
        <div>
          <p class="summary__label">{{ s.label }}</p>
          <p class="summary__value">{{ s.value }}</p>
        </div>
      </div>
    </section>

    <div v-if="lokasi && !bisaTambah" class="notice">
      <i class="pi pi-info-circle" />
      Lokasi <strong>{{ lokasi.LOKASI }}</strong> bukan gudang induk — hanya dapat melihat obat, penambahan data baru dilakukan dari lokasi gudang.
    </div>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari nama obat, kode, atau satuan" fluid />
        </IconField>
        <div class="toolbar__right">
          <Select v-model="statusFilter" :options="statusOptions" optionLabel="label" optionValue="value" size="small" @change="muatObat" />
          <Select v-model="expiredMonths" :options="expiredOptions" optionLabel="label" optionValue="value" size="small" @change="onExpiredChange" />
          <ToggleButton v-model="belowMin" onLabel="Stok minimum" offLabel="Stok minimum" onIcon="pi pi-exclamation-triangle" offIcon="pi pi-exclamation-triangle" size="small" />
          <span class="toolbar__count">{{ obatTampil.length }} obat</span>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" v-tooltip.top="'Muat ulang'" @click="muat" />
        </div>
      </header>

      <DataTable
        v-model:expandedRows="expandedRows"
        :value="obatTampil"
        :loading="loading"
        dataKey="ID"
        size="small"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 30, 50]"
        scrollable
        @row-expand="onRowExpand"
      >
        <template #empty>
          <p class="empty">{{ keyword ? 'Tidak ada obat yang cocok.' : 'Belum ada data obat.' }}</p>
        </template>
        <Column expander style="width: 2.5rem" />
        <Column header="No." style="width: 4rem">
          <template #body="{ index }">{{ index + 1 }}</template>
        </Column>
        <Column field="NAMA" header="Nama obat" sortable style="min-width: 14rem">
          <template #body="{ data }">
            <strong>{{ data.NAMA }}</strong>
            <div class="sub">{{ data.IDBARANG }}</div>
          </template>
        </Column>
        <Column header="Satuan" style="min-width: 9rem">
          <template #body="{ data }">{{ satuan(data) || '—' }}</template>
        </Column>
        <Column field="TOTAL_STOCK" header="Stok" sortable style="min-width: 9rem">
          <template #body="{ data }">
            <span class="mono">{{ stokDisplay(data) }}</span>
            <i v-if="data.is_below_minimum" class="pi pi-exclamation-triangle stok-kurang" v-tooltip.top="'Stok di bawah minimum'" />
          </template>
        </Column>
        <Column field="TOTAL_PERSEDIAAN" header="Total persediaan" sortable style="min-width: 10rem">
          <template #body="{ data }">
            <span class="mono">{{ rupiah.format(data.TOTAL_PERSEDIAAN || 0) }}</span>
          </template>
        </Column>
        <Column field="KLASIFIKASI_OBAT" header="Klasifikasi" style="min-width: 8rem">
          <template #body="{ data }">
            <Tag v-if="data.KLASIFIKASI_OBAT && data.KLASIFIKASI_OBAT !== 'UMUM'" :value="`${namaKlasifikasi(data.KLASIFIKASI_OBAT)}${data.GOLONGAN ? ' ' + data.GOLONGAN : ''}`" severity="warn" />
            <span v-else>—</span>
          </template>
        </Column>
        <Column header="Aksi" frozen alignFrozen="right" style="min-width: 6rem">
          <template #body="{ data }">
            <Button
              label="Aksi"
              icon="pi pi-chevron-down"
              iconPos="right"
              size="small"
              outlined
              severity="secondary"
              class="aksi-menu-btn"
              :loading="deleting === data.ID"
              @click="toggleAksiMenu($event, obatAksiItems(data))"
            />
          </template>
        </Column>

        <template #expansion="{ data }">
          <div class="batch">
            <div class="batch__header">
              <span class="batch__title">
                <i class="pi pi-list" />
                DETAIL BATCH — {{ data.NAMA }} <span class="batch__kode">({{ data.IDBARANG }})</span>
              </span>
              <Button label="Tambah Batch" icon="pi pi-plus" size="small" text @click="bukaTambahBatch(data)" />
            </div>

            <p v-if="batchByItem[data.ID]?.loading" class="batch__status">
              <i class="pi pi-spin pi-spinner" /> Memuat detail stok...
            </p>
            <p v-else-if="batchByItem[data.ID]?.error" class="batch__status batch__status--error">
              Gagal memuat detail stok: {{ batchByItem[data.ID].error }}
            </p>
            <p v-else-if="!batchByItem[data.ID]?.rows.length" class="batch__status">Belum ada batch/stok untuk obat ini di lokasi ini.</p>

            <div v-else class="batch__scroll">
            <table class="batch__table">
              <thead>
                <tr>
                  <th rowspan="2">Sub barcode</th>
                  <th rowspan="2">Qty</th>
                  <th :colspan="hargaTiers(data).length" class="batch__group batch__col-beli">Harga beli</th>
                  <th :colspan="hargaTiers(data).length" class="batch__group batch__col-jual">Harga jual</th>
                  <th rowspan="2">Batch / no. lot</th>
                  <th rowspan="2">Expired</th>
                  <th rowspan="2">Rak</th>
                  <th rowspan="2">Status</th>
                  <th rowspan="2">Aksi</th>
                </tr>
                <tr>
                  <th v-for="t in hargaTiers(data)" :key="`hb-${t.key}`" class="batch__subhead batch__col-beli">{{ t.label }}</th>
                  <th v-for="t in hargaTiers(data)" :key="`hj-${t.key}`" class="batch__subhead batch__col-jual">{{ t.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in batchByItem[data.ID].rows" :key="b.ID">
                  <td class="mono">{{ b.SUB_BARCODE || '—' }}</td>
                  <td class="mono">{{ qtyDisplay(data, b) }}</td>
                  <td v-for="t in hargaTiers(data)" :key="`vb-${t.key}`" class="mono batch__col-beli">{{ angka.format(hargaBeliTier(data, b, t.key)) }}</td>

                  <!-- Harga jual: tampilan biasa, atau form edit kalau baris ini sedang diedit -->
                  <template v-if="editingBatchId === b.ID">
                    <td v-for="t in hargaTiers(data)" :key="`ej-${t.key}`" class="batch__edit-cell batch__col-jual">
                      <div class="batch__edit-tier">
                        <InputNumber v-model="editForm.tiers[t.key].harga" :minFractionDigits="0" @update:modelValue="onEditHargaInput(t.key)" />
                        <InputNumber v-model="editForm.tiers[t.key].margin" suffix="%" :minFractionDigits="0" :maxFractionDigits="2" @update:modelValue="onEditMarginInput(t.key)" />
                      </div>
                      <small class="batch__modal">modal: {{ angka.format(editForm.tiers[t.key].modal) }}</small>
                    </td>
                  </template>
                  <template v-else>
                    <td v-for="t in hargaTiers(data)" :key="`vj-${t.key}`" class="mono batch__col-jual">{{ angka.format(hargaJualTier(data, b, t.key)) }}</td>
                  </template>

                  <td>
                    <InputText v-if="editingBatchId === b.ID" v-model="editForm.noBatch" fluid />
                    <template v-else>{{ b.BATCH_NUMBER || '—' }}</template>
                  </td>
                  <td :class="editingBatchId !== b.ID && Number(b.USE_EXP) ? kelasKedaluwarsa(b.TGL_EXPIRED) : ''">
                    <DatePicker v-if="editingBatchId === b.ID" v-model="editForm.tglExpired" dateFormat="dd/mm/yy" showIcon iconDisplay="input" showButtonBar fluid />
                    <template v-else>{{ Number(b.USE_EXP) ? formatTanggal(b.TGL_EXPIRED) || '—' : '—' }}</template>
                  </td>
                  <td>{{ labelRak(b.ID_RAK, b.KODE_RAK, b.NAMA_RAK) }}</td>
                  <td>
                    <Tag :value="Number(b.ARSIPKAN) ? 'Arsip' : 'Aktif'" :severity="Number(b.ARSIPKAN) ? 'secondary' : 'success'" />
                  </td>
                  <td>
                    <div v-if="editingBatchId === b.ID" class="actions">
                      <Button icon="pi pi-check" text rounded severity="success" size="small" :loading="savingEdit" :aria-label="`Simpan batch ${b.SUB_BARCODE}`" v-tooltip.top="'Simpan'" @click="simpanEditBatch" />
                      <Button icon="pi pi-times" text rounded severity="danger" size="small" :disabled="savingEdit" aria-label="Batal edit" v-tooltip.top="'Batal'" @click="batalEditBatch" />
                    </div>
                    <div v-else class="actions">
                      <Button
                        icon="pi pi-pencil"
                        text
                        rounded
                        severity="secondary"
                        size="small"
                        :aria-label="`Edit batch ${b.SUB_BARCODE}`"
                        v-tooltip.top="'Edit harga jual / batch / expired'"
                        @click="bukaEditBatch(data, b)"
                      />
                      <Button
                        icon="pi pi-plus-circle"
                        text
                        rounded
                        severity="secondary"
                        size="small"
                        :aria-label="`Tambah stok batch ${b.SUB_BARCODE}`"
                        v-tooltip.top="'Tambah stok'"
                        @click="bukaTambahStok(data, b)"
                      />
                      <Button
                        icon="pi pi-map-marker"
                        text
                        rounded
                        severity="secondary"
                        size="small"
                        :aria-label="`Set rak untuk batch ${b.SUB_BARCODE}`"
                        v-tooltip.top="'Set rak'"
                        @click="bukaSetRak(data.ID, b)"
                      />
                      <Button
                        :icon="Number(b.ARSIPKAN) ? 'pi pi-replay' : 'pi pi-inbox'"
                        text
                        rounded
                        severity="secondary"
                        size="small"
                        :aria-label="`${Number(b.ARSIPKAN) ? 'Aktifkan' : 'Arsipkan'} batch ${b.SUB_BARCODE}`"
                        v-tooltip.top="Number(b.ARSIPKAN) ? 'Aktifkan batch' : 'Arsipkan batch'"
                        @click="konfirmasiArsipBatch(data, b)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        </template>
      </DataTable>
    </section>

    <Menu ref="aksiMenuRef" :model="aksiMenuModel" popup class="aksi-menu" />
    <KartuStokDialog v-model:visible="showKartu" :obat="kartuObat" />

    <!-- Dialog tambah / edit obat -->
    <Dialog
      v-model:visible="showForm"
      :header="isEdit ? 'Edit obat' : 'Tambah obat baru'"
      modal
      maximizable
      :closable="!saving"
      :style="{ width: '54rem', maxWidth: '96vw' }"
      :contentStyle="{ padding: '1rem', overflowY: 'auto', maxHeight: '80vh' }"
    >
      <div class="modal-grid">
        <!-- ── FORM UTAMA ─────────────────────────────────────── -->
        <form class="form-main" @submit.prevent="simpan">
          <section class="section">
            <h3 class="section__title"><i class="pi pi-info-circle" /> Informasi dasar</h3>

            <div class="field field--full">
              <label for="o-nama">Nama obat <span class="req">*</span></label>
              <InputText
                id="o-nama"
                v-model="form.NAMA"
                placeholder="Contoh: Paracetamol 500mg"
                :invalid="!!errors.NAMA"
                maxlength="200"
                autofocus
                fluid
                @update:modelValue="clearError('NAMA')"
              />
              <small v-if="errors.NAMA" class="field__error">{{ errors.NAMA }}</small>
            </div>

            <div class="field field--full">
              <label for="o-kategori">Kategori <span class="req">*</span></label>
              <Select
                v-model="form.KATEGORI"
                inputId="o-kategori"
                :options="kategoriList"
                optionLabel="NAMA_KATEGORI"
                dataKey="NAMA_KATEGORI"
                placeholder="Pilih kategori..."
                :invalid="!!errors.KATEGORI"
                fluid
                @change="clearError('KATEGORI')"
              />
              <small v-if="errors.KATEGORI" class="field__error">{{ errors.KATEGORI }}</small>
            </div>

            <div class="field field--full">
              <label>Klasifikasi</label>
              <div class="checkbox-row">
                <div class="checkbox-item">
                  <Checkbox v-model="form.ISKRONIS" :binary="true" inputId="o-kronis" />
                  <label for="o-kronis">Kronis</label>
                </div>
                <div class="checkbox-item">
                  <Checkbox v-model="form.ISKONSINYASI" :binary="true" inputId="o-konsinyasi" />
                  <label for="o-konsinyasi">Konsinyasi</label>
                </div>
              </div>
            </div>

            <div class="field" :class="{ 'field--full': !showGolongan }">
              <label for="o-klasifikasi">Klasifikasi obat <span class="req">*</span></label>
              <Select
                v-model="form.klasifikasi"
                inputId="o-klasifikasi"
                :options="klasifikasiList"
                optionLabel="nama"
                dataKey="kode"
                placeholder="Pilih klasifikasi..."
                fluid
                @change="onKlasifikasiChange"
              />
            </div>
            <div v-if="showGolongan" class="field">
              <label for="o-golongan">Golongan <span class="req">*</span></label>
              <Select
                v-model="form.GOLONGAN"
                inputId="o-golongan"
                :options="GOLONGAN_OBAT"
                placeholder="Pilih golongan..."
                :invalid="!!errors.GOLONGAN"
                fluid
                @change="clearError('GOLONGAN')"
              />
              <small v-if="errors.GOLONGAN" class="field__error">{{ errors.GOLONGAN }}</small>
            </div>
          </section>

          <section class="section">
            <h3 class="section__title"><i class="pi pi-box" /> Satuan bertingkat</h3>

            <div class="field">
              <label for="o-satuan-kecil">Satuan kecil <span class="req">*</span></label>
              <InputText
                id="o-satuan-kecil"
                v-model="form.SATUAN_KECIL"
                placeholder="Tablet, Pcs..."
                :invalid="!!errors.SATUAN_KECIL"
                fluid
                @update:modelValue="clearError('SATUAN_KECIL')"
              />
              <small v-if="errors.SATUAN_KECIL" class="field__error">{{ errors.SATUAN_KECIL }}</small>
            </div>
            <div class="field">
              <label for="o-satuan-sedang">Satuan sedang <span class="opt">(opsional)</span></label>
              <InputText id="o-satuan-sedang" v-model="form.SATUAN_SEDANG" placeholder="Strip, Pack..." fluid />
            </div>
            <div class="field">
              <label for="o-satuan-besar">Satuan besar <span class="opt">(opsional)</span></label>
              <InputText id="o-satuan-besar" v-model="form.SATUAN_BESAR" placeholder="Box, Rim..." fluid />
            </div>

            <div class="field">
              <label for="o-isi-sedang">
                Isi sedang → kecil <span v-if="form.SATUAN_SEDANG" class="req">*</span><span v-else class="opt">(opsional)</span>
              </label>
              <InputNumber
                id="o-isi-sedang"
                v-model="form.ISI_SEDANG_KE_KECIL"
                :min="1"
                :invalid="!!errors.ISI_SEDANG_KE_KECIL"
                :disabled="!form.SATUAN_SEDANG.trim()"
                fluid
              />
              <small v-if="errors.ISI_SEDANG_KE_KECIL" class="field__error">{{ errors.ISI_SEDANG_KE_KECIL }}</small>
              <small v-else-if="form.SATUAN_SEDANG && form.SATUAN_KECIL" class="hint">1 {{ form.SATUAN_SEDANG }} = ? {{ form.SATUAN_KECIL }}</small>
            </div>
            <div class="field">
              <label for="o-isi-besar">
                Isi besar → sedang <span v-if="form.SATUAN_BESAR" class="req">*</span><span v-else class="opt">(opsional)</span>
              </label>
              <InputNumber
                id="o-isi-besar"
                v-model="form.ISI_BESAR_KE_SEDANG"
                :min="1"
                :invalid="!!errors.ISI_BESAR_KE_SEDANG"
                :disabled="!form.SATUAN_BESAR.trim()"
                fluid
              />
              <small v-if="errors.ISI_BESAR_KE_SEDANG" class="field__error">{{ errors.ISI_BESAR_KE_SEDANG }}</small>
              <small v-else-if="form.SATUAN_BESAR && (form.SATUAN_SEDANG || form.SATUAN_KECIL)" class="hint">
                1 {{ form.SATUAN_BESAR }} = ? {{ form.SATUAN_SEDANG || form.SATUAN_KECIL }}
              </small>
            </div>

            <div v-if="form.SATUAN_KECIL && form.SATUAN_SEDANG && form.ISI_SEDANG_KE_KECIL" class="field field--full konversi">
              <i class="pi pi-calculator" />
              1 {{ form.SATUAN_SEDANG }} = {{ form.ISI_SEDANG_KE_KECIL }} {{ form.SATUAN_KECIL }}
              <span v-if="form.SATUAN_BESAR && form.ISI_BESAR_KE_SEDANG">
                &nbsp;|&nbsp; 1 {{ form.SATUAN_BESAR }} = {{ form.ISI_BESAR_KE_SEDANG }} {{ form.SATUAN_SEDANG }} =
                {{ form.ISI_BESAR_KE_SEDANG * form.ISI_SEDANG_KE_KECIL }} {{ form.SATUAN_KECIL }}
              </span>
            </div>

            <div class="field">
              <label for="o-hargabeli">Harga beli</label>
              <InputNumber id="o-hargabeli" v-model="form.HARGABELI" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" fluid />
            </div>
            <div class="field">
              <label for="o-hargajual">Harga jual</label>
              <InputNumber id="o-hargajual" v-model="form.HARGAJUAL" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" fluid />
            </div>
          </section>

          <section class="section">
            <h3 class="section__title"><i class="pi pi-box" /> Informasi farmasi</h3>

            <div class="field field--full">
              <label for="o-grouping">Grouping / zat aktif</label>
              <Select
                v-model="form.GROUPING"
                inputId="o-grouping"
                :options="groupingList"
                optionLabel="NAMA_GROUP"
                optionValue="NAMA_GROUP"
                placeholder="Ketik atau pilih grouping..."
                editable
                filter
                fluid
              />
              <small v-if="form.GROUPING && !groupingList.some((g) => g.NAMA_GROUP === form.GROUPING)" class="hint hint--new">
                <i class="pi pi-plus-circle" /> Grouping baru — akan ditambahkan ke master saat disimpan
              </small>
            </div>

            <div class="field">
              <label for="o-sediaan">Bentuk sediaan</label>
              <Select
                v-model="form.sediaanPilih"
                inputId="o-sediaan"
                :options="sediaanList"
                optionLabel="NAMA_SEDIAAN"
                dataKey="NAMA_SEDIAAN"
                placeholder="Pilih bentuk sediaan..."
                filter
                showClear
                fluid
              />
            </div>
            <div class="field">
              <label for="o-rute">Rute pemberian</label>
              <Select
                v-model="form.rutePilih"
                inputId="o-rute"
                :options="ruteList"
                optionLabel="NAMA_RUTE"
                dataKey="NAMA_RUTE"
                placeholder="Pilih rute pemberian..."
                filter
                showClear
                fluid
              />
            </div>

            <div class="field">
              <label for="o-kandungan">Kandungan</label>
              <InputNumber id="o-kandungan" v-model="form.KANDUNGAN" :min="0" placeholder="500" fluid />
            </div>
            <div class="field">
              <label for="o-satuan-kandungan">Satuan kandungan</label>
              <InputText id="o-satuan-kandungan" v-model="form.SATUAN_KANDUNGAN" placeholder="mg, ml..." fluid />
            </div>
            <div class="field">
              <label for="o-volume-uom">Volume UOM</label>
              <InputText id="o-volume-uom" v-model="form.VOLUME_UOM_NAME" placeholder="mL, L..." fluid />
            </div>
          </section>

          <section class="section">
            <h3 class="section__title"><i class="pi pi-comment" /> Catatan</h3>

            <div class="field field--full">
              <label for="o-stokmin">Jumlah minimum stok</label>
              <div class="stokmin-row">
                <InputNumber id="o-stokmin" v-model="form.STOCKMINIMUM" :min="0" placeholder="0" style="max-width: 10rem" />
                <div class="stokmin-hint" :class="form.STOCKMINIMUM > 0 ? 'stokmin-hint--on' : 'stokmin-hint--off'">
                  <i :class="form.STOCKMINIMUM > 0 ? 'pi pi-check-circle' : 'pi pi-minus-circle'" />
                  <span v-if="form.STOCKMINIMUM > 0">Aktif — peringatan jika stok &lt; {{ form.STOCKMINIMUM }}</span>
                  <span v-else>Isi angka &gt; 0 untuk mengaktifkan</span>
                </div>
              </div>
            </div>

            <div class="field field--full">
              <label for="o-catatan">Catatan</label>
              <Textarea id="o-catatan" v-model="form.CATATAN" rows="3" maxlength="255" placeholder="Catatan tambahan (opsional)" fluid />
            </div>
          </section>

          <!-- tombol submit tersembunyi agar Enter menyimpan -->
          <button type="submit" hidden />
        </form>

        <!-- ── SIDEBAR ────────────────────────────────────────── -->
        <aside class="sidebar">
          <div class="info-card">
            <div class="info-card__title"><i class="pi pi-box" /> Obat</div>
            <hr />
            <div class="info-card__label">Wajib diisi:</div>
            <div class="info-card__item">• Nama</div>
            <div class="info-card__item">• Kategori</div>
            <div class="info-card__item">• Satuan kecil</div>
            <hr />
            <div class="info-card__label">Farmasi:</div>
            <div class="info-card__item">• Pilih atau tambah zat aktif (grouping), sediaan, dan rute dari dropdown</div>
          </div>
        </aside>
      </div>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showForm = false" />
        <Button :label="isEdit ? 'Simpan perubahan' : 'Simpan obat'" icon="pi pi-save" :loading="saving" @click="simpan" />
      </template>
    </Dialog>

    <!-- Dialog tambah batch stok baru (di luar alur Penerimaan) -->
    <Dialog
      v-model:visible="showTambahBatch"
      header="Tambah Batch Baru"
      modal
      :closable="!savingBatch"
      :style="{ width: '34rem', maxWidth: '96vw' }"
    >
      <p v-if="batchObat" class="batch-dialog-sub">
        <strong>{{ batchObat.NAMA }}</strong> ({{ batchObat.IDBARANG }}) — bikin batch (SUB_BARCODE) baru, tercatat langsung sebagai stok masuk tanpa supplier/faktur.
      </p>

      <form class="batch-form" @submit.prevent="simpanBatch">
        <div class="field">
          <label for="b-qty">Qty <span class="req">*</span></label>
          <InputNumber id="b-qty" v-model="formBatch.qty" :min="0" :invalid="!!errorsBatch.qty" fluid @update:modelValue="clearErrorBatch('qty')" />
          <small v-if="errorsBatch.qty" class="field__error">{{ errorsBatch.qty }}</small>
          <small v-else class="hint">Qty dalam satuan <strong>{{ formBatch.satuan || '—' }}</strong> (sesuai pilihan Satuan di samping)</small>
        </div>
        <div class="field">
          <label for="b-satuan">Satuan</label>
          <Select id="b-satuan" v-model="formBatch.satuan" :options="satuanBatchOptions(batchObat)" fluid />
        </div>

        <div class="field">
          <label for="b-harga-beli">Harga Beli <span class="req">*</span></label>
          <InputNumber id="b-harga-beli" v-model="formBatch.hargaBeli" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" :invalid="!!errorsBatch.hargaBeli" fluid @update:modelValue="clearErrorBatch('hargaBeli')" />
          <small v-if="errorsBatch.hargaBeli" class="field__error">{{ errorsBatch.hargaBeli }}</small>
          <small v-else class="hint">Harga beli per satuan <strong>{{ formBatch.satuan || '—' }}</strong></small>
        </div>
        <div class="field">
          <label for="b-jual-kecil">Harga Jual ({{ batchObat?.SATUAN_KECIL || 'Kecil' }}) <span class="req">*</span></label>
          <InputNumber id="b-jual-kecil" v-model="formBatch.hargaJualKecil" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" :invalid="!!errorsBatch.hargaJualKecil" fluid @update:modelValue="clearErrorBatch('hargaJualKecil')" />
          <small v-if="errorsBatch.hargaJualKecil" class="field__error">{{ errorsBatch.hargaJualKecil }}</small>
        </div>

        <div v-if="batchObat?.SATUAN_SEDANG" class="field">
          <label for="b-jual-sedang">Harga Jual ({{ batchObat.SATUAN_SEDANG }}) <span class="opt">(opsional)</span></label>
          <InputNumber id="b-jual-sedang" v-model="formBatch.hargaJualSedang" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" fluid />
          <small class="hint">Kosongkan untuk hitung otomatis proporsional dari harga {{ batchObat.SATUAN_KECIL }}</small>
        </div>
        <div v-if="batchObat?.SATUAN_BESAR" class="field">
          <label for="b-jual-besar">Harga Jual ({{ batchObat.SATUAN_BESAR }}) <span class="opt">(opsional)</span></label>
          <InputNumber id="b-jual-besar" v-model="formBatch.hargaJualBesar" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" fluid />
          <small class="hint">Kosongkan untuk hitung otomatis proporsional dari harga {{ batchObat.SATUAN_KECIL }}</small>
        </div>

        <div class="field">
          <label for="b-no-batch">No. Batch / Lot <span class="opt">(opsional)</span></label>
          <InputText id="b-no-batch" v-model="formBatch.noBatch" fluid />
        </div>
        <div class="field">
          <label for="b-expired">Tgl Expired <span class="opt">(opsional)</span></label>
          <DatePicker id="b-expired" v-model="formBatch.tglExpired" dateFormat="dd/mm/yy" showIcon iconDisplay="input" showButtonBar fluid />
        </div>

        <div class="field field--full">
          <label for="b-rak">Rak</label>
          <div class="rak-row">
            <Select id="b-rak" v-model="formBatch.idRak" :options="rakOptions" optionLabel="label" optionValue="value" fluid />
            <Button icon="pi pi-plus" severity="secondary" outlined v-tooltip.top="'Tambah rak baru'" @click="bukaTambahRak('batch')" />
          </div>
        </div>

        <div class="field field--full">
          <label for="b-catatan">Catatan <span class="opt">(opsional)</span></label>
          <Textarea id="b-catatan" v-model="formBatch.catatan" rows="2" placeholder="Mis. stok awal, hibah, koreksi..." fluid />
        </div>

        <button type="submit" hidden />
      </form>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="savingBatch" @click="showTambahBatch = false" />
        <Button label="Simpan" icon="pi pi-save" :loading="savingBatch" @click="simpanBatch" />
      </template>
    </Dialog>

    <!-- Dialog tambah stok ke batch yang sudah ada -->
    <Dialog v-model:visible="showTambahStok" header="Tambah Stok Batch" modal :closable="!savingStok" :style="{ width: '26rem' }">
      <p v-if="stokTarget.batch" class="batch-dialog-sub">
        {{ stokTarget.obat.NAMA }} — batch <strong class="mono">{{ stokTarget.batch.SUB_BARCODE }}</strong><template v-if="stokTarget.batch.BATCH_NUMBER"> ({{ stokTarget.batch.BATCH_NUMBER }})</template>
        <br />Stok saat ini: {{ qtyDisplay(stokTarget.obat, stokTarget.batch) }}
      </p>
      <div class="field">
        <label for="ts-qty">Jumlah <span class="req">*</span></label>
        <div class="rak-row">
          <InputNumber id="ts-qty" v-model="formStok.qty" :min="0" :maxFractionDigits="2" :invalid="!!errorStok" @update:modelValue="errorStok = ''" fluid />
          <Select v-model="formStok.satuan" :options="satuanBatchOptions(stokTarget.obat)" style="min-width: 7rem" />
        </div>
        <small v-if="errorStok" class="p-error">{{ errorStok }}</small>
      </div>
      <div class="field">
        <label for="ts-catatan">Catatan</label>
        <InputText id="ts-catatan" v-model="formStok.catatan" fluid />
      </div>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="savingStok" @click="showTambahStok = false" />
        <Button label="Tambah stok" icon="pi pi-save" :loading="savingStok" @click="simpanTambahStok" />
      </template>
    </Dialog>

    <!-- Dialog set rak untuk batch yang sudah ada -->
    <Dialog v-model:visible="showSetRak" header="Set Rak Batch" modal :closable="!savingSetRak" :style="{ width: '26rem' }">
      <p v-if="setRak.batch" class="batch-dialog-sub">
        Batch <strong class="mono">{{ setRak.batch.SUB_BARCODE }}</strong><template v-if="setRak.batch.BATCH_NUMBER"> ({{ setRak.batch.BATCH_NUMBER }})</template>
      </p>
      <div class="field">
        <label for="sr-rak">Rak</label>
        <div class="rak-row">
          <Select id="sr-rak" v-model="setRak.idRak" :options="rakOptions" optionLabel="label" optionValue="value" fluid />
          <Button icon="pi pi-plus" severity="secondary" outlined v-tooltip.top="'Tambah rak baru'" @click="bukaTambahRak('setrak')" />
        </div>
      </div>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="savingSetRak" @click="showSetRak = false" />
        <Button label="Simpan" icon="pi pi-save" :loading="savingSetRak" @click="simpanSetRak" />
      </template>
    </Dialog>

    <!-- Dialog tambah rak baru (dari dalam Tambah Batch / Set Rak) -->
    <Dialog v-model:visible="showTambahRak" header="Tambah Rak Baru" modal :closable="!savingRak" :style="{ width: '24rem' }">
      <div class="field">
        <label for="r-kode">Kode rak <span class="req">*</span></label>
        <InputText id="r-kode" v-model="formRak.kodeRak" placeholder="Mis. A1, RAK-01" :invalid="!!errorRak" fluid @update:modelValue="errorRak = ''" />
        <small v-if="errorRak" class="field__error">{{ errorRak }}</small>
      </div>
      <div class="field mt">
        <label for="r-nama">Nama rak <span class="opt">(opsional)</span></label>
        <InputText id="r-nama" v-model="formRak.namaRak" placeholder="Mis. Lemari Antibiotik" fluid />
      </div>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="savingRak" @click="showTambahRak = false" />
        <Button label="Simpan" icon="pi pi-save" :loading="savingRak" @click="simpanRak" />
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
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.summary__label {
  margin: 0 0 0.125rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

.toolbar {
  flex-wrap: wrap;
}
.toolbar__search {
  flex: 1;
  max-width: 26rem;
  min-width: 14rem;
}
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.toolbar__count {
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.sub {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.stok-kurang {
  margin-left: 0.375rem;
  color: var(--p-red-500);
}
.aksi-menu-btn {
  padding: 0.15rem 0.55rem !important;
  font-size: 11px !important;
  height: 1.6rem !important;
  min-height: unset !important;
  border-radius: 6px !important;
}
:global(.aksi-item-help .p-menu-item-icon),
:global(.aksi-item-help .p-menu-item-label) {
  color: #7c3aed !important;
}
:global(.aksi-item-warn .p-menu-item-icon),
:global(.aksi-item-warn .p-menu-item-label) {
  color: #d97706 !important;
}
:global(.aksi-item-success .p-menu-item-icon),
:global(.aksi-item-success .p-menu-item-label) {
  color: #16a34a !important;
}
:global(.aksi-item-danger .p-menu-item-icon),
:global(.aksi-item-danger .p-menu-item-label) {
  color: #dc2626 !important;
}
:global(.aksi-menu .p-menu-item:not(.p-disabled) .p-menu-item-content:hover),
:global(.aksi-menu .p-menu-item.p-focus .p-menu-item-content) {
  background: #f1f5f9 !important;
}
.actions {
  display: flex;
  gap: 0.125rem;
}
.batch {
  padding: 0.875rem 1.25rem;
  background: var(--p-surface-50, #f8fafc);
}
.batch__scroll {
  overflow-x: auto;
}
.batch__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
}
.batch__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-primary-color, #0d9488);
}
.batch__kode {
  font-weight: 400;
  text-transform: none;
  color: var(--app-text-muted);
}
.batch__status {
  margin: 0;
  padding: 0.5rem 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.batch__status--error {
  color: var(--p-red-500);
}
.batch__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}
.batch__table th {
  text-align: left;
  padding: 0.5rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--p-content-border-color, #e2e8f0);
}
.batch__table td {
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid var(--p-content-border-color, #e2e8f0);
}
.batch__table tbody tr:last-child td {
  border-bottom: none;
}
.batch__group {
  text-align: center !important;
  color: var(--p-primary-color, #0d9488) !important;
  border-left: 1px solid var(--p-content-border-color, #e2e8f0);
  border-right: 1px solid var(--p-content-border-color, #e2e8f0);
}
.batch__subhead {
  text-align: center !important;
  font-weight: 600 !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  padding-top: 0.25rem !important;
  padding-bottom: 0.375rem !important;
}
.batch__col-beli {
  background: var(--p-orange-50, #fff7ed);
  text-align: right;
}
.batch__col-jual {
  background: var(--p-green-50, #f0fdf4);
  text-align: right;
}
:global(.app-dark) .batch__col-beli {
  background: color-mix(in srgb, var(--p-orange-500, #f97316) 14%, transparent);
}
:global(.app-dark) .batch__col-jual {
  background: color-mix(in srgb, var(--p-green-500, #22c55e) 14%, transparent);
}
.batch__edit-cell {
  min-width: 11rem;
  vertical-align: top;
}
.batch__edit-tier {
  display: flex;
  gap: 0.25rem;
}
.batch__edit-tier :deep(.p-inputnumber) {
  min-width: 0;
}
.batch__edit-tier :deep(.p-inputnumber-input) {
  width: 100%;
}
.batch__modal {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.expired--merah {
  color: var(--p-red-500);
  font-weight: 600;
}
.expired--oranye {
  color: var(--p-orange-500, #f97316);
  font-weight: 600;
}

.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.625rem 1rem;
  border-radius: 8px;
  background: var(--p-yellow-50, #fffbeb);
  color: var(--p-yellow-800, #92400e);
  font-size: 0.875rem;
}

/* ── Dialog: layout dua kolom (form + sidebar) ── */
.modal-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(12rem, 1fr);
  gap: 1rem;
  align-items: start;
}
.form-main {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.batch-dialog-sub {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.batch-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
}
.rak-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.rak-row > :first-child {
  flex: 1;
}
.mt {
  margin-top: 0.875rem;
}
.section {
  border: 1px solid var(--p-content-border-color, #e2e8f0);
  border-radius: 8px;
  padding: 0.75rem 0.875rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
}
.section__title {
  grid-column: 1 / -1;
  margin: 0 0 0.25rem;
  padding-bottom: 0.375rem;
  border-bottom: 1px solid var(--p-content-border-color, #e2e8f0);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-primary-color, #0d9488);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.field {
  display: grid;
  gap: 0.375rem;
  align-content: start;
}
.field--full {
  grid-column: 1 / -1;
}
.field label {
  font-size: 0.8125rem;
  font-weight: 600;
}
.field__error {
  color: var(--p-red-500);
  font-size: 0.8125rem;
}
.req {
  color: var(--p-red-500);
}
.opt {
  font-weight: 400;
  color: var(--app-text-muted);
  font-size: 0.75rem;
}
.hint {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.hint--new {
  color: var(--p-green-600, #16a34a);
}

.checkbox-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.checkbox-item label {
  font-weight: 400;
  cursor: pointer;
}

.konversi {
  background: var(--p-green-50, #f0fdfa);
  border: 1px solid var(--p-green-200, #b2dfdb);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-green-800, #0f766e);
}

.stokmin-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.stokmin-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  padding: 0.375rem 0.625rem;
  border-radius: 6px;
  font-weight: 500;
}
.stokmin-hint--on {
  background: var(--p-green-50, #f0fdf4);
  color: var(--p-green-700, #15803d);
  border: 1px solid var(--p-green-200, #bbf7d0);
}
.stokmin-hint--off {
  background: var(--p-surface-100, #f1f5f9);
  color: var(--app-text-muted);
  border: 1px solid var(--p-content-border-color, #e2e8f0);
}

.sidebar {
  position: sticky;
  top: 0;
}
.info-card {
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--p-content-border-color, #e2e8f0);
  border-radius: 8px;
  padding: 0.875rem;
  font-size: 0.75rem;
}
.info-card hr {
  margin: 0.5rem 0;
  border: none;
  border-top: 1px solid var(--p-content-border-color, #e2e8f0);
}
.info-card__title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--p-primary-color, #0d9488);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.info-card__label {
  font-weight: 600;
  color: var(--app-text-muted);
  margin-bottom: 0.25rem;
}
.info-card__item {
  color: var(--app-text-muted);
  line-height: 1.6;
}

@media (max-width: 768px) {
  .modal-grid {
    grid-template-columns: 1fr;
  }
  .section {
    grid-template-columns: 1fr;
  }
  .summary {
    grid-template-columns: 1fr;
  }
  .summary__item + .summary__item {
    border-left: 0;
    border-top: 1px solid var(--app-border);
  }
}
@media (max-width: 575px) {
  .toolbar__search {
    max-width: none;
  }
}
</style>
