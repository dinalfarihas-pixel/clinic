<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  getItemSp,
  getRiwayatPenerimaanSp,
  getDetailPenerimaan,
  simpanPenerimaanSp,
  selesaikanSp,
  batalPenerimaan,
  batalItemPenerimaan
} from '@/services/penerimaan'
import { toYmd } from '@/utils/tanggal'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
const idPemesanan = route.params.idPemesanan

const loading = ref(true)
const saving = ref(false)
const spInfo = ref(null)
const items = ref([])
const itemError = ref('')

const statusRendah = computed(() => (spInfo.value?.status_label || '').toLowerCase())
const isSpSelesai = computed(() => statusRendah.value === 'selesai')
const isSpDiterima = computed(() => statusRendah.value === 'diterima')
const isFullyReceived = computed(() => items.value.length > 0 && items.value.every((i) => i.is_full))
const hasUnsavedItems = computed(() => items.value.some((i) => Number(i._qty_diterima) > 0))

const form = ref({
  tanggal_penerimaan: new Date(),
  no_faktur: '',
  pajak: 0,
  pajak_include: 1,
  payment_id: 1,
  jatuh_tempo: null
})

function petakanItem(raw) {
  const qtyPesanKecil = Number(raw.qty_pesan_kecil ?? raw.qty_pesan ?? 0)
  const qtySudahKecil = Number(raw.qty_sudah_diterima ?? 0)
  const qtySisaKecil = raw.qty_sisa != null ? Number(raw.qty_sisa) : Math.max(qtyPesanKecil - qtySudahKecil, 0)
  return {
    id_barang: raw.id_barang,
    nama_barang: raw.nama_barang,
    satuan_pesan: raw.satuan_pesan || '',
    qty_pesan: Number(raw.qty_pesan) || 0,
    satuan_kecil: raw.satuan_kecil || '',
    satuan_sedang: raw.satuan_sedang || '',
    satuan_besar: raw.satuan_besar || '',
    isi_sedang_ke_kecil: raw.isi_sedang_ke_kecil,
    isi_besar_ke_sedang: raw.isi_besar_ke_sedang,
    qty_sudah_diterima_kecil: qtySudahKecil,
    qty_sisa_kecil: qtySisaKecil,
    is_full: !!raw.is_full,
    _satuan: raw.satuan_pesan || raw.satuan_kecil || '',
    _qty_diterima: null,
    _harga_satuan: Number(raw.harga_satuan) || 0,
    _diskon: null,
    _no_batch: '',
    _tgl_expired: null
  }
}

/** Faktor konversi 1 unit `satuan` ke satuan kecil/dasar barang (dipakai untuk batas qty diterima). */
function faktorSatuan(item, satuan) {
  if (!satuan || satuan === item.satuan_kecil) return 1
  if (satuan === item.satuan_sedang) return Number(item.isi_sedang_ke_kecil) || 1
  if (satuan === item.satuan_besar) return (Number(item.isi_sedang_ke_kecil) || 1) * (Number(item.isi_besar_ke_sedang) || 1)
  return 1
}
function satuanOptions(item) {
  return [item.satuan_kecil, item.satuan_sedang, item.satuan_besar].filter(Boolean)
}
/** Sisa pesanan (yang selalu dihitung backend dalam satuan kecil) dikonversi ke satuan yang dipilih user. */
function sisaDalamSatuan(item) {
  const sisa = item.qty_sisa_kecil / (faktorSatuan(item, item._satuan) || 1)
  return Math.round(sisa * 100) / 100
}

// ── Riwayat penerimaan sebelumnya untuk SP ini ────────────────
const riwayat = ref([])
const riwayatLoading = ref(false)

async function muatRiwayat() {
  riwayatLoading.value = true
  try {
    riwayat.value = await getRiwayatPenerimaanSp(idPemesanan)
  } catch {
    /* riwayat opsional */
  } finally {
    riwayatLoading.value = false
  }
}

