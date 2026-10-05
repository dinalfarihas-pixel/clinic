<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useToast } from 'primevue/usetoast'
import {
  getSuku,
  getYonif,
  searchDesa,
  getPasienLokal,
  getPesertaBpjsByNoka,
  generateNoRm,
  simpanPasien,
  MODE_CARI
} from '@/services/pendaftaran'
import { parseTanggal, toYmd, hitungUmurTahun } from '@/utils/tanggal'

const visible = defineModel('visible', { type: Boolean, default: false })

const props = defineProps({
  // Data awal (mis. peserta BPJS yang ditemukan tetapi belum punya RM)
  prefill: { type: Object, default: null }
})

const emit = defineEmits(['saved'])

const toast = useToast()

// ── Referensi (kode sama dengan SIMRS) ───────────────────────
const listAgama = [
  { kode: '1', nama: 'ISLAM' },
  { kode: '2', nama: 'KRISTEN PROTESTAN' },
  { kode: '3', nama: 'KRISTEN KATHOLIK' },
  { kode: '4', nama: 'HINDU' },
  { kode: '5', nama: 'BUDHA' },
  { kode: '6', nama: 'LAIN-LAIN' }
]
const listPendidikan = [
  { kode: '1', nama: 'SD' },
  { kode: '2', nama: 'SMP' },
  { kode: '3', nama: 'SMA' },
  { kode: '4', nama: 'D3/AKADEMIK' },
  { kode: '5', nama: 'UNIVERSITAS' },
  { kode: '6', nama: 'TIDAK TAHU' }
]
const listStatus = [
  { kode: '1', nama: 'BELUM KAWIN' },
  { kode: '2', nama: 'KAWIN' },
  { kode: '3', nama: 'JANDA/DUDA' }
]
const pekerjaanOptions = [
  { kode: '1', label: 'PNS' },
  { kode: '2', label: 'POLRI' },
  { kode: '7', label: 'TNI' },
  { kode: '3', label: 'SWASTA' },
  { kode: '4', label: 'BUMN' },
  { kode: '5', label: 'MAHASISWA' },
  { kode: '6', label: 'TIDAK/BELUM BEKERJA' }
]
const hubunganTNIOptions = [
  { kode: '1', label: 'Diri Sendiri' },
  { kode: '2', label: 'Suami' },
  { kode: '3', label: 'Istri' },
  { kode: '4', label: 'Anak' }
]
const hakKelasList = [
  { kode: '1', keterangan: 'KELAS 1' },
  { kode: '2', keterangan: 'KELAS 2' },
  { kode: '3', keterangan: 'KELAS 3' }
]
const jenisKelaminOptions = ['LAKI-LAKI', 'PEREMPUAN']

const listSuku = ref([])
const listYonif = ref([])
const listDesa = ref([])
const loadingDesa = ref(false)

// ── Form ─────────────────────────────────────────────────────
function emptyForm() {
  return {
    rm: '',
    nama_pasien: '',
    nik: '',
    noka: '',
    hakKelas: null,
    tanggal_lahir: null,
    usia: null,
    jeniskelamin: '',
    status_perkawinan: null,
    desaselected: null,
    no_telp: '',
    alamat: '',
    pendidikan: null,
    pekerjaan: null,
    no_nrp: '',
    hubungan_tni_polri: null,
    pangkat: '',
    satuan: null,
    suku: null,
    agama: null
  }
}

const form = ref(emptyForm())
const errors = ref({})
const saving = ref(false)

const isTniPolri = computed(() => ['TNI', 'POLRI'].includes(form.value.pekerjaan?.label))
// Hak kelas BPJS dari hasil cek peserta, untuk dicocokkan saat simpan
const hakKelasBpjs = ref(null)

