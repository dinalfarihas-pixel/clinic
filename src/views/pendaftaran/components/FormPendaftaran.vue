<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  CARA_BAYAR_BPJS,
  getCaraBayar,
  getPoli,
  getDokter,
  searchDiagnosa,
  getRujukanFaskes,
  getSuratKontrol,
  ambilKodeBooking,
  simpanPendaftaran,
  getUrlCetakSep
} from '@/services/pendaftaran'

const props = defineProps({
  pasien: { type: Object, required: true }
})

const emit = defineEmits(['cari-pasien', 'restore-pasien', 'saved', 'reset'])

const toast = useToast()
const auth = useAuthStore()
const router = useRouter()

/** URL halaman cetak bukti pendaftaran (langsung membuka dialog cetak). */
const urlBuktiPendaftaran = (noReg) =>
  router.resolve({ name: 'cetak-bukti-pendaftaran', params: { noreg: noReg }, query: { print: '1' } }).href
const DRAFT_KEY = 'klinik.pendaftaran.draft.v2'

// ── Referensi ────────────────────────────────────────────────
const listCaraBayar = ref([])
const listPoli = ref([])
const listDokter = ref([])
const listDiagnosa = ref([])
const loadingRef = ref(false)
const loadingDiagnosa = ref(false)

const asalRujukanOptions = [
  { label: 'Faskes I (Puskesmas/Klinik)', value: 1 },
  { label: 'Faskes II (Rumah Sakit)', value: 2 }
]

// ── Form ─────────────────────────────────────────────────────
function emptyForm() {
  return {
    tanggalMasuk: new Date(),
    tanggalSep: new Date(),
    caraBayar: null,
    poli: null,
    dokter: null,
    diagnosa: null,
    asalRujukan: null,
    noRujukan: '',
    // Diisi dari data rujukan / surat kontrol BPJS
    tglRujukan: null,
    ppkRujukan: null,
    namaPpkPerujuk: null,
    noKontrol: '',
    catatan: '',
    pasienKatarak: false,
    hanyaBpjs: false, // hanya kirim ke server BPJS, tidak disimpan ke SIMRS
    tanpaBooking: false // lewati kode booking antrian (SIMRS: "Pasien HD")
  }
}

const form = ref(emptyForm())
const errors = ref({})
const jamRealtime = ref(true)
const saving = ref(false)
const showConfirm = ref(false)

const isBpjs = computed(() => form.value.caraBayar?.KODE == CARA_BAYAR_BPJS)

// Nama field dokter berbeda-beda antar endpoint SIMRS
const dokterLabel = (d) => d?.NAMADOKTER || d?.namadokter || d?.nama_dokter || d?.namaDokter || ''

// Jenis kunjungan (sama dengan jenisKunjunganPoli di SIMRS):
// ada asal rujukan tanpa surat kontrol -> 1, ada asal rujukan + surat kontrol -> 3, selain itu -> 4
const jenisKunjungan = computed(() => {
  const asal = form.value.asalRujukan
  if ((asal == 1 || asal == 2) && !form.value.noKontrol) return 1
  if ((asal == 1 || asal == 2) && form.value.noKontrol) return 3
  return 4
})

// ── Rujukan BPJS ─────────────────────────────────────────────
const loadingRujukan = ref(false)

// Rujukan diubah manual: data perujuk lama tidak berlaku lagi
function onUbahRujukan() {
  form.value.tglRujukan = null
  form.value.ppkRujukan = null
  form.value.namaPpkPerujuk = null
}

