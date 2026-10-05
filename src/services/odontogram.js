/**
 * API odontogram gigi rawat jalan — endpoint sama dengan OdontogramComponent di simrs_spa_v2
 * (penunjang/get_odontogram, penunjang/save_odontogram).
 */
import { http } from './http'
import { getIdClient as idClient } from './session'

/** Odontogram tersimpan (terbaru) untuk satu kunjungan, atau null bila belum ada. */
export async function getOdontogram(noReg, norm) {
  const res = await http.post('/index.php/api/penunjang/get_odontogram', {
    noregister: noReg,
    norm,
    id_client: idClient()
  })
  return res?.code == 200 && res.data && !Array.isArray(res.data) ? res.data : null
}

/** Riwayat odontogram (semua versi tersimpan) untuk satu kunjungan — mode 3. */
export async function getRiwayatOdontogram(noReg, norm) {
  const res = await http.post('/index.php/api/penunjang/get_odontogram', {
    noregister: noReg,
    norm,
    id_client: idClient(),
    mode: 3
  })
  return res?.code == 200 && Array.isArray(res.data) ? res.data : []
}

/** Simpan odontogram (peta kondisi gigi + keluhan/catatan). */
export async function simpanOdontogram({ noReg, norm, userId, teethData, keluhan, catatan }) {
  const res = await http.post('/index.php/api/penunjang/save_odontogram', {
    noregister: noReg,
    norm,
    id_client: idClient(),
    user_id: userId,
    teeth_data: teethData,
    keluhan,
    catatan
  })
  if (res?.code == 200 || res?.status === 'success') return true
  throw new Error(res?.message || 'Gagal menyimpan odontogram')
}
