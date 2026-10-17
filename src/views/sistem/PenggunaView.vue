<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '@/stores/auth'
import { getDaftarPengguna, tambahPengguna, ubahHakAkses, resetKataSandi, KATA_SANDI_RESET, hapusPengguna, POLA_USERNAME, POLA_KATA_SANDI } from '@/services/pengguna'
import { parseRoles, buatRoles, ROLE_ADMIN, ROLE_USER } from '@/config/akses'
import HakAksesPicker from './components/HakAksesPicker.vue'
import { getListLokasi } from '@/services/penjualan'

const toast = useToast()
const confirm = useConfirm()
const auth = useAuthStore()

// ── Daftar pengguna ──────────────────────────────────────────
const pengguna = ref([])
const lokasi = ref([])
const loading = ref(false)
const keyword = ref('')

const namaLokasi = computed(() => Object.fromEntries(lokasi.value.map((l) => [l.ID, l.DISPLAY])))
const sama = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const akunSendiri = (p) => sama(p.NIP, auth.userId)
const hakAkses = (p) => parseRoles(p.ROLES)

const penggunaTampil = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return pengguna.value
  return pengguna.value.filter((p) =>
    [p.NAMA_USER, p.NIP, p.JABATAN, p.NIK, namaLokasi.value[p.ID_LOKASI]].some((v) => String(v ?? '').toLowerCase().includes(q))
  )
})

async function muat() {
  loading.value = true
  const [p, l] = await Promise.allSettled([getDaftarPengguna(), getListLokasi()])
  if (p.status === 'fulfilled') pengguna.value = p.value
  else toast.add({ severity: 'error', summary: 'Gagal memuat pengguna', detail: p.reason?.message, life: 5000 })
  // Daftar lokasi opsional: tanpa itu pengguna baru memakai lokasi akun yang sedang login
  if (l.status === 'fulfilled') lokasi.value = l.value
  loading.value = false
}

// ── Form tambah pengguna ─────────────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const errors = ref({})

function emptyForm() {
  return {
    NAMA_USER: '',
    NIP: '',
    PWD: '',
    ulangi: '',
    JABATAN: '',
    NIK: '',
    role: ROLE_USER,
    akses: [],
    lokasi: lokasi.value.find((l) => l.ID == auth.idLokasi) || null
  }
}
const form = ref(emptyForm())

function bukaForm() {
  form.value = emptyForm()
  errors.value = {}
  showForm.value = true
}

function clearError(key) {
  if (errors.value[key]) errors.value = { ...errors.value, [key]: '' }
}

function validate() {
  const f = form.value
  const e = {}
  const nip = f.NIP.trim()
  if (!f.NAMA_USER.trim()) e.NAMA_USER = 'Nama wajib diisi'
  if (!nip) e.NIP = 'Username wajib diisi'
  else if (!POLA_USERNAME.test(nip)) e.NIP = 'Hanya huruf, angka, titik, garis bawah, dan tanda hubung'
  else if (pengguna.value.some((p) => sama(p.NIP, nip))) e.NIP = 'Username ini sudah dipakai'
  if (!f.PWD) e.PWD = 'Kata sandi wajib diisi'
  else if (f.PWD.length < 6) e.PWD = 'Kata sandi minimal 6 karakter'
  else if (!POLA_KATA_SANDI.test(f.PWD)) e.PWD = 'Hanya huruf, angka, titik, garis bawah, dan tanda hubung'
  if (f.ulangi !== f.PWD) e.ulangi = 'Kata sandi tidak sama'
  const nik = f.NIK.trim()
  if (nik && !/^\d{16}$/.test(nik)) e.NIK = 'NIK harus 16 digit angka'
  if (lokasi.value.length && !f.lokasi) e.lokasi = 'Lokasi wajib dipilih'
  errors.value = e
  return Object.keys(e).length === 0
}

