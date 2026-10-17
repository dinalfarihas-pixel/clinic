<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getPendaftaran } from '@/services/pendaftaran'
import { formatTanggal, hitungUmurTahun } from '@/utils/tanggal'

// Surat rujukan pasien non-BPJS. Isian rujukan dibawa lewat query (tujuan, poli, dx, alasan, tgl)
// karena rujukan non-BPJS tidak dibuat di server BPJS.
const route = useRoute()
const auth = useAuthStore()

const data = ref(null)
const loading = ref(true)
const error = ref('')

const q = (k) => (typeof route.query[k] === 'string' ? route.query[k] : '')
const rujukan = computed(() => ({
  tujuan: q('tujuan'),
  poli: q('poli'),
  dx: q('dx'),
  alasan: q('alasan'),
  tanggal: q('tgl'),
  nomor: q('no')
}))

const jenisKelamin = computed(() => {
  const jk = String(data.value?.JENISKELAMIN || '').toUpperCase()
  if (jk.startsWith('L')) return 'Laki-laki'
  if (jk.startsWith('P')) return 'Perempuan'
  return ''
})
const umur = computed(() => {
  const th = hitungUmurTahun(data.value?.TGLLAHIR)
  return th == null ? '' : `${th} tahun`
})

const pasien = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: 'Nama', value: d.NAMAPASIEN, strong: true },
    { label: 'No. RM', value: d.NOMR },
    { label: 'Jenis kelamin', value: jenisKelamin.value },
    { label: 'Tgl. lahir', value: [formatTanggal(d.TGLLAHIR), umur.value && `(${umur.value})`].filter(Boolean).join(' ') },
    { label: 'Alamat', value: d.ALAMAT }
  ].filter((r) => r.value)
})

const dicetak = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date())

function cetak() {
  window.print()
}

function tutup() {
  window.close()
}