function applyPrefill(p) {
  if (!p) return
  const tgl = parseTanggal(p.tglLahir)
  const jenisPeserta = p.jenisPeserta?.keterangan?.toLowerCase()
  Object.assign(form.value, {
    nama_pasien: p.nama || '',
    nik: p.nik || '',
    noka: p.noKartu || '',
    tanggal_lahir: tgl,
    usia: hitungUmurTahun(tgl),
    jeniskelamin: p.sex === 'L' ? 'LAKI-LAKI' : p.sex === 'P' ? 'PEREMPUAN' : '',
    hakKelas: hakKelasList.find((x) => x.kode === p.hakKelas?.kode) || null,
    pekerjaan: pekerjaanOptions.find((x) => x.label.toLowerCase() === jenisPeserta) || null,
    no_telp: p.noTelepon || ''
  })
  hakKelasBpjs.value = p.noKartu ? p.hakKelas?.kode || null : null
}

// ── Tanggal lahir ↔ usia ─────────────────────────────────────
// Usia dihitung dari tanggal lahir; tanggal hanya diperkirakan saat usia diketik manual
function onTanggalLahir(value) {
  form.value.usia = hitungUmurTahun(value)
  clearError('tanggal_lahir')
}
function onUsia(value) {
  if (value == null || value < 0) return
  const now = new Date()
  form.value.tanggal_lahir = new Date(now.getFullYear() - value, now.getMonth(), now.getDate())
  clearError('tanggal_lahir')
}

// ── Cek No. RM & No. Kartu (debounce, sama seperti SIMRS) ────
const rmCheck = ref({ status: 'idle', data: null }) // idle | checking | available | taken
const nokaCheck = ref({ status: 'idle', data: null })
const rmTimerRef = { t: null }
const nokaTimerRef = { t: null }

function watchDuplicate(getter, state, mode, timerRef) {
  watch(getter, (value) => {
    clearTimeout(timerRef.t)
    const v = (value || '').trim()
    if (!v) {
      state.value = { status: 'idle', data: null }
      return
    }
    state.value = { status: 'checking', data: null }
    timerRef.t = setTimeout(async () => {
      try {
        const found = await getPasienLokal(mode, v)
        state.value = found ? { status: 'taken', data: found } : { status: 'available', data: null }
      } catch {
        state.value = { status: 'idle', data: null }
      }
    }, 500)
  })
}
watchDuplicate(() => form.value.rm, rmCheck, MODE_CARI.NO_RM, rmTimerRef)
watchDuplicate(() => form.value.noka, nokaCheck, MODE_CARI.NO_KARTU, nokaTimerRef)

const generatingRm = ref(false)
async function buatRmBaru() {
  generatingRm.value = true
  try {
    form.value.rm = await generateNoRm()
    toast.add({ severity: 'success', summary: 'No. RM dibuat', detail: form.value.rm, life: 3000 })
  } catch (err) {
    toast.add({ severity: 'warn', summary: 'Gagal membuat No. RM', detail: err.message, life: 4000 })
  } finally {
    generatingRm.value = false
  }
}

function kosongkanNoka() {
  form.value.noka = ''
  form.value.hakKelas = null
  hakKelasBpjs.value = null
}

// ── Cek peserta BPJS ─────────────────────────────────────────
const loadingBpjs = ref(false)
async function cekBpjs() {
  const noka = form.value.noka.trim()
  if (!noka) {
    toast.add({ severity: 'warn', summary: 'No. kartu kosong', detail: 'Masukkan nomor kartu BPJS.', life: 3000 })
    return
  }
  loadingBpjs.value = true
  try {
    const p = await getPesertaBpjsByNoka(noka)
    const tgl = parseTanggal(p.tglLahir)
    Object.assign(form.value, {
      nama_pasien: p.nama || form.value.nama_pasien,
      nik: p.nik || form.value.nik,
      noka: p.noKartu || noka,
      hakKelas: hakKelasList.find((x) => x.kode === p.hakKelas?.kode) || null,
      tanggal_lahir: tgl || form.value.tanggal_lahir,
      usia: tgl ? hitungUmurTahun(tgl) : form.value.usia,
      jeniskelamin: p.sex === 'L' ? 'LAKI-LAKI' : p.sex === 'P' ? 'PEREMPUAN' : form.value.jeniskelamin
    })
    hakKelasBpjs.value = p.hakKelas?.kode || null
    errors.value = {}
    toast.add({ severity: 'success', summary: 'Peserta ditemukan', detail: `${p.nama} — ${p.statusPeserta?.keterangan || ''}`, life: 3000 })
  } catch (err) {
    toast.add({ severity: 'warn', summary: 'BPJS', detail: err.message, life: 4000 })
  } finally {
    loadingBpjs.value = false
  }
}

