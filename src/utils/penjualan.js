import router from '@/router'
import { PAYMENT_OPTIONS } from '@/services/penjualan'

export const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
export const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export const labelBayar = (id) => PAYMENT_OPTIONS.find((p) => p.kode === Number(id))?.label || 'Tunai'

/** Waktu "2026-10-05 16:31:00" -> "05 Okt 2026 16.31". */
export function formatWaktu(t) {
  const d = new Date(String(t || '').replace(' ', 'T'))
  return isNaN(d) ? t || '' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Kelompokkan baris recent_sales (satu baris per item) jadi satu objek per RECEIPT_NO.
 * Bahan racikan (IS_SUBITEM=1) tidak ditampilkan terpisah — nilainya sudah ada di induknya.
 * SISA_GRANDTOTAL = nilai berjalan setelah void item; GRANDTOTAL = nilai asli saat checkout.
 */
export function kelompokkanStruk(rows) {
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.RECEIPT_NO)) {
      map.set(r.RECEIPT_NO, {
        RECEIPT_NO: r.RECEIPT_NO,
        TANGGAL: r.TANGGAL,
        IDUSER: r.IDUSER,
        potongan: Number(r.POTONGAN) || 0,
        total: Number(r.GRANDTOTAL) || 0,
        sisa: Number(r.SISA_GRANDTOTAL) || 0,
        totalBayar: Number(r.TOTALBAYAR) || 0,
        kembalian: Number(r.KEMBALIAN) || 0,
        idPayment: Number(r.IDPAYEMENT) || 1,
        items: []
      })
    }
    if (String(r.IS_SUBITEM) !== '1') map.get(r.RECEIPT_NO).items.push({ ...r, batal: String(r.BATAL) === '1' })
  }
  return [...map.values()].map((s) => {
    const batal = s.items.length > 0 && s.items.every((i) => i.batal)
    return { ...s, batal, sebagian: !batal && s.sisa !== s.total, tampilTotal: batal ? s.total : s.sisa }
  })
}

/** Teks diskon item: "-10%" atau "-Rp 500/u". */
export function teksDiskon(i) {
  const d = Number(i.DISCOUNT) || 0
  if (d <= 0) return ''
  return i.DISKON_TYPE === 'RUPIAH' ? `-${rupiah.format(d)}/u` : `-${d}%`
}

/** Susun payload struk dari struk hasil kelompokkanStruk (item yang sudah di-void tidak ikut dicetak). */
export function payloadDariStruk(s, auth) {
  const items = s.items.filter((i) => !i.batal)
  return {
    company: auth.company,
    alamat: auth.alamat,
    receiptNo: s.RECEIPT_NO,
    waktu: s.TANGGAL,
    kasir: s.IDUSER,
    items: items.map((i) => ({ nama: i.NAMA, qty: i.QTY, diskon: teksDiskon(i), total: Number(i.TOTALAMOUNT) || 0 })),
    subtotal: items.reduce((t, i) => t + (Number(i.TOTALAMOUNT) || 0), 0),
    potongan: s.potongan,
    grandTotal: s.sisa,
    metode: labelBayar(s.idPayment),
    piutang: s.idPayment === 3,
    totalBayar: s.totalBayar,
    kembalian: s.kembalian
  }
}

/** Buka halaman cetak struk di tab baru (payload dibawa lewat sessionStorage, ikut ter-copy ke tab baru). */
export function bukaStruk(payload) {
  sessionStorage.setItem('strukPenjualan', JSON.stringify(payload))
  window.open(router.resolve({ name: 'cetak-struk' }).href, '_blank')
}
