/**
 * API pendaftaran — web service SIMRS (ws_sim_v2), endpoint sama dengan simrs_spa_v2.
 */
import { http } from './http'
import { getIdClient as idClient } from './session'
import { useConfigStore } from '@/stores/config'

export const CARA_BAYAR_BPJS = 5

const pad = (n) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── Referensi ────────────────────────────────────────────────

export async function getCaraBayar() {
  const res = await http.get(`/index.php/api/data_referensi/datacarabayar2/${idClient()}`)
  return Array.isArray(res) ? res : []
}

export async function getPoli() {
  const res = await http.get(`/index.php/api/data_referensi/datapoly/${idClient()}`)
  return Array.isArray(res) ? res : []
}

export async function getDokter() {
  const res = await http.post('/index.php/api/data_referensi/datadokterv3', { id_client: idClient(), mode: 2 })
  return Array.isArray(res?.response) ? res.response : []
}

/** Cari ICD-10 (minimal 2 karakter). Item memiliki field `dx`. */
export async function searchDiagnosa(query) {
  if (!query || query.length < 2) return []
  const res = await http.post('/index.php/api/data_referensi/get_icd_v2', { mode: 1, param: query })
  return Array.isArray(res) ? res : []
}

// ── Pasien ───────────────────────────────────────────────────

export const MODE_CARI = { NO_KARTU: 1, NO_RM: 3 }

/**
 * Cari pasien di database lokal SIMRS.
 * mode 3 = berdasarkan No. RM, mode 1 = berdasarkan No. kartu BPJS.
 * Mengembalikan baris pertama (NOMR, NAMAPASIEN, NOKTP, NO_KARTU, ...) atau null.
 */
export async function getPasienLokal(mode, parameter) {
  const res = await http.post('/index.php/api/data_referensi/GetDataPasien_v3', {
    mode,
    noka: parameter,
    nomr: parameter,
    id_client: idClient()
  })
  if (res?.metadata?.code == 200 && res.response?.length) return res.response[0]
  return null
}

/**
 * Cek kepesertaan BPJS (nomor kartu atau NIK). Mengembalikan objek `peserta` BPJS.
 * Melempar error berisi pesan BPJS jika gagal (tidak ditemukan / layanan maintenance).
 */
export async function getPesertaBpjs(nomor, tanggalSep = today()) {
  const res = await http.post(`/index.php/api/Bpjs_api/get_data_peserta_v3/${tanggalSep}/${nomor}/${idClient()}`)
  if (res?.metaData?.code == 200 && res.response?.peserta) return res.response.peserta
  throw new Error(res?.metaData?.message || 'Layanan BPJS sedang tidak dapat diakses')
}

// ── Rujukan & surat kontrol BPJS ─────────────────────────────

/**
 * Data rujukan dari faskes (asal 1 = Faskes I, 2 = Faskes II).
 * Mengembalikan objek `rujukan` BPJS (diagnosa, poliRujukan, tglKunjungan, provPerujuk, ...).
 */
export async function getRujukanFaskes(noKartu, asalFaskes, noRujukan) {
  const res = await http.post('/index.php/api/bpjs_api/get_rujukan_dari_faskes', {
    no_kartu: noKartu,
    id_client: String(idClient()),
    asal_faskes: String(asalFaskes),
    norujukan: noRujukan
  })
  if (res?.metaData?.code == 200 && res.response?.rujukan) return res.response.rujukan
  throw new Error(res?.metaData?.message || 'Rujukan tidak ditemukan')
}

/**
 * Data surat kontrol BPJS (poliTujuan, kodeDokter, sep.provPerujuk, sep.diagnosa, ...).
 */
export async function getSuratKontrol(noSurat) {
  const res = await http.post('/index.php/api/bpjs_api/get_data_surat_kontrol', {
    nomorreferensi: noSurat,
    id_client: String(idClient())
  })
  if (res?.metaData?.code == 200 && res.response) return res.response
  throw new Error(res?.metaData?.message || 'Data surat kontrol tidak ditemukan')
}