// ── Desa ─────────────────────────────────────────────────────
let desaTimer = null
function onFilterDesa(event) {
  clearTimeout(desaTimer)
  desaTimer = setTimeout(async () => {
    loadingDesa.value = true
    try {
      listDesa.value = await searchDesa(event.value)
    } catch (err) {
      toast.add({ severity: 'error', summary: 'Gagal mencari desa', detail: err.message, life: 4000 })
    } finally {
      loadingDesa.value = false
    }
  }, 400)
}
function onPilihDesa() {
  // Sama dengan SIMRS: alamat diisi nama desa bila masih kosong
  if (!form.value.alamat) form.value.alamat = form.value.desaselected?.nama_desa || ''
  clearError('desaselected')
}
const desaLabel = (d) => (d ? [d.nama_desa, d.nama_kecamatan, d.nama_kabkota, d.namaprovinsi].filter(Boolean).join(', ') : '')

// ── Validasi & simpan ────────────────────────────────────────
function clearError(key) {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: '' }
}

function validate() {
  const f = form.value
  const e = {}
  if (!f.nama_pasien?.trim()) e.nama_pasien = 'Nama pasien wajib diisi'
  const nik = f.nik?.trim()
  if (!nik) e.nik = 'NIK wajib diisi (isi "-" jika tidak ada)'
  else if (nik !== '-' && !/^\d{16}$/.test(nik)) e.nik = 'NIK harus 16 digit angka'
  if (!f.tanggal_lahir) e.tanggal_lahir = 'Tanggal lahir wajib diisi'
  if (!f.jeniskelamin) e.jeniskelamin = 'Jenis kelamin wajib dipilih'
  if (!f.status_perkawinan) e.status_perkawinan = 'Status perkawinan wajib dipilih'
  if (!f.desaselected) e.desaselected = 'Desa/kelurahan wajib dipilih'
  if (!f.no_telp?.trim()) e.no_telp = 'No. telepon wajib diisi'
  if (!f.alamat?.trim()) e.alamat = 'Alamat wajib diisi'
  if (!f.pekerjaan) e.pekerjaan = 'Pekerjaan wajib dipilih'
  if (!f.suku) e.suku = 'Suku wajib dipilih'
  if (!f.agama) e.agama = 'Agama wajib dipilih'
  if (f.noka && hakKelasBpjs.value && f.hakKelas?.kode !== hakKelasBpjs.value) {
    e.hakKelas = 'Hak kelas tidak sesuai dengan data BPJS'
  }
  errors.value = e
  return Object.keys(e).length === 0
}

