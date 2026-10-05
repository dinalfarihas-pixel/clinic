import { useConfigStore } from '@/stores/config'
import { getIdClient } from './session'

/**
 * Pemanggil web service (CI3 ws_sim_v2).
 * `path` relatif terhadap apiBaseUrl, mis. '/index.php/api/data_referensi/datapoly/12',
 * atau URL lengkap (http...) untuk API lain seperti Laravel.
 */
async function request(method, path, body) {
  const { apiBaseUrl } = useConfigStore()
  const url = /^https?:\/\//.test(path) ? path : `${apiBaseUrl}${path}`
  let res
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new Error('Gagal terhubung ke server. Periksa koneksi internet.')
  }
  const text = await res.text()
  if (!res.ok) {
    // CodeIgniter (db_debug) mengirim halaman HTML berisi pesan error database; tampilkan isinya
    const detail = serverMessage(text)
    throw new Error(`Server merespons ${res.status}${detail ? `: ${detail}` : ` ${res.statusText}`}`)
  }

  try {
    return text ? JSON.parse(text) : null
  } catch {
    // Mis. PHP warning tercetak sebelum JSON
    const detail = serverMessage(text)
    throw new Error(`Respons server bukan JSON yang valid${detail ? `: ${detail}` : ''}`)
  }
}

/** Ambil teks singkat dari respons error (JSON message atau isi HTML tanpa tag). */
function serverMessage(text) {
  if (!text) return ''
  try {
    const json = JSON.parse(text)
    return json?.message || json?.metadata?.message || json?.metaData?.message || ''
  } catch {
    return text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)
  }
}

export const http = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  delete: (path) => request('DELETE', path)
}

/**
 * Pemanggil web service apotek/inventory (CI3 ws_posindo_v2.1), dipakai bersama oleh
 * modul yang berbagi backend ini (mis. supplier, obat). Menambahkan `clientId` ke query
 * string secara otomatis; `params` tambahan (kosong/undefined/null diabaikan) digabung ke sana.
 */
function apotikUrl(path, params = {}) {
  const { apiApotikUrl } = useConfigStore()
  const query = new URLSearchParams({ clientId: getIdClient() })
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  }
  return `${apiApotikUrl}${path}?${query.toString()}`
}

export const apotik = {
  get: (path, params) => request('GET', apotikUrl(path, params)),
  post: (path, params, body = {}) => request('POST', apotikUrl(path, params), body),
  put: (path, params, body = {}) => request('PUT', apotikUrl(path, params), body),
  delete: (path, params) => request('DELETE', apotikUrl(path, params))
}
