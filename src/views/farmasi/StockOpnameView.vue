<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { getDaftarRak } from '@/services/obat'
import { bulanIni, toBulanTahun, getBarangOpname, getKategoriOpname, getBatchOpname, getBatchOpnameByRak } from '@/services/stockopname'
import OpnameBatchTable from './components/OpnameBatchTable.vue'

const toast = useToast()
const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

const bulan = ref(new Date())
const bulanTahun = computed(() => toBulanTahun(bulan.value))
const canSave = computed(() => bulanTahun.value === bulanIni())
const err = (summary) => (e) => toast.add({ severity: 'error', summary, detail: e.message, life: 5000 })

// ── Per rak ──────────────────────────────────────────────────
const rakList = ref([])
const idRak = ref(null)
const rakBatches = ref([])
const loadingRak = ref(false)
const rakOptions = computed(() => rakList.value.map((r) => ({ label: r.NAMA_RAK ? `${r.KODE_RAK} — ${r.NAMA_RAK}` : r.KODE_RAK, value: r.ID })))

async function muatRak() {
  if (!idRak.value) return (rakBatches.value = [])
  loadingRak.value = true
  try {
    rakBatches.value = (await getBatchOpnameByRak(idRak.value, bulanTahun.value))?.BATCHES || []
  } catch (e) {
    rakBatches.value = []
    err('Gagal memuat batch rak')(e)
  } finally {
    loadingRak.value = false
  }
}

// ── Per barang ───────────────────────────────────────────────
const barang = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const limit = ref(20)
const search = ref('')
const kategori = ref(null)
const kategoriList = ref([])
const expanded = ref({})
const batchByBarcode = ref({}) // { [BARCODE]: { loading, rows } }

async function muatBarang() {
  loading.value = true
  try {
    const r = await getBarangOpname({ bulanTahun: bulanTahun.value, page: page.value, limit: limit.value, search: search.value.trim(), kategori: kategori.value })
    barang.value = r?.ITEMS || []
    total.value = r?.TOTAL || 0
    batchByBarcode.value = {}
  } catch (e) {
    barang.value = []
    err('Gagal memuat barang')(e)
  } finally {
    loading.value = false
  }
}

async function muatBatch(barcode) {
  batchByBarcode.value = { ...batchByBarcode.value, [barcode]: { loading: true, rows: [] } }
  try {
    const r = await getBatchOpname(barcode, bulanTahun.value)
    // satuan & konversi ada di BARANG; gabung ke tiap batch supaya tabel bisa pakai satuan sedang/besar
    const rows = (r?.BATCHES || []).map((b) => ({ ...r.BARANG, ...b }))
    batchByBarcode.value = { ...batchByBarcode.value, [barcode]: { loading: false, rows } }
  } catch (e) {
    batchByBarcode.value = { ...batchByBarcode.value, [barcode]: { loading: false, rows: [] } }
    err('Gagal memuat batch')(e)
  }
}
const onRowExpand = (ev) => muatBatch(ev.data.BARCODE)

function onPage(e) {
  page.value = e.page + 1
  limit.value = e.rows
  muatBarang()
}
function cari() {
  page.value = 1
  muatBarang()
}

// Setelah simpan: muat ulang batch barang itu dan daftar (progress batch ikut berubah)
async function sesudahSimpanBarang(barcode) {
  await muatBarang()
  expanded.value = { [barcode]: true }
  await muatBatch(barcode)
}

function gantiBulan() {
  muatBarang()
  muatRak()
}

