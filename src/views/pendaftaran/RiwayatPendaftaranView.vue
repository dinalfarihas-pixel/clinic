<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getRiwayatPendaftaran, batalPendaftaran, getUrlCetakSep, CARA_BAYAR_BPJS } from '@/services/pendaftaran'
import { toYmd } from '@/utils/tanggal'

const toast = useToast()
const auth = useAuthStore()
const router = useRouter()

// ── Filter pencarian (server) ────────────────────────────────
const tglAwal = ref(new Date())
const tglAkhir = ref(new Date())
const norm = ref('')
const rentang = ref('hari')

const rentangOptions = [
  { label: 'Hari ini', value: 'hari' },
  { label: '1 minggu', value: '1w' },
  { label: '2 minggu', value: '2w' },
  { label: '1 bulan', value: '1m' },
  { label: '2 bulan', value: '2m' }
]

function pilihRentang(value) {
  if (!value) return
  const akhir = new Date()
  const awal = new Date()
  if (value === '1w') awal.setDate(awal.getDate() - 7)
  if (value === '2w') awal.setDate(awal.getDate() - 14)
  if (value === '1m') awal.setMonth(awal.getMonth() - 1)
  if (value === '2m') awal.setMonth(awal.getMonth() - 2)
  tglAwal.value = awal
  tglAkhir.value = akhir
  muat()
}

// ── Data ─────────────────────────────────────────────────────
const data = ref([])
const loading = ref(false)
// Filter yang dipakai pada pemuatan terakhir (ditampilkan & dipakai saat batal)
const filterAktif = ref({ norm: '', tglAwal: '', tglAkhir: '' })