async function cariRujukan() {
  if (!form.value.noRujukan) return
  if (!form.value.asalRujukan) {
    toast.add({ severity: 'warn', summary: 'Asal rujukan', detail: 'Pilih asal rujukan terlebih dahulu.', life: 3000 })
    return
  }
  if (!props.pasien.noKartu) {
    toast.add({ severity: 'warn', summary: 'Pasien', detail: 'Pasien belum memiliki nomor kartu BPJS.', life: 3000 })
    return
  }
  loadingRujukan.value = true
  try {
    const rj = await getRujukanFaskes(props.pasien.noKartu, form.value.asalRujukan, form.value.noRujukan.trim())
    if (rj.diagnosa?.kode) setDiagnosa(rj.diagnosa.kode, rj.diagnosa.nama)
    if (rj.poliRujukan?.kode) pilihPoliBpjs(rj.poliRujukan.kode, rj.poliRujukan.nama)
    form.value.tglRujukan = rj.tglKunjungan || null
    form.value.ppkRujukan = rj.provPerujuk?.kode || null
    form.value.namaPpkPerujuk = rj.provPerujuk?.nama || null
    clearError('noRujukan')
    toast.add({ severity: 'success', summary: 'Rujukan ditemukan', detail: `Dari ${rj.provPerujuk?.nama || 'faskes'}`, life: 3000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Rujukan', detail: err.message, life: 4000 })
  } finally {
    loadingRujukan.value = false
  }
}

// ── Surat kontrol BPJS ───────────────────────────────────────
const loadingKontrol = ref(false)
const kontrolDitemukan = ref(false)

async function cariSuratKontrol() {
  if (!form.value.noKontrol) return
  loadingKontrol.value = true
  kontrolDitemukan.value = false
  try {
    const sk = await getSuratKontrol(form.value.noKontrol.trim())
    kontrolDitemukan.value = true

    const poli = sk.poliTujuan ? pilihPoliBpjs(sk.poliTujuan, sk.namaPoliTujuan) : null
    // Dokter dicocokkan lewat kode DPJP, lalu fallback ke dokter di poli tujuan
    const dokter =
      listDokter.value.find((d) => d.KODE_DOKTER_BPJS == sk.kodeDokter) ||
      (poli && listDokter.value.find((d) => d.KDPOLY_BPJS === poli.KodePoliBPJS))
    if (dokter) {
      form.value.dokter = dokter
      clearError('dokter')
    } else if (sk.kodeDokter) {
      toast.add({ severity: 'info', summary: 'Dokter', detail: `Dokter "${sk.namaDokter || sk.kodeDokter}" tidak ada di daftar dokter.`, life: 4000 })
    }

    const perujuk = sk.sep?.provPerujuk
    if (perujuk?.asalRujukan) form.value.asalRujukan = Number(perujuk.asalRujukan)
    if (perujuk?.noRujukan) {
      // Rujukan internal dari klinik sendiri memakai nomor SEP sebelumnya
      form.value.noRujukan =
        perujuk.asalRujukan === '2' && perujuk.kdProviderPerujuk === auth.kodePpk ? sk.sep?.noSep || '' : perujuk.noRujukan
    }
    form.value.tglRujukan = perujuk?.tglRujukan || null
    form.value.ppkRujukan = perujuk?.kdProviderPerujuk || null
    form.value.namaPpkPerujuk = perujuk?.nmProviderPerujuk || null
    if (form.value.ppkRujukan) errors.value = { ...errors.value, asalRujukan: '', noRujukan: '' }

    // Diagnosa dari SEP sebelumnya, format "H11.0 - Pterygium"
    if (sk.sep?.diagnosa) {
      const [kode, ...nama] = sk.sep.diagnosa.split(' - ')
      setDiagnosa(kode.trim(), nama.join(' - ').trim())
    }

    const noKartuKontrol = sk.sep?.peserta?.noKartu
    if (noKartuKontrol && props.pasien.noKartu && noKartuKontrol !== props.pasien.noKartu) {
      toast.add({
        severity: 'warn',
        summary: 'Pasien berbeda',
        detail: `Surat kontrol ini milik peserta ${noKartuKontrol}, bukan pasien yang dipilih.`,
        life: 6000
      })
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Surat kontrol', detail: err.message, life: 4000 })
  } finally {
    loadingKontrol.value = false
  }
}

function setDiagnosa(kode, nama) {
  const item = { dx: nama ? `${kode} - ${nama}` : kode, icd_code: kode, jenis_penyakit: nama || '' }
  listDiagnosa.value = [item]
  form.value.diagnosa = item
  clearError('diagnosa')
}

function pilihPoliBpjs(kodeBpjs, nama) {
  const poli = listPoli.value.find((p) => p.KodePoliBPJS === kodeBpjs)
  if (poli) {
    form.value.poli = poli
    clearError('poli')
  } else {
    toast.add({ severity: 'info', summary: 'Poli', detail: `Poli "${nama || kodeBpjs}" tidak ada di daftar poli klinik.`, life: 4000 })
  }
  return poli || null
}

// ── Kode booking antrian ─────────────────────────────────────
const booking = ref({ kodeBooking: null, nomorAntrian: null })
const loadingBooking = ref(false)

// Pasien BPJS: kode booking diambil & dikirim ke server BPJS (seperti SIMRS)
const perluBooking = computed(() => isBpjs.value && !form.value.tanpaBooking)

async function cekKodeBooking({ diam = false } = {}) {
  if (!props.pasien.noMR || !props.pasien.noKartu) return null
  loadingBooking.value = true
  try {
    const hasil = await ambilKodeBooking(props.pasien.noMR, props.pasien.noKartu)
    booking.value = { kodeBooking: hasil.kodeBooking, nomorAntrian: hasil.nomorAntrian }
    if (!diam && !hasil.kodeBooking) {
      toast.add({ severity: 'warn', summary: 'Kode booking', detail: 'Pasien belum memiliki kode booking antrian hari ini.', life: 4000 })
    }
    return hasil
  } catch (err) {
    if (!diam) toast.add({ severity: 'error', summary: 'Kode booking', detail: err.message, life: 4000 })
    return null
  } finally {
    loadingBooking.value = false
  }
}

// Ambil otomatis saat pasien BPJS dipilih / cara bayar diganti ke BPJS
watch(
  () => [perluBooking.value, props.pasien.noMR],
  ([perlu, noMR], [, noMRLama] = []) => {
    if (noMR !== noMRLama) booking.value = { kodeBooking: null, nomorAntrian: null }
    if (perlu && noMR && !booking.value.kodeBooking) cekKodeBooking({ diam: true })
  }
)

// ── Jam realtime ─────────────────────────────────────────────
let clock = null
function startClock() {
  stopClock()
  form.value.tanggalMasuk = new Date()
  clock = setInterval(() => (form.value.tanggalMasuk = new Date()), 1000)
}
function stopClock() {
  if (clock) clearInterval(clock)
  clock = null
}
watch(jamRealtime, (on) => (on ? startClock() : stopClock()))

// ── Diagnosa ─────────────────────────────────────────────────
let diagnosaTimer = null
function onFilterDiagnosa(event) {
  clearTimeout(diagnosaTimer)
  diagnosaTimer = setTimeout(async () => {
    loadingDiagnosa.value = true
    try {
      listDiagnosa.value = await searchDiagnosa(event.value)
    } catch (err) {
      toast.add({ severity: 'error', summary: 'Gagal mencari diagnosa', detail: err.message, life: 4000 })
    } finally {
      loadingDiagnosa.value = false
    }
  }, 400)
}

// ── Validasi ─────────────────────────────────────────────────
function validate() {
  const e = {}
  if (!props.pasien.nama) e.pasien = 'Pilih pasien terlebih dahulu'
  else if (!props.pasien.noMR) e.pasien = 'Pasien belum punya No. RM. Daftarkan sebagai pasien baru terlebih dahulu.'
  if (!form.value.tanggalMasuk) e.tanggalMasuk = 'Tanggal & jam masuk wajib diisi'
  if (!form.value.caraBayar) e.caraBayar = 'Cara bayar wajib dipilih'
  if (!form.value.poli) e.poli = 'Poli wajib dipilih'
  if (!form.value.dokter) e.dokter = 'Dokter wajib dipilih'
  // Backend (CreateSEP_Rajal_v2) menolak pendaftaran tanpa kode ICD
  if (!form.value.diagnosa?.icd_code) e.diagnosa = 'Diagnosa awal wajib dipilih'
  if (isBpjs.value) {
    if (!form.value.tanggalSep) e.tanggalSep = 'Tanggal SEP wajib diisi untuk pasien BPJS'
    if (!props.pasien.noKartu) e.caraBayar = 'Pasien tidak memiliki nomor kartu BPJS'
    // SEP butuh data rujukan lengkap (asal, nomor, tanggal, PPK perujuk)
    if (!form.value.asalRujukan) e.asalRujukan = 'Asal rujukan wajib dipilih untuk pasien BPJS'
    if (!form.value.noRujukan?.trim()) e.noRujukan = 'No. rujukan wajib diisi untuk pasien BPJS'
    else if (!form.value.ppkRujukan) e.noRujukan = 'Cari data rujukan dulu (tekan Enter atau 🔍) agar faskes perujuk terisi'
  }
  errors.value = e
  return Object.keys(e).length === 0
}

function clearError(key) {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: '' }
}

function openConfirm() {
  if (!validate()) {
    toast.add({
      severity: 'warn',
      summary: 'Data belum lengkap',
      detail: errors.value.pasien || 'Periksa kembali isian yang ditandai.',
      life: 3500
    })
    if (errors.value.pasien) emit('cari-pasien')
    return
  }
  showConfirm.value = true
}

// Payload CreateSEP_Rajal_v2 — sama dengan simpan_pendaftaran_poli() di SIMRS
function buatPayload() {
  const f = form.value
  const noKontrol = f.noKontrol?.trim() || null
  const noRujukan = f.noRujukan?.trim() || null
  const perujuk = { kode: f.ppkRujukan, tglRujukan: f.tglRujukan, noRujukan, nama: f.namaPpkPerujuk }
  return {
    // Non-BPJS tidak punya tanggal SEP: kirim tanggal & jam masuk
    tglsep: formatDate(isBpjs.value ? f.tanggalSep : f.tanggalMasuk),
    tanggalMasukRS: formatDateTime(f.tanggalMasuk),
    tanggalKLL: null,
    noka: props.pasien.noKartu || null,
    norm: props.pasien.noMR,
    diagnoseSelected: f.diagnosa,
    jenisrawatSelected: { code: 2 }, // rawat jalan
    poliSelected: { kode: f.poli.KodePoliBPJS, kode_poli_rs: f.poli.kode },
    jenisTrans: { code: 2 },
    jenis_kunj: jenisKunjungan.value,
    kd_cara_bayar: f.caraBayar.KODE,
    nomor_antrian: booking.value.nomorAntrian,
    pasienkatarak: f.pasienKatarak ? 1 : 0,
    hanya_simpan_bpjs: f.hanyaBpjs ? 1 : 0,
    lakaLantas: { caption: '0 - Bukan Kecelakaan lalu lintas [BKLL]', code: 0 },
    provPerujuk: perujuk,
    mode: 'POLIKLINIK',
    nospri: noKontrol,
    dokterSelected: f.dokter,
    provSelected: null,
    kabSelected: null,
    kecSelected: null,
    catatan: f.catatan || null,
    noreggister_origin: null,
    skdp: { noSurat: noKontrol, kodeDPJP: f.dokter?.KODE_DOKTER_BPJS || null },
    ruanganSelected: { kode: f.poli.kode },
    rujukan: {
      asalRujukan: f.asalRujukan || null,
      tglRujukan: f.tglRujukan || null,
      noRujukan,
      ppkRujukan: f.ppkRujukan || null
    }
  }
}

async function submit() {
  saving.value = true
  // Jendela cetak dibuka saat klik agar tidak diblokir popup blocker; diisi setelah simpan
  let printWin = form.value.hanyaBpjs ? null : window.open('', '_blank')
  try {
    // 1. Kode booking antrian dikirim ke server BPJS dulu (seperti SIMRS)
    if (perluBooking.value) {
      const hasil = await cekKodeBooking({ diam: true })
      const code = hasil?.sync?.metadata?.code
      if (code != 200 && code != 208) {
        throw new Error(
          hasil?.sync?.metadata?.message ||
            (hasil?.kodeBooking
              ? 'Gagal mengirim antrian ke server BPJS'
              : 'Kode booking antrian tidak ditemukan. Pastikan pasien sudah mengambil antrian, atau centang "Tanpa kode booking".')
        )
      }
    }

    // 2. Simpan pendaftaran + buat SEP
    const hasil = await simpanPendaftaran(buatPayload(), auth.userId)
    const f = form.value
    toast.add({
      severity: 'success',
      summary: 'Pendaftaran tersimpan',
      detail: [hasil.message, hasil.noReg && `No. registrasi ${hasil.noReg}`, hasil.noSep && `SEP ${hasil.noSep}`]
        .filter(Boolean)
        .join(' · '),
      life: 6000
    })

    // 3. Cetak: SEP untuk BPJS (API Laravel), bukti pendaftaran klinik untuk lainnya
    if (printWin && hasil.noReg) {
      const win = printWin
      printWin = null
      if (isBpjs.value) {
        getUrlCetakSep({ noSep: hasil.noSep, noReg: hasil.noReg, norm: props.pasien.noMR })
          .then((url) => (win.location.href = url))
          .catch((err) => {
            win.close()
            toast.add({ severity: 'warn', summary: 'Cetak SEP', detail: err.message, life: 5000 })
          })
      } else {
        win.location.href = urlBuktiPendaftaran(hasil.noReg)
      }
    }

    showConfirm.value = false
    resetForm()
    emit('saved', { ...hasil, bpjs: !!f.caraBayar && f.caraBayar.KODE == CARA_BAYAR_BPJS })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: String(err?.message || err), life: 6000 })
  } finally {
    printWin?.close()
    saving.value = false
  }
}

