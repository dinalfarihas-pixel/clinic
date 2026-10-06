<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { getPosSetting, getListLokasi, getListPenjamin, getRingkasanKas, getRingkasanKategori, getRingkasanHarian, getTopSelling, getRiwayatShift } from '@/services/penjualan'
import { getIdLokasi } from '@/services/session'
import { toYmd } from '@/utils/tanggal'
import { rupiah, angka, formatWaktu } from '@/utils/penjualan'

const router = useRouter()
const toast = useToast()

// ── Periode ──────────────────────────────────────────────────
const hariIni = () => new Date()
const tglMulai = ref(hariIni())
const tglAkhir = ref(hariIni())
const preset = ref('day')
const PRESETS = [
  { label: 'Hari ini', value: 'day' },
  { label: 'Bulan ini', value: 'month' },
  { label: 'Tahun ini', value: 'year' }
]
function pilihPreset(p) {
  if (!p) return
  const now = new Date()
  if (p === 'month') [tglMulai.value, tglAkhir.value] = [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)]
  else if (p === 'year') [tglMulai.value, tglAkhir.value] = [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31)]
  else [tglMulai.value, tglAkhir.value] = [now, now]
  terapkan()
}
const tanggalManual = () => (preset.value = null)

const periodeLabel = computed(() => {
  const f = (d) => d?.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  return tglMulai.value && tglAkhir.value ? (toYmd(tglMulai.value) === toYmd(tglAkhir.value) ? f(tglMulai.value) : `${f(tglMulai.value)} — ${f(tglAkhir.value)}`) : ''
})

// ── Data ─────────────────────────────────────────────────────
const pakaiShift = ref(false)
const lokasi = ref(getIdLokasi()) // id lokasi terpilih; 0 = semua lokasi
const lokasiOpsi = ref([])
const semuaLokasi = computed(() => !lokasi.value)
const penjamin = ref(0) // 0 = semua penjamin (kode 0 BE "tanpa penjamin" memang tidak ada di dropdown)
const penjaminOpsi = ref([{ label: 'Semua penjamin', value: 0 }])
const filter = computed(() => ({ lokasi: lokasi.value, penjamin: penjamin.value }))
// penjamin selain UMUM (1): BE mengembalikan tunai/non-tunai/piutang = null
const bayarNull = computed(() => !!penjamin.value && Number(penjamin.value) !== 1)
const kas = ref({})
const rekap = ref([])
const kategori = ref([])
const groupBy = ref('day')
const GROUPS = [
  { label: 'Hari', value: 'day' },
  { label: 'Minggu', value: 'week' },
  { label: 'Bulan', value: 'month' },
  { label: 'Tahun', value: 'year' }
]
const terlaris = ref([])
const sortBy = ref('qty')
const SORTS = [
  { label: 'Qty', value: 'qty' },
  { label: 'Nilai', value: 'nilai' }
]
const shifts = ref([])
const loading = ref(false)

const rentang = () => [toYmd(tglMulai.value), toYmd(tglAkhir.value || tglMulai.value)]

async function muatSemua() {
  const [a, b] = rentang()
  const gagal = (judul) => (err) => {
    toast.add({ severity: 'error', summary: judul, detail: err.message, life: 5000 })
    return null
  }
  loading.value = true
  const [k, r, t, s, kt] = await Promise.all([
    getRingkasanKas(a, b, filter.value).catch(gagal('Gagal memuat ringkasan')),
    getRingkasanHarian(a, b, groupBy.value, filter.value).catch(gagal('Gagal memuat rekap')),
    getTopSelling(a, b, sortBy.value, 50, filter.value).catch(gagal('Gagal memuat barang terlaris')),
    pakaiShift.value ? getRiwayatShift(a, b, lokasi.value).catch(gagal('Gagal memuat riwayat shift')) : [],
    getRingkasanKategori(a, b, filter.value).catch(gagal('Gagal memuat rincian kategori'))
  ])
  kategori.value = kt || []
  kas.value = k || {}
  rekap.value = r || []
  terlaris.value = t || []
  shifts.value = s || []
  loading.value = false
}
function terapkan() {
  if (!tglMulai.value) return
  muatSemua()
}
async function muatRekap() {
  try {
    rekap.value = await getRingkasanHarian(...rentang(), groupBy.value, filter.value)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat rekap', detail: err.message, life: 5000 })
  }
}
async function muatTerlaris() {
  try {
    terlaris.value = await getTopSelling(...rentang(), sortBy.value, 50, filter.value)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat barang terlaris', detail: err.message, life: 5000 })
  }
}

