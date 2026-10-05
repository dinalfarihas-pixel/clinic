<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '@/stores/auth'
import {
  cariObat,
  getRecentObat,
  cariCaraPakai,
  getRiwayatResep,
  getDetailResep,
  kirimResep,
  batalResep,
  simpanResep,
  getTemplateObat,
  simpanTemplateObat,
  hapusTemplateObat,
  getBillingPasien
} from '@/services/terapi'
import { formatCurrency } from '@/utils/format'

const props = defineProps({
  datapasien: { type: Object, required: true }
})

const toast = useToast()
const confirm = useConfirm()
const auth = useAuthStore()

const showSuccess = (detail) => toast.add({ severity: 'success', summary: 'Berhasil', detail, life: 3000 })
const showWarning = (detail) => toast.add({ severity: 'warn', summary: 'Perhatian', detail, life: 4000 })
const showError = (detail) => toast.add({ severity: 'error', summary: 'Gagal', detail, life: 5000 })

// ── Item resep berjalan ──────────────────────────────────────
const selectedObatObatan = ref([])

const _isRacikanParent = (item) => item.JENIS_R === 'R/' && String(item.BARCODE ?? '').trim() === '00000' && String(item.AS_PARENT ?? '') === '1'
const _isRacikanChild = (item) => item.JENIS_R === '' && String(item.BARCODE ?? '').trim() === '00000' && String(item.AS_PARENT ?? '') === '0'
const _isRacikan = (item) => _isRacikanParent(item) || _isRacikanChild(item)

const getRowClass = (data) => {
  if (_isRacikanParent(data)) return 'row-racikan-parent'
  if (_isRacikanChild(data)) return 'row-racikan-child'
  return ''
}

function formatDateTime() {
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
}

function addItem(item, mode = 1) {
  if (!item.NAMA && !item.CAPTION) {
    showWarning('Nama obat tidak boleh kosong')
    return
  }

 
  if (mode === 1) item.JENIS_R = 'R/'
  selectedObatObatan.value.push({
    BARCODE: item.BARCODE || '00000',
    ID_BARANG: item.BARCODE || '00000',
    JENIS_R: item.JENIS_R || '',
    NAMA: item.NAMA || item.CAPTION || '',
    // SATUAN_KECIL adalah field yang selalu terisi di master obat — MEREK/SATUAN (legacy)
    // sering kosong untuk data lama, jadi dipakai sebagai fallback saja, bukan sumber utama.
    SATUAN: item.SATUAN || item.SATUAN_KECIL || '',
    
    RECEIPT_NO: '',
    HARGA: item.HARGAJUAL || item.HARGA || 0,
    POTONGSTOCK: item.POTONGSTOCK || 0,
    TOTAL_ITEM: 0,
    KATEGORI: item.KATEGORI,
    QTY_RACIK: item.QTY_RACIK || 0,
    PERSEDIAAN: item.QUANTITY || item.QUNATITY || item.PERSEDIAAN || 0,
    SATUAN_RACIK: item.SATUAN_RACIK || '',
    MEREK: item.MEREK || '', 
    TOTALAMOUNT: 0,
    DISCOUNT: 0,
    ITEMSEQNO: '',
    SUBITEMSEQNO: 1,
    QTY: item.QTY || 0,
    STATUS: '',
    STATUS_PROGRESS: 'M',
    SUB_BARCODE: item.SUB_BARCODE || '',
    OBAT_OBATAN: 1,
    AS_PARENT: item.AS_PARENT ?? 0,
    FLAG: 'NEW LINE',
    JENIS: item.JENIS || '',
    JENIS_RESEP: mode === 1 ? 'RT' : 'RR',
    ID_LOKASI: auth.idLokasi,
    REMARK: item.REMARK || '',
    REMARK_ITEM: item.REMARK_ITEM || '',
    TANGGAL_TRANS: formatDateTime(),
    JML_RACIK: 0,
    RACIKAN_GROUP_ID: item.RACIKAN_GROUP_ID || ''
  }) 
}

function removeItem(index, item) {
  if (_isRacikanParent(item) && item?.RACIKAN_GROUP_ID) {
    selectedObatObatan.value = selectedObatObatan.value.filter((o) => o.RACIKAN_GROUP_ID !== item.RACIKAN_GROUP_ID)
  } else {
    selectedObatObatan.value.splice(index, 1)
  }
}

function confirmRemoveItemObat(index) {
  const obat = selectedObatObatan.value[index]
  const isParent = _isRacikanParent(obat)
  const childCount = isParent
    ? selectedObatObatan.value.filter((item) => item.RACIKAN_GROUP_ID === obat.RACIKAN_GROUP_ID && !_isRacikanParent(item)).length
    : 0
  confirm.require({
    header: 'Hapus item?',
    message: isParent ? `Hapus racikan "${obat.NAMA}" beserta ${childCount} item komposisinya?` : `Hapus item "${obat.NAMA}" dari resep?`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => removeItem(index, obat)
  })
}

function clearAllItems() {
  if (selectedObatObatan.value.length === 0) return
  confirm.require({
    header: 'Hapus semua item?',
    message: 'Semua obat yang belum disimpan pada resep ini akan dihapus.',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus semua',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => (selectedObatObatan.value = [])
  })
}

const totalAmount = computed(() =>
  selectedObatObatan.value.reduce((total, item) => total + (parseFloat(item.QTY) || 0) * (parseFloat(item.HARGA) || 0), 0)
)

// ── Plafon (BPJS) ────────────────────────────────────────────
const biayaPelayanan = ref({ OBATAN: 0, PLAFON_OBAT: 0 })
const totalTerapi = computed(() => totalAmount.value + (parseFloat(biayaPelayanan.value.OBATAN) || 0))
const persenPlafon = computed(() => {
  if (!biayaPelayanan.value.PLAFON_OBAT) return 0
  return Math.round((totalTerapi.value / biayaPelayanan.value.PLAFON_OBAT) * 100)
})

async function muatBilling() {
  try {
    const res = await getBillingPasien(props.datapasien.NOPENDAFTARAN)
    if (res) {
      biayaPelayanan.value = {
        OBATAN: parseFloat(res.OBATAN) || 0,
        PLAFON_OBAT: parseFloat(res.PLAFON_OBAT) || 0
      }
    }
  } catch {
    /* plafon opsional, abaikan bila gagal */
  }
}

// ── Cari & tambah obat ───────────────────────────────────────
const listObat = ref(false)
const searchQuery = ref('')
const availableObat = ref([])
const searchingObat = ref(false)
let searchTimer = null

