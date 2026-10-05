/**
 * API poliklinik — endpoint sama dengan views/Poliklinik/ListPasien.vue di SIMRS.
 */
import { http } from './http'
import { getIdClient } from './session'

/**
 * Daftar poli rawat jalan klinik (transaksi_pasien/getdataruangterpakai_v2, jenis 0 = jalan).
 * Item: KODE (kode poli RS), NAMA, KODE_BPJS.
 */
export async function getDaftarPoli() {
  const res = await http.get(`/index.php/api/transaksi_pasien/getdataruangterpakai_v2/0/${getIdClient()}`)
  return Array.isArray(res) ? res : []
}

/**
 * Pasien terdaftar di satu poli dalam rentang tanggal (history3, mod history10).
 * Tanggal YYYY-MM-DD. Item: NOPENDAFTARAN, NOMORANTRIAN, NOMR, NAMAPASIEN, JENISKELAMIN,
 * USIA_PASIEN {tahun,bulan,hari}, ALAMAT, NAMADOKTER, KDDOKTER, CARABAYAR, KODECARABAYAR,
 * MASUKPOLY, MASUKPOLY_DISPLAY, KELUARPOLY, STATUS (0 = belum dilayani), STTS_PULANG,
 * NOSEP, NOJAMINAN, DIAGNOSA_AWAL, DX_CAPTION, TGLREG, DATA_SINGKAT, ...
 */
export async function getPasienPoli({ kodePoli, tglAwal, tglAkhir }) {
  const res = await http.post('/index.php/api/transaksi_pasien/history3', {
    mod: 'history10',
    kodeunit: kodePoli,
    tglawal: tglAwal,
    tglakhir: tglAkhir,
    jenisrawat: 'JALAN',
    norm: '',
    id_client: getIdClient()
  })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Panggil pasien ke poli: catat panggilan antrian lalu kirim ke layar antrian (Pusher),
 * sama dengan panggil_pasien() di SIMRS.
 */
export async function panggilPasien(row) {
  const id = getIdClient()
  const antrian = await http.get(`/index.php/api/antrian/panggil_pasien_poli/${row.NOPENDAFTARAN}/${id}`)
  await http.post('/index.php/api/data_referensi/push_to_pusher_v2/', {
    channel: `channel1${id}`,
    event: 'panggil_antrian_poli',
    JENIS_ANTRIAN: antrian?.JENIS_ANTRIAN,
    NOMOR_ANTRIAN: antrian?.NOMOR_ANTRIAN,
    PANGGILAN_POLI: 1,
    LOKET: 1,
    POLI: antrian?.POLI,
    NAMA_PASIEN: row.DATA_SINGKAT || row.NAMAPASIEN,
    NAMA_DOKTER: row.NAMADOKTER,
    KODE_DOKTER: row.KDDOKTER
  })
  return antrian
}