async function simpan() {
  if (!validate()) return
  saving.value = true
  const f = form.value
  try {
    const message = await tambahPengguna({
      NAMA_USER: f.NAMA_USER.trim(),
      NIP: f.NIP.trim(),
      PWD: f.PWD,
      JABATAN: f.JABATAN.trim(),
      NIK: f.NIK.trim(),
      ID_LOKASI: f.lokasi?.ID ?? auth.idLokasi,
      ROLE: f.role,
      AKSES: f.akses
    })
    toast.add({ severity: 'success', summary: 'Pengguna ditambahkan', detail: `${f.NAMA_USER.trim()} — ${message}`, life: 3500 })
    showForm.value = false
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 7000 })
  } finally {
    saving.value = false
    // Dimuat ulang juga saat gagal: pengguna bisa saja sudah tersimpan sebagian
    await muat()
  }
}

// ── Ubah hak akses ───────────────────────────────────────────
const showAkses = ref(false)
const savingAkses = ref(false)
const target = ref(null)
const aksesForm = ref({ role: ROLE_USER, akses: [] })

function bukaAkses(p) {
  const h = hakAkses(p)
  target.value = p
  aksesForm.value = { role: h.role, akses: [...h.akses] }
  showAkses.value = true
}

async function simpanAkses() {
  const p = target.value
  // Cegah admin menurunkan perannya sendiri (tidak ada jalan kembali bila ia satu-satunya admin)
  if (akunSendiri(p) && aksesForm.value.role !== ROLE_ADMIN) {
    toast.add({ severity: 'warn', summary: 'Tidak diizinkan', detail: 'Peran akun yang sedang dipakai tidak bisa diturunkan dari Admin.', life: 5000 })
    return
  }
  savingAkses.value = true
  try {
    const message = await ubahHakAkses(p, aksesForm.value.role, aksesForm.value.akses)
    showAkses.value = false
    await muat()
    // Baca ulang dari server: kolom ROLES yang terlalu pendek memotong nilai tanpa error
    const kirim = buatRoles(aksesForm.value.role, aksesForm.value.akses)
    const tersimpan = pengguna.value.find((x) => x.ID === p.ID)?.ROLES ?? ''
    if (tersimpan !== kirim) {
      toast.add({
        severity: 'error',
        summary: 'Hak akses tidak tersimpan utuh',
        detail: `Server menyimpan ${tersimpan.length} dari ${kirim.length} karakter. Perlebar kolom m_login.ROLES (mis. VARCHAR(1000)).`,
        life: 12000
      })
    } else {
      toast.add({ severity: 'success', summary: 'Hak akses disimpan', detail: `${p.NAMA_USER} — ${message}`, life: 3500 })
    }
    if (akunSendiri(p)) await auth.muatHakAkses()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 6000 })
  } finally {
    savingAkses.value = false
  }
}

// ── Reset kata sandi ─────────────────────────────────────────
const resetting = ref(null) // ID pengguna yang sedang direset

function konfirmasiReset(p) {
  confirm.require({
    header: 'Reset kata sandi?',
    message: `Kata sandi ${p.NAMA_USER} (${p.NIP}) akan diubah menjadi ${KATA_SANDI_RESET}. Minta pengguna menggantinya setelah masuk.`,
    icon: 'pi pi-key',
    acceptLabel: 'Reset',
    rejectLabel: 'Batal',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => reset(p)
  })
}

