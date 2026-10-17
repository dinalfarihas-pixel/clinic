/**
 * API rujukan keluar (Rujuk RS Lain) via BPJS — endpoint sama dengan RujukKeRsLainView di simrs_spa_v2.
 */
import { http } from './http'
import { getIdClient as idClient, getUserId } from './session'
import { useConfigStore } from '@/stores/config'
import { toYmd } from '@/utils/tanggal'

export const TIPE_RUJUKAN = [
  { kode: '0', label: 'Penuh' },
  { kode: '2', label: 'Partial' },
  { kode: '6', label: 'Rujuk Balik' }
]

/** Cari faskes tujuan rujuk (minimal 3 huruf). Item: { kode, nama }. */
export async function cariFaskesRujukan(query) {
  if (!query || query.length < 3) return []
  const res = await http.post('/index.php/api/bpjs_api/get_rs_bpjs', {
    mode: 1,
    parameter: query,
    jenis_faskes: 2,
    id_client: idClient()
  })
  return Array.isArray(res?.response?.faskes) ? res.response.faskes : []
}

/** Spesialistik di faskes tujuan pada tanggal rencana kunjungan. Item: { kodeSpesialis, namaSpesialis, kapasitas, jumlahRujukan }. */
export async function getSpesialistikRujukan(kodeRs, tanggal) {
  const res = await http.post('/index.php/api/bpjs_api/spesialistik_rujuanRujuk', {
    kode_rs: kodeRs,
    tanggal_rujuk: toYmd(tanggal),
    id_client: idClient()
  })
  return Array.isArray(res?.response?.list) ? res.response.list : []
}

/**
 * Buat rujukan BPJS untuk satu kunjungan. `kunjungan` = hasil getPendaftaran() (wajib punya NOSEP).
 * Mengembalikan objek `rujukan` BPJS (noRujukan, peserta.noKartu, ...).
 */
export async function buatRujukan(kunjungan, f) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const res = await http.post('/index.php/api/Bpjs_api/createRujukan', {
    noSep: kunjungan.NOSEP,
    tglRujukan: toYmd(f.tanggalRujuk),
    jenis_rawat: '2', // rawat jalan
    tglRencanaKunjungan: toYmd(f.tanggalKunjungan),
    ppkDirujuk: f.faskes,
    tipeRujukan: f.tipe,
    diagnose: f.diagnosa.icd_code,
    poliRujukan: {
      kodeSpesialis: f.spesialis.kodeSpesialis,
      namaSpesialis: f.spesialis.namaSpesialis
    },
    id_client: idClient(),
    user: getUserId(),
    catatan: f.catatan || '-',
    noregister: kunjungan.NOPENDAFTARAN,
    poli: kunjungan.POLI ?? kunjungan.KODERUANGAN,
    norm: kunjungan.NOMR,
    created_at: `${toYmd(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  })
  if (res?.metadata?.code == 200) return res.metadata.rujukan
  throw new Error(res?.metadata?.message || 'Gagal membuat rujukan')
}

/** URL surat rujukan siap cetak dari API Laravel (setRujukan). */
export async function getUrlCetakRujukan({ noRujukan, noKartu }) {
  const { laravel } = useConfigStore()
  const res = await fetch(`${laravel}/setRujukan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ no_rujukan: noRujukan, mod: 'history1', noka: noKartu, id_client: idClient() })
  })
  if (!res.ok) throw new Error(`Server cetak merespons ${res.status}`)
  let url = (await res.text()).trim()
  try {
    url = JSON.parse(url)
  } catch {
    /* teks biasa */
  }
  if (typeof url === 'string' && /^https?:\/\//.test(url)) return url
  throw new Error('URL cetak rujukan tidak tersedia')
}

/**
 * Simpan rujukan pasien non-BPJS ke cnd_rujukan (transaksi_pasien/simpan_rujukan_non_bpjs).
 * Satu rujukan per kunjungan: nomor "NB-<noreg>", dikirim ulang berarti diperbarui.
 * Mengembalikan nomor rujukan.
 */
export async function simpanRujukanNonBpjs(kunjungan, f) {
  const res = await http.post('/index.php/api/transaksi_pasien/simpan_rujukan_non_bpjs', {
    id_client: idClient(),
    user_id: getUserId(),
    noregister: kunjungan.NOPENDAFTARAN,
    norm: kunjungan.NOMR,
    kdcarabayar: kunjungan.KODECARABAYAR,
    poli_caption: kunjungan.POLI || '',
    nokartu: kunjungan.NOJAMINAN || kunjungan.NO_KARTU || '',
    nama_pasien: kunjungan.NAMAPASIEN || '',
    jenis_kelamin: kunjungan.JENISKELAMIN || '',
    tgl_lahir: toYmd(kunjungan.TGLLAHIR),
    nama_dokter: kunjungan.NAMADOKTER || '',
    tgl_rujukan: toYmd(f.tanggalRujuk),
    tujuan_nama: f.faskesNama.trim(),
    poli_tujuan: f.poliTujuan.trim(),
    diagnosa_kode: f.diagnosa.icd_code,
    diagnosa_nama: f.diagnosa.dx,
    catatan: f.catatan.trim()
  })
  if (res?.code == 200) return res.no_rujukan
  throw new Error(res?.message || 'Gagal menyimpan rujukan')
}

/**
 * Daftar rujukan keluar pasien (BPJS dan non-BPJS), terbaru dulu — transaksi_pasien/getdatarujukanv1 (history2).
 * Item: NORUJUKAN, TGLRUJUKAN, NAMATUJUANRUJUKAN, POLITUJUAN, KODEDIAGNOSA, NAMADIAGNOSA, CAPTION_TIPE,
 *       JENISRAWAT, CATATAN, NOKARTU, NOSEP, NAMA_DOKTER. Rujukan non-BPJS bernomor "NB-<noreg>".
 */
export async function getDaftarRujukan(norm) {
  const res = await http.post('/index.php/api/transaksi_pasien/getdatarujukanv1', {
    mode: 1,
    mod: 'history2',
    id_client: idClient(),
    noka: norm
  })
  return Array.isArray(res) ? res : []
}

export const isRujukanNonBpjs = (r) => String(r?.NORUJUKAN || '').startsWith('NB-')

/**
 * Batalkan rujukan. BPJS: dibatalkan di server BPJS lalu ditandai dihapus di cnd_rujukan
 * (bpjs_api/deleted_rujukan). Non-BPJS: hanya ditandai dihapus (transaksi_pasien/hapus_rujukan_non_bpjs).
 */
export async function batalkanRujukan(rujukan) {
  const body = { id_client: idClient(), no_rujukan: rujukan.NORUJUKAN, user_id: getUserId() }
  const path = isRujukanNonBpjs(rujukan)
    ? '/index.php/api/transaksi_pasien/hapus_rujukan_non_bpjs'
    : '/index.php/api/bpjs_api/deleted_rujukan'
  const res = await http.post(path, body)
  // Berhasil: { code: 200 }; gagal: { code: 201/400 } atau { metadata: { code, message } }
  if (res?.code == 200) return res.message || 'Rujukan dibatalkan'
  throw new Error(res?.message || res?.metadata?.message || 'Gagal membatalkan rujukan')
}