// Tombol Reset: kosongkan form sekaligus pasien terpilih (dikelola halaman induk),
// supaya draft tidak tersimpan ulang dengan data pasien yang masih ada
function hapusDraft() {
  resetForm()
  draftRestored.value = false
  emit('reset')
}

function resetForm() {
  clearTimeout(draftTimer)
  form.value = emptyForm()
  booking.value = { kodeBooking: null, nomorAntrian: null }
  kontrolDitemukan.value = false
  errors.value = {}
  jamRealtime.value = true
  startClock()
  clearDraft()
}

// ── Draft (localStorage) ─────────────────────────────────────
const hasDraft = ref(false)
const draftRestored = ref(false)

function saveDraft() {
  const { tanggalMasuk, ...rest } = form.value
  const isEmpty = !rest.caraBayar && !rest.poli && !rest.dokter && !rest.diagnosa && !rest.catatan && !rest.noRujukan
  if (isEmpty && !props.pasien.nama) return clearDraft()
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: rest, pasien: props.pasien }))
    hasDraft.value = true
  } catch {
    /* abaikan jika storage tidak tersedia */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* abaikan */
  }
  hasDraft.value = false
}

function restoreDraft() {
  let draft = null
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_KEY))
  } catch {
    return
  }
  if (!draft?.form) return
  // Samakan objek pilihan dengan item di daftar agar Select mengenalinya
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const pick = (list, item) => (item ? list.find((x) => same(x, item)) || null : null)
  form.value = {
    ...emptyForm(),
    ...draft.form,
    tanggalSep: draft.form.tanggalSep ? new Date(draft.form.tanggalSep) : new Date(),
    caraBayar: pick(listCaraBayar.value, draft.form.caraBayar),
    poli: pick(listPoli.value, draft.form.poli),
    dokter: pick(listDokter.value, draft.form.dokter),
    diagnosa: draft.form.diagnosa
  }
  if (draft.form.diagnosa) listDiagnosa.value = [draft.form.diagnosa]
  if (draft.pasien?.nama) emit('restore-pasien', draft.pasien)
  hasDraft.value = true
  draftRestored.value = true
}