async function simpan() {
  if (!validate()) {
    toast.add({ severity: 'warn', summary: 'Data belum lengkap', detail: 'Periksa kembali isian yang ditandai.', life: 3500 })
    return
  }
  if (rmCheck.value.status === 'checking' || nokaCheck.value.status === 'checking') {
    toast.add({ severity: 'warn', summary: 'Mohon tunggu', detail: 'Sistem sedang mengecek No. RM / No. kartu.', life: 3000 })
    return
  }
  if (rmCheck.value.status === 'taken') {
    toast.add({ severity: 'warn', summary: 'No. RM sudah dipakai', detail: 'Ganti No. RM atau buat No. RM baru.', life: 4000 })
    return
  }
  if (nokaCheck.value.status === 'taken') {
    toast.add({ severity: 'warn', summary: 'No. kartu sudah terdaftar', detail: 'Kosongkan atau perbaiki No. kartu BPJS.', life: 4000 })
    return
  }

  saving.value = true
  try {
    // Bentuk payload sama dengan SIMRS (inputPasienMode5), mode 1 = pasien baru
    const { no_rm, message } = await simpanPasien({
      ...form.value,
      mode: 1,
      rm: form.value.rm.trim(),
      nama_pasien: form.value.nama_pasien.trim(),
      nik: form.value.nik.trim(),
      noka: form.value.noka.trim(),
      tanggal_lahir: toYmd(form.value.tanggal_lahir)
    })
    toast.add({ severity: 'success', summary: 'Pasien tersimpan', detail: message || `No. RM ${no_rm}`, life: 4000 })
    emit('saved', no_rm)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

// Enter pindah ke isian berikutnya (seperti SIMRS)
function onEnter(event) {
  const el = event.target
  if (el.tagName !== 'INPUT') return
  event.preventDefault() // jangan submit form
  if (el.closest('.p-select, .p-datepicker')) return
  const fields = [...event.currentTarget.querySelectorAll('input:not([disabled]):not([readonly]), .p-select[tabindex]')]
  fields[fields.indexOf(el) + 1]?.focus()
}

// ── Buka / tutup ─────────────────────────────────────────────
let refLoaded = false
watch(visible, async (open) => {
  if (!open) return
  form.value = emptyForm()
  errors.value = {}
  hakKelasBpjs.value = null
  listDesa.value = []
  applyPrefill(props.prefill)

  if (!refLoaded) {
    const [suku, yonif] = await Promise.allSettled([getSuku(), getYonif()])
    if (suku.status === 'fulfilled') listSuku.value = suku.value
    else toast.add({ severity: 'error', summary: 'Gagal memuat data suku', detail: suku.reason?.message, life: 5000 })
    if (yonif.status === 'fulfilled') listYonif.value = yonif.value
    refLoaded = suku.status === 'fulfilled'
  }

  // No. kartu BPJS terisi dari pencarian tapi datanya belum lengkap (pasien belum ditemukan
  // di manapun): langsung cek ke server BPJS tanpa perlu klik manual
  if (form.value.noka && !form.value.nama_pasien) cekBpjs()
})

onBeforeUnmount(() => {
  clearTimeout(rmTimerRef.t)
  clearTimeout(nokaTimerRef.t)
  clearTimeout(desaTimer)
})
</script>

<template>
  <Dialog
    v-model:visible="visible"
    header="Registrasi pasien baru"
    modal
    :closable="!saving"
    :style="{ width: '60rem' }"
    :breakpoints="{ '1199px': '85vw', '575px': '96vw' }"
  >
    <form class="pasien-form" @submit.prevent="simpan" @keydown.enter="onEnter">
      <!-- Data pribadi -->
      <section class="section">
        <h3 class="section__title"><i class="pi pi-user" />Data pribadi</h3>
        <div class="grid-2">
          <div class="field">
            <label for="pb-rm">No. rekam medis</label>
            <div class="inline">
              <IconField class="inline__grow">
                <InputText
                  id="pb-rm"
                  v-model="form.rm"
                  placeholder="Kosongkan agar dibuat otomatis"
                  :invalid="rmCheck.status === 'taken'"
                  fluid
                />
                <InputIcon v-if="rmCheck.status === 'checking'" class="pi pi-spin pi-spinner" />
                <InputIcon v-else-if="rmCheck.status === 'available'" class="pi pi-check-circle ok" />
                <InputIcon v-else-if="rmCheck.status === 'taken'" class="pi pi-times-circle bad" />
              </IconField>
              <Button
                icon="pi pi-refresh"
                severity="secondary"
                outlined
                :loading="generatingRm"
                v-tooltip.top="'Buat No. RM baru'"
                aria-label="Buat No. RM baru"
                @click="buatRmBaru"
              />
            </div>
            <small v-if="rmCheck.status === 'available'" class="hint ok">No. RM tersedia</small>
            <small v-else-if="rmCheck.status === 'taken'" class="field__error">
              Sudah dipakai oleh <strong>{{ rmCheck.data?.NAMAPASIEN }}</strong>
              <template v-if="rmCheck.data?.TGLLAHIR"> (lahir {{ rmCheck.data.TGLLAHIR }})</template>
            </small>
            <small v-else class="hint">Jika dikosongkan, sistem membuat No. RM otomatis.</small>
          </div>

          <div class="field">
            <label for="pb-nama">Nama pasien <span class="req">*</span></label>
            <InputText
              id="pb-nama"
              v-model="form.nama_pasien"
              :invalid="!!errors.nama_pasien"
              fluid
              @update:modelValue="clearError('nama_pasien')"
            />
            <small v-if="errors.nama_pasien" class="field__error">{{ errors.nama_pasien }}</small>
          </div>

          <div class="field">
            <label for="pb-nik">NIK <span class="req">*</span></label>
            <InputText
              id="pb-nik"
              v-model="form.nik"
              maxlength="16"
              inputmode="numeric"
              placeholder='16 digit, atau "-" jika tidak ada'
              :invalid="!!errors.nik"
              fluid
              @update:modelValue="clearError('nik')"
            />
            <small v-if="errors.nik" class="field__error">{{ errors.nik }}</small>
          </div>

          <div class="field">
            <label for="pb-noka">No. kartu BPJS</label>
            <div class="inline">
              <IconField class="inline__grow">
                <InputText
                  id="pb-noka"
                  v-model="form.noka"
                  inputmode="numeric"
                  placeholder="Opsional"
                  autocomplete="off"
                  :invalid="nokaCheck.status === 'taken'"
                  fluid
                />
                <InputIcon v-if="nokaCheck.status === 'checking'" class="pi pi-spin pi-spinner" />
                <InputIcon v-else-if="nokaCheck.status === 'available'" class="pi pi-check-circle ok" />
                <InputIcon v-else-if="nokaCheck.status === 'taken'" class="pi pi-times-circle bad" />
              </IconField>
              <Button label="Cek BPJS" icon="pi pi-search" :loading="loadingBpjs" outlined @click="cekBpjs" />
            </div>
            <small v-if="nokaCheck.status === 'taken'" class="field__error">
              Sudah terdaftar untuk pasien lain
              <strong v-if="nokaCheck.data?.NOMR">(RM {{ nokaCheck.data.NOMR }})</strong>
              <template v-if="nokaCheck.data?.NAMAPASIEN"> a.n. {{ nokaCheck.data.NAMAPASIEN }}</template>.
              <Button label="Kosongkan" size="small" text severity="danger" class="inline-btn" @click="kosongkanNoka" />
            </small>
          </div>

          <div class="field">
            <label for="pb-tgl">Tanggal lahir <span class="req">*</span></label>
            <DatePicker
              v-model="form.tanggal_lahir"
              inputId="pb-tgl"
              dateFormat="dd/mm/yy"
              placeholder="dd/mm/yyyy"
              showIcon
              iconDisplay="input"
              :maxDate="new Date()"
              :invalid="!!errors.tanggal_lahir"
              fluid
              @update:modelValue="onTanggalLahir"
            />
            <small v-if="errors.tanggal_lahir" class="field__error">{{ errors.tanggal_lahir }}</small>
          </div>

          <div class="field">
            <label for="pb-usia">Usia (tahun)</label>
            <InputNumber
              v-model="form.usia"
              inputId="pb-usia"
              :min="0"
              :max="150"
              placeholder="Otomatis dari tanggal lahir"
              suffix=" tahun"
              fluid
              @input="onUsia($event.value)"
            />
          </div>

          <div class="field">
            <label for="pb-jk">Jenis kelamin <span class="req">*</span></label>
            <Select
              v-model="form.jeniskelamin"
              inputId="pb-jk"
              :options="jenisKelaminOptions"
              placeholder="Pilih jenis kelamin"
              :invalid="!!errors.jeniskelamin"
              fluid
              @change="clearError('jeniskelamin')"
            />
            <small v-if="errors.jeniskelamin" class="field__error">{{ errors.jeniskelamin }}</small>
          </div>

          <div class="field">
            <label for="pb-status">Status perkawinan <span class="req">*</span></label>
            <Select
              v-model="form.status_perkawinan"
              inputId="pb-status"
              :options="listStatus"
              optionLabel="nama"
              placeholder="Pilih status"
              :invalid="!!errors.status_perkawinan"
              fluid
              @change="clearError('status_perkawinan')"
            />
            <small v-if="errors.status_perkawinan" class="field__error">{{ errors.status_perkawinan }}</small>
          </div>

          <div v-if="form.noka" class="field">
            <label for="pb-kelas">Hak kelas BPJS</label>
            <Select
              v-model="form.hakKelas"
              inputId="pb-kelas"
              :options="hakKelasList"
              optionLabel="keterangan"
              placeholder="Pilih hak kelas"
              :invalid="!!errors.hakKelas"
              fluid
              @change="clearError('hakKelas')"
            />
            <small v-if="errors.hakKelas" class="field__error">{{ errors.hakKelas }}</small>
          </div>
        </div>
      </section>

      <!-- Alamat -->
      <section class="section">
        <h3 class="section__title"><i class="pi pi-map-marker" />Alamat &amp; kontak</h3>
        <div class="grid-2">
          <div class="field field--full">
            <label for="pb-desa">Desa / kelurahan <span class="req">*</span></label>
            <Select
              v-model="form.desaselected"
              inputId="pb-desa"
              :options="listDesa"
              :optionLabel="desaLabel"
              filter
              :loading="loadingDesa"
              placeholder="Ketik minimal 4 huruf nama desa"
              emptyFilterMessage="Ketik minimal 4 huruf untuk mencari"
              :invalid="!!errors.desaselected"
              fluid
              @filter="onFilterDesa"
              @change="onPilihDesa"
            >
              <template #option="{ option }">
                <div class="desa-option">
                  <strong>{{ option.nama_desa }}</strong>
                  <small>{{ option.nama_kecamatan }}, {{ option.nama_kabkota }}, {{ option.namaprovinsi }}</small>
                </div>
              </template>
            </Select>
            <small v-if="errors.desaselected" class="field__error">{{ errors.desaselected }}</small>
          </div>

          <div class="field">
            <label for="pb-alamat">Alamat lengkap <span class="req">*</span></label>
            <InputText
              id="pb-alamat"
              v-model="form.alamat"
              placeholder="Nama jalan, nomor rumah, dusun"
              :invalid="!!errors.alamat"
              fluid
              @update:modelValue="clearError('alamat')"
            />
            <small v-if="errors.alamat" class="field__error">{{ errors.alamat }}</small>
          </div>

          <div class="field">
            <label for="pb-telp">No. telepon <span class="req">*</span></label>
            <InputText
              id="pb-telp"
              v-model="form.no_telp"
              inputmode="tel"
              placeholder="08xxxxxxxxxx"
              :invalid="!!errors.no_telp"
              fluid
              @update:modelValue="clearError('no_telp')"
            />
            <small v-if="errors.no_telp" class="field__error">{{ errors.no_telp }}</small>
          </div>
        </div>
      </section>

      <!-- Informasi tambahan -->
      <section class="section">
        <h3 class="section__title"><i class="pi pi-info-circle" />Informasi tambahan</h3>
        <div class="grid-2">
          <div class="field">
            <label for="pb-pendidikan">Pendidikan terakhir</label>
            <Select
              v-model="form.pendidikan"
              inputId="pb-pendidikan"
              :options="listPendidikan"
              optionLabel="nama"
              placeholder="Pilih pendidikan"
              showClear
              fluid
            />
          </div>

          <div class="field">
            <label for="pb-pekerjaan">Pekerjaan <span class="req">*</span></label>
            <Select
              v-model="form.pekerjaan"
              inputId="pb-pekerjaan"
              :options="pekerjaanOptions"
              optionLabel="label"
              placeholder="Pilih pekerjaan"
              :invalid="!!errors.pekerjaan"
              fluid
              @change="clearError('pekerjaan')"
            />
            <small v-if="errors.pekerjaan" class="field__error">{{ errors.pekerjaan }}</small>
          </div>

          <template v-if="isTniPolri">
            <div class="field">
              <label for="pb-nrp">NRP</label>
              <InputText id="pb-nrp" v-model="form.no_nrp" placeholder="No. NRP" fluid />
            </div>
            <div class="field">
              <label for="pb-hub">Hubungan dengan {{ form.pekerjaan.label }}</label>
              <Select
                v-model="form.hubungan_tni_polri"
                inputId="pb-hub"
                :options="hubunganTNIOptions"
                optionLabel="label"
                placeholder="Pilih hubungan"
                fluid
              />
            </div>
            <div class="field">
              <label for="pb-pangkat">Pangkat</label>
              <InputText id="pb-pangkat" v-model="form.pangkat" fluid />
            </div>
            <div v-if="form.pekerjaan.label === 'TNI'" class="field">
              <label for="pb-satuan">Satuan</label>
              <Select
                v-model="form.satuan"
                inputId="pb-satuan"
                :options="listYonif"
                optionLabel="nama_yonif"
                placeholder="Pilih atau ketik satuan"
                filter
                editable
                fluid
              />
            </div>
          </template>

          <div class="field">
            <label for="pb-suku">Suku <span class="req">*</span></label>
            <Select
              v-model="form.suku"
              inputId="pb-suku"
              :options="listSuku"
              optionLabel="nama_suku"
              placeholder="Pilih suku"
              filter
              :invalid="!!errors.suku"
              fluid
              @change="clearError('suku')"
            />
            <small v-if="errors.suku" class="field__error">{{ errors.suku }}</small>
          </div>

          <div class="field">
            <label for="pb-agama">Agama <span class="req">*</span></label>
            <Select
              v-model="form.agama"
              inputId="pb-agama"
              :options="listAgama"
              optionLabel="nama"
              placeholder="Pilih agama"
              :invalid="!!errors.agama"
              fluid
              @change="clearError('agama')"
            />
            <small v-if="errors.agama" class="field__error">{{ errors.agama }}</small>
          </div>
        </div>
      </section>
    </form>

    <template #footer>
      <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="visible = false" />
      <Button label="Simpan pasien" icon="pi pi-save" :loading="saving" @click="simpan" />
    </template>
  </Dialog>
</template>

<style scoped>
.pasien-form {
  display: grid;
  gap: 1.5rem;
}

.section__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.875rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--app-border);
  font-size: 1rem;
  font-weight: 700;
}
.section__title i {
  color: var(--p-primary-color);
  font-size: 0.9375rem;
}

.grid-2 {
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
.hint {
  color: var(--app-text-muted);
  font-size: 0.8125rem;
}
.req {
  color: var(--p-red-500);
}
.ok {
  color: var(--p-green-500);
}
.bad {
  color: var(--p-red-500);
}

.inline {
  display: flex;
  gap: 0.5rem;
}
.inline__grow {
  flex: 1;
  min-width: 0;
}
.inline-btn {
  padding: 0 0.25rem;
  font-size: 0.8125rem;
}

.desa-option {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  white-space: normal;
}
.desa-option small {
  color: var(--app-text-muted);
}

@media (max-width: 768px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
