/**
 * API master obat — ws_posindo_v2.1 (modul inventory, tabel barang & tabel master farmasi).
 * Endpoint & field sama dengan views/Inventory/barang/BarangFormModal.vue (bucket OBAT_BMHP)
 * di SIMRS (simrs_spa_v2), dipersempit untuk kategori "OBAT-OBATAN" saja. Batch/stok dikelola
 * lewat modul Penerimaan (lihat services/penerimaan.js) atau langsung via tambahBatchObat di
 * bawah — harga per-batch tetap hidup di t_stock_barang, bukan di master obat (lihat simpanObat).
 */
import { apotik } from './http'
import { getIdLokasi } from './session'

const KATEGORI_OBAT = 'OBAT-OBATAN'

// Golongan (I-IV) hardcode di FE, sama seperti BarangFormModal — tidak ada tabel masternya.
export const GOLONGAN_OBAT = ['I', 'II', 'III', 'IV']

/**
 * Info lokasi (unit) yang sedang login — dipakai untuk cek gudang induk.
 * Hanya lokasi INDUK=1 yang boleh menambah obat baru (M_master_barang::create_barang).
 */
export async function getInfoLokasi() {
  const res = await apotik.get('/index.php/api/inventory/lokasi_info', { lokasiId: getIdLokasi() })
  return res?.response || null
}

/** Kategori obat (kategori_list?bucket=OBAT_BMHP), dipersempit ke "OBAT-OBATAN". Item: id_kategori, NAMA_KATEGORI. */
export async function getKategoriObat() {
  const res = await apotik.get('/index.php/api/inventory/kategori_list', { bucket: 'OBAT_BMHP' })
  const rows = Array.isArray(res?.response) ? res.response : []
  return rows.filter((k) => k.NAMA_KATEGORI === KATEGORI_OBAT)
}

/** Klasifikasi obat (master_klasifikasi_list). Item: kode, nama, ada_sub_golongan ('1' jika wajib isi GOLONGAN). */
export async function getKlasifikasiObat() {
  const res = await apotik.get('/index.php/api/inventory/master_klasifikasi_list')
  return Array.isArray(res?.response) ? res.response : []
}

/** Bentuk sediaan (master_sediaan_list). Item: KODE_SEDIAAN, NAMA_SEDIAAN. */
export async function getBentukSediaan() {
  const res = await apotik.get('/index.php/api/inventory/master_sediaan_list')
  return Array.isArray(res?.response) ? res.response : []
}

/** Rute pemberian (master_rute_list). Item: KODE_RUTE, NAMA_RUTE. */
export async function getRutePemberian() {
  const res = await apotik.get('/index.php/api/inventory/master_rute_list')
  return Array.isArray(res?.response) ? res.response : []
}

/** Grouping/zat aktif (master_grouping_list). Item: KODE_GROUP, NAMA_GROUP. */
export async function getGroupingObat() {
  const res = await apotik.get('/index.php/api/inventory/master_grouping_list')
  return Array.isArray(res?.response) ? res.response : []
}

/** Tambah grouping baru ke master (dipanggil saat submit form jika user ketik nama baru). */
export async function tambahGrouping(namaGroup) {
  await apotik.post('/index.php/api/inventory/master_grouping_create', {}, { NAMA_GROUP: namaGroup })
}

/**
 * Daftar obat (barang_list, jenis=OBAT, maks. 1000 baris — sama seperti getDaftarDokter/
 * getDaftarSupplier, filter & paginasi dilakukan di client). Item: ID, IDBARANG, NAMA,
 * SATUAN_KECIL, SATUAN_SEDANG, SATUAN_BESAR, HARGABELI, HARGAJUAL, GROUPING, BENTUK_SEDIAAN,
 * RUTE, KANDUNGAN, SATUAN_KANDUNGAN, VOLUME_UOM_NAME, STOCKMINIMUM, GUNAKAN_STOCK_MIN,
 * ISKRONIS, ISKONSINYASI, KLASIFIKASI_OBAT, GOLONGAN, CATATAN, ARSIPKAN, TOTAL_STOCK,
 * TOTAL_PERSEDIAAN, is_below_minimum.
 */
