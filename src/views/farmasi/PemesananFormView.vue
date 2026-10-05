<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getDetailPemesanan, simpanPemesanan, updatePemesanan, setujuiPemesanan } from '@/services/pemesanan'
import { getDaftarSupplier } from '@/services/supplier'
import { getDaftarObat } from '@/services/obat'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

const editId = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => editId.value !== null)

const loading = ref(true)
const saving = ref(false)
const errors = ref({})
const supplierList = ref([])
const obatList = ref([])
const noSp = ref('')
const originalStatus = ref(0)
// Status ≥ 2 (Dikirim/Diterima/Selesai): sudah dikirim ke supplier, tidak boleh diubah lagi
const readOnly = computed(() => isEdit.value && originalStatus.value >= 2)

function emptyItem() {
  return { obat: null, satuan: null, qty_pesan: null, harga_satuan: 0 }
}
function emptyForm() {
  return { supplier: null, no_referensi: '', keterangan: '', items: [emptyItem()] }
}
const form = ref(emptyForm())

function satuanOptions(obat) {
  return obat ? [obat.SATUAN_KECIL, obat.SATUAN_SEDANG, obat.SATUAN_BESAR].filter(Boolean) : []
}
function onPilihObat(item) {
  item.satuan = item.obat?.SATUAN_KECIL || null
}
function tambahItem() {
  form.value.items.push(emptyItem())
}
function hapusItem(idx) {
  form.value.items.splice(idx, 1)
}
function subtotal(item) {
  return (Number(item.qty_pesan) || 0) * (Number(item.harga_satuan) || 0)
}
const grandTotal = computed(() => form.value.items.reduce((sum, it) => sum + subtotal(it), 0))