function onSearchObat() {
  clearTimeout(searchTimer)
  if (searchQuery.value.trim().length <= 2) {
    availableObat.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searchingObat.value = true
    try {
      availableObat.value = await cariObat(searchQuery.value.trim(), auth.idLokasi)
    
    } catch {
      availableObat.value = []
      showError('Gagal mencari data obat')
    } finally {
      searchingObat.value = false
    }
  }, 400)
}

const recentObat = ref([])
const loadingRecent = ref(false)

async function muatRecentObat() {
  loadingRecent.value = true
  try {
    recentObat.value = await getRecentObat(props.datapasien?.KODERUANGAN)
     
  } catch {
    recentObat.value = []
  } finally {
    loadingRecent.value = false
  }
}

function addRecentObat(item) {
  addItem(
    {
      BARCODE: item.BARCODE,
      CAPTION: item.NAMABARANG,
      SATUAN: item.SATUAN,
      HARGAJUAL: item.HARGA || 0,
      MEREK: item.SATUAN
    },
    1
  )
}

watch(listObat, (val) => {
  if (val && recentObat.value.length === 0) muatRecentObat()
})

// ── Cara pakai ───────────────────────────────────────────────
const showCaraPakaiObat = ref(false)
const searchCaraPakai = ref('')
const listCaraPakai = ref([])
const indexCaraPakaiAktif = ref(null)
const caraPakaiTarget = ref('item') // 'item' = isi REMARK_ITEM baris langsung, 'signa' = isi Petunjuk Pemakaian di dialog Signa
let caraPakaiTimer = null

function openCaraPakaiDialog(index) {
  caraPakaiTarget.value = 'item'
  indexCaraPakaiAktif.value = index
  searchCaraPakai.value = ''
  listCaraPakai.value = []
  showCaraPakaiObat.value = true
}

function bukaCaraPakaiUntukSigna() {
  caraPakaiTarget.value = 'signa'
  searchCaraPakai.value = ''
  listCaraPakai.value = []
  showCaraPakaiObat.value = true
}

function onSearchCaraPakai() {
  clearTimeout(caraPakaiTimer)
  caraPakaiTimer = setTimeout(async () => {
    try {
      listCaraPakai.value = await cariCaraPakai(searchCaraPakai.value.trim())
    } catch {
      listCaraPakai.value = []
    }
  }, 350)
}

function pilihCaraPakai(remark) {
  if (caraPakaiTarget.value === 'signa') {
    signaForm.value.petunjuk = remark
    showCaraPakaiObat.value = false
    return
  }
  if (indexCaraPakaiAktif.value !== null && selectedObatObatan.value[indexCaraPakaiAktif.value]) {
    selectedObatObatan.value[indexCaraPakaiAktif.value].REMARK_ITEM = remark
    showCaraPakaiObat.value = false
  }
}

// ── Signa & dosis (dialog terstruktur: frekuensi x jumlah/minum, durasi, total jumlah obat) ──
const periodeOptions = ['Per hari', 'Per 8 jam', 'Per 12 jam', 'Per 24 jam', 'Jika perlu']
const OPSI_PETUNJUK_CEPAT = ['Sesudah Makan', 'Sebelum Makan', 'Saat Makan', 'Sebelum Tidur', 'Bila Perlu', 'Dikunyah', 'Jangan Digerus']
const showSignaDialog = ref(false)
const signaIndex = ref(null)
function signaFormKosong() {
  return {
    frekuensi: 1,
    jumlahMinum: 1,
    satuanMinum: '',
    periode: 'Per hari',
    durasi: 1,
    jumlahMode: 'hitung',
    jumlahCustom: null,
    satuanCustom: '',
    petunjuk: ''
  }
}
const signaForm = ref(signaFormKosong())
const signaItem = computed(() => (signaIndex.value !== null ? selectedObatObatan.value[signaIndex.value] : null))

// Total obat dari Dosis(Signa) x Durasi, mis. 3 x 1 x 3 hari = 9 tablet
const jumlahHitung = computed(() => {
  const f = Number(signaForm.value.frekuensi) || 0
  const j = Number(signaForm.value.jumlahMinum) || 0
  const d = Number(signaForm.value.durasi) || 0
  return Math.round(f * j * d)
})

function bukaSignaDialog(index) {
  const item = selectedObatObatan.value[index]
  if (!item) return
  signaIndex.value = index
  signaForm.value = {
    ...signaFormKosong(),
    satuanMinum: item.SATUAN || 'Tablet',
    jumlahCustom: Number(item.QTY) || null,
    satuanCustom: item.SATUAN || '',
    petunjuk: ''
  }
  showSignaDialog.value = true
}

// Badge cepat: menambah/menghapus frasa dari Petunjuk Pemakaian (dipisah koma), bukan mengganti seluruhnya
const petunjukDipilih = computed(() =>
  signaForm.value.petunjuk.split(',').map((s) => s.trim()).filter(Boolean)
)
function togglePetunjukCepat(opsi) {
  const list = [...petunjukDipilih.value]
  const i = list.indexOf(opsi)
  if (i === -1) list.push(opsi)
  else list.splice(i, 1)
  signaForm.value.petunjuk = list.join(', ')
}

function konfirmasiSigna() {
  const item = signaItem.value
  if (!item) return
  const f = signaForm.value
  if (!f.petunjuk.trim()) return showWarning('Petunjuk pemakaian wajib diisi')

  const jumlahAkhir = f.jumlahMode === 'hitung' ? jumlahHitung.value : Number(f.jumlahCustom) || 0
  const satuanAkhir = (f.jumlahMode === 'hitung' ? item.SATUAN : f.satuanCustom) || f.satuanMinum
  if (jumlahAkhir <= 0) return showWarning('Jumlah obat harus lebih dari 0')

  const signaText = `${f.frekuensi} x ${f.jumlahMinum} ${f.satuanMinum} ${f.periode}`.replace(/\s+/g, ' ').trim()
  item.QTY = jumlahAkhir
  item.SATUAN = satuanAkhir
  item.REMARK_ITEM = `${signaText}. ${f.petunjuk.trim()}`
  showSignaDialog.value = false
  showSuccess('Signa & jumlah obat tersimpan')
}

// ── Obat racikan ─────────────────────────────────────────────
const showResepRacikan = ref(false)
const TitleRacikan = ref('')
const SatuanRacikan = ref('')
const jumlQtyResepRacikan = ref(0)
const itemResepRacikan = ref([])

