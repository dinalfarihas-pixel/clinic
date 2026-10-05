<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getDaftarPemesanan, setujuiPemesanan, kirimPemesanan, hapusPemesanan, STATUS_PEMESANAN, severityStatus } from '@/services/pemesanan'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
const tanggalPendek = (tgl) => (tgl ? new Date(tgl).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

// ── Daftar surat pesanan (server-paginated — data transaksi) ──
const pemesanan = ref([])
const totalRecords = ref(0)
const loading = ref(false)
const keyword = ref('')
const filterStatus = ref(null)
const page = ref(1)
const rowsPerPage = ref(15)
const statusOptions = [{ kode: null, label: 'Semua status' }, ...STATUS_PEMESANAN]
let searchTimeout = null

async function muatDaftar() {
  loading.value = true
  try {
    const { rows, total } = await getDaftarPemesanan({
      search: keyword.value.trim(),
      status: filterStatus.value?.filterKey || '',
      page: page.value,
      limit: rowsPerPage.value
    })
    pemesanan.value = rows
    totalRecords.value = total
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat surat pesanan', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

function onSearchInput() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    muatDaftar()
  }, 400)
}
function onFilterStatusChange() {
  page.value = 1
  muatDaftar()
}
function onPage(event) {
  page.value = event.page + 1
  rowsPerPage.value = event.rows
  muatDaftar()
}

function bukaTambah() {
  router.push({ name: 'farmasi-pesanan-baru' })
}
function bukaDetail(row) {
  router.push({ name: 'farmasi-pesanan-edit', params: { id: row.id_pemesanan } })
}

// ── Aksi baris: setujui / kirim / hapus / cetak ──────────────
const approvingId = ref(null)
const sendingId = ref(null)
const deletingId = ref(null)

async function setujui(row) {
  approvingId.value = row.id_pemesanan
  try {
    await setujuiPemesanan(row.id_pemesanan)
    toast.add({ severity: 'success', summary: 'SP disetujui', detail: `${row.no_sp} siap dikirim`, life: 3500 })
    await muatDaftar()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyetujui', detail: err.message, life: 5000 })
  } finally {
    approvingId.value = null
  }
}

function konfirmasiKirim(row) {
  confirm.require({
    header: 'Kirim surat pesanan?',
    message: `${row.no_sp} akan ditandai terkirim ke ${row.nama_supplier}.`,
    icon: 'pi pi-send',
    acceptLabel: 'Kirim',
    rejectLabel: 'Batal',
    accept: () => kirim(row)
  })
}
async function kirim(row) {
  sendingId.value = row.id_pemesanan
  try {
    await kirimPemesanan(row.id_pemesanan)
    toast.add({ severity: 'success', summary: 'SP dikirim', detail: row.no_sp, life: 3500 })
    await muatDaftar()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mengirim', detail: err.message, life: 5000 })
  } finally {
    sendingId.value = null
  }
}

