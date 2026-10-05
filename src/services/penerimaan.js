/**
 * API penerimaan barang — ws_posindo_v2.1 (PenerimaanV3, tabel t_penerimaan_head/detail).
 * Endpoint sama dengan views/penerimaan/*.vue di SIMRS (simrs_spa_v2), dipersempit sesuai
 * pola pemesanan.js: satu satuan per baris (tanpa multi-tier harga jual/margin per satuan)
 * dan tanpa lampiran faktur (upload file) — klinik-app belum punya pola upload file di modul lain.
 */
import { apotik } from './http'
import { getIdClient, getIdLokasi, getUserId } from './session'

export const JENIS_PENERIMAAN = [
  { label: 'Semua', value: 'semua' },
  { label: 'Dari SP', value: 'sp' },
  { label: 'Langsung (tanpa SP)', value: 'direct' }
]

const STATUS_SEVERITY = { dikirim: 'info', diterima: 'success', selesai: 'secondary', dibatalkan: 'danger' }
export function severityPenerimaan(statusLabel) {
  return STATUS_SEVERITY[(statusLabel || '').toLowerCase()] || 'secondary'
}

/** Ringkasan jumlah & total transaksi penerimaan minggu/bulan/tahun ini (get_summary_penerimaan). */
export async function getSummaryPenerimaan() {
  const res = await apotik.get('/index.php/api/PenerimaanV3/get_summary_penerimaan', { idclient: getIdClient(), id_lokasi: getIdLokasi() })
  return res?.response || null
}

/**
 * Daftar penerimaan (dari SP & langsung digabung, server-side pagination) — get_list_penerimaan.
 * Item: type ('sp'/'direct'), no_sp, no_penerimaan, id_pemesanan, nama_supplier, tanggal,
 * jumlah_penerimaan, grand_total, status_label, persentase.
 */
export async function getDaftarPenerimaan({ search = '', jenis = '', tglAwal = '', tglAkhir = '', page = 1, limit = 20 } = {}) {
  const body = { idclient: getIdClient(), id_lokasi: getIdLokasi(), page, limit }
  if (jenis && jenis !== 'semua') body.jenis = jenis
  if (tglAwal) body.start_date = tglAwal
  if (tglAkhir) body.end_date = tglAkhir
  if (search.trim()) body.search = search.trim()
  const res = await apotik.post('/index.php/api/PenerimaanV3/get_list_penerimaan', {}, body)
  return { rows: Array.isArray(res?.response) ? res.response : [], total: res?.total ?? 0 }
}

/** Detail satu penerimaan, dari SP maupun langsung (get_detail_penerimaan_sp). Mengembalikan { header, details }. */
export async function getDetailPenerimaan(noPenerimaan) {
  const res = await apotik.get(`/index.php/api/PenerimaanV3/get_detail_penerimaan_sp/${noPenerimaan}/${getIdClient()}`)
  return res?.response || null
}

/**
 * Item SP yang siap diterima, dengan qty pesan/sudah diterima/sisa per baris (get_items_sp).
 * Backend: { metadata, sp: {...}, response: [...items] } — item punya field satuan_pesan,
 * qty_pesan(_kecil), qty_sudah_diterima, qty_sisa, satuan_kecil/sedang/besar,
 * isi_sedang_ke_kecil, isi_besar_ke_sedang, is_full (qty_sudah_diterima/qty_sisa selalu
 * dalam satuan kecil/dasar barang).
 * Mengembalikan { spInfo, items }.
 */
export async function getItemSp(idPemesanan) {
  const res = await apotik.get(`/index.php/api/PenerimaanV3/get_items_sp/${idPemesanan}/${getIdClient()}/${getIdLokasi()}`)
  const code = res?.metadata?.code ?? res?.code
  if (code != 200) throw new Error(res?.metadata?.message || res?.message || 'Gagal memuat item surat pesanan')
  return { spInfo: res.sp || null, items: Array.isArray(res.response) ? res.response : [] }
}

