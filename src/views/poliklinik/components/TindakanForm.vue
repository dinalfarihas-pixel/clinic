<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { cariTindakan, getRecentTindakan, getRiwayatTindakan, tambahTindakan, ubahKeteranganTindakan, hapusTindakan } from '@/services/tindakan'
import { formatCurrency } from '@/utils/format'

const props = defineProps({
  datapasien: { type: Object, required: true }
})

const toast = useToast()
const confirm = useConfirm()

const showSuccess = (detail) => toast.add({ severity: 'success', summary: 'Berhasil', detail, life: 3000 })
const showWarning = (detail) => toast.add({ severity: 'warn', summary: 'Perhatian', detail, life: 4000 })
const showError = (detail) => toast.add({ severity: 'error', summary: 'Gagal', detail, life: 5000 })

const noReg = computed(() => props.datapasien?.NOPENDAFTARAN)

// ── Form tambah tindakan ─────────────────────────────────────
const terpilih = ref(null)
const keterangan = ref('-')
const qty = ref(1)
const adding = ref(false)
const submitted = ref(false)

const hasilCari = ref([])
const mencari = ref(false)
const kataCari = ref('')
let cariTimer = null

function onCari(event) {
  const q = (event.value || '').trim()
  kataCari.value = q
  clearTimeout(cariTimer)
  if (q.length < 3) {
    hasilCari.value = []
    return
  }
  cariTimer = setTimeout(async () => {
    mencari.value = true
    try {
      hasilCari.value = await cariTindakan(q)
    } catch {
      hasilCari.value = []
      showError('Gagal mencari tindakan')
    } finally {
      mencari.value = false
    }
  }, 350)
}

const bisaTambah = computed(() => terpilih.value && keterangan.value.trim() && !adding.value)

async function tambah() {
  submitted.value = true
  if (!bisaTambah.value) return showWarning('Pilih tindakan dan isi keterangan terlebih dahulu')
  const nama = terpilih.value.CAPTION || terpilih.value.NAMA
  if (daftar.value.some((t) => t.TINDAKAN === nama)) return showError('Tindakan ini sudah ditambahkan')
  await simpanTindakan(terpilih.value, keterangan.value.trim(), qty.value || 1)
}

async function simpanTindakan(tindakan, ket, jumlah) {
  adding.value = true
  try {
    await tambahTindakan(tindakan, props.datapasien, ket, jumlah)
    showSuccess('Tindakan berhasil ditambahkan')
    terpilih.value = null
    keterangan.value = '-'
    qty.value = 1
    submitted.value = false
    await muatDaftar()
  } catch (err) {
    showError(err.message)
  } finally {
    adding.value = false
  }
}

// ── Sering dilakukan di poli ini ─────────────────────────────
const recent = ref([])
const loadingRecent = ref(false)

async function muatRecent() {
  loadingRecent.value = true
  try {
    recent.value = await getRecentTindakan(props.datapasien?.KODERUANGAN)
  } catch {
    recent.value = []
  } finally {
    loadingRecent.value = false
  }
}

async function tambahDariRecent(item) {
  if (adding.value) return
  if (daftar.value.some((t) => t.TINDAKAN === item.NAMABARANG)) return showError('Tindakan ini sudah ditambahkan')
  await simpanTindakan(
    {
      BARCODE: item.BARCODE,
      IDBARANG: item.BARCODE,
      NAMA: item.NAMABARANG,
      HARGA_JUAL_JASA: item.HARGA || 0,
      SATUAN: item.SATUAN
    },
    '-',
    1
  )
}

// ── Daftar tindakan kunjungan ini ────────────────────────────
const daftar = ref([])
const loading = ref(false)

async function muatDaftar(tampilkanPesan = false) {
  loading.value = true
  try {
    const rows = await getRiwayatTindakan(noReg.value)
    daftar.value = rows.map((r) => ({
      ...r,
      keterangan: r.REMARK_ITEM || '',
      signed: r.AUTH == 1,
      menyimpan: false,
      menghapus: false
    }))
    if (tampilkanPesan) showSuccess(`Daftar diperbarui (${rows.length} tindakan)`)
  } catch {
    showError('Gagal memuat daftar tindakan')
  } finally {
    loading.value = false
  }
}

