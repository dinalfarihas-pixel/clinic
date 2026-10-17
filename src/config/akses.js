/**
 * Hak akses menu — disimpan di kolom m_login.ROLES (ikut get_users_by_client / save_user / update_user),
 * jadi tidak butuh perubahan backend. Format:
 *   KLINIK:admin                 -> akses penuh + kelola pengguna
 *   KLINIK:user:kunci1,kunci2    -> hanya menu dengan kunci tsb (+ Dashboard)
 * Nilai ROLES kosong / bukan format ini (akun lama) dianggap admin supaya tidak ada yang terkunci.
 * Catatan: ini pembatas tampilan & navigasi di aplikasi; backend ws_sim_v2 belum menegakkannya.
 */
import { semuaItemMenu } from './menu'

export const ROLE_ADMIN = 'admin'
export const ROLE_USER = 'user'

const PREFIX = 'KLINIK:'

/** Dashboard selalu bisa dibuka semua pengguna. */
export const KEY_SELALU = ['dashboard']

/** Menu yang bisa dipilih admin untuk pengguna biasa (tanpa Dashboard & menu khusus admin). */
export function menuBisaDiatur() {
  return semuaItemMenu().filter((m) => !m.adminOnly && !KEY_SELALU.includes(m.key))
}

export function parseRoles(roles) {
  const s = String(roles ?? '').trim()
  if (!s.startsWith(PREFIX)) return { role: ROLE_ADMIN, akses: [] }
  const [role, daftar = ''] = s.slice(PREFIX.length).split(':')
  if (role !== ROLE_USER) return { role: ROLE_ADMIN, akses: [] }
  return { role: ROLE_USER, akses: daftar.split(',').map((k) => k.trim()).filter(Boolean) }
}

export function buatRoles(role, akses = []) {
  if (role !== ROLE_USER) return `${PREFIX}${ROLE_ADMIN}`
  const valid = new Set(menuBisaDiatur().map((m) => m.key))
  return `${PREFIX}${ROLE_USER}:${akses.filter((k) => valid.has(k)).join(',')}`
}
