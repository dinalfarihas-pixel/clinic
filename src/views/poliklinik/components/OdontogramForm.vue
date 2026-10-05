<script setup>
import { reactive, ref, computed, defineComponent, h, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import { getOdontogram, getRiwayatOdontogram, simpanOdontogram } from '@/services/odontogram'

const props = defineProps({
  datapasien: { type: Object, required: true }
})

const toast = useToast()
const auth = useAuthStore()

const noReg = computed(() => props.datapasien?.NOPENDAFTARAN)
const norm = computed(() => props.datapasien?.NOMR)

// ── Tata letak gigi (notasi FDI) ───────────────────────────────
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]
const UPPER_RIGHT_D = [55, 54, 53, 52, 51]
const UPPER_LEFT_D = [61, 62, 63, 64, 65]
const LOWER_RIGHT_D = [85, 84, 83, 82, 81]
const LOWER_LEFT_D = [71, 72, 73, 74, 75]
const ALL_TEETH = [
  ...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_RIGHT, ...LOWER_LEFT,
  ...UPPER_RIGHT_D, ...UPPER_LEFT_D, ...LOWER_RIGHT_D, ...LOWER_LEFT_D
]

// ── Kondisi gigi ───────────────────────────────────────────────
const CONDITIONS = [
  { code: 'K', label: 'Karies', fill: '#ef4444', stroke: '#b91c1c', whole: false },
  { code: 'A', label: 'Amalgam', fill: '#6b7280', stroke: '#374151', whole: false },
  { code: 'CO', label: 'Komposit', fill: '#93c5fd', stroke: '#1d4ed8', whole: false },
  { code: 'F', label: 'Fraktur', fill: '#fb923c', stroke: '#c2410c', whole: false },
  { code: 'RKA', label: 'Perawatan Sal. Akar', fill: '#c084fc', stroke: '#7e22ce', whole: false },
  { code: 'GTC', label: 'Mahkota / Crown', fill: '#fbbf24', stroke: '#b45309', whole: true },
  { code: 'GTL', label: 'Gigi Tiruan Lepasan', fill: '#34d399', stroke: '#065f46', whole: true },
  { code: 'X', label: 'Cabut / Hilang', fill: '#9ca3af', stroke: '#4b5563', whole: true },
  { code: 'UNE', label: 'Un-Erupted', fill: '#e0e7ff', stroke: '#6366f1', whole: true },
  { code: 'AN', label: 'Anomali', fill: '#fde68a', stroke: '#d97706', whole: true }
]
const isWholeCondition = (code) => CONDITIONS.find((c) => c.code === code)?.whole ?? false

// ── Data kondisi tiap gigi ───────────────────────────────────
const teethData = reactive({})
ALL_TEETH.forEach((num) => {
  teethData[num] = { B: null, M: null, D: null, L: null, O: null, whole: null }
})

const selectedCondition = ref(null)
const toggleCondition = (code) => (selectedCondition.value = selectedCondition.value === code ? null : code)

function clickSurface(num, surface) {
  const t = teethData[num]
  if (!t) return
  if (!selectedCondition.value) {
    t[surface] = null
    t.whole = null
    return
  }
  if (isWholeCondition(selectedCondition.value)) {
    t.whole = t.whole === selectedCondition.value ? null : selectedCondition.value
  } else {
    t[surface] = t[surface] === selectedCondition.value ? null : selectedCondition.value
  }
}

const totalAffected = computed(() => Object.values(teethData).filter((t) => t.whole || t.B || t.M || t.D || t.L || t.O).length)