export async function getDaftarObat(arsipkan = '0') {
  const res = await apotik.get('/index.php/api/inventory/barang_list', {
    lokasiId: getIdLokasi(),
    jenis: 'OBAT',
    limit: 1000,
    sortField: 'NAMA',
    sortOrder: 'ASC',
    ARSIPKAN: arsipkan // '0' aktif, '1' diarsipkan, '' semua
  })

  return Array.isArray(res?.response) ? res.response : []
}

// PUT tanpa body ke endpoint arsip/aktif — semuanya pola sama.
async function putStatus(path, id, pesanGagal) {
  const res = await apotik.put(`/index.php/api/inventory/${path}/${id}`, { lokasiId: getIdLokasi() }, {})
  if (String(res?.metadata?.code) !== '200') throw new Error(res?.metadata?.message || pesanGagal)
}
export const arsipkanObat = (id) => putStatus('barang_arsip', id, 'Gagal mengarsipkan obat')
export const aktifkanObat = (id) => putStatus('barang_aktif', id, 'Gagal mengaktifkan obat')
export const arsipkanBatch = (id) => putStatus('batch_arsip', id, 'Gagal mengarsipkan batch')
export const aktifkanBatch = (id) => putStatus('batch_aktif', id, 'Gagal mengaktifkan batch')

/**
 * ID obat yang punya batch akan expired dalam `months` bulan ke depan (barang_akan_expired).
 * Mengembalikan Set BARANG_ID — dipakai untuk menyaring daftar obat di client.
 */
export async function getIdObatAkanExpired(months) {
  const res = await apotik.get('/index.php/api/inventory/barang_akan_expired', {
    lokasiId: getIdLokasi(),
    jenis: 'OBAT',
    months,
    limit: 1000
  })
  return new Set((Array.isArray(res?.response) ? res.response : []).map((r) => Number(r.BARANG_ID)))
}

/**
 * Kartu stok obat (barang_stock_card/:id). `dateMin`/`dateMax` format YYYY-MM-DD.
 * Mengembalikan { barang, date_min, date_max, rows }; QTY dalam satuan kecil,
 * JENIS_TRANS IN/OUT (+ SALES/REFUND lama), SALDO = saldo barang di lokasi.
 */
export async function getKartuStok(idBarang, dateMin, dateMax) {
  const res = await apotik.get(`/index.php/api/inventory/barang_stock_card/${idBarang}`, {
    lokasiId: getIdLokasi(),
    DATE_MIN: dateMin,
    DATE_MAX: dateMax
  })
  if (String(res?.metadata?.code) !== '200') throw new Error(res?.metadata?.message || 'Gagal memuat kartu stok')
  return res.response
}

/** Tambah obat (barang_create). Ditolak jika lokasi yang login bukan gudang induk. */
export async function simpanObat(obat) {
  const res = await apotik.post('/index.php/api/inventory/barang_create', { lokasiId: getIdLokasi() }, payloadObat(obat))
  if (res?.metadata?.code == 200) return res.response
  throw new Error(res?.metadata?.message || 'Gagal menyimpan obat')
}

/** Ubah obat (barang_update/:id). */
export async function updateObat(id, obat) {
  const res = await apotik.put(`/index.php/api/inventory/barang_update/${id}`, {}, payloadObat(obat))
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal memperbarui obat')
}

/** Hapus obat (barang_delete/:id, soft delete DELETED=1). */
export async function hapusObat(id) {
  const res = await apotik.delete(`/index.php/api/inventory/barang_delete/${id}`)
  if (res?.metadata?.code != 200) throw new Error(res?.metadata?.message || 'Gagal menghapus obat')
}

/**
 * Detail stok per batch/lot obat di lokasi yang login (barang_stock_detail/:id).
 * Item: ID, SUB_BARCODE, BATCH_NUMBER, QTY, HARGA (harga beli), HARGAJUAL,
 * HARGAJUAL_SEDANG, HARGAJUAL_BESAR, TGL_EXPIRED, USE_EXP, ARSIPKAN, PERSEDIAAN,
 * ID_RAK, KODE_RAK, NAMA_RAK (rak batch ini, null bila belum di-assign).
 */
export async function getDetailStok(idBarang) {
  const res = await apotik.get(`/index.php/api/inventory/barang_stock_detail/${idBarang}`, { lokasiId: getIdLokasi() })

  return Array.isArray(res?.response) ? res.response : []
}

