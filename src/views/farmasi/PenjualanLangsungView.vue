<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  getPosSetting,
  getShiftAktif,
  bukaShift,
  tutupShift,
  cariObatKasir,
  cariPelanggan,
  checkoutPenjualan,
  getRecentSales,
  voidTransaksi,
  PAYMENT_OPTIONS,
  PAYMENT_TUNAI,
  PAYMENT_PIUTANG
} from '@/services/penjualan'
import { formatTanggal } from '@/utils/tanggal'

const toast = useToast()
const confirm = useConfirm()

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
function onSearchInput() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(muatObat, 350)
}

function hargaJualUntukSatuan(barang, batch, satuan) {
  if (satuan === barang.SATUAN_SEDANG) return Number(batch.HARGAJUAL_SEDANG) || 0
  if (satuan === barang.SATUAN_BESAR) return Number(batch.HARGAJUAL_BESAR) || 0
  return Number(batch.HARGAJUAL_KECIL) || 0
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
    showDiskon: false
  }
}

function addToCart(barang) {
  const batch = barang.batches?.[0]
  if (!batch || Number(batch.QTY) <= 0) {
    toast.add({ severity: 'warn', summary: 'Stok habis', detail: barang.NAMA, life: 3000 })
    return
  }
  const satuan = barang.SATUAN_KECIL
  const existing = cart.value.find((i) => i.key === `${barang.BARCODE}__${batch.SUB_BARCODE}__${satuan}`)
  if (existing) {
    if (existing.qty < Number(batch.QTY)) existing.qty++
    else toast.add({ severity: 'warn', summary: 'Stok tidak cukup', detail: barang.NAMA, life: 3000 })
    return
  }
  cart.value.push(buatBarisCart(barang, batch, satuan))
}

// Baris baru untuk barang+batch yang sama dengan satuan lain yang belum dipakai —
// dipakai kalau pembeli mau sebagian dalam satuan berbeda (mis. 1 Box + 3 Strip lepas).
function tambahSatuanLain(item) {
  const dipakai = new Set(cart.value.filter((i) => i.barang.BARCODE === item.barang.BARCODE && i.batch.SUB_BARCODE === item.batch.SUB_BARCODE).map((i) => i.satuan))
  const satuanBaru = satuanOptions(item.barang).find((s) => !dipakai.has(s))
  if (!satuanBaru) {
    toast.add({ severity: 'info', summary: 'Info', detail: 'Semua satuan untuk barang ini sudah ada di keranjang', life: 3000 })
    return
  }
  cart.value.push(buatBarisCart(item.barang, item.batch, satuanBaru))
}

function onChangeSatuan(item) {
  item.harga = hargaJualUntukSatuan(item.barang, item.batch, item.satuan)
}
function incQty(item) {
  if (item.qty < Number(item.batch.QTY)) item.qty++
  else toast.add({ severity: 'warn', summary: 'Stok tidak cukup', detail: item.barang.NAMA, life: 3000 })
}
function decQty(item) {
  if (item.qty > 1) item.qty--
}
function toggleDiskon(item) {
  item.showDiskon = !item.showDiskon
  if (!item.showDiskon) item.discount = 0
}
function removeItem(item) {
  cart.value = cart.value.filter((i) => i.key !== item.key)
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
  return Math.round(qty * harga * (1 - diskon / 100))
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
        DISCOUNT_TYPE: 'PERSEN'
      }))
    })
    toast.add({ severity: 'success', summary: 'Transaksi berhasil', detail: `No. struk ${hasil.RECEIPT_NO}`, life: 5000 })
    showPembayaran.value = false
    clearCart()
    muatObat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Checkout gagal', detail: err.message, life: 5000 })
  } finally {
    checkingOut.value = false
  }
}

// ── Riwayat transaksi & void ─────────────────────────────────
const showRiwayat = ref(false)
const riwayat = ref([])
const loadingRiwayat = ref(false)
const voidingReceipt = ref(null)

