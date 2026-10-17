<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getDaftarDokter } from '@/services/dokter'
import { getPoli } from '@/services/pendaftaran'
import { HARI, KAPASITAS_BAWAAN, getJadwalSemua, jadwalMilik, parseJam, simpanJadwalDokter, linkJadwalPublik } from '@/services/jadwalDokter'

const toast = useToast()
const confirm = useConfirm()

const dokter = ref([])
const poli = ref([])
const rows = ref([]) // semua baris m_dokter_jadwal klinik ini
const loading = ref(false)
const keyword = ref('')

const namaPoli = computed(() => Object.fromEntries(poli.value.map((p) => [p.KodePoliBPJS, p.nama])))

async function muat() {
  loading.value = true
  const [d, p, j] = await Promise.allSettled([getDaftarDokter(), getPoli(), getJadwalSemua()])
  if (d.status === 'fulfilled') dokter.value = d.value
  else toast.add({ severity: 'error', summary: 'Gagal memuat dokter', detail: d.reason?.message, life: 5000 })
  if (p.status === 'fulfilled') poli.value = p.value
  if (j.status === 'fulfilled') rows.value = j.value
  else toast.add({ severity: 'error', summary: 'Gagal memuat jadwal', detail: j.reason?.message, life: 5000 })
  loading.value = false
}

// ── Daftar dokter ────────────────────────────────────────────
const dokterTampil = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return dokter.value
  return dokter.value.filter((d) => [d.NAMADOKTER, namaPoli.value[d.KDPOLY_BPJS]].some((v) => String(v ?? '').toLowerCase().includes(q)))
})

// Ringkasan hari praktik per dokter, mis. "Sen, Rab, Jum"
function ringkasan(d) {
  const hari = [...new Set(jadwalMilik(rows.value, d).map((r) => Number(r.hari)))].sort((a, b) => a - b)
  return hari.map((h) => HARI.find((x) => x.hari === h)?.nama.slice(0, 3)).filter(Boolean).join(', ')
}

// ── Editor jadwal ────────────────────────────────────────────
const terpilih = ref(null)
const draft = ref([]) // [{ hari, nama, aktif, sesi: [{ mulai: Date, selesai: Date, kapasitas }] }]
const awal = ref('')
const saving = ref(false)

const jam = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m)
}
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const snapshot = () => JSON.stringify(draft.value.map((h) => [h.aktif, h.sesi.map((s) => [s.mulai && hhmm(s.mulai), s.selesai && hhmm(s.selesai), s.kapasitas])]))
const dirty = computed(() => !!terpilih.value && snapshot() !== awal.value)

function sesiBaru(mulai = '08:00', selesai = '12:00') {
  return { mulai: jam(mulai), selesai: jam(selesai), kapasitas: KAPASITAS_BAWAAN }
}

function susunDraft(d) {
  const milik = jadwalMilik(rows.value, d)
  draft.value = HARI.map(({ hari, nama }) => {
    const sesi = milik
      .filter((r) => Number(r.hari) === hari && !Number(r.libur))
      .map((r) => ({ ...r, j: parseJam(r.jadwal) }))
      .filter((r) => r.j)
      .sort((a, b) => a.j.mulai.localeCompare(b.j.mulai))
      .map((r) => ({ mulai: jam(r.j.mulai), selesai: jam(r.j.selesai), kapasitas: Number(r.kapasitaspasien) || 0 }))
    return { hari, nama, aktif: sesi.length > 0, sesi }
  })
  awal.value = snapshot()
}

function pilih(d) {
  if (terpilih.value?.KDDOKTER === d.KDDOKTER) return
  const ganti = () => {
    terpilih.value = d
    susunDraft(d)
  }
  if (!dirty.value) return ganti()
  confirm.require({
    header: 'Buang perubahan?',
    message: 'Jadwal dokter sebelumnya belum disimpan. Pindah dokter akan membuang perubahan itu.',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Buang & pindah',
    rejectLabel: 'Kembali',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: ganti
  })
}

function toggleHari(h) {
  if (h.aktif && !h.sesi.length) h.sesi.push(sesiBaru())
  if (!h.aktif) h.sesi = []
}