const cetak = () => window.print()
const n = (v) => Number(v) || 0
const kartu = computed(() => [
  { g: 'utama', label: 'Omzet bersih', nilai: rupiah.format(n(kas.value.OMSET_PENJUALAN)), ikon: 'pi pi-wallet', utama: true },
  { g: 'penjualan', label: 'Omzet jasa/tindakan', nilai: rupiah.format(n(kas.value.OMSET_TINDAKAN)), ikon: 'pi pi-heart' },
  { g: 'penjualan', label: 'Omzet barang', nilai: rupiah.format(n(kas.value.OMSET_BARANG)), ikon: 'pi pi-box' },
  { g: 'penjualan', label: 'Jumlah transaksi', nilai: angka.format(n(kas.value.JUMLAH_TRANSAKSI)), ikon: 'pi pi-receipt' },
  { g: 'penjualan', label: `Refund (${angka.format(n(kas.value.JUMLAH_TRANSAKSI_REFUND))} struk)`, nilai: rupiah.format(n(kas.value.NILAI_REFUND)), ikon: 'pi pi-replay', bahaya: true },
  { g: 'bayar', label: 'Total tunai', nilai: rupiah.format(n(kas.value.TOTAL_TUNAI)), ikon: 'pi pi-money-bill' },
  { g: 'bayar', label: 'Total non-tunai', nilai: rupiah.format(n(kas.value.TOTAL_NONTUNAI)), ikon: 'pi pi-credit-card' },
  { g: 'bayar', label: 'Piutang baru', nilai: rupiah.format(n(kas.value.TOTAL_PIUTANG_BARU)), ikon: 'pi pi-clock' },
  { g: 'bayar', label: 'Pembayaran piutang', nilai: rupiah.format(n(kas.value.PEMBAYARAN_PIUTANG)), ikon: 'pi pi-verified' },
  { g: 'kas', label: 'Pemasukan lain', nilai: rupiah.format(n(kas.value.PEMASUKAN_LAIN)), ikon: 'pi pi-arrow-down-left' },
  { g: 'kas', label: 'Pengeluaran lain', nilai: rupiah.format(n(kas.value.PENGELUARAN_LAIN)), ikon: 'pi pi-arrow-up-right', bahaya: true },
  { g: 'kas', label: 'Pembayaran supplier', nilai: rupiah.format(n(kas.value.PEMBAYARAN_SUPPLIER)), ikon: 'pi pi-truck', bahaya: true }
])
const GRUP_KARTU = [
  { label: 'Penjualan', value: 'penjualan' },
  { label: 'Pembayaran', value: 'bayar' },
  { label: 'Kas lain', value: 'kas' }
]
const kartuUtama = computed(() => kartu.value.filter((k) => k.g === 'utama'))
const CATATAN_GRUP = {
  bayar: 'Hanya struk kasir penjamin UMUM, jadi bisa lebih kecil dari omzet.',
  kas: 'Tidak terpengaruh filter penjamin.'
}
// penjamin selain UMUM: seluruh panel Pembayaran disembunyikan (tunai/non-tunai/piutang = null, sisanya tidak ikut filter penjamin)
const daftarGrup = computed(() =>
  GRUP_KARTU.filter((g) => !(bayarNull.value && g.value === 'bayar')).map((g) => ({
    ...g,
    baris: kartu.value.filter((k) => k.g === g.value),
    catatan: CATATAN_GRUP[g.value]
  }))
)
const pctJasa = computed(() => {
  const j = n(kas.value.OMSET_TINDAKAN)
  const t = j + n(kas.value.OMSET_BARANG)
  return t > 0 ? (j / t) * 100 : 0
})

