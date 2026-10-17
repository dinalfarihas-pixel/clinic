/**
 * API tindakan / prosedur medis rawat jalan — web service apotek (ws_posindo), endpoint sama dengan
 * TindakanComponent (components/PoliklinikComponent/TindakanCompnent.vue) di simrs_spa_v2.
 * Tindakan disimpan sebagai transaksi sales (JENIS 'TINDAKAN') yang terhubung ke no. registrasi kunjungan.
 */
import { http, apotik as apotikApi } from './http'
import { getIdClient as idClient, getIdLokasi, getUserId } from './session'
import { useConfigStore } from '@/stores/config'

const apotik = () => useConfigStore().apiApotikUrl

function waktuSekarang() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Kategori master barang yang dicari sebagai tindakan. */
export const KATEGORI_TINDAKAN = 'JASA'

/**
 * Cari master tindakan (minimal 3 huruf) — inventory/barang_list, kategori TENAGA AHLI.
 * Hasil dipetakan ke bentuk yang dipakai tambahTindakan: CAPTION, HARGA_JUAL_JASA, SATUAN, ID_LOKASI.
 */
export async function cariTindakan(nama) {
  if (!nama || nama.length < 3) return []
  const res = await apotikApi.get('/index.php/api/inventory/barang_list', {
    lokasiId: getIdLokasi(),
    bucket: KATEGORI_TINDAKAN,
    search: nama,
    page: 1,
    limit: 50
  })
  if (res?.metadata?.code != 200 || !Array.isArray(res.response)) return []
  return res.response.map((b) => ({
    ...b,
    CAPTION: b.NAMA,
    HARGA_JUAL_JASA: Number(b.HARGAJUAL) || 0,
    SATUAN: b.SATUAN || b.SATUAN_KECIL || '',
    ID_LOKASI: getIdLokasi()
  }))
}

/** Tindakan yang paling sering dilakukan di suatu poli (maks. `limit`) — data_referensi/get_recent_tindakan_poly. */
export async function getRecentTindakan(kodePoli, limit = 20) {
  const res = await http.post(`${apotik()}/index.php/api/data_referensi/get_recent_tindakan_poly`, {
    id_client: idClient(),
    kategori: ['TENAGA AHLI', 'KEPERAWATAN'],
    kode_poli: kodePoli || 'UNKNOWN',
    limit: String(limit)
  })
  
  return res?.code == 200 && Array.isArray(res.result) ? res.result : []
}

/** Tindakan yang sudah dicatat pada satu kunjungan — sales/get_laporan_tindakan. */
export async function getRiwayatTindakan(noReg) {
  const res = await http.post(`${apotik()}/index.php/api/sales/get_laporan_tindakan`, {
    id_client: idClient(),
    mode: 1,
    noregister: noReg
  })
  return res?.metadata?.code == 200 && Array.isArray(res.response) ? res.response : []
}

/**
 * Catat tindakan pada kunjungan — sales/insert_sales_v2.
 * `tindakan`: item master (BARCODE, IDBARANG, NAMA/CAPTION, HARGA_JUAL_JASA, SATUAN, ID_LOKASI).
 * `pasien`: data kunjungan (NOPENDAFTARAN, NOMR, POLI, NAMADOKTER).
 */
export async function tambahTindakan(tindakan, pasien, keterangan, qty) {
  const sekarang = waktuSekarang()
  const idLokasi = tindakan.ID_LOKASI || getIdLokasi()
  const res = await http.post(
    `${apotik()}/index.php/api/sales/insert_sales_v2`,
    {
      metadata: 'request',
      header: {
        MODE: 'REG',
        RECEIPT_NO: '',
        SALESNO: '0',
        JML_RACIK: 0,
        BENTUK_RACIK: '',
        NOTE: '-',
        TAXAMOUNT: 0,
        TOTALBAYAR: 0,
        POTONGAN: 0,
        TAXPERCENT: 0,
        SUBTOTAL: 0,
        KEMBALIAN: 0,
        RESV_ID: 0,
        SERVER_NAME: '-',
        NO_REGISTER: pasien.NOPENDAFTARAN,
        MEMBERSHIP_ID: pasien.NOMR,
        IDPAYEMENT: 0,
        IDCLIENT: idClient(),
        ID_LOKASI: idLokasi,
        POLI_RUANG: pasien.POLI,
        DPJP: pasien.NAMADOKTER,
        TANGGAL: sekarang,
        IDUSER: getUserId(),
        STATUS_PROGRESS: 'C',
        TGL_SELESAI: sekarang,
        OBAT_OBATAN: 4,
        SERVER_ID: '',
        details: [
          {
            BARCODE: tindakan.BARCODE,
            ID_BARANG: tindakan.IDBARANG || tindakan.BARCODE,
            NAMA: tindakan.NAMA || tindakan.CAPTION,
            MEREK: '',
            AS_PARENT: 1,
            ITEMSEQNO: 0,
            HARGA: tindakan.HARGA_JUAL_JASA || 0,
            SATUAN: tindakan.SATUAN,
            DISCOUNT: 0,
            REMARK_ITEM: keterangan,
            POTONGSTOCK: 0,
            TANGGAL_TRANS: sekarang,
            FLAG: 'NEW LINE',
            TOTALAMOUNT: 0,
            STATUS_PROGRESS: 'C',
            SUBITEMSEQNO: 0,
            ID_LOKASI: idLokasi,
            JENIS: 'TINDAKAN',
            NOTE: '',
            QTY: qty
          }
        ]
      }
    }
  )
  if (res?.metadata?.code == 200) return res
  throw new Error(res?.metadata?.message || 'Gagal menambah tindakan')
}

/** Ubah keterangan tindakan — sales/updateItemTindakan. */
export async function ubahKeteranganTindakan(receiptNo, noReg, keterangan) {
  const res = await http.post(`${apotik()}/index.php/api/sales/updateItemTindakan`, {
    id_client: idClient(),
    no_receipt: receiptNo,
    noregister: noReg,
    remark_item: keterangan
  })
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal menyimpan keterangan')
}

/** Batalkan (void) tindakan — sales/voidtindakan. */
export async function hapusTindakan(receiptNo) {
  const res = await http.post(`${apotik()}/index.php/api/sales/voidtindakan`, {
    id_client: idClient(),
    no_receipt: receiptNo
  })
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal menghapus tindakan')
}
