<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getPendaftaran, OPSI_CARA_KELUAR, simpanTindakLanjut } from '@/services/pendaftaran'
import { getSoap, simpanSoap, cariKeluhanSnomed, getRiwayatSoap, TINGKAT_KESADARAN, OPSI_PLAN } from '@/services/soap'
import { getUserId } from '@/services/session'
import { formatTanggal } from '@/utils/tanggal'
import TerapiObat from './components/TerapiObat.vue'
import OdontogramForm from './components/OdontogramForm.vue'

const activeTab = ref('0')

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const noReg = String(route.params.noreg)
const DRAFT_KEY = `klinik.soap.draft.${noReg}`

// ── Data kunjungan ───────────────────────────────────────────
const kunjungan = ref(null)
const loading = ref(true)
const loadError = ref('')

// ── Form SOAP (nama field = payload save_asesmenkeperawatan) ─
function soapKosong() {
  return {
    suhu: null,
    tensi: '',
    nadi_permenit: null,
    respirasi_perm: null,
    sp2o: null,
    berat_badan: null,
    tinggi_badan: null,
    cgs: '',
    kesadaran_code: '',
    subjek: '',
    objek: '',
    asesmen: '',
    plan: '',
    catatan_dokter: '',
    no_sitb: ''
  }
}
const soap = reactive(soapKosong())
const keluhan = ref([]) // keluhan SNOMED terpilih: { code, caption }

// Angka dari server bisa berupa string / "0"; 0 dianggap belum diisi
const angka = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function isiDariServer(s) {
  Object.assign(soap, soapKosong(), {
    suhu: angka(s.suhu),
    tensi: s.tensi || '',
    nadi_permenit: angka(s.nadi_permenit),
    respirasi_perm: angka(s.respirasi_perm),
    sp2o: angka(s.sp2o),
    berat_badan: angka(s.berat_badan),
    tinggi_badan: angka(s.tinggi_badan),
    cgs: s.cgs || '',
    kesadaran_code: s.kesadaran_code && s.kesadaran_code !== '0' ? String(s.kesadaran_code) : '',
    subjek: s.subjek || '',
    objek: s.objek || '',
    asesmen: s.asesmen || '',
    plan: s.plan || '',
    catatan_dokter: s.catatan_dokter || '',
    no_sitb: s.no_sitb || ''
  })
}

// ── IMT (BMI) ────────────────────────────────────────────────
const imt = computed(() => {
  const bb = soap.berat_badan
  const tb = soap.tinggi_badan
  if (!bb || !tb) return null
  const nilai = bb / Math.pow(tb / 100, 2)
  const kategori =
    nilai < 18.5
      ? ['Berat badan kurang', 'info']
      : nilai < 25
        ? ['Normal', 'success']
        : nilai < 30
          ? ['Berat badan berlebih', 'warn']
          : ['Obesitas', 'danger']
  return { nilai: nilai.toFixed(1), label: kategori[0], severity: kategori[1] }
})

// ── Keluhan SNOMED ───────────────────────────────────────────
const saranKeluhan = ref([])
async function cariKeluhan(event) {
  try {
    saranKeluhan.value = await cariKeluhanSnomed(event.query)
  } catch {
    saranKeluhan.value = []
  }
}
// Keluhan terpilih disalin ke kolom Subjektif (tetap bisa diketik manual)
watch(keluhan, (list) => {
  if (list.length) soap.subjek = list.map((k) => k.caption).filter(Boolean).join(', ')
})

// ── Plan cepat ───────────────────────────────────────────────
const planDipilih = computed(() => soap.plan.split(',').map((s) => s.trim()).filter(Boolean))
function togglePlan(opsi) {
  const list = [...planDipilih.value]
  const i = list.indexOf(opsi)
  if (i === -1) list.push(opsi)
  else list.splice(i, 1)
  soap.plan = list.join(', ')
}

// ── Draft lokal ──────────────────────────────────────────────
const siapDraft = ref(false) // aktif setelah data server termuat
const status = ref('bersih') // bersih | draft | tersimpan
const draftAda = ref(null) // draft lama yang belum dipulihkan
const waktuSimpan = ref(null)
let draftTimer = null

function simpanDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ soap: { ...soap }, keluhan: keluhan.value, at: Date.now() }))
    status.value = 'draft'
  } catch {
    /* abaikan */
  }
}
function hapusDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* abaikan */
  }
  draftAda.value = null
}
function bacaDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY))
  } catch {
    return null
  }
}
function pulihkanDraft() {
  if (!draftAda.value) return
  Object.assign(soap, soapKosong(), draftAda.value.soap)
  keluhan.value = draftAda.value.keluhan || []
  draftAda.value = null
  status.value = 'draft'
}

watch(
  [() => ({ ...soap }), keluhan],
  () => {
    if (!siapDraft.value) return
    clearTimeout(draftTimer)
    draftTimer = setTimeout(simpanDraft, 800)
  },
  { deep: true }
)

const labelStatus = computed(() => {
  if (status.value === 'draft') return { text: 'Ada perubahan belum disimpan (draft lokal)', icon: 'pi pi-pencil', cls: 'warn' }
  if (status.value === 'tersimpan')
    return {
      text: waktuSimpan.value ? `Tersimpan ${waktuSimpan.value.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Tersimpan di server',
      icon: 'pi pi-check-circle',
      cls: 'ok'
    }
  return { text: 'Belum ada SOAP', icon: 'pi pi-circle', cls: '' }
})

// ── Simpan ───────────────────────────────────────────────────
const saving = ref(false)
const errors = ref({})

function validate() {
  const e = {}
  if (!soap.subjek.trim()) e.subjek = 'Subjektif (keluhan) wajib diisi'
  if (!soap.asesmen.trim()) e.asesmen = 'Asesmen wajib diisi'
  if (soap.tensi && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(soap.tensi.trim())) e.tensi = 'Format tensi: sistol/diastol, mis. 120/80'
  errors.value = e
  return Object.keys(e).length === 0
}

async function simpan() {
  if (saving.value) return
  if (!validate()) {
    toast.add({ severity: 'warn', summary: 'Data belum lengkap', detail: 'Periksa kembali isian yang ditandai.', life: 3500 })
    return
  }
  saving.value = true
  try {
    const level = TINGKAT_KESADARAN.find((l) => l.code === soap.kesadaran_code)
    await simpanSoap({
      ...soap,
      tensi: soap.tensi.replace(/\s/g, ''),
      no_register: noReg,
      kesadaran: level?.display || '',
      subject_snomad: keluhan.value.map((k) => ({ code: k.code, caption: k.caption }))
    })
    clearTimeout(draftTimer)
    hapusDraft()
    status.value = 'tersimpan'
    waktuSimpan.value = new Date()
    toast.add({ severity: 'success', summary: 'SOAP tersimpan', detail: kunjungan.value?.NAMAPASIEN, life: 3000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

function onKeydown(e) {
  if (activeTab.value !== '0') return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    simpan()
  }
}

// ── Riwayat kunjungan ────────────────────────────────────────
const riwayat = ref([])
const loadingRiwayat = ref(false)
const riwayatLain = computed(() => riwayat.value.filter((r) => r.NOREGISTER !== noReg))

const showRiwayat = ref(false)
const dokterRiwayat = ref(null)
const dokterRiwayatOpsi = computed(() => [...new Set(riwayatLain.value.map((r) => r.NAMADOKTER).filter(Boolean))])
const riwayatTersaring = computed(() => (dokterRiwayat.value ? riwayatLain.value.filter((r) => r.NAMADOKTER === dokterRiwayat.value) : riwayatLain.value))

function waktuLalu(tgl) {
  const t = new Date(tgl)
  if (isNaN(t)) return ''
  const hari = Math.floor((Date.now() - t) / 86400000)
  if (hari < 1) return 'Hari ini'
  if (hari === 1) return '1 hari yang lalu'
  if (hari < 7) return `${hari} hari yang lalu`
  if (hari < 30) return `${Math.floor(hari / 7)} minggu yang lalu`
  if (hari < 365) return `${Math.floor(hari / 30)} bulan yang lalu`
  return `${Math.floor(hari / 365)} tahun yang lalu`
}

async function muatRiwayat(norm) {
  loadingRiwayat.value = true
  try {
    riwayat.value = await getRiwayatSoap(norm)
  } catch {
    riwayat.value = []
  } finally {
    loadingRiwayat.value = false
  }
}

function salinSoap(r) {
  const isi = () => {
    soap.subjek = r.SUBJEK || ''
    soap.objek = r.OBJEK || ''
    soap.asesmen = r.ASSESMEN || ''
    soap.plan = r.PLAN || ''
  }
  const adaIsi = soap.subjek || soap.objek || soap.asesmen || soap.plan
  if (!adaIsi) return isi()
  confirm.require({
    header: 'Salin SOAP?',
    message: `Isi S, O, A, dan P sekarang akan diganti dengan SOAP kunjungan ${formatTanggal(r.TGLREG) || r.NOREGISTER}.`,
    icon: 'pi pi-copy',
    acceptLabel: 'Salin',
    rejectLabel: 'Batal',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: isi
  })
}

// ── Tampilan pasien ──────────────────────────────────────────
const jk = (v) => (String(v).toUpperCase().startsWith('P') ? 'Perempuan' : String(v).toUpperCase().startsWith('L') ? 'Laki-laki' : '')
const usia = computed(() => {
  const u = kunjungan.value?.USIA_PASIEN
  return u ? `${u.tahun ?? 0} th ${u.bulan ?? 0} bl` : ''
})

// Tab Odontogram hanya untuk poli gigi (kode ruangan GIG, atau nama poli mengandung "gigi")
const isPoliGigi = computed(() => {
  const kode = String(kunjungan.value?.KODERUANGAN || '').toUpperCase()
  return kode === 'GIG' || /gigi/i.test(kunjungan.value?.POLI || '')
})

// ── Tindak lanjut (disposisi setelah selesai diperiksa) ───────
const showTindakLanjut = ref(false)
const caraKeluarDipilih = ref(null)
const savingTindakLanjut = ref(false)

const sudahTindakLanjut = computed(() => Number(kunjungan.value?.STATUS) > 0)
const labelTindakLanjut = computed(() => kunjungan.value?.KETERANGAN || '')

function bukaTindakLanjut() {
  caraKeluarDipilih.value = null
  showTindakLanjut.value = true
}

async function simpanTindakLanjutForm() {
  if (!caraKeluarDipilih.value) {
    toast.add({ severity: 'warn', summary: 'Pilih tindak lanjut', detail: 'Tentukan cara keluar pasien terlebih dahulu', life: 3000 })
    return
  }
  savingTindakLanjut.value = true
  try {
    await simpanTindakLanjut(kunjungan.value, caraKeluarDipilih.value, getUserId())
    showTindakLanjut.value = false
    toast.add({ severity: 'success', summary: 'Tindak lanjut tersimpan', detail: kunjungan.value?.NAMAPASIEN, life: 3500 })
    kunjungan.value = await getPendaftaran(noReg)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan tindak lanjut', detail: err.message, life: 5000 })
  } finally {
    savingTindakLanjut.value = false
  }
}

function kembali() {
  const kode = kunjungan.value?.KODERUANGAN
  if (kode) router.push({ name: 'rawat-jalan', params: { kode } })
  else router.back()
}

// Peringatan bila meninggalkan halaman dengan perubahan belum disimpan (draft tetap ada)
onBeforeRouteLeave(() => {
  if (status.value !== 'draft') return true
  return new Promise((resolve) => {
    confirm.require({
      header: 'Tinggalkan halaman?',
      message: 'SOAP belum disimpan ke server. Draft tetap tersimpan di browser ini. Tinggalkan halaman?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Tinggalkan',
      rejectLabel: 'Batal',
      acceptProps: { severity: 'danger' },
      rejectProps: { severity: 'secondary', outlined: true },
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false)
    })
  })
})

// ── Muat awal ────────────────────────────────────────────────
onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  try {
    const [k, s] = await Promise.all([getPendaftaran(noReg), getSoap(noReg)])
    kunjungan.value = k
    if (s) {
      isiDariServer(s)
      status.value = 'tersimpan'
    }
    const draft = bacaDraft()
    if (draft?.soap) draftAda.value = draft
    muatRiwayat(k.NOMR)
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
    // Aktifkan draft setelah pengisian awal selesai agar tidak langsung dianggap berubah
    setTimeout(() => (siapDraft.value = true), 0)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(draftTimer)
})
</script>

<template>
  <div class="page">
    <div v-if="loading" class="panel status"><i class="pi pi-spin pi-spinner" /> Memuat data kunjungan…</div>
    <Message v-else-if="loadError" severity="error" icon="pi pi-exclamation-circle">{{ loadError }}</Message>

    <template v-else-if="kunjungan">
      <!-- Identitas pasien -->
      <header class="pasien">
        <Button icon="pi pi-arrow-left" text rounded severity="secondary" aria-label="Kembali ke daftar pasien" @click="kembali" />
        <div class="pasien__avatar">{{ kunjungan.NAMAPASIEN?.charAt(0)?.toUpperCase() }}</div>
        <div class="pasien__main">
          <h1 class="pasien__nama">{{ kunjungan.NAMAPASIEN }}</h1>
          <p class="pasien__meta">
            RM <strong>{{ kunjungan.NOMR }}</strong>
            <template v-if="jk(kunjungan.JENISKELAMIN)"> · {{ jk(kunjungan.JENISKELAMIN) }}</template>
            <template v-if="usia"> · {{ usia }}</template>
            <template v-if="kunjungan.TGLLAHIR"> · lahir {{ formatTanggal(kunjungan.TGLLAHIR) }}</template>
          </p>
        </div>
        <dl class="pasien__info">
          <div><dt>Poli</dt><dd>{{ kunjungan.POLI || '—' }}</dd></div>
          <div><dt>Dokter</dt><dd>{{ kunjungan.NAMADOKTER || '—' }}</dd></div>
          <div><dt>Cara bayar</dt><dd>{{ kunjungan.CARABAYAR || '—' }}</dd></div>
          <div v-if="kunjungan.NOMORANTRIAN"><dt>Antrian</dt><dd>{{ kunjungan.NOMORANTRIAN }}</dd></div>
          <div v-if="kunjungan.DIAGNOSA_AWAL">
            <dt>Diagnosa awal</dt>
            <dd>{{ kunjungan.DIAGNOSA_AWAL }}<template v-if="kunjungan.DX_CAPTION"> - {{ kunjungan.DX_CAPTION }}</template></dd>
          </div>
        </dl>
        <Button
          label="Riwayat Kunjungan"
          icon="pi pi-history"
          severity="secondary"
          outlined
          :badge="riwayatLain.length ? String(riwayatLain.length) : null"
          @click="showRiwayat = true"
        />
      </header>

      <Message v-if="draftAda" severity="info" icon="pi pi-history" class="draft-msg">
        <div class="draft-msg__body">
          <span>Ada draft SOAP yang belum disimpan ({{ new Date(draftAda.at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) }}).</span>
          <span class="draft-msg__actions">
            <Button label="Pulihkan" size="small" @click="pulihkanDraft" />
            <Button label="Buang" size="small" severity="secondary" text @click="hapusDraft" />
          </span>
        </div>
      </Message>

      <div class="pemeriksaan-grid">
        <div class="pemeriksaan-grid__main">
          <Tabs v-model:value="activeTab">
            <TabList>
              <Tab value="0"><i class="pi pi-file-edit" /> Pemeriksaan</Tab>
              <Tab v-if="isPoliGigi" value="2"><i class="pi pi-face-smile" /> Odontogram</Tab>
              <Tab value="1"><i class="pi pi-pills" /> Terapi / Obat-obatan</Tab>
            </TabList>
            <TabPanels>
              <TabPanel value="0">
                <div class="tab-content">
          <!-- Tanda vital -->
          <section class="panel">
            <header class="panel__header">
              <h2 class="panel__title"><i class="pi pi-heart panel__icon" />Tanda vital</h2>
              <Tag v-if="imt" :value="`IMT ${imt.nilai} · ${imt.label}`" :severity="imt.severity" />
            </header>
            <div class="vital-grid">
              <div class="field">
                <label for="v-tensi">Tekanan darah</label>
                <InputGroup>
                  <InputText id="v-tensi" v-model="soap.tensi" placeholder="120/80" :invalid="!!errors.tensi" @update:modelValue="errors.tensi = ''" />
                  <InputGroupAddon>mmHg</InputGroupAddon>
                </InputGroup>
                <small v-if="errors.tensi" class="field__error">{{ errors.tensi }}</small>
              </div>
              <div class="field">
                <label for="v-nadi">Nadi</label>
                <InputGroup>
                  <InputNumber v-model="soap.nadi_permenit" inputId="v-nadi" :min="0" :max="300" placeholder="80" />
                  <InputGroupAddon>x/mnt</InputGroupAddon>
                </InputGroup>
              </div>
              <div class="field">
                <label for="v-suhu">Suhu</label>
                <InputGroup>
                  <InputNumber v-model="soap.suhu" inputId="v-suhu" :min="25" :max="45" :minFractionDigits="0" :maxFractionDigits="1" locale="id-ID" placeholder="36,5" />
                  <InputGroupAddon>°C</InputGroupAddon>
                </InputGroup>
              </div>
              <div class="field">
                <label for="v-rr">Respirasi</label>
                <InputGroup>
                  <InputNumber v-model="soap.respirasi_perm" inputId="v-rr" :min="0" :max="100" placeholder="20" />
                  <InputGroupAddon>x/mnt</InputGroupAddon>
                </InputGroup>
              </div>
              <div class="field">
                <label for="v-spo2">SpO₂</label>
                <InputGroup>
                  <InputNumber v-model="soap.sp2o" inputId="v-spo2" :min="0" :max="100" placeholder="98" />
                  <InputGroupAddon>%</InputGroupAddon>
                </InputGroup>
              </div>
              <div class="field">
                <label for="v-bb">Berat badan</label>
                <InputGroup>
                  <InputNumber v-model="soap.berat_badan" inputId="v-bb" :min="0" :max="400" :maxFractionDigits="1" locale="id-ID" placeholder="60" />
                  <InputGroupAddon>kg</InputGroupAddon>
                </InputGroup>
              </div>
              <div class="field">
                <label for="v-tb">Tinggi badan</label>
                <InputGroup>
                  <InputNumber v-model="soap.tinggi_badan" inputId="v-tb" :min="0" :max="250" placeholder="165" />
                  <InputGroupAddon>cm</InputGroupAddon>
                </InputGroup>
              </div>
              <div class="field">
                <label for="v-gcs">GCS</label>
                <InputText id="v-gcs" v-model="soap.cgs" placeholder="E4 V5 M6" fluid />
              </div>
            </div>
            <div class="field kesadaran">
              <label id="lbl-kesadaran">Kesadaran</label>
              <SelectButton
                v-model="soap.kesadaran_code"
                :options="TINGKAT_KESADARAN"
                optionLabel="display"
                optionValue="code"
                aria-labelledby="lbl-kesadaran"
              />
            </div>
          </section>

          <!-- SOAP -->
          <section class="panel soap">
            <header class="panel__header">
              <h2 class="panel__title"><i class="pi pi-file-edit panel__icon" />SOAP</h2>
            </header>

            <div class="soap__block">
              <span class="soap__letter">S</span>
              <div class="field">
                <label for="s-keluhan">Subjektif <span class="req">*</span></label>
                <AutoComplete
                  v-model="keluhan"
                  inputId="s-keluhan"
                  :suggestions="saranKeluhan"
                  optionLabel="caption"
                  multiple
                  :minLength="3"
                  :delay="400"
                  placeholder="Cari keluhan (SNOMED CT), minimal 3 huruf"
                  fluid
                  @complete="cariKeluhan"
                />
                <Textarea
                  v-model="soap.subjek"
                  rows="3"
                  autoResize
                  placeholder="Keluhan utama, riwayat penyakit sekarang"
                  :invalid="!!errors.subjek"
                  fluid
                  aria-label="Subjektif"
                  @update:modelValue="errors.subjek = ''"
                />
                <small v-if="errors.subjek" class="field__error">{{ errors.subjek }}</small>
              </div>
            </div>

            <div class="soap__block">
              <span class="soap__letter">O</span>
              <div class="field">
                <label for="s-objek">Objektif</label>
                <Textarea id="s-objek" v-model="soap.objek" rows="3" autoResize placeholder="Pemeriksaan fisik, hasil penunjang" fluid />
              </div>
            </div>

            <div class="soap__block">
              <span class="soap__letter">A</span>
              <div class="field">
                <label for="s-asesmen">Asesmen <span class="req">*</span></label>
                <Textarea
                  id="s-asesmen"
                  v-model="soap.asesmen"
                  rows="2"
                  autoResize
                  placeholder="Diagnosis kerja / diagnosis banding"
                  :invalid="!!errors.asesmen"
                  fluid
                  @update:modelValue="errors.asesmen = ''"
                />
                <small v-if="errors.asesmen" class="field__error">{{ errors.asesmen }}</small>
              </div>
            </div>

            <div class="soap__block">
              <span class="soap__letter">P</span>
              <div class="field">
                <label for="s-plan">Plan</label>
                <div class="plan-chips" role="group" aria-label="Pilihan plan cepat">
                  <button
                    v-for="opsi in OPSI_PLAN"
                    :key="opsi"
                    type="button"
                    class="chip"
                    :class="{ 'chip--on': planDipilih.includes(opsi) }"
                    :aria-pressed="planDipilih.includes(opsi)"
                    @click="togglePlan(opsi)"
                  >
                    {{ opsi }}
                  </button>
                </div>
                <Textarea id="s-plan" v-model="soap.plan" rows="2" autoResize placeholder="Rencana tata laksana, edukasi" fluid />
              </div>
            </div>
          </section>

          <!-- Catatan -->
          <section class="panel">
            <header class="panel__header">
              <h2 class="panel__title"><i class="pi pi-pencil panel__icon" />Catatan dokter</h2>
            </header>
            <div class="catatan-grid">
              <div class="field">
                <label for="c-catatan">Catatan</label>
                <Textarea id="c-catatan" v-model="soap.catatan_dokter" rows="2" autoResize placeholder="Instruksi atau catatan tambahan" fluid />
              </div>
              <div class="field">
                <label for="c-sitb">No. SITB <small>(pasien TB)</small></label>
                <InputText id="c-sitb" v-model="soap.no_sitb" placeholder="Opsional" fluid />
              </div>
            </div>
          </section>
                </div>
              </TabPanel>
              <TabPanel value="1">
                <TerapiObat v-if="kunjungan" :datapasien="kunjungan" />
              </TabPanel>
              <TabPanel v-if="isPoliGigi" value="2">
                <OdontogramForm v-if="kunjungan" :datapasien="kunjungan" />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </div>

      <!-- Action bar -->
      <div v-if="activeTab === '0'" class="actions">
        <span class="actions__status" :class="labelStatus.cls"><i :class="labelStatus.icon" /> {{ labelStatus.text }}</span>
        <div class="actions__right">
          <Tag v-if="sudahTindakLanjut" severity="info" :value="`Tindak lanjut: ${labelTindakLanjut}`" icon="pi pi-check-circle" />
          <span class="kbd-hint"><kbd>Ctrl</kbd> + <kbd>S</kbd></span>
          <Button label="Simpan SOAP" icon="pi pi-save" severity="secondary" outlined :loading="saving" @click="simpan" />
          <Button label="Tindak Lanjut" icon="pi pi-send" @click="bukaTindakLanjut" />
        </div>
      </div>

      <!-- Dialog: Tindak lanjut -->
      <Dialog v-model:visible="showTindakLanjut" modal header="Tindak Lanjut Pasien" :style="{ width: '28rem', maxWidth: '96vw' }" :closable="!savingTindakLanjut">
        <p class="muted" style="margin-top: 0">Tentukan apa yang terjadi setelah pasien selesai diperiksa.</p>
        <div class="tindaklanjut-opsi">
          <button
            v-for="opsi in OPSI_CARA_KELUAR"
            :key="opsi.kode"
            type="button"
            class="tl-opsi"
            :class="{ 'tl-opsi--on': caraKeluarDipilih === opsi.kode }"
            @click="caraKeluarDipilih = opsi.kode"
          >
            <i :class="opsi.icon" />
            <span>{{ opsi.label }}</span>
          </button>
        </div>
        <Message v-if="sudahTindakLanjut" severity="warn" icon="pi pi-exclamation-triangle" class="tl-warn">
          Kunjungan ini sudah ditandai "{{ labelTindakLanjut }}" sebelumnya. Menyimpan lagi akan menimpa status tersebut.
        </Message>
        <template #footer>
          <Button label="Batal" severity="secondary" outlined :disabled="savingTindakLanjut" @click="showTindakLanjut = false" />
          <Button label="Simpan" icon="pi pi-check" :loading="savingTindakLanjut" @click="simpanTindakLanjutForm" />
        </template>
      </Dialog>

      <!-- Dialog: Riwayat kunjungan -->
      <Dialog v-model:visible="showRiwayat" modal header="Riwayat Kunjungan" :style="{ width: '1100px', maxWidth: '96vw' }">
        <div class="riwayat-filter">
          <label for="riwayat-dokter">Filter dokter</label>
          <Select inputId="riwayat-dokter" v-model="dokterRiwayat" :options="dokterRiwayatOpsi" placeholder="Semua dokter" showClear style="min-width: 16rem" />
        </div>

        <p v-if="loadingRiwayat" class="muted"><i class="pi pi-spin pi-spinner" /> Memuat riwayat…</p>
        <p v-else-if="!riwayatTersaring.length" class="muted">Belum ada kunjungan sebelumnya.</p>

        <div v-else class="riwayat-grid">
          <article v-for="r in riwayatTersaring" :key="r.NOREGISTER" class="panel riwayat-card">
            <div class="riwayat-card__col">
              <div class="riwayat-card__hdr"><i class="pi pi-calendar" /><h3>Kunjungan</h3></div>
              <Tag :value="formatTanggal(r.TGLREG) || r.NOREGISTER" />
              <span class="riwayat-card__ago">{{ waktuLalu(r.TGLREG) }}</span>
              <dl class="riwayat-card__detail">
                <div><dt>Dokter</dt><dd>{{ r.NAMADOKTER || '—' }}</dd></div>
                <div><dt>Poli</dt><dd>{{ r.POLI || '—' }}</dd></div>
                <div><dt>No. registrasi</dt><dd>{{ r.NOREGISTER }}</dd></div>
              </dl>
            </div>

            <div class="riwayat-card__col">
              <div class="riwayat-card__hdr">
                <i class="pi pi-heart-fill" /><h3>Pemeriksaan</h3>
                <Button
                  v-if="r.SUBJEK || r.ASSESMEN"
                  icon="pi pi-copy"
                  text
                  rounded
                  size="small"
                  class="riwayat-card__copy"
                  v-tooltip.top="'Salin ke Pemeriksaan'"
                  @click="salinSoap(r)"
                />
              </div>
              <div v-if="r.TENSI || r.SUHU || r.SP2O || r.NADI" class="riwayat-card__vitals">
                <span v-if="r.SUHU">Suhu {{ r.SUHU }}°C</span>
                <span v-if="r.TENSI">TD {{ r.TENSI }}</span>
                <span v-if="r.SP2O">SpO₂ {{ r.SP2O }}%</span>
                <span v-if="r.NADI">Nadi {{ r.NADI }}</span>
              </div>
              <dl class="riwayat-card__soap">
                <template v-if="r.SUBJEK"><dt>S</dt><dd>{{ r.SUBJEK }}</dd></template>
                <template v-if="r.OBJEK"><dt>O</dt><dd>{{ r.OBJEK }}</dd></template>
                <template v-if="r.ASSESMEN"><dt>A</dt><dd>{{ r.ASSESMEN }}</dd></template>
                <template v-if="r.PLAN"><dt>P</dt><dd>{{ r.PLAN }}</dd></template>
              </dl>
              <p v-if="!r.SUBJEK && !r.ASSESMEN" class="muted small">Tidak ada SOAP.</p>
            </div>
          </article>
        </div>

        <template #footer>
          <Button label="Tutup" icon="pi pi-times" severity="secondary" outlined @click="showRiwayat = false" />
        </template>
      </Dialog>
    </template>
  </div>
</template>

<style scoped>
.status {
  color: var(--app-text-muted);
}
.muted {
  margin: 0;
  color: var(--app-text-muted);
}
.small {
  font-size: 0.8125rem;
}

/* Identitas pasien */
.pasien {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  flex-wrap: wrap;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.pasien__avatar {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  font-size: 1.25rem;
  font-weight: 700;
}
.pasien__main {
  min-width: 12rem;
}
.pasien__nama {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}
.pasien__meta {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.pasien__info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin: 0 0 0 auto;
}
.pasien__info dt {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.pasien__info dd {
  margin: 0;
  font-weight: 600;
  font-size: 0.875rem;
}

.draft-msg {
  margin-bottom: 1rem;
}
.draft-msg__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  width: 100%;
}
.draft-msg__actions {
  display: flex;
  gap: 0.25rem;
}

/* Tata letak */
.pemeriksaan-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}
.pemeriksaan-grid__main {
  display: grid;
  gap: 1rem;
  min-width: 0;
}
.tab-content {
  display: grid;
  gap: 1rem;
  padding-top: 1rem;
}
.panel__icon {
  color: var(--p-primary-color);
  margin-right: 0.5rem;
  font-size: 0.9375rem;
}

.field {
  display: grid;
  gap: 0.375rem;
  align-content: start;
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

.vital-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.875rem 1rem;
}
.vital-grid :deep(.p-inputnumber),
.vital-grid :deep(.p-inputnumber-input) {
  width: 100%;
  min-width: 0;
}
.kesadaran {
  margin-top: 1rem;
}
.kesadaran :deep(.p-selectbutton) {
  flex-wrap: wrap;
}

/* SOAP */
.soap {
  display: grid;
  gap: 1rem;
}
.soap .panel__header {
  margin-bottom: 0;
}
.soap__block {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: 0.75rem;
}
.soap__letter {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--app-radius);
  background: var(--p-primary-50);
  color: var(--p-primary-color);
  font-weight: 800;
  font-size: 1.125rem;
}
:global(.app-dark) .soap__letter {
  background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
}

.plan-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-panel);
  color: var(--app-text);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.chip:hover {
  border-color: var(--p-primary-color);
}
.chip--on {
  border-color: var(--p-primary-color);
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.catatan-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 1rem;
}

/* Dialog: Riwayat kunjungan */
.riwayat-filter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.625rem;
  margin-bottom: 1rem;
}
.riwayat-filter label {
  font-size: 0.875rem;
  font-weight: 600;
}
.riwayat-grid {
  display: grid;
  gap: 1rem;
  max-height: 65vh;
  overflow-y: auto;
  padding-right: 0.25rem;
}
.riwayat-card {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  gap: 1.5rem;
}
.riwayat-card__col {
  display: grid;
  gap: 0.625rem;
  align-content: start;
}
.riwayat-card__hdr {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.riwayat-card__hdr i {
  color: var(--p-primary-color);
}
.riwayat-card__hdr h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
}
.riwayat-card__copy {
  margin-left: auto;
}
.riwayat-card__ago {
  font-size: 0.8125rem;
  font-style: italic;
  color: var(--app-text-muted);
}
.riwayat-card__detail {
  display: grid;
  gap: 0.375rem;
  margin: 0;
}
.riwayat-card__detail div {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.riwayat-card__detail dt {
  color: var(--app-text-muted);
}
.riwayat-card__detail dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
.riwayat-card__vitals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}
.riwayat-card__vitals span {
  padding: 0.125rem 0.5rem;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.riwayat-card__soap {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  gap: 0.25rem 0.5rem;
  margin: 0;
  font-size: 0.875rem;
}
.riwayat-card__soap dt {
  font-weight: 800;
  color: var(--p-primary-color);
}
.riwayat-card__soap dd {
  margin: 0;
  white-space: pre-line;
  word-break: break-word;
}
@media (max-width: 640px) {
  .riwayat-card {
    grid-template-columns: 1fr;
  }
}

/* Dialog: Tindak lanjut */
.tindaklanjut-opsi {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.625rem;
  margin-bottom: 0.75rem;
}
.tl-opsi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 0.875rem 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-panel);
  color: var(--app-text);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.tl-opsi i {
  font-size: 1.125rem;
  color: var(--app-text-muted);
}
.tl-opsi:hover {
  border-color: var(--p-primary-color);
}
.tl-opsi--on {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50, #eff6ff);
}
.tl-opsi--on i {
  color: var(--p-primary-color);
}
.tl-warn {
  margin-top: 0.5rem;
}

/* Action bar */
.actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 1rem;
  padding: 0.75rem 1.25rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.actions__status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.actions__status.warn {
  color: var(--p-orange-600);
}
.actions__status.ok {
  color: var(--p-green-600);
}
:global(.app-dark) .actions__status.warn {
  color: var(--p-orange-400);
}
:global(.app-dark) .actions__status.ok {
  color: var(--p-green-400);
}
.actions__right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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

@media (max-width: 768px) {
  .vital-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .catatan-grid {
    grid-template-columns: 1fr;
  }
  .pasien__info {
    margin-left: 0;
  }
  .kbd-hint {
    display: none;
  }
}
</style>
