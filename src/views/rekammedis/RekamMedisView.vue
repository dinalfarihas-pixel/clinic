<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getPendaftaran } from '@/services/pendaftaran'
import { getSoap, TINGKAT_KESADARAN } from '@/services/soap'
import { getOdontogram } from '@/services/odontogram'
import { getRiwayatTindakan } from '@/services/tindakan'
import { getRiwayatResep, getDetailResep } from '@/services/terapi'
import { getBillingKunjungan } from '@/services/kasir'
import { formatTanggal, hitungUmurTahun } from '@/utils/tanggal'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const noReg = String(route.params.noreg)

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
const dicetak = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

// ── Daftar halaman RME ─────────────────────────────────────────
const SECTIONS = [
  { key: 'identitas', label: 'Identitas Pasien', short: 'Identitas', icon: '📋', color: '#162d4e' },
  { key: 'soap', label: 'Asesmen Dokter (SOAP)', short: 'SOAP', icon: '📝', color: '#1565c0' },
  { key: 'odontogram', label: 'Odontogram', short: 'Odontogram', icon: '🦷', color: '#0f766e' },
  { key: 'tindakan', label: 'Tindakan / Prosedur', short: 'Tindakan', icon: '🔧', color: '#bf360c' },
  { key: 'resep', label: 'Terapi / Resep Obat', short: 'Resep', icon: '💊', color: '#6a1b9a' },
  { key: 'billing', label: 'Rincian Tagihan', short: 'Billing', icon: '🧾', color: '#b45309' }
]
const SETTING_KEY = 'klinik.rme.sections'
function bacaSetting() {
  try {
    return JSON.parse(localStorage.getItem(SETTING_KEY) || 'null') || {}
  } catch {
    return {}
  }
}
const tampil = reactive(Object.fromEntries(SECTIONS.map((s) => [s.key, bacaSetting()[s.key] !== false])))
const settingTemp = reactive({ ...tampil })
const showSetting = ref(false)
function bukaSetting() {
  Object.assign(settingTemp, tampil)
  showSetting.value = true
}
function simpanSetting() {
  Object.assign(tampil, settingTemp)
  try {
    localStorage.setItem(SETTING_KEY, JSON.stringify({ ...tampil }))
  } catch {
    /* abaikan */
  }
  showSetting.value = false
}
function resetSetting() {
  SECTIONS.forEach((s) => (settingTemp[s.key] = true))
}

// ── Zoom ───────────────────────────────────────────────────────
const ZOOM_MIN = 50
const ZOOM_MAX = 150
const ZOOM_STEP = 10
function zoomAwal() {
  try {
    return Number(localStorage.getItem('klinik.rme.zoom')) || 100
  } catch {
    return 100
  }
}
const zoom = ref(zoomAwal())
watch(zoom, (z) => {
  try {
    localStorage.setItem('klinik.rme.zoom', String(z))
  } catch {
    /* abaikan */
  }
})
const zoomIn = () => (zoom.value = Math.min(zoom.value + ZOOM_STEP, ZOOM_MAX))
const zoomOut = () => (zoom.value = Math.max(zoom.value - ZOOM_STEP, ZOOM_MIN))
const zoomReset = () => (zoom.value = 100)
function onKey(e) {
  if (!e.ctrlKey) return
  if (e.key === '=' || e.key === '+') (e.preventDefault(), zoomIn())
  else if (e.key === '-') (e.preventDefault(), zoomOut())
  else if (e.key === '0') (e.preventDefault(), zoomReset())
}

// ── Data ───────────────────────────────────────────────────────
const loading = ref(true)
const error = ref('')
const pasien = ref(null)
const soap = ref(null)
const odontogram = ref(null)
const tindakan = ref([])
const resep = ref([]) // [{ header, items }]
const billing = ref(null)
const statusMuat = reactive({}) // key -> true bila selesai dimuat

