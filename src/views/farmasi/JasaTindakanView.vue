<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  getInfoLokasi,
  getKategoriJasa,
  getDaftarJasa,
  tambahJasa,
  updateJasa,
  arsipkanJasa,
  aktifkanJasa,
  hapusJasa,
  KATEGORI_JASA_DEFAULT
} from '@/services/jasa'

const toast = useToast()
const confirm = useConfirm()
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

const loading = ref(true)
const jasaList = ref([])
const isGudang = ref(true) // default true supaya tombol tidak berkedip sebelum info lokasi termuat

// ── Filter & pencarian (client-side, sama seperti StokObatView/SupplierView) ──
const keyword = ref('')
const filterKategori = ref('')
const filterStatus = ref('0') // '' = semua, '0' = aktif, '1' = diarsipkan

const kategoriList = ref([])
const kategoriOptions = computed(() => {
  const list = kategoriList.value.length ? kategoriList.value.map((k) => k.NAMA_KATEGORI) : KATEGORI_JASA_DEFAULT
  return [{ label: 'Semua kategori', value: '' }, ...list.filter(Boolean).map((k) => ({ label: k, value: k }))]
})
const statusOptions = [
  { label: 'Semua status', value: '' },
  { label: 'Aktif', value: '0' },
  { label: 'Diarsipkan', value: '1' }
]

const jasaTampil = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return jasaList.value.filter((j) => {
    if (filterStatus.value !== '' && String(j.ARSIPKAN) !== filterStatus.value) return false
    if (filterKategori.value && j.KATEGORI !== filterKategori.value) return false
    if (!q) return true
    return [j.NAMA, j.IDBARANG, j.KATEGORI].some((v) => String(v ?? '').toLowerCase().includes(q))
  })
})

const ringkasan = computed(() => [
  { label: 'Total jasa & tindakan', value: jasaList.value.length, icon: 'pi pi-briefcase' },
  { label: 'Ditampilkan', value: jasaTampil.value.length, icon: 'pi pi-eye' },
  { label: 'Diarsipkan', value: jasaList.value.filter((j) => String(j.ARSIPKAN) === '1').length, icon: 'pi pi-inbox' }
])