// tanggalMasuk sengaja tidak dipantau: jam realtime berubah tiap detik
const DRAFT_FIELDS = [
  'tanggalSep', 'caraBayar', 'poli', 'dokter', 'diagnosa', 'asalRujukan', 'noRujukan',
  'tglRujukan', 'ppkRujukan', 'namaPpkPerujuk', 'noKontrol', 'catatan', 'pasienKatarak', 'hanyaBpjs', 'tanpaBooking'
]
let draftTimer = null
watch(
  [() => DRAFT_FIELDS.map((k) => form.value[k]), () => props.pasien.nama],
  () => {
    clearTimeout(draftTimer)
    draftTimer = setTimeout(saveDraft, 500)
  },
  { deep: true }
)

// ── Format tanggal ───────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
function formatDate(date) {
  if (!date) return null
  const d = new Date(date)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function formatDateTime(date) {
  if (!date) return null
  const d = new Date(date)
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function formatTampil(date, withTime = false) {
  if (!date) return '—'
  return new Date(date).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  })
}

// ── Keyboard shortcut Ctrl+Enter ─────────────────────────────
function onKeydown(e) {
  if (e.ctrlKey && e.key === 'Enter' && !showConfirm.value) {
    e.preventDefault()
    openConfirm()
  }
}

onMounted(async () => {
  loadingRef.value = true
  // Tiap referensi dimuat terpisah agar satu endpoint gagal tidak menggagalkan yang lain
  const sources = [
    ['cara bayar', getCaraBayar, listCaraBayar],
    ['poli', getPoli, listPoli],
    ['dokter', getDokter, listDokter]
  ]
  const results = await Promise.allSettled(sources.map(([, fn]) => fn()))
  results.forEach((r, i) => {
    const [label, , target] = sources[i]
    if (r.status === 'fulfilled') target.value = r.value
    else toast.add({ severity: 'error', summary: `Gagal memuat data ${label}`, detail: r.reason?.message, life: 5000 })
  })
  loadingRef.value = false
  restoreDraft()
  startClock()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  stopClock()
  clearTimeout(draftTimer)
  clearTimeout(diagnosaTimer)
  window.removeEventListener('keydown', onKeydown)
})

