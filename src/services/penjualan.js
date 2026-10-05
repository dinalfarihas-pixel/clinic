/**
 * API penjualan langsung (kasir apotek, jual obat tanpa resep) — ws_posindo_v2.1
 * (M_sales_langsung), endpoint sama dengan views/sales/KasirView.vue di SIMRS (simrs_spa_v2),
 * dipersempit ke transaksi inti: tanpa racikan/puyer di kasir (racikan hidup di alur
 * pemeriksaan/SOAP dokter, bukan di sini), tanpa kaitan pendaftaran klinik (NO_REGISTER —
 * pembayaran tetap bisa dikaitkan ke pelanggan lewat NOMR), tanpa cetak struk otomatis, dan
 * tanpa halaman terpisah yang di reference ada di tab/route lain (dashboard kasir, transaksi
 * kas lain, rekap piutang, pengaturan kasir).
 */
import { apotik } from './http'
import { getIdClient, getIdLokasi, getUserId } from './session'

export const PAYMENT_TUNAI = 1
export const PAYMENT_NONTUNAI = 2
export const PAYMENT_PIUTANG = 3

export const PAYMENT_OPTIONS = [
  { kode: PAYMENT_TUNAI, label: 'Tunai' },
  { kode: PAYMENT_NONTUNAI, label: 'Non-tunai' },
  { kode: PAYMENT_PIUTANG, label: 'Piutang' }
]

/** Pengaturan kasir client ini (pos_setting) — pakai shift, boleh diskon item/bill, boleh piutang. */
export async function getPosSetting() {
  const res = await apotik.get('/index.php/api/SalesLangsung/pos_setting', {})
  return res?.response || { PAKAI_SHIFT: 0, IZINKAN_DISKON_ITEM: 1, IZINKAN_DISKON_BILL: 1, IZINKAN_PIUTANG: 1 }
}

/** Shift kasir yang sedang aktif milik user ini di lokasi ini (shift_aktif), atau null. */
export async function getShiftAktif() {
  const res = await apotik.get('/index.php/api/SalesLangsung/shift_aktif', { lokasiId: getIdLokasi(), idUser: getUserId() })
  return res?.response || null
}

/** Buka shift baru dengan modal kas awal (buka_shift). Mengembalikan ID_SHIFT. */
export async function bukaShift(modalAwal) {
  const res = await apotik.post(
    '/index.php/api/SalesLangsung/buka_shift',
    {},
    { IDCLIENT: getIdClient(), ID_LOKASI: getIdLokasi(), IDUSER: getUserId(), MODAL_AWAL: modalAwal }
  )
  if (String(res?.metadata?.code) !== '200') throw new Error(res?.metadata?.message || 'Gagal membuka shift')
  return res.response?.ID_SHIFT
}

/** Tutup shift (tutup_shift) — mengembalikan ringkasan closing (total transaksi, omzet, selisih, dst). */
export async function tutupShift(idShift, modalAkhir, catatan) {
  const res = await apotik.post(
    '/index.php/api/SalesLangsung/tutup_shift',
    {},
    { IDCLIENT: getIdClient(), ID_SHIFT: idShift, MODAL_AKHIR: modalAkhir, CATATAN: catatan || '' }
  )
  if (String(res?.metadata?.code) !== '200') throw new Error(res?.metadata?.message || 'Gagal menutup shift')
  return res.response
}

/**
 * Cari obat untuk kasir (barang_list) — cuma barang berstok > 0 & ditandai untuk dijual,
 * lengkap dengan batch (urut FIFO tanggal expired) + harga jual per tier siap pakai.
 * Item: BARCODE, NAMA, MEREK, KATEGORI, SATUAN_KECIL/SEDANG/BESAR, ISI_SEDANG_KE_KECIL,
 * ISI_BESAR_KE_SEDANG, QTY_TERSEDIA, batches: [{ SUB_BARCODE, QTY, HARGA (beli),
 * HARGAJUAL_KECIL, HARGAJUAL_SEDANG, HARGAJUAL_BESAR, TGL_EXPIRED }].
 */
export async function cariObatKasir(search) {
  const res = await apotik.get('/index.php/api/SalesLangsung/barang_list', { lokasiId: getIdLokasi(), search: search || '', limit: 50 })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Cari pelanggan (nama/no. telp, minimal 2 huruf) — sekalian status reseller & grouping/
 * diskon tier-nya kalau sudah di-assign. Item: NOMR, NAMA, NOTELP, ALAMAT, IS_RESELLER,
 * ID_GROUPING, NAMA_GROUPING, PERSEN_DISKON.
 */
export async function cariPelanggan(param) {
  if (!param || param.trim().length < 2) return []
  const res = await apotik.get('/index.php/api/SalesLangsung/pasien', { searchBy: 'all', param: param.trim(), limit: 20 })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Checkout (checkout) — memotong stok & mencatat transaksi.
 * `payload`: { idShift?, idPayment, totalBayar, potongan, note, nomr?,
 * details: [{ BARCODE, SUB_BARCODE, NAMA, MEREK, JENIS, SATUAN, QTY, HARGA, HARGABELI,
 * DISCOUNT, DISCOUNT_TYPE }] }.
 * Mengembalikan { RECEIPT_NO, GRANDTOTAL, POTONGAN, TOTALBAYAR, KEMBALIAN, ... }.
 */
export async function checkoutPenjualan(payload) {
  const res = await apotik.post('/index.php/api/SalesLangsung/checkout', {}, {
    IDCLIENT: getIdClient(),
    ID_LOKASI: getIdLokasi(),
    IDUSER: getUserId(),
    ID_SHIFT: payload.idShift || null,
    IDPAYEMENT: payload.idPayment,
    TOTALBAYAR: payload.totalBayar,
    POTONGAN: payload.potongan || 0,
    NOTE: payload.note || '',
    NOMR: payload.nomr || null,
    details: payload.details
  })
  const code = String(res?.metadata?.code)
  if (code !== '200') throw new Error(res?.metadata?.message || 'Checkout gagal')
  return res.response
}

/** Transaksi terakhir di lokasi ini (recent_sales), opsional cuma di satu shift. */
export async function getRecentSales(idShift) {
  const params = { lokasiId: getIdLokasi(), limit: 20 }
  if (idShift) params.idShift = idShift
  const res = await apotik.get('/index.php/api/SalesLangsung/recent_sales', params)
  return Array.isArray(res?.response) ? res.response : []
}

/** Batalkan (void) seluruh transaksi — stok semua item di dalamnya dikembalikan. */
export async function voidTransaksi(receiptNo) {
  const res = await apotik.post('/index.php/api/SalesLangsung/void', {}, { RECEIPT_NO: receiptNo, IDCLIENT: getIdClient() })
  const code = String(res?.metadata?.code)
  if (code !== '200') throw new Error(res?.metadata?.message || 'Gagal membatalkan transaksi')
}
