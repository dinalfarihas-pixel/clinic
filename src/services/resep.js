/**
 * API resep masuk & proses resep farmasi — ws_posindo_v2.1 (M_sales), endpoint sama dengan
 * views/Inventory/Sales/LIstResepView.vue + ProsesResepView.vue di SIMRS (simrs_spa_v2),
 * dipersempit ke alur dispensing inti: satu batch stok per item (tanpa dialog pengelompokan
 * racikan/puyer, tanpa pencarian obat pengganti "CHG", tanpa panggilan antrian farmasi, tanpa
 * analitik waktu tunggu). Baris parent racikan dari billv3 (barcode 00000) disaring karena
 * tidak mewakili stok nyata; bahan racikan (child, barcode asli) tetap tampil apa adanya
 * sebagai baris terpisah sehingga tetap bisa diberikan & memotong stok dengan benar.
 */
import { apotik } from './http'
import { getIdClient, getIdLokasi } from './session'

export const STATUS_RESEP = [
  { kode: 'M', label: 'Menunggu', severity: 'danger' },
  { kode: 'P', label: 'Proses', severity: 'warn' },
  { kode: 'C', label: 'Selesai', severity: 'success' }
]

export function labelStatusResep(kode) {
  return STATUS_RESEP.find((s) => s.kode === kode)?.label || 'Menunggu'
}
export function severityStatusResep(kode) {
  return STATUS_RESEP.find((s) => s.kode === kode)?.severity || 'danger'
}

/** "28T,5B,9H" (format M_sales::menghitung_usia) -> "28 th 5 bl". */
export function formatUsiaResep(usia) {
  const m = String(usia || '').match(/^(\d+)T,(\d+)B,(\d+)H$/)
  return m ? `${m[1]} th ${m[2]} bl` : usia || ''
}

/**
 * Daftar resep masuk (rawat jalan & rawat inap) dalam rentang tanggal — backend membatasi
 * rentang maksimal 20 hari. Tanggal format YYYY-MM-DD.
 * Item: TRANS, NOMR, NOREGISTER, NAMA, USIA, JENISKELAMIN, ALAMAT, DPJP, JENISRAWAT,
 * CARABAYAR, POLI_RUANG, TANGGAL, STATUS_PROGRESS ('M'/'P'/'C'), NOMORANTRIAN,
 * MASUK/PROSES/SELESAI (jam 'HH:mm' atau ''), JAM_KIRIM_RESEP, WAKTU_SELESAI,
 * OBAT_PULANG ('YA'/''), STTS_PRB.
 */
export async function getDaftarResepMasuk({ tglAwal, tglAkhir }) {
  const akhir = tglAkhir || tglAwal
  const res = await apotik.get(`/index.php/api/sales/get_list_resep_v2/${getIdClient()}/${getIdLokasi()}/${tglAwal}/${akhir}/`)
  const code = String(res?.metadata?.code)
  if (code !== '200' && code !== '201') throw new Error(res?.metadata?.message || 'Gagal memuat daftar resep')
  return Array.isArray(res.response) ? res.response : []
}

/**
 * Detail satu resep untuk diproses (billv3, MODE='RCPT'). Baris flat, header didenormalisasi
 * di setiap baris (field sama di semua baris) — diambil dari baris pertama.
 * Item: ITEMSEQNO, SUBITEMSEQNO, BARCODE, BARCODE_REQ, NAMABARANG, NAMABARANG_REQ, MEREK
 * (dipakai juga sbg SATUAN tampilan), QTY (sudah diberikan), QTY_REQ (diminta), HARGA,
 * HARGABELI, TOTALAMOUNT, DISCOUNT, STATUS, REMARK_ITEM, JSON_FILE (batch yang sudah dipilih
 * bila ada), STATUS_PROGRESS, AS_PARENT, JENIS_R.
 * Mengembalikan { header, items } — header null bila resep tidak ditemukan.
 */
export async function getDetailResep(trans, { tanggal, nomr, noregister } = {}) {
  
  const res = await apotik.post('/index.php/api/sales/billv3', {}, {
    IDCLIENT: getIdClient(),
    RECEIPT_NO: trans,
    MODE: 'RCPT',
    TGLMAX: tanggal || '',
    TGLMIN: tanggal || '',
    MEMBERSHIP: nomr || null,
    NOREGIRTER_KLINIK: noregister || null
  })
  const rows = Array.isArray(res?.response) ? res.response : []
  const items = rows.filter((r) => !(String(r.BARCODE) === '00000' && r.JENIS_R === 'R/' && String(r.AS_PARENT) === '1'))
  return { header: rows[0] || null, items }
}

/**
 * Simpan hasil dispensing resep (update_sales_v4) — memotong stok sesuai batch yang dipilih
 * per item (field `details[].JSON_FILE`, lihat buildJsonFileBatch di ProsesResepView) dan
 * memperbarui status resep. Melempar error jika gagal.
 */
export async function simpanProsesResep(payload) {
 
  const res = await apotik.post('/index.php/api/sales/update_sales_v4', {}, payload)
  const code = String(res?.metadata?.code)
  if (code !== '200') throw new Error(res?.metadata?.message || 'Gagal menyimpan resep')
}

/**
 * Batalkan (refund) satu item resep — mengembalikan stok yang sudah dipotong untuk item ini
 * (bila ada) dan menandai baris tersebut REFUND (hilang dari billv3 berikutnya).
 * `payload`: { RECEIPT_NO, ITEMSEQNO, BARCODE, JSON_FILE, ID_LOKASI, TANGGAL }.
 * Endpoint ini membalas angka mentah 200/201 (bukan objek metadata).
 */
export async function refundItemResep(payload) {
  const res = await apotik.post(`/index.php/api/sales/refund_item_v2/${getIdClient()}`, {}, payload)
  if (Number(res) !== 200) throw new Error('Gagal membatalkan item resep')
}
