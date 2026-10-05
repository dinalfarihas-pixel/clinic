<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getDaftarDokter, simpanDokter, updateDokter, nonaktifkanDokter, PROFESI } from '@/services/dokter'
import { getPoli } from '@/services/pendaftaran'

const toast = useToast()
const confirm = useConfirm()

// ── Daftar dokter ────────────────────────────────────────────
const dokter = ref([])
const poli = ref([])
const loading = ref(false)
const keyword = ref('')

// Nama poli berdasarkan kode poli BPJS (m_poly.KodePoliBPJS)
const namaPoli = computed(() => Object.fromEntries(poli.value.map((p) => [p.KodePoliBPJS, p.nama])))

const dokterTampil = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return dokter.value
  return dokter.value.filter((d) =>
    [d.NAMADOKTER, d.NIK, d.KODE_DOKTER_BPJS, d.NAMAPROFESI, namaPoli.value[d.KDPOLY_BPJS]]
      .some((v) => String(v ?? '').toLowerCase().includes(q))
  )
})

async function muat() {
  loading.value = true
  const [d, p] = await Promise.allSettled([getDaftarDokter(), getPoli()])
  if (d.status === 'fulfilled') dokter.value = d.value
  else toast.add({ severity: 'error', summary: 'Gagal memuat dokter', detail: d.reason?.message, life: 5000 })
  if (p.status === 'fulfilled') poli.value = p.value
  else toast.add({ severity: 'error', summary: 'Gagal memuat poli', detail: p.reason?.message, life: 5000 })
  loading.value = false
}

// ── Form tambah / edit dokter ────────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const errors = ref({})
// KDDOKTER dokter yang sedang diedit; null = tambah baru
const editKode = ref(null)
const isEdit = computed(() => editKode.value !== null)

function emptyForm() {
  return { NAMADOKTER: '', NIK: '', KODE_DOKTER_BPJS: '', poli: null, profesi: PROFESI[0], NAMAPROFESI: '' }
}
const form = ref(emptyForm())

function bukaForm() {
  editKode.value = null
  form.value = emptyForm()
  errors.value = {}
  showForm.value = true
}

function bukaEdit(d) {
  editKode.value = d.KDDOKTER
  form.value = {
    NAMADOKTER: d.NAMADOKTER || '',
    NIK: d.NIK || '',
    KODE_DOKTER_BPJS: d.KODE_DOKTER_BPJS ? String(d.KODE_DOKTER_BPJS) : '',
    // Cocokkan poli lewat KDPOLY, lalu kode poli BPJS (data lama KDPOLY-nya berisi KDDOKTER)
    poli: poli.value.find((p) => p.kode == d.KDPOLY) || poli.value.find((p) => p.KodePoliBPJS === d.KDPOLY_BPJS) || null,
    profesi: PROFESI.find((p) => p.kode == d.KDPROFESI) || PROFESI[0],
    NAMAPROFESI: d.NAMAPROFESI || ''
  }
  errors.value = {}
  showForm.value = true
}

// ── Nonaktifkan ──────────────────────────────────────────────
const deactivating = ref(null) // KDDOKTER yang sedang diproses

