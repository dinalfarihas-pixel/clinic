/**
 * Stock Opname klinik — ws_posindo_v2.1 (/api/stockopname/*). Yang dihitung adalah batch
 * (SUB_BARCODE), per bulan (bulanTahun 'YYYY-MM'). Simpan langsung mengubah stok.
 * Qty selalu satuan kecil di respons; saat simpan boleh pakai satuan sedang/besar.
 */
import { apotik } from './http'
import { getIdClient, getIdLokasi, getUserId } from './session'

const BASE = '/index.php/api/stockopname'

function cek(res, pesan) {
  if (String(res?.metadata?.code) !== '200') throw new Error(res?.metadata?.message || pesan)
  return res.response
}

/** Bulan berjalan 'YYYY-MM' — satu-satunya bulan yang boleh disimpan. */
export function bulanIni() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Date -> 'YYYY-MM'. */
export const toBulanTahun = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Daftar barang + progress batch. Respons: { ITEMS, TOTAL, PAGE, LIMIT }. */
export async function getBarangOpname({ bulanTahun, page = 1, limit = 20, search, kategori }) {
  const res = await apotik.get(`${BASE}/barang_list`, {
    idLokasi: getIdLokasi(), bulanTahun, page, limit, search, KATEGORI: kategori
  })
  return cek(res, 'Gagal memuat daftar barang')
}

/** Dropdown filter kategori (array string). */
export async function getKategoriOpname() {
  const res = await apotik.get(`${BASE}/kategori_list`, { idLokasi: getIdLokasi() })
  const rows = cek(res, 'Gagal memuat kategori')
  return Array.isArray(rows) ? rows : []
}

/** Batch satu barang. Respons: { BARANG, BATCHES }. */
export async function getBatchOpname(barcode, bulanTahun) {
  const res = await apotik.get(`${BASE}/batch_list`, { idLokasi: getIdLokasi(), barcode, bulanTahun })
  return cek(res, 'Gagal memuat batch')
}

/** Batch lintas barang di satu rak. Respons: { RAK, BATCHES } (tiap batch punya BARCODE, NAMA_BARANG). */
export async function getBatchOpnameByRak(idRak, bulanTahun) {
  const res = await apotik.get(`${BASE}/batch_list_by_rak`, { idLokasi: getIdLokasi(), idRak, bulanTahun })
  return cek(res, 'Gagal memuat batch rak')
}

/**
 * Simpan hasil hitung fisik (satu transaksi, langsung mengubah stok).
 * `items`: [{ SUB_BARCODE, QTY, SATUAN?, CATATAN? }]. Mengembalikan { JUMLAH_ITEM, DETAIL }.
 */
export async function simpanOpname(bulanTahun, items) {
  const res = await apotik.post(`${BASE}/simpan`, {}, {
    ID_CLIENT: getIdClient(), ID_LOKASI: getIdLokasi(), ID_USER: getUserId(), BULAN_TAHUN: bulanTahun, ITEMS: items
  })
  return cek(res, 'Gagal menyimpan opname')
}

/** Laporan seluruh hitungan. `kategori` huruf kecil di endpoint ini. Respons: { ITEMS, TOTAL, PAGE, LIMIT }. */
export async function getRiwayatOpname({ bulanTahun, kategori, search, page = 1, limit = 20 }) {
  const res = await apotik.get(`${BASE}/riwayat_transaksi`, {
    idLokasi: getIdLokasi(), bulanTahun, kategori: kategori ? kategori.toLowerCase() : '', search, page, limit
  })
  return cek(res, 'Gagal memuat riwayat opname')
}

/** Hapus satu baris riwayat (TIDAK mengembalikan stok). `tanggalOpname` persis dari baris riwayat. */
export async function voidRiwayat(subBarcode, tanggalOpname) {
  const res = await apotik.post(`${BASE}/void_riwayat`, {}, {
    ID_CLIENT: getIdClient(), ID_LOKASI: getIdLokasi(), SUB_BARCODE: subBarcode, TANGGAL_OPNAME: tanggalOpname
  })
  return cek(res, 'Gagal membatalkan riwayat')
}
