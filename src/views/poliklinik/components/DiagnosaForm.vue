<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { searchDiagnosa } from '@/services/pendaftaran'
import { getDiagnosaKunjungan, simpanDiagnosa, searchProsedur } from '@/services/diagnosa'

const props = defineProps({
  datapasien: { type: Object, required: true }
})

const toast = useToast()

const dxUtama = ref(null) // { icd_code, dx }
const dxSekunder = ref([]) // [{ icd_code, dx } | null]
const opsi = ref([])
const klaimLama = ref(null)
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)

// Hasil cari digabung dengan diagnosa yang sudah terpilih agar pilihan tidak hilang dari daftar
function gabungOpsi(hasil) {
  const map = new Map()
  ;[...hasil, dxUtama.value, ...dxSekunder.value].filter((d) => d?.icd_code).forEach((d) => map.set(d.icd_code, d))
  return Array.from(map.values())
}

let timer = null
function onFilter(event) {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      opsi.value = gabungOpsi(await searchDiagnosa(event.value))
    } catch (err) {
      console.error('Pencarian ICD gagal:', err)
    }
  }, 300)
}

// ── Prosedur / tindakan ICD-9 ────────────────────────────────
const prosedur = ref([]) // [{ kode, proc } | null]
const opsiProsedur = ref([])

function gabungOpsiProsedur(hasil) {
  const map = new Map()
  ;[...hasil, ...prosedur.value].filter((p) => p?.kode).forEach((p) => map.set(p.kode, { ...p, search_key: p.search_key || p.kode.replace('.', '') }))
  return Array.from(map.values())
}

let timerProsedur = null
function onFilterProsedur(event) {
  clearTimeout(timerProsedur)
  timerProsedur = setTimeout(async () => {
    try {
      opsiProsedur.value = gabungOpsiProsedur(await searchProsedur(event.value))
    } catch (err) {
      console.error('Pencarian prosedur gagal:', err)
    }
  }, 300)
}
function tambahProsedur() {
  prosedur.value.push(null)
}
function hapusProsedur(i) {
  prosedur.value.splice(i, 1)
  tandai()
}

function tandai() {
  dirty.value = true
}
function tambah() {
  dxSekunder.value.push(null)
}
function hapus(i) {
  dxSekunder.value.splice(i, 1)
  tandai()
}

async function muat() {
  loading.value = true
  try {
    const k = await getDiagnosaKunjungan(props.datapasien.NOPENDAFTARAN)
    klaimLama.value = k
    dxUtama.value = k?.dx_utama?.icd_code ? k.dx_utama : null
    dxSekunder.value = Array.isArray(k?.dx_sekunder) ? k.dx_sekunder.filter(Boolean) : []
    opsi.value = gabungOpsi([])
    prosedur.value = Array.isArray(k?.prosedur) ? k.prosedur.filter(Boolean) : []
    opsiProsedur.value = gabungOpsiProsedur([])
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat diagnosa', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

async function simpan() {
  if (!dxUtama.value) {
    toast.add({ severity: 'warn', summary: 'Perhatian', detail: 'Diagnosa utama wajib diisi', life: 3000 })
    return
  }
  saving.value = true
  try {
    // Buang sekunder kosong & yang sama dengan diagnosa lain
    const dilihat = new Set([dxUtama.value.icd_code])
    const sekunder = dxSekunder.value.filter((d) => d?.icd_code && !dilihat.has(d.icd_code) && dilihat.add(d.icd_code))
    const kodeProsedur = new Set()
    const daftarProsedur = prosedur.value.filter((p) => p?.kode && !kodeProsedur.has(p.kode) && kodeProsedur.add(p.kode))
    await simpanDiagnosa(props.datapasien, dxUtama.value, sekunder, daftarProsedur, klaimLama.value)
    dxSekunder.value = sekunder
    prosedur.value = daftarProsedur
    dirty.value = false
    toast.add({ severity: 'success', summary: 'Berhasil', detail: 'Diagnosa tersimpan', life: 3000 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

onMounted(muat)
defineExpose({ dirty })
</script>

<template>
  <div class="dx">
    <section class="panel">
      <header class="panel__header">
        <h2 class="panel__title"><i class="pi pi-bookmark-fill panel__icon" />Diagnosa &amp; Tindakan (ICD)</h2>
      </header>

      <div v-if="loading" class="dx__info"><i class="pi pi-spin pi-spinner" /> Memuat diagnosa…</div>
      <template v-else>
        <div class="field">
          <label>Diagnosa utama <span class="req">*</span></label>
          <div class="dx__row">
            <Select
              v-model="dxUtama"
              :options="opsi"
              optionLabel="dx"
              dataKey="icd_code"
              filter
              showClear
              :filterPlaceholder="'Ketik kode / nama diagnosa…'"
              placeholder="Pilih diagnosa utama"
              appendTo="body"
              fluid
              @filter="onFilter"
              @update:modelValue="tandai"
            />
            <Tag v-if="dxUtama" :value="dxUtama.icd_code" severity="success" />
          </div>
        </div>

        <div class="field">
          <div class="dx__label-row">
            <label>Diagnosa sekunder</label>
            <Button label="Tambah" icon="pi pi-plus" size="small" text severity="success" @click="tambah" />
          </div>
          <p v-if="!dxSekunder.length" class="dx__info">Belum ada. Klik Tambah.</p>
          <div v-for="(_, i) in dxSekunder" :key="i" class="dx__row">
            <Select
              v-model="dxSekunder[i]"
              :options="opsi"
              optionLabel="dx"
              dataKey="icd_code"
              filter
              showClear
              :placeholder="`Sekunder ${i + 1}`"
              appendTo="body"
              fluid
              @filter="onFilter"
              @update:modelValue="tandai"
            />
            <Tag v-if="dxSekunder[i]" :value="dxSekunder[i].icd_code" severity="secondary" />
            <Button icon="pi pi-trash" size="small" text severity="danger" @click="hapus(i)" />
          </div>
        </div>

        <div class="field">
          <div class="dx__label-row">
            <label>Tindakan / prosedur (ICD-9-CM)</label>
            <Button label="Tambah" icon="pi pi-plus" size="small" text severity="info" @click="tambahProsedur" />
          </div>
          <p v-if="!prosedur.length" class="dx__info">Belum ada. Klik Tambah.</p>
          <div v-for="(_, i) in prosedur" :key="i" class="dx__row">
            <Select
              v-model="prosedur[i]"
              :options="opsiProsedur"
              optionLabel="proc"
              dataKey="kode"
              :filterFields="['kode', 'proc', 'search_key']"
              filter
              showClear
              :placeholder="`Ketik nama / kode prosedur ${i + 1}…`"
              appendTo="body"
              fluid
              @filter="onFilterProsedur"
              @update:modelValue="tandai"
            />
            <Tag v-if="prosedur[i]" :value="prosedur[i].kode" severity="info" />
            <Button icon="pi pi-trash" size="small" text severity="danger" @click="hapusProsedur(i)" />
          </div>
        </div>

        <div class="dx__actions">
          <Button label="Simpan diagnosa" icon="pi pi-save" :loading="saving" :disabled="!dirty" @click="simpan" />
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.dx__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.375rem;
}
.dx__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dx__info {
  margin: 0.25rem 0;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.dx__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}
.req {
  color: var(--p-red-500, #ef4444);
}
</style>
