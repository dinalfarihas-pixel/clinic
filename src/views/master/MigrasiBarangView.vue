<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { parseExcel, previewBarangStok, importBarangStok } from '@/services/migrasi'
import { getInfoLokasi } from '@/services/obat'

const toast = useToast()
const confirm = useConfirm()

const lokasi = ref(null)
const bisaImport = computed(() => lokasi.value?.IS_GUDANG !== false)

const barang = ref([]) // hasil parse (dikirim ke preview/import)
const preview = ref(null)
const hanyaInvalid = ref(false)
const loading = ref(false)
const hasil = ref(null)
const namaFile = ref('')
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

// ROW dari server mulai 1 = indeks array; petakan balik ke sheet & baris Excel
const rows = computed(() => {
  const list = (preview.value?.ROWS || []).map((r) => ({ ...r, SHEET: barang.value[r.ROW - 1]?.SHEET, BARIS_EXCEL: barang.value[r.ROW - 1]?.BARIS_EXCEL }))
  return hanyaInvalid.value ? list.filter((r) => !r.VALID) : list
})

onMounted(async () => {
  try {
    lokasi.value = await getInfoLokasi()
  } catch {
    /* cek lokasi opsional; server tetap menolak bila bukan gudang induk */
  }
})

async function pilihFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  namaFile.value = file.name
  loading.value = true
  preview.value = hasil.value = null
  try {
    barang.value = await parseExcel(file)
    if (!barang.value.length) throw new Error('Tidak ada baris barang di file ini.')
    preview.value = await previewBarangStok(barang.value)
  } catch (err) {
    barang.value = []
    toast.add({ severity: 'error', summary: 'Gagal memproses file', detail: err.message, life: 6000 })
  } finally {
    loading.value = false
  }
}

function konfirmasi() {
  const valid = preview.value.ROWS.filter((r) => r.VALID).map((r) => barang.value[r.ROW - 1])
  confirm.require({
    header: 'Import barang & stok awal',
    message: `${valid.length} baris valid akan diimport.${preview.value.INVALID ? ` ${preview.value.INVALID} baris tidak valid dilewati.` : ''} Lanjutkan?`,
    icon: 'pi pi-upload',
    acceptLabel: 'Import',
    rejectLabel: 'Batal',
    accept: () => jalankan(valid)
  })
}