function tambahSesi(h) {
  const terakhir = h.sesi[h.sesi.length - 1]
  h.sesi.push(terakhir ? sesiBaru(hhmm(terakhir.selesai), '17:00') : sesiBaru())
}

function hapusSesi(h, i) {
  h.sesi.splice(i, 1)
  if (!h.sesi.length) h.aktif = false
}

// Salin sesi satu hari ke semua hari lain yang sedang aktif
function salinKeHariAktif(h) {
  for (const x of draft.value) {
    if (x === h || !x.aktif) continue
    x.sesi = h.sesi.map((s) => ({ ...s, mulai: new Date(s.mulai), selesai: new Date(s.selesai) }))
  }
  toast.add({ severity: 'info', summary: 'Disalin', detail: `Sesi ${h.nama} disalin ke hari aktif lainnya`, life: 2500 })
}

const jumlahSesi = computed(() => draft.value.reduce((t, h) => t + (h.aktif ? h.sesi.length : 0), 0))

function validasi() {
  for (const h of draft.value) {
    if (!h.aktif) continue
    const sesi = h.sesi.map((s) => ({ ...s, a: s.mulai && hhmm(s.mulai), b: s.selesai && hhmm(s.selesai) })).sort((x, y) => String(x.a).localeCompare(String(y.a)))
    for (let i = 0; i < sesi.length; i++) {
      const s = sesi[i]
      if (!s.a || !s.b) return `${h.nama}: jam mulai dan selesai wajib diisi`
      if (s.a >= s.b) return `${h.nama}: jam selesai harus setelah jam mulai (${s.a} – ${s.b})`
      if (!(Number(s.kapasitas) >= 0)) return `${h.nama}: kapasitas tidak valid`
      if (i > 0 && s.a < sesi[i - 1].b) return `${h.nama}: sesi ${sesi[i - 1].a}–${sesi[i - 1].b} dan ${s.a}–${s.b} bertabrakan`
    }
  }
  return ''
}

async function simpan() {
  const salah = validasi()
  if (salah) return toast.add({ severity: 'warn', summary: 'Jadwal belum valid', detail: salah, life: 5000 })
  saving.value = true
  const d = terpilih.value
  try {
    // Ambil jadwal terbaru dulu: jadwal dokter lain di poli & hari yang sama harus ikut terkirim ulang
    const terbaru = await getJadwalSemua()
    const sesi = draft.value.flatMap((h) =>
      h.aktif ? h.sesi.map((s) => ({ hari: h.hari, mulai: hhmm(s.mulai), selesai: hhmm(s.selesai), kapasitas: s.kapasitas })) : []
    )
    await simpanJadwalDokter(d, namaPoli.value[d.KDPOLY_BPJS], sesi, terbaru)
    rows.value = await getJadwalSemua()
    // Baca ulang dari server: pastikan semua sesi benar-benar tersimpan dan terbaca untuk dokter ini
    const terbaca = jadwalMilik(rows.value, d).length
    if (terbaca < sesi.length) {
      console.warn('Jadwal dokter tidak terbaca setelah simpan', { dokter: d, dikirim: sesi, barisServer: rows.value })
      toast.add({
        severity: 'error',
        summary: 'Jadwal belum terbaca dari server',
        detail: `Dikirim ${sesi.length} sesi, terbaca ${terbaca} untuk ${d.NAMADOKTER} (kode ${d.KODE_DOKTER_BPJS || d.KDDOKTER}). Total ${rows.value.length} baris jadwal di klinik ini.`,
        life: 12000
      })
    } else {
      toast.add({ severity: 'success', summary: 'Jadwal tersimpan', detail: d.NAMADOKTER, life: 3000 })
    }
    susunDraft(d)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan jadwal', detail: err.message, life: 7000 })
    rows.value = await getJadwalSemua().catch(() => rows.value)
  } finally {
    saving.value = false
  }
}

// ── Bagikan (halaman publik tanpa login) ─────────────────────
const showBagikan = ref(false)
const linkPublik = computed(() => linkJadwalPublik())