function konfirmasiNonaktif(d) {
  confirm.require({
    header: 'Nonaktifkan dokter?',
    message: `${d.NAMADOKTER} tidak akan muncul lagi di daftar dokter dan pilihan pendaftaran. Riwayat kunjungan tetap tersimpan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Nonaktifkan',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => nonaktifkan(d)
  })
}

async function nonaktifkan(d) {
  deactivating.value = d.KDDOKTER
  try {
    const message = await nonaktifkanDokter(d.KDDOKTER)
    toast.add({ severity: 'success', summary: 'Dokter dinonaktifkan', detail: message, life: 3500 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menonaktifkan', detail: err.message, life: 5000 })
  } finally {
    deactivating.value = null
  }
}

// Nama profesi/spesialisasi diisi otomatis dari poli bila masih kosong
function onPilihPoli() {
  clearError('poli')
  if (!form.value.NAMAPROFESI && form.value.poli) form.value.NAMAPROFESI = form.value.poli.nama
}

function clearError(key) {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: '' }
}

function validate() {
  const f = form.value
  const e = {}
  if (!f.NAMADOKTER.trim()) e.NAMADOKTER = 'Nama dokter wajib diisi'
  if (!f.NIK.trim()) e.NIK = 'NIK wajib diisi'
  else if (!/^\d{16}$/.test(f.NIK.trim())) e.NIK = 'NIK harus 16 digit angka'
  const kode = f.KODE_DOKTER_BPJS.trim()
  // Opsional; bila diisi tidak boleh sama dengan dokter lain (dokter yang diedit dikecualikan)
  if (kode && dokter.value.some((d) => String(d.KODE_DOKTER_BPJS) === kode && d.KDDOKTER != editKode.value)) {
    e.KODE_DOKTER_BPJS = 'Kode ini sudah dipakai dokter lain'
  }
  if (!f.poli) e.poli = 'Poli wajib dipilih'
  if (!f.NAMAPROFESI.trim()) e.NAMAPROFESI = 'Nama profesi/spesialisasi wajib diisi'
  errors.value = e
  return Object.keys(e).length === 0
}

async function simpan() {
  if (!validate()) return
  saving.value = true
  try {
    const f = form.value
    const payload = {
      NAMADOKTER: f.NAMADOKTER.trim(),
      NIK: f.NIK.trim(),
      KODE_DOKTER_BPJS: f.KODE_DOKTER_BPJS.trim(),
      KDPOLY: f.poli.kode,
      KDPOLY_BPJS: f.poli.KodePoliBPJS,
      KDPROFESI: f.profesi.kode,
      NAMAPROFESI: f.NAMAPROFESI.trim()
    }
    const response = isEdit.value
      ? await updateDokter({ ...payload, KDDOKTER: editKode.value })
      : await simpanDokter(payload)

    console.log('Dokter disimpan:', response)
    toast.add({
      severity: 'success',
      summary: isEdit.value ? 'Dokter diperbarui' : 'Dokter ditambahkan',
      detail: `${f.NAMADOKTER} — ${response.message}`,
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
        <h1 class="page-title">Data dokter</h1>
        <p class="page-subtitle">Daftar dokter aktif yang praktik di klinik.</p>
      </div>
      <Button label="Tambah dokter" icon="pi pi-plus" @click="bukaForm" />
    </header>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari nama, NIK, kode BPJS, atau poli" fluid />
        </IconField>
        <div class="toolbar__right">
          <span class="toolbar__count">{{ dokterTampil.length }} dokter</span>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" v-tooltip.top="'Muat ulang'" @click="muat" />
        </div>
      </header>

      <DataTable
        :value="dokterTampil"
        :loading="loading"
        dataKey="KDDOKTER"
        size="small"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 30, 50]"
        scrollable
      >
        <template #empty>
          <p class="empty">{{ keyword ? 'Tidak ada dokter yang cocok.' : 'Belum ada data dokter.' }}</p>
        </template>
        <Column header="No." style="width: 4rem">
          <template #body="{ index }">{{ index + 1 }}</template>
        </Column>
        <Column field="NAMADOKTER" header="Nama dokter" sortable style="min-width: 14rem">
          <template #body="{ data }">
            <strong>{{ data.NAMADOKTER }}</strong>
          </template>
        </Column>
        <Column field="NIK" header="NIK" style="min-width: 10rem">
          <template #body="{ data }"><span class="mono">{{ data.NIK || '—' }}</span></template>
        </Column>
        <Column field="KODE_DOKTER_BPJS" header="Kode BPJS" sortable>
          <template #body="{ data }"><span class="mono">{{ data.KODE_DOKTER_BPJS || '—' }}</span></template>
        </Column>
        <Column field="KDPOLY_BPJS" header="Poli" sortable style="min-width: 10rem">
          <template #body="{ data }">
            {{ namaPoli[data.KDPOLY_BPJS] || data.KDPOLY_BPJS || '—' }}
          </template>
        </Column>
        <Column field="NAMAPROFESI" header="Profesi / spesialisasi" sortable style="min-width: 12rem">
          <template #body="{ data }">
            {{ data.NAMAPROFESI || '—' }}
            <Tag v-if="data.SUB_SP" :value="data.SUB_SP" severity="secondary" class="sub-sp" />
          </template>
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
                :aria-label="`Edit ${data.NAMADOKTER}`"
                v-tooltip.top="'Edit'"
                @click="bukaEdit(data)"
              />
              <Button
                icon="pi pi-ban"
                text
                rounded
                severity="danger"
                size="small"
                :loading="deactivating === data.KDDOKTER"
                :aria-label="`Nonaktifkan ${data.NAMADOKTER}`"
                v-tooltip.top="'Nonaktifkan'"
                @click="konfirmasiNonaktif(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Dialog tambah / edit dokter -->
    <Dialog
      v-model:visible="showForm"
      :header="isEdit ? 'Edit dokter' : 'Tambah dokter'"
      modal
      :closable="!saving"
      :style="{ width: '40rem' }"
      :breakpoints="{ '575px': '96vw' }"
    >
      <form class="form" @submit.prevent="simpan">
        <div class="field field--full">
          <label for="d-nama">Nama dokter <span class="req">*</span></label>
          <InputText
            id="d-nama"
            v-model="form.NAMADOKTER"
            placeholder="Contoh: dr. Aulia Rahman, Sp.PD"
            :invalid="!!errors.NAMADOKTER"
            autofocus
            fluid
            @update:modelValue="clearError('NAMADOKTER')"
          />
          <small v-if="errors.NAMADOKTER" class="field__error">{{ errors.NAMADOKTER }}</small>
        </div>

        <div class="field">
          <label for="d-nik">NIK <span class="req">*</span></label>
          <InputText
            id="d-nik"
            v-model="form.NIK"
            maxlength="16"
            inputmode="numeric"
            placeholder="16 digit"
            :invalid="!!errors.NIK"
            fluid
            @update:modelValue="clearError('NIK')"
          />
          <small v-if="errors.NIK" class="field__error">{{ errors.NIK }}</small>
        </div>

        <div class="field">
          <label for="d-kode">Kode dokter BPJS</label>
          <InputText
            id="d-kode"
            v-model="form.KODE_DOKTER_BPJS"
            inputmode="numeric"
            placeholder="Kode DPJP dari HFIS (opsional)"
            :invalid="!!errors.KODE_DOKTER_BPJS"
            fluid
            @update:modelValue="clearError('KODE_DOKTER_BPJS')"
          />
          <small v-if="errors.KODE_DOKTER_BPJS" class="field__error">{{ errors.KODE_DOKTER_BPJS }}</small>
        </div>

        <div class="field">
          <label for="d-poli">Poli <span class="req">*</span></label>
          <Select
            v-model="form.poli"
            inputId="d-poli"
            :options="poli"
            optionLabel="nama"
            placeholder="Pilih poli"
            filter
            :invalid="!!errors.poli"
            fluid
            @change="onPilihPoli"
          >
            <template #option="{ option }">
              <span>{{ option.nama }}</span>
              <small class="opt-code">{{ option.KodePoliBPJS }}</small>
            </template>
          </Select>
          <small v-if="errors.poli" class="field__error">{{ errors.poli }}</small>
        </div>

        <div class="field">
          <label for="d-profesi">Jenis dokter</label>
          <SelectButton
            v-model="form.profesi"
            :options="PROFESI"
            optionLabel="nama"
            dataKey="kode"
            :allowEmpty="false"
            aria-labelledby="d-profesi"
          />
        </div>

        <div class="field field--full">
          <label for="d-namaprofesi">Nama profesi / spesialisasi <span class="req">*</span></label>
          <InputText
            id="d-namaprofesi"
            v-model="form.NAMAPROFESI"
            placeholder="Contoh: Poli Umum, Spesialis Penyakit Dalam"
            :invalid="!!errors.NAMAPROFESI"
            fluid
            @update:modelValue="clearError('NAMAPROFESI')"
          />
          <small v-if="errors.NAMAPROFESI" class="field__error">{{ errors.NAMAPROFESI }}</small>
        </div>

        <!-- tombol submit tersembunyi agar Enter menyimpan -->
        <button type="submit" hidden />
      </form>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showForm = false" />
        <Button :label="isEdit ? 'Simpan perubahan' : 'Simpan dokter'" icon="pi pi-save" :loading="saving" @click="simpan" />
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
.sub-sp {
  margin-left: 0.375rem;
  font-size: 0.75rem;
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
.opt-code {
  margin-left: auto;
  padding-left: 1rem;
  color: var(--app-text-muted);
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
