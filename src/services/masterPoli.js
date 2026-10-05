/**
 * API master poli — ws_sim_v2 (tabel m_poly), versi 2 khusus halaman CRUD master data.
 * Berbeda dari getPoli() di services/pendaftaran.js yang hanya mengambil poli rawat jalan
 * (jenispoly=0) untuk dropdown; di sini mengambil semua poli (rawat jalan & rawat inap).
 */
import { http } from './http'
import { getIdClient } from './session'

// jenispoly di m_poly: 0 = rawat jalan (poli), 1 = rawat inap (ruangan)
export const JENIS_POLI = [
  { kode: '0', nama: 'Rawat jalan' },
  { kode: '1', nama: 'Rawat inap' }
]

/**
 * Daftar semua poli aktif (datapoly_v2).
 * Item: ID, kode, nama, jenispoly, KodePoliBPJS, kd_poli_antrian, location_id.
 */
export async function getDaftarPoliMaster() {
  const res = await http.get(`/index.php/api/data_referensi/datapoly_v2/${getIdClient()}`)
  return Array.isArray(res) ? res : []
}

/**
 * Tambah poli — M_data_referensi::simpanpoli_v2() lewat endpoint simpan_poli_v2.
 * `kode` dibuat di server. Ditolak jika nama atau KodePoliBPJS (bila diisi) sudah dipakai.
 * Mengembalikan { message, ID, kode }.
 */
export async function simpanPoli(poli) {
  const res = await http.post('/index.php/api/data_referensi/simpan_poli_v2', payloadPoli(poli))
  if (res?.code == 200) return { message: res.message || 'Berhasil', ID: res.ID, kode: res.kode }
  throw new Error(res?.message || 'Gagal menyimpan poli')
}

/**
 * Ubah poli — M_data_referensi::updatepoli_v2() lewat endpoint update_poli_v2.
 * `poli.ID` wajib. Mengembalikan { message, ID }.
 */
export async function updatePoli(poli) {
  const res = await http.post('/index.php/api/data_referensi/update_poli_v2', {
    ...payloadPoli(poli),
    ID: poli.ID
  })
  if (res?.code == 200) return { message: res.message || 'Berhasil', ID: res.ID }
  throw new Error(res?.message || 'Gagal memperbarui poli')
}

/**
 * Hapus poli (soft delete, DELETED = 1) — M_data_referensi::hapuspoli_v2().
 * Data tidak dihapus permanen agar riwayat pendaftaran yang merujuk kode poli tetap utuh.
 */
export async function hapusPoli(id) {
  const res = await http.post('/index.php/api/data_referensi/hapus_poli_v2', {
    ID: id,
    ID_CLIENT: getIdClient()
  })
  if (res?.code == 200) return res.message || 'Poli dihapus'
  throw new Error(res?.message || 'Gagal menghapus poli')
}

function payloadPoli(poli) {
  return {
    nama: poli.nama,
    jenispoly: poli.jenispoly,
    KodePoliBPJS: poli.KodePoliBPJS,
    kd_poli_antrian: poli.kd_poli_antrian,
    location_id: poli.location_id || null,
    ID_CLIENT: getIdClient()
  }
}