/**
 * Ubah harga jual per tier, no. batch, dan/atau tgl expired untuk batch yang sudah ada
 * (batch_update_harga/:id) — PATCH-style, cuma field yang dikirim (bukan undefined) yang
 * diupdate. `patch`: { hargaJualKecil?, hargaJualSedang?, hargaJualBesar?, noBatch?, tglExpired? }.
 * hargaJualKecil wajib > 0 kalau dikirim; hargaJualSedang/Besar null = lepas override
 * (fallback proporsional dari kecil); noBatch/tglExpired null = kosongkan.
 */
export async function updateBatchHarga(batchId, patch) {
  const payload = {}
  if (patch.hargaJualKecil !== undefined) payload.HARGAJUAL_KECIL = patch.hargaJualKecil
  if (patch.hargaJualSedang !== undefined) payload.HARGAJUAL_SEDANG = patch.hargaJualSedang
  if (patch.hargaJualBesar !== undefined) payload.HARGAJUAL_BESAR = patch.hargaJualBesar
  if (patch.noBatch !== undefined) payload.NO_BATCH = patch.noBatch
  if (patch.tglExpired !== undefined) payload.TGL_EXPIRED = patch.tglExpired

  const res = await apotik.put(`/index.php/api/inventory/batch_update_harga/${batchId}`, {}, payload)
  const code = String(res?.metadata?.code)
  if (code !== '200') throw new Error(res?.metadata?.message || 'Gagal memperbarui batch')
  return res.response?.row || null
}

/** Daftar rak (posisi fisik penyimpanan) di lokasi yang login (rak_list). Item: ID, KODE_RAK, NAMA_RAK, KETERANGAN. */
export async function getDaftarRak() {
  const res = await apotik.get('/index.php/api/inventory/rak_list', { lokasiId: getIdLokasi() })
  return Array.isArray(res?.response) ? res.response : []
}

/** Tambah rak baru ke master (rak_create). `rak`: { kodeRak, namaRak?, keterangan? }. Mengembalikan ID rak baru. */
export async function tambahRak(rak) {
  const res = await apotik.post('/index.php/api/inventory/rak_create', {}, {
    ID_LOKASI: getIdLokasi(),
    KODE_RAK: rak.kodeRak,
    NAMA_RAK: rak.namaRak || null,
    KETERANGAN: rak.keterangan || null
  })
  const code = String(res?.metadata?.code)
  if (code !== '200') throw new Error(res?.metadata?.message || 'Gagal menyimpan rak')
  return res.response?.ID ?? null
}

/** Ubah rak sebuah batch yang sudah ada (batch_update_rak/:id). `idRak` null = lepas rak dari batch. */
export async function updateBatchRak(batchId, idRak) {
  const res = await apotik.put(`/index.php/api/inventory/batch_update_rak/${batchId}`, {}, { ID_RAK: idRak })
  const code = String(res?.metadata?.code)
  if (code !== '200') throw new Error(res?.metadata?.message || 'Gagal mengubah rak batch')
}

/**
 * Tambah batch stok baru langsung dari master obat (batch_create) — TANPA lewat alur
 * Penerimaan (tidak ada supplier/faktur/hutang tercatat). Dipakai untuk kasus stok awal,
 * hibah, atau koreksi stok.
 * Catatan: tabel t_stock_barang (dipakai modul non-apotek ini) tidak punya kolom supplier
 * — beda dari modul "apotek" terpisah yang punya. Jadi field itu tidak didukung endpoint ini.
 * `batch`: { qty, satuan?, hargaBeli, hargaJualKecil, hargaJualSedang?, hargaJualBesar?,
 * noBatch?, tglExpired?, idRak?, catatan? }. `idRak` null/omit = otomatis pakai rak batch
 * terakhir barang ini di lokasi yang sama (kalau ada). Mengembalikan SUB_BARCODE batch baru.
 */
