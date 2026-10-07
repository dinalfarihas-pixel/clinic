/**
 * Migrasi barang & stok awal (api/migrasi) — onboarding klien yang sudah punya data barang.
 * Alur: parseExcel -> previewBarangStok (dry-run) -> importBarangStok (hanya baris VALID).
 */
import readExcelFile from 'read-excel-file/browser'
import { apotik } from './http'
import { getIdClient, getIdLokasi } from './session'
import { toYmd } from '@/utils/tanggal'

const KOLOM_ANGKA = ['STOCKMINIMUM', 'ISI_SEDANG_KE_KECIL', 'ISI_BESAR_KE_SEDANG', 'QTY_AWAL', 'HARGABELI', 'HARGAJUAL', 'HARGAJUAL_SEDANG', 'HARGAJUAL_BESAR']
const KOLOM_JASA = ['NAMA', 'KATEGORI', 'SATUAN_KECIL', 'HARGABELI', 'HARGAJUAL', 'CATATAN']

// "Rp 15.000" / "15.000,50" -> 15000 / 15000.5; tidak terbaca -> NaN (ditolak server, bukan diam-diam jadi 0)
function keAngka(v) {
  if (typeof v === 'number') return v
  return Number(String(v).replace(/[^\d,-]/g, '').replace(',', '.'))
}

// DD/MM/YYYY -> YYYY-MM-DD (backend meneruskan mentah ke database)
function keTanggal(v) {
  if (v instanceof Date) return toYmd(v)
  const dmy = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : String(v).trim()
}

/**
 * Baca semua sheet .xlsx jadi satu array BARANG. Sheet tanpa header NAMA diabaikan (mis. petunjuk).
 * Tiap baris membawa SHEET & BARIS_EXCEL (untuk tampilan) — dibuang oleh bersihkan() sebelum dikirim.
 */
export async function parseExcel(file) {
  const barang = []
  for (const { sheet, data } of await readExcelFile(file)) {
    const idxHeader = data.findIndex((r) => r.some((c) => /^NAMA\*?$/i.test(String(c ?? '').trim())))
    if (idxHeader < 0) continue
    const header = data[idxHeader].map((c) => String(c ?? '').replace('*', '').trim().toUpperCase())
    const jasa = /jasa/i.test(sheet)

    data.slice(idxHeader + 1).forEach((row, i) => {
      const item = { SHEET: sheet, BARIS_EXCEL: idxHeader + i + 2 }
      header.forEach((kolom, c) => {
        const v = row[c]
        if (!kolom || v == null || String(v).trim() === '' || (jasa && !KOLOM_JASA.includes(kolom))) return
        item[kolom] = KOLOM_ANGKA.includes(kolom) ? keAngka(v) : kolom === 'TGL_EXPIRED' ? keTanggal(v) : String(v).trim()
      })
      // lewati baris kosong & baris petunjuk template ("Pilih dari dropdown." di kolom KATEGORI)
      if (Object.keys(item).length > 2 && !/^pilih dari/i.test(item.KATEGORI || '')) barang.push(item)
    })
  }
  return barang
}

const bersihkan = (barang) => barang.map(({ SHEET, BARIS_EXCEL, ...b }) => b)

async function kirim(path, body) {
  const res = await apotik.post(path, {}, { IDCLIENT: Number(getIdClient()), ...body })
  if (res?.metadata?.code == 200) return res.response
  throw new Error(res?.metadata?.message || 'Permintaan migrasi gagal')
}

/** Dry-run: tidak menulis database. Mengembalikan { TOTAL, VALID, INVALID, ROWS }. */
export const previewBarangStok = (barang) => kirim('/index.php/api/migrasi/preview_barang_stok', { BARANG: bersihkan(barang) })

/** Commit (all-or-nothing). Wajib lokasi gudang induk. Mengembalikan { JUMLAH_BARANG, DETAIL }. */
export const importBarangStok = (barang) =>
  kirim('/index.php/api/migrasi/import_barang_stok', { ID_LOKASI: Number(getIdLokasi()), BARANG: bersihkan(barang) })