function handleQuantityInput() {
  jumlQtyResepRacikan.value = parseInt(jumlQtyResepRacikan.value || 0, 10)
}

function addItemRacik() {
  itemResepRacikan.value.push({ NAMABARANG: '', JENIS_RESEP: 'RR' })
}

function removeItemRacikan(index) {
  itemResepRacikan.value.splice(index, 1)
}

function resetRacikanForm() {
  TitleRacikan.value = ''
  SatuanRacikan.value = ''
  jumlQtyResepRacikan.value = 0
  itemResepRacikan.value = []
}

function simpanRacikan() {
  if (!TitleRacikan.value.trim()) return showWarning('Nama racikan harus diisi')
  if (itemResepRacikan.value.every((i) => !i.NAMABARANG.trim())) return showWarning('Minimal 1 item komposisi harus diisi')

  const groupId = `RR_${Date.now()}`
  addItem(
    {
      BARCODE: '00000',
      NAMA: TitleRacikan.value.trim(),
      AS_PARENT: 1,
      JENIS_R: 'R/',
      SATUAN: SatuanRacikan.value,
      QTY: jumlQtyResepRacikan.value,
      SATUAN_RACIK: SatuanRacikan.value,
      RACIKAN_GROUP_ID: groupId
    },
    1
  )
  itemResepRacikan.value.forEach((item) => {
    if (!item.NAMABARANG.trim()) return
    addItem(
      {
        BARCODE: '00000',
        NAMA: item.NAMABARANG,
        JENIS_RESEP: item.JENIS_RESEP,
        AS_PARENT: 0,
        JENIS_R: '',
        RACIKAN_GROUP_ID: groupId
      },
      2
    )
  })

  resetRacikanForm()
  showResepRacikan.value = false
  showSuccess('Resep racikan berhasil ditambahkan')
}

// ── Riwayat resep kunjungan ini ──────────────────────────────
const riwayatResep = ref([])
const loadingRiwayat = ref(false)

async function muatRiwayatResep() {
  loadingRiwayat.value = true
  try {
    riwayatResep.value = await getRiwayatResep(props.datapasien.NOPENDAFTARAN)
  } catch {
    riwayatResep.value = []
  } finally {
    loadingRiwayat.value = false
  }
}

const mengirim = ref(null)
async function kirimResepAksi(receiptNo) {
  mengirim.value = receiptNo
  try {
    await kirimResep(receiptNo)
    await muatRiwayatResep()
    showSuccess('Resep berhasil dikirim ke apotek')
  } catch {
    showError('Gagal mengirim resep')
  } finally {
    mengirim.value = null
  }
}

function confirmBatalResep(receiptNo) {
  confirm.require({
    header: 'Batalkan resep?',
    message: `Resep "${receiptNo}" akan dibatalkan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Batalkan',
    rejectLabel: 'Tidak',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: async () => {
      try {
        await batalResep(receiptNo)
        await muatRiwayatResep()
        showSuccess('Resep berhasil dibatalkan')
      } catch (err) {
        showError(err.message)
      }
    }
  })
}

const detailsResep = ref(false)
const detilObat = ref([])
const progress = ref(null)
const jamSelesai = ref(null)
const receiptNoDetail = ref(null)
const loadingDetail = ref(false)

async function bukaDetailResep(receiptNo) {
  loadingDetail.value = true
  receiptNoDetail.value = receiptNo
  try {
    const rows = await getDetailResep(receiptNo)
    detilObat.value = rows
    jamSelesai.value = rows[0]?.SELESAI || null
    progress.value = rows[0]?.STATUS_PROGRESS || null
    detailsResep.value = true
  } catch {
    showError('Gagal memuat detail resep')
  } finally {
    loadingDetail.value = false
  }
}

async function salinNoResep() {
  try {
    await navigator.clipboard.writeText(String(receiptNoDetail.value))
    showSuccess(receiptNoDetail.value)
  } catch {
    showError('Gagal menyalin no. resep')
  }
}

// ── Simpan resep ─────────────────────────────────────────────
const saving = ref(false)

async function saveItems() {
  if (selectedObatObatan.value.length === 0) return showWarning('Tidak ada item yang akan disimpan')
  saving.value = true
  try {
    const header = {
      RECEIPT_NO: '',
      MEMBERSHIP_ID: props.datapasien?.NOMR,
      SALESNO: 0,
      IDUSER: auth.userId,
      TANGGAL: formatDateTime(),
      IDPAYEMENT: props.datapasien?.KODECARABAYAR,
      NOTE: `${props.datapasien?.NOMR},${props.datapasien?.DATA_SINGKAT || props.datapasien?.NAMAPASIEN || ''}`,
      SUBTOTAL: 0,
      TAXPERCENT: 0,
      TAXAMOUNT: 0,
      TOTALBAYAR: 0,
      POTONGAN: 0,
      MODE: 'REG',
      IDCLIENT: auth.idClient,
      GRANDTOTAL: 0,
      KEMBALIAN: 0,
      ID_LOKASI: auth.idLokasi,
      ROOM_TABLE_NUMBER: 0,
      RESV_ID: 0,
      NO_REGISTER: props.datapasien?.NOPENDAFTARAN,
      SERVER_ID: 0,
      POLI_RUANG: props.datapasien?.POLI,
      DPJP: props.datapasien?.NAMADOKTER,
      SERVER_NAME: '',
      STATUS_PROGRESS: '',
      OBAT_OBATAN: 1,
      AS_PARENT: 0,
      TGL_SELESAI: '',
      KLINIS: '',
      JENIS_RESEP: 'RT',
      CARAPAKAI_RACIK: '',
      JML_RACIK: '',
      BENTUK_RACIK: '',
      OBAT_PULANG: 0,
      details: selectedObatObatan.value
    }
    await simpanResep(header)
    showSuccess('Resep berhasil disimpan')
    selectedObatObatan.value = []
    await muatRiwayatResep()
  } catch (err) {
    showError(err.message)
  } finally {
    saving.value = false
  }
}

// ── Template obat ────────────────────────────────────────────
const showTemplateDialog = ref(false)
const templates = ref([])
const loadingTemplate = ref(false)
const tmplFilterText = ref('')

const filteredTemplates = computed(() => {
  const q = tmplFilterText.value.trim().toLowerCase()
  if (!q) return templates.value
  return templates.value.filter((t) => t.caption.toLowerCase().includes(q))
})

async function bukaTemplateDialog() {
  showTemplateDialog.value = true
  loadingTemplate.value = true
  try {
    templates.value = await getTemplateObat(auth.userId)
  } catch {
    templates.value = []
    showError('Gagal memuat template obat')
  } finally {
    loadingTemplate.value = false
  }
}

function pakaiTemplate(tmpl) {
  if (!tmpl.detils?.length) return showWarning('Template ini tidak memiliki item obat')
  tmpl.detils.forEach((det) => addItem({ BARCODE: det.BARCODE, NAMA: det.nama || det.NAMA, SATUAN: det.satuan || det.SATUAN }, 1))
  showTemplateDialog.value = false
  showSuccess(`${tmpl.detils.length} obat dari template "${tmpl.caption}" ditambahkan`)
}

function doHapusTemplate(tmpl) {
  confirm.require({
    header: 'Hapus template?',
    message: `Template "${tmpl.caption}" akan dihapus permanen.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: async () => {
      try {
        await hapusTemplateObat(tmpl.no_template, auth.userId)
        templates.value = templates.value.filter((t) => t.no_template !== tmpl.no_template)
        showSuccess('Template berhasil dihapus')
      } catch (err) {
        showError(err.message)
      }
    }
  })
}