async function jalankan(valid) {
  loading.value = true
  try {
    hasil.value = await importBarangStok(valid)
    preview.value = null
    barang.value = []
    toast.add({ severity: 'success', summary: 'Import berhasil', detail: `${hasil.value.JUMLAH_BARANG} barang`, life: 4000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Import gagal (tidak ada data tersimpan)', detail: err.message, life: 8000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Migrasi barang &amp; stok awal</h1>
        <p class="page-subtitle">Upload Excel, periksa hasil validasi, lalu import barang beserta stok awalnya.</p>
      </div>
    </header>

    <Message v-if="!bisaImport" severity="warn" :closable="false">
      Lokasi ini bukan gudang induk. Barang baru hanya bisa diimport dari lokasi gudang induk.
    </Message>

    <label class="dropzone" :class="{ 'dropzone--busy': loading }">
      <input type="file" accept=".xlsx" hidden :disabled="loading" @change="pilihFile" />
      <i :class="loading ? 'pi pi-spin pi-spinner' : 'pi pi-file-excel'" />
      <strong>{{ loading ? 'Memproses file…' : namaFile || 'Pilih file Excel (.xlsx)' }}</strong>
      <span>Sheet Obat &amp; BMHP, ATK, dan Jasa digabung otomatis. Klik untuk {{ namaFile ? 'mengganti file' : 'memilih file' }}.</span>
    </label>

    <Message v-if="hasil" severity="success" :closable="false">
      <strong>{{ hasil.JUMLAH_BARANG }} barang</strong> berhasil diimport.
    </Message>

    <template v-if="preview">
      <div class="stats">
        <div class="stat"><span>Total baris</span><strong>{{ preview.TOTAL }}</strong></div>
        <div class="stat stat--ok"><span>Valid</span><strong>{{ preview.VALID }}</strong></div>
        <div class="stat" :class="{ 'stat--bad': preview.INVALID }"><span>Tidak valid</span><strong>{{ preview.INVALID }}</strong></div>
      </div>

      <section class="panel">
        <header class="panel__header toolbar">
          <SelectButton v-model="hanyaInvalid" :options="[{ l: 'Semua', v: false }, { l: 'Tidak valid', v: true }]" optionLabel="l" optionValue="v" :allowEmpty="false" />
          <span class="toolbar__count">{{ rows.length }} baris</span>
          <Button class="toolbar__import" label="Import baris valid" icon="pi pi-upload" :disabled="!preview.VALID || !bisaImport" :loading="loading" @click="konfirmasi" />
        </header>

        <DataTable :value="rows" dataKey="ROW" size="small" stripedRows paginator :rows="20" :rowsPerPageOptions="[20, 50, 100]" scrollable>
          <template #empty><p class="empty">Tidak ada baris.</p></template>
          <Column header="Sheet / Baris" style="min-width: 10rem">
            <template #body="{ data }">
              <span class="sheet">{{ data.SHEET }}</span>
              <small class="mono muted"> #{{ data.BARIS_EXCEL }}</small>
            </template>
          </Column>
          <Column field="NAMA" header="Nama" style="min-width: 16rem">
            <template #body="{ data }"><strong>{{ data.NAMA || '—' }}</strong></template>
          </Column>
          <Column field="KATEGORI" header="Kategori" style="min-width: 9rem">
            <template #body="{ data }"><Tag :value="data.KATEGORI || '—'" severity="secondary" /></template>
          </Column>
          <Column header="Qty awal" style="min-width: 8rem" bodyClass="num" headerClass="num">
            <template #body="{ data }">
              <span class="mono">{{ data.IS_JASA ? '—' : angka.format(data.QTY_AWAL ?? 0) }}</span>
              <small class="muted"> {{ data.SATUAN_KECIL }}</small>
            </template>
          </Column>
          <Column header="Harga jual" style="min-width: 8rem" bodyClass="num" headerClass="num">
            <template #body="{ data }"><span class="mono">{{ data.HARGAJUAL != null ? rupiah.format(data.HARGAJUAL) : '—' }}</span></template>
          </Column>
          <Column header="Status" style="min-width: 18rem">
            <template #body="{ data }">
              <ul v-if="!data.VALID" class="errors">
                <li v-for="(er, i) in data.ERRORS" :key="i"><i class="pi pi-times-circle" /> {{ er }}</li>
              </ul>
              <div v-else class="status">
                <Tag value="Valid" severity="success" icon="pi pi-check" />
                <Tag v-if="data.BARANG_SUDAH_ADA" value="Barang sudah ada · tambah batch" severity="info" />
                <Tag v-if="data.BATCH_DARI_BARIS" :value="`Batch tambahan baris ${data.BATCH_DARI_BARIS}`" severity="secondary" />
              </div>
            </template>
          </Column>
        </DataTable>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dropzone {
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  padding: 1.75rem 1rem;
  text-align: center;
  background: var(--app-panel);
  border: 2px dashed var(--app-border);
  border-radius: var(--app-radius-lg);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.dropzone:hover {
  border-color: var(--p-primary-color);
}
.dropzone--busy {
  pointer-events: none;
  opacity: 0.7;
}
.dropzone .pi {
  font-size: 2rem;
  color: var(--p-primary-color);
}
.dropzone span {
  font-size: 0.875rem;
  color: var(--app-text-muted);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
}
.stat {
  display: grid;
  gap: 0.125rem;
  padding: 0.875rem 1.125rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-left: 4px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.stat span {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.stat strong {
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
}
.stat--ok {
  border-left-color: #16a34a;
}
.stat--bad {
  border-left-color: #dc2626;
}
.stat--bad strong {
  color: #dc2626;
}

.toolbar {
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.toolbar__count {
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.toolbar__import {
  margin-left: auto;
}
.mono {
  font-variant-numeric: tabular-nums;
}
.muted {
  color: var(--app-text-muted);
}
.sheet {
  font-size: 0.8125rem;
}
.status {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.errors {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: #dc2626;
}
.errors .pi {
  font-size: 0.75rem;
}
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
:deep(.num) {
  text-align: right;
  justify-content: flex-end;
}
</style>
