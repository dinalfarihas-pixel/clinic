/** Format angka sebagai Rupiah, mis. 15000 -> "Rp 15.000". */
export function formatCurrency(amount) {
  const n = parseFloat(amount)
  if (!Number.isFinite(n)) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}