async function muat() {
  loading.value = true
  try {
    const [info, kategori, daftar] = await Promise.all([getInfoLokasi(), getKategoriJasa(), getDaftarJasa()])
    isGudang.value = !!info?.IS_GUDANG
    kategoriList.value = kategori
    jasaList.value = daftar
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat data jasa', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

// ── Form tambah / edit ───────────────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const errors = ref({})
const editId = ref(null)
const isEdit = computed(() => editId.value !== null)

function emptyForm() {
  return { NAMA: '', KATEGORI: null, SATUAN_KECIL: '', HARGABELI: null, HARGAJUAL: null, CATATAN: '' }
}
const form = ref(emptyForm())

function bukaForm() {
  editId.value = null
  form.value = emptyForm()
  errors.value = {}
  showForm.value = true
}

function bukaEdit(j) {
  editId.value = j.ID
  form.value = {
    NAMA: j.NAMA || '',
    KATEGORI: j.KATEGORI || null,
    SATUAN_KECIL: j.SATUAN_KECIL || '',
    HARGABELI: j.HARGABELI != null ? Number(j.HARGABELI) : null,
    HARGAJUAL: j.HARGAJUAL != null ? Number(j.HARGAJUAL) : null,
    CATATAN: j.CATATAN || ''
  }
  errors.value = {}
  showForm.value = true
}

function clearError(key) {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: '' }
}

function validate() {
  const f = form.value
  const e = {}
  if (!f.NAMA.trim()) e.NAMA = 'Nama jasa/tindakan wajib diisi'
  if (!f.KATEGORI) e.KATEGORI = 'Kategori wajib dipilih'
  if (!f.SATUAN_KECIL.trim()) e.SATUAN_KECIL = 'Satuan wajib diisi'
  if (!f.HARGAJUAL || f.HARGAJUAL <= 0) e.HARGAJUAL = 'Tarif (harga jual) wajib diisi'
  errors.value = e
  return Object.keys(e).length === 0
}

async function simpan() {
  if (!validate()) return
  saving.value = true
  try {
    const f = form.value
    const payload = {
      NAMA: f.NAMA.trim(),
      KATEGORI: f.KATEGORI,
      SATUAN_KECIL: f.SATUAN_KECIL.trim(),
      HARGABELI: f.HARGABELI || 0,
      HARGAJUAL: f.HARGAJUAL || 0,
      CATATAN: f.CATATAN.trim()
    }
    if (isEdit.value) await updateJasa(editId.value, payload)
    else await tambahJasa(payload)

    toast.add({
      severity: 'success',
      summary: isEdit.value ? 'Jasa diperbarui' : 'Jasa ditambahkan',
      detail: f.NAMA,
      life: 3500
    })
    showForm.value = false
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

// ── Arsip / aktifkan / hapus ─────────────────────────────────
const processing = ref(null) // ID yang sedang diproses (arsip/aktif/hapus)

function konfirmasiArsip(j) {
  confirm.require({
    header: 'Arsipkan jasa?',
    message: `"${j.NAMA}" akan disembunyikan dari daftar aktif. Data tetap tersimpan dan bisa diaktifkan kembali.`,
    icon: 'pi pi-inbox',
    acceptLabel: 'Arsipkan',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'warn' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: async () => {
      processing.value = j.ID
      try {
        await arsipkanJasa(j.ID)
        toast.add({ severity: 'success', summary: 'Jasa diarsipkan', detail: j.NAMA, life: 3500 })
        await muat()
      } catch (err) {
        toast.add({ severity: 'error', summary: 'Gagal mengarsipkan', detail: err.message, life: 5000 })
      } finally {
        processing.value = null
      }
    }
  })
}

async function aktifkanKembali(j) {
  processing.value = j.ID
  try {
    await aktifkanJasa(j.ID)
    toast.add({ severity: 'success', summary: 'Jasa diaktifkan', detail: j.NAMA, life: 3500 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mengaktifkan', detail: err.message, life: 5000 })
  } finally {
    processing.value = null
  }
}

function konfirmasiHapus(j) {
  confirm.require({
    header: 'Hapus jasa?',
    message: `"${j.NAMA}" akan dihapus dan tidak dapat dikembalikan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: async () => {
      processing.value = j.ID
      try {
        await hapusJasa(j.ID)
        toast.add({ severity: 'success', summary: 'Jasa dihapus', detail: j.NAMA, life: 3500 })
        await muat()
      } catch (err) {
        toast.add({ severity: 'error', summary: 'Gagal menghapus', detail: err.message, life: 5000 })
      } finally {
        processing.value = null
      }
    }
  })
}

function resetFilter() {
  keyword.value = ''
  filterKategori.value = ''
  filterStatus.value = '0'
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Jasa &amp; Tindakan</h1>
        <p class="page-subtitle">Master tarif layanan, tindakan medis, dan jasa lain di luar obat-obatan.</p>
      </div>
      <Button
        label="Tambah Jasa"
        icon="pi pi-plus"
        :disabled="!isGudang"
        v-tooltip.top="!isGudang ? 'Hanya lokasi gudang induk yang bisa menambah master jasa' : null"
        @click="bukaForm"
      />
    </header>

    <section class="summary" aria-label="Ringkasan jasa & tindakan">
      <div v-for="s in ringkasan" :key="s.label" class="summary__item">
        <i :class="s.icon" class="summary__icon" />
        <div>
          <p class="summary__value">{{ s.value }}</p>
          <p class="summary__label">{{ s.label }}</p>
        </div>
      </div>
    </section>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari nama atau ID jasa..." fluid />
        </IconField>
        <Select v-model="filterKategori" :options="kategoriOptions" optionLabel="label" optionValue="value" placeholder="Kategori" style="min-width: 12rem" />
        <Select v-model="filterStatus" :options="statusOptions" optionLabel="label" optionValue="value" style="min-width: 10rem" />
        <div class="toolbar__right">
          <span class="toolbar__count">{{ jasaTampil.length }} jasa</span>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" v-tooltip.top="'Muat ulang'" @click="muat" />
          <Button icon="pi pi-times" text rounded severity="secondary" aria-label="Reset filter" v-tooltip.top="'Reset filter'" @click="resetFilter" />
        </div>
      </header>

      <DataTable :value="jasaTampil" :loading="loading" dataKey="ID" size="small" stripedRows paginator :rows="15" :rowsPerPageOptions="[15, 30, 50, 100]" scrollable>
        <template #empty>
          <p class="empty">{{ keyword || filterKategori ? 'Tidak ada jasa yang cocok dengan filter.' : 'Belum ada data jasa & tindakan.' }}</p>
        </template>

        <Column header="No." style="width: 4rem">
          <template #body="{ index }">{{ index + 1 }}</template>
        </Column>
        <Column field="IDBARANG" header="ID Jasa" sortable style="min-width: 8rem">
          <template #body="{ data }"><span class="mono">{{ data.IDBARANG }}</span></template>
        </Column>
        <Column field="NAMA" header="Nama" sortable style="min-width: 16rem">
          <template #body="{ data }">
            <div class="nama-cell">
              <strong>{{ data.NAMA }}</strong>
              <Tag v-if="String(data.ARSIPKAN) === '1'" value="Diarsipkan" severity="secondary" />
            </div>
          </template>
        </Column>
        <Column field="KATEGORI" header="Kategori" sortable style="min-width: 10rem">
          <template #body="{ data }">{{ data.KATEGORI || '—' }}</template>
        </Column>
        <Column field="SATUAN_KECIL" header="Satuan" style="min-width: 7rem">
          <template #body="{ data }">{{ data.SATUAN_KECIL || '—' }}</template>
        </Column>
        <Column field="HARGAJUAL" header="Tarif" sortable style="min-width: 9rem; text-align: right">
          <template #body="{ data }"><span class="mono strong">{{ rupiah.format(data.HARGAJUAL || 0) }}</span></template>
        </Column>

        <Column header="Aksi" frozen alignFrozen="right" style="width: 9rem">
          <template #body="{ data }">
            <div class="actions">
              <Button icon="pi pi-pencil" text rounded severity="secondary" size="small" v-tooltip.top="'Edit'" :disabled="!isGudang" @click="bukaEdit(data)" />
              <Button
                v-if="String(data.ARSIPKAN) !== '1'"
                icon="pi pi-inbox"
                text
                rounded
                severity="warn"
                size="small"
                :loading="processing === data.ID"
                v-tooltip.top="'Arsipkan'"
                @click="konfirmasiArsip(data)"
              />
              <Button
                v-else
                icon="pi pi-check-circle"
                text
                rounded
                severity="success"
                size="small"
                :loading="processing === data.ID"
                v-tooltip.top="'Aktifkan'"
                @click="aktifkanKembali(data)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                size="small"
                :loading="processing === data.ID"
                v-tooltip.top="'Hapus'"
                @click="konfirmasiHapus(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Dialog tambah / edit jasa -->
    <Dialog
      v-model:visible="showForm"
      :header="isEdit ? 'Edit jasa & tindakan' : 'Tambah jasa & tindakan'"
      modal
      :closable="!saving"
      :style="{ width: '32rem' }"
      :breakpoints="{ '575px': '96vw' }"
    >
      <form class="form" @submit.prevent="simpan">
        <div class="field field--full">
          <label for="j-nama">Nama jasa/tindakan <span class="req">*</span></label>
          <InputText id="j-nama" v-model="form.NAMA" placeholder="Contoh: Konsultasi Dokter Umum" :invalid="!!errors.NAMA" autofocus fluid @update:modelValue="clearError('NAMA')" />
          <small v-if="errors.NAMA" class="field__error">{{ errors.NAMA }}</small>
        </div>

        <div class="field">
          <label for="j-kategori">Kategori <span class="req">*</span></label>
          <Select
            id="j-kategori"
            v-model="form.KATEGORI"
            :options="kategoriOptions.filter((k) => k.value)"
            optionLabel="label"
            optionValue="value"
            placeholder="Pilih kategori"
            editable
            :invalid="!!errors.KATEGORI"
            fluid
            @change="clearError('KATEGORI')"
          />
          <small v-if="errors.KATEGORI" class="field__error">{{ errors.KATEGORI }}</small>
        </div>

        <div class="field">
          <label for="j-satuan">Satuan <span class="req">*</span></label>
          <InputText id="j-satuan" v-model="form.SATUAN_KECIL" placeholder="Contoh: Kali, Sesi" :invalid="!!errors.SATUAN_KECIL" fluid @update:modelValue="clearError('SATUAN_KECIL')" />
          <small v-if="errors.SATUAN_KECIL" class="field__error">{{ errors.SATUAN_KECIL }}</small>
        </div>

        <div class="field">
          <label for="j-hargabeli">Harga modal <small>(opsional)</small></label>
          <InputNumber id="j-hargabeli" v-model="form.HARGABELI" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" fluid />
        </div>

        <div class="field">
          <label for="j-hargajual">Tarif (harga jual) <span class="req">*</span></label>
          <InputNumber id="j-hargajual" v-model="form.HARGAJUAL" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" :invalid="!!errors.HARGAJUAL" fluid @update:modelValue="clearError('HARGAJUAL')" />
          <small v-if="errors.HARGAJUAL" class="field__error">{{ errors.HARGAJUAL }}</small>
        </div>

        <div class="field field--full">
          <label for="j-catatan">Catatan <small>(opsional)</small></label>
          <Textarea id="j-catatan" v-model="form.CATATAN" rows="2" placeholder="Catatan tambahan" fluid />
        </div>

        <button type="submit" hidden />
      </form>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showForm = false" />
        <Button :label="isEdit ? 'Simpan perubahan' : 'Simpan jasa'" icon="pi pi-save" :loading="saving" @click="simpan" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  margin-bottom: 1.25rem;
}
.summary__item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1.125rem 1.25rem;
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
  font-size: 1.5rem;
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
  gap: 0.625rem;
}
.toolbar__search {
  flex: 1;
  max-width: 22rem;
  min-width: 12rem;
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
  white-space: nowrap;
}

.nama-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.strong {
  font-weight: 700;
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

.form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.25rem;
}
.field {
  display: grid;
  gap: 0.375rem;
  align-content: start;
}
.field--full {
  grid-column: 1 / -1;
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

@media (max-width: 768px) {
  .summary {
    grid-template-columns: 1fr;
  }
  .summary__item + .summary__item {
    border-left: 0;
    border-top: 1px solid var(--app-border);
  }
}
@media (max-width: 575px) {
  .form {
    grid-template-columns: 1fr;
  }
  .toolbar__search {
    max-width: none;
  }
}
</style>