// Kelompok per JENIS: kategori urut nilai terbesar + bar proporsi; 'POTONGAN STRUK' (negatif) dipisah supaya total = omzet bersih
const POTONGAN = 'POTONGAN STRUK'
const kelompokKategori = computed(() =>
  [['TINDAKAN', 'Jasa/Tindakan', 'pi pi-heart'], ['BARANG', 'Barang', 'pi pi-box']]
    .map(([jenis, judul, ikon]) => {
      const baris = kategori.value.filter((r) => r.JENIS === jenis)
      const rows = baris.filter((r) => r.KATEGORI !== POTONGAN).sort((a, b) => n(b.TOTAL_NILAI) - n(a.TOTAL_NILAI))
      const kotor = rows.reduce((t, r) => t + n(r.TOTAL_NILAI), 0)
      const potongan = baris.filter((r) => r.KATEGORI === POTONGAN).reduce((t, r) => t + n(r.TOTAL_NILAI), 0)
      return {
        jenis, judul, ikon, potongan,
        total: kotor + potongan,
        rows: rows.map((r) => ({ ...r, pct: kotor > 0 ? (n(r.TOTAL_NILAI) / kotor) * 100 : 0 }))
      }
    })
    .filter((g) => g.rows.length)
)

const jum = (key) => rekap.value.reduce((t, r) => t + n(r[key]), 0)

