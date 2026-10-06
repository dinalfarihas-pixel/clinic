<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  getKategoriLain,
  simpanKategoriLain,
  hapusKategoriLain,
  getTransaksiLain,
  simpanTransaksiLain,
  hapusTransaksiLain
} from '@/services/penjualan'
import { toYmd } from '@/utils/tanggal'
import { rupiah } from '@/utils/penjualan'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const JENIS = [
  { label: 'Pemasukan', value: 'PEMASUKAN' },
  { label: 'Pengeluaran', value: 'PENGELUARAN' }
]
const JENIS_FILTER = [{ label: 'Semua', value: null }, ...JENIS]
const masuk = (j) => j === 'PEMASUKAN'
const judulTipe = (t) => String(t || 'LAINNYA').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
const gagal = (judul) => (err) => toast.add({ severity: 'error', summary: judul, detail: err.message, life: 5000 })

// ── Kategori ─────────────────────────────────────────────────
const kategori = ref([])
const loadingKategori = ref(false)

async function muatKategori() {
  loadingKategori.value = true
  try {
    kategori.value = await getKategoriLain()
  } catch (err) {
    gagal('Gagal memuat kategori')(err)
  } finally {
    loadingKategori.value = false
  }
}

const showKategori = ref(false)
const formKategori = ref({})
const savingKategori = ref(false)
// Induk yang sudah ada untuk jenis terpilih; kolom induk boleh diketik untuk membuat yang baru.
const indukOptions = computed(() => [...new Set(kategori.value.filter((k) => k.JENIS === formKategori.value.JENIS).map((k) => k.TIPE))])

function bukaKategori(k = null) {
  formKategori.value = k ? { ID: k.ID, NAMA: k.NAMA, JENIS: k.JENIS, TIPE: k.TIPE } : { NAMA: '', JENIS: 'PENGELUARAN', TIPE: null }
  showKategori.value = true
}
async function simpanKategori() {
  const f = formKategori.value
  if (!f.NAMA?.trim()) return toast.add({ severity: 'warn', summary: 'Validasi', detail: 'Nama kategori wajib diisi', life: 3000 })
  savingKategori.value = true
  try {
    await simpanKategoriLain({ ...f, NAMA: f.NAMA.trim(), TIPE: f.TIPE?.trim() || 'LAINNYA' })
    toast.add({ severity: 'success', summary: 'Kategori disimpan', life: 3000 })
    showKategori.value = false
    await muatKategori()
  } catch (err) {
    gagal('Gagal menyimpan kategori')(err)
  } finally {
    savingKategori.value = false
  }
}
function konfirmasiHapusKategori(k) {
  confirm.require({
    header: 'Hapus kategori?',
    message: `Kategori "${k.NAMA}" akan dihapus. Transaksi lama yang memakainya tetap tercatat.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: async () => {
      try {
        await hapusKategoriLain(k.ID)
        toast.add({ severity: 'success', summary: 'Kategori dihapus', life: 3000 })
        await muatKategori()
      } catch (err) {
        gagal('Gagal menghapus kategori')(err)
      }
    }
  })
}

// ── Transaksi ────────────────────────────────────────────────
const now = new Date()
const tglMulai = ref(new Date(now.getFullYear(), now.getMonth(), 1))
const tglAkhir = ref(new Date(now.getFullYear(), now.getMonth() + 1, 0))
const filterJenis = ref(null)
const transaksi = ref([])
const loadingTransaksi = ref(false)

async function muatTransaksi() {
  if (!tglMulai.value) return
  loadingTransaksi.value = true
  try {
    transaksi.value = await getTransaksiLain(toYmd(tglMulai.value), toYmd(tglAkhir.value || tglMulai.value), filterJenis.value)
  } catch (err) {
    gagal('Gagal memuat transaksi')(err)
  } finally {
    loadingTransaksi.value = false
  }
}
const jumlah = (j) => transaksi.value.filter((t) => t.JENIS === j).reduce((s, t) => s + (Number(t.JUMLAH) || 0), 0)
const totalMasuk = computed(() => jumlah('PEMASUKAN'))
const totalKeluar = computed(() => jumlah('PENGELUARAN'))

const showTransaksi = ref(false)
const formTransaksi = ref({})
const savingTransaksi = ref(false)
// Kategori untuk jenis terpilih, dikelompokkan per induk.
const kategoriGrup = computed(() => {
  const map = new Map()
  for (const k of kategori.value.filter((x) => x.JENIS === formTransaksi.value.JENIS)) {
    if (!map.has(k.TIPE)) map.set(k.TIPE, { label: judulTipe(k.TIPE), items: [] })
    map.get(k.TIPE).items.push(k)
  }
  return [...map.values()]
})

function bukaTransaksi() {
  formTransaksi.value = { JENIS: 'PENGELUARAN', idKategori: null, tanggal: new Date(), jumlah: null, keterangan: '' }
  showTransaksi.value = true
}
async function simpanTransaksi() {
  const f = formTransaksi.value
  if (!f.idKategori) return toast.add({ severity: 'warn', summary: 'Validasi', detail: 'Pilih kategori dulu', life: 3000 })
  if (!(f.jumlah > 0)) return toast.add({ severity: 'warn', summary: 'Validasi', detail: 'Jumlah harus lebih dari 0', life: 3000 })
  savingTransaksi.value = true
  try {
    await simpanTransaksiLain({ idKategori: f.idKategori, tanggal: toYmd(f.tanggal), jumlah: f.jumlah, keterangan: f.keterangan })
    toast.add({ severity: 'success', summary: 'Transaksi disimpan', life: 3000 })
    showTransaksi.value = false
    await muatTransaksi()
  } catch (err) {
    gagal('Gagal menyimpan transaksi')(err)
  } finally {
    savingTransaksi.value = false
  }
}
function konfirmasiHapusTransaksi(t) {
  confirm.require({
    header: 'Hapus transaksi?',
    message: `${t.NAMA_KATEGORI} ${rupiah.format(t.JUMLAH)} akan dihapus dan saldo kas dikoreksi.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: async () => {
      try {
        await hapusTransaksiLain(t.ID)
        toast.add({ severity: 'success', summary: 'Transaksi dihapus', life: 3000 })
        await muatTransaksi()
      } catch (err) {
        gagal('Gagal menghapus transaksi')(err)
      }
    }
  })
}