// Tambah template baru dari item resep yang sedang diketik
const showAddTemplate = ref(false)
const tmplSearchQuery = ref('')
const tmplAvailableObat = ref([])
const tmplSelectedObat = ref([])
const showCaptionTemplate = ref(false)
const tmplCaption = ref('')
let tmplSearchTimer = null

function bukaTambahTemplate() {
  tmplSelectedObat.value = []
  tmplSearchQuery.value = ''
  tmplAvailableObat.value = []
  showAddTemplate.value = true
}

function onSearchTmplObat() {
  clearTimeout(tmplSearchTimer)
  if (tmplSearchQuery.value.trim().length < 3) {
    tmplAvailableObat.value = []
    return
  }
  tmplSearchTimer = setTimeout(async () => {
    try {
      tmplAvailableObat.value = await cariObat(tmplSearchQuery.value.trim(), auth.idLokasi)
    } catch {
      tmplAvailableObat.value = []
    }
  }, 400)
}

const isTmplObatSelected = (barcode) => tmplSelectedObat.value.some((item) => item.BARCODE === barcode)

function addTmplObat(row) {
  if (isTmplObatSelected(row.BARCODE)) return
  tmplSelectedObat.value.push({ BARCODE: row.BARCODE, NAMA: row.NAMA || row.CAPTION, SATUAN: row.SATUAN || '' })
}

function removeTmplObat(index) {
  tmplSelectedObat.value.splice(index, 1)
}

function lanjutkanTemplate() {
  if (tmplSelectedObat.value.length === 0) return showWarning('Pilih minimal 1 obat')
  tmplCaption.value = ''
  showCaptionTemplate.value = true
}

async function simpanTemplateBaru() {
  if (!tmplCaption.value.trim()) return
  loadingTemplate.value = true
  try {
    await simpanTemplateObat(
      tmplCaption.value.trim(),
      auth.userId,
      tmplSelectedObat.value.map((o) => ({ BARCODE: o.BARCODE, NAMA: o.NAMA, SATUAN: o.SATUAN }))
    )
    showSuccess('Template berhasil disimpan')
    showCaptionTemplate.value = false
    showAddTemplate.value = false
    templates.value = await getTemplateObat(auth.userId)
  } catch (err) {
    showError(err.message)
  } finally {
    loadingTemplate.value = false
  }
}

onMounted(() => {
  muatRiwayatResep()
  muatBilling()
})
</script>