// ── SVG peraga gigi (render function, per permukaan bisa diklik) ─
const ToothSvg = defineComponent({
  props: {
    num: { type: Number, required: true },
    teethData: { type: Object, required: true },
    small: { type: Boolean, default: false }
  },
  emits: ['click-surface'],
  setup(p, { emit }) {
    const getFill = (surface) => {
      const code = p.teethData[p.num]?.[surface]
      return code ? CONDITIONS.find((c) => c.code === code)?.fill ?? '#ffffff' : '#ffffff'
    }
    const getWhole = () => p.teethData[p.num]?.whole ?? null
    const getWholeColor = () => {
      const w = getWhole()
      return w ? CONDITIONS.find((c) => c.code === w)?.fill ?? 'transparent' : 'transparent'
    }
    return () => {
      const s = p.small ? 42 : 58
      const i = p.small ? 13 : 17
      const whole = getWhole()
      const elems = [h('rect', { x: 0, y: 0, width: s, height: s, fill: '#f9fafb', stroke: '#d1d5db', 'stroke-width': 0.5 })]

      if (whole) {
        elems.push(h('rect', { x: 0, y: 0, width: s, height: s, fill: getWholeColor(), opacity: 0.75 }))
        if (whole === 'X') {
          elems.push(
            h('line', { x1: 3, y1: 3, x2: s - 3, y2: s - 3, stroke: '#1f2937', 'stroke-width': 2, 'stroke-linecap': 'round' }),
            h('line', { x1: s - 3, y1: 3, x2: 3, y2: s - 3, stroke: '#1f2937', 'stroke-width': 2, 'stroke-linecap': 'round' })
          )
        } else {
          elems.push(h('text', { x: s / 2, y: s / 2 + 4, 'text-anchor': 'middle', 'font-size': p.small ? 9 : 11, fill: '#1f2937', 'font-weight': 'bold' }, whole))
        }
        elems.push(h('rect', { x: 0, y: 0, width: s, height: s, fill: 'transparent', style: 'cursor:pointer', onClick: () => emit('click-surface', p.num, 'O') }))
      } else {
        const surfaces = [
          { key: 'B', points: `0,0 ${s},0 ${s - i},${i} ${i},${i}` },
          { key: 'D', points: `${s},0 ${s - i},${i} ${s - i},${s - i} ${s},${s}` },
          { key: 'L', points: `${i},${s - i} ${s - i},${s - i} ${s},${s} 0,${s}` },
          { key: 'M', points: `0,0 ${i},${i} ${i},${s - i} 0,${s}` }
        ]
        surfaces.forEach(({ key, points }) => {
          elems.push(h('polygon', { points, fill: getFill(key), stroke: '#9ca3af', 'stroke-width': 0.5, style: 'cursor:pointer', onClick: () => emit('click-surface', p.num, key) }))
        })
        elems.push(h('rect', { x: i, y: i, width: s - 2 * i, height: s - 2 * i, fill: getFill('O'), stroke: '#9ca3af', 'stroke-width': 0.5, style: 'cursor:pointer', onClick: () => emit('click-surface', p.num, 'O') }))
      }
      return h('svg', { class: p.small ? 'tooth-svg tooth-svg--sm' : 'tooth-svg', viewBox: `0 0 ${s} ${s}` }, elems)
    }
  }
})

// ── Form, muat & simpan ──────────────────────────────────────
const form = reactive({ keluhan: '', catatan: '' })
const loading = ref(false)
const saving = ref(false)
const lastSaved = ref(null)

async function muat() {
  if (!noReg.value) return
  loading.value = true
  try {
    const d = await getOdontogram(noReg.value, norm.value)
    if (d?.teeth_data) {
      Object.entries(d.teeth_data).forEach(([num, val]) => {
        if (teethData[num]) Object.assign(teethData[num], val)
      })
    }
    form.keluhan = d?.keluhan || ''
    form.catatan = d?.catatan || ''
  } catch (err) {
    console.error('getOdontogram:', err)
  } finally {
    loading.value = false
  }
}

async function simpan() {
  saving.value = true
  try {
    await simpanOdontogram({
      noReg: noReg.value,
      norm: norm.value,
      userId: auth.userId,
      teethData,
      keluhan: form.keluhan,
      catatan: form.catatan
    })
    toast.add({ severity: 'success', summary: 'Berhasil', detail: 'Odontogram tersimpan', life: 3000 })
    lastSaved.value = new Date().toLocaleTimeString('id-ID')
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal', detail: err.message, life: 5000 })
  } finally {
    saving.value = false
  }
}

// ── Riwayat odontogram ───────────────────────────────────────
const showRiwayat = ref(false)
const loadingRiwayat = ref(false)
const riwayat = ref([])

async function bukaRiwayat() {
  showRiwayat.value = true
  loadingRiwayat.value = true
  try {
    riwayat.value = await getRiwayatOdontogram(noReg.value, norm.value)
  } catch (err) {
    console.error('getRiwayatOdontogram:', err)
    riwayat.value = []
  } finally {
    loadingRiwayat.value = false
  }
}

