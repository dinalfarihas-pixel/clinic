<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getPendaftaran, getRiwayatPendaftaran, tandaiLunas, CARA_BAYAR_BPJS } from '@/services/pendaftaran'
import { getBillingKunjungan, tambahItemBilling } from '@/services/kasir'
import { getDaftarJasa } from '@/services/jasa'
import { getUserName } from '@/services/session'
import { formatTanggal, hitungUmurTahun, toYmd } from '@/utils/tanggal'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

// ── Daftar pasien yang berkunjung (tahap awal, sebelum masuk ke rincian kasir) ──
const tglAwal = ref(new Date())
const tglAkhir = ref(new Date())
const daftarKunjungan = ref([])
const loadingDaftar = ref(false)
const saring = ref('')

const isBatal = (r) => String(r.BATAL) === '1'
const isBpjsRow = (r) => r.KODECARABAYAR == CARA_BAYAR_BPJS || /BPJS/i.test(r.CARABAYAR || '')

const daftarTampil = computed(() => {
  const q = saring.value.trim().toLowerCase()
  return daftarKunjungan.value.filter((r) => {
    if (isBatal(r)) return false
    if (!q) return true
    return [r.NAMAPASIEN, r.NOMR, r.NOPENDAFTARAN, r.NAMADOKTER].some((v) => String(v ?? '').toLowerCase().includes(q))
  })
})

async function muatDaftar() {
  loadingDaftar.value = true
  try {
    daftarKunjungan.value = await getRiwayatPendaftaran({ tglAwal: toYmd(tglAwal.value), tglAkhir: toYmd(tglAkhir.value) })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat daftar kunjungan', detail: err.message, life: 5000 })
  } finally {
    loadingDaftar.value = false
  }
}

const usiaSingkat = (u) => (u ? `${u.tahun ?? 0} th ${u.bulan ?? 0} bl` : '')

// ── Rincian kasir satu kunjungan ─────────────────────────────
const loading = ref(false)
const loadError = ref('')
const kunjungan = ref(null)
const billing = ref(null)

async function bukaKasir(row) {
  kunjungan.value = row
  billing.value = null
  loadError.value = ''
  loading.value = true
  try {
    billing.value = await getBillingKunjungan(row.NOMR, row.NOPENDAFTARAN)
    if (!billing.value) loadError.value = 'Data tagihan belum tersedia untuk kunjungan ini.'
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
  }
}

function kembaliKeDaftar() {
  kunjungan.value = null
  billing.value = null
  loadError.value = ''
}

function cetakBilling() {
  const url = router.resolve({ name: 'cetak-billing', params: { noreg: kunjungan.value.NOPENDAFTARAN } }).href
  window.open(url, '_blank')
}

// ── Tandai lunas ───────────────────────────────────────────────
const sudahLunas = computed(() => String(kunjungan.value?.LUNAS) === '1')
const menandaiLunas = ref(false)

function konfirmasiTandaiLunas() {
  confirm.require({
    header: 'Tandai lunas?',
    message: `Kunjungan ${kunjungan.value.NOPENDAFTARAN} (${kunjungan.value.NAMAPASIEN}) akan ditandai sudah lunas atas nama Anda (${getUserName()}).`,
    icon: 'pi pi-check-circle',
    acceptLabel: 'Tandai lunas',
    rejectLabel: 'Batal',
    accept: async () => {
      menandaiLunas.value = true
      try {
        await tandaiLunas(kunjungan.value.NOPENDAFTARAN, getUserName())
        kunjungan.value = { ...kunjungan.value, LUNAS: '1', LUNAS_BY: getUserName() }
        toast.add({ severity: 'success', summary: 'Kunjungan ditandai lunas', life: 3500 })
      } catch (err) {
        toast.add({ severity: 'error', summary: 'Gagal menandai lunas', detail: err.message, life: 5000 })
      } finally {
        menandaiLunas.value = false
      }
    }
  })
}

// ── Cari langsung lewat No. Registrasi (akses cepat, tanpa lewat daftar) ──
const noRegInput = ref('')