// ── Antrian (kode booking) ───────────────────────────────────

/**
 * Ambil kode booking antrian pasien lalu kirim antreannya ke server BPJS,
 * sama dengan getKodeBooking() di SIMRS.
 * Mengembalikan { kodeBooking, nomorAntrian, sync } — `sync` adalah respons
 * add_antrian_toserverbpjs (metadata.code 200/208 = berhasil), null bila tidak ada kode booking.
 */
export async function ambilKodeBooking(norm, noka) {
  const id = idClient()
  const res = await http.get(`/index.php/api/antrian/getkodebooking/${norm}/${noka}/${id}`)
  const item = res?.response?.[0]
  const hasil = {
    kodeBooking: item?.kodebooking || null,
    nomorAntrian: item ? `${item.jenis_antrian || ''}${item.nomor || ''}` : null,
    sync: null
  }
  if (!hasil.kodeBooking) return hasil

  const antrian = await http.get(`/index.php/api/mobil_jkn/get_antrian_tosync/${hasil.kodeBooking}/${id}`)
  if (antrian?.metadata?.code == 200 && antrian.response) {
    hasil.sync = await http.post('/index.php/api/data_referensi/add_antrian_toserverbpjs', {
      id_client: id,
      ...antrian.response
    })
  }
  return hasil
}

// ── Simpan pendaftaran ───────────────────────────────────────

/**
 * Simpan pendaftaran rawat jalan + buat SEP (bila BPJS) — Bpjs_api/CreateSEP_Rajal_v2,
 * payload sama dengan simpan_pendaftaran_poli() di SIMRS.
 * Mengembalikan { message, noReg, noSep }.
 */
export async function simpanPendaftaran(param, userId) {
  const id = idClient()
  const res = await http.post('/index.php/api/Bpjs_api/CreateSEP_Rajal_v2', {
    param: { ...param, id_client: id },
    id_client: id,
    user_id: userId
  })
  if (res?.metadata?.code == 200) {
    return {
      message: res.metadata.message,
      noReg: res.data_trans?.metadata?.no_reg || null,
      noSep: res.data_trans?.metadata?.sep || ''
    }
  }
  throw new Error(res?.metadata?.message || 'Gagal menyimpan pendaftaran')
}

// ── Statistik ────────────────────────────────────────────────

/**
 * Angka kartu ringkasan halaman pendaftaran — data_referensi/statistik_pendaftaran.
 * Mengembalikan { tanggal, total_pasien, daftar_hari_ini, pasien_bpjs, batal }.
 */
export async function getStatistikPendaftaran(tanggal) {
  const res = await http.post('/index.php/api/data_referensi/statistik_pendaftaran', {
    id_client: idClient(),
    tanggal
  })
  if (res?.metadata?.code == 200 && res.response) return res.response
  throw new Error(res?.metadata?.message || 'Gagal memuat statistik pendaftaran')
}

// ── Riwayat pendaftaran ──────────────────────────────────────

/**
 * Daftar pendaftaran — transaksi_pasien/history_versi4.
 * - Dengan `norm`  : mod '7.1', semua pendaftaran pasien itu dalam rentang tanggal (termasuk yang batal, maks. 30)
 * - Tanpa `norm`   : mod 11, semua pendaftaran rawat jalan aktif dalam rentang tanggal
 * Tanggal format YYYY-MM-DD.
 * Item: NOPENDAFTARAN, NOSEP, NOMR, NAMAPASIEN, NOKTP, NOJAMINAN, USIA_PASIEN {tahun,bulan,hari},
 *       POLI, NAMADOKTER, CARABAYAR, KODECARABAYAR, JENISRAWAT, MASUKPOLY_DISPLAY, KELUARPOLY,
 *       BATAL ('0'/'1'), ALASAN_BATAL, STTS_PULANG, JENISKELAMIN, TGLLAHIR, ...
 */