const jk = (v) => (String(v || '').toUpperCase().startsWith('P') ? 'Perempuan' : String(v || '').toUpperCase().startsWith('L') ? 'Laki-laki' : '')
const usia = computed(() => {
  const u = pasien.value?.USIA_PASIEN
  if (u?.tahun != null) return `${u.tahun} th ${u.bulan ?? 0} bl`
  const th = hitungUmurTahun(pasien.value?.TGLLAHIR)
  return th == null ? '' : `${th} tahun`
})
const kesadaran = computed(() => {
  const s = soap.value
  if (!s) return ''
  return TINGKAT_KESADARAN.find((l) => l.code === s.kesadaran_code)?.display || s.kesadaran || ''
})

const vital = computed(() => {
  const s = soap.value
  if (!s) return []
  const rows = [
    ['Tekanan darah', s.tensi, 'mmHg'],
    ['Nadi', s.nadi_permenit, 'x/mnt'],
    ['Suhu', s.suhu, '°C'],
    ['Respirasi', s.respirasi_perm, 'x/mnt'],
    ['SpO₂', s.sp2o, '%'],
    ['Berat badan', s.berat_badan, 'kg'],
    ['Tinggi badan', s.tinggi_badan, 'cm'],
    ['GCS', s.cgs, ''],
    ['Kesadaran', kesadaran.value, '']
  ]
  return rows.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== 0 && v !== '0')
})
const adaSoap = computed(() => !!soap.value && (vital.value.length > 0 || ['subjek', 'objek', 'asesmen', 'plan', 'catatan_dokter'].some((k) => soap.value[k])))

// Odontogram: daftar gigi yang punya kondisi
const SURFACE = { B: 'Buccal', M: 'Mesial', D: 'Distal', L: 'Lingual', O: 'Oklusal' }
const giGiOdonto = computed(() => {
  const td = odontogram.value?.teeth_data
  if (!td || typeof td !== 'object') return []
  return Object.entries(td)
    .map(([no, v]) => {
      const permukaan = Object.entries(SURFACE)
        .filter(([k]) => v?.[k])
        .map(([k, nama]) => `${nama}: ${v[k]}`)
      return { no, whole: v?.whole || '', permukaan }
    })
    .filter((g) => g.whole || g.permukaan.length)
    .sort((a, b) => Number(a.no) - Number(b.no))
})
const adaOdonto = computed(() => giGiOdonto.value.length > 0 || !!odontogram.value?.keluhan || !!odontogram.value?.catatan)

const kelompokBilling = computed(() => {
  const detail = billing.value?.DETAIL
  if (!Array.isArray(detail)) return {}
  return detail.reduce((g, it) => {
    const k = it.KATEGORI || 'Lainnya'
    ;(g[k] ||= []).push(it)
    return g
  }, {})
})
const totalBilling = computed(() => (billing.value?.DETAIL || []).reduce((s, i) => s + (Number(i.TOTALAMOUNT) || 0), 0))
const sudahLunas = computed(() => String(pasien.value?.LUNAS) === '1')

const ADA = computed(() => ({
  identitas: !!pasien.value,
  soap: adaSoap.value,
  odontogram: adaOdonto.value,
  tindakan: tindakan.value.length > 0,
  resep: resep.value.length > 0,
  billing: Object.keys(kelompokBilling.value).length > 0
}))

// Halaman tampil bila diaktifkan; halaman tanpa data disembunyikan kecuali identitas
const halamanTampil = (key) => tampil[key] && statusMuat[key] && (key === 'identitas' || ADA.value[key])
const navSections = computed(() => SECTIONS.filter((s) => tampil[s.key]))

// Ambil tiap sumber data tanpa membatalkan yang lain bila salah satu gagal
async function ambil(key, fn) {
  try {
    await fn()
  } catch (err) {
    console.error(`RME ${key}:`, err)
  } finally {
    statusMuat[key] = true
  }
}

