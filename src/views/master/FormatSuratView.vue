<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  KATEGORI_SURAT_OPTIONS, KATEGORI_SURAT_FIELDS, PLACEHOLDER_UMUM, UKURAN_MAKS,
  getDaftarJenisSurat, getJenisSurat, uploadTemplate, simpanJenisSurat, hapusJenisSurat, urlTemplate
} from '@/services/formatSurat'
import { getDaftarJasa } from '@/services/jasa'

const toast = useToast()
const confirm = useConfirm()

const daftar = ref([])
const loading = ref(false)
const cari = ref('')
const filterKategori = ref(null)

const tersaring = computed(() => {
  const q = cari.value.trim().toLowerCase()
  return daftar.value.filter(
    (d) =>
      (!filterKategori.value || d.KATEGORI_SURAT === filterKategori.value) &&
      (!q || `${d.NAMA_SURAT} ${d.KODE_SURAT || ''}`.toLowerCase().includes(q))
  )
})

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
const labelKategori = (v) => KATEGORI_SURAT_OPTIONS.find((o) => o.value === v)?.label || v || '—'
const severityKategori = { SEHAT: 'success', SAKIT: 'danger', KEJIWAAN: 'info' }
const namaFile = (path) => String(path || '').split('/').pop()
const aktif = (d) => Number(d.AKTIF) === 1
const token = (t) => '${' + t + '}'

async function muat() {
  loading.value = true
  try {
    daftar.value = await getDaftarJenisSurat({ hanyaAktif: null })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Gagal memuat', detail: e.message, life: 4000 })
  } finally {
    loading.value = false
  }
}

// ── Barang jasa (tarif) ──────────────────────────────────────
const jasa = ref([])
async function muatJasa() {
  if (jasa.value.length) return
  try {
    jasa.value = await getDaftarJasa()
  } catch (e) {
    toast.add({ severity: 'warn', summary: 'Daftar tarif gagal dimuat', detail: e.message, life: 4000 })
  }
}

// ── Form tambah / ubah ───────────────────────────────────────
const dialog = ref(false)
const editId = ref(null)
const saving = ref(false)
const uploading = ref(false)
const submitted = ref(false)

const formKosong = () => ({ kode: '', nama: '', kategori: null, idBarang: null, masaBerlakuHari: null, aktif: true, templateFile: null })
const form = ref(formKosong())

const galat = computed(() => ({
  nama: !form.value.nama?.trim() && 'Nama surat wajib diisi.',
  kategori: !form.value.kategori && 'Kategori wajib dipilih.',
  idBarang: !form.value.idBarang && 'Barang/tarif wajib dipilih.',
  templateFile: !form.value.templateFile && 'Template Word (.docx) wajib diunggah.'
}))
const valid = computed(() => !Object.values(galat.value).some(Boolean))

async function bukaForm(item = null) {
  submitted.value = false
  editId.value = item?.ID ?? null
  form.value = formKosong()
  dialog.value = true
  muatJasa()
  if (!item) return
  loading.value = true
  try {
    const d = (await getJenisSurat(item.ID)) || item
    const masa = d.MASA_BERLAKU_HARI
    form.value = {
      kode: d.KODE_SURAT || '',
      nama: d.NAMA_SURAT || '',
      kategori: d.KATEGORI_SURAT || null,
      idBarang: d.IDBARANG || null,
      masaBerlakuHari: masa === null || masa === undefined || masa === '' ? null : Number(masa),
      aktif: Number(d.AKTIF) === 1,
      templateFile: d.TEMPLATE_FILE || null
    }
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Gagal memuat detail', detail: e.message, life: 4000 })
  } finally {
    loading.value = false
  }
}

