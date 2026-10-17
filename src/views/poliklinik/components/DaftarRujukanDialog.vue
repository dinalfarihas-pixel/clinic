<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getDaftarRujukan, getUrlCetakRujukan, batalkanRujukan, isRujukanNonBpjs } from '@/services/rujukan'
import { formatTanggal, toYmd } from '@/utils/tanggal'

const visible = defineModel('visible', { type: Boolean, default: false })
const props = defineProps({
  // No. RM pasien
  norm: { type: String, default: '' }
})

const toast = useToast()
const confirm = useConfirm()
const router = useRouter()

const rows = ref([])
const loading = ref(false)
const mencetak = ref(null)
const membatalkan = ref(null)

async function muat() {
  loading.value = true
  rows.value = []
  try {
    rows.value = await getDaftarRujukan(props.norm)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat daftar rujukan', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}
watch(visible, (open) => open && muat())

function konfirmasiBatal(r) {
  confirm.require({
    header: 'Batalkan rujukan?',
    message: `Rujukan ${r.NORUJUKAN} ke ${r.NAMATUJUANRUJUKAN || '-'} akan dibatalkan${isRujukanNonBpjs(r) ? '' : ' di server BPJS'}. Tindakan ini tidak bisa dikembalikan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Batalkan rujukan',
    acceptProps: { severity: 'danger' },
    rejectLabel: 'Kembali',
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => batal(r)
  })
}

async function batal(r) {
  membatalkan.value = r.NORUJUKAN
  try {
    await batalkanRujukan(r)
    toast.add({ severity: 'success', summary: 'Rujukan dibatalkan', detail: r.NORUJUKAN, life: 3500 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membatalkan rujukan', detail: err.message, life: 5000 })
  } finally {
    membatalkan.value = null
  }
}

async function cetak(r) {
  // Non-BPJS: surat dibuat dari data tersimpan; noreg = bagian setelah "NB-"
  if (isRujukanNonBpjs(r)) {
    const { href } = router.resolve({
      name: 'cetak-rujukan',
      params: { noreg: r.NORUJUKAN.slice(3) },
      query: {
        print: '1',
        no: r.NORUJUKAN,
        tujuan: r.NAMATUJUANRUJUKAN || '',
        poli: r.POLITUJUAN || '',
        dx: [r.KODEDIAGNOSA, r.NAMADIAGNOSA].filter(Boolean).join(' — '),
        alasan: r.CATATAN || '',
        tgl: toYmd(r.TGLRUJUKAN) || ''
      }
    })
    window.open(href, '_blank')
    return
  }
  mencetak.value = r.NORUJUKAN
  try {
    const url = await getUrlCetakRujukan({ noRujukan: r.NORUJUKAN, noKartu: r.NOKARTU })
    window.open(url, '_blank')
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal mencetak rujukan', detail: err.message, life: 5000 })
  } finally {
    mencetak.value = null
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal header="Daftar rujukan" :style="{ width: '70rem', maxWidth: '96vw' }">
    <DataTable :value="rows" :loading="loading" size="small" stripedRows paginator :rows="10" dataKey="NORUJUKAN">
      <template #empty>
        <p class="kosong">Belum ada rujukan untuk pasien ini.</p>
      </template>
      <Column field="TGLRUJUKAN" header="Tgl. rujuk" sortable style="min-width: 8rem">
        <template #body="{ data: r }">{{ formatTanggal(r.TGLRUJUKAN) }}</template>
      </Column>
      <Column field="NORUJUKAN" header="No. rujukan" style="min-width: 11rem">
        <template #body="{ data: r }">
          {{ r.NORUJUKAN }}
          <Tag v-if="isRujukanNonBpjs(r)" value="Non-BPJS" severity="secondary" class="tag" />
        </template>
      </Column>
      <Column field="NAMATUJUANRUJUKAN" header="Tujuan" style="min-width: 12rem" />
      <Column field="POLITUJUAN" header="Poli / spesialis" style="min-width: 9rem" />
      <Column header="Diagnosa" style="min-width: 12rem">
        <template #body="{ data: r }">{{ [r.KODEDIAGNOSA, r.NAMADIAGNOSA].filter(Boolean).join(' — ') }}</template>
      </Column>
      <Column field="CAPTION_TIPE" header="Tipe" style="min-width: 6rem" />
      <Column header="Aksi" frozen alignFrozen="right" style="width: 7.5rem">
        <template #body="{ data: r }">
          <Button
            icon="pi pi-print"
            text
            rounded
            size="small"
            severity="secondary"
            :loading="mencetak === r.NORUJUKAN"
            aria-label="Cetak surat rujukan"
            v-tooltip.top="'Cetak surat rujukan'"
            @click="cetak(r)"
          />
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="danger"
            :loading="membatalkan === r.NORUJUKAN"
            aria-label="Batalkan rujukan"
            v-tooltip.top="'Batalkan rujukan'"
            @click="konfirmasiBatal(r)"
          />
        </template>
      </Column>
    </DataTable>
    <template #footer>
      <Button label="Tutup" severity="secondary" outlined @click="visible = false" />
    </template>
  </Dialog>
</template>

<style scoped>
.kosong {
  margin: 1rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.tag {
  margin-left: 0.375rem;
  font-size: 0.6875rem;
}
</style>