onMounted(async () => {
  muatBarang()
  const [rak, kat] = await Promise.allSettled([getDaftarRak(), getKategoriOpname()])
  if (rak.status === 'fulfilled') rakList.value = rak.value
  if (kat.status === 'fulfilled') kategoriList.value = kat.value
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Stock opname</h1>
        <p class="page-subtitle">Hitung fisik per batch. Simpan langsung mengubah stok; hanya bulan berjalan yang bisa disimpan.</p>
      </div>
      <div class="opn-bulan">
        <label for="opn-bulan">Bulan</label>
        <DatePicker id="opn-bulan" v-model="bulan" view="month" dateFormat="mm/yy" :maxDate="new Date()" showIcon iconDisplay="input" @update:modelValue="gantiBulan" />
      </div>
    </header>

    <Message v-if="!canSave" severity="warn" icon="pi pi-lock" size="small" class="opn-notice">
      Bulan {{ bulanTahun }} bukan bulan berjalan, jadi hanya dapat dilihat. Pilih bulan ini untuk menyimpan hitungan.
    </Message>

    <section class="panel">
      <Tabs value="rak">
        <TabList>
          <Tab value="rak">Per rak</Tab>
          <Tab value="barang">Per barang</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="rak">
            <div class="opn-bar">
              <Select v-model="idRak" :options="rakOptions" optionLabel="label" optionValue="value" placeholder="Pilih rak" filter style="min-width: 18rem" @change="muatRak" />
              <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loadingRak" aria-label="Muat ulang" @click="muatRak" />
            </div>
            <p v-if="!idRak" class="opn-hint">Pilih rak untuk mulai menghitung.</p>
            <OpnameBatchTable v-else :batches="rakBatches" :bulanTahun="bulanTahun" :canSave="canSave" showBarang @saved="muatRak" />
          </TabPanel>

          <TabPanel value="barang">
            <div class="opn-bar">
              <IconField>
                <InputIcon class="pi pi-search" />
                <InputText v-model="search" placeholder="Cari nama / kode barang" @keyup.enter="cari" />
              </IconField>
              <Select v-model="kategori" :options="kategoriList" placeholder="Semua kategori" showClear @change="cari" />
              <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" @click="muatBarang" />
            </div>
            <DataTable
              v-model:expandedRows="expanded"
              :value="barang"
              :loading="loading"
              dataKey="BARCODE"
              size="small"
              stripedRows
              lazy
              paginator
              :rows="limit"
              :totalRecords="total"
              :first="(page - 1) * limit"
              :rowsPerPageOptions="[20, 50, 100]"
              @page="onPage"
              @row-expand="onRowExpand"
            >
              <template #empty><p class="opn-hint">Tidak ada barang.</p></template>
              <Column expander style="width: 2.5rem" />
              <Column header="Barang" style="min-width: 14rem">
                <template #body="{ data }"><strong>{{ data.NAMA }}</strong><div class="opn-sub">{{ data.BARCODE }} · {{ data.KATEGORI }}</div></template>
              </Column>
              <Column header="Stok sistem" style="min-width: 8rem">
                <template #body="{ data }">{{ angka.format(data.TOTAL_QTY_SISTEM) }} {{ data.SATUAN_KECIL }}</template>
              </Column>
              <Column header="Progress batch" style="min-width: 10rem">
                <template #body="{ data }">
                  <Tag :value="`${data.JUMLAH_BATCH_SUDAH} / ${data.JUMLAH_BATCH}`" :severity="data.JUMLAH_BATCH > 0 && data.JUMLAH_BATCH_SUDAH >= data.JUMLAH_BATCH ? 'success' : 'secondary'" />
                </template>
              </Column>
              <template #expansion="{ data }">
                <div class="opn-expand">
                  <p v-if="batchByBarcode[data.BARCODE]?.loading" class="opn-hint"><i class="pi pi-spin pi-spinner" /> Memuat batch...</p>
                  <OpnameBatchTable
                    v-else
                    :batches="batchByBarcode[data.BARCODE]?.rows || []"
                    :bulanTahun="bulanTahun"
                    :canSave="canSave"
                    @saved="sesudahSimpanBarang(data.BARCODE)"
                  />
                </div>
              </template>
            </DataTable>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </section>
  </div>
</template>

<style scoped>
.opn-notice { margin-bottom: 1rem; }
.opn-bulan { display: flex; align-items: center; gap: 0.5rem; }
.opn-bar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.opn-hint { text-align: center; padding: 1.5rem; color: var(--p-text-muted-color); }
.opn-sub { font-size: 0.75rem; color: var(--p-text-muted-color); }
.opn-expand { padding: 0.75rem 1.25rem; background: var(--p-surface-50, #f8fafc); }
</style>