onMounted(() => {
  muatKategori()
  muatTransaksi()
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Kas lain</h1>
        <p class="page-subtitle">Pemasukan dan pengeluaran di luar penjualan obat (gaji, listrik, setoran, dll).</p>
      </div>
      <div class="header-actions">
        <Button icon="pi pi-chart-bar" label="Laporan" severity="secondary" outlined @click="router.push('/laporan')" />
        <Button icon="pi pi-shopping-cart" label="Kasir" severity="secondary" outlined @click="router.push('/penjualan')" />
      </div>
    </header>

    <section class="panel">
      <Tabs value="transaksi">
        <TabList>
          <Tab value="transaksi"><i class="pi pi-wallet" /> Transaksi</Tab>
          <Tab value="kategori"><i class="pi pi-tags" /> Master kategori</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="transaksi">
            <div class="filter">
              <DatePicker v-model="tglMulai" dateFormat="dd M yy" placeholder="Tanggal mulai" showIcon iconDisplay="input" class="filter__date" />
              <span class="filter__sep">—</span>
              <DatePicker v-model="tglAkhir" dateFormat="dd M yy" placeholder="Tanggal akhir" showIcon iconDisplay="input" class="filter__date" />
              <SelectButton v-model="filterJenis" :options="JENIS_FILTER" optionLabel="label" optionValue="value" :allowEmpty="false" @update:modelValue="muatTransaksi" />
              <Button label="Terapkan" icon="pi pi-search" :loading="loadingTransaksi" @click="muatTransaksi" />
              <Button label="Tambah transaksi" icon="pi pi-plus" class="filter__add" @click="bukaTransaksi" />
            </div>

            <div class="kartu-grid">
              <div class="kartu">
                <i class="pi pi-arrow-down-left kartu__ikon kartu__ikon--masuk" />
                <div><span class="kartu__label">Pemasukan lain</span><b class="kartu__nilai">{{ rupiah.format(totalMasuk) }}</b></div>
              </div>
              <div class="kartu">
                <i class="pi pi-arrow-up-right kartu__ikon kartu__ikon--keluar" />
                <div><span class="kartu__label">Pengeluaran lain</span><b class="kartu__nilai">{{ rupiah.format(totalKeluar) }}</b></div>
              </div>
            </div>

            <DataTable :value="transaksi" size="small" showGridlines :loading="loadingTransaksi" paginator :rows="20" scrollable>
              <template #empty><p class="empty">Belum ada transaksi pada rentang ini.</p></template>
              <Column header="Tanggal" field="TANGGAL" sortable>
                <template #body="{ data }">{{ new Date(data.TANGGAL).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }}</template>
              </Column>
              <Column header="Jenis" field="JENIS" sortable>
                <template #body="{ data }"><Tag :value="masuk(data.JENIS) ? 'Pemasukan' : 'Pengeluaran'" :severity="masuk(data.JENIS) ? 'success' : 'danger'" /></template>
              </Column>
              <Column header="Kategori" field="NAMA_KATEGORI" sortable>
                <template #body="{ data }">{{ data.NAMA_KATEGORI }}<small class="sub">{{ judulTipe(data.TIPE) }}</small></template>
              </Column>
              <Column header="Jumlah" field="JUMLAH" sortable class="num">
                <template #body="{ data }"><b :class="masuk(data.JENIS) ? 'hijau' : 'merah'">{{ masuk(data.JENIS) ? '' : '-' }}{{ rupiah.format(data.JUMLAH) }}</b></template>
              </Column>
              <Column header="Keterangan" field="KETERANGAN" style="min-width: 12rem" />
              <Column header="Kasir" field="IDUSER" />
              <Column header="" style="width: 3rem">
                <template #body="{ data }"><Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="konfirmasiHapusTransaksi(data)" /></template>
              </Column>
            </DataTable>
          </TabPanel>

          <TabPanel value="kategori">
            <div class="filter">
              <Button label="Tambah kategori" icon="pi pi-plus" class="filter__add" @click="bukaKategori()" />
            </div>
            <DataTable :value="kategori" size="small" showGridlines :loading="loadingKategori" rowGroupMode="subheader" groupRowsBy="TIPE" scrollable>
              <template #empty><p class="empty">Belum ada kategori. Tambahkan dulu sebelum mencatat transaksi.</p></template>
              <template #groupheader="{ data }"><b>{{ judulTipe(data.TIPE) }}</b></template>
              <Column header="Nama kategori" field="NAMA" />
              <Column header="Jenis" field="JENIS">
                <template #body="{ data }"><Tag :value="masuk(data.JENIS) ? 'Pemasukan' : 'Pengeluaran'" :severity="masuk(data.JENIS) ? 'success' : 'danger'" /></template>
              </Column>
              <Column header="" style="width: 6rem">
                <template #body="{ data }">
                  <Button icon="pi pi-pencil" text rounded size="small" @click="bukaKategori(data)" />
                  <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="konfirmasiHapusKategori(data)" />
                </template>
              </Column>
            </DataTable>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </section>

    <!-- Dialog kategori -->
    <Dialog v-model:visible="showKategori" :header="formKategori.ID ? 'Edit kategori' : 'Tambah kategori'" modal :style="{ width: '26rem', maxWidth: '96vw' }">
      <div class="field">
        <label>Jenis <span class="req">*</span></label>
        <SelectButton v-model="formKategori.JENIS" :options="JENIS" optionLabel="label" optionValue="value" :allowEmpty="false" />
      </div>
      <div class="field">
        <label>Induk <small>(grup; ketik untuk membuat baru, kosong = Lainnya)</small></label>
        <Select v-model="formKategori.TIPE" :options="indukOptions" editable placeholder="mis. BIAYA OPERASIONAL" fluid />
      </div>
      <div class="field">
        <label>Nama kategori <span class="req">*</span></label>
        <InputText v-model="formKategori.NAMA" placeholder="mis. Gaji karyawan" fluid @keydown.enter="simpanKategori" />
      </div>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="savingKategori" @click="showKategori = false" />
        <Button label="Simpan" icon="pi pi-check" :loading="savingKategori" @click="simpanKategori" />
      </template>
    </Dialog>

    <!-- Dialog transaksi -->
    <Dialog v-model:visible="showTransaksi" header="Tambah transaksi" modal :style="{ width: '26rem', maxWidth: '96vw' }">
      <div class="field">
        <label>Jenis <span class="req">*</span></label>
        <SelectButton v-model="formTransaksi.JENIS" :options="JENIS" optionLabel="label" optionValue="value" :allowEmpty="false" @update:modelValue="formTransaksi.idKategori = null" />
      </div>
      <div class="field">
        <label>Kategori <span class="req">*</span></label>
        <Select
          v-model="formTransaksi.idKategori"
          :options="kategoriGrup"
          optionGroupLabel="label"
          optionGroupChildren="items"
          optionLabel="NAMA"
          optionValue="ID"
          placeholder="Pilih kategori"
          filter
          fluid
        />
        <small v-if="!kategoriGrup.length" class="hint">Belum ada kategori {{ formTransaksi.JENIS?.toLowerCase() }} — tambahkan di tab Master kategori.</small>
      </div>
      <div class="field">
        <label>Tanggal <span class="req">*</span></label>
        <DatePicker v-model="formTransaksi.tanggal" dateFormat="dd M yy" showIcon iconDisplay="input" fluid />
      </div>
      <div class="field">
        <label>Jumlah <span class="req">*</span></label>
        <InputNumber v-model="formTransaksi.jumlah" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" :min="0" fluid autofocus />
      </div>
      <div class="field">
        <label>Keterangan <small>(opsional)</small></label>
        <Textarea v-model="formTransaksi.keterangan" rows="2" autoResize fluid />
      </div>
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="savingTransaksi" @click="showTransaksi = false" />
        <Button label="Simpan" icon="pi pi-check" :loading="savingTransaksi" @click="simpanTransaksi" />
      </template>
    </Dialog>
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
  margin-bottom: 0.75rem;
}
.filter__date {
  width: 11rem;
}
.filter__sep {
  color: var(--app-text-muted);
}
.filter__add {
  margin-left: auto;
}
.kartu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.kartu {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  background: var(--app-panel);
}
.kartu__ikon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  font-size: 1.1rem;
}
.kartu__ikon--masuk {
  background: var(--p-green-50, #f0fdf4);
  color: var(--p-green-600, #16a34a);
}
.kartu__ikon--keluar {
  background: var(--p-red-50, #fef2f2);
  color: var(--p-red-500, #ef4444);
}
.kartu__label {
  display: block;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.kartu__nilai {
  font-size: 1.125rem;
  font-variant-numeric: tabular-nums;
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
.field {
  display: grid;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}
.field label {
  font-size: 0.8125rem;
  font-weight: 600;
}
.field label small {
  font-weight: 400;
  color: var(--app-text-muted);
}
.req {
  color: var(--p-red-500);
}
.hint {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
:deep(.num) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
