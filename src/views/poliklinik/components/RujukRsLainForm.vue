<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { searchDiagnosa } from '@/services/pendaftaran'
import { toYmd } from '@/utils/tanggal'
import { TIPE_RUJUKAN, simpanRujukanNonBpjs, cariFaskesRujukan, getSpesialistikRujukan, buatRujukan, getUrlCetakRujukan } from '@/services/rujukan'

const props = defineProps({
  // Hasil getPendaftaran(). Ada NOSEP: rujukan BPJS (createRujukan). Tanpa NOSEP (non-BPJS): surat rujukan
  // dicetak langsung dengan faskes tujuan yang diketik manual
  kunjungan: { type: Object, required: true }
})

const toast = useToast()
const router = useRouter()
const bpjs = computed(() => !!props.kunjungan.NOSEP)

function emptyForm() {
  return {
    tanggalRujuk: new Date(),
    tanggalKunjungan: new Date(),
    tipe: '0',
    diagnosa: null,
    faskes: null,
    spesialis: null,
    faskesNama: '',
    poliTujuan: '',
    catatan: ''
  }
}
const form = ref(emptyForm())
const errors = ref({})

const listDiagnosa = ref([])
const listFaskes = ref([])
const listSpesialis = ref([])
const loadingDiagnosa = ref(false)
const loadingFaskes = ref(false)
const loadingSpesialis = ref(false)

function clearError(key) {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: '' }
}

