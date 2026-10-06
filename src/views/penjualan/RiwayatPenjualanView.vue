<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '@/stores/auth'
import { getRecentSales, voidTransaksi, voidItem } from '@/services/penjualan'
import { toYmd } from '@/utils/tanggal'
import { rupiah, labelBayar, formatWaktu, kelompokkanStruk, teksDiskon, payloadDariStruk, bukaStruk } from '@/utils/penjualan'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const auth = useAuthStore()

const rows = ref([])
const loading = ref(false)
const limit = ref(100)
const search = ref('')
const tglMulai = ref(null)
const tglAkhir = ref(null)
const expanded = ref(new Set())
const voiding = ref(null)

async function muat() {
  loading.value = true
  try {
    rows.value = await getRecentSales(null, limit.value)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal memuat riwayat', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}

const struk = computed(() => {
  const q = search.value.trim().toLowerCase()
  const dari = tglMulai.value ? toYmd(tglMulai.value) : null
  const sampai = tglAkhir.value ? toYmd(tglAkhir.value) : null
  return kelompokkanStruk(rows.value).filter((s) => {
    const tgl = String(s.TANGGAL).slice(0, 10)
    if (dari && tgl < dari) return false
    if (sampai && tgl > sampai) return false
    if (!q) return true
    return s.RECEIPT_NO.toLowerCase().includes(q) || String(s.IDUSER).toLowerCase().includes(q) || s.items.some((i) => String(i.NAMA).toLowerCase().includes(q))
  })
})

const totalAktif = computed(() => struk.value.filter((s) => !s.batal).reduce((t, s) => t + s.sisa, 0))

function toggle(no) {
  const next = new Set(expanded.value)
  next.has(no) ? next.delete(no) : next.add(no)
  expanded.value = next
}

// Piutang yang sudah pernah dicicil tidak boleh di-void (backend menolak juga).
const bisaVoid = (s) => !s.batal && !(s.idPayment === 3 && s.totalBayar > 0)

function konfirmasiVoid(s) {
  confirm.require({
    header: 'Batalkan transaksi?',
    message: `${s.RECEIPT_NO} akan dibatalkan dan stok yang terjual akan dikembalikan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Batalkan',
    rejectLabel: 'Tidak',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => jalankanVoid(s.RECEIPT_NO, null, () => voidTransaksi(s.RECEIPT_NO), 'Transaksi dibatalkan')
  })
}
function konfirmasiVoidItem(s, item) {
  confirm.require({
    header: 'Batalkan item?',
    message: `${item.NAMA} dari ${s.RECEIPT_NO} akan dibatalkan dan stoknya dikembalikan.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Batalkan',
    rejectLabel: 'Tidak',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', outlined: true },
    accept: () => jalankanVoid(s.RECEIPT_NO, item.ID_DETAIL, () => voidItem(s.RECEIPT_NO, item.ID_DETAIL), 'Item dibatalkan')
  })
}
async function jalankanVoid(no, idDetail, aksi, pesan) {
  voiding.value = `${no}-${idDetail ?? ''}`
  try {
    await aksi()
    toast.add({ severity: 'success', summary: pesan, detail: no, life: 3500 })
    await muat()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal membatalkan', detail: err.message, life: 5000 })
  } finally {
    voiding.value = null
  }
}

const cetak = (s) => bukaStruk(payloadDariStruk(s, auth))

onMounted(muat)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Riwayat penjualan</h1>
        <p class="page-subtitle">Transaksi penjualan langsung terakhir — lihat detail, cetak ulang struk, atau batalkan.</p>
      </div>
      <div class="header-actions">
        <Button icon="pi pi-chart-bar" label="Laporan" severity="secondary" outlined @click="router.push('/laporan')" />
        <Button icon="pi pi-shopping-cart" label="Kasir" @click="router.push('/penjualan')" />
      </div>
    </header>

    <section class="panel">
      <header class="panel__header toolbar">
        <IconField class="toolbar__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" placeholder="Cari no. struk, kasir, atau nama obat..." fluid />
        </IconField>
        <DatePicker v-model="tglMulai" dateFormat="dd M yy" placeholder="Dari tanggal" showIcon iconDisplay="input" showButtonBar class="toolbar__date" />
        <DatePicker v-model="tglAkhir" dateFormat="dd M yy" placeholder="Sampai tanggal" showIcon iconDisplay="input" showButtonBar class="toolbar__date" />
        <Select v-model="limit" :options="[50, 100, 200]" class="toolbar__limit" v-tooltip.top="'Jumlah baris item yang dimuat (maks. 200)'" @change="muat" />
        <Button icon="pi pi-refresh" text rounded severity="secondary" :loading="loading" aria-label="Muat ulang" @click="muat" />
      </header>

      <div class="ringkas">
        <span><b>{{ struk.length }}</b> struk</span>
        <span>Total aktif <b>{{ rupiah.format(totalAktif) }}</b></span>
      </div>

      <p v-if="loading" class="empty"><i class="pi pi-spin pi-spinner" /> Memuat transaksi...</p>
      <p v-else-if="!struk.length" class="empty">Tidak ada transaksi.</p>
      <ul v-else class="struk-list">
        <li v-for="s in struk" :key="s.RECEIPT_NO" class="struk" :class="{ 'struk--batal': s.batal }">
          <div class="struk__head" role="button" tabindex="0" @click="toggle(s.RECEIPT_NO)" @keydown.enter="toggle(s.RECEIPT_NO)">
            <i class="pi" :class="expanded.has(s.RECEIPT_NO) ? 'pi-chevron-down' : 'pi-chevron-right'" />
            <div class="struk__info">
              <span class="mono strong">{{ s.RECEIPT_NO }}</span>
              <small class="sub">{{ formatWaktu(s.TANGGAL) }} — {{ s.IDUSER }}</small>
            </div>
            <Tag :value="labelBayar(s.idPayment)" severity="secondary" />
            <Tag v-if="s.batal" value="Dibatalkan" severity="danger" icon="pi pi-ban" />
            <Tag v-else-if="s.sebagian" value="Sebagian dibatalkan" severity="warn" />
            <div class="struk__total mono">
              <span v-if="s.sebagian" class="total-strike">{{ rupiah.format(s.total) }}</span>
              <b :class="{ coret: s.batal }">{{ rupiah.format(s.tampilTotal) }}</b>
            </div>
            <div class="struk__aksi" @click.stop>
              <Button v-if="!s.batal" icon="pi pi-print" text rounded size="small" severity="secondary" v-tooltip.top="'Cetak struk'" @click="cetak(s)" />
              <Button
                v-if="bisaVoid(s)"
                icon="pi pi-times-circle"
                text
                rounded
                size="small"
                severity="danger"
                :loading="voiding === `${s.RECEIPT_NO}-`"
                v-tooltip.top="'Batalkan transaksi'"
                @click="konfirmasiVoid(s)"
              />
            </div>
          </div>

          <div v-if="expanded.has(s.RECEIPT_NO)" class="struk__detail">
            <table class="tabel">
              <thead>
                <tr><th>Obat</th><th class="c">Qty</th><th class="r">Harga</th><th>Diskon</th><th class="r">Total</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="i in s.items" :key="i.ID_DETAIL" :class="{ 'baris-batal': i.batal }">
                  <td><span class="strong">{{ i.NAMA }}</span><small v-if="i.BARCODE" class="sub mono">{{ i.BARCODE }}</small></td>
                  <td class="c">{{ i.QTY }}</td>
                  <td class="r mono">{{ rupiah.format(i.HARGA) }}</td>
                  <td>{{ teksDiskon(i) || '-' }}</td>
                  <td class="r mono strong">{{ rupiah.format(i.TOTALAMOUNT) }}</td>
                  <td class="r">
                    <Tag v-if="i.batal" value="Dibatalkan" severity="danger" />
                    <Button
                      v-else-if="bisaVoid(s) && s.items.length > 1"
                      icon="pi pi-times"
                      text
                      rounded
                      size="small"
                      severity="danger"
                      :loading="voiding === `${s.RECEIPT_NO}-${i.ID_DETAIL}`"
                      v-tooltip.left="'Batalkan item ini saja'"
                      @click="konfirmasiVoidItem(s, i)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="rincian">
              <div v-if="s.potongan > 0"><span>Potongan</span><span class="mono">-{{ rupiah.format(s.potongan) }}</span></div>
              <div><span>Dibayar</span><span class="mono">{{ rupiah.format(s.totalBayar) }}</span></div>
              <div v-if="s.idPayment !== 3"><span>Kembalian</span><span class="mono">{{ rupiah.format(s.kembalian) }}</span></div>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.toolbar {
  flex-wrap: wrap;
  gap: 0.5rem;
}
.toolbar__search {
  flex: 1;
  min-width: 14rem;
}
.toolbar__date {
  width: 11rem;
}
.toolbar__limit {
  width: 5.5rem;
}
.ringkas {
  display: flex;
  gap: 1.5rem;
  padding: 0.5rem 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.ringkas b {
  color: var(--app-text);
}
.empty {
  margin: 0;
  padding: 2rem 0;
  text-align: center;
  color: var(--app-text-muted);
}
.struk-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.struk {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-panel);
}
.struk--batal {
  opacity: 0.65;
}
.struk__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.625rem 0.75rem;
  cursor: pointer;
}
.struk__info {
  flex: 1;
  min-width: 10rem;
}
.struk__total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 6.5rem;
}
.struk__aksi {
  display: flex;
  gap: 0.125rem;
  min-width: 4.5rem;
  justify-content: flex-end;
}
.struk__detail {
  padding: 0.25rem 0.75rem 0.75rem;
  border-top: 1px dashed var(--app-border);
}
.tabel {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.tabel th {
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  text-align: left;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
}
.tabel td {
  padding: 0.375rem 0.5rem;
  border-bottom: 1px solid var(--app-border);
}
.tabel .c {
  text-align: center;
}
.tabel .r {
  text-align: right;
}
.baris-batal {
  opacity: 0.5;
  text-decoration: line-through;
}
.rincian {
  display: grid;
  gap: 0.125rem;
  margin: 0.5rem 0 0 auto;
  width: min(100%, 16rem);
  font-size: 0.8125rem;
}
.rincian > div {
  display: flex;
  justify-content: space-between;
}
.strong {
  font-weight: 600;
}
.sub {
  display: block;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.mono {
  font-variant-numeric: tabular-nums;
}
.coret {
  text-decoration: line-through;
}
.total-strike {
  font-size: 0.6875rem;
  color: var(--app-text-muted);
  text-decoration: line-through;
}
</style>