function konfirmasiHapus(row) {
  confirm.require({
    header: 'Hapus surat pesanan?',
    message: `${row.no_sp} akan dihapus dan tidak dapat dikembalikan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => hapus(row)
  })
}
async function hapus(row) {
  deletingId.value = row.id_pemesanan
  try {
    await hapusPemesanan(row.id_pemesanan)
    toast.add({ severity: 'success', summary: 'SP dihapus', detail: row.no_sp, life: 3500 })
    await muatDaftar()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menghapus', detail: err.message, life: 5000 })
  } finally {
    deletingId.value = null
  }
}

function cetak(row) {
  const url = router.resolve({ name: 'cetak-surat-pesanan', params: { id: row.id_pemesanan } }).href
  window.open(url, '_blank')
}

onMounted(muatDaftar)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Surat pesanan obat</h1>
        <p class="page-subtitle">Buat dan kelola surat pesanan pembelian obat ke supplier.</p>
      </div>
      <Button label="Tambah surat pesanan" icon="pi pi-plus" @click="bukaTambah" />
    </header>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari no. SP atau nama supplier" fluid @input="onSearchInput" />
        </IconField>
        <Select
          v-model="filterStatus"
          :options="statusOptions"
          optionLabel="label"
          placeholder="Semua status"
          showClear
          style="min-width: 12rem"
          @change="onFilterStatusChange"
        />
        <div class="toolbar__right">
          <span class="toolbar__count">{{ totalRecords }} surat pesanan</span>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" v-tooltip.top="'Muat ulang'" @click="muatDaftar" />
        </div>
      </header>

      <DataTable
        :value="pemesanan"
        :loading="loading"
        dataKey="id_pemesanan"
        size="small"
        stripedRows
        lazy
        paginator
        :rows="rowsPerPage"
        :totalRecords="totalRecords"
        :rowsPerPageOptions="[15, 30, 50]"
        scrollable
        @page="onPage"
      >
        <template #empty>
          <p class="empty">{{ keyword || filterStatus ? 'Tidak ada surat pesanan yang cocok.' : 'Belum ada surat pesanan.' }}</p>
        </template>
        <Column header="No. SP" style="min-width: 12rem">
          <template #body="{ data }"><span class="mono">{{ data.no_sp }}</span></template>
        </Column>
        <Column header="Supplier" style="min-width: 12rem">
          <template #body="{ data }">{{ data.nama_supplier }}</template>
        </Column>
        <Column header="Tanggal" style="min-width: 8rem">
          <template #body="{ data }">{{ tanggalPendek(data.tanggal_sp) }}</template>
        </Column>
        <Column header="Item" style="width: 5rem">
          <template #body="{ data }">{{ data.jumlah_item }}</template>
        </Column>
        <Column header="Grand total" style="min-width: 9rem">
          <template #body="{ data }">{{ rupiah.format(data.grand_total || 0) }}</template>
        </Column>
        <Column header="Status" style="min-width: 10rem">
          <template #body="{ data }">
            <Tag :value="`${data.status_label}${data.persentase != null ? ' ' + Math.round(data.persentase) + '%' : ''}`" :severity="severityStatus(data.status)" />
          </template>
        </Column>
        <Column header="Aksi" frozen alignFrozen="right" style="width: 11rem">
          <template #body="{ data }">
            <div class="actions">
              <Button icon="pi pi-eye" text rounded severity="secondary" size="small" :aria-label="`Detail ${data.no_sp}`" v-tooltip.top="'Detail / edit'" @click="bukaDetail(data)" />
              <Button
                v-if="Number(data.status) === 0"
                icon="pi pi-check"
                text
                rounded
                severity="info"
                size="small"
                :loading="approvingId === data.id_pemesanan"
                :aria-label="`Setujui ${data.no_sp}`"
                v-tooltip.top="'Setujui (siap dikirim)'"
                @click="setujui(data)"
              />
              <Button
                v-if="Number(data.status) === 1"
                icon="pi pi-send"
                text
                rounded
                severity="warn"
                size="small"
                :loading="sendingId === data.id_pemesanan"
                :aria-label="`Kirim ${data.no_sp}`"
                v-tooltip.top="'Kirim ke supplier'"
                @click="konfirmasiKirim(data)"
              />
              <Button icon="pi pi-print" text rounded severity="secondary" size="small" :aria-label="`Cetak ${data.no_sp}`" v-tooltip.top="'Cetak'" @click="cetak(data)" />
              <Button
                v-if="Number(data.status) <= 1"
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                size="small"
                :loading="deletingId === data.id_pemesanan"
                :aria-label="`Hapus ${data.no_sp}`"
                v-tooltip.top="'Hapus'"
                @click="konfirmasiHapus(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>
  </div>
</template>

<style scoped>
.toolbar {
  flex-wrap: wrap;
}
.toolbar__search {
  flex: 1;
  max-width: 22rem;
  min-width: 14rem;
}
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}
.toolbar__count {
  font-size: 0.875rem;
  color: var(--app-text-muted);
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

@media (max-width: 575px) {
  .toolbar__search {
    max-width: none;
  }
}
</style>
