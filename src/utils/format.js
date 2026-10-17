/** Format angka sebagai Rupiah, mis. 15000 -> "Rp 15.000". */
export function formatCurrency(amount) {
  const n = parseFloat(amount)
  if (!Number.isFinite(n)) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

/**
 * Alamat klinik dari profil RS kadang berisi teks "\n" (bukan enter sungguhan).
 * Diubah jadi baris baru; tampilkan dengan `white-space: pre-line`.
 */
export function rapikanAlamat(alamat) {
  return alamat ? String(alamat).replace(/(?:\\r)?\\n/g, '\n').replace(/[ \t\r]*\n[ \t\r]*/g, '\n').trim() : alamat
}