<template>
  <div class="terapi-wrapper">
    <!-- ── Sidebar: Riwayat Resep ── -->
    <aside class="terapi-sidebar">
      <div class="sidebar-hdr">
        <i class="pi pi-history" />
        <span>Riwayat Resep Kunjungan Ini</span>
        <Tag :value="String(riwayatResep.length)" severity="secondary" />
      </div>

      <p v-if="loadingRiwayat" class="muted"><i class="pi pi-spin pi-spinner" /> Memuat riwayat…</p>
      <p v-else-if="!riwayatResep.length" class="muted">Belum ada resep untuk kunjungan ini.</p>

      <div v-else class="resep-list">
        <div v-for="data in riwayatResep" :key="data.RECEIPT_NO" class="resep-card">
          <div class="resep-card__top">
            <span><i class="pi pi-calendar" /> {{ data.SHORTDATE }} {{ data.JAM }}</span>
            <Tag v-if="data.TELAH_DIKIRIM == 1" severity="success" value="Terkirim" />
            <Tag v-else severity="warn" value="Pending" />
          </div>
          <div class="resep-card__actions">
            <Button icon="pi pi-eye" label="Detail" text size="small" severity="info" :loading="loadingDetail && receiptNoDetail === data.RECEIPT_NO" @click="bukaDetailResep(data.RECEIPT_NO)" />
            <Button v-if="data.TELAH_DIKIRIM == 0" icon="pi pi-send" label="Kirim" size="small" severity="success" :loading="mengirim === data.RECEIPT_NO" @click="kirimResepAksi(data.RECEIPT_NO)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" v-tooltip.bottom="'Batalkan resep'" @click="confirmBatalResep(data.RECEIPT_NO)" />
          </div>
        </div>
      </div>
    </aside>

    <!-- ── Main ── -->
    <div class="terapi-main">
      <div v-if="biayaPelayanan.PLAFON_OBAT > 0" class="plafon-bar" :class="{ 'plafon-bar--over': totalTerapi > biayaPelayanan.PLAFON_OBAT }">
        <span>Total terapi <strong>{{ formatCurrency(totalTerapi) }}</strong> dari plafon {{ formatCurrency(biayaPelayanan.PLAFON_OBAT) }}</span>
        <Tag v-if="totalTerapi > biayaPelayanan.PLAFON_OBAT" severity="danger" value="Melebihi plafon" />
        <Tag v-else severity="success" :value="`${persenPlafon}% terpakai`" />
      </div>

      <div class="toolbar">
        <div class="toolbar__left">
          <i class="pi pi-list-check" />
          <span>Daftar Item Terapi</span>
          <Tag :value="`${selectedObatObatan.length} item`" severity="secondary" />
        </div>
        <div class="toolbar__right">
          <Button icon="pi pi-search" label="Tambah Obat" size="small" severity="success" @click="listObat = true" />
          <Button icon="pi pi-plus-circle" label="Obat Racikan" size="small" severity="help" @click="showResepRacikan = true" />
          <Button icon="pi pi-bookmark" label="Template Obat" size="small" severity="secondary" @click="bukaTemplateDialog" />
        </div>
      </div>

      <DataTable :value="selectedObatObatan" scrollable scrollHeight="360px" class="p-datatable-sm" rowHover stripedRows :rowClass="getRowClass">
        <template #empty>
          <div class="tbl-empty">
            <i class="pi pi-pills" />
            <p>Belum ada obat ditambahkan</p>
            <Button label="Cari Obat" icon="pi pi-search" size="small" severity="success" @click="listObat = true" />
          </div>
        </template>

        <Column field="NAMA" header="Nama Obat" style="min-width: 200px">
          <template #body="{ data }">
            <div class="obat-nama" :class="{ 'obat-nama--child': _isRacikanChild(data) }">
              <i v-if="_isRacikanParent(data)" class="pi pi-list" />
              <i v-else-if="_isRacikanChild(data)" class="pi pi-arrow-right" />
              {{ data.NAMA }} 
            </div>
            <span v-if="!_isRacikan(data)" class="obat-barcode">{{ data.BARCODE }}</span>
            <span v-else-if="_isRacikanParent(data)" class="racikan-label">Racikan</span>
          </template>
        </Column>

        <Column field="JENIS_R" header="Jenis" style="width: 68px; text-align: center">
          <template #body="{ data }">
            <Tag v-if="data.JENIS_R" :value="data.JENIS_R" :severity="data.JENIS_R === 'R/' ? 'info' : 'secondary'" style="font-size: 10px" />
          </template>
        </Column>

        <Column field="QTY" header="Qty" style="width: 90px">
          <template #body="{ data }">
            <InputText v-if="data.JENIS_R === 'R/'" type="number" v-model="data.QTY" min="0" fluid @update:modelValue="(v) => (data.QTY = Math.max(0, Number(v || 0)))" />
            <span v-else class="muted">—</span>
          </template>
        </Column>

        <Column field="SATUAN" header="Satuan" style="width: 76px">
          <template #body="{ data }"><span v-if="data.JENIS_R">{{ data.SATUAN }}</span></template>
        </Column>

        <Column field="REMARK_ITEM" header="Cara Pakai" style="min-width: 200px">
          <template #body="{ data, index }">
            <div class="cara-pakai-cell">
              <Button icon="pi pi-sliders-h" severity="info" text rounded size="small" v-tooltip.top="'Signa & dosis'" @click="bukaSignaDialog(index)" />
              <Button icon="pi pi-book" severity="warn" text rounded size="small" v-tooltip.top="'Pilih cara pakai'" @click="openCaraPakaiDialog(index)" />
              <InputText v-model="data.REMARK_ITEM" placeholder="Cara pakai…" fluid />
            </div>
          </template>
        </Column>

        <Column field="HARGA" header="Subtotal" style="width: 130px; text-align: right">
          <template #body="{ data }"><span class="price">{{ formatCurrency(data.HARGA * data.QTY) }}</span></template>
        </Column>

        <Column style="width: 48px; text-align: center">
          <template #body="{ index }">
            <Button icon="pi pi-times" severity="danger" text rounded size="small" v-tooltip.left="'Hapus item'" @click="confirmRemoveItemObat(index)" />
          </template>
        </Column>
      </DataTable>

      <div class="footer">
        <div class="footer__info">
          <span>Total Resep</span>
          <strong>{{ formatCurrency(totalAmount) }}</strong>
          <span class="muted">· {{ selectedObatObatan.length }} item</span>
        </div>
        <div class="footer__actions">
          <Button label="Hapus Semua" icon="pi pi-trash" size="small" severity="danger" outlined :disabled="!selectedObatObatan.length" @click="clearAllItems" />
          <Button label="Simpan Resep" icon="pi pi-save" size="small" severity="success" :loading="saving" :disabled="!selectedObatObatan.length" @click="saveItems" />
        </div>
      </div>
    </div>

    <!-- ══ Dialog: Cari Obat ══ -->
    <Dialog v-model:visible="listObat" modal header="Cari & Tambah Obat" :style="{ width: '900px', maxWidth: '96vw' }">
      <IconField class="obat-search">
        <InputIcon class="pi pi-search" />
        <InputText v-model="searchQuery" placeholder="Ketik minimal 3 huruf nama obat…" fluid autofocus @input="onSearchObat" />
      </IconField>
 
      <div v-if="searchQuery.trim().length <= 2" class="recent-obat">
        <div class="recent-obat__hdr">
          <span><i class="pi pi-star-fill" /> Sering diresepkan di poli ini</span>
          <span v-if="loadingRecent" class="muted"><i class="pi pi-spin pi-spinner" /></span>
        </div>
        <p v-if="!loadingRecent && !recentObat.length" class="muted small">Belum ada data.</p>
        <div class="recent-obat__grid">
          <div v-for="item in recentObat" :key="item.BARCODE" class="recent-chip" v-tooltip.bottom="'Klik untuk tambah ke resep'" @click="addRecentObat(item)">
            <div class="recent-chip__nama">{{ item.NAMABARANG }}</div>
            <div class="recent-chip__meta">
              <span v-if="item.HARGA > 0">{{ formatCurrency(item.HARGA) }} / {{ item.SATUAN }}</span>
              <span v-else>{{ item.SATUAN }}</span>
              <span><i class="pi pi-chart-bar" /> {{ item.JML }}x</span>
            </div>
          </div>
        </div>
      </div>

      <DataTable :value="availableObat" paginator :rows="10" :rowsPerPageOptions="[5, 10, 20, 50]" scrollable scrollHeight="360px" class="p-datatable-sm" rowHover stripedRows :loading="searchingObat">
        <template #empty>
          <div class="tbl-empty"><i class="pi pi-search" /><p>Ketik nama obat untuk mencari</p></div>
        </template>
        <Column field="CAPTION" header="Nama Obat" sortable style="min-width: 220px" />
        <Column field="KATEGORI" header="Kategori" sortable style="min-width: 130px">
          <template #body="{ data }"><Tag :value="data.KATEGORI" severity="success" /></template>
         
        </Column>
        <Column field="HARGAJUAL" header="Harga Jual" sortable dataType="numeric" style="min-width: 130px">
          <template #body="{ data }"><span class="price">{{ formatCurrency(data.HARGAJUAL) }}</span>
        
          </template>
        </Column>
         <Column field="SATUAN" header="Satuan" sortable dataType="numeric" style="min-width: 130px">
          <template #body="{ data }"><span class="price">{{  data.SATUAN }}</span>
        
          </template>
        </Column>
        <Column field="QUNATITY" header="Stok" sortable dataType="numeric" style="width: 90px; text-align: center">
          <template #body="{ data }">
            <Tag :value="String(data.QUNATITY < 0 ? '0' : data.QUNATITY)" :severity="data.QUNATITY > 0 ? 'success' : 'danger'" />
          </template>
        </Column>
        <Column style="width: 64px; text-align: center">
          <template #body="{ data }"><Button icon="pi pi-plus" rounded size="small" severity="success" v-tooltip.left="'Tambah ke resep'" @click="addItem(data, 1)" /></template>
        </Column>
      </DataTable>

      <template #footer>
        <Button label="Tutup" icon="pi pi-times" severity="secondary" outlined @click="listObat = false" />
      </template>
    </Dialog>

    <!-- ══ Dialog: Detail Resep ══ -->
    <Dialog v-model:visible="detailsResep" modal :style="{ width: '900px', maxWidth: '96vw' }">
      <template #header>
        <div class="detail-resep-hdr">
          <span>Detail Resep — {{ receiptNoDetail }}</span>
          <Button icon="pi pi-copy" text rounded size="small" severity="secondary" aria-label="Salin no. resep" v-tooltip.top="'Salin no. resep'" @click="salinNoResep" />
        </div>
      </template>
      <Tag :severity="progress === 'C' ? 'success' : 'warn'" class="mb-2">
        <i :class="progress === 'C' ? 'pi pi-check-circle' : 'pi pi-clock'" />
        {{ progress === 'C' ? 'Selesai' : 'Menunggu' }}<template v-if="jamSelesai"> · {{ jamSelesai }}</template>
      </Tag>
      <DataTable :value="detilObat" scrollable scrollHeight="380px" class="p-datatable-sm" rowHover stripedRows>
        <template #empty><div class="tbl-empty"><i class="pi pi-info-circle" /><p>Tidak ada data obat</p></div></template>
        <Column field="NAMABARANG_REQ" header="Item Diminta" sortable />
        <Column field="NAMABARANG" header="Item Diberikan" sortable />
        <Column field="REMARK_ITEM" header="Dosis" sortable />
        <Column field="QTY_REQ" header="Diminta" style="width: 90px; text-align: center" />
        <Column field="QTY" header="Diberikan" style="width: 100px; text-align: center">
          <template #body="{ data }"><Tag :value="String(data.QTY)" :severity="data.QTY > 0 ? 'success' : 'warn'" /></template>
        </Column>
      </DataTable>
    </Dialog>

    <!-- ══ Dialog: Cara Pakai ══ -->
    <Dialog v-model:visible="showCaraPakaiObat" modal header="Pilih Cara Pakai Obat" :style="{ width: '440px' }">
      <IconField class="obat-search">
        <InputIcon class="pi pi-search" />
        <InputText v-model="searchCaraPakai" placeholder="Ketik cara pakai…" fluid autofocus @input="onSearchCaraPakai" />
      </IconField>
      <DataTable :value="listCaraPakai" scrollable scrollHeight="320px" class="p-datatable-sm mt-2" rowHover stripedRows>
        <template #empty><div class="tbl-empty"><i class="pi pi-search" /><p>Ketik untuk mencari cara pakai</p></div></template>
        <Column field="REMARK" header="Cara Pakai" />
        <Column style="width: 90px"><template #body="{ data }"><Button label="Pilih" size="small" severity="success" @click="pilihCaraPakai(data.REMARK)" /></template></Column>
      </DataTable>
    </Dialog>

    <!-- ══ Dialog: Signa & Dosis ══ -->
    <Dialog v-model:visible="showSignaDialog" modal header="Signa &amp; Dosis Obat" :style="{ width: '460px', maxWidth: '96vw' }">
      <div v-if="signaItem" class="signa-form">
        <p class="signa-obat-nama">{{ signaItem.NAMA }}</p>

        <div class="field">
          <label>Kode Obat</label>
          <InputText :modelValue="signaItem.BARCODE" disabled fluid />
        </div>
        <div class="field">
          <label>Catatan Interaksi Obat</label>
          <InputText modelValue="-" disabled fluid />
        </div>

        <div class="field">
          <label>Dosis (Signa) <span class="req">*</span></label>
          <div class="signa-dosis">
            <InputNumber v-model="signaForm.frekuensi" :min="1" fluid />
            <span class="signa-x">×</span>
            <InputNumber v-model="signaForm.jumlahMinum" :min="0.25" :step="0.25" fluid />
            <InputText v-model="signaForm.satuanMinum" placeholder="Tablet" style="width: 7rem" />
          </div>
          <Select v-model="signaForm.periode" :options="periodeOptions" fluid />
        </div>

        <div class="field">
          <label>Durasi <span class="req">*</span></label>
          <div class="signa-durasi">
            <InputNumber v-model="signaForm.durasi" :min="0" fluid />
            <span>Hari</span>
          </div>
        </div>

        <div class="field">
          <label>Jumlah <span class="req">*</span></label>
          <div class="signa-jumlah-opt">
            <RadioButton v-model="signaForm.jumlahMode" value="hitung" inputId="signa-jml-hitung" />
            <label for="signa-jml-hitung">{{ jumlahHitung }} {{ signaItem.SATUAN || signaForm.satuanMinum }}</label>
          </div>
          <div class="signa-jumlah-opt">
            <RadioButton v-model="signaForm.jumlahMode" value="lainnya" inputId="signa-jml-lain" />
            <label for="signa-jml-lain">Jumlah Lainnya</label>
          </div>
          <div v-if="signaForm.jumlahMode === 'lainnya'" class="signa-jumlah-custom">
            <div class="field"><label>Jumlah</label><InputNumber v-model="signaForm.jumlahCustom" :min="0" fluid /></div>
            <div class="field"><label>Satuan</label><InputText v-model="signaForm.satuanCustom" fluid /></div>
          </div>
        </div>

        <div class="field">
          <div class="field__label-row">
            <label>Petunjuk Pemakaian <span class="req">*</span></label>
            <Button icon="pi pi-book" label="Pilih preset" text size="small" @click="bukaCaraPakaiUntukSigna" />
          </div>
          <div class="petunjuk-chips" role="group" aria-label="Petunjuk pemakaian cepat">
            <button
              v-for="opsi in OPSI_PETUNJUK_CEPAT"
              :key="opsi"
              type="button"
              class="petunjuk-chip"
              :class="{ 'petunjuk-chip--on': petunjukDipilih.includes(opsi) }"
              :aria-pressed="petunjukDipilih.includes(opsi)"
              @click="togglePetunjukCepat(opsi)"
            >
              {{ opsi }}
            </button>
          </div>
          <Textarea v-model="signaForm.petunjuk" rows="2" placeholder="Masukkan petunjuk pemakaian" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined @click="showSignaDialog = false" />
        <Button label="Simpan" icon="pi pi-save" @click="konfirmasiSigna" />
      </template>
    </Dialog>

    <!-- ══ Dialog: Resep Racikan ══ -->
    <Dialog v-model:visible="showResepRacikan" modal header="Tambah Resep Racikan" :style="{ width: '560px' }" @hide="resetRacikanForm">
      <div class="racikan-form">
        <div class="racikan-form__hdr">
          <div class="field" style="flex: 2"><label>Nama Racikan <span class="req">*</span></label><InputText v-model="TitleRacikan" placeholder="Cth: Puyer Batuk" fluid /></div>
          <div class="field"><label>Jumlah</label><InputText type="number" v-model="jumlQtyResepRacikan" fluid @input="handleQuantityInput" /></div>
          <div class="field"><label>Satuan</label><InputText v-model="SatuanRacikan" placeholder="Bungkus" fluid /></div>
        </div>

        <div class="racikan-form__items-hdr">
          <span><i class="pi pi-list" /> Komposisi Racikan</span>
          <Button icon="pi pi-plus" label="Tambah Item" size="small" severity="success" outlined @click="addItemRacik" />
        </div>
        <div class="racikan-form__items">
          <p v-if="!itemResepRacikan.length" class="muted small">Belum ada item — klik Tambah Item</p>
          <div v-for="(data, index) in itemResepRacikan" :key="index" class="racikan-row">
            <span class="racikan-row__no">{{ index + 1 }}</span>
            <InputText v-model="data.NAMABARANG" placeholder="Nama bahan/obat…" fluid />
            <Button icon="pi pi-times" severity="danger" text rounded size="small" @click="removeItemRacikan(index)" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Batal" icon="pi pi-times" severity="secondary" outlined @click="showResepRacikan = false" />
        <Button label="Simpan Racikan" icon="pi pi-save" @click="simpanRacikan" />
      </template>
    </Dialog>

    <!-- ══ Dialog: Template Obat ══ -->
    <Dialog v-model:visible="showTemplateDialog" modal header="Template Obat" :style="{ width: '720px', maxWidth: '96vw' }">
      <div class="tmpl-toolbar">
        <Button icon="pi pi-plus" label="Buat Template Baru" size="small" @click="bukaTambahTemplate" />
        <InputText v-model="tmplFilterText" placeholder="Cari nama template…" fluid style="max-width: 260px" />
      </div>

      <p v-if="loadingTemplate && !templates.length" class="muted"><i class="pi pi-spin pi-spinner" /> Memuat template…</p>
      <p v-else-if="!templates.length" class="muted">Belum ada template tersimpan.</p>
      <p v-else-if="!filteredTemplates.length" class="muted">Template tidak ditemukan.</p>

      <div v-else class="tmpl-list">
        <div v-for="tmpl in filteredTemplates" :key="tmpl.no_template" class="tmpl-card">
          <div class="tmpl-card__hdr">
            <div>
              <strong>{{ tmpl.caption }}</strong>
              <small class="muted"><i class="pi pi-calendar" /> {{ tmpl.create_dated }}</small>
            </div>
            <div class="tmpl-card__actions">
              <Button icon="pi pi-check-circle" label="Pakai" size="small" severity="success" @click="pakaiTemplate(tmpl)" />
              <Button icon="pi pi-trash" size="small" severity="danger" text rounded v-tooltip.top="'Hapus template'" @click="doHapusTemplate(tmpl)" />
            </div>
          </div>
          <div class="tmpl-card__items">
            <span v-for="(det, i) in tmpl.detils" :key="i" class="tmpl-chip">{{ det.nama || det.NAMA }}</span>
            <span v-if="!tmpl.detils?.length" class="muted small">Tidak ada item</span>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Tutup" icon="pi pi-times" severity="secondary" outlined @click="showTemplateDialog = false" />
      </template>
    </Dialog>

    <!-- ══ Dialog: Pilih Obat untuk Template ══ -->
    <Dialog v-model:visible="showAddTemplate" modal header="Tambah Template Obat" :style="{ width: '760px', maxWidth: '96vw' }">
      <div class="tmpl-add">
        <div class="tmpl-add__panel">
          <div class="tmpl-add__title"><i class="pi pi-list" /> Daftar Obat</div>
          <InputText v-model="tmplSearchQuery" placeholder="Cari nama atau barcode…" fluid @input="onSearchTmplObat" />
          <div class="tmpl-obat-list">
            <p v-if="!tmplAvailableObat.length" class="muted small">Minimal 3 karakter untuk mencari.</p>
            <div v-for="row in tmplAvailableObat" :key="row.BARCODE" class="tmpl-obat-row">
              <div>
                <div>{{ row.NAMA || row.CAPTION }}</div>
                <small class="muted">{{ row.BARCODE }} · Stok: {{ row.QUNATITY }}</small>
              </div>
              <Button :icon="isTmplObatSelected(row.BARCODE) ? 'pi pi-check' : 'pi pi-plus'" rounded size="small" :severity="isTmplObatSelected(row.BARCODE) ? 'success' : 'primary'" :disabled="isTmplObatSelected(row.BARCODE)" @click="addTmplObat(row)" />
            </div>
          </div>
        </div>
        <div class="tmpl-add__panel">
          <div class="tmpl-add__title"><i class="pi pi-check-circle" /> Obat Dipilih <Tag :value="String(tmplSelectedObat.length)" severity="success" /></div>
          <div class="tmpl-obat-list">
            <p v-if="!tmplSelectedObat.length" class="muted small">Pilih obat dari daftar kiri.</p>
            <div v-for="(row, k) in tmplSelectedObat" :key="k" class="tmpl-obat-row">
              <div>
                <div>{{ row.NAMA }}</div>
                <small class="muted">{{ row.BARCODE }} · {{ row.SATUAN }}</small>
              </div>
              <Button icon="pi pi-times" rounded size="small" severity="danger" text @click="removeTmplObat(k)" />
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Batal" icon="pi pi-times" severity="secondary" outlined @click="showAddTemplate = false" />
        <Button label="Lanjutkan" icon="pi pi-arrow-right" iconPos="right" :disabled="!tmplSelectedObat.length" @click="lanjutkanTemplate" />
      </template>
    </Dialog>

    <!-- ══ Dialog: Nama Template ══ -->
    <Dialog v-model:visible="showCaptionTemplate" modal header="Simpan Template" :style="{ width: '420px', maxWidth: '96vw' }">
      <p class="muted"><i class="pi pi-pills" /> {{ tmplSelectedObat.length }} obat akan disimpan dalam template ini.</p>
      <div class="field mt-2">
        <label>Nama Template</label>
        <InputText v-model="tmplCaption" placeholder="Contoh: Hipertensi, Diabetes, Flu…" fluid autofocus @keyup.enter="simpanTemplateBaru" />
      </div>
      <template #footer>
        <Button label="Batal" icon="pi pi-times" severity="secondary" outlined @click="showCaptionTemplate = false" />
        <Button label="Simpan Template" icon="pi pi-save" :disabled="!tmplCaption.trim()" :loading="loadingTemplate" @click="simpanTemplateBaru" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.terapi-wrapper {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 1rem;
  align-items: start;
}
.muted {
  color: var(--app-text-muted);
}
.small {
  font-size: 0.8125rem;
}
.mt-2 {
  margin-top: 0.5rem;
}
.mb-2 {
  margin-bottom: 0.5rem;
}
.price {
  font-variant-numeric: tabular-nums;
}
.detail-resep-hdr {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.field {
  display: grid;
  gap: 0.375rem;
}
.field label {
  font-size: 0.875rem;
  font-weight: 600;
}
.req {
  color: var(--p-red-500);
}

/* Sidebar riwayat */
.terapi-sidebar {
  order: 2;
  display: grid;
  gap: 0.75rem;
  align-content: start;
  padding: 1rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  max-height: calc(100vh - var(--navbar-height) - 8rem);
  overflow-y: auto;
  position: sticky;
  top: calc(var(--navbar-height) + 1rem);
}
.sidebar-hdr {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}
.sidebar-hdr i {
  color: var(--p-primary-color);
}
.resep-list {
  display: grid;
  gap: 0.625rem;
}
.resep-card {
  padding: 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.resep-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8125rem;
  margin-bottom: 0.5rem;
}
.resep-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

/* Main */
.terapi-main {
  order: 1;
  display: grid;
  gap: 1rem;
}
.plafon-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.625rem 1rem;
  border-radius: var(--app-radius);
  background: color-mix(in srgb, var(--p-green-500) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-green-500) 30%, transparent);
}
.plafon-bar--over {
  background: color-mix(in srgb, var(--p-red-500) 10%, transparent);
  border-color: color-mix(in srgb, var(--p-red-500) 30%, transparent);
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.toolbar__left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}
.toolbar__left i {
  color: var(--p-primary-color);
}
.toolbar__right {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.obat-nama {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 600;
}
.obat-nama--child {
  padding-left: 1rem;
  color: var(--app-text-muted);
  font-weight: 400;
}
.obat-barcode {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.racikan-label {
  font-size: 0.75rem;
  color: var(--p-primary-color);
  font-style: italic;
}
:deep(.row-racikan-parent) {
  background: color-mix(in srgb, var(--p-primary-color) 6%, transparent);
}
.cara-pakai-cell {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.footer__info {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.footer__actions {
  display: flex;
  gap: 0.5rem;
}

.tbl-empty {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 1.5rem 0;
  color: var(--app-text-muted);
}

/* Dialog: cari obat */
.obat-search {
  margin-bottom: 0.75rem;
}
.recent-obat {
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-radius);
}
.recent-obat__hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.recent-obat__hdr i {
  color: var(--p-yellow-500);
}
.recent-obat__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.5rem;
}
.recent-chip {
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  cursor: pointer;
  transition: border-color var(--transition);
}
.recent-chip:hover {
  border-color: var(--p-primary-color);
}
.recent-chip__nama {
  font-weight: 600;
  font-size: 0.875rem;
}
.recent-chip__meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--app-text-muted);
  margin-top: 0.25rem;
}