async function cari() {
  const noReg = noRegInput.value.trim()
  if (!noReg) {
    toast.add({ severity: 'warn', summary: 'No. registrasi kosong', detail: 'Masukkan no. registrasi kunjungan.', life: 3000 })
    return
  }
  loading.value = true
  loadError.value = ''
  billing.value = null
  kunjungan.value = null
  try {
    const k = await getPendaftaran(noReg)
    await bukaKasir(k)
  } catch (err) {
    loadError.value = err.message
    loading.value = false
  }
}

onMounted(muatDaftar)

async function muatUlangBilling() {
  if (!kunjungan.value) return
  try {
    billing.value = await getBillingKunjungan(kunjungan.value.NOMR, kunjungan.value.NOPENDAFTARAN)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat ulang tagihan', detail: err.message, life: 5000 })
  }
}

// ── Tampilan pasien & kunjungan ────────────────────────────────
const jk = (v) => (String(v).toUpperCase().startsWith('P') ? 'Perempuan' : String(v).toUpperCase().startsWith('L') ? 'Laki-laki' : '')
const usia = computed(() => {
  const th = hitungUmurTahun(kunjungan.value?.TGLLAHIR)
  return th == null ? '' : `${th} tahun`
})

// ── Billing dikelompokkan per kategori ────────────────────────
const groupedByCategory = computed(() => {
  const detail = billing.value?.DETAIL
  if (!Array.isArray(detail)) return {}
  return detail.reduce((groups, item) => {
    const kat = item.KATEGORI || 'Lainnya'
    if (!groups[kat]) groups[kat] = []
    groups[kat].push(item)
    return groups
  }, {})
})
const totalTagihan = computed(() => (billing.value?.DETAIL || []).reduce((s, i) => s + (Number(i.TOTALAMOUNT) || 0), 0))
const adaTagihan = computed(() => Object.keys(groupedByCategory.value).length > 0)

// ── Tambah item (jasa/tindakan) ────────────────────────────────
const showTambah = ref(false)
const jasaOptions = ref([])
const loadingJasa = ref(false)
const jasaDipilih = ref(null)
const qtyTambah = ref(1)
const saving = ref(false)

async function bukaTambahItem() {
  jasaDipilih.value = null
  qtyTambah.value = 1
  showTambah.value = true
  if (jasaOptions.value.length) return
  loadingJasa.value = true
  try {
    const rows = await getDaftarJasa()
    jasaOptions.value = rows.filter((j) => String(j.ARSIPKAN) !== '1')
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat daftar jasa', detail: err.message, life: 5000 })
  } finally {
    loadingJasa.value = false
  }
}

const subtotalTambah = computed(() => (Number(jasaDipilih.value?.HARGAJUAL) || 0) * (Number(qtyTambah.value) || 0))

