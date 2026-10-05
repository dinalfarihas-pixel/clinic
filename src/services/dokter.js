/**
 * API master dokter — ws_sim_v2 (tabel m_dokter).
 */
import { http } from './http'
import { getIdClient } from './session'

// KDPROFESI di m_dokter: '2' = spesialis, selain itu umum (lihat M_laporan_v2)
export const PROFESI = [
  { kode: '1', nama: 'Dokter umum' },
  { kode: '2', nama: 'Dokter spesialis' }
]

/**
 * Daftar dokter aktif (datadokterv3 mode 2).
 * Item: KDDOKTER, NAMADOKTER, KDPOLY_BPJS, KODE_DOKTER_BPJS, SUB_SP, NIK, NAMAPROFESI.
 */
export async function getDaftarDokter() {
  const res = await http.post('/index.php/api/data_referensi/datadokterv3', { id_client: getIdClient(), mode: 2 })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Tambah dokter — M_data_referensi::simpandokter_v2() lewat endpoint simpan_dokter_v2.
 * KDDOKTER dibuat di server. Ditolak jika NIK kosong, NIK sudah terdaftar,
 * atau KODE_DOKTER_BPJS (bila diisi) sudah dipakai dokter aktif lain.
 * Mengembalikan { message, KDDOKTER }.
 */
export async function simpanDokter(dokter) {
  const res = await http.post('/index.php/api/data_referensi/simpan_dokter_v2', payloadDokter(dokter))

  console.log('Response simpanDokter:', res)
  if (res?.code == 200) return { message: res.message || 'Berhasil', KDDOKTER: res.KDDOKTER }
  throw new Error(res?.message || 'Gagal menyimpan dokter')
}

/**
 * Ubah dokter — M_data_referensi::updatedokter_v2() lewat endpoint update_dokter_v2.
 * `dokter.KDDOKTER` wajib. Mengembalikan { message, KDDOKTER }.
 */
export async function updateDokter(dokter) {
  const res = await http.post('/index.php/api/data_referensi/update_dokter_v2', {
    ...payloadDokter(dokter),
    KDDOKTER: dokter.KDDOKTER
  })
  if (res?.code == 200) return { message: res.message || 'Berhasil', KDDOKTER: res.KDDOKTER }
  throw new Error(res?.message || 'Gagal memperbarui dokter')
}

/**
 * Nonaktifkan dokter (st_aktif = 1) — M_data_referensi::nonaktifdokter_v2().
 * Data tidak dihapus; dokter tidak lagi muncul di daftar dokter aktif.
 */
export async function nonaktifkanDokter(kddokter) {
  const res = await http.post('/index.php/api/data_referensi/nonaktif_dokter_v2', {
    KDDOKTER: kddokter,
    ID_CLIENT: getIdClient()
  })
  if (res?.code == 200) return res.message || 'Dokter dinonaktifkan'
  throw new Error(res?.message || 'Gagal menonaktifkan dokter')
}

function payloadDokter(dokter) {
  return {
    NAMADOKTER: dokter.NAMADOKTER,
    NIK: dokter.NIK,
    KODE_DOKTER_BPJS: dokter.KODE_DOKTER_BPJS,
    KDPOLY: dokter.KDPOLY,
    KDPOLY_BPJS: dokter.KDPOLY_BPJS,
    KDPROFESI: dokter.KDPROFESI,
    NAMAPROFESI: dokter.NAMAPROFESI,
    ID_CLIENT: getIdClient()
  }
}
