<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { toBulanTahun, getRiwayatOpname, getKategoriOpname, voidRiwayat } from '@/services/stockopname'

const toast = useToast()
const confirm = useConfirm()
const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

const bulan = ref(new Date())
const kategori = ref(null)
const kategoriList = ref([])
const search = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const loading = ref(false)
const voiding = ref(null)

const bulanTahun = computed(() => (bulan.value ? toBulanTahun(bulan.value) : ''))
const kunci = (r) => r.SUB_BARCODE + r.TANGGAL_OPNAME

async function muat() {
  loading.value = true
  try {
    const r = await getRiwayatOpname({ bulanTahun: bulanTahun.value, kategori: kategori.value, search: search.value.trim(), page: page.value, limit: limit.value })
    rows.value = r?.ITEMS || []
    total.value = r?.TOTAL || 0
  } catch (e) {
    rows.value = []
    toast.add({ severity: 'error', summary: 'Gagal memuat riwayat', detail: e.message, life: 5000 })
  } finally {
    loading.value = false
  }
}
function cari() {
  page.value = 1
  muat()
}
function onPage(e) {
  page.value = e.page + 1
  limit.value = e.rows
  muat()
}

function konfirmasiVoid(r) {
  confirm.require({
    header: 'Hapus baris riwayat?',
    message: 'Hanya menghapus baris dari riwayat — stok TIDAK dikembalikan. Jika salah hitung, hitung ulang lewat Stock Opname.',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: async () => {
      voiding.value = kunci(r)
      try {
        await voidRiwayat(r.SUB_BARCODE, r.TANGGAL_OPNAME)
        toast.add({ severity: 'success', summary: 'Riwayat dihapus', detail: r.NAMA, life: 3000 })
        await muat()
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Gagal menghapus', detail: e.message, life: 5000 })
      } finally {
        voiding.value = null
      }
    }
  })
}

const formatWaktu = (v) => {
  const d = new Date(String(v).replace(' ', 'T'))
  return isNaN(d) ? v : d.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  muat()
  try {
    kategoriList.value = await getKategoriOpname()
  } catch {
    /* filter kategori opsional */
  }
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Riwayat opname</h1>
        <p class="page-subtitle">Seluruh hitungan fisik per batch.</p>
      </div>
    </header>

    <section class="panel">
      <div class="rw-bar">
        <DatePicker v-model="bulan" view="month" dateFormat="mm/yy" showIcon iconDisplay="input" showButtonBar placeholder="Semua bulan" @update:modelValue="cari" />
        <Select v-model="kategori" :options="kategoriList" placeholder="Semua kategori" showClear @change="cari" />
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" placeholder="Cari barang / batch" @keyup.enter="cari" />
        </IconField>
        <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" @click="muat" />
      </div>

      <DataTable :value="rows" :loading="loading" size="small" stripedRows scrollable lazy paginator :rows="limit" :totalRecords="total" :first="(page - 1) * limit" :rowsPerPageOptions="[20, 50, 100]" @page="onPage">
        <template #empty><p class="rw-empty">Belum ada riwayat opname.</p></template>
        <Column header="Tanggal" style="min-width: 10rem"><template #body="{ data }">{{ formatWaktu(data.TANGGAL_OPNAME) }}</template></Column>
        <Column header="Barang" style="min-width: 14rem">
          <template #body="{ data }"><strong>{{ data.NAMA }}</strong><div class="rw-sub">{{ data.BARCODE }} · {{ data.KATEGORI }}</div></template>
        </Column>
        <Column header="Batch" style="min-width: 9rem">
          <template #body="{ data }">{{ data.BATCH_NUMBER || '—' }}<div class="rw-sub">{{ data.SUB_BARCODE }}</div></template>
        </Column>
        <Column field="BULAN_TAHUN" header="Bulan" style="min-width: 6rem" />
        <Column header="Sistem" style="min-width: 6rem"><template #body="{ data }">{{ angka.format(data.QTY_SISTEM) }}</template></Column>
        <Column header="Fisik" style="min-width: 6rem"><template #body="{ data }">{{ angka.format(data.QTY_FISIK) }}</template></Column>
        <Column header="Selisih" style="min-width: 6rem">
          <template #body="{ data }">
            <span :class="{ 'rw-minus': data.SELISIH < 0, 'rw-plus': data.SELISIH > 0 }">{{ data.SELISIH > 0 ? '+' : '' }}{{ angka.format(data.SELISIH) }}</span>
          </template>
        </Column>
        <Column field="CATATAN" header="Catatan" style="min-width: 10rem" />
        <Column field="ID_USER" header="Petugas" style="min-width: 7rem" />
        <Column header="Aksi" frozen alignFrozen="right" style="width: 4.5rem">
          <template #body="{ data }">
            <Button icon="pi pi-trash" text rounded severity="danger" size="small" :loading="voiding === kunci(data)" aria-label="Hapus baris riwayat" v-tooltip.top="'Hapus dari riwayat'" @click="konfirmasiVoid(data)" />
          </template>
        </Column>
      </DataTable>
    </section>
  </div>
</template>

<style scoped>
.rw-bar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.rw-empty { text-align: center; padding: 1.5rem; color: var(--p-text-muted-color); }
.rw-sub { font-size: 0.75rem; color: var(--p-text-muted-color); }
.rw-minus { color: var(--p-red-500); font-weight: 600; }
.rw-plus { color: var(--p-green-600); font-weight: 600; }
</style>