async function simpanTambahItem() {
  if (!jasaDipilih.value) {
    toast.add({ severity: 'warn', summary: 'Pilih jasa/tindakan', detail: 'Pilih item yang akan ditambahkan.', life: 3000 })
    return
  }
  if (!qtyTambah.value || qtyTambah.value <= 0) {
    toast.add({ severity: 'warn', summary: 'Qty tidak valid', detail: 'Qty harus lebih dari 0.', life: 3000 })
    return
  }
  saving.value = true
  try {
    await tambahItemBilling(kunjungan.value, jasaDipilih.value, qtyTambah.value)
    toast.add({ severity: 'success', summary: 'Item ditambahkan', detail: `${jasaDipilih.value.NAMA} x ${qtyTambah.value}`, life: 3500 })
    showTambah.value = false
    await muatUlangBilling()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menambah item', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Kasir</h1>
        <p class="page-subtitle">Rincian tagihan kunjungan &mdash; obat, jasa, dan tindakan.</p>
      </div>
    </header>

    <template v-if="!kunjungan">
      <!-- Daftar pasien yang berkunjung -->
      <section class="panel filter">
        <div class="filter__row">
          <div class="field">
            <label for="tgl-awal">Dari tanggal</label>
            <DatePicker v-model="tglAwal" inputId="tgl-awal" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :maxDate="tglAkhir || undefined" fluid />
          </div>
          <div class="field">
            <label for="tgl-akhir">Sampai tanggal</label>
            <DatePicker v-model="tglAkhir" inputId="tgl-akhir" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :minDate="tglAwal || undefined" fluid />
          </div>
          <Button label="Tampilkan" icon="pi pi-search" :loading="loadingDaftar" class="filter__btn" @click="muatDaftar" />
        </div>
      </section>

      <section class="panel">
        <header class="panel__header toolbar">
          <IconField class="toolbar__search">
            <InputIcon class="pi pi-filter" />
            <InputText v-model="saring" placeholder="Saring nama, no. RM, no. registrasi, dokter" fluid />
          </IconField>
          <span class="toolbar__count">{{ daftarTampil.length }} kunjungan</span>
        </header>

        <DataTable :value="daftarTampil" :loading="loadingDaftar" dataKey="NOPENDAFTARAN" size="small" paginator :rows="15" :rowsPerPageOptions="[15, 30, 50]" scrollable>
          <template #empty>
            <p class="empty">Belum ada kunjungan pada rentang tanggal ini.</p>
          </template>
          <Column header="Registrasi" style="min-width: 10rem">
            <template #body="{ data: r }"><span class="mono strong">{{ r.NOPENDAFTARAN }}</span></template>
          </Column>
          <Column header="Pasien" style="min-width: 14rem">
            <template #body="{ data: r }">
              <span class="strong">{{ r.NAMAPASIEN }}</span>
              <small class="sub">RM {{ r.NOMR }}<template v-if="usiaSingkat(r.USIA_PASIEN)"> · {{ usiaSingkat(r.USIA_PASIEN) }}</template></small>
            </template>
          </Column>
          <Column header="Poli & dokter" style="min-width: 12rem">
            <template #body="{ data: r }">
              {{ r.POLI || '—' }}
              <small class="sub">{{ r.NAMADOKTER || '—' }}</small>
            </template>
          </Column>
          <Column header="Cara bayar">
            <template #body="{ data: r }"><Tag :value="r.CARABAYAR || '—'" :severity="isBpjsRow(r) ? 'success' : 'secondary'" /></template>
          </Column>
          <Column header="Masuk" style="min-width: 9rem">
            <template #body="{ data: r }"><span class="mono">{{ r.MASUKPOLY_DISPLAY || '—' }}</span></template>
          </Column>
          <Column header="Status" style="min-width: 8rem">
            <template #body="{ data: r }">
              <Tag v-if="String(r.LUNAS) === '1'" value="Lunas" severity="success" icon="pi pi-check-circle" />
              <Tag v-else value="Belum lunas" severity="warn" icon="pi pi-clock" />
            </template>
          </Column>
          <Column header="Aksi" frozen alignFrozen="right" style="width: 8rem">
            <template #body="{ data: r }">
              <Button label="Buka Kasir" icon="pi pi-wallet" size="small" text @click="bukaKasir(r)" />
            </template>
          </Column>
        </DataTable>
      </section>

      <section class="panel">
        <div class="cari-row">
          <IconField class="cari-row__input">
            <InputIcon class="pi pi-search" />
            <InputText v-model="noRegInput" placeholder="Atau ketik No. Registrasi langsung (mis. kunjungan lama)..." fluid @keydown.enter="cari" />
          </IconField>
          <Button label="Cari" icon="pi pi-search" :loading="loading" @click="cari" />
        </div>
      </section>
    </template>

    <p v-if="loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat data...</p>
    <Message v-else-if="loadError" severity="warn" icon="pi pi-exclamation-triangle">
      {{ loadError }}
      <Button label="Kembali ke daftar" text size="small" @click="kembaliKeDaftar" />
    </Message>

    <template v-else-if="kunjungan">
      <div class="back-row">
        <Button label="Kembali ke daftar" icon="pi pi-arrow-left" severity="secondary" outlined size="small" @click="kembaliKeDaftar" />
        <Tag v-if="sudahLunas" value="Lunas" severity="success" icon="pi pi-check-circle" />
        <Tag v-else value="Belum lunas" severity="warn" icon="pi pi-clock" />
        <small v-if="sudahLunas && kunjungan.LUNAS_BY" class="lunas-by">oleh {{ kunjungan.LUNAS_BY }}</small>
        <Button label="Cetak Billing" icon="pi pi-print" severity="secondary" outlined size="small" class="cetak-btn" @click="cetakBilling" />
        <Button
          v-if="!sudahLunas"
          label="Tandai Lunas"
          icon="pi pi-check"
          severity="success"
          size="small"
          :loading="menandaiLunas"
          class="lunas-btn"
          @click="konfirmasiTandaiLunas"
        />
      </div>

      <section class="panel info-panel">
        <div class="info-col">
          <header class="info-col__hdr"><i class="pi pi-user" /> Data Pasien</header>
          <dl class="info-list">
            <div><dt>Nama</dt><dd class="strong">{{ kunjungan.NAMAPASIEN || '—' }}</dd></div>
            <div><dt>No. RM</dt><dd class="mono">{{ kunjungan.NOMR || '—' }}</dd></div>
            <div v-if="jk(kunjungan.JENISKELAMIN) || usia"><dt>JK / Usia</dt><dd>{{ [jk(kunjungan.JENISKELAMIN), usia].filter(Boolean).join(' · ') }}</dd></div>
            <div v-if="kunjungan.ALAMAT"><dt>Alamat</dt><dd>{{ kunjungan.ALAMAT }}</dd></div>
          </dl>
        </div>
        <div class="info-col">
          <header class="info-col__hdr"><i class="pi pi-calendar" /> Data Kunjungan</header>
          <dl class="info-list">
            <div><dt>No. registrasi</dt><dd class="mono strong">{{ kunjungan.NOPENDAFTARAN }}</dd></div>
            <div><dt>Poli</dt><dd>{{ kunjungan.POLI || '—' }}</dd></div>
            <div><dt>Dokter</dt><dd>{{ kunjungan.NAMADOKTER || '—' }}</dd></div>
            <div><dt>Cara bayar</dt><dd>{{ kunjungan.CARABAYAR || '—' }}</dd></div>
            <div><dt>Masuk</dt><dd>{{ formatTanggal(kunjungan.MASUKPOLY) || kunjungan.MASUKPOLY_DISPLAY || '—' }}</dd></div>
          </dl>
        </div>
      </section>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title"><i class="pi pi-receipt panel__icon" /> Rincian Tagihan</h2>
          <Button label="Tambah Item" icon="pi pi-plus" size="small" @click="bukaTambahItem" />
        </header>

        <p v-if="!adaTagihan" class="empty">Belum ada item tagihan untuk kunjungan ini.</p>
        <table v-else class="bill-table">
          <thead>
            <tr>
              <th class="col-item">Item / Layanan</th>
              <th class="col-num">Harga</th>
              <th class="col-qty">Qty</th>
              <th>Satuan</th>
              <th class="col-num">Subtotal</th>
              <th>Tanggal</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(items, kategori) in groupedByCategory" :key="kategori">
              <tr class="bill-table__kategori">
                <td colspan="6">{{ kategori }}</td>
              </tr>
              <tr v-for="(item, idx) in items" :key="idx">
                <td>{{ item.ITEM }}</td>
                <td class="mono col-num">{{ rupiah.format(item.HARGA || 0) }}</td>
                <td class="mono col-qty">{{ item.QTY }}</td>
                <td>{{ item.SATUAN }}</td>
                <td class="mono col-num strong">{{ rupiah.format(item.TOTALAMOUNT || 0) }}</td>
                <td>{{ item.TANGGAL }}</td>
              </tr>
              <tr class="bill-table__subtotal">
                <td colspan="4">Subtotal <em>{{ kategori }}</em></td>
                <td class="mono col-num">{{ rupiah.format(items.reduce((s, i) => s + (Number(i.TOTALAMOUNT) || 0), 0)) }}</td>
                <td></td>
              </tr>
            </template>
          </tbody>
        </table>

        <div v-if="adaTagihan" class="total-row">
          <span>Total Tagihan</span>
          <span class="mono">{{ rupiah.format(totalTagihan) }}</span>
        </div>
      </section>
    </template>

    <!-- Dialog tambah item -->
    <Dialog v-model:visible="showTambah" header="Tambah Item Tagihan" modal :closable="!saving" :style="{ width: '28rem', maxWidth: '96vw' }">
      <div class="field">
        <label for="ti-jasa">Jasa / Tindakan <span class="req">*</span></label>
        <Select
          id="ti-jasa"
          v-model="jasaDipilih"
          :options="jasaOptions"
          optionLabel="NAMA"
          filter
          :loading="loadingJasa"
          placeholder="Pilih jasa/tindakan..."
          fluid
        >
          <template #option="{ option }">
            <div class="jasa-opsi">
              <span>{{ option.NAMA }}</span>
              <span class="mono">{{ rupiah.format(option.HARGAJUAL || 0) }}</span>
            </div>
          </template>
        </Select>
      </div>
      <div class="field">
        <label for="ti-qty">Qty</label>
        <InputNumber id="ti-qty" v-model="qtyTambah" :min="1" fluid />
      </div>
      <div v-if="jasaDipilih" class="subtotal-preview">
        <span>Subtotal</span>
        <span class="mono strong">{{ rupiah.format(subtotalTambah) }}</span>
      </div>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showTambah = false" />
        <Button label="Tambahkan" icon="pi pi-check" :loading="saving" @click="simpanTambahItem" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.filter {
  display: grid;
  margin-bottom: 1.25rem;
}
.filter__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  gap: 1rem;
  align-items: end;
}
.toolbar {
  flex-wrap: wrap;
}
.toolbar__search {
  flex: 1;
  min-width: 14rem;
  max-width: 28rem;
}
.toolbar__count {
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.sub {
  display: block;
  margin-top: 0.125rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.back-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.lunas-by {
  color: var(--app-text-muted);
}
.lunas-btn {
  margin-left: auto;
}

.cari-row {
  display: flex;
  gap: 0.625rem;
}
.cari-row__input {
  flex: 1;
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.panel__icon {
  color: var(--p-primary-color);
  margin-right: 0.5rem;
  font-size: 0.9375rem;
}

.info-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}
.info-col__hdr {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  margin-bottom: 0.625rem;
  border-bottom: 1px solid var(--app-border);
  font-weight: 700;
  font-size: 0.9375rem;
}
.info-col__hdr i {
  color: var(--p-primary-color);
}
.info-list {
  display: grid;
  gap: 0.375rem;
  margin: 0;
}
.info-list > div {
  display: flex;
  gap: 0.75rem;
  font-size: 0.875rem;
}
.info-list dt {
  min-width: 8rem;
  color: var(--app-text-muted);
  flex-shrink: 0;
}
.info-list dd {
  margin: 0;
}
.strong {
  font-weight: 700;
}
.mono {
  font-variant-numeric: tabular-nums;
}

.bill-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.bill-table th {
  text-align: left;
  padding: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 2px solid var(--app-border);
  white-space: nowrap;
}
.bill-table td {
  padding: 0.4375rem 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.col-item {
  min-width: 12rem;
}
.col-num {
  text-align: right;
}
.col-qty {
  text-align: center;
  width: 3.5rem;
}
.bill-table__kategori td {
  background: var(--p-surface-100, #f1f5f9);
  font-weight: 700;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-primary-color);
}
:global(.app-dark) .bill-table__kategori td {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}
.bill-table__subtotal td {
  font-style: italic;
  font-weight: 600;
  border-bottom: 2px solid var(--app-border);
}
.bill-table__subtotal em {
  font-style: normal;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--p-primary-50, #eff6ff);
  border-radius: var(--app-radius);
  font-weight: 700;
  font-size: 1.0625rem;
}
:global(.app-dark) .total-row {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}

.field {
  display: grid;
  gap: 0.375rem;
  margin-bottom: 0.875rem;
}
.field label {
  font-size: 0.875rem;
  font-weight: 600;
}
.req {
  color: var(--p-red-500);
}
.jasa-opsi {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}
.subtotal-preview {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--app-bg);
  border-radius: var(--app-radius);
  font-size: 0.9375rem;
}

@media (max-width: 768px) {
  .info-panel {
    grid-template-columns: 1fr;
  }
}
</style>