async function simpanKeterangan(t) {
  if (!t.keterangan.trim()) return showWarning('Isi keterangan sebelum menyimpan')
  t.menyimpan = true
  try {
    await ubahKeteranganTindakan(t.RECEIPT_NO, noReg.value, t.keterangan.trim())
    t.REMARK_ITEM = t.keterangan.trim()
    showSuccess('Keterangan berhasil disimpan')
  } catch (err) {
    showError(err.message)
  } finally {
    t.menyimpan = false
  }
}

function konfirmasiHapus(t) {
  confirm.require({
    header: 'Hapus tindakan?',
    message: `Tindakan "${t.TINDAKAN}" akan dibatalkan dari kunjungan ini.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => hapus(t)
  })
}

async function hapus(t) {
  t.menghapus = true
  try {
    await hapusTindakan(t.RECEIPT_NO)
    daftar.value = daftar.value.filter((x) => x.RECEIPT_NO !== t.RECEIPT_NO)
    showSuccess(`"${t.TINDAKAN}" berhasil dihapus`)
  } catch (err) {
    showError(err.message)
    t.menghapus = false
  }
}

onMounted(() => {
  if (noReg.value) muatDaftar()
  muatRecent()
})
</script>

<template>
  <div class="tindakan">
    <!-- Form tambah -->
    <section class="panel">
      <header class="panel__header">
        <h2 class="panel__title"><i class="pi pi-plus-circle panel__icon" />Tambah tindakan / prosedur</h2>
        <Button label="Tambah" icon="pi pi-plus" severity="success" size="small" :disabled="!bisaTambah" :loading="adding" @click="tambah" />
      </header>

      <div class="form-row">
        <div class="field field--grow">
          <label for="t-pilih">Tindakan <span v-if="hasilCari.length" class="muted">({{ hasilCari.length }} ditemukan)</span></label>
          <Select
            v-model="terpilih"
            inputId="t-pilih"
            :options="hasilCari"
            optionLabel="CAPTION"
            filter
            :filterFields="['CAPTION', 'KATEGORI']"
            placeholder="Cari nama tindakan…"
            :loading="mencari"
            :invalid="submitted && !terpilih"
            fluid
            @filter="onCari"
          >
            <template #option="{ option }">
              <div class="opsi">
                <span>{{ option.CAPTION }}</span>
                <span class="opsi__meta">
                  <Tag v-if="option.KATEGORI" :value="option.KATEGORI" severity="success" />
                  <span v-if="option.HARGA_JUAL_JASA" class="muted">{{ formatCurrency(option.HARGA_JUAL_JASA) }}</span>
                </span>
              </div>
            </template>
            <template #empty>
              <span class="muted">{{ kataCari.length < 3 ? 'Ketik minimal 3 huruf' : mencari ? 'Mencari…' : 'Tindakan tidak ditemukan' }}</span>
            </template>
          </Select>
        </div>

        <div class="field field--grow">
          <label for="t-ket">Keterangan <span class="req">*</span></label>
          <Textarea
            id="t-ket"
            v-model="keterangan"
            rows="2"
            autoResize
            placeholder="Keterangan tindakan"
            :disabled="!terpilih"
            :invalid="submitted && !keterangan.trim()"
            fluid
          />
          <small v-if="submitted && !keterangan.trim()" class="field__error">Keterangan wajib diisi</small>
        </div>

        <div class="field field--qty">
          <label for="t-qty">Jumlah</label>
          <InputNumber v-model="qty" inputId="t-qty" showButtons :min="1" :max="100" fluid />
        </div>
      </div>

      <div v-if="recent.length || loadingRecent" class="recent">
        <div class="recent__hdr">
          <span><i class="pi pi-star-fill" /> Sering dilakukan di poli ini</span>
          <span v-if="loadingRecent" class="muted"><i class="pi pi-spin pi-spinner" /></span>
          <Button v-else icon="pi pi-refresh" text rounded size="small" severity="secondary" aria-label="Muat ulang" @click="muatRecent" />
        </div>
        <div class="recent__grid">
          <button v-for="item in recent" :key="item.BARCODE" type="button" class="chip" :disabled="adding" v-tooltip.bottom="'Klik untuk langsung ditambahkan'" @click="tambahDariRecent(item)">
            <span class="chip__nama">{{ item.NAMABARANG }}</span>
            <span v-if="item.HARGA > 0" class="chip__harga">{{ formatCurrency(item.HARGA) }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Daftar -->
    <section class="panel">
      <header class="panel__header">
        <h2 class="panel__title">
          <i class="pi pi-list-check panel__icon" />Tindakan kunjungan ini
          <Tag v-if="daftar.length" :value="`${daftar.length} tindakan`" severity="secondary" />
        </h2>
        <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" v-tooltip.left="'Muat ulang'" @click="muatDaftar(true)" />
      </header>

      <p v-if="loading && !daftar.length" class="muted"><i class="pi pi-spin pi-spinner" /> Memuat…</p>
      <div v-else-if="!daftar.length" class="kosong">
        <i class="pi pi-inbox" />
        <p>Belum ada tindakan untuk kunjungan ini</p>
      </div>

      <div v-else class="list" :class="{ 'list--loading': loading }">
        <article v-for="t in daftar" :key="t.RECEIPT_NO" class="item" :class="{ 'item--signed': t.signed }">
          <div class="item__head">
            <div class="item__info">
              <strong>{{ t.TINDAKAN }}</strong>
              <Tag :value="t.KATEGORI || 'Medis'" severity="success" />
              <Tag v-if="t.signed" :value="`Ditandatangani: ${t.AUTH_BY}`" severity="info" />
            </div>
            <div class="item__right">
              <small v-if="t.TANGGAL" class="muted">{{ t.TANGGAL }}</small>
              <Button
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="danger"
                :loading="t.menghapus"
                :aria-label="`Hapus ${t.TINDAKAN}`"
                v-tooltip.left="'Hapus tindakan'"
                @click="konfirmasiHapus(t)"
              />
            </div>
          </div>
          <Textarea v-model="t.keterangan" rows="2" autoResize placeholder="Keterangan tindakan…" :disabled="t.menyimpan || t.signed" fluid :aria-label="`Keterangan ${t.TINDAKAN}`" />
          <div>
            <Button
              icon="pi pi-check"
              label="Simpan keterangan"
              text
              size="small"
              severity="success"
              :disabled="t.signed || !t.keterangan.trim() || t.keterangan.trim() === (t.REMARK_ITEM || '').trim()"
              :loading="t.menyimpan"
              @click="simpanKeterangan(t)"
            />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tindakan {
  display: grid;
  gap: 1rem;
  padding-top: 1rem;
}
.muted {
  color: var(--app-text-muted);
}
.req {
  color: var(--p-red-500);
}
.panel__icon {
  color: var(--p-primary-color);
  margin-right: 0.5rem;
  font-size: 0.9375rem;
}

.form-row {
  display: flex;
  gap: 0.875rem;
  align-items: flex-start;
  flex-wrap: wrap;
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
.field--grow {
  flex: 2 1 16rem;
  min-width: 0;
}
.field--qty {
  flex: 0 0 8rem;
}
.field__error {
  color: var(--p-red-500);
  font-size: 0.8125rem;
}
.opsi {
  display: grid;
  gap: 0.25rem;
}
.opsi__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

/* Sering dilakukan */
.recent {
  margin-top: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-bg);
}
.recent__hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.recent__hdr .pi-star-fill {
  color: var(--p-yellow-500);
  margin-right: 0.25rem;
}
.recent__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip {
  display: grid;
  gap: 0.125rem;
  max-width: 14rem;
  padding: 0.3rem 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-panel);
  color: var(--app-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition);
}
.chip:hover:not(:disabled) {
  border-color: var(--p-primary-color);
}
.chip:disabled {
  opacity: 0.6;
  cursor: wait;
}
.chip__nama {
  font-size: 0.8125rem;
  font-weight: 600;
}
.chip__harga {
  font-size: 0.75rem;
  color: var(--p-green-600);
  font-weight: 600;
}

/* Daftar */
.panel__title :deep(.p-tag) {
  margin-left: 0.5rem;
}
.kosong {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--app-text-muted);
}
.kosong i {
  font-size: 2rem;
  display: block;
  margin-bottom: 0.5rem;
}
.kosong p {
  margin: 0;
}
.list {
  display: grid;
  gap: 0.625rem;
}
.list--loading {
  opacity: 0.5;
  pointer-events: none;
}
.item {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.item--signed {
  border-color: var(--p-blue-300);
}
.item__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.item__info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.item__right {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
</style>