async function muat() {
  loading.value = true
  error.value = ''
  try {
    pasien.value = await getPendaftaran(noReg)
    statusMuat.identitas = true
  } catch (err) {
    error.value = err.message
    loading.value = false
    return
  }
  const norm = pasien.value.NOMR
  document.title = `Rekam Medis ${pasien.value.NAMAPASIEN || noReg}`
  await Promise.all([
    ambil('soap', async () => (soap.value = await getSoap(noReg))),
    ambil('odontogram', async () => (odontogram.value = await getOdontogram(noReg, norm))),
    ambil('tindakan', async () => (tindakan.value = (await getRiwayatTindakan(noReg)).filter((t) => !t.VOID && !t.IS_VOID))),
    ambil('resep', async () => {
      const headers = await getRiwayatResep(noReg)
      resep.value = await Promise.all(
        headers.map(async (h) => ({ header: h, items: await getDetailResep(h.RECEIPT_NO).catch(() => []) }))
      )
    }),
    ambil('billing', async () => (billing.value = await getBillingKunjungan(norm, noReg)))
  ])
  loading.value = false
  await nextTick()
  pasangObserver()
}

const namaItem = (it) => it.NAMA || it.NAMABARANG || it.CAPTION || it.ITEM || '-'
const qtyItem = (it) => it.QTY ?? it.QUNATITY ?? it.QUANTITY ?? it.JML ?? ''
const tglResep = (h) => {
  const d = new Date(String(h?.TANGGAL || h?.TGL || '').replace(' ', 'T'))
  if (isNaN(d)) return formatTanggal(h?.TANGGAL) || '—'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).replace(',', '')
}
const racikan =(it) => !!it.RACIKAN_GROUP_ID && String(it.RACIKAN_GROUP_ID) !== '0'

// ── Navigasi aktif ─────────────────────────────────────────────
const aktif = ref('identitas')
let observer = null
function pasangObserver() {
  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      const e = entries.find((x) => x.isIntersecting)
      if (e) aktif.value = e.target.dataset.section
    },
    { rootMargin: '-30% 0px -50% 0px' }
  )
  document.querySelectorAll('.rme-page[data-section]').forEach((el) => observer.observe(el))
}
watch(tampil, () => nextTick(pasangObserver))
function keSection(key) {
  const el = document.querySelector(`.rme-page[data-section="${key}"]`)
  if (!el) return
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' })
}

const cetak = () => window.print()
const tutup = () => (window.history.length > 1 ? router.back() : window.close())