/** Riwayat penerimaan yang sudah pernah dicatat untuk satu SP (get_list_penerimaan_sp). */
export async function getRiwayatPenerimaanSp(idPemesanan) {
  const res = await apotik.post('/index.php/api/PenerimaanV3/get_list_penerimaan_sp', {}, {
    id_pemesanan: idPemesanan,
    idclient: getIdClient(),
    id_lokasi: getIdLokasi()
  })
  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Simpan penerimaan barang dari SP (save_penerimaan_sp).
 * `f`: { tanggal_penerimaan, no_faktur, pajak, pajak_include, payment_id, jatuh_tempo?, details }.
 * Mengembalikan { noPenerimaan, persentase }.
 */
export async function simpanPenerimaanSp(idPemesanan, f) {
  const res = await apotik.post('/index.php/api/PenerimaanV3/save_penerimaan_sp', {}, {
    id_pemesanan: idPemesanan,
    user_id: getUserId(),
    idclient: getIdClient(),
    id_lokasi: getIdLokasi(),
    ...f
  })
  const code = res?.metadata?.code ?? res?.code
  if (code != 200) throw new Error(res?.metadata?.message || res?.message || 'Gagal menyimpan penerimaan')
  return { noPenerimaan: res?.metadata?.no_penerimaan || null, persentase: res?.metadata?.persentase ?? null }
}

/**
 * Simpan penerimaan langsung tanpa SP (save_penerimaan_tanpa_sp).
 * `f`: { id_supplier, tanggal_penerimaan, no_faktur, pajak, pajak_include, payment_id, jatuh_tempo?, details }.
 */
export async function simpanPenerimaanLangsung(f) {
  const res = await apotik.post('/index.php/api/PenerimaanV3/save_penerimaan_tanpa_sp', {}, {
    user_id: getUserId(),
    idclient: getIdClient(),
    id_lokasi: getIdLokasi(),
    ...f
  })
  const code = res?.metadata?.code ?? res?.code
  if (code != 200) throw new Error(res?.metadata?.message || res?.message || 'Gagal menyimpan penerimaan')
  return { noPenerimaan: res?.metadata?.no_penerimaan || null }
}

/** Tandai SP selesai setelah semua/sebagian item diterima (selesaikan_sp). Mengembalikan persentase diterima. */
export async function selesaikanSp(idPemesanan) {
  const res = await apotik.post('/index.php/api/PenerimaanV3/selesaikan_sp', {}, {
    id_pemesanan: idPemesanan,
    idclient: getIdClient(),
    id_lokasi: getIdLokasi()
  })
  const code = res?.metadata?.code ?? res?.code
  if (code != 200) throw new Error(res?.metadata?.message || res?.message || 'Gagal menyelesaikan SP')
  return res?.metadata?.persentase ?? null
}

/** Batalkan seluruh penerimaan — stok yang sudah masuk dikembalikan (batal_penerimaan). */
export async function batalPenerimaan(noPenerimaan, keterangan) {
  const body = { no_penerimaan: noPenerimaan, user_id: getUserId(), idclient: getIdClient(), id_lokasi: getIdLokasi() }
  if (keterangan?.trim()) body.keterangan_batal = keterangan.trim()
  const res = await apotik.post('/index.php/api/PenerimaanV3/batal_penerimaan', {}, body)
  const code = res?.metadata?.code ?? res?.code
  if (code != 200) throw new Error(res?.metadata?.message || res?.message || 'Gagal membatalkan penerimaan')
}

/** Batalkan satu item dalam penerimaan — stok item tersebut dikembalikan (batal_item_penerimaan). */
export async function batalItemPenerimaan(noPenerimaan, idBarang, keterangan) {
  const body = { no_penerimaan: noPenerimaan, id_barang: idBarang, user_id: getUserId(), idclient: getIdClient(), id_lokasi: getIdLokasi() }
  if (keterangan?.trim()) body.keterangan_batal = keterangan.trim()
  const res = await apotik.post('/index.php/api/PenerimaanV3/batal_item_penerimaan', {}, body)
  const meta = res?.metadata
  const code = meta?.code ?? res?.code
  if (code != 200) throw new Error(meta?.message || res?.message || 'Gagal membatalkan item')
  return { semuaItemBatal: !!meta?.semua_item_batal }
}
