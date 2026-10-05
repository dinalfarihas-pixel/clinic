/**
 * API data pasien (m_pasien) — endpoint sama dengan ListPasienComponent di SIMRS.
 */
import { http } from './http'
import { getIdClient } from './session'

/** Jenis pencarian -> mode GetDataPasien_v3 */
export const JENIS_CARI = {
  nama: { mode: 4, label: 'Nama', min: 3, placeholder: 'Minimal 3 huruf nama pasien' },
  nomr: { mode: 3, label: 'No. RM', min: 1, placeholder: 'No. rekam medis' },
  nik: { mode: 5, label: 'NIK', min: 1, placeholder: '16 digit NIK' },
  noka: { mode: 6, label: 'No. BPJS', min: 1, placeholder: 'Nomor kartu BPJS' }
}

/**
 * Cari pasien. Nama memakai pencarian sebagian (maks. 100 hasil), lainnya harus sama persis.
 * Item: IDPASIEN, NOMR, NAMAPASIEN, JENISKELAMIN, TGLLAHIR, USIA_LENGKAP, ALAMAT, namakelurahan,
 *       namakecamatan, namakota, NOTELP, NO_KARTU, NOKTP, AGAMADISPLAY, PEKERJAAN, ...
 */
export async function cariPasien(jenis, keyword) {
  const cfg = JENIS_CARI[jenis]
  const q = String(keyword || '').trim()
  const res = await http.post('/index.php/api/data_referensi/GetDataPasien_v3', {
    mode: cfg.mode,
    id_client: getIdClient(),
    nama: jenis === 'nama' ? q : '',
    nomr: jenis === 'nomr' ? q : '',
    nik: jenis === 'nik' ? q : '',
    noka: jenis === 'noka' ? q : ''
  })
  return res?.metadata?.code == 200 && Array.isArray(res.response) ? res.response : []
}

/** 30 kunjungan aktif terakhir pasien (transaksi_pasien/history3, mod history5). */
export async function getRiwayatKunjungan(norm) {
  const res = await http.post('/index.php/api/transaksi_pasien/history3', {
    mod: 'history5',
    id_client: getIdClient(),
    norm,
    jenisrawat: ''
  })
  return res?.metadata?.code == 200 && Array.isArray(res.response) ? res.response : []
}

/** Hapus pasien (soft delete: m_pasien.DELETED = 1) — transaksi_pasien/hapusrm_pasien_v2. */
export async function hapusPasien(idPasien) {
  const res = await http.post('/index.php/api/transaksi_pasien/hapusrm_pasien_v2', {
    id: idPasien,
    id_client: getIdClient()
  })
  if (res?.metadata?.code == 200) return res.metadata.message
  throw new Error(res?.metadata?.message || 'Gagal menghapus data pasien')
}