function formatWaktu(dt) {
  if (!dt) return '-'
  return new Date(dt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function gigiBermasalah(td) {
  if (!td) return []
  return Object.entries(td)
    .filter(([, v]) => v && (v.whole || v.B || v.M || v.D || v.L || v.O))
    .map(([num, v]) => {
      const code = v.whole || v.B || v.M || v.D || v.L || v.O
      const cond = CONDITIONS.find((c) => c.code === code)
      const sisi = ['B', 'M', 'D', 'L', 'O'].filter((s) => v[s]).map((s) => `${s}:${v[s]}`)
      return {
        num,
        color: cond?.stroke || '#6b7280',
        label: v.whole || (sisi.length > 1 ? `${sisi.length} sisi` : code),
        detail: v.whole ? `Seluruh gigi: ${v.whole}` : sisi.join(', ')
      }
    })
}

onMounted(muat)
</script>

<template>
  <div class="odontogram">
    <p v-if="loading" class="muted"><i class="pi pi-spin pi-spinner" /> Memuat data odontogram…</p>

    <template v-else>
      <!-- Palet kondisi -->
      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title"><i class="pi pi-palette panel__icon" />Pilih Kondisi</h2>
          <Tag :value="`${totalAffected} gigi bermasalah`" :severity="totalAffected > 0 ? 'danger' : 'success'" />
        </header>
        <div class="pal-row">
          <button
            v-for="cond in CONDITIONS"
            :key="cond.code"
            type="button"
            class="pal-btn"
            :class="{ 'pal-btn--on': selectedCondition === cond.code }"
            @click="toggleCondition(cond.code)"
          >
            <span class="pal-swatch" :style="{ background: cond.fill, borderColor: cond.stroke }" />
            <strong>{{ cond.code }}</strong>
            <span class="pal-text">{{ cond.label }}</span>
          </button>
          <button type="button" class="pal-btn" :class="{ 'pal-btn--on': !selectedCondition }" @click="selectedCondition = null">
            <span class="pal-swatch" style="background: #fff; border-color: #cbd5e1" />
            <strong>CLR</strong>
            <span class="pal-text">Hapus tanda</span>
          </button>
        </div>
        <p v-if="selectedCondition" class="pal-hint">
          <i class="pi pi-info-circle" />
          Kondisi <strong>{{ selectedCondition }}</strong> dipilih —
          {{ isWholeCondition(selectedCondition) ? 'klik gigi mana saja untuk menandai seluruh gigi' : 'klik permukaan gigi untuk menandai' }}
        </p>
      </section>

      <!-- Odontogram -->
      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title"><i class="pi pi-th-large panel__icon" />Odontogram</h2>
        </header>

        <div class="odonto-chart">
          <div class="dir-row"><span>← Kanan Pasien</span><span class="dir-mid">|</span><span>Kiri Pasien →</span></div>

          <div class="arch-row">
            <div class="teeth-half teeth-half--right">
              <div v-for="num in UPPER_RIGHT" :key="num" class="tooth-cell">
                <span class="t-num">{{ num }}</span>
                <component :is="ToothSvg" :num="num" :teeth-data="teethData" @click-surface="clickSurface" />
              </div>
            </div>
            <div class="midline" />
            <div class="teeth-half teeth-half--left">
              <div v-for="num in UPPER_LEFT" :key="num" class="tooth-cell">
                <span class="t-num">{{ num }}</span>
                <component :is="ToothSvg" :num="num" :teeth-data="teethData" @click-surface="clickSurface" />
              </div>
            </div>
          </div>

          <div class="arch-row arch-row--deci">
            <div class="teeth-half teeth-half--right">
              <div class="t-spacer" v-for="i in 3" :key="'usr' + i" />
              <div v-for="num in UPPER_RIGHT_D" :key="num" class="tooth-cell">
                <span class="t-num t-num--sm">{{ num }}</span>
                <component :is="ToothSvg" :num="num" :teeth-data="teethData" small @click-surface="clickSurface" />
              </div>
            </div>
            <div class="midline" />
            <div class="teeth-half teeth-half--left">
              <div v-for="num in UPPER_LEFT_D" :key="num" class="tooth-cell">
                <span class="t-num t-num--sm">{{ num }}</span>
                <component :is="ToothSvg" :num="num" :teeth-data="teethData" small @click-surface="clickSurface" />
              </div>
            </div>
          </div>

          <div class="jaw-divider"><span>Rahang Atas</span><div class="jaw-line" /><span>Rahang Bawah</span></div>

          <div class="arch-row arch-row--deci">
            <div class="teeth-half teeth-half--right">
              <div class="t-spacer" v-for="i in 3" :key="'lrd' + i" />
              <div v-for="num in LOWER_RIGHT_D" :key="num" class="tooth-cell">
                <component :is="ToothSvg" :num="num" :teeth-data="teethData" small @click-surface="clickSurface" />
                <span class="t-num t-num--sm">{{ num }}</span>
              </div>
            </div>
            <div class="midline" />
            <div class="teeth-half teeth-half--left">
              <div v-for="num in LOWER_LEFT_D" :key="num" class="tooth-cell">
                <component :is="ToothSvg" :num="num" :teeth-data="teethData" small @click-surface="clickSurface" />
                <span class="t-num t-num--sm">{{ num }}</span>
              </div>
            </div>
          </div>

          <div class="arch-row">
            <div class="teeth-half teeth-half--right">
              <div v-for="num in LOWER_RIGHT" :key="num" class="tooth-cell">
                <component :is="ToothSvg" :num="num" :teeth-data="teethData" @click-surface="clickSurface" />
                <span class="t-num">{{ num }}</span>
              </div>
            </div>
            <div class="midline" />
            <div class="teeth-half teeth-half--left">
              <div v-for="num in LOWER_LEFT" :key="num" class="tooth-cell">
                <component :is="ToothSvg" :num="num" :teeth-data="teethData" @click-surface="clickSurface" />
                <span class="t-num">{{ num }}</span>
              </div>
            </div>
          </div>

          <div class="legend-row">
            <span v-for="cond in CONDITIONS" :key="cond.code" class="legend-item">
              <span class="legend-swatch" :style="{ background: cond.fill, borderColor: cond.stroke }" />
              {{ cond.code }} — {{ cond.label }}
            </span>
          </div>
        </div>
      </section>

      <!-- Keluhan & catatan -->
      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title"><i class="pi pi-clipboard panel__icon" />Keluhan & Catatan Perawatan</h2>
        </header>
        <div class="odonto-notes">
          <div class="field">
            <label for="odo-keluhan">Keluhan Utama Pasien</label>
            <Textarea id="odo-keluhan" v-model="form.keluhan" rows="3" autoResize fluid placeholder="Tuliskan keluhan utama pasien…" />
          </div>
          <div class="field">
            <label for="odo-catatan">Rencana Perawatan / Catatan</label>
            <Textarea id="odo-catatan" v-model="form.catatan" rows="3" autoResize fluid placeholder="Catatan pemeriksaan dan rencana tindakan…" />
          </div>
        </div>
      </section>

      <!-- Action bar -->
      <div class="odonto-actions">
        <Button label="Riwayat" icon="pi pi-history" severity="secondary" outlined @click="bukaRiwayat" />
        <span v-if="lastSaved" class="saved-info"><i class="pi pi-check-circle" /> Disimpan pukul {{ lastSaved }}</span>
        <Button label="Simpan Odontogram" icon="pi pi-save" severity="success" :loading="saving" @click="simpan" />
      </div>
    </template>

    <!-- Dialog: Riwayat odontogram -->
    <Dialog v-model:visible="showRiwayat" modal header="Riwayat Odontogram" :style="{ width: '680px', maxWidth: '96vw' }">
      <p v-if="loadingRiwayat" class="muted"><i class="pi pi-spin pi-spinner" /> Memuat riwayat…</p>
      <p v-else-if="!riwayat.length" class="muted">Belum ada riwayat odontogram untuk kunjungan ini.</p>

      <div v-else class="hist-timeline">
        <div v-for="(item, idx) in riwayat" :key="item.id ?? idx" class="hist-item">
          <div class="hist-item__head">
            <span class="hist-date"><i class="pi pi-calendar" /> {{ formatWaktu(item.updated_at || item.created_at) }}</span>
            <Tag v-if="idx === 0" value="Terbaru" severity="success" />
            <span class="hist-user"><i class="pi pi-user" /> {{ item.user_nama || `User #${item.user_id}` }}</span>
          </div>
          <div v-if="gigiBermasalah(item.teeth_data).length" class="hist-tags">
            <span
              v-for="t in gigiBermasalah(item.teeth_data)"
              :key="t.num"
              class="hist-tag"
              :style="{ borderColor: t.color, color: t.color }"
              :title="t.detail"
            >
              <strong>{{ t.num }}</strong> {{ t.label }}
            </span>
          </div>
          <p v-else class="muted small">Tidak ada kondisi gigi yang tercatat.</p>
          <div v-if="item.keluhan || item.catatan" class="hist-notes">
            <p v-if="item.keluhan"><strong>Keluhan:</strong> {{ item.keluhan }}</p>
            <p v-if="item.catatan"><strong>Catatan:</strong> {{ item.catatan }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Tutup" icon="pi pi-times" severity="secondary" outlined @click="showRiwayat = false" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.odontogram {
  display: grid;
  gap: 1rem;
}
.muted {
  color: var(--app-text-muted);
}
.small {
  font-size: 0.8125rem;
}
.panel__icon {
  color: var(--p-primary-color);
  margin-right: 0.5rem;
  font-size: 0.9375rem;
}
.field {
  display: grid;
  gap: 0.375rem;
}
.field label {
  font-size: 0.875rem;
  font-weight: 600;
}

/* Palet kondisi */
.pal-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.pal-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border: 1.5px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-panel);
  color: var(--app-text);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.pal-btn:hover {
  border-color: var(--p-primary-color);
}
.pal-btn--on {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}
.pal-swatch {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 3px;
  border: 2px solid;
  flex-shrink: 0;
}
.pal-text {
  color: var(--app-text-muted);
}
.pal-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0.625rem 0 0;
  font-size: 0.8125rem;
  color: var(--p-primary-color);
}

