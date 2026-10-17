/**
 * API pengguna (akun login) — ws_sim_v2 (tabel m_login), endpoint M_setting sama dengan
 * views/Manajemen/UserManajemenView.vue di SIMRS (simrs_spa_v2), dipersempit ke tambah & hapus.
 */
import { http } from './http'
import { getIdClient } from './session'
import { buatRoles } from '@/config/akses'

/**
 * Daftar pengguna klinik ini (get_users_by_client), urut nama.
 * Item: ID, NIP (username login), NAMA_USER, JABATAN, GROUP_USER, NIK, ID_LOKASI, ID_LOKASI_INV, dst.
 */
export async function getDaftarPengguna() {
  const res = await http.post('/index.php/api/setting/get_users_by_client', { id_client: getIdClient() })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Tambah pengguna — save_user lalu update_password.
 * save_user menyimpan kata sandi sebagai md5, sedangkan login (userloginv3) mencocokkan kata sandi
 * apa adanya; update_password menulis ulang kata sandi dalam bentuk yang dipakai login. Tanpa
 * langkah kedua pengguna baru tidak bisa masuk. Kata sandi ikut di URL, jadi hanya boleh berisi
 * karakter yang aman untuk URL (lihat POLA_KATA_SANDI).
 * `pengguna`: { NAMA_USER, NIP, PWD, JABATAN, NIK, ID_LOKASI, ROLE, AKSES } (ROLE 'admin'|'user', AKSES = kunci menu). Ditolak (409) bila NIP sudah dipakai.
 */
export async function tambahPengguna(pengguna) {
  const idClient = getIdClient()
  const res = await http.post('/index.php/api/setting/save_user', {
    // Kolom yang tidak dipakai klinik dikirim sebagai string kosong (sama dengan form SIMRS):
    // bila tidak dikirim, backend mengisinya NULL dan ditolak kolom m_login yang NOT NULL
    ...KOLOM_KOSONG,
    NAMA_USER: pengguna.NAMA_USER,
    NIP: pengguna.NIP,
    PWD: pengguna.PWD,
    JABATAN: pengguna.JABATAN || '',
    NIK: pengguna.NIK || '',
    ID_LOKASI: pengguna.ID_LOKASI || '',
    // Login mengambil nama unit dari ID_LOKASI_INV
    ID_LOKASI_INV: pengguna.ID_LOKASI || '',
    ROLES: buatRoles(pengguna.ROLE, pengguna.AKSES),
    ID_CLIENT: idClient
  })
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal menambahkan pengguna')

  let kode
  try {
    kode = await http.post(
      `/index.php/api/data_referensi/update_password/${encodeURIComponent(pengguna.NIP)}/${encodeURIComponent(pengguna.PWD)}/${idClient}`
    )
  } catch {
    kode = null
  }
  if (Number(kode) !== 200) {
    throw new Error('Pengguna tersimpan, tetapi kata sandinya gagal diatur sehingga belum bisa masuk. Hapus pengguna ini lalu tambahkan lagi.')
  }
  return res.metadata.message || 'Pengguna berhasil ditambahkan'
}

/**
 * Ubah peran & hak akses menu pengguna (update_user). update_user menimpa semua kolom dengan nilai
 * yang dikirim, jadi seluruh baris pengguna (hasil get_users_by_client) dikirim ulang dengan ROLES baru;
 * tanpa PWD kata sandi tidak berubah.
 */
export async function ubahHakAkses(pengguna, role, akses) {
  const res = await http.post('/index.php/api/setting/update_user', {
    ...pengguna,
    ROLES: buatRoles(role, akses),
    ID_CLIENT: getIdClient()
  })
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal menyimpan hak akses')
  return res.metadata.message || 'Hak akses berhasil disimpan'
}

/** Kata sandi bawaan setelah reset. */
export const KATA_SANDI_RESET = '123456'

/** Reset kata sandi pengguna ke KATA_SANDI_RESET (update_password, sama dengan langkah kedua tambahPengguna). */
export async function resetKataSandi(nip) {
  let kode
  try {
    kode = await http.post(
      `/index.php/api/data_referensi/update_password/${encodeURIComponent(nip)}/${KATA_SANDI_RESET}/${getIdClient()}`
    )
  } catch {
    kode = null
  }
  if (Number(kode) !== 200) throw new Error('Kata sandi gagal direset')
}

/** Ganti kata sandi akun yang sedang login (ganti_password_user_v1, sama dengan GantiPasswordView di SIMRS). */
export async function gantiKataSandi(userId, passwordLama, passwordBaru) {
  const res = await http.post('/index.php/api/data_referensi/ganti_password_user_v1', {
    user_id: userId,
    id_client: getIdClient(),
    password_lama: passwordLama,
    password_baru: passwordBaru
  })
  const code = res?.metadata?.code ?? res?.code
  const message = res?.metadata?.message || res?.message
  if (Number(code) !== 200) throw new Error(message || 'Gagal mengubah kata sandi')
  return message || 'Kata sandi berhasil diubah'
}

/** Hapus pengguna secara permanen berdasarkan ID baris m_login (delete_user). */
export async function hapusPengguna(id) {
  const res = await http.post('/index.php/api/setting/delete_user', { ID: id })
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal menghapus pengguna')
  return res.metadata.message || 'Pengguna berhasil dihapus'
}

const KOLOM_KOSONG = {
  JENIS_NOINDUK: '', NOINDUK: '', KDJABATAN: '', PROFESI: '', KD_DOKTER: '', KD_DOKTER_BPJS: '', GROUP_USER: '',
  SES_REG: '', ROLES: '', ROLES_INV: '', KDUNIT: '', DEPARTEMEN: '', JENISRAWAT: '', LOKET: '', JENIS_LOKET: '',
  USER_ID_INV: '', PASS_TTE: '', KODE_TARIF_EKLAIM: '', PAYOR_ID: '', PAYOR_CD: '', COB_CD: '', EMAIL: '', FGL: '',
  IS_USER_IGD: 0, PRATITIONER_ID: '', NO_SIPA: '', IS_DEFAULT_APOTEKER: 0
}

// Username & kata sandi dikirim lewat URL (update_password), jadi dibatasi ke karakter aman
export const POLA_USERNAME = /^[A-Za-z0-9._-]+$/
export const POLA_KATA_SANDI = /^[A-Za-z0-9._-]+$/
