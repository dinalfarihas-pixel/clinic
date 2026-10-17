/**
 * API diagnosa ICD-10 kunjungan — memakai data klaim yang sama dengan KlaimResumeComponent di simrs_spa_v2
 * (transaksi_pasien/get_claim_data, transaksi_pasien/save_data_claim_v2).
 */
import { http } from './http'
import { getIdClient as idClient, getUserId } from './session'

/**
 * Data klaim tersimpan untuk satu kunjungan, atau null bila belum ada.
 * Field: dx_utama { icd_code, dx }, dx_sekunder [{ icd_code, dx }], prosedur, dokter_rawat_bersama,
 *        status_klaim, catatan_perbaikan, catatan_umum.
 */
export async function getDiagnosaKunjungan(noReg) {
  const res = await http.post(`/index.php/api/transaksi_pasien/get_claim_data/${noReg}/${idClient()}`)
  return res && typeof res === 'object' && !Array.isArray(res) ? res : null
}

/**
 * Cari prosedur ICD-9-CM (minimal 2 karakter). Item: { kode, proc }.
 * Input angka saja ("8901") otomatis diberi titik setelah 2 digit ("89.01").
 */
export async function searchProsedur(query) {
  if (!query || query.length < 2) return []
  const param = /^\d{2,}$/.test(query) ? `${query.slice(0, 2)}.${query.slice(2)}` : query
  const res = await http.post('/index.php/api/data_referensi/get_tindakan_v2', { mode: 1, param })
  if (!Array.isArray(res)) return []
  return res.filter((p) => p.kode).map((p) => ({ ...p, search_key: p.kode.replace('.', '') }))
}

/**
 * Simpan diagnosa utama + sekunder + prosedur ICD-9. Field klaim lain (catatan, dokter rawat bersama)
 * dikirim ulang dari `klaimLama` supaya tidak terhapus oleh save_data_claim_v2.
 */
export async function simpanDiagnosa(kunjungan, dxUtama, dxSekunder, prosedur, klaimLama) {
  const lama = klaimLama || {}
  const statusKlaim = lama.status_klaim || 'lengkap'
  await http.post('/index.php/api/transaksi_pasien/save_data_claim_v2', {
    noregister: kunjungan.NOPENDAFTARAN,
    nosep: kunjungan.NOSEP || '',
    id_client: idClient(),
    user_id: getUserId(),
    dx_utama: dxUtama,
    dx_sekunder: dxSekunder.filter(Boolean),
    prosedur: prosedur.filter(Boolean),
    status_klaim: statusKlaim,
    stts_coder: statusKlaim === 'lengkap' ? 1 : 2,
    catatan_perbaikan: lama.catatan_perbaikan || '',
    catatan_umum: lama.catatan_umum || '',
    dokter_rawat_bersama: Array.isArray(lama.dokter_rawat_bersama) ? lama.dokter_rawat_bersama : []
  })
}