let pageStyle = null
onMounted(() => {
  pageStyle = document.createElement('style')
  pageStyle.textContent = '@page { size: A4 portrait; margin: 10mm; }'
  document.head.appendChild(pageStyle)
  window.addEventListener('keydown', onKey)
  muat()
})
onBeforeUnmount(() => {
  pageStyle?.remove()
  observer?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="rme">
    <!-- Toolbar (tidak tercetak) -->
    <div class="rme-toolbar no-print">
      <div class="tb-brand">
        <img v-if="auth.logoKlinik" :src="auth.logoKlinik" alt="" height="34" />
        <div class="tb-brand__text">
          <strong>{{ auth.company || 'KLINIK' }}</strong>
          <span>Rekam Medis Elektronik</span>
        </div>
      </div>

      <div class="tb-pasien">
        <template v-if="pasien">
          <strong>{{ pasien.NAMAPASIEN }}</strong>
          <span>RM: {{ pasien.NOMR || '-' }} | Reg: {{ noReg }} | {{ pasien.POLI || '' }}</span>
        </template>
        <span v-else>Memuat data pasien… ({{ noReg }})</span>
      </div>

      <div class="tb-actions">
        <div class="zoom">
          <button type="button" :disabled="zoom <= ZOOM_MIN" title="Perkecil (Ctrl −)" @click="zoomOut">−</button>
          <input v-model.number="zoom" type="range" :min="ZOOM_MIN" :max="ZOOM_MAX" :step="ZOOM_STEP" />
          <span class="zoom__pct" title="Klik untuk reset" @click="zoomReset">{{ zoom }}%</span>
          <button type="button" :disabled="zoom >= ZOOM_MAX" title="Perbesar (Ctrl +)" @click="zoomIn">+</button>
        </div>
        <Button label="Setting" icon="pi pi-cog" severity="secondary" size="small" outlined @click="bukaSetting" />
        <Button label="Cetak / PDF" icon="pi pi-print" size="small" :disabled="!pasien" @click="cetak" />
        <Button label="Tutup" icon="pi pi-times" severity="secondary" text size="small" @click="tutup" />
      </div>
    </div>

    <!-- Navigasi halaman -->
    <nav class="rme-nav no-print" aria-label="Navigasi halaman RME">
      <button
        v-for="s in navSections"
        :key="s.key"
        type="button"
        class="nav-tab"
        :class="{ 'is-active': aktif === s.key, 'is-kosong': statusMuat[s.key] && !ADA[s.key] }"
        :style="`--tc:${s.color}`"
        :title="s.label + (statusMuat[s.key] && !ADA[s.key] ? ' — tidak ada data' : '')"
        @click="keSection(s.key)"
      >
        <span>{{ s.icon }}</span>{{ s.short }}
      </button>
    </nav>

    <div v-if="loading" class="info no-print"><i class="pi pi-spin pi-spinner" /> Memuat rekam medis…</div>
    <Message v-else-if="error" severity="error" icon="pi pi-exclamation-circle" class="no-print">{{ error }}</Message>

    <!-- Area cetak -->
    <div v-else class="rme-area" :style="{ zoom: zoom / 100 }">
      <!-- Identitas -->
      <section v-if="halamanTampil('identitas')" class="rme-page" data-section="identitas">
        <header class="kop">
          <img v-if="auth.logoKlinik" :src="auth.logoKlinik" alt="" class="kop__logo" />
          <div class="kop__text">
           
            <strong class="kop__nama">{{ auth.company || 'KLINIK' }}</strong>
            <span v-if="auth.alamat" style="white-space: pre-line">{{ auth.alamat }}</span>
          </div>
        </header>
        <h1 class="judul">Rekam Medis Rawat Jalan<small>No. Registrasi {{ noReg }}</small></h1>

        <h2 class="bagian">Identitas Pasien</h2>
        <div class="grid2">
          <dl class="data">
            <div><dt>Nama</dt><dd class="strong">{{ pasien.NAMAPASIEN || '—' }}</dd></div>
            <div><dt>No. RM</dt><dd class="mono">{{ pasien.NOMR || '—' }}</dd></div>
            <div><dt>JK / Usia</dt><dd>{{ [jk(pasien.JENISKELAMIN), usia].filter(Boolean).join(' · ') || '—' }}</dd></div>
            <div><dt>Tgl lahir</dt><dd>{{ formatTanggal(pasien.TGLLAHIR) || '—' }}</dd></div>
            <div><dt>Alamat</dt><dd>{{ pasien.ALAMAT || '—' }}</dd></div>
          </dl>
          <dl class="data">
            <div><dt>Tgl kunjungan</dt><dd>{{ formatTanggal(pasien.MASUKPOLY) || pasien.MASUKPOLY_DISPLAY || '—' }}</dd></div>
            <div><dt>Poli</dt><dd>{{ pasien.POLI || '—' }}</dd></div>
            <div><dt>Dokter</dt><dd>{{ pasien.NAMADOKTER || '—' }}</dd></div>
            <div><dt>Cara bayar</dt><dd>{{ pasien.CARABAYAR || '—' }}</dd></div>
            <div v-if="pasien.DX_CAPTION"><dt>Diagnosa awal</dt><dd>{{ pasien.DX_CAPTION }}</dd></div>
          </dl>
        </div>
      </section>

      <!-- SOAP -->
      <section v-if="halamanTampil('soap')" class="rme-page" data-section="soap">
        <div class="phr"><span>RM: {{ pasien.NOMR }}</span><span>{{ pasien.NAMAPASIEN }}</span><span>Reg: {{ noReg }}</span></div>
        <h2 class="bagian">Asesmen Dokter (SOAP)</h2>

        <table v-if="vital.length" class="tabel tabel--vital">
          <tbody>
            <tr v-for="i in Math.ceil(vital.length / 3)" :key="i">
              <template v-for="[label, val, sat] in vital.slice((i - 1) * 3, i * 3)" :key="label">
                <th>{{ label }}</th>
                <td>{{ val }} <small>{{ sat }}</small></td>
              </template>
            </tr>
          </tbody>
        </table>

        <div class="soap">
          <div v-if="soap.subjek"><h3>S — Subjektif</h3><p>{{ soap.subjek }}</p></div>
          <div v-if="soap.objek"><h3>O — Objektif</h3><p>{{ soap.objek }}</p></div>
          <div v-if="soap.asesmen"><h3>A — Asesmen</h3><p>{{ soap.asesmen }}</p></div>
          <div v-if="soap.plan"><h3>P — Plan</h3><p>{{ soap.plan }}</p></div>
          <div v-if="soap.catatan_dokter"><h3>Catatan Dokter</h3><p>{{ soap.catatan_dokter }}</p></div>
        </div>

        <div class="ttd">
          <span>Dokter Pemeriksa</span>
          <span class="ttd__garis" />
          <span>{{ pasien.NAMADOKTER || '(…………………)' }}</span>
        </div>
      </section>

      <!-- Odontogram -->
      <section v-if="halamanTampil('odontogram')" class="rme-page" data-section="odontogram">
        <div class="phr"><span>RM: {{ pasien.NOMR }}</span><span>{{ pasien.NAMAPASIEN }}</span><span>Reg: {{ noReg }}</span></div>
        <h2 class="bagian">Odontogram</h2>
        <div class="soap">
          <div v-if="odontogram.keluhan"><h3>Keluhan</h3><p>{{ odontogram.keluhan }}</p></div>
        </div>
        <table v-if="giGiOdonto.length" class="tabel">
          <thead>
            <tr><th class="c-no">Gigi</th><th>Seluruh gigi</th><th>Kondisi permukaan</th></tr>
          </thead>
          <tbody>
            <tr v-for="g in giGiOdonto" :key="g.no">
              <td class="c-no mono">{{ g.no }}</td>
              <td>{{ g.whole || '—' }}</td>
              <td>{{ g.permukaan.join('; ') || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div class="soap">
          <div v-if="odontogram.catatan"><h3>Catatan</h3><p>{{ odontogram.catatan }}</p></div>
        </div>
      </section>

      <!-- Tindakan -->
      <section v-if="halamanTampil('tindakan')" class="rme-page" data-section="tindakan">
        <div class="phr"><span>RM: {{ pasien.NOMR }}</span><span>{{ pasien.NAMAPASIEN }}</span><span>Reg: {{ noReg }}</span></div>
        <h2 class="bagian">Tindakan / Prosedur</h2>
        <table class="tabel">
          <thead>
            <tr><th class="c-no">No</th><th>Tindakan</th><th>Keterangan</th><th class="c-qty">Qty</th></tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in tindakan" :key="t.RECEIPT_NO || i">
              <td class="c-no">{{ i + 1 }}</td>
              <td>{{ t.TINDAKAN || namaItem(t) }}<small v-if="t.KATEGORI" class="muted"> · {{ t.KATEGORI }}</small></td>
              <td>{{ t.REMARK_ITEM || '—' }}</td>
              <td class="c-qty">{{ qtyItem(t) || 1 }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Resep -->
      <section v-if="halamanTampil('resep')" class="rme-page" data-section="resep">
        <div v-for="(r, idx) in resep" :key="r.header.RECEIPT_NO || idx" class="rx" :class="{ 'rx--next': idx > 0 }">
          <header class="rx__head">
            <span class="rx__klinik">{{ auth.company || 'KLINIK' }}</span>
            <span class="rx__logo">℞</span>
          </header>
          <div class="rx__line" />

          <div class="rx__row"><span>Nama Dokter</span><span>{{ pasien.NAMADOKTER || '—' }}</span></div>
          <div class="rx__row"><span>Nomor SIP</span><span>{{ pasien.NO_SIP || pasien.SIP_DOKTER || pasien.NOSIP || '—' }}</span></div>
          <div class="rx__line rx__line--tebal" />

          <div class="rx__row rx__row--r">
            <span>R/</span>
            <span>{{ tglResep(r.header) }}</span>
          </div>

          <div class="rx__items">
            <div v-for="(it, i) in r.items" :key="i" class="rx__item">
              <div class="rx__nama">{{ namaItem(it) }}<small v-if="racikan(it)"> (racikan)</small></div>
              <div class="rx__sub">{{ [qtyItem(it), it.SATUAN || it.SATUAN_KECIL].filter(Boolean).join(' ') }}</div>
              <div v-if="it.REMARK_ITEM || it.REMARK" class="rx__sub">{{ it.REMARK_ITEM || it.REMARK }}</div>
            </div>
            <p v-if="!r.items.length" class="rx__sub">Detail resep tidak tersedia</p>
          </div>

          <footer class="rx__foot">
            <div class="rx__line rx__line--tebal" />
            <div class="rx__row"><span>Nama Pasien</span><span>{{ pasien.NAMAPASIEN || '—' }}</span></div>
            <div class="rx__row"><span>Nomor RM</span><span>{{ pasien.NOMR || '—' }}</span></div>
            <div class="rx__row"><span>Nomor Telepon Pasien</span><span>{{ pasien.NOTELP || pasien.NO_TELP || pasien.NOHP || pasien.TELP || '—' }}</span></div>
            <div class="rx__row"><span>NIK Pasien</span><span>{{ pasien.NIK || pasien.NOKTP || pasien.NO_KTP || '—' }}</span></div>
            <div class="rx__line" />
            <p class="rx__note">No. Resep {{ r.header.RECEIPT_NO }} · Dicetak {{ dicetak }}</p>
          </footer>
        </div>
      </section>

      <!-- Billing -->
      <section v-if="halamanTampil('billing')" class="rme-page" data-section="billing">
        <div class="phr"><span>RM: {{ pasien.NOMR }}</span><span>{{ pasien.NAMAPASIEN }}</span><span>Reg: {{ noReg }}</span></div>
        <h2 class="bagian">
          Rincian Tagihan
          <span class="badge" :class="sudahLunas ? 'badge--ok' : 'badge--warn'">{{ sudahLunas ? 'LUNAS' : 'BELUM LUNAS' }}</span>
        </h2>
        <table class="tabel">
          <thead>
            <tr><th>Item / Layanan</th><th class="c-num">Harga</th><th class="c-qty">Qty</th><th class="c-num">Subtotal</th></tr>
          </thead>
          <tbody>
            <template v-for="(items, kategori) in kelompokBilling" :key="kategori">
              <tr class="kat"><td colspan="4">{{ kategori }}</td></tr>
              <tr v-for="(it, i) in items" :key="i">
                <td>{{ it.ITEM }}</td>
                <td class="c-num mono">{{ rupiah.format(it.HARGA || 0) }}</td>
                <td class="c-qty mono">{{ it.QTY }} {{ it.SATUAN }}</td>
                <td class="c-num mono">{{ rupiah.format(it.TOTALAMOUNT || 0) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
        <div class="total"><span>TOTAL TAGIHAN</span><span class="mono">{{ rupiah.format(totalBilling) }}</span></div>
        <p class="dicetak">Dicetak {{ dicetak }}</p>
      </section>
    </div>

    <!-- Pengaturan halaman -->
    <Dialog v-model:visible="showSetting" modal header="Pengaturan Tampilan Halaman" :style="{ width: '26rem' }" class="no-print">
      <p class="muted setting-hint">Pilih halaman yang ditampilkan &amp; dicetak. Disimpan di browser ini.</p>
      <div class="setting-list">
        <label v-for="s in SECTIONS" :key="s.key" class="setting-item">
          <Checkbox v-model="settingTemp[s.key]" binary :inputId="'set-' + s.key" />
          <span class="setting-icon" :style="`color:${s.color}`">{{ s.icon }}</span>
          <span>{{ s.label }}</span>
        </label>
      </div>
      <template #footer>
        <Button label="Reset" icon="pi pi-refresh" severity="secondary" text size="small" @click="resetSetting" />
        <Button label="Batal" severity="secondary" text size="small" @click="showSetting = false" />
        <Button label="Simpan" icon="pi pi-check" size="small" @click="simpanSetting" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.rme {
  --ink: #111;
  --ink-muted: #555;
  --rule: #bbb;
  width: 100%;
  display: grid;
  gap: 0.75rem;
  justify-items: center;
  align-self: start;
}

/* Toolbar */
.rme-toolbar {
  position: sticky;
  top: 0.5rem;
  z-index: 20;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.tb-brand,
.tb-pasien,
.tb-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.tb-brand__text,
.tb-pasien {
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.25;
}
.tb-brand__text span,
.tb-pasien span {
  font-size: 0.8rem;
  color: var(--app-text-muted);
}
.tb-pasien {
  flex: 1;
  min-width: 12rem;
}
.zoom {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.zoom button {
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.zoom button:disabled {
  opacity: 0.4;
  cursor: default;
}
.zoom input {
  width: 6rem;
}
.zoom__pct {
  min-width: 2.75rem;
  text-align: center;
  font-size: 0.8rem;
  cursor: pointer;
}

/* Navigasi */
.rme-nav {
  position: fixed;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  z-index: 19;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.375rem;
  padding: 0.5rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.nav-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  text-align: left;
  white-space: nowrap;
  border: 1px solid var(--tc);
  border-radius: 8px;
  background: var(--app-panel);
  color: var(--tc);
  cursor: pointer;
}
@media (max-width: 1100px) {
  .nav-tab {
    font-size: 0;
    padding: 0.35rem 0.5rem;
  }
  .nav-tab span {
    font-size: 1rem;
  }
}
.nav-tab.is-active {
  background: var(--tc);
  color: #fff;
}
.nav-tab.is-kosong {
  opacity: 0.45;
}

.info {
  color: var(--app-text-muted);
  padding: 2rem;
}

/* Kertas */
.rme-area {
  display: grid;
  gap: 1rem;
  justify-items: center;
  max-width: 100%;
}
.rme-page {
  position: relative;
  width: 210mm;
  max-width: 100%;
  min-height: 297mm;
  padding: 14mm 15mm;
  background: #fff;
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10.5pt;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  break-after: page;
  page-break-after: always;
}
.rme-page:last-child {
  break-after: auto;
  page-break-after: auto;
}
.phr {
  display: flex;
  justify-content: space-between;
  padding-bottom: 1.5mm;
  margin-bottom: 4mm;
  border-bottom: 0.5px solid var(--rule);
  font-size: 8pt;
  color: var(--ink-muted);
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
  font-size: 0.85em;
  color: var(--ink-muted);
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
  font-size: 1.4em;
  color: var(--ink);
  text-transform: uppercase;
}
.judul {
  margin: 4mm 0 5mm;
  font-size: 1.2em;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.judul small {
  display: block;
  font-size: 0.7em;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink-muted);
}
.bagian {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 3mm;
  padding: 1.2mm 2.5mm;
  background: #eef2f8;
  border-left: 3px solid #162d4e;
  font-size: 1em;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5mm;
}
.data {
  margin: 0;
}
.data > div {
  display: grid;
  grid-template-columns: 26mm 1fr;
  gap: 2mm;
  padding: 0.8mm 0;
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
.mono {
  font-variant-numeric: tabular-nums;
}
.muted {
  color: var(--ink-muted);
  font-weight: 400;
}

.soap {
  display: grid;
  gap: 3mm;
  margin: 4mm 0;
}
.soap h3,
.resep h3 {
  margin: 0 0 1mm;
  font-size: 0.95em;
}
.soap p {
  margin: 0;
  white-space: pre-line;
  line-height: 1.45;
}
.resep {
  margin-bottom: 5mm;
  break-inside: avoid;
}

.tabel {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92em;
}
.tabel th,
.tabel td {
  padding: 1.3mm 1.5mm;
  border: 0.5px solid var(--rule);
  vertical-align: top;
  text-align: left;
}
.tabel thead th {
  background: #f3f4f6;
  font-size: 0.85em;
  text-transform: uppercase;
}
.tabel--vital th {
  width: 24mm;
  background: #f3f4f6;
  font-weight: 600;
  font-size: 0.85em;
}
.c-no {
  width: 12mm;
  text-align: center !important;
}
.c-qty {
  width: 22mm;
  text-align: center !important;
}
.c-num {
  text-align: right !important;
  white-space: nowrap;
}
.kat td {
  font-weight: 700;
  font-size: 0.85em;
  text-transform: uppercase;
  background: #fafafa;
}
.kosong {
  text-align: center !important;
  color: var(--ink-muted);
}
.total {
  display: flex;
  justify-content: space-between;
  margin-top: 3mm;
  padding-top: 2mm;
  border-top: 1.5px solid var(--ink);
  font-weight: 700;
}
.badge {
  padding: 0.5mm 3mm;
  border-radius: 999px;
  font-size: 0.8em;
  letter-spacing: 0.04em;
}
.badge--ok {
  background: #dcfce7;
  color: #15803d;
}
.badge--warn {
  background: #fef3c7;
  color: #b45309;
}
.dicetak {
  margin-top: 8mm;
  font-size: 0.8em;
  color: var(--ink-muted);
  text-align: right;
}
.ttd {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1mm;
  width: 50mm;
  margin: 12mm 0 0 auto;
  font-size: 0.9em;
}
.ttd__garis {
  width: 100%;
  border-top: 1px solid var(--ink);
  margin-top: 14mm;
}

/* Resep (gaya lembar resep dokter) */
.rx {
  --rx-biru: #1f63c9;
  display: flex;
  flex-direction: column;
  min-height: 262mm;
  font-size: 10pt;
}
.rx--next {
  margin-top: 8mm;
  padding-top: 8mm;
  border-top: 1px dashed var(--rule);
  break-before: page;
}
.rx__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 2mm;
}
.rx__klinik {
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--rx-biru);
}
.rx__logo {
  font-size: 22pt;
  font-weight: 700;
  color: #4b3fc9;
  line-height: 1;
}
.rx__line {
  border-top: 1.5px solid var(--rx-biru);
  margin: 1mm 0 3mm;
}
.rx__line--tebal {
  border-top-width: 2.5px;
  margin: 3mm 0 5mm;
}
.rx__row {
  display: flex;
  justify-content: space-between;
  gap: 6mm;
  padding: 0.8mm 0;
}
.rx__row > span:last-child {
  text-align: right;
}
.rx__row--r {
  margin-bottom: 4mm;
}
.rx__items {
  display: grid;
  gap: 5mm;
  align-content: start;
  flex: 1;
}
.rx__nama {
  font-size: 10.5pt;
}
.rx__nama small {
  color: #888;
}
.rx__sub {
  margin: 0.8mm 0 0;
  font-size: 8.5pt;
  color: #888;
}
.rx__foot {
  margin-top: 10mm;
}
.rx__note {
  margin: 0;
  text-align: center;
  font-size: 7.5pt;
  color: var(--rx-biru);
}

/* Dialog pengaturan */
.setting-hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
}
.setting-list {
  display: grid;
  gap: 0.5rem;
}
.setting-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
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
  .rme {
    display: block;
  }
  .rme-area {
    display: block;
    zoom: 1 !important;
  }
  .rme-page {
    width: 100%;
    min-height: 0;
    padding: 0;
    box-shadow: none;
  }
}
</style>