/* Odontogram chart */
.odonto-chart {
  overflow-x: auto;
  padding-bottom: 0.25rem;
}
.dir-row {
  display: flex;
  justify-content: space-between;
  min-width: 62rem;
  margin-bottom: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--app-text-muted);
}
.dir-mid {
  color: var(--app-border);
}
.arch-row {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-width: 62rem;
}
.arch-row--deci {
  margin: 0.125rem 0;
}
.teeth-half {
  display: flex;
  align-items: flex-end;
}
.teeth-half--right {
  justify-content: flex-end;
}
.teeth-half--left {
  justify-content: flex-start;
}
.midline {
  width: 2px;
  height: 3rem;
  background: var(--app-border);
  margin: 0 0.1875rem;
  flex-shrink: 0;
}
.tooth-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 0.0625rem;
  position: relative;
  cursor: pointer;
  transition: transform 0.14s ease, filter 0.14s ease;
}
.tooth-cell:hover {
  transform: translateY(-3px) scale(1.1);
  z-index: 5;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25));
}
.tooth-cell:hover .t-num,
.tooth-cell:hover .t-num--sm {
  color: var(--p-primary-color);
  font-weight: 700;
}
.t-num {
  font-size: 0.6875rem;
  color: var(--app-text-muted);
  font-weight: 600;
  min-width: 1.375rem;
  text-align: center;
  transition: color 0.14s ease;
}
.t-num--sm {
  font-size: 0.625rem;
  min-width: 1.0625rem;
}
.t-spacer {
  width: 2.125rem;
  flex-shrink: 0;
}
:deep(.tooth-svg) {
  width: 2.625rem;
  height: 2.625rem;
  display: block;
}
:deep(.tooth-svg--sm) {
  width: 1.875rem;
  height: 1.875rem;
  display: block;
}
.jaw-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 62rem;
  margin: 0.375rem 0;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--app-text-muted);
}
.jaw-line {
  flex: 1;
  height: 1px;
  background: var(--app-border);
}
.legend-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 1rem;
  min-width: 62rem;
  margin-top: 0.75rem;
  padding: 0.5rem 0.625rem;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  font-size: 0.75rem;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 0.3125rem;
}
.legend-swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  border: 1px solid;
  flex-shrink: 0;
}

/* Catatan */
.odonto-notes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* Action bar */
.odonto-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.saved-info {
  display: flex;
  align-items: center;
  gap: 0.3125rem;
  font-size: 0.8125rem;
  color: var(--p-green-600);
  margin-right: auto;
}
:global(.app-dark) .saved-info {
  color: var(--p-green-400);
}

/* Riwayat */
.hist-timeline {
  display: grid;
  gap: 0.75rem;
  max-height: 60vh;
  overflow-y: auto;
}
.hist-item {
  padding: 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.hist-item__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
}
.hist-date {
  font-weight: 700;
}
.hist-user {
  margin-left: auto;
  color: var(--app-text-muted);
}
.hist-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.375rem;
}
.hist-tag {
  padding: 0.125rem 0.5rem;
  border: 1.5px solid;
  border-radius: 999px;
  font-size: 0.75rem;
}
.hist-notes {
  padding-top: 0.375rem;
  border-top: 1px solid var(--app-border);
  font-size: 0.8125rem;
}
.hist-notes p {
  margin: 0.125rem 0;
}

@media (max-width: 640px) {
  .odonto-notes {
    grid-template-columns: 1fr;
  }
}
</style>
