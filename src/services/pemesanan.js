/**
 * API surat pesanan obat — ws_posindo_v2.1 (M_pemesanan.php, tabel t_pemesanan_head/detail).
 * Alur & endpoint sama dengan views/pemesanan/*.vue di SIMRS (simrs_spa_v2), dipersempit:
 * tanpa multi-lokasi, tanpa klasifikasi OBT/PSI/PRE/NAR (satu jenis SP umum), dan tanpa alur
 * otorisasi PIN+SIPA lintas backend — diganti endpoint setujui_pemesanan yang lebih ringan
 * (lihat M_pemesanan::setujui_pemesanan di backend, ditambahkan khusus untuk klinik-app).
 */
import { apotik } from './http'
import { getIdClient, getIdLokasi, getUserName } from './session'

// Status t_pemesanan_head.status: 0 Draft, 1 Siap Dikirim, 2 Dikirim, 3 Diterima, 4 Selesai.
// Status 3 & 4 diisi oleh modul Penerimaan (belum ada di klinik-app) — hanya ditampilkan bila
// sudah ada datanya dari sistem lain yang berbagi database yang sama, tidak diisi dari sini.
export const STATUS_PEMESANAN = [
  { kode: 0, label: 'Draft', severity: 'secondary', filterKey: 'draft' },
  { kode: 1, label: 'Siap Dikirim', severity: 'info', filterKey: 'siap_dikirim' },
  { kode: 2, label: 'Dikirim', severity: 'warn', filterKey: 'dikirim' },
  { kode: 3, label: 'Diterima', severity: 'success', filterKey: 'diterima' },
  { kode: 4, label: 'Selesai', severity: 'success', filterKey: 'selesai' }
]

export function labelStatus(kode) {
  return STATUS_PEMESANAN.find((s) => s.kode === Number(kode))?.label || '—'
}
export function severityStatus(kode) {
  return STATUS_PEMESANAN.find((s) => s.kode === Number(kode))?.severity || 'secondary'
}

/**
 * Daftar surat pesanan (get_list_pemesanan, server-side pagination — data transaksi,
 * beda dari master data lain di klinik-app yang dimuat sekaligus).
 * Item: id_pemesanan, no_sp, jenis_sp, tanggal_sp, nama_supplier, id_supplier, keterangan,
 * status, status_label, persentase, grand_total, jumlah_item, is_fully_received.
 */
export async function getDaftarPemesanan({ search = '', status = '', page = 1, limit = 15 } = {}) {
  const res = await apotik.post(
    '/index.php/api/Pemesanan/get_list_pemesanan',
    {},
    { idclient: getIdClient(), id_lokasi: getIdLokasi(), search, status, page, limit }
  )
  if (res?.code != 200) throw new Error(res?.message || 'Gagal memuat surat pesanan')
  return {
    rows: Array.isArray(res.response) ? res.response : [],
    total: res.total || 0
  }
}

/**
 * Detail satu surat pesanan (get_detail_pemesanan).
 * Mengembalikan { head, details, grand_total }.
 */
export async function getDetailPemesanan(idPemesanan) {
  const res = await apotik.get(`/index.php/api/Pemesanan/get_detail_pemesanan/${idPemesanan}/${getIdClient()}`)
  if (res?.code != 200) throw new Error(res?.message || 'Surat pesanan tidak ditemukan')
  return res.data
}

function payloadPemesanan(f) {
  return {
    idclient: getIdClient(),
    id_lokasi: getIdLokasi(),
    id_supplier: f.id_supplier,
    keterangan: f.keterangan || '',
    no_referensi: f.no_referensi || '',
    details: f.details.map((d) => ({
      id_barang: d.id_barang,
      qty_pesan: Number(d.qty_pesan),
      satuan: d.satuan,
      harga_satuan: Number(d.harga_satuan) || 0
    }))
  }
}

/** Simpan draft SP baru (save_pemesanan). `f`: { id_supplier, keterangan, no_referensi, details }. */
export async function simpanPemesanan(f) {
  const res = await apotik.post('/index.php/api/Pemesanan/save_pemesanan', {}, payloadPemesanan(f))
  if (res?.code != 200) throw new Error(res?.message || 'Gagal menyimpan surat pesanan')
  return res.data // { id_pemesanan, no_sp }
}

/** Ubah SP (edit_pemesanan) — hanya boleh saat status Draft/Siap Dikirim; mengganti seluruh item. */
export async function updatePemesanan(idPemesanan, f) {
  const res = await apotik.post('/index.php/api/Pemesanan/edit_pemesanan', {}, { id_pemesanan: idPemesanan, ...payloadPemesanan(f) })
  if (res?.code != 200) throw new Error(res?.message || 'Gagal memperbarui surat pesanan')
  return res.data
}

/** Setujui SP (Draft → Siap Dikirim) — versi ringan tanpa PIN, lihat catatan di atas. */
export async function setujuiPemesanan(idPemesanan) {
  const res = await apotik.post(
    '/index.php/api/Pemesanan/setujui_pemesanan',
    {},
    { id_pemesanan: idPemesanan, idclient: getIdClient(), disetujui_oleh: getUserName() }
  )
  if (res?.code != 200) throw new Error(res?.message || 'Gagal menyetujui surat pesanan')
}

/** Tandai SP dikirim ke supplier (Siap Dikirim → Dikirim). */
export async function kirimPemesanan(idPemesanan) {
  const res = await apotik.post('/index.php/api/Pemesanan/kirim_sp', {}, { id_pemesanan: idPemesanan, idclient: getIdClient() })
  if (res?.code != 200) throw new Error(res?.message || 'Gagal mengirim surat pesanan')
}

/** Hapus SP — hanya boleh saat status Draft/Siap Dikirim dan belum lewat 30 hari. */
export async function hapusPemesanan(idPemesanan) {
  const res = await apotik.post('/index.php/api/Pemesanan/hapus_pemesanan', {}, { id_pemesanan: idPemesanan, idclient: getIdClient() })
  if (res?.code != 200) throw new Error(res?.message || 'Gagal menghapus surat pesanan')
}