defineExpose({ resetForm })
</script>

<template>
  <div class="reg">
    <Message v-if="draftRestored" severity="info" closable icon="pi pi-history" @close="draftRestored = false">
      Draft pendaftaran sebelumnya berhasil dipulihkan.
    </Message>

    <!-- Identitas & waktu -->
    <section class="panel">
      <header class="panel__header">
        <h2 class="panel__title"><i class="pi pi-id-card panel__icon" />Identitas &amp; waktu masuk</h2>
      </header>
      <div class="grid-2">
        <div class="field">
          <label for="norm">Nomor rekam medis</label>
          <InputText id="norm" :modelValue="pasien.noMR || ''" placeholder="Belum ada pasien" readonly fluid />
        </div>

        <div class="field">
          <div class="field__label-row">
            <label for="tgl-masuk">Tanggal &amp; jam masuk <span class="req">*</span></label>
            <label class="toggle">
              <ToggleSwitch v-model="jamRealtime" />
              <span>{{ jamRealtime ? 'Realtime' : 'Manual' }}</span>
            </label>
          </div>
          <DatePicker
            v-model="form.tanggalMasuk"
            inputId="tgl-masuk"
            dateFormat="dd M yy"
            showTime
            hourFormat="24"
            showIcon
            iconDisplay="input"
            :disabled="jamRealtime"
            :invalid="!!errors.tanggalMasuk"
            fluid
            @update:modelValue="clearError('tanggalMasuk')"
          />
          <small v-if="errors.tanggalMasuk" class="field__error">{{ errors.tanggalMasuk }}</small>
        </div>
      </div>
    </section>

    <!-- Pelayanan -->
    <section class="panel">
      <header class="panel__header">
        <h2 class="panel__title"><i class="pi pi-sitemap panel__icon" />Pelayanan</h2>
      </header>
      <div class="grid-2">
        <div class="field">
          <label for="cara-bayar">Cara bayar <span class="req">*</span></label>
          <Select
            v-model="form.caraBayar"
            inputId="cara-bayar"
            :options="listCaraBayar"
            optionLabel="NAMA"
            placeholder="Pilih cara bayar"
            :loading="loadingRef"
            :invalid="!!errors.caraBayar"
            fluid
            @change="clearError('caraBayar')"
          />
          <small v-if="errors.caraBayar" class="field__error">{{ errors.caraBayar }}</small>
        </div>

        <div v-if="isBpjs" class="field">
          <label for="tgl-sep">Tanggal SEP <span class="req">*</span></label>
          <DatePicker
            v-model="form.tanggalSep"
            inputId="tgl-sep"
            dateFormat="dd M yy"
            showIcon
            iconDisplay="input"
            :invalid="!!errors.tanggalSep"
            fluid
            @update:modelValue="clearError('tanggalSep')"
          />
          <small v-if="errors.tanggalSep" class="field__error">{{ errors.tanggalSep }}</small>
        </div>

        <div class="field">
          <label for="poli">Poli tujuan <span class="req">*</span></label>
          <Select
            v-model="form.poli"
            inputId="poli"
            :options="listPoli"
            optionLabel="nama"
            placeholder="Pilih poli"
            :loading="loadingRef"
            :invalid="!!errors.poli"
            fluid
            @change="clearError('poli')"
          />
          <small v-if="errors.poli" class="field__error">{{ errors.poli }}</small>
        </div>

        <div class="field">
          <label for="dokter">Dokter <span class="req">*</span></label>
          <Select
            v-model="form.dokter"
            inputId="dokter"
            :options="listDokter"
            :optionLabel="dokterLabel"
            placeholder="Pilih dokter"
            filter
            showClear
            :loading="loadingRef"
            :invalid="!!errors.dokter"
            fluid
            @change="clearError('dokter')"
          />
          <small v-if="errors.dokter" class="field__error">{{ errors.dokter }}</small>
        </div>

        <div class="field field--full">
          <label for="diagnosa">Diagnosa awal <span class="req">*</span></label>
          <Select
            v-model="form.diagnosa"
            inputId="diagnosa"
            :options="listDiagnosa"
            optionLabel="dx"
            placeholder="Ketik minimal 2 huruf kode atau nama ICD-10"
            :loading="loadingDiagnosa"
            emptyFilterMessage="Ketik minimal 2 huruf untuk mencari"
            filter
            showClear
            :invalid="!!errors.diagnosa"
            fluid
            @filter="onFilterDiagnosa"
            @change="clearError('diagnosa')"
          />
          <small v-if="errors.diagnosa" class="field__error">{{ errors.diagnosa }}</small>
        </div>

        <template v-if="isBpjs">
          <div class="field">
            <label for="asal-rujukan">Asal rujukan <span class="req">*</span></label>
            <Select
              v-model="form.asalRujukan"
              inputId="asal-rujukan"
              :options="asalRujukanOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Pilih asal rujukan"
              showClear
              :invalid="!!errors.asalRujukan"
              fluid
              @change="onUbahRujukan(); clearError('asalRujukan')"
            />
            <small v-if="errors.asalRujukan" class="field__error">{{ errors.asalRujukan }}</small>
          </div>
          <div class="field">
            <label for="no-rujukan">No. rujukan <span class="req">*</span></label>
            <div class="inline">
              <InputText
                id="no-rujukan"
                v-model="form.noRujukan"
                placeholder="Nomor rujukan, tekan Enter untuk cari"
                :disabled="loadingRujukan"
                :invalid="!!errors.noRujukan"
                fluid
                @update:modelValue="onUbahRujukan"
                @keydown.enter.prevent="cariRujukan"
              />
              <Button
                icon="pi pi-search"
                severity="secondary"
                outlined
                :loading="loadingRujukan"
                :disabled="!form.noRujukan"
                aria-label="Cari rujukan"
                v-tooltip.top="'Cari data rujukan'"
                @click="cariRujukan"
              />
            </div>
            <small v-if="errors.noRujukan" class="field__error">{{ errors.noRujukan }}</small>
            <small v-else-if="form.namaPpkPerujuk" class="hint ok">
              <i class="pi pi-check-circle" /> {{ form.namaPpkPerujuk }}<template v-if="form.tglRujukan"> · {{ form.tglRujukan }}</template>
            </small>
          </div>
          <div class="field">
            <label for="no-kontrol">No. surat kontrol</label>
            <div class="inline">
              <InputText
                id="no-kontrol"
                v-model="form.noKontrol"
                placeholder="Opsional, tekan Enter untuk cari"
                :disabled="loadingKontrol"
                fluid
                @update:modelValue="kontrolDitemukan = false"
                @keydown.enter.prevent="cariSuratKontrol"
              />
              <Button
                icon="pi pi-search"
                severity="secondary"
                outlined
                :loading="loadingKontrol"
                :disabled="!form.noKontrol"
                aria-label="Cari surat kontrol"
                v-tooltip.top="'Cari surat kontrol'"
                @click="cariSuratKontrol"
              />
            </div>
            <small v-if="kontrolDitemukan" class="hint ok">
              <i class="pi pi-check-circle" /> Surat kontrol ditemukan, data terisi otomatis
            </small>
          </div>

          <div class="field">
            <label>Kode booking antrian</label>
            <div class="booking" :class="{ 'booking--off': form.tanpaBooking }">
              <div class="booking__info">
                <strong class="booking__kode">{{ booking.kodeBooking || '—' }}</strong>
                <small>
                  {{ booking.nomorAntrian ? `No. antrian ${booking.nomorAntrian}` : form.tanpaBooking ? 'Dilewati' : 'Belum ada' }}
                </small>
              </div>
              <Button
                label="Ambil"
                icon="pi pi-refresh"
                size="small"
                severity="secondary"
                outlined
                :loading="loadingBooking"
                :disabled="form.tanpaBooking || !pasien.noMR"
                @click="cekKodeBooking()"
              />
            </div>
            <div class="check">
              <Checkbox v-model="form.tanpaBooking" inputId="tanpa-booking" binary />
              <label for="tanpa-booking">Tanpa kode booking antrian</label>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- Informasi tambahan -->
    <section class="panel">
      <header class="panel__header">
        <h2 class="panel__title"><i class="pi pi-list panel__icon" />Informasi tambahan</h2>
      </header>
      <div class="field">
        <label for="catatan">Catatan</label>
        <Textarea id="catatan" v-model="form.catatan" rows="3" autoResize placeholder="Keluhan utama atau catatan lain" fluid />
      </div>
      <div class="options">
        <div class="check">
          <Checkbox v-model="form.pasienKatarak" inputId="katarak" binary />
          <label for="katarak">Pasien katarak</label>
        </div>
        <div v-if="isBpjs" class="check">
          <Checkbox v-model="form.hanyaBpjs" inputId="hanya-bpjs" binary />
          <label for="hanya-bpjs">Hanya simpan ke server BPJS <small>(tidak disimpan ke SIMRS)</small></label>
        </div>
      </div>
      <Message v-if="isBpjs && form.hanyaBpjs" severity="warn" icon="pi pi-exclamation-triangle" class="bpjs-only">
        Pendaftaran ini hanya dikirim ke BPJS (pembuatan SEP) dan <strong>tidak tersimpan</strong> di data kunjungan klinik.
      </Message>
    </section>

    <!-- Action bar -->
    <div class="actions">
      <div class="actions__left">
        <Button label="Cari pasien" icon="pi pi-search" severity="secondary" outlined @click="emit('cari-pasien')" />
        <span v-if="hasDraft" class="draft">
          <i class="pi pi-cloud" /> Draft tersimpan
          <Button label="Reset" icon="pi pi-trash" size="small" text severity="secondary" @click="hapusDraft" />
        </span>
      </div>
      <div class="actions__right">
        <span class="kbd-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> untuk simpan</span>
        <Button label="Simpan pendaftaran" icon="pi pi-save" :loading="saving" @click="openConfirm" />
      </div>
    </div>
  </div>

  <!-- Dialog konfirmasi -->
  <Dialog
    v-model:visible="showConfirm"
    header="Konfirmasi pendaftaran"
    modal
    :closable="!saving"
    :style="{ width: '34rem' }"
    :breakpoints="{ '575px': '94vw' }"
  >
    <div class="confirm">
      <div class="confirm__pasien">
        <div class="confirm__avatar">{{ pasien.nama?.charAt(0)?.toUpperCase() }}</div>
        <div>
          <p class="confirm__name">{{ pasien.nama }}</p>
          <p class="confirm__meta">
            RM {{ pasien.noMR || '—' }}
            <template v-if="pasien.noKartu"> · BPJS {{ pasien.noKartu }}</template>
          </p>
        </div>
      </div>

      <p class="confirm__hint">Periksa kembali data berikut sebelum disimpan.</p>

      <dl class="confirm__list">
        <div><dt>Tanggal masuk</dt><dd>{{ formatTampil(form.tanggalMasuk, true) }}</dd></div>
        <div><dt>Cara bayar</dt><dd>{{ form.caraBayar?.NAMA }}</dd></div>
        <div v-if="isBpjs"><dt>Tanggal SEP</dt><dd>{{ formatTampil(form.tanggalSep) }}</dd></div>
        <div><dt>Poli</dt><dd>{{ form.poli?.nama }}</dd></div>
        <div><dt>Dokter</dt><dd>{{ dokterLabel(form.dokter) }}</dd></div>
        <div v-if="form.diagnosa"><dt>Diagnosa</dt><dd>{{ form.diagnosa.dx }}</dd></div>
        <div v-if="isBpjs && form.noRujukan">
          <dt>No. rujukan</dt>
          <dd>{{ form.noRujukan }}<small v-if="form.namaPpkPerujuk" class="confirm__sub">{{ form.namaPpkPerujuk }}</small></dd>
        </div>
        <div v-if="isBpjs && form.noKontrol"><dt>No. surat kontrol</dt><dd>{{ form.noKontrol }}</dd></div>
        <div v-if="isBpjs">
          <dt>Antrian</dt>
          <dd>
            <template v-if="form.tanpaBooking">Tanpa kode booking</template>
            <template v-else>{{ booking.kodeBooking || 'Diambil saat simpan' }}<small v-if="booking.nomorAntrian" class="confirm__sub">No. antrian {{ booking.nomorAntrian }}</small></template>
          </dd>
        </div>
        <div v-if="form.pasienKatarak"><dt>Pasien katarak</dt><dd>Ya</dd></div>
        <div v-if="form.catatan"><dt>Catatan</dt><dd>{{ form.catatan }}</dd></div>
        <div v-if="isBpjs && form.hanyaBpjs" class="confirm__warn"><dt>Mode</dt><dd>Hanya simpan ke BPJS</dd></div>
      </dl>
    </div>

    <template #footer>
      <Button label="Periksa kembali" severity="secondary" outlined :disabled="saving" @click="showConfirm = false" />
      <Button label="Konfirmasi & daftar" icon="pi pi-check" :loading="saving" @click="submit" />
    </template>
  </Dialog>