export async function getRiwayatPendaftaran({ tglAwal, tglAkhir, norm }) {
  const rm = (norm || '').trim()
  const res = await http.post('/index.php/api/transaksi_pasien/history_versi4', {
    mod: rm ? '7.1' : 11,
    jenisrawat: 'JALAN',
    tglawal: tglAwal,
    tglakhir: tglAkhir,
    id_client: idClient(),
    norm: rm
  })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Satu pendaftaran aktif berdasarkan nomor registrasi (history_versi4 mod 1).
 * Field sama dengan getRiwayatPendaftaran, plus NOMORANTRIAN, JENISPASIEN, ALAMAT, DX_CAPTION, dll.
 */
export async function getPendaftaran(noReg) {
  const res = await http.post('/index.php/api/transaksi_pasien/history_versi4', {
    mod: 1,
    noregister: noReg,
    id_client: idClient()
  })
  const row = Array.isArray(res?.response) ? res.response[0] : null
  if (!row) throw new Error(`Pendaftaran ${noReg} tidak ditemukan atau sudah dibatalkan`)
  return row
}

// ── Tindak lanjut (disposisi setelah pemeriksaan) ────────────

/** Kode `STATUS` di t_pendaftaran, dipakai juga sebagai kode cara keluar. */
export const CARA_KELUAR = {
  PULANG: 1,
  RUJUK_RS_LAIN: 2,
  RUJUK_INTERNAL: 6,
  RUJUK_RAWAT_INAP: 7
}

export const OPSI_CARA_KELUAR = [
  { kode: CARA_KELUAR.PULANG, label: 'Pulang', icon: 'pi pi-home' },
  { kode: CARA_KELUAR.RUJUK_RS_LAIN, label: 'Rujuk RS Lain', icon: 'pi pi-arrow-up-right' },
  { kode: CARA_KELUAR.RUJUK_INTERNAL, label: 'Rujuk Internal', icon: 'pi pi-arrow-right-arrow-left' },
  { kode: CARA_KELUAR.RUJUK_RAWAT_INAP, label: 'Rawat Inap', icon: 'pi pi-building' }
]

/**
 * Simpan tindak lanjut (disposisi) pasien setelah selesai diperiksa —
 * transaksi_pasien/pulangkan_pasienv3. `kunjungan` = hasil getPendaftaran().
 * Menutup kunjungan (mengisi KELUARPOLY) dan menandai status keluar sesuai `caraKeluar` (lihat CARA_KELUAR).
 */
export async function simpanTindakLanjut(kunjungan, caraKeluar, userId) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const keluarpoly = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  const res = await http.post('/index.php/api/transaksi_pasien/pulangkan_pasienv3', {
    STATUS: caraKeluar,
    KETERANGAN_STATUS: String(caraKeluar),
    KONDISISAATPULANG: 1,
    NOPENDAFTARAN: kunjungan.NOPENDAFTARAN,
    NORM: kunjungan.NOMR,
    KDCARABAYAR: kunjungan.KODECARABAYAR,
    JENISRAWAT: kunjungan.JENISRAWAT || 'JALAN',
    KELUARPOLY: keluarpoly,
    NOREF: '',
    NOSEP: kunjungan.NOSEP || '',
    POLI: kunjungan.KODERUANGAN,
    USER_ID: userId,
    ID_CLIENT: idClient()
  })
  if (res?.code == 200) return res.message || 'Tindak lanjut tersimpan'
  throw new Error(res?.message || 'Gagal menyimpan tindak lanjut')
}

/**
 * Tandai kunjungan lunas (transaksi_pasien/update_lunas) — mengisi t_pendaftaran.LUNAS=1
 * dan LUNAS_BY dengan nama user yang menandai. `userName` biasanya dari getUserName().
 */
export async function tandaiLunas(noReg, userName) {
  const res = await http.post('/index.php/api/transaksi_pasien/update_lunas', {
    noregister: noReg,
    deposit: 0,
    kasir_id: userName,
    id_client: idClient()
  })
  if (res?.metadata?.code == 200) return true
  throw new Error(res?.metadata?.message || 'Gagal menandai lunas')
}

