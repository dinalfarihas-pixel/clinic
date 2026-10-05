import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { http } from '@/services/http'

// Key localStorage sama dengan SIMRS supaya data sesi bisa dibaca store lain (mis. useAuthStore di config.js)
const KEYS = ['loggedIn', 'id_client', 'user_name', 'user_id', 'id_lokasi', 'group_user', 'kd_dokter', 'token', 'NAMA_RS', 'LINK_LOGO', 'ALAMAT', 'KODE_PPK', 'user', 'last_activity']

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
  const company = ref(read('NAMA_RS')) // nama klinik
  const logo = ref(read('LINK_LOGO'))
  const alamat = ref(read('ALAMAT'))
  const kodePpk = ref(read('KODE_PPK')) // kode faskes klinik di BPJS
  const lastActivity = ref(readNumber('last_activity'))

  const isLoggedIn = computed(() => !!idClient.value)

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

    await loadProfile()
    return u
  }

  /** Profil klinik (nama, logo, alamat) — seperti profile_rs di SIMRS. Gagal tidak membatalkan login. */
  async function loadProfile() {
    try {
      const p = await http.get(`/index.php/api/Data_referensi/get_profile_rs/${idClient.value}`)
      if (!p) return
      if (p.NAMA_RS) company.value = p.NAMA_RS
      logo.value = p.LINK_LOGO || null
      alamat.value = p.ALAMAT || null
      kodePpk.value = p.KODE_PPK || null
      localStorage.setItem('NAMA_RS', company.value || '')
      localStorage.setItem('LINK_LOGO', logo.value || '')
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
    logo.value = null
    alamat.value = null
    kodePpk.value = null
    lastActivity.value = null
    try {
      KEYS.forEach((k) => localStorage.removeItem(k))
    } catch {
      /* abaikan */
    }
  }

  return {
    user, token, idClient, userId, idLokasi, kdDokter, company, logo, alamat, kodePpk,
    isLoggedIn, initials, login, logout, loadProfile, touchActivity, isSessionExpired
  }
})
