/**
 * API jadwal praktik dokter — ws_sim_v2 (tabel m_dokter_jadwal), endpoint sama dengan
 * data_referensi/getjadwaldokter, update_jadwal_dokter, dan Mobil_jkn/save_update_jadwal_dokter.
 *
 * Satu baris = satu sesi praktik: hari (1 = Senin … 7 = Minggu), jadwal ("08:00-12:00"),
 * kapasitaspasien, dan dokter (kodedokter = KODE_DOKTER_BPJS, atau KDDOKTER bila belum punya kode BPJS).
 */
import { http } from './http'
import { rapikanAlamat } from '@/utils/format'
import { getIdClient } from './session'

export const HARI = [
  { hari: 1, nama: 'Senin' },
  { hari: 2, nama: 'Selasa' },
  { hari: 3, nama: 'Rabu' },
  { hari: 4, nama: 'Kamis' },
  { hari: 5, nama: 'Jumat' },
  { hari: 6, nama: 'Sabtu' },
  { hari: 7, nama: 'Minggu' }
]

export const KAPASITAS_BAWAAN = 20

/** Kode yang dipakai m_dokter_jadwal.kodedokter untuk dokter ini. */
export const kodeJadwalDokter = (dokter) => String(dokter.KODE_DOKTER_BPJS || dokter.KDDOKTER || '')

/**
 * Semua jadwal klinik. Item: id, hari, namahari, jadwal, kapasitaspasien, libur, kodedokter, namadokter, kodepoli, namapoli, …
 * `idClient` diisi untuk halaman publik (tanpa login); bila kosong dipakai klinik dari sesi login.
 */
export async function getJadwalSemua(idClient = getIdClient()) {
  const res = await http.get(`/index.php/api/data_referensi/getjadwaldokter/${idClient}`)
  return Array.isArray(res) ? res : []
}

/** Nama, logo, dan alamat klinik untuk halaman publik (get_profile_rs). null bila gagal dimuat. */
export async function getProfilKlinik(idClient) {
  try {
    const p = await http.get(`/index.php/api/Data_referensi/get_profile_rs/${idClient}`)
    return p && typeof p === 'object' ? { nama: p.NAMA_RS || '', logo: p.LINK_LOGO2 || p.LINK_LOGO || '', alamat: rapikanAlamat(p.ALAMAT) || '' } : null
  } catch {
    return null
  }
}

/** Alamat halaman jadwal yang bisa dibuka siapa saja tanpa login. */
export function linkJadwalPublik(idClient = getIdClient()) {
  return new URL(`${import.meta.env.BASE_URL}jadwal/${idClient}`.replace(/\/{2,}/g, '/'), window.location.origin).href
}

// Kolom kodedokter bisa bertipe angka di database, sehingga "007" kembali sebagai "7": bandingkan tanpa nol di depan
const normKode = (k) => String(k ?? '').trim().replace(/^0+(?=\d)/, '')

const normNama = (n) => String(n ?? '').trim().toLowerCase()

/**
 * Baris jadwal milik satu dokter: kodenya sama, atau namanya sama. Nama dipakai juga karena kode non-angka
 * (mis. "RTR") bisa tersimpan sebagai 0 bila kolom kodedokter bertipe angka, sehingga kode tidak bisa dipercaya.
 */
export function jadwalMilik(rows, dokter) {
  const kode = [dokter.KODE_DOKTER_BPJS, dokter.KDDOKTER].filter(Boolean).map(normKode)
  const nama = normNama(dokter.NAMADOKTER)
  return rows.filter((r) => kode.includes(normKode(r.kodedokter)) || (nama && normNama(r.namadokter) === nama))
}

