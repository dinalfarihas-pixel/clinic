import { useAuthStore } from '@/stores/auth'

/** id_client dari sesi login; wajib untuk hampir semua endpoint ws_sim_v2. */
export function getIdClient() {
  const id = useAuthStore().idClient
  if (!id) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
  return id
}

/** id_lokasi (unit kerja) dari sesi login; dipakai untuk cek stok/lokasi obat di apotek. */
export function getIdLokasi() {
  return useAuthStore().idLokasi || ''
}

/** user_id (username) dari sesi login. */
export function getUserId() {
  return useAuthStore().userId || ''
}

/** Nama tampilan pengguna dari sesi login (fallback ke username). */
export function getUserName() {
  const auth = useAuthStore()
  return auth.user?.name || auth.userId || ''
}
