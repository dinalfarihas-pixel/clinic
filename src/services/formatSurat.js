/**
 * API master jenis surat keterangan — ws_sim_v2 (modul api/surat), endpoint sama dengan
 * stores/surat.js + views/setting/JenisSuratTemplateView.vue di SIMRS (simrs_spa_v2).
 *
 * Satu jenis surat = nama + kategori (SEHAT/SAKIT/KEJIWAAN) + barang jasa (tarif) + template Word (.docx).
 * Template ditulis di Word dengan variabel ${nama_variabel} (PHPWord TemplateProcessor); backend
 * mengisinya saat cetak lalu mengonversinya ke PDF.
 */
import { http } from './http'
import { getIdClient, getUserId } from './session'
import { useConfigStore } from '@/stores/config'

// Field isian per kategori — disimpan backend sebagai DATA_ISIAN (JSON) di trx_surat; tampil sebagai variabel template
export const KATEGORI_SURAT_FIELDS = {
  SEHAT: [
    { key: 'tb', label: 'Tinggi Badan (cm)' },
    { key: 'bb', label: 'Berat Badan (kg)' },
    { key: 'tensi', label: 'Tensi (mmHg)' },
    { key: 'buta_warna', label: 'Buta Warna' },
    { key: 'kesimpulan', label: 'Kesimpulan' }
  ],
  SAKIT: [
    { key: 'diagnosa', label: 'Diagnosa' },
    { key: 'lama_istirahat', label: 'Lama Istirahat (hari)' },
    { key: 'tgl_mulai_istirahat', label: 'Tanggal Mulai Istirahat' },
    { key: 'tgl_selesai_istirahat', label: 'Tanggal Selesai Istirahat' }
  ],
  KEJIWAAN: [{ key: 'kesimpulan', label: 'Kesimpulan' }],
  LAINNYA: [{ key: 'keterangan', label: 'Keterangan' }]
}

// Nilai harus persis sama dengan key KATEGORI_SURAT_FIELDS
export const KATEGORI_SURAT_OPTIONS = [
  { label: 'Sehat', value: 'SEHAT' },
  { label: 'Sakit', value: 'SAKIT' },
  { label: 'Kejiwaan', value: 'KEJIWAAN' },
  { label: 'Lain-lain', value: 'LAINNYA' }
]

// Variabel yang selalu diisi backend saat cetak (M_surat.php::cetak_surat) untuk semua kategori
export const PLACEHOLDER_UMUM = [
  { token: 'no_surat', label: 'No. Surat' },
  { token: 'nama_surat', label: 'Nama Jenis Surat' },
  { token: 'tanggal_surat', label: 'Tanggal Surat' },
  { token: 'dokter_pemeriksa', label: 'Dokter Pemeriksa' },
  { token: 'nama_dokter', label: 'Nama Dokter (alias)' },
  { token: 'sip_dokter', label: 'SIP Dokter' },
  { token: 'hasil_pemeriksaan', label: 'Hasil Pemeriksaan' },
  { token: 'tujuan_surat', label: 'Tujuan Surat' },
  { token: 'nama_pasien', label: 'Nama Pasien' },
  { token: 'no_rm', label: 'No. Rekam Medis' },
  { token: 'tgl_lahir', label: 'Tanggal Lahir' },
  { token: 'tempat_lahir', label: 'Tempat Lahir' },
  { token: 'jenis_kelamin', label: 'Jenis Kelamin' },
  { token: 'pekerjaan', label: 'Pekerjaan' },
  { token: 'alamat_pasien', label: 'Alamat Pasien' },
  { token: 'noregister', label: 'No. Register' },
  { token: 'nama_rumah_sakit', label: 'Nama Klinik' },
  { token: 'kota', label: 'Kota' },
  { token: 'jumlah_cetak', label: 'Jumlah Cetak Ke-' },
  { token: 'qrcode', label: 'QR Code (gambar, isi = No. Surat) — taruh di dekat tanda tangan' }
]

export const UKURAN_MAKS = 5 * 1024 * 1024 // 5 MB

function cekKode(res, pesanGagal) {
  if (Number(res?.code) !== 200) throw new Error(res?.message || pesanGagal)
  return res
}

/** Daftar jenis surat. `hanyaAktif`: 1 = aktif saja, null = semua. Item: ID, KODE_SURAT, NAMA_SURAT, KATEGORI_SURAT, IDBARANG, NAMA_BARANG, HARGAJUAL, MASA_BERLAKU_HARI, AKTIF, TEMPLATE_FILE. */
export async function getDaftarJenisSurat({ kategori = null, hanyaAktif = null } = {}) {
  const res = await http.post('/index.php/api/surat/list_jenis_surat', {
    id_client: getIdClient(),
    kategori_surat: kategori,
    hanya_aktif: hanyaAktif
  })
  return Array.isArray(res?.response) ? res.response : []
}

export async function getJenisSurat(id) {
  const res = await http.post('/index.php/api/surat/get_jenis_surat', { id, id_client: getIdClient() })
  return res?.response || null
}

/** Upload template .docx; mengembalikan path file di server (isi ke `template_file` saat simpan). */
export async function uploadTemplate(file) {
  if (!/\.docx$/i.test(file.name)) throw new Error('Format file tidak valid. Hanya file MS Word (.docx) yang diterima.')
  if (file.size > UKURAN_MAKS) throw new Error('Ukuran file maksimal 5 MB.')

  const body = new FormData()
  body.append('file', file)
  let res
  try {
    const r = await fetch(`${useConfigStore().apiBaseUrl}/index.php/api/surat/upload_template`, { method: 'POST', body })
    res = await r.json()
  } catch {
    throw new Error('Gagal mengunggah template. Periksa koneksi ke server.')
  }
  return cekKode(res, 'Gagal mengunggah template.').template_file
}

/** Tambah (tanpa `id`) atau ubah jenis surat. */
export async function simpanJenisSurat({ id = null, kode, nama, kategori, idBarang, masaBerlakuHari = null, aktif = true, templateFile }) {
  const res = await http.post('/index.php/api/surat/simpan_jenis_surat', {
    id,
    kode_surat: kode?.trim() || null,
    nama_surat: nama.trim(),
    kategori_surat: kategori,
    idbarang: idBarang,
    masa_berlaku_hari: masaBerlakuHari,
    aktif: aktif ? 1 : 0,
    template_file: templateFile,
    id_client: getIdClient(),
    created_by: getUserId()
  })
  return cekKode(res, 'Gagal menyimpan jenis surat.').message || 'Jenis surat berhasil disimpan'
}

export async function hapusJenisSurat(id) {
  const res = await http.post('/index.php/api/surat/hapus_jenis_surat', { id, id_client: getIdClient() })
  return cekKode(res, 'Gagal menghapus jenis surat.').message || 'Jenis surat berhasil dihapus'
}

/** URL untuk membuka/mengunduh file template yang tersimpan di server. */
export function urlTemplate(templateFile) {
  return `${useConfigStore().apiBaseUrl}/${templateFile}`
}