async function muat() {
  loading.value = true
  try {
    const [s, o] = await Promise.all([getDaftarSupplier(), getDaftarObat()])
    supplierList.value = s
    obatList.value = o

    if (isEdit.value) {
      const detail = await getDetailPemesanan(editId.value)
      noSp.value = detail.head.no_sp
      originalStatus.value = Number(detail.head.status)
      form.value = {
        supplier: s.find((x) => x.IDSUPLIER == detail.head.id_supplier) || null,
        no_referensi: detail.head.no_referensi || '',
        keterangan: detail.head.keterangan || '',
        items: detail.details.length
          ? detail.details.map((d) => ({
              obat: o.find((x) => x.IDBARANG === d.id_barang) || { IDBARANG: d.id_barang, NAMA: d.nama_barang, SATUAN_KECIL: d.satuan },
              satuan: d.satuan,
              qty_pesan: Number(d.qty_pesan),
              harga_satuan: Number(d.harga_satuan)
            }))
          : [emptyItem()]
      }
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat data', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

function validate() {
  const e = {}
  if (!form.value.supplier) e.supplier = 'Supplier wajib dipilih'
  form.value.items.forEach((it, idx) => {
    if (!it.obat) e[`obat_${idx}`] = 'wajib'
    if (!it.satuan) e[`satuan_${idx}`] = 'wajib'
    if (!it.qty_pesan || Number(it.qty_pesan) <= 0) e[`qty_${idx}`] = 'wajib > 0'
  })
  errors.value = e
  return Object.keys(e).length === 0
}

function buildPayload() {
  return {
    id_supplier: form.value.supplier.IDSUPLIER,
    no_referensi: form.value.no_referensi.trim(),
    keterangan: form.value.keterangan.trim(),
    details: form.value.items.map((it) => ({
      id_barang: it.obat.IDBARANG,
      qty_pesan: it.qty_pesan,
      satuan: it.satuan,
      harga_satuan: it.harga_satuan
    }))
  }
}

function kembali() {
  router.push({ name: 'farmasi-pesanan' })
}

function konfirmasiSimpan(aksi) {
  if (isEdit.value && originalStatus.value === 1) {
    confirm.require({
      header: 'SP akan kembali ke Draft',
      message: `${noSp.value} sudah berstatus Siap Dikirim. Menyimpan perubahan akan mengembalikan status ke Draft dan perlu disetujui ulang.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Lanjutkan',
      rejectLabel: 'Batal',
      accept: aksi
    })
  } else {
    aksi()
  }
}

async function simpanDraft() {
  if (!validate()) return
  saving.value = true
  try {
    const payload = buildPayload()
    if (isEdit.value) await updatePemesanan(editId.value, payload)
    else await simpanPemesanan(payload)
    toast.add({ severity: 'success', summary: isEdit.value ? 'SP diperbarui' : 'SP disimpan sebagai draft', life: 3500 })
    kembali()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

async function simpanDanAjukan() {
  if (!validate()) return
  saving.value = true
  try {
    const payload = buildPayload()
    let id = editId.value
    if (isEdit.value) await updatePemesanan(id, payload)
    else {
      const hasil = await simpanPemesanan(payload)
      id = hasil.id_pemesanan
    }
    await setujuiPemesanan(id)
    toast.add({ severity: 'success', summary: 'SP disimpan & diajukan', detail: 'Status: Siap Dikirim', life: 3500 })
    kembali()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ isEdit ? `${readOnly ? 'Detail' : 'Edit'} surat pesanan${noSp ? ' — ' + noSp : ''}` : 'Tambah surat pesanan' }}</h1>
        <p class="page-subtitle">Pilih supplier lalu tambahkan item obat yang dipesan.</p>
      </div>
      <Button label="Kembali" icon="pi pi-arrow-left" severity="secondary" outlined :disabled="saving" @click="kembali" />
    </header>

    <p v-if="loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat data...</p>

    <template v-else>
      <div v-if="readOnly" class="notice">
        <i class="pi pi-lock" />
        SP ini sudah {{ originalStatus === 2 ? 'dikirim' : originalStatus === 3 ? 'diterima' : 'selesai' }} — tidak dapat diubah lagi.
      </div>

      <section class="panel form-panel">
        <form class="form-sp" @submit.prevent>
          <div class="field field--full">
            <label for="sp-supplier">Supplier <span class="req">*</span></label>
            <Select
              v-model="form.supplier"
              inputId="sp-supplier"
              :options="supplierList"
              optionLabel="NAMASUPLIER"
              dataKey="IDSUPLIER"
              placeholder="Pilih supplier..."
              filter
              :invalid="!!errors.supplier"
              :disabled="readOnly"
              fluid
            />
            <small v-if="errors.supplier" class="field__error">{{ errors.supplier }}</small>
          </div>

          <div class="field">
            <label for="sp-referensi">No. referensi penawaran</label>
            <InputText id="sp-referensi" v-model="form.no_referensi" placeholder="Opsional" :disabled="readOnly" fluid />
          </div>
          <div class="field">
            <label for="sp-keterangan">Keterangan</label>
            <InputText id="sp-keterangan" v-model="form.keterangan" placeholder="Opsional" :disabled="readOnly" fluid />
          </div>

          <div class="field field--full">
            <div class="items-header">
              <label>Item obat <span class="req">*</span></label>
              <Button v-if="!readOnly" label="Tambah item" icon="pi pi-plus" text size="small" @click="tambahItem" />
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 34%">Obat</th>
                  <th style="width: 14%">Satuan</th>
                  <th style="width: 12%">Qty</th>
                  <th style="width: 17%">Harga satuan</th>
                  <th style="width: 17%">Subtotal</th>
                  <th v-if="!readOnly" style="width: 3rem"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in form.items" :key="idx">
                  <td>
                    <Select
                      v-model="item.obat"
                      :options="obatList"
                      optionLabel="NAMA"
                      dataKey="IDBARANG"
                      placeholder="Pilih obat..."
                      filter
                      :invalid="!!errors[`obat_${idx}`]"
                      :disabled="readOnly"
                      fluid
                      @change="onPilihObat(item)"
                    />
                  </td>
                  <td>
                    <Select v-model="item.satuan" :options="satuanOptions(item.obat)" placeholder="Satuan" :invalid="!!errors[`satuan_${idx}`]" :disabled="readOnly || !item.obat" fluid />
                  </td>
                  <td>
                    <InputNumber v-model="item.qty_pesan" :min="0" :invalid="!!errors[`qty_${idx}`]" :disabled="readOnly" fluid />
                  </td>
                  <td>
                    <InputNumber v-model="item.harga_satuan" mode="currency" currency="IDR" locale="id-ID" :minFractionDigits="0" :disabled="readOnly" fluid />
                  </td>
                  <td class="items-table__subtotal">{{ rupiah.format(subtotal(item)) }}</td>
                  <td v-if="!readOnly">
                    <Button icon="pi pi-trash" text rounded severity="danger" size="small" :disabled="form.items.length <= 1" aria-label="Hapus item" @click="hapusItem(idx)" />
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td :colspan="readOnly ? 4 : 5" class="items-table__total-label">Grand total</td>
                  <td class="items-table__total">{{ rupiah.format(grandTotal) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </form>
      </section>

      <footer v-if="!readOnly" class="form-actions">
        <Button label="Batal" severity="secondary" outlined :disabled="saving" @click="kembali" />
        <Button label="Simpan draft" severity="secondary" :loading="saving" @click="konfirmasiSimpan(simpanDraft)" />
        <Button label="Simpan & ajukan" icon="pi pi-check" :loading="saving" @click="konfirmasiSimpan(simpanDanAjukan)" />
      </footer>
    </template>
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
  background: var(--p-surface-100, #f1f5f9);
  color: var(--app-text-muted);
  font-size: 0.875rem;
}

.form-panel {
  padding: 1.25rem;
}

.form-sp {
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
.req {
  color: var(--p-red-500);
}

.items-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
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
  border-bottom: 1px solid var(--p-content-border-color, #e2e8f0);
}
.items-table td {
  padding: 0.375rem 0.5rem;
  vertical-align: top;
  border-bottom: 1px solid var(--p-content-border-color, #e2e8f0);
}
.items-table__subtotal {
  padding-top: 0.75rem !important;
  white-space: nowrap;
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

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

@media (max-width: 575px) {
  .form-sp {
    grid-template-columns: 1fr;
  }
  .form-actions {
    flex-wrap: wrap;
  }
}
</style>