export async function tambahBatchObat(idBarang, batch) {
  const payload = {
    QTY: Number(batch.qty) || 0,
    HARGA_BELI: Number(batch.hargaBeli) || 0,
    HARGAJUAL_KECIL: Number(batch.hargaJualKecil) || 0
  }
  if (batch.satuan) payload.SATUAN = batch.satuan
  if (batch.hargaJualSedang != null && batch.hargaJualSedang !== '') payload.HARGAJUAL_SEDANG = Number(batch.hargaJualSedang)
  if (batch.hargaJualBesar != null && batch.hargaJualBesar !== '') payload.HARGAJUAL_BESAR = Number(batch.hargaJualBesar)
  if (batch.noBatch) payload.NO_BATCH = batch.noBatch
  if (batch.tglExpired) payload.TGL_EXPIRED = batch.tglExpired
  if (batch.idRak != null) payload.ID_RAK = batch.idRak
  if (batch.catatan) payload.CATATAN = batch.catatan

  const res = await apotik.post(`/index.php/api/inventory/batch_create/${idBarang}`, { lokasiId: getIdLokasi() }, payload)
  const code = String(res?.metadata?.code)
  if (code !== '200') throw new Error(res?.metadata?.message || 'Gagal menambah batch')
  return res.response?.SUB_BARCODE || null
}

/**
 * Tambah qty ke batch yang sudah ada (batch_tambah_stok/:id), tercatat di kartu stok sebagai
 * "TAMBAH STOK MANUAL". `satuan` default satuan kecil. Mengembalikan QTY_BARU (satuan kecil).
 */
export async function tambahStokBatch(batchId, { qty, satuan, catatan }) {
  const payload = { QTY: Number(qty) || 0 }
  if (satuan) payload.SATUAN = satuan
  if (catatan) payload.CATATAN = catatan
  const res = await apotik.put(`/index.php/api/inventory/batch_tambah_stok/${batchId}`, {}, payload)
  if (String(res?.metadata?.code) !== '200') throw new Error(res?.metadata?.message || 'Gagal menambah stok')
  return res.response?.QTY_BARU ?? null
}

// bucket OBAT_BMHP: dijual ke pasien & motong stok saat transaksi (lihat bucketRule di BarangFormModal)
function payloadObat(obat) {
  const stockMinimum = Number(obat.STOCKMINIMUM) || 0
  const wajibGolongan = obat.klasifikasi?.ada_sub_golongan === '1' || obat.klasifikasi?.ada_sub_golongan === 1
  return {
    NAMA: obat.NAMA,
    KATEGORI: KATEGORI_OBAT,
    JENIS: 'OBAT',
    SATUAN_KECIL: obat.SATUAN_KECIL,
    SATUAN_SEDANG: obat.SATUAN_SEDANG || null,
    SATUAN_BESAR: obat.SATUAN_BESAR || null,
    ISI_SEDANG_KE_KECIL: obat.SATUAN_SEDANG ? Number(obat.ISI_SEDANG_KE_KECIL) || null : null,
    ISI_BESAR_KE_SEDANG: obat.SATUAN_BESAR ? Number(obat.ISI_BESAR_KE_SEDANG) || null : null,
    // Catatan: BarangFormModal referensi TIDAK mengirim HARGABELI/HARGAJUAL untuk bucket
    // OBAT_BMHP (harga di sana hidup di level batch). Di sini tetap dikirim sebagai harga
    // acuan/default di master obat, karena klinik-app belum punya fitur batch/stok masuk.
    HARGABELI: Number(obat.HARGABELI) || 0,
    HARGAJUAL: Number(obat.HARGAJUAL) || 0,
    GROUPING: obat.GROUPING || '',
    BENTUK_SEDIAAN: obat.BENTUK_SEDIAAN || null,
    CODE_SEDIAAN: obat.CODE_SEDIAAN || null,
    RUTE: obat.RUTE || null,
    KODE_RUTE: obat.KODE_RUTE || null,
    KANDUNGAN: obat.KANDUNGAN || null,
    SATUAN_KANDUNGAN: obat.SATUAN_KANDUNGAN || null,
    VOLUME_UOM_NAME: obat.VOLUME_UOM_NAME || null,
    UNTUK_DIJUAL: 1,
    POTONGSTOCK: 1,
    STOCKMINIMUM: stockMinimum,
    GUNAKAN_STOCK_MIN: stockMinimum > 0 ? 1 : 0,
    ISKRONIS: obat.ISKRONIS ? 1 : 0,
    ISKONSINYASI: obat.ISKONSINYASI ? 1 : 0,
    KLASIFIKASI_OBAT: obat.klasifikasi?.kode || 'UMUM',
    GOLONGAN: wajibGolongan ? obat.GOLONGAN : null,
    CATATAN: obat.CATATAN || ''
  }
}
