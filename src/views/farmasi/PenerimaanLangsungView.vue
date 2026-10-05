<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { simpanPenerimaanLangsung } from '@/services/penerimaan'
import { getDaftarSupplier } from '@/services/supplier'
import { getDaftarObat } from '@/services/obat'
import { toYmd } from '@/utils/tanggal'

const router = useRouter()
const toast = useToast()

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

const loading = ref(true)
const saving = ref(false)
const supplierList = ref([])
const obatList = ref([])
const itemError = ref('')
const supplierError = ref('')

const form = ref({
  supplier: null,
  tanggal_penerimaan: new Date(),
  no_faktur: '',
  pajak: 0,
  pajak_include: 1,
  payment_id: 1,
  jatuh_tempo: null
})

function emptyItem() {
  return { obat: null, satuan: null, qty_diterima: 1, harga_satuan: 0, diskon: null, no_batch: '', tgl_expired: null }
}
const items = ref([emptyItem()])

function satuanOptions(obat) {
  return obat ? [obat.SATUAN_KECIL, obat.SATUAN_SEDANG, obat.SATUAN_BESAR].filter(Boolean) : []
}
function onPilihObat(item) {
  item.satuan = item.obat?.SATUAN_KECIL || null
  item.harga_satuan = Number(item.obat?.HARGABELI) || 0
}
function tambahItem() {
  items.value.push(emptyItem())
}
function hapusItem(idx) {
  items.value.splice(idx, 1)
}

function hargaEfektif(item) {
  const harga = Number(item.harga_satuan) || 0
  if (!harga) return 0
  const diskon = Number(item.diskon) || 0
  const netto = Math.round(harga * (1 - diskon / 100))
  const pajak = Number(form.value.pajak) || 0
  if (form.value.pajak_include === 0 && pajak > 0) return Math.round(netto * (1 + pajak / 100))
  return netto
}
function subtotalItem(item) {
  const qty = Number(item.qty_diterima) || 0
  return qty > 0 && item.obat ? hargaEfektif(item) * qty : 0
}
const grandTotal = computed(() => items.value.reduce((sum, i) => sum + subtotalItem(i), 0))
const filledItems = computed(() => items.value.filter((i) => i.obat && Number(i.qty_diterima) > 0))

function onTerminHariChange(hari) {
  if (hari == null || hari === '' || Number(hari) < 0) return
  const base = form.value.tanggal_penerimaan ? new Date(form.value.tanggal_penerimaan) : new Date()
  base.setDate(base.getDate() + Number(hari))
  form.value.jatuh_tempo = base
}

