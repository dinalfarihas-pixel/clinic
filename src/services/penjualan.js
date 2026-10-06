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

// ── Riwayat & laporan (SalesLangsung, M_sales_langsung) ──────────
const SL = '/index.php/api/SalesLangsung'
const list = (res) => (Array.isArray(res?.response) ? res.response : [])

/**
 * Transaksi terakhir di lokasi ini (recent_sales, maks. 200), opsional cuma di satu shift.
 * Satu baris per item; header struk (GRANDTOTAL, POTONGAN, TOTALBAYAR, KEMBALIAN, IDPAYEMENT,
 * SISA_GRANDTOTAL) diulang di tiap baris. BATAL='1' = item sudah di-void. QTY dalam satuan kecil.
 */
export async function getRecentSales(idShift, limit = 20) {
  const params = { lokasiId: getIdLokasi(), limit }
  if (idShift) params.idShift = idShift
  return list(await apotik.get(`${SL}/recent_sales`, params))
}

/** Batalkan (void) seluruh transaksi — stok semua item di dalamnya dikembalikan. */
export async function voidTransaksi(receiptNo) {
  const res = await apotik.post(`${SL}/void`, {}, { RECEIPT_NO: receiptNo, IDCLIENT: getIdClient() })
  const code = String(res?.metadata?.code)
  if (code !== '200') throw new Error(res?.metadata?.message || 'Gagal membatalkan transaksi')
}

/** Batalkan satu item saja dari struk (stok item itu dikembalikan). */
export async function voidItem(receiptNo, idDetail) {
  const res = await apotik.post(`${SL}/void_item`, {}, { RECEIPT_NO: receiptNo, ID_DETAIL: idDetail, IDCLIENT: getIdClient() })
  if (String(res?.metadata?.code) !== '200') throw new Error(res?.metadata?.message || 'Gagal membatalkan item')
}

// f.lokasi: id lokasi (default lokasi login); 0/'' = tanpa lokasiId = gabungan semua lokasi (endpoint laporan saja; lainnya tetap wajib lokasiId)
// f.penjamin: kode m_carabayar, kosong = semua penjamin (hanya 5 endpoint laporan)
const periode = (dateStart, dateEnd, { lokasi = getIdLokasi(), penjamin } = {}) => ({
  ...(lokasi ? { lokasiId: lokasi } : {}),
  ...(penjamin ? { penjamin } : {}),
  dateStart,
  dateEnd
})

/** Penjamin untuk dropdown filter laporan. Item: KODE (1 = UMUM), NAMA. */
export async function getListPenjamin() {
  return list(await apotik.get(`${SL}/penjamin`, {}))
}

/** Semua lokasi client ini untuk filter laporan (get_list_stock_lokasi_v2 mode=1). Item: ID, DISPLAY, JENIS_LOKASI, dst. */
export async function getListLokasi() {
  const res = await apotik.post(`/index.php/api/Data_referensi/get_list_stock_lokasi_v2/${getIdClient()}/${getIdLokasi() || 0}/1`, {})
  return list(res)
}

/** Angka ringkasan periode: OMSET_PENJUALAN (= OMSET_TINDAKAN + OMSET_BARANG), NILAI_REFUND, TOTAL_TUNAI, TOTAL_NONTUNAI, TOTAL_PIUTANG_BARU (ketiganya null kalau f.penjamin bukan UMUM), JUMLAH_TRANSAKSI, dst. */
export async function getRingkasanKas(dateStart, dateEnd, f) {
  const res = await apotik.get(`${SL}/ringkasan_kas`, periode(dateStart, dateEnd, f))
  return res?.response ?? {}
}

/** Omzet per KATEGORI. Item: KATEGORI, JENIS (TINDAKAN|BARANG), JUMLAH_ITEM, TOTAL_QTY, TOTAL_NILAI (kotor; baris 'POTONGAN STRUK' negatif supaya SUM per JENIS = OMSET_TINDAKAN/OMSET_BARANG). */
export async function getRingkasanKategori(dateStart, dateEnd, f) {
  return list(await apotik.get(`${SL}/ringkasan_kategori`, periode(dateStart, dateEnd, f)))
}

/** Rekap per periode (groupBy: day | week | month | year). */
export async function getRingkasanHarian(dateStart, dateEnd, groupBy = 'day', f) {
  return list(await apotik.get(`${SL}/ringkasan_harian`, { ...periode(dateStart, dateEnd, f), groupBy }))
}

/** Barang terlaris (sortBy: qty | nilai). */
export async function getTopSelling(dateStart, dateEnd, sortBy = 'qty', limit = 20, f) {
  return list(await apotik.get(`${SL}/top_selling`, { ...periode(dateStart, dateEnd, f), sortBy, limit }))
}

/** Riwayat shift kasir di rentang tanggal. */
export async function getRiwayatShift(dateStart, dateEnd, lokasi) {
  return list(await apotik.get(`${SL}/riwayat_shift`, { ...periode(dateStart, dateEnd, { lokasi }), limit: 100 }))
}

// ── Kas lain: pemasukan/pengeluaran di luar penjualan (mis. gaji, listrik, setoran) ──
const cek = (res, pesan) => {
  if (String(res?.metadata?.code) !== '200') throw new Error(res?.metadata?.message || pesan)
  return res.response
}

/** Master kategori; JENIS: PEMASUKAN | PENGELUARAN, TIPE = induk/grup (mis. BIAYA OPERASIONAL). */
export async function getKategoriLain(jenis) {
  return list(await apotik.get(`${SL}/kategori_transaksi_lain`, { jenis }))
}
export async function simpanKategoriLain({ ID, NAMA, JENIS, TIPE }) {
  return cek(await apotik.post(`${SL}/kategori_transaksi_lain`, {}, { IDCLIENT: getIdClient(), ID, NAMA, JENIS, TIPE }), 'Gagal menyimpan kategori')
}
export async function hapusKategoriLain(id) {
  return cek(await apotik.post(`${SL}/kategori_transaksi_lain_hapus`, {}, { ID: id, IDCLIENT: getIdClient() }), 'Gagal menghapus kategori')
}

/** Entri kas lain di rentang tanggal (opsional filter jenis). */
export async function getTransaksiLain(dateStart, dateEnd, jenis) {
  return list(await apotik.get(`${SL}/transaksi_lain`, { ...periode(dateStart, dateEnd), jenis }))
}
export async function simpanTransaksiLain({ idKategori, tanggal, jumlah, keterangan }) {
  return cek(
    await apotik.post(`${SL}/transaksi_lain`, {}, {
      IDCLIENT: getIdClient(),
      ID_LOKASI: getIdLokasi(),
      ID_KATEGORI: idKategori,
      TANGGAL: tanggal,
      JUMLAH: jumlah,
      KETERANGAN: keterangan || '',
      IDUSER: getUserId()
    }),
    'Gagal menyimpan transaksi'
  )
}
export async function hapusTransaksiLain(id) {
  return cek(await apotik.post(`${SL}/transaksi_lain_hapus`, {}, { ID: id, IDCLIENT: getIdClient() }), 'Gagal menghapus transaksi')
}