/* Signa & dosis */
.signa-form {
  display: grid;
  gap: 0.875rem;
}
.signa-obat-nama {
  margin: 0;
  font-weight: 700;
}
.signa-dosis {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.signa-dosis :deep(.p-inputnumber) {
  min-width: 0;
}
.signa-x {
  color: var(--app-text-muted);
  font-weight: 700;
}
.signa-durasi {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.signa-jumlah-opt {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.signa-jumlah-opt label {
  font-size: 0.875rem;
  font-weight: 400;
  cursor: pointer;
}
.signa-jumlah-custom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.625rem;
  margin: 0.5rem 0 0 1.625rem;
}
.field__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.petunjuk-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}
.petunjuk-chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-panel);
  color: var(--app-text);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.petunjuk-chip:hover {
  border-color: var(--p-primary-color);
}
.petunjuk-chip--on {
  border-color: var(--p-primary-color);
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

/* Racikan */
.racikan-form {
  display: grid;
  gap: 0.875rem;
}
.racikan-form__hdr {
  display: flex;
  gap: 0.75rem;
}
.racikan-form__items-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.racikan-form__items {
  display: grid;
  gap: 0.375rem;
}
.racikan-row {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
}
.racikan-row__no {
  color: var(--app-text-muted);
  font-size: 0.8125rem;
}

/* Template */
.tmpl-toolbar {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.tmpl-list {
  display: grid;
  gap: 0.625rem;
}
.tmpl-card {
  padding: 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.tmpl-card__hdr {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.tmpl-card__hdr small {
  display: block;
}
.tmpl-card__actions {
  display: flex;
  gap: 0.25rem;
}
.tmpl-card__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.5rem;
}
.tmpl-chip {
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  border-radius: 999px;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
}
.tmpl-add {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.tmpl-add__panel {
  display: grid;
  gap: 0.5rem;
  align-content: start;
}
.tmpl-add__title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 700;
  font-size: 0.875rem;
}
.tmpl-obat-list {
  display: grid;
  gap: 0.375rem;
  max-height: 18rem;
  overflow-y: auto;
}
.tmpl-obat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  font-size: 0.875rem;
}

@media (max-width: 1100px) {
  .terapi-wrapper {
    grid-template-columns: 1fr;
  }
  .terapi-sidebar {
    order: 1;
    position: static;
    max-height: none;
  }
  .terapi-main {
    order: 2;
  }
}
@media (max-width: 640px) {
  .tmpl-add {
    grid-template-columns: 1fr;
  }
}
</style>
