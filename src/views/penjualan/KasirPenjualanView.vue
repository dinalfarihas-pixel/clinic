<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getPosSetting,
  getShiftAktif,
  bukaShift,
  tutupShift,
  cariObatKasir,
  cariPelanggan,
  checkoutPenjualan,
  PAYMENT_OPTIONS,
  PAYMENT_TUNAI,
  PAYMENT_PIUTANG
} from '@/services/penjualan'
import { bukaStruk, labelBayar } from '@/utils/penjualan'

const toast = useToast()
const router = useRouter()
const auth = useAuthStore()

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

const loading = ref(true)
const posSetting = ref({ PAKAI_SHIFT: 0, IZINKAN_DISKON_ITEM: 1, IZINKAN_DISKON_BILL: 1, IZINKAN_PIUTANG: 1 })
const shift = ref(null)
const loadingShift = ref(false)

const pakaiShift = computed(() => Number(posSetting.value.PAKAI_SHIFT) === 1)
const siapTransaksi = computed(() => !pakaiShift.value || !!shift.value)

async function muatAwal() {
  loading.value = true
  try {
    const [setting, shiftAktif] = await Promise.all([getPosSetting(), getShiftAktif()])
    posSetting.value = setting
    shift.value = shiftAktif
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat pengaturan kasir', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

// ── Buka / tutup shift ─────────────────────────────────────────
const showBukaShift = ref(false)
const modalAwal = ref(null)
const savingBukaShift = ref(false)

function bukaDialogShift() {
  modalAwal.value = null
  showBukaShift.value = true
}
async function simpanBukaShift() {
  if (modalAwal.value == null || modalAwal.value < 0) {
    toast.add({ severity: 'warn', summary: 'Validasi', detail: 'Modal awal wajib diisi', life: 3000 })
    return
  }
  savingBukaShift.value = true
  loadingShift.value = true
  try {
    await bukaShift(modalAwal.value)
    shift.value = await getShiftAktif()
    showBukaShift.value = false
    toast.add({ severity: 'success', summary: 'Shift dibuka', life: 3000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membuka shift', detail: err.message, life: 5000 })
  } finally {
    savingBukaShift.value = false
    loadingShift.value = false
  }
}

const showTutupShift = ref(false)
const modalAkhir = ref(null)
const catatanTutup = ref('')
const savingTutupShift = ref(false)
const hasilTutupShift = ref(null)

function bukaDialogTutupShift() {
  if (cart.value.length > 0) {
    toast.add({ severity: 'warn', summary: 'Keranjang belum kosong', detail: 'Selesaikan atau kosongkan transaksi berjalan sebelum tutup shift', life: 4000 })
    return
  }
  modalAkhir.value = null
  catatanTutup.value = ''
  hasilTutupShift.value = null
  showTutupShift.value = true
}
async function simpanTutupShift() {
  if (modalAkhir.value == null || modalAkhir.value < 0) {
    toast.add({ severity: 'warn', summary: 'Validasi', detail: 'Kas fisik akhir wajib diisi', life: 3000 })
    return
  }
  savingTutupShift.value = true
  try {
    hasilTutupShift.value = await tutupShift(shift.value.ID, modalAkhir.value, catatanTutup.value)
    toast.add({ severity: 'success', summary: 'Shift ditutup', life: 3000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menutup shift', detail: err.message, life: 5000 })
  } finally {
    savingTutupShift.value = false
  }
}
function selesaiTutupShift() {
  showTutupShift.value = false
  shift.value = null
  hasilTutupShift.value = null
}

// ── Cari & tambah obat ───────────────────────────────────────
const searchQuery = ref('')
const searchResults = ref([])
const loadingSearch = ref(false)
let searchTimeout = null

async function muatObat() {
  loadingSearch.value = true
  try {
    searchResults.value = await cariObatKasir(searchQuery.value.trim())
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mencari obat', detail: err.message, life: 5000 })
  } finally {
    loadingSearch.value = false
  }
}
watch(searchQuery, (val) => {
  clearTimeout(searchTimeout)
  if (!val.trim()) {
    searchResults.value = []
    return
  }
  searchTimeout = setTimeout(muatObat, 350)
})

// Enter (mis. hasil scan barcode): cari langsung, kalau cuma ada 1 baris yang bisa dijual → masuk keranjang.
async function onSearchEnter() {
  clearTimeout(searchTimeout)
  if (!searchQuery.value.trim()) return
  await muatObat()
  const rows = flatResults.value.filter((r) => !rowDisabled(r))
  if (rows.length === 1) {
    addToCart(rows[0].barang, rows[0].batch)
    searchQuery.value = ''
  }
}

// Satu kartu per batch — barang multi-batch langsung tampil semua batchnya.
const viewMode = ref('card')
const flatResults = computed(() =>
  searchResults.value.flatMap((barang) => {
    const batches = barang.batches?.length ? barang.batches : [null]
    return batches.map((batch, idx) => ({
      barang,
      batch,
      key: `${barang.BARCODE}-${batch?.SUB_BARCODE ?? idx}`,
      multiBatch: (barang.batches?.length ?? 0) > 1
    }))
  })
)
const rowDisabled = (row) => !row.batch || Number(row.batch.QTY) <= 0
const rowHarga = (row) => hargaKecil(row.batch)
function expClass(tgl) {
  if (!tgl) return 'exp-none'
  const days = (new Date(tgl) - new Date()) / 86400000
  if (days < 0) return 'exp-kadaluarsa'
  if (days < 90) return 'exp-soon'
  return 'exp-ok'
}

// Fallback mengikuti kasir apotek: kalau tier harga belum ada, hitung proporsional dari harga kecil.
const hargaKecil = (batch) => Number(batch?.HARGAJUAL_KECIL ?? batch?.HARGAJUAL ?? batch?.HARGA ?? 0)
function hargaJualUntukSatuan(barang, batch, satuan) {
  if (satuan === barang.SATUAN_SEDANG) return Number(batch.HARGAJUAL_SEDANG ?? Math.round(hargaKecil(batch) * faktor(barang, satuan)))
  if (satuan === barang.SATUAN_BESAR) return Number(batch.HARGAJUAL_BESAR ?? Math.round(hargaKecil(batch) * faktor(barang, satuan)))
  return hargaKecil(batch)
}
function satuanOptions(barang) {
  return [barang.SATUAN_KECIL, barang.SATUAN_SEDANG, barang.SATUAN_BESAR].filter(Boolean)
}
function formatExpSingkat(tgl) {
  if (!tgl) return ''
  const d = new Date(tgl)
  return isNaN(d) ? '' : `Exp ${d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })}`
}

// ── Keranjang ────────────────────────────────────────────────
const cart = ref([])

function buatBarisCart(barang, batch, satuan) {
  return {
    key: `${barang.BARCODE}__${batch.SUB_BARCODE}__${satuan}`,
    barang,
    batch,
    satuan,
    qty: 1,
    harga: hargaJualUntukSatuan(barang, batch, satuan),
    discount: 0,
    discountType: 'PERSEN'
  }
}

// Stok batch dihitung dalam satuan terkecil; tiap satuan dikonversi lewat faktor ini.
function faktor(barang, satuan) {
  const sedang = Number(barang.ISI_SEDANG_KE_KECIL) || 1
  if (satuan === barang.SATUAN_SEDANG) return sedang
  if (satuan === barang.SATUAN_BESAR) return (Number(barang.ISI_BESAR_KE_SEDANG) || 1) * sedang
  return 1
}
const groupKey = (i) => `${i.barang.BARCODE}__${i.batch.SUB_BARCODE}`

// Satu produk (barang+batch) = satu grup, bisa punya >1 baris satuan (mis. 1 Box + 3 Strip).
const groupedCart = computed(() => {
  const map = new Map()
  for (const i of cart.value) {
    const k = groupKey(i)
    if (!map.has(k)) map.set(k, { key: k, barang: i.barang, lines: [] })
    map.get(k).lines.push(i)
  }
  return [...map.values()]
})
const groupTotal = (g) => g.lines.reduce((s, i) => s + lineTotal(i), 0)

// Qty maksimum baris ini = sisa stok batch (setelah dikurangi baris satuan lain) / faktor satuannya.
function maxQty(item) {
  const lain = cart.value.filter((i) => i !== item && groupKey(i) === groupKey(item)).reduce((s, i) => s + i.qty * faktor(i.barang, i.satuan), 0)
  return Math.floor((Number(item.batch.QTY) - lain) / faktor(item.barang, item.satuan))
}
const stokWarn = (item) => toast.add({ severity: 'warn', summary: 'Stok tidak cukup', detail: item.barang.NAMA, life: 3000 })

function addToCart(barang, batch = barang.batches?.[0]) {
  if (!batch || Number(batch.QTY) <= 0) {
    toast.add({ severity: 'warn', summary: 'Stok habis', detail: barang.NAMA, life: 3000 })
    return
  }
  const satuan = barang.SATUAN_KECIL
  const existing = cart.value.find((i) => i.key === `${barang.BARCODE}__${batch.SUB_BARCODE}__${satuan}`)
  if (existing) return incQty(existing)
  cart.value.push(buatBarisCart(barang, batch, satuan))
}

function satuanTersedia(item) {
  const dipakai = cart.value.filter((i) => i !== item && groupKey(i) === groupKey(item)).map((i) => i.satuan)
  return satuanOptions(item.barang).filter((s) => !dipakai.includes(s))
}
function bisaTambahSatuan(group) {
  return group.lines.length < satuanOptions(group.barang).length
}
function tambahSatuanLain(group) {
  const item = group.lines[0]
  const satuanBaru = satuanTersedia({ ...item, satuan: null })[0]
  if (!satuanBaru) return
  const baris = buatBarisCart(item.barang, item.batch, satuanBaru)
  cart.value.push(baris)
  if (maxQty(baris) < 1) {
    cart.value.pop()
    stokWarn(item)
  }
}

function onChangeSatuan(item) {
  item.key = `${groupKey(item)}__${item.satuan}`
  item.harga = hargaJualUntukSatuan(item.barang, item.batch, item.satuan)
  if (item.qty > maxQty(item)) {
    item.qty = Math.max(maxQty(item), 1)
    stokWarn(item)
  }
}
function incQty(item) {
  if (item.qty < maxQty(item)) item.qty++
  else stokWarn(item)
}
function decQty(item) {
  if (item.qty > 1) item.qty--
}
function setQty(item, e) {
  const max = Math.max(maxQty(item), 1)
  let v = Math.floor(Number(e.target.value)) || 1
  if (v > max) {
    v = max
    stokWarn(item)
  }
  item.qty = Math.max(v, 1)
  e.target.value = item.qty
}
// Diskon per baris lewat popover: "%" dari harga, atau "Rp/u" (rupiah per satuan).
const discPopover = ref(null)
const discItem = ref(null)
const discValue = ref(0)
const discType = ref('PERSEN')
const DISC_TYPES = [
  { label: '%', value: 'PERSEN' },
  { label: 'Rp/u', value: 'RUPIAH' }
]
const adaDiskon = (i) => (Number(i.discount) || 0) > 0
const labelDiskon = (i) => (i.discountType === 'RUPIAH' ? `-${rupiah.format(i.discount)}/u` : `-${i.discount}%`)
function bukaDiskon(event, item) {
  discItem.value = item
  discValue.value = Number(item.discount) || 0
  discType.value = item.discountType
  discPopover.value.toggle(event)
}
function terapkanDiskon(hapus = false) {
  const max = discType.value === 'PERSEN' ? 100 : discItem.value.harga
  discItem.value.discount = hapus ? 0 : Math.min(Math.max(Number(discValue.value) || 0, 0), max)
  discItem.value.discountType = discType.value
  discPopover.value.hide()
}
function removeItem(item) {
  cart.value = cart.value.filter((i) => i.key !== item.key)
}
function removeGroup(group) {
  cart.value = cart.value.filter((i) => groupKey(i) !== group.key)
}
function clearCart() {
  cart.value = []
  selectedPelanggan.value = null
  potongan.value = 0
  note.value = ''
}

function lineTotal(item) {
  const qty = Number(item.qty) || 0
  const harga = Number(item.harga) || 0
  const diskon = Number(item.discount) || 0
  const net = item.discountType === 'RUPIAH' ? Math.max(harga - diskon, 0) : harga * (1 - diskon / 100)
  return Math.round(qty * net)
}

// ── Pelanggan (opsional) ─────────────────────────────────────
const pelangganQuery = ref('')
const pelangganResults = ref([])
const loadingPelanggan = ref(false)
const selectedPelanggan = ref(null)
let pelangganTimeout = null

function onPelangganInput() {
  clearTimeout(pelangganTimeout)
  pelangganTimeout = setTimeout(async () => {
    loadingPelanggan.value = true
    try {
      pelangganResults.value = await cariPelanggan(pelangganQuery.value)
    } catch {
      pelangganResults.value = []
    } finally {
      loadingPelanggan.value = false
    }
  }, 350)
}
function pilihPelanggan(p) {
  selectedPelanggan.value = p
  pelangganQuery.value = ''
  pelangganResults.value = []
}
function lepasPelanggan() {
  selectedPelanggan.value = null
}

// ── Pembayaran & checkout ────────────────────────────────────
const idPayment = ref(PAYMENT_TUNAI)
const potongan = ref(0)
const totalBayar = ref(0)
const note = ref('')
const checkingOut = ref(false)
const showSukses = ref(false)
const sukses = ref(null)
const showPembayaran = ref(false)

function bukaPembayaran() {
  if (!cart.value.length) {
    toast.add({ severity: 'warn', summary: 'Keranjang kosong', detail: 'Tambahkan minimal 1 item sebelum lanjut ke pembayaran', life: 3000 })
    return
  }
  if (idPayment.value !== PAYMENT_PIUTANG) totalBayar.value = grandTotal.value
  showPembayaran.value = true
}

const cartSubtotal = computed(() => cart.value.reduce((s, i) => s + lineTotal(i), 0))
const groupingDiskonPreview = computed(() => {
  const persen = Number(selectedPelanggan.value?.PERSEN_DISKON) || 0
  if (!selectedPelanggan.value?.ID_GROUPING || persen <= 0) return 0
  return Math.round((cartSubtotal.value * persen) / 100)
})
const grandTotal = computed(() => Math.max(cartSubtotal.value - (Number(potongan.value) || 0) - groupingDiskonPreview.value, 0))
const kembalian = computed(() => (Number(totalBayar.value) || 0) - grandTotal.value)

function onPilihPayment(kode) {
  idPayment.value = kode
  if (kode === PAYMENT_PIUTANG) totalBayar.value = 0
  else totalBayar.value = grandTotal.value
}

const canCheckout = computed(() => {
  if (!siapTransaksi.value || cart.value.length === 0) return false
  if (idPayment.value === PAYMENT_PIUTANG) return !!selectedPelanggan.value
  return (Number(totalBayar.value) || 0) >= grandTotal.value
})

async function doCheckout() {
  if (!canCheckout.value) {
    const detail = idPayment.value === PAYMENT_PIUTANG ? 'Piutang wajib terhubung ke pelanggan — cari pelanggan dulu' : 'Periksa kembali keranjang dan total bayar'
    toast.add({ severity: 'warn', summary: 'Belum bisa checkout', detail, life: 3500 })
    return
  }
  checkingOut.value = true
  try {
    const hasil = await checkoutPenjualan({
      idShift: shift.value?.ID,
      idPayment: idPayment.value,
      totalBayar: idPayment.value === PAYMENT_PIUTANG ? 0 : totalBayar.value,
      potongan: potongan.value || 0,
      note: note.value,
      nomr: selectedPelanggan.value?.NOMR || null,
      details: cart.value.map((i) => ({
        BARCODE: i.barang.BARCODE,
        SUB_BARCODE: i.batch.SUB_BARCODE,
        NAMA: i.barang.NAMA,
        MEREK: i.barang.MEREK || '',
        JENIS: i.barang.JENIS || '',
        SATUAN: i.satuan,
        QTY: i.qty,
        HARGA: i.harga,
        HARGABELI: Number(i.batch.HARGA) || 0,
        DISCOUNT: i.discount || 0,
        DISCOUNT_TYPE: i.discountType
      }))
    })
    sukses.value = {
      company: auth.company,
      alamat: auth.alamat,
      receiptNo: hasil.RECEIPT_NO,
      waktu: new Date().toISOString().slice(0, 10) + ' ' + new Date().toTimeString().slice(0, 8),
      kasir: auth.userId,
      pelanggan: selectedPelanggan.value?.NAMA || '',
      items: cart.value.map((i) => ({
        nama: i.barang.NAMA,
        qty: i.qty,
        satuan: i.satuan,
        harga: i.harga,
        diskon: i.discount > 0 ? (i.discountType === 'RUPIAH' ? `-${rupiah.format(i.discount)}/u` : `-${i.discount}%`) : '',
        total: lineTotal(i)
      })),
      subtotal: cartSubtotal.value,
      potongan: Number(hasil.POTONGAN) || 0,
      grandTotal: Number(hasil.GRANDTOTAL) || grandTotal.value,
      metode: labelBayar(idPayment.value),
      piutang: idPayment.value === PAYMENT_PIUTANG,
      totalBayar: Number(hasil.TOTALBAYAR) || 0,
      kembalian: Number(hasil.KEMBALIAN) || 0,
      note: note.value
    }
    showSukses.value = true
    showPembayaran.value = false
    clearCart()
    muatObat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Checkout gagal', detail: err.message, life: 5000 })
  } finally {
    checkingOut.value = false
  }
}

onMounted(muatAwal)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Penjualan langsung</h1>
        <p class="page-subtitle">Jual obat langsung ke pembeli tanpa resep dokter.</p>
      </div>
      <div class="header-actions">
        <Tag v-if="pakaiShift && shift" severity="success" :value="`Shift aktif — ${shift.IDUSER}`" icon="pi pi-check-circle" />
        <Tag v-else-if="pakaiShift && !loadingShift && !loading" severity="danger" value="Shift belum dibuka" icon="pi pi-times-circle" />
        <Button icon="pi pi-history" label="Riwayat" severity="secondary" outlined @click="router.push('/penjualan/riwayat')" />
        <Button icon="pi pi-wallet" label="Kas lain" severity="secondary" outlined @click="router.push('/penjualan/kas-lain')" />
        <Button icon="pi pi-chart-bar" label="Laporan" severity="secondary" outlined @click="router.push('/laporan')" />
        <template v-if="pakaiShift">
          <Button v-if="shift" icon="pi pi-lock" label="Tutup shift" severity="warn" @click="bukaDialogTutupShift" />
        </template>
      </div>
    </header>

    <p v-if="loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat kasir...</p>

    <div v-else-if="!siapTransaksi" class="lock-state">
      <div class="lock-state__icon"><i class="pi pi-lock" /></div>
      <h2 class="lock-state__title">Shift kasir belum dibuka</h2>
      <p class="lock-state__sub">Buka shift dengan modal kas awal (uang fisik di laci kasir) untuk mulai bertransaksi.</p>
      <Button label="Buka shift sekarang" icon="pi pi-lock-open" size="large" :loading="loadingShift" @click="bukaDialogShift" />
      <ul class="lock-state__steps">
        <li><i class="pi pi-wallet" /> Hitung kas di laci</li>
        <li><i class="pi pi-lock-open" /> Buka shift</li>
        <li><i class="pi pi-shopping-cart" /> Mulai berjualan</li>
      </ul>
    </div>

    <div v-else class="pos-grid">
      <!-- LEFT: cari & pilih obat -->
      <section class="panel">
        <header class="panel__header toolbar">
          <IconField class="toolbar__search">
            <InputIcon class="pi pi-search" />
            <InputText v-model="searchQuery" placeholder="Cari nama obat atau scan barcode..." fluid autofocus @keydown.enter="onSearchEnter" />
          </IconField>
          <div class="view-mode-toggle">
            <button type="button" class="view-mode-btn" :class="{ active: viewMode === 'card' }" v-tooltip.bottom="'Tampilan kartu'" @click="viewMode = 'card'"><i class="pi pi-th-large" /></button>
            <button type="button" class="view-mode-btn" :class="{ active: viewMode === 'table' }" v-tooltip.bottom="'Tampilan tabel'" @click="viewMode = 'table'"><i class="pi pi-table" /></button>
          </div>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loadingSearch" aria-label="Muat ulang" @click="muatObat" />
        </header>

        <div class="produk-wrap">
          <div v-if="loadingSearch" class="state-sm"><i class="pi pi-spin pi-spinner" /><span>Memuat obat...</span></div>
          <div v-else-if="!flatResults.length" class="state-sm">
            <i class="pi pi-inbox" />
            <span>{{ searchQuery ? 'Obat tidak ditemukan atau stok kosong.' : 'Ketik nama obat atau scan barcode untuk mulai' }}</span>
          </div>
          <div v-else-if="viewMode === 'card'" class="produk-grid">
            <button v-for="row in flatResults" :key="row.key" type="button" class="produk-card" :disabled="rowDisabled(row)" @click="addToCart(row.barang, row.batch)">
              <span class="produk-nama" :title="row.barang.NAMA">{{ row.barang.NAMA }}</span>
              <span class="produk-meta">
                <span v-if="row.barang.KATEGORI">{{ row.barang.KATEGORI }}</span>
                <span v-if="row.multiBatch" class="produk-batch mono">#{{ row.batch.SUB_BARCODE }}</span>
                <span v-if="row.batch?.TGL_EXPIRED" :class="expClass(row.batch.TGL_EXPIRED)">{{ formatExpSingkat(row.batch.TGL_EXPIRED) }}</span>
              </span>
              <span class="produk-bottom">
                <span class="produk-harga">{{ rupiah.format(rowHarga(row)) }}</span>
                <span class="produk-stok" :class="{ 'produk-stok--habis': rowDisabled(row) }">{{ rowDisabled(row) ? 'Habis' : `${row.batch.QTY} ${row.barang.SATUAN_KECIL || ''}` }}</span>
              </span>
            </button>
          </div>
          <table v-else class="produk-table">
            <thead>
              <tr><th>Nama obat</th><th>Kategori</th><th>Exp</th><th class="r">Harga</th><th class="r">Stok</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in flatResults" :key="row.key" :class="{ 'row-habis': rowDisabled(row) }" @click="!rowDisabled(row) && addToCart(row.barang, row.batch)">
                <td>
                  <span class="strong">{{ row.barang.NAMA }}</span>
                  <span v-if="row.multiBatch" class="produk-batch mono">#{{ row.batch.SUB_BARCODE }}</span>
                </td>
                <td>{{ row.barang.KATEGORI || '-' }}</td>
                <td><span v-if="row.batch?.TGL_EXPIRED" :class="expClass(row.batch.TGL_EXPIRED)">{{ formatExpSingkat(row.batch.TGL_EXPIRED) }}</span><template v-else>-</template></td>
                <td class="r mono strong">{{ rupiah.format(rowHarga(row)) }}</td>
                <td class="r" :class="{ 'produk-stok--habis': rowDisabled(row) }">{{ rowDisabled(row) ? 'Habis' : `${row.batch.QTY} ${row.barang.SATUAN_KECIL || ''}` }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- RIGHT: keranjang & pembayaran -->
      <section class="panel cart-panel">
        <header class="panel__header">
          <h2 class="panel__title"><i class="pi pi-shopping-cart" /> Keranjang <Tag v-if="cart.length" :value="`${cart.length} item`" severity="secondary" /></h2>
          <Button v-if="cart.length" icon="pi pi-trash" text rounded size="small" severity="danger" v-tooltip.top="'Kosongkan keranjang'" @click="clearCart" />
        </header>

        <div v-if="!cart.length" class="state-sm cart-empty">
          <i class="pi pi-shopping-cart" />
          <span>Keranjang masih kosong</span>
          <small>Cari obat di panel kiri untuk mulai transaksi</small>
        </div>
        <ul v-else class="cart-list">
          <li v-for="group in groupedCart" :key="group.key" class="cart-item">
            <div class="cart-item__head">
              <span class="strong cart-item__nama" :title="group.barang.NAMA">{{ group.barang.NAMA }}</span>
              <Button icon="pi pi-times" text rounded severity="danger" size="small" aria-label="Hapus item" @click="removeGroup(group)" />
            </div>

            <div v-for="item in group.lines" :key="item.key" class="cart-line" :class="{ 'cart-line--sub': group.lines.length > 1 }">
              <Select
                v-if="satuanOptions(item.barang).length > 1"
                v-model="item.satuan"
                :options="satuanTersedia(item)"
                class="cart-item__satuan"
                @change="onChangeSatuan(item)"
              />
              <span v-else class="cart-item__satuan-label">{{ item.satuan }}</span>
              <button
                v-if="posSetting.IZINKAN_DISKON_ITEM"
                type="button"
                class="disc-btn"
                :class="{ 'disc-btn--active': adaDiskon(item) }"
                v-tooltip.top="'Diskon item'"
                @click="bukaDiskon($event, item)"
              >
                <i class="pi pi-percentage" /><span v-if="adaDiskon(item)">{{ labelDiskon(item) }}</span>
              </button>
              <div class="cart-item__stepper">
                <button type="button" class="stepper-btn" @click="decQty(item)"><i class="pi pi-minus" /></button>
                <input type="number" class="qty-input mono" :value="item.qty" min="1" @change="setQty(item, $event)" />
                <button type="button" class="stepper-btn" @click="incQty(item)"><i class="pi pi-plus" /></button>
              </div>
              <button v-if="group.lines.length > 1" type="button" class="line-remove" v-tooltip.left="'Hapus baris satuan ini saja'" @click="removeItem(item)"><i class="pi pi-times" /></button>
              <div class="cart-item__total mono">
                <span v-if="adaDiskon(item)" class="total-strike">{{ rupiah.format(item.qty * item.harga) }}</span>
                {{ rupiah.format(lineTotal(item)) }}
                <span class="cart-item__harga mono">@ {{ rupiah.format(item.harga) }}</span>
              </div>
            </div>

            <button v-if="bisaTambahSatuan(group)" type="button" class="cart-item__tambah-satuan" @click="tambahSatuanLain(group)">
              <i class="pi pi-plus" /> Tambah satuan lain
            </button>
            <div v-if="group.lines.length > 1" class="cart-item__grouptotal">
              <span>Total {{ group.barang.NAMA }}</span>
              <b class="mono">{{ rupiah.format(groupTotal(group)) }}</b>
            </div>
          </li>
        </ul>

        <!-- Ringkasan total -->
        <div class="total-row"><span>Subtotal</span><span class="mono">{{ rupiah.format(cartSubtotal) }}</span></div>
        <div v-if="posSetting.IZINKAN_DISKON_BILL" class="field">
          <label>Potongan (Rp)</label>
          <InputNumber v-model="potongan" :min="0" fluid />
        </div>
        <div v-if="groupingDiskonPreview > 0" class="total-row"><span>Diskon tier pelanggan</span><span class="mono">- {{ rupiah.format(groupingDiskonPreview) }}</span></div>
        <div class="total-row total-row--grand"><span>Grand Total</span><span class="mono">{{ rupiah.format(grandTotal) }}</span></div>

        <Button label="Lanjut ke Pembayaran" icon="pi pi-arrow-right" iconPos="right" class="checkout-btn" :disabled="!cart.length" @click="bukaPembayaran" />
      </section>
    </div>

    <Popover ref="discPopover">
      <div v-if="discItem" class="disc-popover">
        <div class="strong">{{ discItem.barang.NAMA }}</div>
        <SelectButton v-model="discType" :options="DISC_TYPES" optionLabel="label" optionValue="value" :allowEmpty="false" />
        <InputNumber v-model="discValue" :min="0" :max="discType === 'PERSEN' ? 100 : discItem.harga" :maxFractionDigits="0" :placeholder="discType === 'PERSEN' ? '0%' : 'Rp 0 / satuan'" fluid autofocus @keydown.enter="terapkanDiskon()" />
        <div class="disc-popover__actions">
          <Button v-if="adaDiskon(discItem)" label="Hapus" text severity="danger" size="small" @click="terapkanDiskon(true)" />
          <Button label="Terapkan" size="small" class="disc-popover__apply" @click="terapkanDiskon()" />
        </div>
      </div>
    </Popover>

    <!-- Dialog pembayaran -->
    <Dialog v-model:visible="showPembayaran" header="Pembayaran" modal :closable="!checkingOut" :style="{ width: '28rem', maxWidth: '96vw' }">
      <div class="total-row total-row--grand mb"><span>Grand Total</span><span class="mono">{{ rupiah.format(grandTotal) }}</span></div>

      <div class="field">
        <label>Cara bayar</label>
        <SelectButton
          :modelValue="idPayment"
          :options="PAYMENT_OPTIONS"
          optionLabel="label"
          optionValue="kode"
          :allowEmpty="false"
          @update:modelValue="onPilihPayment"
        />
      </div>
      <div v-if="idPayment !== PAYMENT_PIUTANG" class="field">
        <label>Total bayar</label>
        <InputNumber v-model="totalBayar" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" fluid autofocus />
        <div class="quick-amounts">
          <button type="button" class="quick-amount-btn" @click="totalBayar = 10000">Rp 10.000</button>
          <button type="button" class="quick-amount-btn" @click="totalBayar = 50000">Rp 50.000</button>
          <button type="button" class="quick-amount-btn" @click="totalBayar = 100000">Rp 100.000</button>
          <button
            type="button"
            class="quick-amount-btn"
            :class="{ 'quick-amount-btn--active': totalBayar === grandTotal }"
            @click="totalBayar = grandTotal"
          >
            Uang Pas
          </button>
        </div>
        <div class="total-row" :class="{ 'hint--warn': kembalian < 0 }">
          <span>Kembalian</span>
          <span class="mono">{{ kembalian >= 0 ? rupiah.format(kembalian) : `-${rupiah.format(-kembalian)}` }}</span>
        </div>
      </div>
      <div v-else class="notice notice--info">
        <i class="pi pi-info-circle" />
        Piutang penuh sebesar grand total — wajib terhubung ke pelanggan.
      </div>

      <!-- Pelanggan opsional -->
      <div class="field">
        <label>Pelanggan <small>(opsional — wajib untuk piutang)</small></label>
        <div v-if="selectedPelanggan" class="pelanggan-chip">
          <i class="pi pi-user" />
          <span>{{ selectedPelanggan.NAMA }}<template v-if="selectedPelanggan.NAMA_GROUPING"> · {{ selectedPelanggan.NAMA_GROUPING }} ({{ selectedPelanggan.PERSEN_DISKON }}%)</template></span>
          <button type="button" class="pelanggan-chip__clear" @click="lepasPelanggan"><i class="pi pi-times" /></button>
        </div>
        <div v-else class="pelanggan-search">
          <div class="pelanggan-search__row">
            <IconField class="pelanggan-search__input">
              <InputIcon class="pi pi-search" />
              <InputText v-model="pelangganQuery" placeholder="Cari pelanggan (nama/No. HP/NIK)..." fluid @input="onPelangganInput" />
            </IconField>
            <Button label="Cari" icon="pi pi-search" severity="secondary" outlined @click="onPelangganInput" />
          </div>
          <ul v-if="pelangganResults.length" class="pelanggan-results">
            <li v-for="p in pelangganResults" :key="p.NOMR" @click="pilihPelanggan(p)">
              <span class="strong">{{ p.NAMA }}</span>
              <small class="sub">{{ p.NOTELP }}<template v-if="p.NAMA_GROUPING"> · {{ p.NAMA_GROUPING }} ({{ p.PERSEN_DISKON }}%)</template></small>
            </li>
          </ul>
          <p v-else-if="loadingPelanggan" class="hint"><i class="pi pi-spin pi-spinner" /> Mencari...</p>
        </div>
      </div>

      <div class="field">
        <label>Catatan <small>(opsional)</small></label>
        <Textarea v-model="note" rows="2" placeholder="Mis. minta dibungkus terpisah..." fluid />
      </div>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="checkingOut" @click="showPembayaran = false" />
        <Button label="Checkout" icon="pi pi-check" :disabled="!canCheckout" :loading="checkingOut" @click="doCheckout" />
      </template>
    </Dialog>

    <!-- Dialog buka shift -->
    <Dialog v-model:visible="showBukaShift" header="Buka shift kasir" modal :closable="!savingBukaShift" :style="{ width: '24rem' }">
      <div class="field">
        <label for="ma-awal">Modal kas awal <span class="req">*</span></label>
        <InputNumber id="ma-awal" v-model="modalAwal" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" fluid autofocus />
        <small class="hint">Masukkan jumlah kas fisik di laci kasir saat memulai shift.</small>
      </div>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="savingBukaShift" @click="showBukaShift = false" />
        <Button label="Buka shift" icon="pi pi-check" :loading="savingBukaShift" @click="simpanBukaShift" />
      </template>
    </Dialog>

    <!-- Dialog tutup shift -->
    <Dialog v-model:visible="showTutupShift" header="Tutup shift kasir" modal :closable="!savingTutupShift" :style="{ width: '28rem' }">
      <template v-if="!hasilTutupShift">
        <div class="field">
          <label for="ma-akhir">Kas fisik akhir (hasil hitung manual) <span class="req">*</span></label>
          <InputNumber id="ma-akhir" v-model="modalAkhir" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" fluid autofocus />
        </div>
        <div class="field">
          <label>Catatan <small>(opsional)</small></label>
          <Textarea v-model="catatanTutup" rows="2" placeholder="Mis. alasan selisih..." fluid />
        </div>
      </template>
      <div v-else class="tutup-result">
        <i class="pi pi-check-circle" style="font-size: 2rem; color: var(--p-green-500, #22c55e)" />
        <p class="strong">Shift berhasil ditutup</p>
        <div class="tutup-grid">
          <div><span>Total transaksi</span><b>{{ hasilTutupShift.JUMLAH_TRANSAKSI }}</b></div>
          <div><span>Total penjualan</span><b>{{ rupiah.format(hasilTutupShift.TOTAL_PENJUALAN_KOTOR) }}</b></div>
          <div><span>Total tunai</span><b>{{ rupiah.format(hasilTutupShift.TOTAL_TUNAI) }}</b></div>
          <div><span>Total non-tunai</span><b>{{ rupiah.format(hasilTutupShift.TOTAL_NONTUNAI) }}</b></div>
          <div><span>Modal akhir</span><b>{{ rupiah.format(hasilTutupShift.MODAL_AKHIR) }}</b></div>
          <div><span>Selisih</span><b>{{ rupiah.format(hasilTutupShift.SELISIH) }}</b></div>
        </div>
      </div>
      <template #footer>
        <template v-if="!hasilTutupShift">
          <Button label="Batal" severity="secondary" outlined :disabled="savingTutupShift" @click="showTutupShift = false" />
          <Button label="Tutup shift" icon="pi pi-check" severity="warn" :loading="savingTutupShift" @click="simpanTutupShift" />
        </template>
        <Button v-else label="Selesai" icon="pi pi-check" @click="selesaiTutupShift" />
      </template>
    </Dialog>

    <!-- Dialog transaksi berhasil -->
    <Dialog v-model:visible="showSukses" header="Transaksi berhasil" modal :style="{ width: '24rem', maxWidth: '96vw' }">
      <div v-if="sukses" class="sukses">
        <i class="pi pi-check-circle" style="font-size: 2.5rem; color: var(--p-green-500, #22c55e)" />
        <p class="strong mono">{{ sukses.receiptNo }}</p>
        <div class="total-row"><span>Grand total</span><span class="mono strong">{{ rupiah.format(sukses.grandTotal) }}</span></div>
        <div class="total-row"><span>{{ sukses.metode }}</span><span class="mono">{{ rupiah.format(sukses.totalBayar) }}</span></div>
        <div v-if="!sukses.piutang" class="total-row"><span>Kembalian</span><span class="mono strong">{{ rupiah.format(sukses.kembalian) }}</span></div>
      </div>
      <template #footer>
        <Button label="Transaksi baru" severity="secondary" outlined @click="showSukses = false" />
        <Button label="Cetak struk" icon="pi pi-print" @click="bukaStruk(sukses)" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.cart-panel .panel__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.lock-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  max-width: 30rem;
  margin: 3rem auto;
  padding: 2.5rem 1.5rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.lock-state__icon {
  display: grid;
  place-items: center;
  width: 4.5rem;
  height: 4.5rem;
  margin-bottom: 0.5rem;
  border-radius: 50%;
  background: var(--p-primary-50, #eff6ff);
  color: var(--p-primary-color);
  font-size: 1.75rem;
}
.lock-state__title {
  margin: 0;
  font-size: 1.25rem;
}
.lock-state__sub {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.lock-state__steps {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  justify-content: center;
  margin: 1.25rem 0 0;
  padding: 1rem 0 0;
  border-top: 1px dashed var(--app-border);
  list-style: none;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.lock-state__steps li {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.notice {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  margin-bottom: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  font-size: 0.875rem;
}
.notice--lock {
  background: var(--p-surface-100, #f1f5f9);
  color: var(--app-text-muted);
}
.notice--info {
  background: var(--p-blue-50, #eff6ff);
  color: var(--p-blue-700, #1d4ed8);
}
.notice__title {
  margin: 0;
  font-weight: 700;
  color: var(--app-text);
}
.notice__sub {
  margin: 0.125rem 0 0;
}

/* Workspace ala kasir: tinggi terkunci ke viewport, daftar obat & keranjang scroll di panelnya sendiri. */
.pos-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(23rem, 36vw, 30rem);
  gap: 0.75rem;
  align-items: stretch;
  height: calc(100dvh - 11rem);
  min-height: 26rem;
}
.pos-grid > .panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.produk-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.state-sm {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2.5rem 0.75rem;
  color: var(--app-text-muted);
  font-size: 0.8125rem;
  text-align: center;
}
.state-sm i {
  font-size: 1.8rem;
  opacity: 0.4;
}
.cart-empty {
  flex: 1;
}

.view-mode-toggle {
  display: flex;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}
.view-mode-btn {
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  background: var(--app-panel);
  color: var(--app-text-muted);
  cursor: pointer;
}
.view-mode-btn + .view-mode-btn {
  border-left: 1px solid var(--app-border);
}
.view-mode-btn.active {
  background: var(--p-primary-50, #eff6ff);
  color: var(--p-primary-color);
}

.produk-batch {
  background: var(--p-primary-50, #eff6ff);
  color: var(--p-primary-700, #1d4ed8);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.625rem;
}
.exp-ok {
  color: var(--p-green-600, #16a34a);
}
.exp-soon {
  color: var(--p-orange-500, #f97316);
  font-weight: 600;
}
.exp-kadaluarsa {
  color: var(--p-red-500, #ef4444);
  font-weight: 700;
}
.produk-stok--habis {
  color: var(--p-red-500, #ef4444);
  font-weight: 700;
}

.produk-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.produk-table th {
  position: sticky;
  top: 0;
  background: var(--app-panel);
  text-align: left;
  padding: 0.5rem;
  font-size: 0.75rem;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
}
.produk-table td {
  padding: 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.produk-table tbody tr {
  cursor: pointer;
}
.produk-table tbody tr:hover:not(.row-habis) {
  background: var(--p-primary-50, #eff6ff);
}
.produk-table .r {
  text-align: right;
}
.row-habis {
  opacity: 0.45;
  cursor: not-allowed !important;
}
.qty-input {
  width: 2.5rem;
  height: 26px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-panel);
  text-align: center;
  color: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  -moz-appearance: textfield;
}
.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.toolbar {
  flex-wrap: wrap;
}
.toolbar__search {
  flex: 1;
  min-width: 14rem;
}

.produk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.75rem;
}
.produk-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-panel);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition, 0.15s);
}
.produk-card:hover:not(:disabled) {
  border-color: var(--p-primary-color);
}
.produk-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.produk-nama {
  font-weight: 600;
  font-size: 0.875rem;
}
.produk-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.produk-exp {
  color: var(--p-green-600, #16a34a);
}
.produk-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.25rem;
  font-size: 0.8125rem;
}
.produk-harga {
  font-weight: 700;
  color: var(--p-primary-color);
}
.produk-stok {
  color: var(--app-text-muted);
  font-size: 0.75rem;
}

.cart-list {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.cart-item {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--app-border);
}
.cart-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.cart-item__nama {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cart-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.375rem;
}
.cart-line--sub {
  padding-left: 0.5rem;
  margin-left: 0.125rem;
  border-left: 2px solid var(--p-primary-100, #dbeafe);
}
.cart-line--sub + .cart-line--sub {
  padding-top: 0.375rem;
  border-top: 1px dashed var(--app-border);
}
.cart-item__satuan :deep(.p-select-label) {
  padding: 4px 8px;
  font-size: 0.72rem;
}
.disc-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-panel);
  color: var(--app-text-muted);
  font-size: 0.66rem;
  font-weight: 600;
  cursor: pointer;
}
.disc-btn:hover {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}
.disc-btn--active {
  background: var(--p-orange-50, #fff7ed);
  border-color: var(--p-orange-400, #fb923c);
  color: var(--p-orange-600, #ea580c);
}
.line-remove {
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  border-radius: 6px;
  color: var(--app-text-muted);
  font-size: 0.56rem;
  cursor: pointer;
}
.line-remove:hover {
  background: var(--p-red-50, #fef2f2);
  color: var(--p-red-500, #ef4444);
}
.disc-popover {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 14rem;
  padding: 0.25rem;
}
.disc-popover__actions {
  display: flex;
  align-items: center;
}
.disc-popover__apply {
  margin-left: auto;
}
.total-strike {
  font-size: 0.625rem;
  font-weight: 400;
  color: var(--app-text-muted);
  text-decoration: line-through;
}
.cart-item__grouptotal {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.375rem;
  padding: 0.375rem 0.5rem;
  border-radius: 6px;
  background: var(--p-surface-50, #f8fafc);
  font-size: 0.8125rem;
}
.cart-item__row3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.cart-item__row3 label {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.cart-item__satuan {
  width: 5.75rem;
  flex-shrink: 0;
}
.cart-item__satuan-label {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  min-width: 4rem;
}
.cart-item__harga {
  font-size: 0.6875rem;
  font-weight: 400;
  color: var(--app-text-muted);
  min-width: 0;
  white-space: nowrap;
}
.cart-item__stepper {
  display: flex;
  align-items: center;
  gap: 2px;
}
.stepper-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-panel);
  color: var(--app-text-muted);
  font-size: 0.625rem;
  cursor: pointer;
}
.stepper-btn:hover {
  background: var(--p-primary-50, #eff6ff);
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}
.cart-item__total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: 1;
  min-width: 4.25rem;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}
.cart-item__tambah-satuan {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  margin-top: 0.375rem;
  padding: 5px 8px;
  border: 1px dashed var(--app-border);
  border-radius: 6px;
  background: var(--app-panel);
  color: var(--app-text-muted);
  font-size: 0.6875rem;
  cursor: pointer;
}
.cart-item__tambah-satuan:hover {
  border-style: solid;
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}
.strong {
  font-weight: 600;
}
.sub {
  display: block;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.mono {
  font-variant-numeric: tabular-nums;
}

.field {
  display: grid;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}
.field label {
  font-size: 0.8125rem;
  font-weight: 600;
}
.field label small {
  font-weight: 400;
  color: var(--app-text-muted);
}
.req {
  color: var(--p-red-500);
}
.hint {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.hint--warn {
  color: var(--p-red-500);
}
.mt {
  margin-top: 0.75rem;
}
.mb {
  margin-bottom: 0.75rem;
}

.pelanggan-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  font-size: 0.8125rem;
}
.pelanggan-chip__clear {
  margin-left: auto;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--app-text-muted);
}
.quick-amounts {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}
.quick-amount-btn {
  flex: 1;
  min-width: 5rem;
  padding: 0.5rem 0.25rem;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-panel);
  color: var(--app-text);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}
.quick-amount-btn:hover {
  border-color: var(--p-primary-color);
}
.quick-amount-btn--active {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50, #eff6ff);
  color: var(--p-primary-color);
}

.pelanggan-search {
  position: relative;
}
.pelanggan-search__row {
  display: flex;
  gap: 0.5rem;
}
.pelanggan-search__input {
  flex: 1;
}
.pelanggan-results {
  position: absolute;
  z-index: 5;
  left: 0;
  right: 0;
  margin: 0.25rem 0 0;
  padding: 0.25rem;
  list-style: none;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  max-height: 12rem;
  overflow-y: auto;
}
.pelanggan-results li {
  padding: 0.375rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
}
.pelanggan-results li:hover {
  background: var(--p-surface-100, #f1f5f9);
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
  font-size: 0.875rem;
}
.total-row--grand {
  font-weight: 700;
  font-size: 1.0625rem;
  border-top: 1px solid var(--app-border);
  margin-top: 0.25rem;
  padding-top: 0.5rem;
}

.checkout-btn {
  width: 100%;
  margin-top: 0.5rem;
}

.tutup-result {
  text-align: center;
}
.tutup-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-top: 0.75rem;
  text-align: left;
  font-size: 0.8125rem;
}
.tutup-grid > div {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: var(--p-surface-50, #f8fafc);
  border-radius: 6px;
}

.sukses {
  display: grid;
  gap: 0.25rem;
  text-align: center;
}
.sukses .total-row {
  text-align: left;
}

@media (max-width: 991px) {
  .pos-grid {
    grid-template-columns: 1fr;
    height: auto;
  }
  .produk-wrap {
    max-height: 60dvh;
  }
}
</style>
