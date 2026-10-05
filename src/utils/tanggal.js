const pad = (n) => String(n).padStart(2, '0')

/** Terima YYYY-MM-DD (data lokal) maupun DD-MM-YYYY (respons BPJS). Mengembalikan Date atau null. */
export function parseTanggal(tgl) {
  if (!tgl) return null
  if (tgl instanceof Date) return isNaN(tgl) ? null : tgl
  const s = String(tgl).trim()
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1])
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3])
  const d = new Date(s)
  return isNaN(d) ? null : d
}

/** Date -> 'YYYY-MM-DD' (tanggal lokal, tanpa geser zona waktu). */
export function toYmd(date) {
  const d = parseTanggal(date)
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null
}

/** Tampilan tanggal Indonesia, mis. 15 Mei 2001. */
export function formatTanggal(tgl) {
  const d = parseTanggal(tgl)
  return d ? d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : tgl || ''
}

/** Umur dalam tahun penuh, atau null. */
export function hitungUmurTahun(tgl) {
  const lahir = parseTanggal(tgl)
  if (!lahir) return null
  const now = new Date()
  let umur = now.getFullYear() - lahir.getFullYear()
  if (now.getMonth() < lahir.getMonth() || (now.getMonth() === lahir.getMonth() && now.getDate() < lahir.getDate())) umur--
  return umur >= 0 ? umur : null
}