async function pilihTemplate(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // agar file yang sama bisa dipilih ulang
  if (!file) return
  uploading.value = true
  try {
    form.value.templateFile = await uploadTemplate(file)
    toast.add({ severity: 'success', summary: 'Template terunggah', detail: file.name, life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Gagal upload', detail: e.message, life: 4000 })
  } finally {
    uploading.value = false
  }
}

async function simpan() {
  submitted.value = true
  if (!valid.value) return
  saving.value = true
  try {
    const pesan = await simpanJenisSurat({ id: editId.value, ...form.value })
    dialog.value = false
    toast.add({ severity: 'success', summary: 'Berhasil', detail: pesan, life: 3000 })
    muat()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: e.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

function hapus(item) {
  confirm.require({
    header: 'Konfirmasi hapus',
    message: `Hapus jenis surat "${item.NAMA_SURAT}"? Surat yang sudah pernah dibuat tidak ikut terhapus.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Batal', severity: 'secondary', text: true },
    acceptProps: { label: 'Hapus', severity: 'danger' },
    accept: async () => {
      try {
        toast.add({ severity: 'success', summary: 'Berhasil', detail: await hapusJenisSurat(item.ID), life: 3000 })
        muat()
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Gagal menghapus', detail: e.message, life: 5000 })
      }
    }
  })
}

// ── Ganti template langsung dari kartu ───────────────────────
const penggantian = ref(null) // ID jenis surat yang sedang diganti templatenya

async function gantiTemplate(d, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  penggantian.value = d.ID
  try {
    const templateFile = await uploadTemplate(file)
    await simpanJenisSurat({
      id: d.ID,
      kode: d.KODE_SURAT,
      nama: d.NAMA_SURAT,
      kategori: d.KATEGORI_SURAT,
      idBarang: d.IDBARANG,
      masaBerlakuHari: d.MASA_BERLAKU_HARI === '' || d.MASA_BERLAKU_HARI == null ? null : Number(d.MASA_BERLAKU_HARI),
      aktif: aktif(d),
      templateFile
    })
    toast.add({ severity: 'success', summary: 'Template diganti', detail: file.name, life: 3000 })
    muat()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Gagal mengganti template', detail: e.message, life: 5000 })
  } finally {
    penggantian.value = null
  }
}

// ── Referensi variabel template ──────────────────────────────
const variabelKategori = computed(() => KATEGORI_SURAT_FIELDS[form.value.kategori] || [])

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Format Surat</h1>
        <p class="page-subtitle">Master jenis surat keterangan (sakit, sehat, kejiwaan, lain-lain) beserta tarif dan template cetak Word (.docx).</p>
      </div>
      <Button label="Tambah jenis surat" icon="pi pi-plus" @click="bukaForm()" />
    </header>

    <div class="head-aksi">
      <InputText v-model="cari" placeholder="Cari nama / kode…" size="small" />
      <Select v-model="filterKategori" :options="KATEGORI_SURAT_OPTIONS" optionLabel="label" optionValue="value" placeholder="Semua kategori" showClear size="small" />
      <span class="toolbar__count">{{ tersaring.length }} dari {{ daftar.length }} jenis surat</span>
      <Button icon="pi pi-refresh" severity="secondary" text rounded aria-label="Muat ulang" :loading="loading" @click="muat" />
    </div>

    <p v-if="!tersaring.length && !loading" class="kosong">{{ daftar.length ? 'Tidak ada jenis surat yang cocok.' : 'Belum ada jenis surat. Klik "Tambah jenis surat".' }}</p>

    <div class="grid">
      <section v-for="d in tersaring" :key="d.ID" class="panel kartu" :class="{ 'kartu--nonaktif': !aktif(d) }">
        <header class="kartu__head">
          <span class="kartu__ikon"><i class="pi pi-file-edit" /></span>
          <div class="kartu__teks">
            <h2 class="kartu__judul">{{ d.NAMA_SURAT }}</h2>
            <p class="kartu__ket">
              <Tag :value="labelKategori(d.KATEGORI_SURAT)" :severity="severityKategori[d.KATEGORI_SURAT] || 'secondary'" />
              <Tag v-if="!aktif(d)" value="Non-aktif" severity="secondary" />
              <span v-if="d.KODE_SURAT" class="mono">{{ d.KODE_SURAT }}</span>
            </p>
          </div>
          <Button icon="pi pi-pencil" severity="secondary" text rounded size="small" aria-label="Ubah" @click="bukaForm(d)" />
          <Button icon="pi pi-trash" severity="danger" text rounded size="small" aria-label="Hapus" @click="hapus(d)" />
        </header>

        <p class="tarif">
          <i class="pi pi-tag" />
          <span>{{ d.NAMA_BARANG || '—' }}</span>
          <strong v-if="d.HARGAJUAL || d.HARGAJUAL === 0">{{ rupiah.format(d.HARGAJUAL) }}</strong>
        </p>

        <div v-if="d.TEMPLATE_FILE" class="file">
          <i class="pi pi-file-word file__ikon" />
          <div class="file__info">
            <strong class="file__nama">{{ namaFile(d.TEMPLATE_FILE) }}</strong>
            <small>Template Word<template v-if="d.MASA_BERLAKU_HARI"> · berlaku {{ d.MASA_BERLAKU_HARI }} hari</template></small>
          </div>
        </div>
        <p v-else class="kosong kosong--kecil">Belum ada template.</p>

        <div class="aksi">
          <label class="upload" :class="{ 'upload--busy': penggantian === d.ID }">
            <input type="file" accept=".docx" hidden :disabled="!!penggantian" @change="gantiTemplate(d, $event)" />
            <i :class="penggantian === d.ID ? 'pi pi-spin pi-spinner' : 'pi pi-upload'" />
            {{ d.TEMPLATE_FILE ? 'Ganti file' : 'Upload file' }}
          </label>
          <a v-if="d.TEMPLATE_FILE" class="unduh" :href="urlTemplate(d.TEMPLATE_FILE)" target="_blank" rel="noopener"><i class="pi pi-download" /> Unduh</a>
        </div>
      </section>
    </div>

    <Dialog v-model:visible="dialog" modal :header="editId ? 'Ubah jenis surat' : 'Tambah jenis surat'" :style="{ width: 'min(46rem, 95vw)' }" :closable="!saving">
      <form class="form" @submit.prevent="simpan">
        <div class="baris">
          <div class="field">
            <label for="js-kode">Kode surat</label>
            <InputText id="js-kode" v-model="form.kode" placeholder="mis. SAKIT" />
          </div>
          <div class="field field--lebar">
            <label for="js-nama">Nama surat <span class="wajib">*</span></label>
            <InputText id="js-nama" v-model="form.nama" placeholder="mis. Surat Keterangan Sakit" :invalid="submitted && !!galat.nama" />
            <small v-if="submitted && galat.nama" class="galat">{{ galat.nama }}</small>
          </div>
        </div>

        <div class="baris">
          <div class="field">
            <label>Kategori <span class="wajib">*</span></label>
            <Select v-model="form.kategori" :options="KATEGORI_SURAT_OPTIONS" optionLabel="label" optionValue="value" placeholder="Pilih…" :invalid="submitted && !!galat.kategori" />
            <small v-if="submitted && galat.kategori" class="galat">{{ galat.kategori }}</small>
          </div>
          <div class="field">
            <label>Masa berlaku (hari)</label>
            <InputNumber v-model="form.masaBerlakuHari" :min="0" placeholder="Tanpa batas" />
          </div>
          <div class="field">
            <label>Status</label>
            <div class="status"><ToggleSwitch v-model="form.aktif" /> {{ form.aktif ? 'Aktif' : 'Non-aktif' }}</div>
          </div>
        </div>

        <div class="field">
          <label>Barang / tarif <span class="wajib">*</span></label>
          <Select v-model="form.idBarang" :options="jasa" optionLabel="NAMA" optionValue="IDBARANG" filter placeholder="Cari barang jasa…" :invalid="submitted && !!galat.idBarang">
            <template #option="{ option }">
              <div class="opsi"><span>{{ option.NAMA }}</span><span class="mono">{{ rupiah.format(option.HARGAJUAL || 0) }}</span></div>
            </template>
          </Select>
          <small v-if="submitted && galat.idBarang" class="galat">{{ galat.idBarang }}</small>
          <small v-else class="muted">Hanya barang jasa (tidak memotong stok).</small>
        </div>

        <div class="field">
          <label>Template cetak (Word .docx) <span class="wajib">*</span></label>
          <div class="upload-box" :class="{ 'upload-box--galat': submitted && galat.templateFile }">
            <a v-if="form.templateFile" class="tautan" :href="urlTemplate(form.templateFile)" target="_blank" rel="noopener">
              <i class="pi pi-file-word" /> {{ namaFile(form.templateFile) }}
            </a>
            <label class="pilih" :class="{ 'pilih--sibuk': uploading }">
              <input type="file" accept=".docx" hidden :disabled="uploading" @change="pilihTemplate" />
              <i :class="uploading ? 'pi pi-spin pi-spinner' : 'pi pi-upload'" />
              {{ form.templateFile ? 'Ganti file' : 'Pilih file .docx' }}
            </label>
            <small class="muted">Maks. {{ UKURAN_MAKS / 1024 / 1024 }} MB.</small>
          </div>
          <small v-if="submitted && galat.templateFile" class="galat">{{ galat.templateFile }}</small>
        </div>

        <details class="petunjuk">
          <summary><i class="pi pi-info-circle" /> Variabel yang bisa ditulis di dokumen Word</summary>
          <p>
            Buat surat di Microsoft Word seperti biasa (termasuk kop dan logo), lalu tulis variabel dengan format
            <code>{{ token('nama_variabel') }}</code> di posisi yang ingin diisi otomatis. Saat dicetak, sistem mengisi
            variabel lalu mengonversi dokumen menjadi PDF.
          </p>
          <h4>Umum</h4>
          <ul>
            <li v-for="p in PLACEHOLDER_UMUM" :key="p.token"><code>{{ token(p.token) }}</code> — {{ p.label }}</li>
          </ul>
          <template v-if="variabelKategori.length">
            <h4>Khusus kategori {{ labelKategori(form.kategori) }}</h4>
            <ul>
              <li v-for="p in variabelKategori" :key="p.key"><code>{{ token(p.key) }}</code> — {{ p.label }}</li>
            </ul>
          </template>
        </details>

        <div class="form__aksi">
          <Button type="button" label="Batal" severity="secondary" text :disabled="saving" @click="dialog = false" />
          <Button type="submit" label="Simpan" icon="pi pi-check" :loading="saving" :disabled="uploading" />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.head-aksi {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: 1rem;
}
.kartu {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  align-content: start;
}
.kartu--nonaktif {
  opacity: 0.7;
}
.kartu__head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.kartu__teks {
  flex: 1;
  min-width: 0;
}
.kartu__ikon {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  margin-right: 0.375rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
  color: var(--p-primary-color);
  font-size: 1.25rem;
}
.kartu__judul {
  margin: 0;
  font-size: 1.0625rem;
}
.kartu__ket {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.tarif {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0;
  font-size: 0.875rem;
}
.tarif span {
  flex: 1;
  min-width: 0;
  color: var(--app-text-muted);
}
.file {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.file__ikon {
  font-size: 1.5rem;
  color: var(--p-primary-color);
}
.file__info {
  display: grid;
  min-width: 0;
}
.file__nama {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file__info small {
  color: var(--app-text-muted);
}
.kosong {
  margin: 0;
  padding: 1rem;
  text-align: center;
  color: var(--app-text-muted);
  border: 2px dashed var(--app-border);
  border-radius: var(--app-radius-lg);
}
.kosong--kecil {
  padding: 0.75rem;
  font-size: 0.875rem;
}
.aksi {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.upload,
.unduh {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4375rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 0.5rem;
  cursor: pointer;
  text-decoration: none;
}
.upload {
  color: var(--p-primary-contrast-color);
  background: var(--p-primary-color);
}
.unduh {
  color: var(--p-primary-color);
  border: 1px solid var(--app-border);
}
.upload--busy {
  pointer-events: none;
  opacity: 0.7;
}
.toolbar__count {
  margin-left: auto;
  color: var(--app-text-muted);
  font-size: 0.875rem;
}
.mono {
  font-family: ui-monospace, monospace;
}
.muted {
  color: var(--app-text-muted);
}
.tautan {
  display: inline-flex;
  gap: 0.375rem;
  align-items: center;
  color: var(--p-primary-color);
  word-break: break-all;
}
.form {
  display: grid;
  gap: 1rem;
}
.baris {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 1rem;
}
.field {
  display: grid;
  gap: 0.375rem;
  align-content: start;
}
.field--lebar {
  grid-column: span 2;
}
.field > label {
  font-size: 0.875rem;
  font-weight: 600;
}
.wajib,
.galat {
  color: #dc2626;
}
.status {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  min-height: 2.5rem;
}
.opsi {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}
.upload-box {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-radius-lg);
}
.upload-box--galat {
  border-color: #dc2626;
}
.pilih {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4375rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-primary-contrast-color);
  background: var(--p-primary-color);
  border-radius: 0.5rem;
  cursor: pointer;
}
.pilih--sibuk {
  pointer-events: none;
  opacity: 0.7;
}
.petunjuk {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.petunjuk summary {
  cursor: pointer;
  font-weight: 600;
}
.petunjuk h4 {
  margin: 0.75rem 0 0.25rem;
}
.petunjuk ul {
  margin: 0;
  padding-left: 1.25rem;
  columns: 2;
}
.form__aksi {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
