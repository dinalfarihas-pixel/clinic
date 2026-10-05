/**
 * API master jasa & tindakan — ws_posindo_v2.1 (modul inventory, tabel barang bucket "JASA"),
 * endpoint sama dengan views/Inventory/barang/JasaListView.vue di SIMRS (simrs_spa_v2), dipersempit
 * ke daftar inti: tanpa BarangFormModal penuh (form di sini cuma field yang relevan untuk jasa —
 * tanpa satuan sedang/besar, KFA/LOINC/SNOMED, klasifikasi obat/golongan, bentuk sediaan/rute,
 * yang semuanya spesifik farmasi), tanpa mode "grouped" list, tanpa import/export template Excel.
 */
import { apotik } from './http'
import { getIdLokasi } from './session'

export const BUCKET_JASA = 'JASA'

// Kategori bawaan bucket JASA di backend (M_master_barang::$kategori_mapping) — dipakai fallback
// bila endpoint kategori_list belum ada isinya untuk client ini.
export const KATEGORI_JASA_DEFAULT = ['TINDAKAN', 'PROSEDUR BEDAH', 'LABORATORIUM', 'RADIOLOGI', 'TENAGA AHLI', 'KEPERARAWATAN', 'PELAYANAN GIZI']

/**
 * Info lokasi yang sedang login — dipakai untuk cek gudang induk (hanya lokasi INDUK=1 yang
 * boleh menambah/mengubah master jasa, sama seperti master obat).
 */
export async function getInfoLokasi() {
  const res = await apotik.get('/index.php/api/inventory/lokasi_info', { lokasiId: getIdLokasi() })
  return res?.response || null
}

/** Kategori jasa (kategori_list?bucket=JASA). Item: id_kategori, NAMA_KATEGORI. */
export async function getKategoriJasa() {
  const res = await apotik.get('/index.php/api/inventory/kategori_list', { bucket: BUCKET_JASA })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Daftar jasa & tindakan (barang_list, bucket=JASA, maks. 1000 baris — sama seperti
 * getDaftarObat/getDaftarSupplier, filter & paginasi dilakukan di client).
 * Item: ID, IDBARANG, NAMA, KATEGORI, SATUAN_KECIL, HARGABELI, HARGAJUAL, CATATAN, ARSIPKAN.
 */
export async function getDaftarJasa() {
  const res = await apotik.get('/index.php/api/inventory/barang_list', {
    lokasiId: getIdLokasi(),
    bucket: BUCKET_JASA,
    limit: 1000,
    sortField: 'NAMA',
    sortOrder: 'ASC'
  })
  return Array.isArray(res?.response) ? res.response : []
}

function payloadJasa(jasa) {
  return {
    NAMA: jasa.NAMA,
    KATEGORI: jasa.KATEGORI,
    JENIS: 'JASA',
    SATUAN_KECIL: jasa.SATUAN_KECIL,
    HARGABELI: Number(jasa.HARGABELI) || 0,
    HARGAJUAL: Number(jasa.HARGAJUAL) || 0,
    CATATAN: jasa.CATATAN || '',
    POTONGSTOCK: 0,
    UNTUK_DIJUAL: 1
  }
}

/** Tambah jasa/tindakan baru (barang_create). Ditolak jika lokasi yang login bukan gudang induk. */
export async function tambahJasa(jasa) {
  const res = await apotik.post('/index.php/api/inventory/barang_create', { lokasiId: getIdLokasi() }, payloadJasa(jasa))
  if (res?.metadata?.code == 200) return res.response
  throw new Error(res?.metadata?.message || 'Gagal menyimpan jasa')
}

/** Ubah jasa/tindakan (barang_update/:id). */
export async function updateJasa(id, jasa) {
  const res = await apotik.put(`/index.php/api/inventory/barang_update/${id}`, {}, payloadJasa(jasa))
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal memperbarui jasa')
}

/** Arsipkan jasa (barang_arsip/:id) — disembunyikan dari daftar aktif, bukan dihapus. */
export async function arsipkanJasa(id) {
  const res = await apotik.put(`/index.php/api/inventory/barang_arsip/${id}`, { lokasiId: getIdLokasi() })
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal mengarsipkan jasa')
}

/** Aktifkan kembali jasa yang sudah diarsipkan (barang_aktif/:id). */
export async function aktifkanJasa(id) {
  const res = await apotik.put(`/index.php/api/inventory/barang_aktif/${id}`, {})
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal mengaktifkan jasa')
}

/** Hapus jasa (barang_delete/:id, soft delete DELETED=1). */
export async function hapusJasa(id) {
  const res = await apotik.delete(`/index.php/api/inventory/barang_delete/${id}`)
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal menghapus jasa')
}