function labelPeriode(r) {
  const f = (t, opt) => new Date(t).toLocaleDateString('id-ID', opt)
  if (groupBy.value === 'month') return f(r.TANGGAL, { month: 'long', year: 'numeric' })
  if (groupBy.value === 'year') return f(r.TANGGAL, { year: 'numeric' })
  if (groupBy.value === 'week') return `${f(r.TANGGAL, { day: '2-digit', month: 'short' })} — ${f(r.TANGGAL_AKHIR, { day: '2-digit', month: 'short', year: 'numeric' })}`
  return f(r.TANGGAL, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Chart (CSS murni, tanpa library) ─────────────────────────
const compact = (v) => new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
const labelSingkat = (r) => {
  const d = new Date(r.TANGGAL)
  if (groupBy.value === 'year') return d.getFullYear()
  if (groupBy.value === 'month') return d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}
const chartBars = computed(() => {
  const data = [...rekap.value].reverse() // urut dari terlama ke terbaru
  const max = Math.max(...data.map((r) => n(r.TOTAL_OMZET)), 0)
  const pct = (v) => (max > 0 ? (n(v) / max) * 100 : 0)
  return {
    max,
    ticks: [1, 0.75, 0.5, 0.25, 0].map((f) => max * f),
    bars: data.map((r) => ({
      label: labelSingkat(r),
      jasa: pct(r.TOTAL_TINDAKAN),
      barang: pct(r.TOTAL_PENJUALAN_BARANG),
      tip: `${labelPeriode(r)}
Omzet ${rupiah.format(n(r.TOTAL_OMZET))}
Jasa/Tindakan ${rupiah.format(n(r.TOTAL_TINDAKAN))}
Barang ${rupiah.format(n(r.TOTAL_PENJUALAN_BARANG))}
${angka.format(n(r.JUMLAH_TRANSAKSI))} transaksi`
    }))
  }
})
function durasi(s) {
  if (!s.WAKTU_TUTUP) return '-'
  const mnt = Math.round((new Date(String(s.WAKTU_TUTUP).replace(' ', 'T')) - new Date(String(s.WAKTU_BUKA).replace(' ', 'T'))) / 60000)
  return mnt >= 60 ? `${Math.floor(mnt / 60)} j ${mnt % 60} m` : `${mnt} m`
}

onMounted(async () => {
  getListPenjamin()
    .then((p) => (penjaminOpsi.value = [{ label: 'Semua penjamin', value: 0 }, ...p.map((x) => ({ label: x.NAMA, value: Number(x.KODE) }))]))
    .catch(() => {})
  try {
    const l = await getListLokasi()
    lokasiOpsi.value = [{ label: 'Semua lokasi', value: 0 }, ...l.map((x) => ({ label: x.DISPLAY, value: Number(x.ID ?? x.ID_LOKASI) }))]
    lokasi.value = Number(lokasi.value) || 0
  } catch {
    lokasiOpsi.value = []
  }
  try {
    pakaiShift.value = Number((await getPosSetting()).PAKAI_SHIFT) === 1
  } catch {
    pakaiShift.value = false
  }
  muatSemua()
})
</script>

<template>
  <div class="page" :class="{ memuat: loading }" :aria-busy="loading">
    <header class="page-header no-print">
      <div>
        <h1 class="page-title">Laporan penjualan</h1>
        <p class="page-subtitle">Ringkasan penjualan langsung per periode.</p>
      </div>
      <div class="header-actions">
        <Button icon="pi pi-print" label="Cetak" severity="secondary" outlined @click="cetak" />
        <Button icon="pi pi-wallet" label="Kas lain" severity="secondary" outlined @click="router.push('/penjualan/kas-lain')" />
        <Button icon="pi pi-history" label="Riwayat" severity="secondary" outlined @click="router.push('/penjualan/riwayat')" />
        <Button icon="pi pi-shopping-cart" label="Kasir" @click="router.push('/penjualan')" />
      </div>
    </header>

    <section class="panel no-print">
      <div class="filter">
        <SelectButton v-model="preset" :options="PRESETS" optionLabel="label" optionValue="value" @update:modelValue="pilihPreset" />
        <DatePicker v-model="tglMulai" dateFormat="dd M yy" placeholder="Tanggal mulai" showIcon iconDisplay="input" class="filter__date" @date-select="tanggalManual" />
        <span class="filter__sep">—</span>
        <DatePicker v-model="tglAkhir" dateFormat="dd M yy" placeholder="Tanggal akhir" showIcon iconDisplay="input" class="filter__date" @date-select="tanggalManual" />
        <Select v-model="lokasi" :options="lokasiOpsi" optionLabel="label" optionValue="value" class="filter__lokasi" @update:modelValue="terapkan" />
        <Select v-model="penjamin" :options="penjaminOpsi" optionLabel="label" optionValue="value" class="filter__lokasi" @update:modelValue="terapkan" />
        <Button label="Terapkan" icon="pi pi-search" :loading="loading" @click="terapkan" />
      </div>
    </section>

    <p class="periode">Periode: <b>{{ periodeLabel }}</b></p>

    <div class="hero">
      <div class="hero__utama">
        <span class="kartu__label">Omzet bersih</span>
        <b class="hero__nilai">{{ kartuUtama[0].nilai }}</b>
        <div class="hero__split" title="Komposisi jasa/tindakan vs barang">
          <div class="hero__jasa" :style="{ width: `${pctJasa}%` }" />
        </div>
        <div class="hero__legend">
          <span><i class="dot dot--tunai" /> Jasa/tindakan {{ rupiah.format(n(kas.OMSET_TINDAKAN)) }}</span>
          <span><i class="dot dot--nontunai" /> Barang {{ rupiah.format(n(kas.OMSET_BARANG)) }}</span>
        </div>
      </div>
    </div>

    <div class="daftar-grid">
      <section v-for="g in daftarGrup" :key="g.value" class="daftar">
        <h3>{{ g.label }}</h3>
        <div v-for="k in g.baris" :key="k.label" class="daftar__row">
          <span><i :class="k.ikon" /> {{ k.label }}</span>
          <b :class="{ merah: k.bahaya }">{{ k.nilai }}</b>
        </div>
        <small v-if="g.catatan" class="sub">{{ g.catatan }}</small>
      </section>
    </div>

    <section class="panel">
      <Tabs value="rekap">
        <TabList>
          <Tab value="rekap"><i class="pi pi-chart-bar" /> Rekap</Tab>
          <Tab value="terlaris"><i class="pi pi-star" /> Barang terlaris</Tab>
          <Tab value="kategori"><i class="pi pi-th-large" /> Per kategori</Tab>
          <Tab v-if="pakaiShift" value="shift"><i class="pi pi-history" /> Riwayat shift</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="rekap">
            <div class="tab-tools no-print">
              <label>Tampilkan per</label>
              <SelectButton v-model="groupBy" :options="GROUPS" optionLabel="label" optionValue="value" :allowEmpty="false" @update:modelValue="muatRekap" />
            </div>
            <div v-if="chartBars.bars.length" class="chart">
              <div class="chart__legend">
                <span><i class="dot dot--tunai" /> Jasa/Tindakan</span>
                <span><i class="dot dot--nontunai" /> Barang</span>
              </div>
              <div class="chart__area">
                <div class="chart__axis">
                  <span v-for="t in chartBars.ticks" :key="t">{{ compact(t) }}</span>
                </div>
                <div class="chart__scroll">
                  <div class="chart__plot" :style="{ minWidth: `${chartBars.bars.length * 28}px` }">
                    <div v-for="(b, i) in chartBars.bars" :key="i" class="chart__col" :title="b.tip">
                      <div class="chart__stack">
                        <div class="seg seg--nontunai" :style="{ height: `${b.barang}%` }" />
                        <div class="seg seg--tunai" :style="{ height: `${b.jasa}%` }" />
                      </div>
                      <span class="chart__x">{{ b.label }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DataTable :value="rekap" size="small" showGridlines :loading="loading" scrollable>
              <template #empty><p class="empty">Tidak ada data pada periode ini.</p></template>
              <Column header="Periode" footer="Total"><template #body="{ data }">{{ labelPeriode(data) }}</template></Column>
              <Column header="Transaksi" class="num" :footer="angka.format(jum('JUMLAH_TRANSAKSI'))"><template #body="{ data }">{{ angka.format(data.JUMLAH_TRANSAKSI) }}</template></Column>
              <Column v-if="!bayarNull" header="Tunai" class="num" :footer="rupiah.format(jum('TOTAL_TUNAI'))"><template #body="{ data }">{{ rupiah.format(data.TOTAL_TUNAI) }}</template></Column>
              <Column v-if="!bayarNull" header="Non-tunai" class="num" :footer="rupiah.format(jum('TOTAL_NONTUNAI'))"><template #body="{ data }">{{ rupiah.format(data.TOTAL_NONTUNAI) }}</template></Column>
              <Column v-if="!bayarNull" header="Piutang" class="num" :footer="rupiah.format(jum('TOTAL_PIUTANG'))"><template #body="{ data }">{{ rupiah.format(data.TOTAL_PIUTANG) }}</template></Column>
              <Column header="Jasa/Tindakan" class="num" :footer="rupiah.format(jum('TOTAL_TINDAKAN'))"><template #body="{ data }">{{ rupiah.format(data.TOTAL_TINDAKAN) }}</template></Column>
              <Column header="Barang" class="num" :footer="rupiah.format(jum('TOTAL_PENJUALAN_BARANG'))"><template #body="{ data }">{{ rupiah.format(data.TOTAL_PENJUALAN_BARANG) }}</template></Column>
              <Column header="Omzet" class="num">
                <template #body="{ data }"><b>{{ rupiah.format(data.TOTAL_OMZET) }}</b></template>
                <template #footer><b>{{ rupiah.format(jum('TOTAL_OMZET')) }}</b></template>
              </Column>
              <Column header="Refund" class="num" :footer="rupiah.format(jum('TOTAL_DIBATALKAN'))">
                <template #body="{ data }">
                  <span :class="{ merah: n(data.TOTAL_DIBATALKAN) > 0 }">{{ rupiah.format(data.TOTAL_DIBATALKAN) }}</span>
                  <small v-if="n(data.JUMLAH_DIBATALKAN_PENUH) + n(data.JUMLAH_DIBATALKAN_SEBAGIAN)" class="sub">{{ n(data.JUMLAH_DIBATALKAN_PENUH) }} penuh · {{ n(data.JUMLAH_DIBATALKAN_SEBAGIAN) }} sebagian</small>
                </template>
              </Column>
            </DataTable>
          </TabPanel>

          <TabPanel value="terlaris">
            <div class="tab-tools no-print">
              <label>Urutkan</label>
              <SelectButton v-model="sortBy" :options="SORTS" optionLabel="label" optionValue="value" :allowEmpty="false" @update:modelValue="muatTerlaris" />
            </div>
            <DataTable :value="terlaris" size="small" showGridlines :loading="loading" paginator :rows="20" scrollable>
              <template #empty><p class="empty">Tidak ada penjualan pada periode ini.</p></template>
              <Column header="#" style="width: 3rem"><template #body="{ index }">{{ index + 1 }}</template></Column>
              <Column field="BARCODE" header="Barcode" />
              <Column field="NAMA" header="Nama obat" style="min-width: 14rem" />
              <Column header="Qty" class="num">
                <template #body="{ data }">{{ angka.format(data.TOTAL_QTY) }}</template>
              </Column>
              <Column header="Nilai" class="num">
                <template #body="{ data }"><b>{{ rupiah.format(data.TOTAL_NILAI) }}</b></template>
              </Column>
              <Column header="Transaksi" class="num"><template #body="{ data }">{{ angka.format(data.JUMLAH_TRANSAKSI) }}</template></Column>
            </DataTable>
          </TabPanel>

          <TabPanel value="kategori">
            <p v-if="!kelompokKategori.length" class="empty">Tidak ada data pada periode ini.</p>
            <div class="kat-grid">
              <section v-for="g in kelompokKategori" :key="g.jenis" class="kat">
                <header class="kat__head">
                  <span><i :class="g.ikon" /> {{ g.judul }}</span>
                  <b>{{ rupiah.format(g.total) }}</b>
                </header>
                <div v-for="r in g.rows" :key="r.KATEGORI" class="kat__row" :title="`${angka.format(n(r.TOTAL_QTY))} qty · ${angka.format(n(r.JUMLAH_ITEM))} item`">
                  <div class="kat__line">
                    <span class="kat__nama">{{ r.KATEGORI }}</span>
                    <span class="kat__nilai">{{ rupiah.format(n(r.TOTAL_NILAI)) }} <small>{{ r.pct.toFixed(1) }}%</small></span>
                  </div>
                  <div class="kat__bar"><div :class="`kat__fill kat__fill--${g.jenis}`" :style="{ width: `${r.pct}%` }" /></div>
                  <small class="sub">{{ angka.format(n(r.TOTAL_QTY)) }} qty · {{ angka.format(n(r.JUMLAH_ITEM)) }} item</small>
                </div>
                <div v-if="g.potongan" class="kat__line kat__potongan">
                  <span>Potongan struk</span>
                  <span class="merah">{{ rupiah.format(g.potongan) }}</span>
                </div>
              </section>
            </div>
          </TabPanel>

          <TabPanel v-if="pakaiShift" value="shift">
            <DataTable :value="shifts" size="small" showGridlines :loading="loading" paginator :rows="20" dataKey="ID" scrollable>
              <template #empty><p class="empty">Tidak ada shift pada periode ini.</p></template>
              <Column v-if="semuaLokasi" field="ID_LOKASI" header="Lokasi" />
              <Column header="Kasir"><template #body="{ data }">{{ data.ID_USER ?? data.IDUSER }}</template></Column>
              <Column header="Buka"><template #body="{ data }">{{ formatWaktu(data.WAKTU_BUKA) }}</template></Column>
              <Column header="Tutup"><template #body="{ data }">{{ data.WAKTU_TUTUP ? formatWaktu(data.WAKTU_TUTUP) : '-' }}</template></Column>
              <Column header="Durasi"><template #body="{ data }">{{ durasi(data) }}</template></Column>
              <Column header="Transaksi" class="num"><template #body="{ data }">{{ angka.format(data.JUMLAH_TRANSAKSI) }}</template></Column>
              <Column header="Tunai" class="num"><template #body="{ data }">{{ rupiah.format(data.TOTAL_TUNAI_LIVE) }}</template></Column>
              <Column header="Non-tunai" class="num"><template #body="{ data }">{{ rupiah.format(data.TOTAL_NONTUNAI_LIVE) }}</template></Column>
              <Column header="Selisih" class="num">
                <template #body="{ data }">
                  <span v-if="data.SELISIH == null">-</span>
                  <b v-else :class="Math.round(n(data.SELISIH)) === 0 ? 'hijau' : 'merah'">{{ rupiah.format(data.SELISIH) }}</b>
                </template>
              </Column>
              <Column header="Status"><template #body="{ data }"><Tag :value="data.STATUS" :severity="data.STATUS === 'OPEN' ? 'success' : 'secondary'" /></template></Column>
            </DataTable>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </section>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.filter__date {
  width: 11rem;
}
.filter__lokasi {
  width: 12rem;
}
.filter__sep {
  color: var(--app-text-muted);
}
.periode {
  margin: 0.75rem 0;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.periode b {
  color: var(--app-text);
}

.hero {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.hero__utama,
.daftar {
  padding: 1rem 1.25rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.hero__utama {
  border-left: 4px solid var(--p-primary-color);
}
.hero__nilai {
  display: block;
  font-size: 2rem;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.hero__split {
  height: 0.5rem;
  margin: 0.75rem 0 0.5rem;
  border-radius: 999px;
  background: var(--p-teal-300, #5eead4);
  overflow: hidden;
}
.hero__jasa {
  height: 100%;
  background: var(--p-primary-color);
}
.hero__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.daftar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.daftar h3 {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.daftar__row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0;
  font-size: 0.875rem;
  border-top: 1px solid var(--app-border);
}
.daftar__row span {
  color: var(--app-text-muted);
}
.daftar__row i {
  width: 1.25rem;
  margin-right: 0.25rem;
}
.daftar__row b {
  font-variant-numeric: tabular-nums;
}
.kartu__label {
  display: block;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.kat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: 1rem;
}
.kat {
  padding: 1rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.kat__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.kat__head span {
  font-weight: 600;
}
.kat__head i {
  margin-right: 0.35rem;
  color: var(--p-primary-color);
}
.kat__head b {
  font-size: 1.25rem;
  font-variant-numeric: tabular-nums;
}
.kat__row {
  margin-bottom: 0.75rem;
}
.kat__line {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.875rem;
}
.kat__nilai {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.kat__nilai small {
  margin-left: 0.25rem;
  color: var(--app-text-muted);
}
.kat__bar {
  height: 0.5rem;
  margin: 0.25rem 0;
  border-radius: 999px;
  background: var(--p-surface-100, #f1f5f9);
  overflow: hidden;
}
.kat__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--p-primary-color);
}
.kat__fill--BARANG {
  background: var(--p-teal-400, #2dd4bf);
}
.kat__potongan {
  padding-top: 0.5rem;
  border-top: 1px dashed var(--app-border);
}
.chart {
  margin-bottom: 1rem;
}
.chart__legend {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.dot {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  margin-right: 0.25rem;
  border-radius: 2px;
}
.dot--tunai,
.seg--tunai {
  background: var(--p-primary-color);
}
.dot--nontunai,
.seg--nontunai {
  background: var(--p-teal-300, #5eead4);
}
.dot--piutang,
.seg--piutang {
  background: var(--p-orange-400, #fb923c);
}
.chart__area {
  display: flex;
  gap: 0.5rem;
}
.chart__axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 14rem;
  min-width: 3rem;
  text-align: right;
  font-size: 0.6875rem;
  color: var(--app-text-muted);
}
.chart__scroll {
  flex: 1;
  overflow-x: auto;
  padding-bottom: 1.25rem;
}
.chart__plot {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 14rem;
  background: repeating-linear-gradient(to bottom, var(--app-border) 0 1px, transparent 1px 25%);
  border-bottom: 1px solid var(--app-border);
}
.chart__col {
  position: relative;
  flex: 1;
  height: 100%;
  min-width: 20px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.chart__stack {
  width: 70%;
  max-width: 3rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.seg:first-child {
  border-radius: 3px 3px 0 0;
}
.chart__col:hover .chart__stack {
  filter: brightness(0.9);
}
.chart__x {
  position: absolute;
  top: 100%;
  margin-top: 0.25rem;
  font-size: 0.625rem;
  color: var(--app-text-muted);
  white-space: nowrap;
}
.tab-tools {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.tab-tools label {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.sub {
  display: block;
  font-size: 0.6875rem;
  color: var(--app-text-muted);
}
.merah {
  color: var(--p-red-500, #ef4444);
}
.hijau {
  color: var(--p-green-600, #16a34a);
}
:deep(.num) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
:deep(.num .p-datatable-column-header-content) {
  justify-content: flex-end;
}

/* Saat query berjalan: angka lama diganti blok shimmer, grafik/tabel diredupkan */
.memuat :is(.hero__nilai, .hero__legend span, .daftar__row b, .kat__head b, .kat__nilai, .kat .sub) {
  color: transparent !important;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--p-surface-100, #f1f5f9) 25%, var(--p-surface-200, #e2e8f0) 50%, var(--p-surface-100, #f1f5f9) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
  user-select: none;
}
.memuat :is(.hero__jasa, .kat__fill, .chart__stack, .periode b) {
  opacity: 0.15;
}
.memuat :deep(.p-datatable-tbody) {
  opacity: 0.35;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