async function muat() {
  loading.value = true
  try {
    const { spInfo: sp, items: rawItems } = await getItemSp(idPemesanan)
    spInfo.value = sp
    items.value = rawItems.map(petakanItem)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat data SP', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
  muatRiwayat()
}

function hargaEfektif(item) {
  const harga = Number(item._harga_satuan) || 0
  if (!harga) return 0
  const diskon = Number(item._diskon) || 0
  const netto = Math.round(harga * (1 - diskon / 100))
  const pajak = Number(form.value.pajak) || 0
  if (form.value.pajak_include === 0 && pajak > 0) return Math.round(netto * (1 + pajak / 100))
  return netto
}
function subtotalItem(item) {
  const qty = Number(item._qty_diterima) || 0
  return qty > 0 ? hargaEfektif(item) * qty : 0
}
const grandTotal = computed(() => items.value.reduce((sum, i) => sum + subtotalItem(i), 0))
const filledItems = computed(() => items.value.filter((i) => Number(i._qty_diterima) > 0))

function onTerminHariChange(hari) {
  if (hari == null || hari === '' || Number(hari) < 0) return
  const base = form.value.tanggal_penerimaan ? new Date(form.value.tanggal_penerimaan) : new Date()
  base.setDate(base.getDate() + Number(hari))
  form.value.jatuh_tempo = base
}

function validateItems() {
  itemError.value = ''
  if (filledItems.value.length === 0) {
    itemError.value = 'Isi minimal 1 qty diterima untuk menyimpan penerimaan.'
    return false
  }
  for (const item of filledItems.value) {
    if (Number(item._qty_diterima) > sisaDalamSatuan(item) + 1e-9) {
      itemError.value = `Qty diterima untuk ${item.nama_barang} melebihi sisa pesanan (${sisaDalamSatuan(item)} ${item._satuan}).`
      return false
    }
    if (!item._harga_satuan || item._harga_satuan <= 0) {
      itemError.value = `Harga satuan wajib diisi untuk ${item.nama_barang}.`
      return false
    }
  }
  return true
}

// ── Dialog informasi faktur (dibuka saat klik "Simpan penerimaan") ──
const showFakturDialog = ref(false)
const fakturError = ref('')

function bukaDialogFaktur() {
  if (!validateItems()) return
  fakturError.value = ''
  showFakturDialog.value = true
}

function validateFaktur() {
  fakturError.value = ''
  if (!form.value.no_faktur.trim()) {
    fakturError.value = 'No. faktur wajib diisi.'
    return false
  }
  if (form.value.payment_id === 3 && !form.value.jatuh_tempo) {
    fakturError.value = 'Tanggal jatuh tempo wajib diisi untuk pembayaran kredit.'
    return false
  }
  return true
}

async function konfirmasiSimpan() {
  if (!validateFaktur()) return
  await simpan()
}

async function simpan() {
  saving.value = true
  try {
    const payload = {
      tanggal_penerimaan: toYmd(form.value.tanggal_penerimaan),
      no_faktur: form.value.no_faktur.trim(),
      pajak: Number(form.value.pajak) || 0,
      pajak_include: form.value.pajak_include,
      payment_id: form.value.payment_id,
      details: filledItems.value.map((i) => {
        const d = {
          id_barang: i.id_barang,
          satuan: i._satuan,
          qty_diterima: Number(i._qty_diterima),
          harga_satuan: Number(i._harga_satuan)
        }
        if (i._diskon != null && i._diskon !== '') d.diskon = i._diskon
        if (i._no_batch) d.no_batch = i._no_batch
        if (i._tgl_expired) d.tgl_expired = toYmd(i._tgl_expired)
        return d
      })
    }
    if (form.value.payment_id === 3 && form.value.jatuh_tempo) payload.jatuh_tempo = toYmd(form.value.jatuh_tempo)

    const { noPenerimaan } = await simpanPenerimaanSp(idPemesanan, payload)
    toast.add({ severity: 'success', summary: 'Penerimaan tersimpan', detail: noPenerimaan || 'Berhasil disimpan', life: 4000 })
    showFakturDialog.value = false
    form.value.no_faktur = ''
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

function konfirmasiSelesaikan() {
  confirm.require({
    header: 'Tandai SP selesai?',
    message: 'SP akan ditandai selesai dan tidak dapat menerima penerimaan baru lagi.',
    icon: 'pi pi-check-circle',
    acceptLabel: 'Tandai selesai',
    rejectLabel: 'Batal',
    accept: tandaiSelesai
  })
}
async function tandaiSelesai() {
  saving.value = true
  try {
    const persen = await selesaikanSp(idPemesanan)
    toast.add({
      severity: 'success',
      summary: 'SP selesai',
      detail: persen != null ? `Diterima ${Math.round(persen)}%` : 'Status SP diperbarui',
      life: 4000
    })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyelesaikan SP', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

// ── Batalkan salah satu penerimaan di riwayat ─────────────────
const batalKonfirmasi = ref({ visible: false, item: null, keterangan: '' })
const batalLoading = ref(false)

function konfirmasiBatal(r) {
  batalKonfirmasi.value = { visible: true, item: r, keterangan: '' }
}
async function prosesBatal() {
  const r = batalKonfirmasi.value.item
  if (!r) return
  batalLoading.value = true
  try {
    await batalPenerimaan(r.no_penerimaan, batalKonfirmasi.value.keterangan)
    batalKonfirmasi.value.visible = false
    toast.add({ severity: 'success', summary: 'Penerimaan dibatalkan', detail: r.no_penerimaan, life: 3500 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membatalkan', detail: err.message, life: 5000 })
  } finally {
    batalLoading.value = false
  }
}

// ── Detail satu penerimaan (item barang yang diterima) ────────
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref(null)
const detailRow = ref(null)

async function bukaDetail(r) {
  detailVisible.value = true
  detailLoading.value = true
  detailData.value = null
  detailRow.value = r
  try {
    detailData.value = await getDetailPenerimaan(r.no_penerimaan)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat detail', detail: err.message, life: 5000 })
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

// ── Batalkan satu item dalam detail ────────────────────────────
const batalItemDialog = ref({ visible: false, item: null, keterangan: '' })
const batalItemLoading = ref(null)

function bukaBatalItem(d) {
  batalItemDialog.value = { visible: true, item: d, keterangan: '' }
}
async function prosesBatalItem() {
  const d = batalItemDialog.value.item
  if (!d || !detailRow.value) return
  batalItemLoading.value = d.id_barang
  try {
    const { semuaItemBatal } = await batalItemPenerimaan(detailRow.value.no_penerimaan, d.id_barang, batalItemDialog.value.keterangan)
    batalItemDialog.value.visible = false
    toast.add({ severity: 'success', summary: 'Item dibatalkan', detail: d.nama_barang, life: 3500 })
    const idx = detailData.value?.details?.findIndex((x) => x.id_barang === d.id_barang)
    if (idx >= 0) detailData.value.details[idx] = { ...detailData.value.details[idx], is_batal: 1 }
    if (semuaItemBatal) {
      detailRow.value = { ...detailRow.value, is_batal: 1 }
      detailVisible.value = false
    }
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membatalkan item', detail: err.message, life: 5000 })
  } finally {
    batalItemLoading.value = null
  }
}

function kembali() {
  router.push({ name: 'farmasi-penerimaan' })
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Terima barang{{ spInfo?.no_sp ? ' — ' + spInfo.no_sp : '' }}</h1>
        <p class="page-subtitle">{{ spInfo?.nama_supplier || 'Catat barang yang diterima dari surat pesanan ini.' }}</p>
      </div>
      <Button label="Kembali" icon="pi pi-arrow-left" severity="secondary" outlined :disabled="saving" @click="kembali" />
    </header>

    <p v-if="loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat data SP...</p>

    <template v-else>
      <div v-if="isSpSelesai" class="notice notice--lock">
        <i class="pi pi-lock" />
        SP ini sudah ditandai selesai — tidak dapat menerima penerimaan baru.
      </div>
      <div v-else-if="isFullyReceived" class="notice notice--ok">
        <i class="pi pi-check-circle" />
        Semua item sudah diterima penuh. Klik "Tandai selesai" untuk menutup SP ini.
      </div>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">Daftar item SP</h2>
        </header>

        <Message v-if="itemError" severity="warn" icon="pi pi-exclamation-triangle" class="mb">{{ itemError }}</Message>

        <table class="items-table">
          <thead>
            <tr>
              <th style="min-width: 12rem">Nama barang</th>
              <th style="width: 6rem; text-align: center">Qty pesan</th>
              <th style="width: 6rem; text-align: center">Sdh diterima</th>
              <th style="width: 6rem; text-align: center">Sisa</th>
              <th style="width: 6rem">Satuan</th>
              <th style="width: 7rem">Qty diterima</th>
              <th style="width: 9rem">Harga satuan</th>
              <th style="width: 6rem">Diskon %</th>
              <th style="width: 8rem">No. batch</th>
              <th style="width: 8.5rem">Tgl. expired</th>
              <th style="width: 8rem; text-align: right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id_barang" :class="{ 'row-full': item.is_full }">
              <td>
                <span class="strong">{{ item.nama_barang }}</span>
                <Tag v-if="item.is_full" value="Sudah penuh" severity="secondary" class="full-tag" />
              </td>
              <td class="mono" style="text-align: center">{{ item.qty_pesan }} {{ item.satuan_pesan }}</td>
              <td class="mono" style="text-align: center">{{ item.qty_sudah_diterima_kecil }} {{ item.satuan_kecil }}</td>
              <td class="mono" style="text-align: center" :class="item.qty_sisa_kecil === 0 ? 'sisa-nol' : 'sisa-ada'">{{ item.qty_sisa_kecil }} {{ item.satuan_kecil }}</td>
              <td>
                <Select v-model="item._satuan" :options="satuanOptions(item)" :disabled="item.is_full || isSpSelesai || saving" fluid />
              </td>
              <td>
                <InputNumber v-model="item._qty_diterima" :min="0" :max="sisaDalamSatuan(item)" :disabled="item.is_full || isSpSelesai || saving" fluid />
              </td>
              <td>
                <InputNumber v-model="item._harga_satuan" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" :disabled="item.is_full || isSpSelesai || saving" fluid />
              </td>
              <td>
                <InputNumber v-model="item._diskon" :min="0" :max="100" :disabled="item.is_full || isSpSelesai || saving" fluid />
              </td>
              <td>
                <InputText v-model="item._no_batch" placeholder="Opsional" :disabled="item.is_full || isSpSelesai || saving" fluid />
              </td>
              <td>
                <DatePicker v-model="item._tgl_expired" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :disabled="item.is_full || isSpSelesai || saving" fluid />
              </td>
              <td class="mono strong" style="text-align: right">{{ subtotalItem(item) ? rupiah.format(subtotalItem(item)) : '—' }}</td>
            </tr>
            <tr v-if="!items.length">
              <td colspan="11" class="empty">Tidak ada item ditemukan untuk SP ini.</td>
            </tr>
          </tbody>
          <tfoot v-if="grandTotal > 0">
            <tr>
              <td colspan="10" class="items-table__total-label">Grand total</td>
              <td class="items-table__total">{{ rupiah.format(grandTotal) }}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">Riwayat penerimaan SP ini</h2>
        </header>
        <p v-if="riwayatLoading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat riwayat...</p>
        <p v-else-if="!riwayat.length" class="empty">Belum ada penerimaan sebelumnya untuk SP ini.</p>
        <ul v-else class="riwayat">
          <li
            v-for="r in riwayat"
            :key="r.no_penerimaan"
            class="riwayat__item"
            :class="{ 'riwayat__item--batal': r.is_batal }"
            role="button"
            tabindex="0"
            v-tooltip.top="'Lihat detail item'"
            @click="bukaDetail(r)"
            @keydown.enter="bukaDetail(r)"
          >
            <div>
              <span class="mono strong">{{ r.no_penerimaan }}</span>
              <span class="riwayat__meta">{{ r.tanggal_penerimaan }} · {{ r.jumlah_item ?? '—' }} item</span>
              <span v-if="r.is_batal" class="riwayat__meta">Dibatalkan oleh {{ r.nama_batalkan_oleh || '—' }}</span>
            </div>
            <div class="riwayat__actions">
              <Tag v-if="r.is_batal" value="Dibatalkan" severity="danger" />
              <Button
                v-else
                icon="pi pi-times-circle"
                text
                rounded
                severity="danger"
                size="small"
                v-tooltip.top="'Batalkan penerimaan'"
                :loading="batalLoading && batalKonfirmasi.item?.no_penerimaan === r.no_penerimaan"
                @click.stop="konfirmasiBatal(r)"
              />
              <i class="pi pi-chevron-right riwayat__chevron" />
            </div>
          </li>
        </ul>
      </section>

      <footer class="form-actions">
        <Button label="Kembali" severity="secondary" outlined :disabled="saving" @click="kembali" />
        <Button v-if="!isSpSelesai && hasUnsavedItems" label="Simpan penerimaan" icon="pi pi-check" :loading="saving" @click="bukaDialogFaktur" />
        <Button v-if="!isSpSelesai && !hasUnsavedItems && (isFullyReceived || isSpDiterima)" label="Tandai selesai" icon="pi pi-check-circle" severity="success" :loading="saving" @click="konfirmasiSelesaikan" />
      </footer>
    </template>

    <!-- Konfirmasi batal penerimaan (riwayat) -->
    <Dialog v-model:visible="batalKonfirmasi.visible" header="Batalkan penerimaan?" modal :closable="!batalLoading" :style="{ width: '28rem' }">
      <Message severity="warn" icon="pi pi-exclamation-triangle">
        Penerimaan <strong>{{ batalKonfirmasi.item?.no_penerimaan }}</strong> akan dibatalkan dan stok yang sudah masuk akan dikembalikan.
      </Message>
      <div class="field mt">
        <label for="tr-batal-keterangan">Keterangan pembatalan <small>(opsional)</small></label>
        <Textarea id="tr-batal-keterangan" v-model="batalKonfirmasi.keterangan" rows="2" autoResize fluid :disabled="batalLoading" />
      </div>
      <template #footer>
        <Button label="Kembali" severity="secondary" outlined :disabled="batalLoading" @click="batalKonfirmasi.visible = false" />
        <Button label="Ya, batalkan" icon="pi pi-times-circle" severity="danger" :loading="batalLoading" @click="prosesBatal" />
      </template>
    </Dialog>

    <!-- Dialog informasi faktur — dibuka saat klik "Simpan penerimaan" -->
    <Dialog v-model:visible="showFakturDialog" header="Informasi faktur" modal :closable="!saving" :style="{ width: '42rem', maxWidth: '96vw' }">
      <div class="konf-summary">
        <div class="konf-row">
          <span class="konf-k">Surat pesanan</span>
          <span class="konf-v mono strong">{{ spInfo?.no_sp }}</span>
        </div>
        <div v-if="spInfo?.nama_supplier" class="konf-row">
          <span class="konf-k">Supplier</span>
          <span class="konf-v">{{ spInfo.nama_supplier }}</span>
        </div>
        <div class="konf-row">
          <span class="konf-k">Jumlah item</span>
          <span class="konf-v">{{ filledItems.length }} item</span>
        </div>
        <div v-if="grandTotal > 0" class="konf-row">
          <span class="konf-k">Grand total</span>
          <span class="konf-v mono strong grand">{{ rupiah.format(grandTotal) }}</span>
        </div>
      </div>

      <Message v-if="fakturError" severity="warn" icon="pi pi-exclamation-triangle" class="mb mt">{{ fakturError }}</Message>

      <div class="form-faktur mt">
        <div class="field">
          <label for="tp-tanggal">Tanggal penerimaan <span class="req">*</span></label>
          <DatePicker id="tp-tanggal" v-model="form.tanggal_penerimaan" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :disabled="saving" fluid />
        </div>
        <div class="field">
          <label for="tp-faktur">No. faktur supplier <span class="req">*</span></label>
          <InputText id="tp-faktur" v-model="form.no_faktur" placeholder="INV-2026-001" :disabled="saving" fluid />
        </div>
        <div class="field">
          <label>Cara bayar</label>
          <SelectButton
            v-model="form.payment_id"
            :options="[{ label: 'Tunai', value: 1 }, { label: 'Kredit', value: 3 }]"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            :disabled="saving"
          />
        </div>
        <div v-if="form.payment_id === 3" class="field">
          <label for="tp-tempo">Jatuh tempo <span class="req">*</span></label>
          <DatePicker id="tp-tempo" v-model="form.jatuh_tempo" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :disabled="saving" fluid />
          <small class="hint">Atau isi termin (hari): <InputNumber :min="0" style="width: 6rem" @update:modelValue="onTerminHariChange" /></small>
        </div>
        <div class="field">
          <label>Pajak</label>
          <SelectButton
            v-model="form.pajak_include"
            :options="[{ label: 'Include', value: 1 }, { label: 'Exclude', value: 0 }]"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            :disabled="saving"
          />
        </div>
        <div v-if="form.pajak_include === 0" class="field">
          <label for="tp-pajak">Persentase pajak</label>
          <InputNumber id="tp-pajak" v-model="form.pajak" :min="0" :max="100" suffix="%" :disabled="saving" fluid />
        </div>
      </div>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showFakturDialog = false" />
        <Button label="Simpan penerimaan" icon="pi pi-check" :loading="saving" @click="konfirmasiSimpan" />
      </template>
    </Dialog>

    <!-- Dialog detail penerimaan (item barang yang diterima pada satu riwayat) -->
    <Dialog v-model:visible="detailVisible" modal :closable="!detailLoading" :style="{ width: '54rem', maxWidth: '96vw' }">
      <template #header>
        <div class="det-header">
          <span class="mono strong">{{ detailData?.header?.no_penerimaan ?? detailRow?.no_penerimaan }}</span>
          <Tag v-if="detailRow?.is_batal" value="Dibatalkan" severity="danger" />
        </div>
      </template>

      <p v-if="detailLoading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat detail penerimaan...</p>
      <template v-else-if="detailData">
        <Message v-if="detailRow?.is_batal" severity="warn" icon="pi pi-exclamation-triangle" class="mb">
          Penerimaan ini telah dibatalkan
          <template v-if="detailRow.nama_batalkan_oleh"> oleh <strong>{{ detailRow.nama_batalkan_oleh }}</strong></template>
          <template v-if="detailRow.tanggal_batal"> · {{ detailRow.tanggal_batal }}</template>
          <template v-if="detailRow.keterangan_batal || detailData?.header?.keterangan_batal">
            <br />Keterangan: <em>{{ detailRow.keterangan_batal || detailData.header.keterangan_batal }}</em>
          </template>
        </Message>

        <div class="det-stat-row">
          <div class="det-stat-card">
            <span class="det-stat-lbl">Tanggal</span>
            <span class="det-stat-val mono">{{ detailData.header?.tanggal_penerimaan || '—' }}</span>
          </div>
          <div class="det-stat-card">
            <span class="det-stat-lbl">No. faktur</span>
            <span class="det-stat-val mono">{{ detailData.header?.no_faktur || '—' }}</span>
          </div>
          <div class="det-stat-card">
            <span class="det-stat-lbl">Cara bayar</span>
            <span class="det-stat-val">{{ Number(detailData.header?.payment_id) === 1 ? 'Tunai' : 'Kredit' }}</span>
          </div>
          <div class="det-stat-card">
            <span class="det-stat-lbl">Status lunas</span>
            <Tag :value="Number(detailData.header?.status_lunas) === 1 ? 'Lunas' : 'Belum lunas'" :severity="Number(detailData.header?.status_lunas) === 1 ? 'success' : 'warn'" />
          </div>
        </div>

        <div class="det-info-grid">
          <div class="det-info-box">
            <div class="det-box-title">Supplier</div>
            <div class="det-kv"><span class="det-k">Nama</span><span class="det-v strong">{{ detailData.header?.nama_supplier || '—' }}</span></div>
            <div class="det-kv"><span class="det-k">No. telp</span><span class="det-v mono">{{ detailData.header?.no_telp || '—' }}</span></div>
            <div v-if="Number(detailData.header?.payment_id) !== 1" class="det-kv"><span class="det-k">Jatuh tempo</span><span class="det-v mono">{{ detailData.header?.jatuh_tempo || '—' }}</span></div>
          </div>
          <div class="det-info-box det-total-box">
            <div class="det-box-title">Ringkasan total</div>
            <div class="det-kv"><span class="det-k">Pajak</span><span class="det-v">{{ detailData.header?.PAJAK ?? '—' }}%</span></div>
            <div class="det-kv"><span class="det-k">Sub total</span><span class="det-v mono">{{ detailData.header?.SUB_TOTAL ? rupiah.format(detailData.header.SUB_TOTAL) : '—' }}</span></div>
            <div class="det-kv det-kv-grand"><span class="det-k">Grand total</span><span class="det-v mono grand">{{ detailData.header?.GRAND_TOTAL ? rupiah.format(detailData.header.GRAND_TOTAL) : '—' }}</span></div>
          </div>
        </div>

        <p class="det-box-title mt">Item diterima ({{ detailData.details?.length ?? 0 }})</p>
        <table class="det-table">
          <thead>
            <tr>
              <th>Nama barang</th>
              <th style="text-align: center">Qty</th>
              <th>Satuan</th>
              <th style="text-align: right">Harga satuan</th>
              <th style="text-align: right">Total</th>
              <th>No. batch</th>
              <th>Tgl. expired</th>
              <th v-if="!detailRow?.is_batal" style="text-align: center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in detailData.details" :key="d.id_barang" :class="{ 'row-batal': d.is_batal }">
              <td class="strong">{{ d.nama_barang }}</td>
              <td class="mono" style="text-align: center">{{ d.qty_diterima }}</td>
              <td>{{ d.satuan }}</td>
              <td class="mono" style="text-align: right">{{ d.harga_satuan ? rupiah.format(d.harga_satuan) : '—' }}</td>
              <td class="mono strong" style="text-align: right">{{ d.HARGA_TOTAL ? rupiah.format(d.HARGA_TOTAL) : '—' }}</td>
              <td class="mono">{{ d.no_batch || '—' }}</td>
              <td class="mono">{{ d.tgl_expired || '—' }}</td>
              <td v-if="!detailRow?.is_batal" style="text-align: center" class="no-strike">
                <span v-if="d.is_batal" class="dibatalkan-label">Dibatalkan</span>
                <Button
                  v-else
                  icon="pi pi-times"
                  text
                  rounded
                  severity="danger"
                  size="small"
                  v-tooltip.top="'Batal item'"
                  :loading="batalItemLoading === d.id_barang"
                  @click="bukaBatalItem(d)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </Dialog>

    <!-- Konfirmasi batal item -->
    <Dialog v-model:visible="batalItemDialog.visible" header="Batalkan item penerimaan?" modal :closable="!batalItemLoading" :style="{ width: '28rem' }">
      <p>Item <strong>{{ batalItemDialog.item?.nama_barang }}</strong> akan dibatalkan dan stok dikembalikan. Tindakan ini tidak dapat diurungkan.</p>
      <div class="field mt">
        <label for="tr-batal-item-keterangan">Keterangan pembatalan <small>(opsional)</small></label>
        <Textarea id="tr-batal-item-keterangan" v-model="batalItemDialog.keterangan" rows="2" autoResize fluid :disabled="!!batalItemLoading" />
      </div>
      <template #footer>
        <Button label="Tidak" severity="secondary" outlined :disabled="!!batalItemLoading" @click="batalItemDialog.visible = false" />
        <Button label="Ya, batalkan item" icon="pi pi-times" severity="danger" :loading="!!batalItemLoading" @click="prosesBatalItem" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.625rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
}
.notice--lock {
  background: var(--p-surface-100, #f1f5f9);
  color: var(--app-text-muted);
}
.notice--ok {
  background: var(--p-green-50, #f0fdf4);
  color: var(--p-green-700, #15803d);
}
.mb {
  margin-bottom: 0.875rem;
}
.mt {
  margin-top: 0.875rem;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.items-table th {
  text-align: left;
  padding: 0.375rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
  white-space: nowrap;
}
.items-table td {
  padding: 0.375rem 0.5rem;
  vertical-align: middle;
  border-bottom: 1px solid var(--app-border);
}
.items-table__total-label {
  text-align: right;
  font-weight: 600;
  padding: 0.5rem;
}
.items-table__total {
  font-weight: 700;
  padding: 0.5rem;
  white-space: nowrap;
}
.row-full {
  opacity: 0.6;
}
.full-tag {
  margin-left: 0.375rem;
}
.strong {
  font-weight: 600;
}
.mono {
  font-variant-numeric: tabular-nums;
}
.sisa-nol {
  color: var(--p-red-500);
  font-weight: 700;
}
.sisa-ada {
  color: var(--p-primary-color);
  font-weight: 600;
}

.konf-summary {
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 0.75rem 0.875rem;
}
.konf-row {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.5rem;
  padding: 0.1875rem 0;
  font-size: 0.8125rem;
}
.konf-k {
  color: var(--app-text-muted);
}
.grand {
  font-size: 0.9375rem;
  color: var(--p-primary-color);
}

.form-faktur {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem 1.25rem;
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
.req {
  color: var(--p-red-500);
}
.hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--app-text-muted);
}

.riwayat {
  list-style: none;
  margin: 0;
  padding: 0;
}
.riwayat__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 0;
  cursor: pointer;
  border-radius: 6px;
  transition: background var(--transition, 0.15s);
}
.riwayat__item:hover,
.riwayat__item:focus-visible {
  background: var(--p-surface-50, #f8fafc);
  outline: none;
}
.riwayat__item + .riwayat__item {
  border-top: 1px solid var(--app-border);
}
.riwayat__item--batal {
  opacity: 0.6;
}
.riwayat__meta {
  display: block;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.riwayat__actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}
.riwayat__chevron {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}

.det-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.det-stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.625rem;
  margin-bottom: 0.875rem;
}
.det-stat-card {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 0.625rem 0.75rem;
}
.det-stat-lbl {
  font-size: 0.6875rem;
  color: var(--app-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.det-stat-val {
  font-size: 0.8125rem;
  font-weight: 700;
}
.det-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.625rem;
  margin-bottom: 0.5rem;
}
.det-info-box {
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 0.75rem 0.875rem;
}
.det-total-box {
  background: var(--p-primary-50);
}
:global(.app-dark) .det-total-box {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}
.det-box-title {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-primary-color);
  margin: 0 0 0.5rem;
}
.det-box-title.mt {
  margin-top: 1rem;
}
.det-kv {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 0.375rem;
  padding: 0.1875rem 0;
  font-size: 0.8125rem;
}
.det-kv-grand {
  border-top: 1px solid var(--app-border);
  padding-top: 0.5rem;
  margin-top: 0.25rem;
}
.det-k {
  color: var(--app-text-muted);
}
.det-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.det-table th {
  text-align: left;
  padding: 0.4375rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
  white-space: nowrap;
}
.det-table td {
  padding: 0.4375rem 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.det-table tr.row-batal {
  opacity: 0.5;
}
.det-table tr.row-batal td:not(.no-strike) {
  text-decoration: line-through;
}
.dibatalkan-label {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--p-red-500);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

@media (max-width: 768px) {
  .form-faktur {
    grid-template-columns: 1fr 1fr;
  }
  .det-stat-row,
  .det-info-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 575px) {
  .form-faktur {
    grid-template-columns: 1fr;
  }
  .form-actions {
    flex-wrap: wrap;
  }
}
</style>