async function reset(p) {
  resetting.value = p.ID
  try {
    await resetKataSandi(p.NIP)
    toast.add({ severity: 'success', summary: 'Kata sandi direset', detail: `${p.NAMA_USER} — kata sandi sekarang ${KATA_SANDI_RESET}`, life: 5000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal reset', detail: err.message, life: 5000 })
  } finally {
    resetting.value = null
  }
}

// ── Hapus ────────────────────────────────────────────────────
const deleting = ref(null) // ID pengguna yang sedang dihapus

function konfirmasiHapus(p) {
  confirm.require({
    header: 'Hapus pengguna?',
    message: `Akun ${p.NAMA_USER} (${p.NIP}) akan dihapus permanen dan tidak bisa lagi dipakai untuk masuk. Tindakan ini tidak dapat dibatalkan.`,
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
    const message = await hapusPengguna(p.ID)
    toast.add({ severity: 'success', summary: 'Pengguna dihapus', detail: `${p.NAMA_USER} — ${message}`, life: 3500 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menghapus', detail: err.message, life: 5000 })
  } finally {
    deleting.value = null
  }
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Pengguna</h1>
        <p class="page-subtitle">Akun yang dapat masuk ke aplikasi klinik.</p>
      </div>
      <Button label="Tambah pengguna" icon="pi pi-plus" @click="bukaForm" />
    </header>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari nama, username, jabatan, atau lokasi" fluid />
        </IconField>
        <div class="toolbar__right">
          <span class="toolbar__count">{{ penggunaTampil.length }} pengguna</span>
          <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" v-tooltip.top="'Muat ulang'" @click="muat" />
        </div>
      </header>

      <DataTable
        :value="penggunaTampil"
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
          <p class="empty">{{ keyword ? 'Tidak ada pengguna yang cocok.' : 'Belum ada data pengguna.' }}</p>
        </template>
        <Column header="No." style="width: 4rem">
          <template #body="{ index }">{{ index + 1 }}</template>
        </Column>
        <Column field="NAMA_USER" header="Nama" sortable style="min-width: 14rem">
          <template #body="{ data }">
            <strong>{{ data.NAMA_USER || '—' }}</strong>
            <Tag v-if="akunSendiri(data)" value="Anda" severity="info" class="tag-anda" />
          </template>
        </Column>
        <Column field="NIP" header="Username" sortable style="min-width: 10rem">
          <template #body="{ data }"><span class="mono">{{ data.NIP }}</span></template>
        </Column>
        <Column field="JABATAN" header="Jabatan" sortable style="min-width: 10rem">
          <template #body="{ data }">{{ data.JABATAN || data.GROUP_USER || '—' }}</template>
        </Column>
        <Column field="ID_LOKASI" header="Lokasi" style="min-width: 10rem">
          <template #body="{ data }">{{ namaLokasi[data.ID_LOKASI] || data.ID_LOKASI || '—' }}</template>
        </Column>
        <Column header="Hak akses" style="min-width: 11rem">
          <template #body="{ data }">
            <Tag v-if="hakAkses(data).role === ROLE_ADMIN" value="Admin" severity="success" />
            <template v-else>
              <Tag value="User" severity="secondary" />
              <span class="akses-count">{{ hakAkses(data).akses.length }} menu</span>
            </template>
          </template>
        </Column>
        <Column header="Aksi" frozen alignFrozen="right" style="width: 10.5rem">
          <template #body="{ data }">
            <Button
              icon="pi pi-shield"
              text
              rounded
              size="small"
              :aria-label="`Hak akses ${data.NAMA_USER}`"
              v-tooltip.top="'Atur hak akses'"
              @click="bukaAkses(data)"
            />
            <Button
              icon="pi pi-key"
              text
              rounded
              size="small"
              severity="warn"
              :loading="resetting === data.ID"
              :aria-label="`Reset kata sandi ${data.NAMA_USER}`"
              v-tooltip.top="`Reset kata sandi ke ${KATA_SANDI_RESET}`"
              @click="konfirmasiReset(data)"
            />
            <Button
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              size="small"
              :disabled="akunSendiri(data)"
              :loading="deleting === data.ID"
              :aria-label="`Hapus ${data.NAMA_USER}`"
              v-tooltip.top="akunSendiri(data) ? 'Akun yang sedang dipakai tidak bisa dihapus' : 'Hapus'"
              @click="konfirmasiHapus(data)"
            />
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Dialog tambah pengguna -->
    <Dialog
      v-model:visible="showForm"
      header="Tambah pengguna"
      modal
      :closable="!saving"
      :style="{ width: '40rem' }"
      :breakpoints="{ '575px': '96vw' }"
    >
      <form class="form" autocomplete="off" @submit.prevent="simpan">
        <div class="field field--full">
          <label for="u-nama">Nama lengkap <span class="req">*</span></label>
          <InputText
            id="u-nama"
            v-model="form.NAMA_USER"
            placeholder="Contoh: Siti Rahmawati"
            :invalid="!!errors.NAMA_USER"
            autofocus
            fluid
            @update:modelValue="clearError('NAMA_USER')"
          />
          <small v-if="errors.NAMA_USER" class="field__error">{{ errors.NAMA_USER }}</small>
        </div>

        <div class="field">
          <label for="u-nip">Username <span class="req">*</span></label>
          <InputText
            id="u-nip"
            v-model="form.NIP"
            placeholder="Dipakai untuk masuk"
            autocomplete="off"
            :invalid="!!errors.NIP"
            fluid
            @update:modelValue="clearError('NIP')"
          />
          <small v-if="errors.NIP" class="field__error">{{ errors.NIP }}</small>
        </div>

        <div class="field">
          <label for="u-jabatan">Jabatan</label>
          <InputText id="u-jabatan" v-model="form.JABATAN" placeholder="Contoh: Petugas pendaftaran" fluid />
        </div>

        <div class="field">
          <label for="u-pwd">Kata sandi <span class="req">*</span></label>
          <Password
            v-model="form.PWD"
            inputId="u-pwd"
            :feedback="false"
            toggleMask
            :inputProps="{ autocomplete: 'new-password' }"
            :invalid="!!errors.PWD"
            fluid
            @update:modelValue="clearError('PWD')"
          />
          <small v-if="errors.PWD" class="field__error">{{ errors.PWD }}</small>
          <small v-else class="field__hint">Minimal 6 karakter: huruf, angka, titik, garis bawah, tanda hubung.</small>
        </div>

        <div class="field">
          <label for="u-ulangi">Ulangi kata sandi <span class="req">*</span></label>
          <Password
            v-model="form.ulangi"
            inputId="u-ulangi"
            :feedback="false"
            toggleMask
            :inputProps="{ autocomplete: 'new-password' }"
            :invalid="!!errors.ulangi"
            fluid
            @update:modelValue="clearError('ulangi')"
          />
          <small v-if="errors.ulangi" class="field__error">{{ errors.ulangi }}</small>
        </div>

        <div v-if="lokasi.length" class="field">
          <label for="u-lokasi">Lokasi / unit <span class="req">*</span></label>
          <Select
            v-model="form.lokasi"
            inputId="u-lokasi"
            :options="lokasi"
            optionLabel="DISPLAY"
            placeholder="Pilih lokasi"
            :invalid="!!errors.lokasi"
            fluid
            @change="clearError('lokasi')"
          />
          <small v-if="errors.lokasi" class="field__error">{{ errors.lokasi }}</small>
        </div>

        <div class="field">
          <label for="u-nik">NIK</label>
          <InputText
            id="u-nik"
            v-model="form.NIK"
            maxlength="16"
            inputmode="numeric"
            placeholder="16 digit (opsional)"
            :invalid="!!errors.NIK"
            fluid
            @update:modelValue="clearError('NIK')"
          />
          <small v-if="errors.NIK" class="field__error">{{ errors.NIK }}</small>
        </div>

        <div class="field field--full">
          <HakAksesPicker v-model:role="form.role" v-model:akses="form.akses" />
        </div>

        <!-- tombol submit tersembunyi agar Enter menyimpan -->
        <button type="submit" hidden />
      </form>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showForm = false" />
        <Button label="Simpan pengguna" icon="pi pi-save" :loading="saving" @click="simpan" />
      </template>
    </Dialog>

    <!-- Dialog hak akses -->
    <Dialog
      v-model:visible="showAkses"
      :header="`Hak akses — ${target?.NAMA_USER ?? ''}`"
      modal
      :closable="!savingAkses"
      :style="{ width: '36rem' }"
      :breakpoints="{ '575px': '96vw' }"
    >
      <HakAksesPicker v-model:role="aksesForm.role" v-model:akses="aksesForm.akses" />
      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="savingAkses" @click="showAkses = false" />
        <Button label="Simpan hak akses" icon="pi pi-save" :loading="savingAkses" @click="simpanAkses" />
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
.akses-count {
  margin-left: 0.5rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.tag-anda {
  margin-left: 0.375rem;
  font-size: 0.75rem;
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
.field__hint {
  color: var(--app-text-muted);
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