async function muat() {
  try {
    data.value = await getPendaftaran(String(route.params.noreg))
    document.title = `Surat rujukan ${data.value.NAMAPASIEN}`
    if (route.query.print === '1') {
      await nextTick()
      setTimeout(cetak, 400)
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(muat)
</script>

<template>
  <div class="cetak">
    <div class="toolbar no-print">
      <span class="toolbar__title">Surat rujukan</span>
      <div class="toolbar__right">
        <Button label="Tutup" severity="secondary" text size="small" @click="tutup" />
        <Button label="Cetak" icon="pi pi-print" size="small" :disabled="!data" @click="cetak" />
      </div>
    </div>

    <div v-if="loading" class="status no-print"><i class="pi pi-spin pi-spinner" /> Memuat data…</div>
    <Message v-else-if="error" severity="error" icon="pi pi-exclamation-circle" class="no-print">{{ error }}</Message>

    <article v-else-if="data" class="kertas">
      <header class="kop">
        <img v-if="auth.logoKlinik" :src="auth.logoKlinik" alt="" class="kop__logo" />
        <div class="kop__text">
          <strong class="kop__nama">{{ auth.company || 'KLINIK' }}</strong>
          <span v-if="auth.alamat" class="kop__alamat">{{ auth.alamat }}</span>
        </div>
      </header>

      <h1 class="judul">Surat Rujukan</h1>
      <p v-if="rujukan.nomor" class="nomor">No. {{ rujukan.nomor }}</p>

      <p class="kepada">
        Kepada Yth.<br />
        <strong>{{ rujukan.poli ? `Dokter ${rujukan.poli}` : 'Dokter yang menerima' }}</strong><br />
        <strong>{{ rujukan.tujuan }}</strong>
      </p>

      <p>Mohon pemeriksaan dan penanganan lebih lanjut terhadap pasien:</p>
      <dl class="data">
        <div v-for="r in pasien" :key="r.label" class="data__row">
          <dt>{{ r.label }}</dt>
          <dd :class="{ strong: r.strong }">: {{ r.value }}</dd>
        </div>
        <div v-if="rujukan.dx" class="data__row">
          <dt>Diagnosa</dt>
          <dd>: {{ rujukan.dx }}</dd>
        </div>
        <div v-if="rujukan.alasan" class="data__row">
          <dt>Alasan / catatan</dt>
          <dd>: {{ rujukan.alasan }}</dd>
        </div>
      </dl>

      <p>Demikian surat rujukan ini kami sampaikan. Atas bantuan dan kerja samanya kami ucapkan terima kasih.</p>

      <div class="ttd">
        <p>{{ rujukan.tanggal ? formatTanggal(rujukan.tanggal) : dicetak }}</p>
        <p class="ttd__label">Dokter pemeriksa,</p>
        <p class="ttd__nama">{{ data.NAMADOKTER || '-' }}</p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.cetak {
  --ink: #111;
  --ink-muted: #555;
  width: 100%;
  max-width: 50rem;
  display: grid;
  gap: 1rem;
  justify-items: center;
}
.toolbar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.toolbar__title {
  font-weight: 700;
}
.toolbar__right {
  display: flex;
  gap: 0.5rem;
}
.status {
  color: var(--app-text-muted);
}

.kertas {
  width: 148mm;
  max-width: 100%;
  min-height: 210mm;
  padding: 12mm;
  background: #fff;
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10.5pt;
  line-height: 1.5;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.kop {
  display: flex;
  align-items: center;
  gap: 3mm;
  padding-bottom: 2.5mm;
  border-bottom: 1.5px solid var(--ink);
}
.kop__logo {
  width: 16mm;
  height: 16mm;
  object-fit: contain;
}
.kop__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  text-align: center;
  line-height: 1.3;
}
/* Ukuran logo klinik (logo lebar): tinggi 14 mm, lebar menyesuaikan maks. 28 mm */
.kop__logo,
.cetak--a4 .kop__logo,
.cetak--a5 .kop__logo {
  width: auto;
  height: 14mm;
  max-width: 28mm;
  object-fit: contain;
  object-position: left center;
}
/* Logo di kiri tanpa menggeser teks: teks kop tepat di tengah halaman (simetris dengan judul) */
.kop {
  position: relative;
  justify-content: center;
}
.kop__logo {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
}
.kop__text {
  padding-inline: 30mm;
}
.kop__nama {
  font-size: 1.2em;
  text-transform: uppercase;
}
.kop__alamat {
  white-space: pre-line;
  font-size: 0.85em;
  color: var(--ink-muted);
}
.judul {
  margin: 5mm 0;
  font-size: 1.2em;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-decoration: underline;
}
.nomor {
  margin: -3mm 0 4mm;
  text-align: center;
  font-size: 0.9em;
  color: var(--ink-muted);
}
.kepada {
  margin: 0 0 4mm;
}
.data {
  margin: 2mm 0 4mm;
}
.data__row {
  display: grid;
  grid-template-columns: 32mm 1fr;
  gap: 2mm;
  padding: 0.6mm 0;
}
.data dt {
  color: var(--ink-muted);
}
.data dd {
  margin: 0;
  word-break: break-word;
}
.strong {
  font-weight: 700;
}
.ttd {
  margin: 8mm 0 0 auto;
  width: 55mm;
  text-align: center;
}
.ttd p {
  margin: 0;
}
.ttd__label {
  margin-bottom: 18mm !important;
}
.ttd__nama {
  font-weight: 700;
  text-decoration: underline;
}

@media print {
  .no-print {
    display: none !important;
  }
  :global(body),
  :global(.blank-layout) {
    background: #fff !important;
    padding: 0 !important;
    display: block !important;
    min-height: 0 !important;
  }
  .cetak {
    max-width: none;
    display: block;
  }
  .kertas {
    width: 100%;
    box-shadow: none;
    padding: 0 !important;
    min-height: 0 !important;
  }
}
</style>
