<script setup>
import { ref, computed, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { simpanOpname } from '@/services/stockopname'

const props = defineProps({
  batches: { type: Array, default: () => [] },
  bulanTahun: { type: String, required: true },
  canSave: { type: Boolean, default: false },
  showBarang: { type: Boolean, default: false } // tampilkan kolom nama barang (mode per rak)
})
const emit = defineEmits(['saved'])

const toast = useToast()
const confirm = useConfirm()
const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

// Draft input per SUB_BARCODE: { qty, satuan, catatan }
const draft = ref({})
// Draft dibuat di sini (bukan saat render) supaya template tidak mengubah state reaktif.
watch(
  () => props.batches,
  (list) => {
    draft.value = Object.fromEntries(list.map((b) => [b.SUB_BARCODE, { qty: null, satuan: b.SATUAN_KECIL, catatan: '' }]))
  },
  { immediate: true }
)

const satuanOf = (b) => [b.SATUAN_KECIL, b.SATUAN_SEDANG, b.SATUAN_BESAR].filter(Boolean)
function faktor(b, satuan) {
  if (satuan && satuan === b.SATUAN_BESAR) return (Number(b.ISI_SEDANG_KE_KECIL) || 1) * (Number(b.ISI_BESAR_KE_SEDANG) || 1)
  if (satuan && satuan === b.SATUAN_SEDANG) return Number(b.ISI_SEDANG_KE_KECIL) || 1
  return 1
}
const d = (b) => draft.value[b.SUB_BARCODE] || {}
// Selisih pratinjau (satuan kecil) = fisik - sistem sekarang
function selisih(b) {
  const x = draft.value[b.SUB_BARCODE]
  if (!x || x.qty == null) return null
  return x.qty * faktor(b, x.satuan) - (Number(b.QTY_SISTEM_SEKARANG) || 0)
}

const terisi = computed(() => props.batches.filter((b) => draft.value[b.SUB_BARCODE]?.qty != null))
const saving = ref(false)

function konfirmasi() {
  const n = terisi.value.length
  confirm.require({
    header: 'Simpan hasil opname?',
    message: `${n} batch akan disimpan dan LANGSUNG mengubah stok sesuai hitungan fisik.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Simpan',
    rejectLabel: 'Batal',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: simpan
  })
}

async function simpan() {
  saving.value = true
  try {
    const items = terisi.value.map((b) => {
      const x = draft.value[b.SUB_BARCODE]
      const item = { SUB_BARCODE: b.SUB_BARCODE, QTY: x.qty }
      if (x.satuan && x.satuan !== b.SATUAN_KECIL) item.SATUAN = x.satuan
      if (x.catatan?.trim()) item.CATATAN = x.catatan.trim()
      return item
    })
    const hasil = await simpanOpname(props.bulanTahun, items)
    const beda = (hasil?.DETAIL || []).filter((r) => Number(r.SELISIH) !== 0).length
    toast.add({ severity: 'success', summary: 'Opname tersimpan', detail: `${hasil?.JUMLAH_ITEM ?? items.length} batch, ${beda} berselisih`, life: 4000 })
    emit('saved')
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal menyimpan opname', detail: err.message, life: 6000 })
  } finally {
    saving.value = false
  }
}

function formatTgl(v) {
  if (!v || String(v).startsWith('0000')) return '—'
  const t = new Date(String(v).replace(' ', 'T'))
  return isNaN(t) ? v : t.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
  <div>
    <DataTable :value="batches" dataKey="SUB_BARCODE" size="small" stripedRows scrollable>
      <template #empty><p class="opn-empty">Tidak ada batch.</p></template>
      <Column v-if="showBarang" header="Barang" style="min-width: 12rem">
        <template #body="{ data }">
          <strong>{{ data.NAMA_BARANG }}</strong>
          <div class="opn-sub">{{ data.BARCODE }}</div>
        </template>
      </Column>
      <Column header="Batch" style="min-width: 9rem">
        <template #body="{ data }">
          {{ data.BATCH_NUMBER || '—' }}
          <div class="opn-sub">{{ data.SUB_BARCODE }}</div>
        </template>
      </Column>
      <Column header="Expired" style="min-width: 6.5rem">
        <template #body="{ data }">{{ formatTgl(data.TGL_EXPIRED) }}</template>
      </Column>
      <Column header="Stok sistem" style="min-width: 7rem">
        <template #body="{ data }">{{ angka.format(data.QTY_SISTEM_SEKARANG) }} {{ data.SATUAN_KECIL }}</template>
      </Column>
      <Column header="Status" style="min-width: 9rem">
        <template #body="{ data }">
          <Tag :value="data.STTS" :severity="data.STTS === 'SUDAH' ? 'success' : 'secondary'" />
          <div v-if="data.STTS === 'SUDAH'" class="opn-sub">
            fisik {{ angka.format(data.QTY_FISIK) }}, selisih {{ angka.format(data.SELISIH) }}<br />{{ data.DIHITUNG_OLEH }}
          </div>
        </template>
      </Column>
      <Column header="Hitung fisik" style="min-width: 15rem">
        <template #body="{ data }">
          <div class="opn-input">
            <InputNumber v-model="d(data).qty" :min="0" :maxFractionDigits="2" :disabled="!canSave" placeholder="—" style="width: 6.5rem" />
            <Select v-model="d(data).satuan" :options="satuanOf(data)" :disabled="!canSave" style="width: 6rem" />
          </div>
        </template>
      </Column>
      <Column header="Selisih" style="min-width: 6rem">
        <template #body="{ data }">
          <span v-if="selisih(data) !== null" :class="{ 'opn-minus': selisih(data) < 0, 'opn-plus': selisih(data) > 0 }">
            {{ selisih(data) > 0 ? '+' : '' }}{{ angka.format(selisih(data)) }}
          </span>
        </template>
      </Column>
      <Column header="Catatan" style="min-width: 12rem">
        <template #body="{ data }"><InputText v-model="d(data).catatan" :disabled="!canSave" fluid /></template>
      </Column>
    </DataTable>

    <div v-if="batches.length" class="opn-footer">
      <span v-if="!canSave" class="opn-sub">Hanya bulan berjalan yang bisa disimpan.</span>
      <span v-else class="opn-sub">{{ terisi.length }} batch terisi</span>
      <Button label="Simpan opname" icon="pi pi-save" :disabled="!canSave || !terisi.length" :loading="saving" @click="konfirmasi" />
    </div>
  </div>
</template>

<style scoped>
.opn-empty { text-align: center; padding: 1rem; color: var(--p-text-muted-color); }
.opn-sub { font-size: 0.75rem; color: var(--p-text-muted-color); }
.opn-input { display: flex; gap: 0.375rem; }
.opn-minus { color: var(--p-red-500); font-weight: 600; }
.opn-plus { color: var(--p-green-600); font-weight: 600; }
.opn-footer { display: flex; align-items: center; justify-content: flex-end; gap: 1rem; padding: 0.75rem 0 0; }
</style>
