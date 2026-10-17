import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { http } from '@/services/http'
import { getDaftarPengguna } from '@/services/pengguna'
import { parseRoles, ROLE_ADMIN, ROLE_USER, KEY_SELALU } from '@/config/akses'
import { semuaItemMenu } from '@/config/menu'
import { rapikanAlamat } from '@/utils/format'

// Key localStorage sama dengan SIMRS supaya data sesi bisa dibaca store lain (mis. useAuthStore di config.js)
const KEYS = ['loggedIn', 'id_client', 'user_name', 'user_id', 'id_lokasi', 'group_user', 'kd_dokter', 'token', 'NAMA_RS', 'NAMA_RS_2', 'LINK_LOGO', 'LINK_LOGO2', 'ALAMAT', 'KODE_PPK', 'user', 'last_activity', 'hak_akses', 'no_sipa']

// Sesi otomatis dianggap habis jika tidak ada aktivitas selama 3 jam
const SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function readNumber(key) {
  const v = read(key)
  return v ? Number(v) : null
}

function readAkses() {
  try {
    return JSON.parse(read('hak_akses') || 'null')
  } catch {
    return null
  }
}

function readUser() {
  try {
    return JSON.parse(read('user') || 'null')
  } catch {
    return null
  }
}

/**
 * Store autentikasi — login ke web service SIMRS (userloginv3).
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(readUser()) // { name, role, unit }
  const token = ref(read('token'))
  const idClient = ref(read('id_client'))
  const userId = ref(read('user_id'))
  const idLokasi = ref(read('id_lokasi'))
  const kdDokter = ref(read('kd_dokter'))
  const company = ref(read('NAMA_RS'))         // nama klinik
  const companyApotek = ref(read('NAMA_RS_2')) // nama apotek (NAMA_RS_2)
  const logo = ref(read('LINK_LOGO'))
  const logo2 = ref(read('LINK_LOGO2')) // logo alternatif (profile_rs.LINK_LOGO2), dipakai di halaman login
  // Logo untuk dokumen/halaman klinik: LINK_LOGO2, jika kosong LINK_LOGO. Dokumen apotek tetap memakai `logo` (LINK_LOGO).
  const logoKlinik = computed(() => logo2.value || logo.value)
  const alamat = ref(rapikanAlamat(read('ALAMAT')))
  const kodePpk = ref(read('KODE_PPK')) // kode faskes klinik di BPJS
  const noSipa = ref(read('no_sipa')) // SIPA apoteker (m_login.NO_SIPA)
  const lastActivity = ref(readNumber('last_activity'))

  const isLoggedIn = computed(() => !!idClient.value)

  // Hak akses menu: { role: 'admin' | 'user', akses: [kunci menu] } — dari m_login.ROLES (lihat config/akses.js)
  const hakAkses = ref(readAkses())
  const isAdmin = computed(() => hakAkses.value?.role === ROLE_ADMIN)
  const kunciAdminOnly = new Set(semuaItemMenu().filter((m) => m.adminOnly).map((m) => m.key))

  /** true jika pengguna boleh membuka menu/route dengan kunci ini. Tanpa data hak akses: hanya Dashboard. */
  function bolehAkses(key) {
    if (!key || KEY_SELALU.includes(key)) return true
    const h = hakAkses.value
    if (!h) return false
    if (h.role === ROLE_ADMIN) return true
    return h.role === ROLE_USER && !kunciAdminOnly.has(key) && h.akses.includes(key)
  }

  /** Ambil hak akses akun yang sedang login dari daftar pengguna (login tidak mengembalikan ROLES). */
  async function muatHakAkses() {
    try {
      const daftar = await getDaftarPengguna()
      const saya = daftar.find((p) => String(p.NIP ?? '').trim().toLowerCase() === String(userId.value ?? '').trim().toLowerCase())
      if (!saya) return // akun tidak ditemukan: pertahankan data yang ada
      noSipa.value = String(saya.NO_SIPA ?? '').trim() || null
      localStorage.setItem('no_sipa', noSipa.value || '')
      hakAkses.value = parseRoles(saya.ROLES)
      localStorage.setItem('hak_akses', JSON.stringify(hakAkses.value))
    } catch {
      /* gagal memuat: pakai hak akses tersimpan (jika ada) */
    }
  }

  /** Catat waktu aktivitas terakhir (dipanggil saat navigasi/interaksi user). */
  function touchActivity() {
    lastActivity.value = Date.now()
    try {
      localStorage.setItem('last_activity', String(lastActivity.value))
    } catch {
      /* abaikan */
    }
  }

  /** true jika tidak ada aktivitas selama lebih dari SESSION_TIMEOUT_MS (default 3 jam). */
  function isSessionExpired() {
    if (!lastActivity.value) return false
    return Date.now() - lastActivity.value > SESSION_TIMEOUT_MS
  }
  const initials = computed(() =>
    (user.value?.name || '')
      .replace(/^(dr|drg|ns|apt)\.?\s+/i, '')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  )

  async function login(username, password) {
    const res = await http.post('/index.php/api/data_referensi/userloginv3', { username, pass: password })
    if (res?.metadata?.code != 200) {
      throw new Error(res?.metadata?.message || 'Nama pengguna atau kata sandi salah')
    }

    const u = res.response
    user.value = {
      name: u.NAMA_USER,
      role: u.JABATAN || u.GROUP_USER || 'Pengguna',
      unit: u.LOK_CAPTION || u.NAMA_RS || ''
    }
    token.value = u.token || null
    idClient.value = String(u.ID_CLIENT)
    userId.value = username
    idLokasi.value = u.ID_LOKASI ?? ''
    kdDokter.value = u.KD_DOKTER || ''
    company.value = u.NAMA_RS || null

    try {
      localStorage.setItem('loggedIn', 'true')
      localStorage.setItem('id_client', idClient.value)
      localStorage.setItem('user_name', u.NAMA_USER)
      localStorage.setItem('user_id', username)
      localStorage.setItem('id_lokasi', u.ID_LOKASI ?? '')
      localStorage.setItem('group_user', u.GROUP_USER ?? '')
      localStorage.setItem('kd_dokter', u.KD_DOKTER || '')
      if (u.NAMA_RS) localStorage.setItem('NAMA_RS', u.NAMA_RS)
      if (u.token) localStorage.setItem('token', u.token)
      localStorage.setItem('user', JSON.stringify(user.value))
    } catch {
      /* abaikan jika storage tidak tersedia */
    }
    touchActivity()

    await Promise.all([loadProfile(), muatHakAkses()])
    return u
  }

  /** Profil klinik (nama, logo, alamat) — seperti profile_rs di SIMRS. Gagal tidak membatalkan login. */
  async function loadProfile() {
    try {
      const p = await http.get(`/index.php/api/Data_referensi/get_profile_rs/${idClient.value}`)
      if (!p) return
      if (p.NAMA_RS) company.value = p.NAMA_RS
      companyApotek.value = p.NAMA_RS_2 || null
      logo.value = p.LINK_LOGO || null
      logo2.value = p.LINK_LOGO2 || null
      alamat.value = rapikanAlamat(p.ALAMAT) || null
      kodePpk.value = p.KODE_PPK || null
      localStorage.setItem('NAMA_RS', company.value || '')
      localStorage.setItem('NAMA_RS_2', companyApotek.value || '')
      localStorage.setItem('LINK_LOGO', logo.value || '')
      localStorage.setItem('LINK_LOGO2', logo2.value || '')
      localStorage.setItem('ALAMAT', alamat.value || '')
      localStorage.setItem('KODE_PPK', kodePpk.value || '')
    } catch {
      /* profil opsional */
    }
  }

  function logout() {
    user.value = null
    token.value = null
    idClient.value = null
    userId.value = null
    idLokasi.value = null
    kdDokter.value = null
    company.value = null
    companyApotek.value = null
    logo.value = null
    logo2.value = null
    alamat.value = null
    kodePpk.value = null
    lastActivity.value = null
    hakAkses.value = null
    noSipa.value = null
    try {
      KEYS.forEach((k) => localStorage.removeItem(k))
    } catch {
      /* abaikan */
    }
  }

  return {
    user, token, idClient, userId, idLokasi, kdDokter, company, companyApotek, logo, logo2, logoKlinik, alamat, kodePpk, noSipa,
    isLoggedIn, initials, hakAkses, isAdmin, bolehAkses, muatHakAkses, login, logout, loadProfile, touchActivity, isSessionExpired
  }
})
