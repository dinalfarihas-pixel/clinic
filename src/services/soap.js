/**
 * API SOAP / asesmen dokter rawat jalan — endpoint sama dengan FormPoliKlinikView di SIMRS.
 */
import { http } from './http'
import { getIdClient } from './session'

// Tingkat kesadaran (kode SNOMED CT), sama dengan SIMRS
export const TINGKAT_KESADARAN = [
  { code: '248234009', display: 'Sadar' },
  { code: '248230005', display: 'Mengantuk' },
  { code: '419099009', display: 'Bingung' },
  { code: '110000191000000100', display: 'Tidak responsif' },
  { code: '371438000', display: 'Koma' }
]

export const OPSI_PLAN = [
  'Terapi lanjut',
  'Rujuk Ke rawat inap',
  'Rujuk internal',
  'Konsul Ke Poli lain',
  'Rujuk ke rs lain',
  'Kontrol Ulang',
  'Operasi'
]

/**
 * SOAP tersimpan untuk satu kunjungan (transaksi_pasien/getdata_asesmen), atau null bila belum ada.
 * Field: subjek, objek, asesmen, plan, suhu, tensi, sp2o, tinggi_badan, berat_badan, respirasi_perm,
 *        nadi_permenit, cgs, kesadaran, kesadaran_code, catatan_dokter, no_sitb, ...
 */
export async function getSoap(noReg) {
  const res = await http.get(`/index.php/api/transaksi_pasien/getdata_asesmen/${noReg}/${getIdClient()}`)
  return res?.metadata?.code == 200 && res.response ? res.response : null
}

/**
 * Simpan SOAP dokter (transaksi_pasien/save_asesmenkeperawatan, jenis_dok 1).
 * Backend membalas angka 200 bila berhasil. Keluhan SNOMED (`subject_snomad`) disimpan ulang seluruhnya.
 */
export async function simpanSoap(soap) {
  const res = await http.post('/index.php/api/transaksi_pasien/save_asesmenkeperawatan', {
    ...soap,
    jenis_dok: 1,
    id_client: getIdClient()
  })
  if (res == 200) return true
  throw new Error(typeof res === 'object' && res?.message ? res.message : 'Gagal menyimpan SOAP')
}

/** Cari keluhan SNOMED CT (minimal 3 huruf). Item: { code, caption }. */
export async function cariKeluhanSnomed(teks) {
  if (!teks || teks.length < 3) return []
  const res = await http.post('/index.php/api/Data_referensi/getKeluhanSnomatCT', { raw_text: teks })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Riwayat kunjungan rawat jalan beserta SOAP-nya (maks. 50 terakhir).
 * Item: NOREGISTER, TGLREG, POLI, NAMADOKTER, SUHU, TENSI, NADI, SUBJEK, OBJEK, ASSESMEN, PLAN, OBAT_OBATAN, ...
 */
export async function getRiwayatSoap(norm) {
  const res = await http.get(`/index.php/api/transaksi_pasien/get_riwayat_lengkap_pasien/${getIdClient()}/${norm}`)
  return res?.metadata?.code == 200 && Array.isArray(res.response) ? res.response : []
}