async function muat() {
  if (tglAwal.value && tglAkhir.value && tglAwal.value > tglAkhir.value) {
    toast.add({ severity: 'warn', summary: 'Tanggal', detail: 'Tanggal awal melewati tanggal akhir.', life: 3000 })
    return
  }
  loading.value = true
  const filter = { norm: norm.value.trim(), tglAwal: toYmd(tglAwal.value), tglAkhir: toYmd(tglAkhir.value) }
  try {
    data.value = await getRiwayatPendaftaran(filter)
    filterAktif.value = filter
    filterPoli.value = null
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat riwayat', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

function onUbahTanggal() {
  rentang.value = null
}

// ── Filter hasil (lokal) ─────────────────────────────────────
const saring = ref('')
const filterPoli = ref(null)
const filterStatus = ref('semua')

const statusOptions = [
  { label: 'Semua', value: 'semua' },
  { label: 'Aktif', value: 'aktif' },
  { label: 'Batal', value: 'batal' }
]

const isBatal = (row) => String(row.BATAL) === '1'
const isBpjsRow = (row) => row.KODECARABAYAR == CARA_BAYAR_BPJS || /BPJS/i.test(row.CARABAYAR || '')

const poliOptions = computed(() =>
  [...new Set(data.value.map((r) => r.POLI).filter(Boolean))].sort((a, b) => a.localeCompare(b))
)

const dataTampil = computed(() => {
  const q = saring.value.trim().toLowerCase()
  return data.value.filter((r) => {
    if (filterPoli.value && r.POLI !== filterPoli.value) return false
    if (filterStatus.value === 'aktif' && isBatal(r)) return false
    if (filterStatus.value === 'batal' && !isBatal(r)) return false
    if (!q) return true
    return [r.NAMAPASIEN, r.NOMR, r.NOKTP, r.NOJAMINAN, r.NOPENDAFTARAN, r.NOSEP, r.NAMADOKTER]
      .some((v) => String(v ?? '').toLowerCase().includes(q))
  })
})

const ringkasan = computed(() => {
  const aktif = data.value.filter((r) => !isBatal(r))
  return [
    { label: 'Pendaftaran', value: data.value.length, icon: 'pi pi-list' },
    { label: 'Aktif', value: aktif.length, icon: 'pi pi-check-circle' },
    { label: 'Pasien BPJS', value: aktif.filter(isBpjsRow).length, icon: 'pi pi-id-card' },
    { label: 'Batal', value: data.value.length - aktif.length, icon: 'pi pi-times-circle' }
  ]
})

const usia = (u) => (u ? `${u.tahun ?? 0} th ${u.bulan ?? 0} bl` : '')

// ── Cetak SEP / bukti pendaftaran ────────────────────────────
const printing = ref(null) // NOPENDAFTARAN yang sedang dicetak

function cetakBukti(row) {
  const href = router.resolve({
    name: 'cetak-bukti-pendaftaran',
    params: { noreg: row.NOPENDAFTARAN },
    query: { print: '1' }
  }).href
  window.open(href, '_blank')
}

// BPJS: SEP dari API Laravel; lainnya: bukti pendaftaran klinik
async function cetak(row) {
  if (!isBpjsRow(row)) return cetakBukti(row)
  // Jendela dibuka saat klik agar tidak diblokir popup blocker
  const win = window.open('', '_blank')
  printing.value = row.NOPENDAFTARAN
  try {
    const url = await getUrlCetakSep({
      noSep: isBpjsRow(row) ? row.NOSEP : '',
      noReg: row.NOPENDAFTARAN,
      norm: row.NOMR,
      caraBayar: row.KODECARABAYAR
    })
    if (win) win.location.href = url
    else window.open(url, '_blank')
  } catch (err) {
    win?.close()
    toast.add({ severity: 'error', summary: 'Gagal mencetak', detail: err.message, life: 5000 })
  } finally {
    printing.value = null
  }
}

// ── Cetak gelang pasien (5 x 2 cm), sama dengan SIMRS ────────
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function tglDmy(tgl) {
  const [y, m, d] = String(tgl || '').split(' ')[0].split('-')
  return y && m && d ? `${d}-${m}-${y}` : '-'
}

function cetakGelang(row) {
  const win = window.open('', '_blank', 'width=400,height=250')
  if (!win) {
    toast.add({ severity: 'warn', summary: 'Pop-up diblokir', detail: 'Izinkan pop-up untuk mencetak gelang.', life: 4000 })
    return
  }
  const u = row.USIA_PASIEN || {}
  const jk = (row.JENISKELAMIN || '').charAt(0).toUpperCase()
  const masuk = (row.MASUKPOLY_DISPLAY || '').split(' ')[0] || '-'
  win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8" />
<title>Gelang ${esc(row.NAMAPASIEN)}</title>
<style>
  @page { size: 5cm 2cm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 5cm; height: 2cm; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #000; display: flex; flex-direction: column;
    justify-content: center; align-items: center; text-align: center; padding: 1mm 2mm; overflow: hidden; }
  .rs { font-size: 6.5pt; white-space: nowrap; }
  .nama { font-size: 10.5pt; font-weight: 700; white-space: nowrap; margin: 0.3mm 0; }
  .row { display: flex; justify-content: space-between; width: 100%; font-size: 7pt; white-space: nowrap; gap: 4mm; }
</style></head><body>
  <div class="rs">${esc(auth.company || 'KLINIK')}</div>
  <div class="nama">${esc(row.NAMAPASIEN)} (${esc(jk)}-${u.tahun ?? '-'})</div>
  <div class="row"><span>RM# ${esc(row.NOMR)}</span><span>MASUK #${esc(masuk)}</span></div>
  <div class="row"><span>TL# ${esc(tglDmy(row.TGLLAHIR))}</span><span>USIA(${u.tahun ?? 0}T,${u.bulan ?? 0}B,${u.hari ?? 0}H)</span></div>
</body></html>`)
  win.document.close()
  win.onload = () => {
    win.focus()
    win.print()
  }
}

// ── Menu aksi per baris ──────────────────────────────────────
const menu = ref()
const menuRow = ref(null)
const menuItems = computed(() => [
  {
    label: 'Cetak bukti pendaftaran',
    icon: 'pi pi-file',
    disabled: !menuRow.value || isBatal(menuRow.value),
    command: () => cetakBukti(menuRow.value)
  },
  { label: 'Cetak gelang pasien', icon: 'pi pi-id-card', command: () => cetakGelang(menuRow.value) },
  { separator: true },
  {
    label: 'Batalkan pendaftaran',
    icon: 'pi pi-times-circle',
    disabled: !menuRow.value || isBatal(menuRow.value),
    command: () => bukaBatal(menuRow.value)
  }
])

function bukaMenu(event, row) {
  menuRow.value = row
  menu.value.toggle(event)
}

// ── Batal pendaftaran ────────────────────────────────────────
const showBatal = ref(false)
const batalRow = ref(null)
const alasan = ref('')
const alasanError = ref('')
const membatalkan = ref(false)

function bukaBatal(row) {
  batalRow.value = row
  alasan.value = ''
  alasanError.value = ''
  showBatal.value = true
}

async function konfirmasiBatal() {
  if (!alasan.value.trim()) {
    alasanError.value = 'Alasan pembatalan wajib diisi'
    return
  }
  const row = batalRow.value
  membatalkan.value = true
  try {
    await batalPendaftaran(
      {
        noReg: row.NOPENDAFTARAN,
        noSep: row.NOSEP,
        norm: row.NOMR,
        tglAwal: filterAktif.value.tglAwal,
        alasan: alasan.value.trim()
      },
      auth.userId
    )
    toast.add({ severity: 'success', summary: 'Pendaftaran dibatalkan', detail: `${row.NOPENDAFTARAN} — ${row.NAMAPASIEN}`, life: 3500 })
    showBatal.value = false
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membatalkan', detail: err.message, life: 5000 })
  } finally {
    membatalkan.value = false
  }
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Riwayat pendaftaran</h1>
        <p class="page-subtitle">Daftar kunjungan rawat jalan yang sudah didaftarkan.</p>
      </div>
      <Button label="Daftarkan pasien" icon="pi pi-user-plus" @click="$router.push('/pendaftaran')" />
    </header>

    <!-- Filter -->
    <section class="panel filter">
      <div class="filter__row">
        <div class="field">
          <label for="tgl-awal">Dari tanggal</label>
          <DatePicker v-model="tglAwal" inputId="tgl-awal" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :maxDate="tglAkhir || undefined" fluid @update:modelValue="onUbahTanggal" />
        </div>
        <div class="field">
          <label for="tgl-akhir">Sampai tanggal</label>
          <DatePicker v-model="tglAkhir" inputId="tgl-akhir" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :minDate="tglAwal || undefined" fluid @update:modelValue="onUbahTanggal" />
        </div>
        <div class="field">
          <label for="cari-rm">No. RM <small>(opsional)</small></label>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText id="cari-rm" v-model="norm" placeholder="Riwayat satu pasien" fluid @keydown.enter="muat" />
          </IconField>
        </div>
        <Button label="Tampilkan" icon="pi pi-search" :loading="loading" class="filter__btn" @click="muat" />
      </div>
      <SelectButton
        v-model="rentang"
        :options="rentangOptions"
        optionLabel="label"
        optionValue="value"
        size="small"
        class="filter__range"
        aria-label="Rentang cepat"
        @update:modelValue="pilihRentang"
      />
    </section>

    <!-- Ringkasan -->
    <section class="summary" aria-label="Ringkasan">
      <div v-for="s in ringkasan" :key="s.label" class="summary__item">
        <i :class="s.icon" class="summary__icon" />
        <div>
          <p class="summary__value">{{ s.value.toLocaleString('id-ID') }}</p>
          <p class="summary__label">{{ s.label }}</p>
        </div>
      </div>
    </section>

    <!-- Tabel -->
    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-filter" />
          <InputText v-model="saring" placeholder="Saring nama, NIK, no. registrasi, SEP, dokter" fluid />
        </IconField>
        <div class="toolbar__right">
          <Select v-model="filterPoli" :options="poliOptions" placeholder="Semua poli" showClear class="toolbar__poli" />
          <SelectButton
            v-if="filterAktif.norm"
            v-model="filterStatus"
            :options="statusOptions"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            size="small"
          />
        </div>
      </header>

      <p v-if="filterAktif.norm" class="scope">
        Menampilkan riwayat No. RM <strong>{{ filterAktif.norm }}</strong>, termasuk yang dibatalkan (maks. 30 terakhir).
      </p>

      <DataTable
        :value="dataTampil"
        :loading="loading"
        dataKey="NOPENDAFTARAN"
        size="small"
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 30, 50]"
        :rowClass="(r) => (isBatal(r) ? 'row-batal' : '')"
        scrollable
      >
        <template #empty>
          <p class="empty">
            {{ data.length ? 'Tidak ada data yang cocok dengan saringan.' : 'Belum ada pendaftaran pada rentang tanggal ini.' }}
          </p>
        </template>

        <Column header="Registrasi" style="min-width: 11rem">
          <template #body="{ data: r }">
            <span class="mono strong">{{ r.NOPENDAFTARAN }}</span>
            <small v-if="r.NOSEP" class="sub mono">SEP {{ r.NOSEP }}</small>
          </template>
        </Column>
        <Column header="Pasien" style="min-width: 15rem">
          <template #body="{ data: r }">
            <span class="strong">{{ r.NAMAPASIEN }}</span>
            <small class="sub">
              RM {{ r.NOMR }}<template v-if="usia(r.USIA_PASIEN)"> · {{ usia(r.USIA_PASIEN) }}</template>
            </small>
            <small v-if="r.NOJAMINAN" class="sub mono">BPJS {{ r.NOJAMINAN }}</small>
          </template>
        </Column>
        <Column header="Poli & dokter" style="min-width: 13rem">
          <template #body="{ data: r }">
            {{ r.POLI || '—' }}
            <small class="sub">{{ r.NAMADOKTER || '—' }}</small>
          </template>
        </Column>
        <Column header="Cara bayar">
          <template #body="{ data: r }">
            <Tag :value="r.CARABAYAR || '—'" :severity="isBpjsRow(r) ? 'success' : 'secondary'" />
          </template>
        </Column>
        <Column header="Masuk / keluar" style="min-width: 10rem">
          <template #body="{ data: r }">
            <span class="mono">{{ r.MASUKPOLY_DISPLAY || '—' }}</span>
            <small class="sub mono">{{ r.KELUARPOLY || 'Belum keluar' }}</small>
          </template>
        </Column>
        <Column header="Status" style="min-width: 9rem">
          <template #body="{ data: r }">
            <Tag v-if="isBatal(r)" value="Batal" severity="danger" icon="pi pi-times-circle" />
            <Tag v-else value="Aktif" severity="success" icon="pi pi-check-circle" />
            <small v-if="r.STTS_PULANG" class="sub">{{ r.STTS_PULANG }}</small>
            <small v-if="r.ALASAN_BATAL" class="sub" :title="r.ALASAN_BATAL">
              {{ isBatal(r) ? 'Alasan' : 'SEP dibatalkan' }}: {{ r.ALASAN_BATAL }}
            </small>
          </template>
        </Column>
        <Column header="Aksi" frozen alignFrozen="right" style="width: 6.5rem">
          <template #body="{ data: r }">
            <div class="actions">
              <Button
                icon="pi pi-print"
                text
                rounded
                severity="secondary"
                size="small"
                :loading="printing === r.NOPENDAFTARAN"
                :disabled="isBatal(r)"
                :aria-label="isBpjsRow(r) ? 'Cetak SEP' : 'Cetak bukti pendaftaran'"
                v-tooltip.top="isBpjsRow(r) ? 'Cetak SEP' : 'Cetak bukti pendaftaran'"
                @click="cetak(r)"
              />
              <Button
                icon="pi pi-ellipsis-v"
                text
                rounded
                severity="secondary"
                size="small"
                aria-label="Aksi lainnya"
                aria-haspopup="true"
                @click="bukaMenu($event, r)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <Menu ref="menu" :model="menuItems" popup />

    <!-- Dialog batal -->
    <Dialog
      v-model:visible="showBatal"
      header="Batalkan pendaftaran"
      modal
      :closable="!membatalkan"
      :style="{ width: '30rem' }"
      :breakpoints="{ '575px': '94vw' }"
    >
      <div v-if="batalRow" class="batal">
        <Message severity="warn" icon="pi pi-exclamation-triangle">
          Pendaftaran <strong>{{ batalRow.NOPENDAFTARAN }}</strong> atas nama <strong>{{ batalRow.NAMAPASIEN }}</strong>
          akan dibatalkan<template v-if="batalRow.NOSEP">, termasuk SEP <strong>{{ batalRow.NOSEP }}</strong></template>.
          Tindakan ini tidak dapat diurungkan.
        </Message>
        <div class="field">
          <label for="alasan-batal">Alasan pembatalan <span class="req">*</span></label>
          <Textarea
            id="alasan-batal"
            v-model="alasan"
            rows="3"
            autoResize
            placeholder="Mis. pasien salah poli, pasien tidak jadi berobat"
            :invalid="!!alasanError"
            autofocus
            fluid
            @update:modelValue="alasanError = ''"
          />
          <small v-if="alasanError" class="field__error">{{ alasanError }}</small>
        </div>
      </div>
      <template #footer>
        <Button label="Kembali" severity="secondary" outlined :disabled="membatalkan" @click="showBatal = false" />
        <Button label="Batalkan pendaftaran" icon="pi pi-times-circle" severity="danger" :loading="membatalkan" @click="konfirmasiBatal" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.filter {
  display: grid;
  gap: 0.875rem;
  margin-bottom: 1.25rem;
}
.filter__row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 1rem;
  align-items: end;
}
.filter__range {
  justify-self: start;
  flex-wrap: wrap;
}
.field {
  display: grid;
  gap: 0.375rem;
}
.field label {
  font-size: 0.875rem;
  font-weight: 600;
}
.field label small {
  font-weight: 400;
  color: var(--app-text-muted);
}
.field__error {
  color: var(--p-red-500);
  font-size: 0.8125rem;
}
.req {
  color: var(--p-red-500);
}

.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  margin-bottom: 1.25rem;
}
.summary__item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
}
.summary__item + .summary__item {
  border-left: 1px solid var(--app-border);
}
.summary__icon {
  font-size: 1.125rem;
  color: var(--p-primary-color);
  background: var(--p-primary-50);
  width: 2.5rem;
  height: 2.5rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
}
:global(.app-dark) .summary__icon {
  background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
}
.summary__value {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.summary__label {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

.toolbar {
  flex-wrap: wrap;
}
.toolbar__search {
  flex: 1;
  min-width: 14rem;
  max-width: 28rem;
}
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.toolbar__poli {
  min-width: 12rem;
}
.scope {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}

.strong {
  font-weight: 600;
}
.sub {
  display: block;
  margin-top: 0.125rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.actions {
  display: flex;
  gap: 0.125rem;
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
:deep(.row-batal) > td {
  color: var(--app-text-muted);
}
:deep(.row-batal) .strong {
  text-decoration: line-through;
}

.batal {
  display: grid;
  gap: 1rem;
}

@media (max-width: 991px) {
  .filter__row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .filter__btn {
    grid-column: 1 / -1;
  }
}
@media (max-width: 768px) {
  .summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary__item:nth-child(3) {
    border-left: 0;
  }
  .summary__item:nth-child(n + 3) {
    border-top: 1px solid var(--app-border);
  }
}
@media (max-width: 575px) {
  .filter__row {
    grid-template-columns: 1fr;
  }
  .toolbar__search {
    max-width: none;
  }
}
</style>