async function salinLink() {
  try {
    await navigator.clipboard.writeText(linkPublik.value)
    toast.add({ severity: 'success', summary: 'Tautan disalin', life: 2500 })
  } catch {
    toast.add({ severity: 'warn', summary: 'Gagal menyalin', detail: 'Pilih teks tautan lalu salin manual.', life: 4000 })
  }
}
const bukaLink = () => window.open(linkPublik.value, '_blank', 'noopener')
const kirimWa = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Jadwal praktik dokter: ${linkPublik.value}`)}`, '_blank', 'noopener')

function reset() {
  if (terpilih.value) susunDraft(terpilih.value)
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Jadwal Dokter</h1>
        <p class="page-subtitle">Atur hari dan jam praktik setiap dokter.</p>
      </div>
      <div class="head-actions">
        <Button icon="pi pi-share-alt" label="Bagikan" severity="secondary" outlined @click="showBagikan = true" />
        <Button icon="pi pi-refresh" label="Muat ulang" severity="secondary" outlined :loading="loading" @click="muat" />
      </div>
    </header>

    <Dialog v-model:visible="showBagikan" modal header="Bagikan jadwal dokter" :style="{ width: '32rem', maxWidth: '96vw' }">
      <p class="muted">Siapa pun yang memiliki tautan ini dapat melihat jadwal praktik semua dokter tanpa login.</p>
      <InputGroup class="bagikan__link">
        <InputText :modelValue="linkPublik" readonly fluid aria-label="Tautan jadwal" @focus="(e) => e.target.select()" />
        <Button icon="pi pi-copy" label="Salin" @click="salinLink" />
      </InputGroup>
      <template #footer>
        <Button label="Buka halaman" icon="pi pi-external-link" severity="secondary" outlined @click="bukaLink" />
        <Button label="Kirim via WhatsApp" icon="pi pi-whatsapp" severity="success" @click="kirimWa" />
      </template>
    </Dialog>

    <div class="layout">
      <!-- Daftar dokter -->
      <section class="panel list">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari dokter atau poli" fluid />
        </IconField>
        <p v-if="loading && !dokter.length" class="muted"><i class="pi pi-spin pi-spinner" /> Memuat…</p>
        <p v-else-if="!dokterTampil.length" class="muted">{{ keyword ? 'Tidak ada dokter yang cocok.' : 'Belum ada data dokter.' }}</p>
        <ul class="dokter-list">
          <li v-for="d in dokterTampil" :key="d.KDDOKTER">
            <button type="button" class="dokter" :class="{ 'dokter--on': terpilih?.KDDOKTER === d.KDDOKTER }" @click="pilih(d)">
              <span class="dokter__nama">{{ d.NAMADOKTER }}</span>
              <span class="dokter__poli">{{ namaPoli[d.KDPOLY_BPJS] || 'Poli belum diatur' }}</span>
              <span class="dokter__hari" :class="{ 'dokter__hari--kosong': !ringkasan(d) }">{{ ringkasan(d) || 'Belum ada jadwal' }}</span>
            </button>
          </li>
        </ul>
      </section>

      <!-- Editor -->
      <section class="panel editor">
        <div v-if="!terpilih" class="kosong">
          <i class="pi pi-calendar" />
          <p>Pilih dokter di sebelah kiri untuk mengatur jadwalnya.</p>
        </div>

        <template v-else>
          <header class="editor__head">
            <div>
              <h2 class="editor__nama">{{ terpilih.NAMADOKTER }}</h2>
              <p class="muted">{{ namaPoli[terpilih.KDPOLY_BPJS] || 'Poli belum diatur' }} · {{ jumlahSesi }} sesi per minggu</p>
            </div>
            <div class="editor__actions">
              <Tag v-if="dirty" value="Belum disimpan" severity="warn" />
              <Button label="Batalkan" severity="secondary" outlined :disabled="!dirty || saving" @click="reset" />
              <Button label="Simpan jadwal" icon="pi pi-save" :loading="saving" :disabled="!dirty" @click="simpan" />
            </div>
          </header>

          <Message v-if="!terpilih.KDPOLY_BPJS" severity="warn" icon="pi pi-exclamation-triangle" class="editor__warn">
            Dokter ini belum punya poli, jadwal belum bisa disimpan. Atur poli di Master Data &gt; Dokter.
          </Message>

          <div class="hari-list">
            <div v-for="h in draft" :key="h.hari" class="hari" :class="{ 'hari--aktif': h.aktif }">
              <label class="hari__toggle">
                <ToggleSwitch v-model="h.aktif" @update:modelValue="toggleHari(h)" />
                <span class="hari__nama">{{ h.nama }}</span>
              </label>

              <div class="hari__sesi">
                <span v-if="!h.aktif" class="muted">Tidak praktik</span>
                <template v-else>
                  <div v-for="(s, i) in h.sesi" :key="i" class="sesi">
                    <DatePicker v-model="s.mulai" timeOnly hourFormat="24" :aria-label="`${h.nama} jam mulai`" class="sesi__jam" />
                    <span class="sesi__sampai">sampai</span>
                    <DatePicker v-model="s.selesai" timeOnly hourFormat="24" :aria-label="`${h.nama} jam selesai`" class="sesi__jam" />
                    <InputGroup class="sesi__kuota">
                      <InputNumber v-model="s.kapasitas" :min="0" :max="999" :aria-label="`${h.nama} kapasitas pasien`" />
                      <InputGroupAddon>pasien</InputGroupAddon>
                    </InputGroup>
                    <Button icon="pi pi-times" text rounded severity="danger" size="small" :aria-label="`Hapus sesi ${i + 1} ${h.nama}`" @click="hapusSesi(h, i)" />
                  </div>
                  <div class="hari__aksi">
                    <Button label="Tambah sesi" icon="pi pi-plus" text size="small" @click="tambahSesi(h)" />
                    <Button label="Salin ke hari aktif lain" icon="pi pi-copy" text size="small" severity="secondary" @click="salinKeHariAktif(h)" />
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.muted {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 0.875rem;
}
.head-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.bagikan__link {
  margin-top: 0.75rem;
}
.layout {
  display: grid;
  grid-template-columns: 20rem minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
.list {
  display: grid;
  gap: 0.75rem;
  max-height: calc(100vh - var(--navbar-height) - 10rem);
  overflow-y: auto;
}
.dokter-list {
  display: grid;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dokter {
  display: grid;
  gap: 0.125rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-panel);
  color: var(--app-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.dokter:hover {
  border-color: var(--p-primary-color);
}
.dokter--on {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}
.dokter__nama {
  font-weight: 600;
}
.dokter__poli {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.dokter__hari {
  font-size: 0.8125rem;
  color: var(--p-primary-color);
}
.dokter__hari--kosong {
  color: var(--app-text-muted);
  font-style: italic;
}

.kosong {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--app-text-muted);
}
.kosong i {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.75rem;
}
.kosong p {
  margin: 0;
}

.editor__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.editor__nama {
  margin: 0;
  font-size: 1.125rem;
}
.editor__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.editor__warn {
  margin-bottom: 1rem;
}

.hari-list {
  display: grid;
  gap: 0.5rem;
}
.hari {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.hari--aktif {
  border-color: color-mix(in srgb, var(--p-primary-color) 45%, var(--app-border));
}
.hari__toggle {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.5rem;
  cursor: pointer;
}
.hari__nama {
  font-weight: 600;
}
.hari__sesi {
  display: grid;
  gap: 0.5rem;
  min-height: 2.5rem;
  align-content: center;
}
.sesi {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.sesi__jam {
  width: 6.5rem;
}
.sesi__jam :deep(input) {
  width: 100%;
}
.sesi__sampai {
  color: var(--app-text-muted);
  font-size: 0.8125rem;
}
.sesi__kuota {
  width: 10rem;
}
.hari__aksi {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

@media (max-width: 991px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .list {
    max-height: 18rem;
  }
}
@media (max-width: 575px) {
  .hari {
    grid-template-columns: 1fr;
  }
}
</style>