</template>

<style scoped>
.reg {
  display: grid;
  gap: 1rem;
}

.panel__icon {
  color: var(--p-primary-color);
  margin-right: 0.5rem;
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
.field__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.field__error {
  color: var(--p-red-500);
  font-size: 0.8125rem;
}
.req {
  color: var(--p-red-500);
}

.inline {
  display: flex;
  gap: 0.5rem;
}
.hint {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.ok {
  color: var(--p-green-600);
}
:global(.app-dark) .ok {
  color: var(--p-green-400);
}

.booking {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-bg);
}
.booking--off {
  opacity: 0.55;
}
.booking__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.booking__kode {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
}
.booking__info small {
  color: var(--app-text-muted);
}

.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.check label {
  font-size: 0.875rem;
  font-weight: 400 !important;
  cursor: pointer;
}
.check small {
  color: var(--app-text-muted);
}
.options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin-top: 0.875rem;
}
.bpjs-only {
  margin-top: 0.75rem;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem !important;
  font-weight: 500 !important;
  color: var(--app-text-muted);
  cursor: pointer;
}
.toggle :deep(.p-toggleswitch) {
  width: 2.25rem;
  height: 1.25rem;
}

.actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.875rem 1.25rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.actions__left,
.actions__right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.draft {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.kbd-hint {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
kbd {
  padding: 0.0625rem 0.375rem;
  border: 1px solid var(--app-border);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--app-bg);
  font-family: inherit;
  font-size: 0.75rem;
}

.confirm__pasien {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-radius: var(--app-radius);
  background: var(--app-bg);
}
.confirm__avatar {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  font-weight: 700;
  font-size: 1.125rem;
}
.confirm__name {
  margin: 0;
  font-weight: 700;
}
.confirm__meta {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.confirm__hint {
  margin: 1rem 0 0.5rem;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.confirm__list {
  margin: 0;
}
.confirm__list > div {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  gap: 1rem;
  padding: 0.5rem 0;
}
.confirm__list > div + div {
  border-top: 1px solid var(--app-border);
}
.confirm__list dt {
  color: var(--app-text-muted);
  font-size: 0.875rem;
}
.confirm__list dd {
  margin: 0;
  font-weight: 500;
  word-break: break-word;
}
.confirm__sub {
  display: block;
  font-weight: 400;
  color: var(--app-text-muted);
}
.confirm__warn dd {
  color: var(--p-orange-600);
}

@media (max-width: 768px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
  .kbd-hint {
    display: none;
  }
  .actions__right,
  .actions__right :deep(.p-button) {
    width: 100%;
  }
  .confirm__list > div {
    grid-template-columns: 1fr;
    gap: 0.125rem;
  }
}
</style>
