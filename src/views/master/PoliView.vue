<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getDaftarPoliMaster, simpanPoli, updatePoli, hapusPoli, JENIS_POLI } from '@/services/masterPoli'

const toast = useToast()
const confirm = useConfirm()

// ── Daftar poli ──────────────────────────────────────────────
const poli = ref([])
const loading = ref(false)
const keyword = ref('')

const namaJenis = (jenispoly) => JENIS_POLI.find((j) => j.kode == jenispoly)?.nama || '—'

const poliTampil = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return poli.value
  return poli.value.filter((p) =>
    [p.nama, p.kode, p.KodePoliBPJS, p.kd_poli_antrian, namaJenis(p.jenispoly)]
      .some((v) => String(v ?? '').toLowerCase().includes(q))
  )
})

async function muat() {
  loading.value = true
  try {
    poli.value = await getDaftarPoliMaster()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat poli', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

// ── Form tambah / edit poli ──────────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const errors = ref({})
// ID poli yang sedang diedit; null = tambah baru
const editId = ref(null)
const isEdit = computed(() => editId.value !== null)

function emptyForm() {
  return { nama: '', jenispoly: JENIS_POLI[0], KodePoliBPJS: '', kd_poli_antrian: '', location_id: '' }
}
const form = ref(emptyForm())

function bukaForm() {
  editId.value = null
  form.value = emptyForm()
  errors.value = {}
  showForm.value = true
}

function bukaEdit(p) {
  editId.value = p.ID
  form.value = {
    nama: p.nama || '',
    jenispoly: JENIS_POLI.find((j) => j.kode == p.jenispoly) || JENIS_POLI[0],
    KodePoliBPJS: p.KodePoliBPJS || '',
    kd_poli_antrian: p.kd_poli_antrian || '',
    location_id: p.location_id ? String(p.location_id) : ''
  }
  errors.value = {}
  showForm.value = true
}

// ── Hapus ────────────────────────────────────────────────────
const deleting = ref(null) // ID yang sedang diproses

function konfirmasiHapus(p) {
  confirm.require({
    header: 'Hapus poli?',
    message: `Poli "${p.nama}" tidak akan muncul lagi di daftar poli. Riwayat pendaftaran tetap tersimpan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => hapus(p)
  })
}

async function hapus(p) {
  deleting.value = p.ID
  try {
    const message = await hapusPoli(p.ID)
    toast.add({ severity: 'success', summary: 'Poli dihapus', detail: message, life: 3500 })
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
  if (!f.nama.trim()) e.nama = 'Nama poli wajib diisi'
  if (!f.jenispoly) e.jenispoly = 'Jenis poli wajib dipilih'
  errors.value = e
  return Object.keys(e).length === 0
}

async function simpan() {
  if (!validate()) return
  saving.value = true
  try {
    const f = form.value
    const payload = {
      nama: f.nama.trim(),
      jenispoly: f.jenispoly.kode,
      KodePoliBPJS: f.KodePoliBPJS.trim(),
      kd_poli_antrian: f.kd_poli_antrian.trim(),
      location_id: f.location_id.trim()
    }
    const response = isEdit.value
      ? await updatePoli({ ...payload, ID: editId.value })
      : await simpanPoli(payload)

    console.log('Poli disimpan:', response)
    toast.add({
      severity: 'success',
      summary: isEdit.value ? 'Poli diperbarui' : 'Poli ditambahkan',
      detail: `${f.nama} — ${response.message}`,
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
        <h1 class="page-title">Data poliklinik</h1>
        <p class="page-subtitle">Daftar poli rawat jalan dan ruangan rawat inap di klinik.</p>
      </div>
      <Button label="Tambah poli" icon="pi pi-plus" @click="bukaForm" />
    </header>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari nama, kode, atau kode BPJS" fluid />
        </IconField>
        <div class="toolbar__right">
          <span class="toolbar__count">{{ poliTampil.length }} poli</span>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" v-tooltip.top="'Muat ulang'" @click="muat" />
        </div>
      </header>

      <DataTable
        :value="poliTampil"
        :loading="loading"
        dataKey="ID"
        size="small"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 30, 50]"
        scrollable
      >
        <template #empty>
          <p class="empty">{{ keyword ? 'Tidak ada poli yang cocok.' : 'Belum ada data poli.' }}</p>
        </template>
        <Column header="No." style="width: 4rem">
          <template #body="{ index }">{{ index + 1 }}</template>
        </Column>
        <Column field="nama" header="Nama poli" sortable style="min-width: 14rem">
          <template #body="{ data }">
            <strong>{{ data.nama }}</strong>
          </template>
        </Column>
        <Column field="kode" header="Kode" style="min-width: 6rem">
          <template #body="{ data }"><span class="mono">{{ data.kode || '—' }}</span></template>
        </Column>
        <Column field="jenispoly" header="Jenis" sortable style="min-width: 9rem">
          <template #body="{ data }">
            <Tag :value="namaJenis(data.jenispoly)" :severity="data.jenispoly == 1 ? 'warn' : 'info'" />
          </template>
        </Column>
        <Column field="KodePoliBPJS" header="Kode BPJS" sortable>
          <template #body="{ data }"><span class="mono">{{ data.KodePoliBPJS || '—' }}</span></template>
        </Column>
        <Column field="kd_poli_antrian" header="Kode antrian" style="min-width: 8rem">
          <template #body="{ data }"><span class="mono">{{ data.kd_poli_antrian || '—' }}</span></template>
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
                :aria-label="`Edit ${data.nama}`"
                v-tooltip.top="'Edit'"
                @click="bukaEdit(data)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                size="small"
                :loading="deleting === data.ID"
                :aria-label="`Hapus ${data.nama}`"
                v-tooltip.top="'Hapus'"
                @click="konfirmasiHapus(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Dialog tambah / edit poli -->
    <Dialog
      v-model:visible="showForm"
      :header="isEdit ? 'Edit poli' : 'Tambah poli'"
      modal
      :closable="!saving"
      :style="{ width: '36rem' }"
      :breakpoints="{ '575px': '96vw' }"
    >
      <form class="form" @submit.prevent="simpan">
        <div class="field field--full">
          <label for="p-nama">Nama poli <span class="req">*</span></label>
          <InputText
            id="p-nama"
            v-model="form.nama"
            placeholder="Contoh: Poli Umum"
            :invalid="!!errors.nama"
            autofocus
            fluid
            @update:modelValue="clearError('nama')"
          />
          <small v-if="errors.nama" class="field__error">{{ errors.nama }}</small>
        </div>

        <div class="field field--full">
          <label for="p-jenis">Jenis poli</label>
          <SelectButton
            v-model="form.jenispoly"
            :options="JENIS_POLI"
            optionLabel="nama"
            dataKey="kode"
            :allowEmpty="false"
            aria-labelledby="p-jenis"
          />
        </div>

        <div class="field">
          <label for="p-bpjs">Kode poli BPJS</label>
          <InputText
            id="p-bpjs"
            v-model="form.KodePoliBPJS"
            placeholder="Kode poli dari HFIS (opsional)"
            :invalid="!!errors.KodePoliBPJS"
            fluid
            @update:modelValue="clearError('KodePoliBPJS')"
          />
          <small v-if="errors.KodePoliBPJS" class="field__error">{{ errors.KodePoliBPJS }}</small>
        </div>

        <div class="field">
          <label for="p-antrian">Kode antrian</label>
          <InputText
            id="p-antrian"
            v-model="form.kd_poli_antrian"
            placeholder="Contoh: A (opsional)"
            fluid
          />
        </div>

        <div class="field">
          <label for="p-lokasi">ID lokasi</label>
          <InputText
            id="p-lokasi"
            v-model="form.location_id"
            inputmode="numeric"
            placeholder="ID lokasi/unit (opsional)"
            fluid
          />
        </div>

        <!-- tombol submit tersembunyi agar Enter menyimpan -->
        <button type="submit" hidden />
      </form>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showForm = false" />
        <Button :label="isEdit ? 'Simpan perubahan' : 'Simpan poli'" icon="pi pi-save" :loading="saving" @click="simpan" />
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
