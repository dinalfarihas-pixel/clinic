/**
 * API kasir kunjungan — menampilkan rincian tagihan satu kunjungan (obat + jasa/tindakan)
 * dan menambah item ad-hoc (mis. konsultasi dokter) ke tagihan itu.
 *
 * Billing dibaca dari ws_sim_v2 (laporan/history_berobat_pasien, sama dengan
 * RMEBillingSection.vue di SIMRS) — endpoint ini menggabungkan data kunjungan (t_pendaftaran)
 * dengan detail transaksi apotek/jasa (ws_posindo: t_trans_penjualan/t_details_trans) yang
 * sudah terhubung lewat NO_REGISTER_KLINIK, jadi tidak perlu dua panggilan terpisah.
 *
 * Tambah item memakai sales/insert_sales_v3 (ws_posindo) — endpoint yang sama dipakai
 * TerapiObat.vue untuk menyimpan resep baru — tiap panggilan membuat baris transaksi
 * (RECEIPT_NO) terpisah yang tetap terhubung ke kunjungan yang sama lewat NO_REGISTER_KLINIK,
 * lalu ikut terjumlah di billing berikutnya. Dipersempit ke penambahan 1 item jasa per aksi
 * (tanpa racikan/komposisi, tanpa kirim ke apotek/potong stok obat).
 */
import { http } from './http'
import { useConfigStore } from '@/stores/config'
import { getIdClient, getIdLokasi, getUserId } from './session'

const apotik = () => useConfigStore().apiApotikUrl

/**
 * Rincian tagihan satu kunjungan (laporan/history_berobat_pasien), atau null bila tidak ditemukan.
 * Field: NOREGISTER, PASIEN {NAMAPASIEN, NOMR, USIA_LENGKAP, ALAMAT, ...}, RUANGPOLI, NAMADOKTER,
 * MASUKPOLY, KELUARPOLY, CARABAYAR, DETAIL: [{ KATEGORI, ITEM, HARGA, QTY, SATUAN, TOTALAMOUNT, TANGGAL }].
 */
export async function getBillingKunjungan(nomr, noReg) {
  const res = await http.post(`/index.php/api/laporan/history_berobat_pasien/${nomr}/${getIdClient()}/${noReg}`)
  const rows = Array.isArray(res) ? res : []
  return rows[0] || null
}

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Tambah 1 item jasa/tindakan ad-hoc ke tagihan kunjungan (sales/insert_sales_v3).
 * `kunjungan`: hasil getPendaftaran() (butuh NOPENDAFTARAN, NOMR, NAMAPASIEN, POLI, NAMADOKTER).
 * `jasa`: baris dari getDaftarJasa() (services/jasa.js) — butuh BARCODE, NAMA, SATUAN_KECIL, HARGAJUAL.
 */
export async function tambahItemBilling(kunjungan, jasa, qty) {
  const jumlah = Number(qty) || 1
  const harga = Number(jasa.HARGAJUAL) || 0
  const header = {
    RECEIPT_NO: '',
    MEMBERSHIP_ID: kunjungan.NOMR,
    IDUSER: getUserId(),
    TANGGAL: formatDateTime(new Date()),
    IDPAYEMENT: 0,
    NOTE: `${kunjungan.NOMR},${kunjungan.NAMAPASIEN || ''}`,
    SUBTOTAL: 0,
    TAXPERCENT: 0,
    TAXAMOUNT: 0,
    TOTALBAYAR: 0,
    POTONGAN: 0,
    KEMBALIAN: 0,
    NO_REGISTER: kunjungan.NOPENDAFTARAN,
    POLI_RUANG: kunjungan.POLI,
    DPJP: kunjungan.NAMADOKTER,
    ID_LOKASI: getIdLokasi(),
    IDCLIENT: getIdClient(),
    OBAT_OBATAN: 0,
    details: [
      {
        BARCODE: jasa.BARCODE,
        NAMA: jasa.NAMA,
        MEREK: jasa.SATUAN_KECIL || '',
        QTY: jumlah,
        HARGA: harga,
        TOTALAMOUNT: jumlah * harga,
        FLAG: 'NEW LINE'
      }
    ]
  }
  const res = await http.post(`${apotik()}/index.php/api/sales/insert_sales_v3`, { header })
  if (res?.metadata?.code == 200) return res
  throw new Error(res?.metadata?.message || 'Gagal menambah item tagihan')
}
