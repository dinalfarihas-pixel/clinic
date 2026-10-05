<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getDaftarSupplier, simpanSupplier, updateSupplier, hapusSupplier } from '@/services/supplier'

const toast = useToast()
const confirm = useConfirm()

// ── Daftar supplier ──────────────────────────────────────────
const supplier = ref([])
const loading = ref(false)
const keyword = ref('')

const supplierTampil = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return supplier.value
  return supplier.value.filter((s) =>
    [s.NAMASUPLIER, s.KOTA, s.ALAMAT, s.NOHP].some((v) => String(v ?? '').toLowerCase().includes(q))
  )
})

async function muat() {
  loading.value = true
  try {
    supplier.value = await getDaftarSupplier()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat supplier', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

// ── Form tambah / edit supplier ──────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const errors = ref({})
// IDSUPLIER supplier yang sedang diedit; null = tambah baru
const editId = ref(null)
const isEdit = computed(() => editId.value !== null)

function emptyForm() {
  return { NAMASUPLIER: '', ALAMAT: '', KOTA: '', NOHP: '', CATATAN: '' }
}
const form = ref(emptyForm())

function bukaForm() {
  editId.value = null
  form.value = emptyForm()
  errors.value = {}
  showForm.value = true
}

function bukaEdit(s) {
  editId.value = s.IDSUPLIER
  form.value = {
    NAMASUPLIER: s.NAMASUPLIER || '',
    ALAMAT: s.ALAMAT || '',
    KOTA: s.KOTA || '',
    NOHP: s.NOHP ? String(s.NOHP) : '',
    CATATAN: s.CATATAN || ''
  }
  errors.value = {}
  showForm.value = true
}

// ── Hapus ────────────────────────────────────────────────────
const deleting = ref(null) // IDSUPLIER yang sedang diproses

function konfirmasiHapus(s) {
  confirm.require({
    header: 'Hapus supplier?',
    message: `Data supplier "${s.NAMASUPLIER}" akan dihapus dan tidak dapat dikembalikan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => hapus(s)
  })
}

async function hapus(s) {
  deleting.value = s.IDSUPLIER
  try {
    await hapusSupplier(s.IDSUPLIER)
    toast.add({ severity: 'success', summary: 'Supplier dihapus', detail: s.NAMASUPLIER, life: 3500 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menghapus', detail: err.message, life: 5000 })
  } finally {
    deleting.value = null
  }
}

function clearError(key) {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: '' }
}

function validate() {
  const f = form.value
  const e = {}
  if (!f.NAMASUPLIER.trim()) e.NAMASUPLIER = 'Nama supplier wajib diisi'
  if (!f.ALAMAT.trim()) e.ALAMAT = 'Alamat wajib diisi'
  if (!f.KOTA.trim()) e.KOTA = 'Kota wajib diisi'
  const nohp = f.NOHP.trim()
  if (!nohp) e.NOHP = 'No. HP wajib diisi'
  else if (!/^\d{7,20}$/.test(nohp)) e.NOHP = 'No. HP harus 7-20 digit angka'
  errors.value = e
  return Object.keys(e).length === 0
}

function hanyaAngka() {
  form.value.NOHP = form.value.NOHP.replace(/[^\d]/g, '')
}

async function simpan() {
  if (!validate()) return
  saving.value = true
  try {
    const f = form.value
    const payload = {
      NAMASUPLIER: f.NAMASUPLIER.trim(),
      ALAMAT: f.ALAMAT.trim(),
      KOTA: f.KOTA.trim(),
      NOHP: f.NOHP.trim(),
      CATATAN: f.CATATAN.trim()
    }
    if (isEdit.value) await updateSupplier({ ...payload, IDSUPLIER: editId.value })
    else await simpanSupplier(payload)

    toast.add({
      severity: 'success',
      summary: isEdit.value ? 'Supplier diperbarui' : 'Supplier ditambahkan',
      detail: f.NAMASUPLIER,
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

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Data supplier</h1>
        <p class="page-subtitle">Daftar supplier untuk pengadaan obat dan alat kesehatan.</p>
      </div>
      <Button label="Tambah supplier" icon="pi pi-plus" @click="bukaForm" />
    </header>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari nama, kota, alamat, atau no. HP" fluid />
        </IconField>
        <div class="toolbar__right">
          <span class="toolbar__count">{{ supplierTampil.length }} supplier</span>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" v-tooltip.top="'Muat ulang'" @click="muat" />
        </div>
      </header>

      <DataTable
        :value="supplierTampil"
        :loading="loading"
        dataKey="IDSUPLIER"
        size="small"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 30, 50]"
        scrollable
      >
        <template #empty>
          <p class="empty">{{ keyword ? 'Tidak ada supplier yang cocok.' : 'Belum ada data supplier.' }}</p>
        </template>
        <Column header="No." style="width: 4rem">
          <template #body="{ index }">{{ index + 1 }}</template>
        </Column>
        <Column field="NAMASUPLIER" header="Nama supplier" sortable style="min-width: 14rem">
          <template #body="{ data }">
            <strong>{{ data.NAMASUPLIER }}</strong>
          </template>
        </Column>
        <Column field="KOTA" header="Kota" sortable style="min-width: 10rem">
          <template #body="{ data }">{{ data.KOTA || '—' }}</template>
        </Column>
        <Column field="ALAMAT" header="Alamat" style="min-width: 16rem">
          <template #body="{ data }">
            <span :title="data.ALAMAT">{{ data.ALAMAT || '—' }}</span>
          </template>
        </Column>
        <Column field="NOHP" header="No. HP" style="min-width: 9rem">
          <template #body="{ data }"><span class="mono">{{ data.NOHP || '—' }}</span></template>
        </Column>
        <Column header="Aksi" frozen alignFrozen="right" style="width: 6.5rem">
          <template #body="{ data }">
            <div class="actions">
              <Button
                icon="pi pi-pencil"
                text
                rounded
                severity="secondary"
                size="small"
                :aria-label="`Edit ${data.NAMASUPLIER}`"
                v-tooltip.top="'Edit'"
                @click="bukaEdit(data)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                size="small"
                :loading="deleting === data.IDSUPLIER"
                :aria-label="`Hapus ${data.NAMASUPLIER}`"
                v-tooltip.top="'Hapus'"
                @click="konfirmasiHapus(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Dialog tambah / edit supplier -->
    <Dialog
      v-model:visible="showForm"
      :header="isEdit ? 'Edit supplier' : 'Tambah supplier'"
      modal
      :closable="!saving"
      :style="{ width: '36rem' }"
      :breakpoints="{ '575px': '96vw' }"
    >
      <form class="form" @submit.prevent="simpan">
        <div class="field field--full">
          <label for="s-nama">Nama supplier <span class="req">*</span></label>
          <InputText
            id="s-nama"
            v-model="form.NAMASUPLIER"
            placeholder="Contoh: PT Kimia Farma Trading"
            :invalid="!!errors.NAMASUPLIER"
            autofocus
            fluid
            @update:modelValue="clearError('NAMASUPLIER')"
          />
          <small v-if="errors.NAMASUPLIER" class="field__error">{{ errors.NAMASUPLIER }}</small>
        </div>

        <div class="field field--full">
          <label for="s-alamat">Alamat <span class="req">*</span></label>
          <InputText
            id="s-alamat"
            v-model="form.ALAMAT"
            placeholder="Alamat lengkap supplier"
            :invalid="!!errors.ALAMAT"
            fluid
            @update:modelValue="clearError('ALAMAT')"
          />
          <small v-if="errors.ALAMAT" class="field__error">{{ errors.ALAMAT }}</small>
        </div>

        <div class="field">
          <label for="s-kota">Kota <span class="req">*</span></label>
          <InputText
            id="s-kota"
            v-model="form.KOTA"
            placeholder="Contoh: Jakarta"
            :invalid="!!errors.KOTA"
            fluid
            @update:modelValue="clearError('KOTA')"
          />
          <small v-if="errors.KOTA" class="field__error">{{ errors.KOTA }}</small>
        </div>

        <div class="field">
          <label for="s-nohp">No. HP <span class="req">*</span></label>
          <InputText
            id="s-nohp"
            v-model="form.NOHP"
            inputmode="numeric"
            placeholder="Contoh: 081234567890"
            :invalid="!!errors.NOHP"
            fluid
            @update:modelValue="clearError('NOHP')"
            @input="hanyaAngka"
          />
          <small v-if="errors.NOHP" class="field__error">{{ errors.NOHP }}</small>
        </div>

        <div class="field field--full">
          <label for="s-catatan">Catatan</label>
          <Textarea id="s-catatan" v-model="form.CATATAN" rows="3" placeholder="Catatan tambahan (opsional)" fluid />
        </div>

        <!-- tombol submit tersembunyi agar Enter menyimpan -->
        <button type="submit" hidden />
      </form>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showForm = false" />
        <Button :label="isEdit ? 'Simpan perubahan' : 'Simpan supplier'" icon="pi pi-save" :loading="saving" @click="simpan" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.toolbar {
  flex-wrap: wrap;
}
.toolbar__search {
  flex: 1;
  max-width: 26rem;
  min-width: 14rem;
}
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
.field__error {
  color: var(--p-red-500);
  font-size: 0.8125rem;
}
.req {
  color: var(--p-red-500);
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