/** "08:00-12:00" -> { mulai: '08:00', selesai: '12:00' } (null bila formatnya tidak dikenali). */
export function parseJam(jadwal) {
  const m = String(jadwal ?? '').match(/(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/)
  if (!m) return null
  const p = (n) => String(n).padStart(2, '0')
  return { mulai: `${p(m[1])}:${m[2]}`, selesai: `${p(m[3])}:${m[4]}` }
}

const kunciPoliHari = (kodepoli, hari) => `${kodepoli}|${hari}`

/**
 * Simpan jadwal satu dokter.
 * `sesi`: [{ hari, mulai: 'HH:mm', selesai: 'HH:mm', kapasitas }] — jadwal lengkap dokter ini
 * (hari yang tidak ada di sini dianggap libur/tidak praktik).
 * `semuaRows`: hasil getJadwalSemua() terbaru, dipakai agar jadwal dokter lain ikut terkirim ulang.
 *
 * save_update_jadwal_dokter menghapus SEMUA baris dengan poli + hari yang sama sebelum menyimpan, jadi
 * baris dokter lain pada poli + hari tersebut dikirim ulang bersama jadwal baru. Baris lama dokter ini
 * di poli + hari yang tidak ikut terkirim dihapus per id (update_jadwal_dokter mode 2).
 */
export async function simpanJadwalDokter(dokter, namaPoli, sesi, semuaRows) {
  const idClient = getIdClient()
  const kode = kodeJadwalDokter(dokter)
  const kodepoli = dokter.KDPOLY_BPJS
  if (sesi.length && !kodepoli) throw new Error('Dokter ini belum punya poli. Atur poli dokter di Master Data > Dokter terlebih dahulu.')
  if (!kode) throw new Error('Dokter ini tidak punya kode.')

  const lama = jadwalMilik(semuaRows, dokter)
  const baru = sesi.map((s) => {
    const hari = HARI.find((h) => h.hari === s.hari)
    return {
      kodesubspesialis: kodepoli,
      hari: s.hari,
      kapasitaspasien: Number(s.kapasitas) || 0,
      libur: 0,
      namahari: hari.nama.toUpperCase(),
      jadwal: `${s.mulai}-${s.selesai}`,
      namasubspesialis: namaPoli || kodepoli,
      namadokter: dokter.NAMADOKTER,
      kodepoli,
      namapoli: namaPoli || kodepoli,
      kodedokter: kode
    }
  })

  const terkena = new Set(baru.map((r) => kunciPoliHari(r.kodepoli, r.hari)))
  const idLama = new Set(lama.map((r) => r.id))
  const milikDokterLain = (r) => !idLama.has(r.id)
  const dikirimUlang = semuaRows
    .filter((r) => milikDokterLain(r) && terkena.has(kunciPoliHari(r.kodepoli, r.hari)))
    .map((r) => ({
      kodesubspesialis: r.kodesubspesialis ?? '',
      hari: r.hari,
      kapasitaspasien: r.kapasitaspasien ?? 0,
      libur: r.libur ?? 0,
      namahari: r.namahari ?? '',
      jadwal: r.jadwal ?? '',
      namasubspesialis: r.namasubspesialis ?? '',
      namadokter: r.namadokter ?? '',
      kodepoli: r.kodepoli,
      namapoli: r.namapoli ?? '',
      kodedokter: r.kodedokter
    }))

  if (baru.length) {
    const kode200 = await http.post(`/index.php/api/Mobil_jkn/save_update_jadwal_dokter/${idClient}`, [...dikirimUlang, ...baru])
    if (Number(kode200) !== 200) throw new Error('Jadwal gagal disimpan')
  }

  // Baris lama yang pasangan poli + harinya tidak tertimpa di atas
  for (const r of lama) {
    if (terkena.has(kunciPoliHari(r.kodepoli, r.hari))) continue
    const res = await http.post('/index.php/api/data_referensi/update_jadwal_dokter', { mode: 2, id: r.id, id_client: idClient })
    if (res?.code != 200) throw new Error(res?.message || 'Gagal menghapus jadwal lama')
  }
}
