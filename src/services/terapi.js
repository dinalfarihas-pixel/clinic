/**
 * API terapi / resep obat rawat jalan — web service apotek (ws_posindo), endpoint sama dengan
 * TeraphyComponent di simrs_spa_v2.
 */
import { http } from './http'
import { getIdClient as idClient } from './session'
import { useConfigStore } from '@/stores/config'

const apotik = () => useConfigStore().apiApotikUrl

// ── Obat ─────────────────────────────────────────────────────

/** Cari obat di apotek (minimal 3 huruf) — barang/getdatabarang_v31. */
export async function cariObat(nama, idLokasi) {
  if (!nama || nama.length < 3) return []
  const res = await http.post(`${apotik()}/index.php/api/barang/getdatabarang_v31`, {
    barcode: '',
    mode: 19,
    id_client: idClient(),
    breakdown: 1,
    nama,
    lokasi: idLokasi || ''
  }) 
  return res?.metadata?.code == 200 && Array.isArray(res.response) ? res.response : []
}

/** Obat yang paling sering diresepkan di suatu poli hari ini (maks. `limit`). */
export async function getRecentObat(kodePoli, limit = 20) {
  const res = await http.post(`${apotik()}/index.php/api/data_referensi/get_recent_obat_poly`, {
    id_client: idClient(),
    kode_poli: kodePoli || 'UNKNOWN',
    limit: String(limit)
  })
  console.log(res.data)
  return res?.code == 200 && Array.isArray(res.result) ? res.result : []
}

/** Cari cara pakai / aturan minum obat (minimal 2 huruf) — barang/get_remarkv3. */
export async function cariCaraPakai(keyword) {
  if (!keyword || keyword.length < 2) return []
  const res = await http.post(`${apotik()}/index.php/api/barang/get_remarkv3`, { mode: 2, keyword })
  return Array.isArray(res?.response) ? res.response : []
}

// ── Resep ────────────────────────────────────────────────────

/** Riwayat resep untuk satu kunjungan (noReg) — sales/get_header_sales, hanya baris obat. */
export async function getRiwayatResep(noReg) {
  const res = await http.post(`${apotik()}/index.php/api/sales/get_header_sales`, {
    NOREGIRTER_KLINIK: noReg,
    RECEIPT_NO: noReg,
    MODE: 'RESEP_HISTORY',
    IDCLIENT: idClient(),
    TGLMIN: '',
    TGLMAX: ''
  })
  const rows = Array.isArray(res?.response) ? res.response : []
  return rows.filter((r) => r.OBAT_OBATAN == 1)
}

/** Detail item satu resep berdasarkan RECEIPT_NO — sales/billv2. */
export async function getDetailResep(receiptNo) {
  const res = await http.post(`${apotik()}/index.php/api/sales/billv2`, {
    NOREGIRTER_KLINIK: receiptNo,
    RECEIPT_NO: receiptNo,
    MODE: 'RCPT',
    IDCLIENT: idClient(),
    TGLMIN: '',
    TGLMAX: '',
    MEMBERSHIP: ''
  })
  return Array.isArray(res?.response) ? res.response : []
}

/** Kirim resep ke apotek — sales/kirim_resep. */
export async function kirimResep(receiptNo) {
  const res = await http.post(`${apotik()}/index.php/api/sales/kirim_resep/${idClient()}`, { RECEIPT_NO: receiptNo })
  return res
}

/** Batalkan (void) resep — sales/void_sales. */
export async function batalResep(receiptNo) {
  const res = await http.post(`${apotik()}/index.php/api/sales/void_sales/${receiptNo}/${idClient()}/0`)
  if (res?.metadata?.code == 200) return true
  throw new Error(res?.metadata?.message || 'Gagal membatalkan resep')
}

/** Simpan resep baru — sales/insert_sales_v3. `header` mengikuti struktur header insert_sales_v3. */
export async function simpanResep(header) { 
  
  const res = await http.post(`${apotik()}/index.php/api/sales/insert_sales_v3`, { header })

  if (res?.metadata?.code == 200) return res
  throw new Error(res?.metadata?.message || 'Gagal menyimpan resep')
}

// ── Template obat ────────────────────────────────────────────

/** Daftar template resep milik user. */
export async function getTemplateObat(userId) {
  const res = await http.post(`${apotik()}/index.php/api/data_referensi/get_template`, { user_id: userId, id_client: idClient() })
  return res?.metadata?.code == 200 && Array.isArray(res.response) ? res.response : []
}

/** Simpan template resep baru (kumpulan obat) dengan nama `caption`. */
export async function simpanTemplateObat(caption, userId, items) {
  const res = await http.post(`${apotik()}/index.php/api/data_referensi/saveTemplate`, {
    caption_template: caption,
    user_id: userId,
    id_client: idClient(),
    item: items
  })
  if (res?.metadata?.code == 200) return true
  throw new Error(res?.metadata?.message || 'Gagal menyimpan template obat')
}

/** Hapus template resep. */
export async function hapusTemplateObat(noTemplate, userId) {
  const res = await http.post(`${apotik()}/index.php/api/data_referensi/hapusTemplate`, { no_template: noTemplate, user_id: userId })
  if (res?.metadata?.code == 200) return true
  throw new Error(res?.metadata?.message || 'Gagal menghapus template obat')
}

// ── Billing / plafon ─────────────────────────────────────────

/** Total biaya & plafon obat kunjungan ini (relevan untuk pasien BPJS) — transaksi_pasien/get_data_billing_perpasien. */
export async function getBillingPasien(noReg) {
  const res = await http.post('/index.php/api/transaksi_pasien/get_data_billing_perpasien', {
    mode: 1,
    no_transaksi: noReg,
    id_client: idClient()
  })
  return res || null
}