async function muat() {
  loading.value = true
  try {
    const [s, o] = await Promise.all([getDaftarSupplier(), getDaftarObat()])
    supplierList.value = s
    obatList.value = o
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat data', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

function validateItems() {
  supplierError.value = form.value.supplier ? '' : 'Supplier wajib dipilih'
  itemError.value = ''
  if (supplierError.value) return false
  if (filledItems.value.length === 0) {
    itemError.value = 'Minimal 1 item harus diisi obat dan qty.'
    return false
  }
  for (const item of filledItems.value) {
    if (!item.satuan) {
      itemError.value = `Satuan wajib dipilih untuk ${item.obat?.NAMA}.`
      return false
    }
    if (!item.harga_satuan || item.harga_satuan <= 0) {
      itemError.value = `Harga satuan wajib diisi untuk ${item.obat?.NAMA}.`
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
      id_supplier: form.value.supplier.IDSUPLIER,
      tanggal_penerimaan: toYmd(form.value.tanggal_penerimaan),
      no_faktur: form.value.no_faktur.trim(),
      pajak: Number(form.value.pajak) || 0,
      pajak_include: form.value.pajak_include,
      payment_id: form.value.payment_id,
      details: filledItems.value.map((i) => {
        const d = {
          id_barang: i.obat.IDBARANG,
          satuan: i.satuan,
          qty_diterima: Number(i.qty_diterima),
          harga_satuan: Number(i.harga_satuan)
        }
        if (i.diskon != null && i.diskon !== '') d.diskon = i.diskon
        if (i.no_batch) d.no_batch = i.no_batch
        if (i.tgl_expired) d.tgl_expired = toYmd(i.tgl_expired)
        return d
      })
    }
    if (form.value.payment_id === 3 && form.value.jatuh_tempo) payload.jatuh_tempo = toYmd(form.value.jatuh_tempo)

    const { noPenerimaan } = await simpanPenerimaanLangsung(payload)
    toast.add({ severity: 'success', summary: 'Penerimaan tersimpan', detail: noPenerimaan || 'Berhasil disimpan', life: 4000 })
    showFakturDialog.value = false
    router.push({ name: 'farmasi-penerimaan' })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
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
        <h1 class="page-title">Penerimaan langsung</h1>
        <p class="page-subtitle">Terima barang langsung dari supplier tanpa surat pesanan.</p>
      </div>
      <Button label="Kembali" icon="pi pi-arrow-left" severity="secondary" outlined :disabled="saving" @click="kembali" />
    </header>

    <p v-if="loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat data...</p>

    <template v-else>
      <section class="panel form-panel">
        <div class="field field--full">
          <label for="pl-supplier">Supplier <span class="req">*</span></label>
          <Select
            id="pl-supplier"
            v-model="form.supplier"
            :options="supplierList"
            optionLabel="NAMASUPLIER"
            dataKey="IDSUPLIER"
            placeholder="Pilih supplier..."
            filter
            :invalid="!!supplierError"
            :disabled="saving"
            fluid
            @change="supplierError = ''"
          />
          <small v-if="supplierError" class="field__error">{{ supplierError }}</small>
        </div>
      </section>

      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">Daftar item</h2>
          <Button label="Tambah item" icon="pi pi-plus" text size="small" :disabled="saving" @click="tambahItem" />
        </header>

        <Message v-if="itemError" severity="warn" icon="pi pi-exclamation-triangle" class="mb">{{ itemError }}</Message>

        <table class="items-table">
          <thead>
            <tr>
              <th style="min-width: 12rem">Obat</th>
              <th style="width: 7rem">Satuan</th>
              <th style="width: 6rem">Qty</th>
              <th style="width: 9rem">Harga satuan</th>
              <th style="width: 6rem">Diskon %</th>
              <th style="width: 8rem">No. batch</th>
              <th style="width: 8.5rem">Tgl. expired</th>
              <th style="width: 8rem; text-align: right">Subtotal</th>
              <th style="width: 2.5rem"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in items" :key="idx">
              <td>
                <Select
                  v-model="item.obat"
                  :options="obatList"
                  optionLabel="NAMA"
                  dataKey="IDBARANG"
                  placeholder="Pilih obat..."
                  filter
                  :disabled="saving"
                  fluid
                  @change="onPilihObat(item)"
                />
              </td>
              <td>
                <Select v-model="item.satuan" :options="satuanOptions(item.obat)" placeholder="Satuan" :disabled="saving || !item.obat" fluid />
              </td>
              <td>
                <InputNumber v-model="item.qty_diterima" :min="0" :disabled="saving || !item.obat" fluid />
              </td>
              <td>
                <InputNumber v-model="item.harga_satuan" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" :disabled="saving || !item.obat" fluid />
              </td>
              <td>
                <InputNumber v-model="item.diskon" :min="0" :max="100" :disabled="saving || !item.obat" fluid />
              </td>
              <td>
                <InputText v-model="item.no_batch" placeholder="Opsional" :disabled="saving || !item.obat" fluid />
              </td>
              <td>
                <DatePicker v-model="item.tgl_expired" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :disabled="saving || !item.obat" fluid />
              </td>
              <td class="mono strong" style="text-align: right">{{ subtotalItem(item) ? rupiah.format(subtotalItem(item)) : '—' }}</td>
              <td>
                <Button icon="pi pi-trash" text rounded severity="danger" size="small" :disabled="items.length <= 1 || saving" aria-label="Hapus item" @click="hapusItem(idx)" />
              </td>
            </tr>
          </tbody>
          <tfoot v-if="grandTotal > 0">
            <tr>
              <td colspan="7" class="items-table__total-label">Grand total</td>
              <td class="items-table__total" colspan="2">{{ rupiah.format(grandTotal) }}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <footer class="form-actions">
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="kembali" />
        <Button label="Simpan penerimaan" icon="pi pi-check" :loading="saving" @click="bukaDialogFaktur" />
      </footer>
    </template>

    <!-- Dialog informasi faktur — dibuka saat klik "Simpan penerimaan" -->
    <Dialog v-model:visible="showFakturDialog" header="Informasi faktur" modal :closable="!saving" :style="{ width: '42rem', maxWidth: '96vw' }">
      <div class="konf-summary">
        <div class="konf-row">
          <span class="konf-k">Supplier</span>
          <span class="konf-v strong">{{ form.supplier?.NAMASUPLIER }}</span>
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
          <label for="pl-tanggal">Tanggal penerimaan <span class="req">*</span></label>
          <DatePicker id="pl-tanggal" v-model="form.tanggal_penerimaan" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :disabled="saving" fluid />
        </div>
        <div class="field">
          <label for="pl-faktur">No. faktur supplier <span class="req">*</span></label>
          <InputText id="pl-faktur" v-model="form.no_faktur" placeholder="INV-2026-001" :disabled="saving" fluid />
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
          <label for="pl-tempo">Jatuh tempo <span class="req">*</span></label>
          <DatePicker id="pl-tempo" v-model="form.jatuh_tempo" dateFormat="dd/mm/yy" showIcon iconDisplay="input" :disabled="saving" fluid />
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
          <label for="pl-pajak">Persentase pajak</label>
          <InputNumber id="pl-pajak" v-model="form.pajak" :min="0" :max="100" suffix="%" :disabled="saving" fluid />
        </div>
      </div>

      <template #footer>
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="showFakturDialog = false" />
        <Button label="Simpan penerimaan" icon="pi pi-check" :loading="saving" @click="konfirmasiSimpan" />
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
.mb {
  margin-bottom: 0.875rem;
}
.form-panel {
  padding: 1.25rem;
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
.hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--app-text-muted);
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
.strong {
  font-weight: 600;
}
.mono {
  font-variant-numeric: tabular-nums;
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