/** Batalkan pendaftaran (dan SEP-nya bila ada) — data_referensi/batal_pendaftaran_v4. */
export async function batalPendaftaran({ noReg, noSep, norm, tglAwal, alasan }, userId) {
  const res = await http.post('/index.php/api/data_referensi/batal_pendaftaran_v4', {
    noregister: noReg,
    id_client: idClient(),
    tglawal: tglAwal,
    nosep: noSep,
    user_id: userId,
    norm,
    alasan_batal: alasan
  })
  if (res?.code == 200) return res.message || 'Pendaftaran dibatalkan'
  throw new Error(res?.message || 'Gagal membatalkan pendaftaran')
}

/**
 * URL cetak SEP / bukti pendaftaran dari API Laravel (get_data_sep_api).
 * Untuk pasien non-BPJS kirim noSep kosong. `caraBayar` = KODECARABAYAR (opsional).
 */
export async function getUrlCetakSep({ noSep, noReg, norm, caraBayar }) {
  const { laravel } = useConfigStore()
  // Respons berisi URL (bisa teks biasa atau string JSON), jadi dibaca langsung tanpa helper http
  const res = await fetch(`${laravel}/get_data_sep_api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        NOPENDAFTARAN: noReg,
        NOSEP: noSep || '',
        id_client: idClient(),
        NORM: norm,
        ...(caraBayar != null ? { CARABAYAR: caraBayar } : {})
      }
    })
  })
  if (!res.ok) throw new Error(`Server cetak merespons ${res.status}`)
  let url = (await res.text()).trim()
  try {
    url = JSON.parse(url)
  } catch {
    /* teks biasa */
  }
  if (typeof url === 'string' && /^https?:\/\//.test(url)) return url
  throw new Error('URL cetak SEP tidak tersedia')
}

// ── Pasien baru (FormInputPasien SIMRS) ──────────────────────

export async function getSuku() {
  const res = await http.post('/index.php/api/data_referensi/get_suku')
  return Array.isArray(res) ? res : []
}

export async function getYonif() {
  const res = await http.post('/index.php/api/data_referensi/get_yonif')
  return Array.isArray(res) ? res : []
}

/** Cari desa/kelurahan (minimal 4 huruf). Item: id_desa, nama_desa, nama_kecamatan, nama_kabkota, namaprovinsi. */
export async function searchDesa(query) {
  if (!query || query.length < 4) return []
  const res = await http.post('/index.php/api/data_referensi/get_desa_v3', { mode: 1, nama_desa: query })
  return Array.isArray(res) ? res : []
}

/** Cek peserta BPJS berdasarkan nomor kartu (endpoint v2, dipakai form pasien baru). */
export async function getPesertaBpjsByNoka(noka) {
  const res = await http.post(`/index.php/api/Bpjs_api/get_data_peserta_v2/${noka}/${idClient()}`)
  if (res?.metaData?.code == 200 && res.response?.peserta) return res.response.peserta
  throw new Error(res?.metaData?.message || 'Peserta tidak ditemukan di layanan BPJS')
}

/** Minta No. RM baru dari sistem. */
export async function generateNoRm() {
  const res = await http.post('/index.php/api/data_referensi/generate_no_rm', { id_client: idClient() })
  if (res?.metadata?.code == 200 && res.response?.no_rm) return res.response.no_rm
  throw new Error(res?.metadata?.message || 'Gagal membuat No. RM baru')
}

/**
 * Simpan pasien baru. Payload mengikuti form SIMRS (inputPasienMode5).
 * Mengembalikan { no_rm, message }.
 */
export async function simpanPasien(payload) {
  const res = await http.post('/index.php/api/data_referensi/inputPasienMode5', { ...payload, id_client: idClient() })
  if (res?.code == 200) return { no_rm: res.no_rm, message: res.message }
  throw new Error(res?.message || 'Gagal menyimpan data pasien')
}