function debounce(fn, ms) {
  let t
  const run = (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
  run.cancel = () => clearTimeout(t)
  return run
}

const onFilterDiagnosa = debounce(async (e) => {
  loadingDiagnosa.value = true
  try {
    listDiagnosa.value = await searchDiagnosa(e.value)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mencari diagnosa', detail: err.message, life: 4000 })
  } finally {
    loadingDiagnosa.value = false
  }
}, 300)

const onFilterFaskes = debounce(async (e) => {
  loadingFaskes.value = true
  try {
    listFaskes.value = await cariFaskesRujukan(e.value)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mencari faskes', detail: err.message, life: 4000 })
  } finally {
    loadingFaskes.value = false
  }
}, 300)

// Spesialistik dimuat ulang saat faskes atau tanggal rencana kunjungan berubah
async function muatSpesialis() {
  form.value.spesialis = null
  listSpesialis.value = []
  if (!form.value.faskes || !form.value.tanggalKunjungan) return
  loadingSpesialis.value = true
  try {
    listSpesialis.value = await getSpesialistikRujukan(form.value.faskes.kode, form.value.tanggalKunjungan)
    if (!listSpesialis.value.length) {
      toast.add({ severity: 'warn', summary: 'Spesialistik', detail: 'Tidak ada spesialistik tersedia di faskes ini pada tanggal tersebut.', life: 4000 })
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat spesialistik', detail: err.message, life: 4000 })
  } finally {
    loadingSpesialis.value = false
  }
}
watch(() => form.value.faskes, muatSpesialis)
watch(() => form.value.tanggalKunjungan, muatSpesialis)

const labelFaskes = (f) => (f ? `[${f.kode}] ${f.nama}` : '')
const labelSpesialis = (s) => (s ? `[${s.kodeSpesialis}] ${s.namaSpesialis} (${s.jumlahRujukan}/${s.kapasitas})` : '')

function validate() {
  const f = form.value
  const e = {}
  if (!f.tanggalRujuk) e.tanggalRujuk = 'Tanggal rujuk wajib diisi'
  if (!f.diagnosa) e.diagnosa = 'Diagnosa wajib dipilih'
  if (bpjs.value) {
    if (!f.tanggalKunjungan) e.tanggalKunjungan = 'Tanggal rencana kunjungan wajib diisi'
    if (!f.faskes) e.faskes = 'Faskes tujuan wajib dipilih'
    if (!f.spesialis) e.spesialis = 'Spesialistik wajib dipilih'
  } else if (!f.faskesNama.trim()) {
    e.faskesNama = 'Faskes / RS tujuan wajib diisi'
  }
  errors.value = e
  return Object.keys(e).length === 0
}

// Non-BPJS: rujukan disimpan ke cnd_rujukan (tanpa BPJS), lalu surat dicetak dari data isian ini
function bukaSuratRujukan(noRujukan) {
  const f = form.value
  const { href } = router.resolve({
    name: 'cetak-rujukan',
    params: { noreg: props.kunjungan.NOPENDAFTARAN },
    query: {
      print: '1',
      no: noRujukan,
      tujuan: f.faskesNama.trim(),
      poli: f.poliTujuan.trim(),
      dx: `${f.diagnosa.icd_code} — ${f.diagnosa.dx}`,
      alasan: f.catatan.trim(),
      tgl: toYmd(f.tanggalRujuk)
    }
  })
  window.open(href, '_blank')
  toast.add({ severity: 'success', summary: 'Surat rujukan dibuat', detail: f.faskesNama.trim(), life: 4000 })
}

/**
 * Buat rujukan BPJS lalu buka surat rujukan untuk dicetak.
 * Mengembalikan true bila rujukan berhasil dibuat (dipanggil dari tombol Simpan tab Tindak Lanjut).
 */
async function submit() {
  if (!validate()) {
    toast.add({ severity: 'warn', summary: 'Data rujukan belum lengkap', detail: 'Periksa kembali isian yang ditandai.', life: 3500 })
    return false
  }
  if (!bpjs.value) {
    try {
      const noRujukan = await simpanRujukanNonBpjs(props.kunjungan, form.value)
      bukaSuratRujukan(noRujukan)
      form.value = emptyForm()
      return true
    } catch (err) {
      toast.add({ severity: 'error', summary: 'Gagal menyimpan rujukan', detail: err.message, life: 5000 })
      return false
    }
  }
  try {
    const rujukan = await buatRujukan(props.kunjungan, form.value)
    toast.add({ severity: 'success', summary: 'Rujukan dibuat', detail: `No. rujukan ${rujukan.noRujukan}`, life: 4000 })
    // Cetak boleh gagal tanpa membatalkan rujukan yang sudah terbit
    getUrlCetakRujukan({ noRujukan: rujukan.noRujukan, noKartu: rujukan.peserta?.noKartu })
      .then((url) => window.open(url, '_blank'))
      .catch((err) => toast.add({ severity: 'warn', summary: 'Surat rujukan belum bisa dicetak', detail: err.message, life: 5000 }))
    form.value = emptyForm()
    return true
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membuat rujukan', detail: err.message, life: 5000 })
    return false
  }
}

defineExpose({ submit })

onBeforeUnmount(() => {
  onFilterDiagnosa.cancel()
  onFilterFaskes.cancel()
})
</script>

<template>
  <div class="rujuk">
    <div class="rujuk__grid">
      <div class="field">
        <label for="rj-tgl">Tanggal rujuk <span class="req">*</span></label>
        <DatePicker
          v-model="form.tanggalRujuk"
          inputId="rj-tgl"
          dateFormat="dd/mm/yy"
          showIcon
          iconDisplay="input"
          :invalid="!!errors.tanggalRujuk"
          fluid
          @update:modelValue="clearError('tanggalRujuk')"
        />
        <small v-if="errors.tanggalRujuk" class="field__error">{{ errors.tanggalRujuk }}</small>
      </div>

      <div v-if="bpjs" class="field">
        <label for="rj-kunjungan">Tanggal rencana kunjungan <span class="req">*</span></label>
        <DatePicker
          v-model="form.tanggalKunjungan"
          inputId="rj-kunjungan"
          dateFormat="dd/mm/yy"
          showIcon
          iconDisplay="input"
          :minDate="new Date()"
          :invalid="!!errors.tanggalKunjungan"
          fluid
          @update:modelValue="clearError('tanggalKunjungan')"
        />
        <small v-if="errors.tanggalKunjungan" class="field__error">{{ errors.tanggalKunjungan }}</small>
      </div>

      <div v-if="bpjs" class="field field--full">
        <span class="label">Tipe rujukan <span class="req">*</span></span>
        <div class="radios">
          <label v-for="t in TIPE_RUJUKAN" :key="t.kode" :for="`rj-tipe-${t.kode}`" class="radio">
            <RadioButton v-model="form.tipe" :inputId="`rj-tipe-${t.kode}`" name="tipe-rujukan" :value="t.kode" />
            <span>{{ t.label }}</span>
          </label>
        </div>
      </div>

      <div class="field field--full">
        <label for="rj-dx">Diagnosa <span class="req">*</span></label>
        <Select
          v-model="form.diagnosa"
          inputId="rj-dx"
          :options="listDiagnosa"
          optionLabel="dx"
          filter
          showClear
          :loading="loadingDiagnosa"
          placeholder="Ketik minimal 2 karakter kode atau nama diagnosa"
          emptyFilterMessage="Ketik minimal 2 karakter untuk mencari"
          :invalid="!!errors.diagnosa"
          fluid
          @filter="onFilterDiagnosa"
          @change="clearError('diagnosa')"
        >
          <template #option="{ option }">
            <span><strong>{{ option.icd_code }}</strong> — {{ option.dx }}</span>
          </template>
        </Select>
        <small v-if="errors.diagnosa" class="field__error">{{ errors.diagnosa }}</small>
      </div>

      <template v-if="!bpjs">
        <div class="field">
          <label for="rj-faskes-nama">Faskes / RS tujuan <span class="req">*</span></label>
          <InputText
            id="rj-faskes-nama"
            v-model="form.faskesNama"
            placeholder="Nama rumah sakit atau faskes tujuan"
            :invalid="!!errors.faskesNama"
            fluid
            @update:modelValue="clearError('faskesNama')"
          />
          <small v-if="errors.faskesNama" class="field__error">{{ errors.faskesNama }}</small>
        </div>
        <div class="field">
          <label for="rj-poli-tujuan">Poli / spesialis tujuan</label>
          <InputText id="rj-poli-tujuan" v-model="form.poliTujuan" placeholder="Mis. Penyakit Dalam" fluid />
        </div>
      </template>

      <div v-if="bpjs" class="field">
        <label for="rj-faskes">Faskes tujuan <span class="req">*</span></label>
        <Select
          v-model="form.faskes"
          inputId="rj-faskes"
          :options="listFaskes"
          :optionLabel="labelFaskes"
          filter
          showClear
          :loading="loadingFaskes"
          placeholder="Ketik minimal 3 huruf nama faskes"
          emptyFilterMessage="Ketik minimal 3 huruf untuk mencari"
          :invalid="!!errors.faskes"
          fluid
          @filter="onFilterFaskes"
          @change="clearError('faskes')"
        />
        <small v-if="errors.faskes" class="field__error">{{ errors.faskes }}</small>
      </div>

      <div v-if="bpjs" class="field">
        <label for="rj-spesialis">Spesialistik <span class="req">*</span></label>
        <Select
          v-model="form.spesialis"
          inputId="rj-spesialis"
          :options="listSpesialis"
          :optionLabel="labelSpesialis"
          filter
          showClear
          :loading="loadingSpesialis"
          :disabled="!form.faskes"
          :placeholder="form.faskes ? 'Pilih spesialistik' : 'Pilih faskes terlebih dahulu'"
          :invalid="!!errors.spesialis"
          fluid
          @change="clearError('spesialis')"
        />
        <small v-if="errors.spesialis" class="field__error">{{ errors.spesialis }}</small>
      </div>

      <div class="field field--full">
        <label for="rj-catatan">Catatan</label>
        <Textarea id="rj-catatan" v-model="form.catatan" rows="2" autoResize fluid />
      </div>
    </div>
  </div>
</template>

<style scoped>
.rujuk {
  margin: 0.25rem 0 0.5rem;
  padding: 1rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-bg);
}
.rujuk__grid {
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
.field label,
.label {
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
.radios {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
}
.radio {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  cursor: pointer;
}

@media (max-width: 768px) {
  .rujuk__grid {
    grid-template-columns: 1fr;
  }
}
</style>