async function bukaRiwayat() {
  showRiwayat.value = true
  await muatRiwayat()
}
async function muatRiwayat() {
  loadingRiwayat.value = true
  try {
    riwayat.value = await getRecentSales(pakaiShift.value ? shift.value?.ID : null)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat riwayat', detail: err.message, life: 5000 })
  } finally {
    loadingRiwayat.value = false
  }
}
function konfirmasiVoid(r) {
  confirm.require({
    header: 'Batalkan transaksi?',
    message: `${r.RECEIPT_NO} akan dibatalkan dan stok yang terjual akan dikembalikan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Batalkan',
    rejectLabel: 'Tidak',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => prosesVoid(r)
  })
}
async function prosesVoid(r) {
  voidingReceipt.value = r.RECEIPT_NO
  try {
    await voidTransaksi(r.RECEIPT_NO)
    toast.add({ severity: 'success', summary: 'Transaksi dibatalkan', detail: r.RECEIPT_NO, life: 3500 })
    await muatRiwayat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membatalkan', detail: err.message, life: 5000 })
  } finally {
    voidingReceipt.value = null
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
        <Button icon="pi pi-history" label="Riwayat" severity="secondary" outlined @click="bukaRiwayat" />
        <template v-if="pakaiShift">
          <Button v-if="!shift" icon="pi pi-lock-open" label="Buka shift" :loading="loadingShift" @click="bukaDialogShift" />
          <Button v-else icon="pi pi-lock" label="Tutup shift" severity="warn" @click="bukaDialogTutupShift" />
        </template>
      </div>
    </header>

    <p v-if="loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat kasir...</p>

    <div v-else-if="!siapTransaksi" class="notice notice--lock">
      <i class="pi pi-lock" style="font-size: 1.5rem" />
      <div>
        <p class="notice__title">Shift kasir belum dibuka</p>
        <p class="notice__sub">Buka shift dengan modal kas awal untuk mulai bertransaksi.</p>
      </div>
      <Button label="Buka shift sekarang" icon="pi pi-lock-open" @click="bukaDialogShift" />
    </div>

    <div v-else class="pos-grid">
      <!-- LEFT: cari & pilih obat -->
      <section class="panel">
        <header class="panel__header toolbar">
          <IconField class="toolbar__search">
            <InputIcon class="pi pi-search" />
            <InputText v-model="searchQuery" placeholder="Cari nama obat atau kode barcode..." fluid @input="onSearchInput" @keydown.enter="muatObat" />
          </IconField>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loadingSearch" aria-label="Muat ulang" @click="muatObat" />
        </header>

        <p v-if="loadingSearch" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat obat...</p>
        <p v-else-if="!searchResults.length" class="empty">{{ searchQuery ? 'Obat tidak ditemukan atau stok kosong.' : 'Ketik nama obat untuk mulai mencari.' }}</p>
        <div v-else class="produk-grid">
          <button
            v-for="barang in searchResults"
            :key="barang.BARCODE"
            type="button"
            class="produk-card"
            :disabled="!barang.batches?.[0] || Number(barang.batches[0].QTY) <= 0"
            @click="addToCart(barang)"
          >
            <span class="produk-nama">{{ barang.NAMA }}</span>
            <span class="produk-meta">
              <span>{{ barang.KATEGORI || '—' }}</span>
              <span v-if="formatExpSingkat(barang.batches?.[0]?.TGL_EXPIRED)" class="produk-exp">{{ formatExpSingkat(barang.batches[0].TGL_EXPIRED) }}</span>
            </span>
            <span class="produk-bottom">
              <span class="produk-harga">{{ rupiah.format(barang.batches?.[0]?.HARGAJUAL_KECIL || 0) }}</span>
              <span class="produk-stok">{{ barang.batches?.[0]?.QTY || 0 }} {{ barang.SATUAN_KECIL }}</span>
            </span>
          </button>
        </div>
      </section>

      <!-- RIGHT: keranjang & pembayaran -->
      <section class="panel cart-panel">
        <header class="panel__header">
          <h2 class="panel__title"><i class="pi pi-shopping-cart" /> Keranjang <Tag v-if="cart.length" :value="`${cart.length} item`" severity="secondary" /></h2>
          <Button v-if="cart.length" icon="pi pi-trash" text rounded size="small" severity="danger" v-tooltip.top="'Kosongkan keranjang'" @click="clearCart" />
        </header>

        <p v-if="!cart.length" class="empty">Belum ada item di keranjang.</p>
        <ul v-else class="cart-list">
          <li v-for="item in cart" :key="item.key" class="cart-item">
            <div class="cart-item__row1">
              <span class="strong">{{ item.barang.NAMA }}</span>
              <Button icon="pi pi-times" text rounded severity="danger" size="small" aria-label="Hapus item" @click="removeItem(item)" />
            </div>
            <div class="cart-item__row2">
              <Select
                v-if="satuanOptions(item.barang).length > 1"
                v-model="item.satuan"
                :options="satuanOptions(item.barang)"
                class="cart-item__satuan"
                @change="onChangeSatuan(item)"
              />
              <span v-else class="cart-item__satuan-label">{{ item.satuan }}</span>
              <span class="cart-item__harga mono">{{ rupiah.format(item.harga) }}</span>
              <Button
                v-if="posSetting.IZINKAN_DISKON_ITEM"
                icon="pi pi-percentage"
                text
                rounded
                size="small"
                :severity="item.showDiskon ? 'warn' : 'secondary'"
                v-tooltip.top="'Diskon item'"
                @click="toggleDiskon(item)"
              />
              <div class="cart-item__stepper">
                <button type="button" class="stepper-btn" @click="decQty(item)"><i class="pi pi-minus" /></button>
                <span class="mono">{{ item.qty }}</span>
                <button type="button" class="stepper-btn" @click="incQty(item)"><i class="pi pi-plus" /></button>
              </div>
              <span class="cart-item__total mono">{{ rupiah.format(lineTotal(item)) }}</span>
            </div>
            <div v-if="item.showDiskon" class="cart-item__row3">
              <label>Diskon</label>
              <InputNumber v-model="item.discount" :min="0" :max="100" suffix="%" />
            </div>
            <button type="button" class="cart-item__tambah-satuan" @click="tambahSatuanLain(item)">
              <i class="pi pi-plus" /> Tambah satuan lain
            </button>
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

    <!-- Dialog riwayat transaksi & void -->
    <Dialog v-model:visible="showRiwayat" header="Transaksi terakhir" modal :style="{ width: '40rem', maxWidth: '96vw' }">
      <Button label="Muat ulang" icon="pi pi-refresh" size="small" severity="secondary" outlined :loading="loadingRiwayat" class="mb" @click="muatRiwayat" />
      <p v-if="loadingRiwayat" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat transaksi...</p>
      <p v-else-if="!riwayat.length" class="empty">Belum ada transaksi.</p>
      <ul v-else class="riwayat-list">
        <li v-for="r in riwayat" :key="r.RECEIPT_NO" class="riwayat-item" :class="{ 'riwayat-item--void': r.STATUS_PROGRESS === 'VOID' || r.MODE === 'VOID' }">
          <div>
            <span class="mono strong">{{ r.RECEIPT_NO }}</span>
            <small class="sub">{{ formatTanggal(r.TANGGAL) }} — {{ r.IDUSER }}</small>
          </div>
          <div class="riwayat-item__right">
            <span class="mono">{{ rupiah.format(r.GRANDTOTAL || 0) }}</span>
            <Button
              icon="pi pi-times-circle"
              text
              rounded
              severity="danger"
              size="small"
              :loading="voidingReceipt === r.RECEIPT_NO"
              v-tooltip.top="'Batalkan transaksi'"
              @click="konfirmasiVoid(r)"
            />
          </div>
        </li>
      </ul>
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

.pos-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(20rem, 1fr);
  gap: 1.25rem;
  align-items: start;
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

.cart-panel {
  position: sticky;
  top: 0;
}
.cart-list {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
  max-height: 20rem;
  overflow-y: auto;
}
.cart-item {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--app-border);
}
.cart-item__row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}
.cart-item__row2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
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
  width: 6rem;
  flex-shrink: 0;
}
.cart-item__satuan-label {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  min-width: 4rem;
}
.cart-item__harga {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  min-width: 4.5rem;
}
.cart-item__stepper {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  padding: 0.125rem 0.5rem;
}
.stepper-btn {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--app-text-muted);
  display: flex;
  align-items: center;
  padding: 0.125rem;
}
.stepper-btn:hover {
  color: var(--p-primary-color);
}
.cart-item__total {
  font-weight: 600;
  white-space: nowrap;
  margin-left: auto;
}
.cart-item__tambah-satuan {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
  border: none;
  background: none;
  color: var(--p-primary-color);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}
.cart-item__tambah-satuan:hover {
  text-decoration: underline;
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

.riwayat-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.riwayat-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--app-border);
}
.riwayat-item--void {
  opacity: 0.55;
}
.riwayat-item__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

@media (max-width: 991px) {
  .pos-grid {
    grid-template-columns: 1fr;
  }
  .cart-panel {
    position: static;
  }
}
</style>
