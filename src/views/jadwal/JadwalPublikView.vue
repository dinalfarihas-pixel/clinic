<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { HARI, getJadwalSemua, getProfilKlinik, parseJam } from '@/services/jadwalDokter'

// Halaman publik (tanpa login): jadwal praktik dokter satu klinik, dibuka lewat /jadwal/:idClient

const route = useRoute()
const idClient = String(route.params.idClient || '')

const loading = ref(true)
const error = ref('')
const rows = ref([])
const profil = ref(null)
const logoError = ref(false)

const keyword = ref('')
const poliDipilih = ref(null)
const hariIni = ref(false)

// getDay(): 0 = Minggu; jadwal memakai 1 = Senin … 7 = Minggu
const sekarang = new Date()
const hariSekarang = sekarang.getDay() === 0 ? 7 : sekarang.getDay()
const namaHari = (h) => HARI.find((x) => x.hari === h)?.nama || ''

// Satu entri per dokter: sesi dikelompokkan per hari (urut Senin → Minggu)
const dokterList = computed(() => {
  const peta = new Map()
  for (const r of rows.value) {
    const jam = parseJam(r.jadwal)
    const hari = Number(r.hari)
    if (!jam || !hari || Number(r.libur) === 1 || !r.namadokter) continue
    const key = `${String(r.namadokter).trim().toLowerCase()}|${r.namapoli}`
    if (!peta.has(key)) peta.set(key, { nama: String(r.namadokter).trim(), poli: r.namapoli || 'Lainnya', hari: new Map() })
    const d = peta.get(key)
    if (!d.hari.has(hari)) d.hari.set(hari, [])
    d.hari.get(hari).push({ ...jam, kapasitas: Number(r.kapasitaspasien) || 0 })
  }
  return [...peta.values()].map((d) => ({
    ...d,
    jadwal: [...d.hari.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hari, sesi]) => ({ hari, nama: namaHari(hari), sesi: sesi.sort((a, b) => a.mulai.localeCompare(b.mulai)) })),
    praktikHariIni: d.hari.has(hariSekarang)
  }))
})

const daftarPoli = computed(() => [...new Set(dokterList.value.map((d) => d.poli))].sort())

const tersaring = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return dokterList.value.filter(
    (d) =>
      (!poliDipilih.value || d.poli === poliDipilih.value) &&
      (!hariIni.value || d.praktikHariIni) &&
      (!q || d.nama.toLowerCase().includes(q) || d.poli.toLowerCase().includes(q))
  )
})

// Dikelompokkan per poli
const perPoli = computed(() => {
  const peta = new Map()
  for (const d of tersaring.value) {
    if (!peta.has(d.poli)) peta.set(d.poli, [])
    peta.get(d.poli).push(d)
  }
  return [...peta.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([poli, dokter]) => ({ poli, dokter: dokter.sort((a, b) => a.nama.localeCompare(b.nama)) }))
})

const diperbarui = computed(() => {
  const t = rows.value.map((r) => new Date(r.lastupdated)).filter((d) => !isNaN(d))
  return t.length ? new Date(Math.max(...t)).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
})

const tanggalHariIni = sekarang.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const cetak = () => window.print()

onMounted(async () => {
  if (!/^\d+$/.test(idClient)) {
    error.value = 'Alamat jadwal tidak valid.'
    loading.value = false
    return
  }
  const [j, p] = await Promise.allSettled([getJadwalSemua(idClient), getProfilKlinik(idClient)])
  if (j.status === 'fulfilled') rows.value = j.value
  else error.value = 'Jadwal belum dapat dimuat. Silakan coba beberapa saat lagi.'
  if (p.status === 'fulfilled') profil.value = p.value
  document.title = profil.value?.nama ? `Jadwal Dokter · ${profil.value.nama}` : 'Jadwal Dokter'
  loading.value = false
})
</script>

<template>
  <div class="jadwal">
    <header class="jadwal__head">
      <img v-if="profil?.logo && !logoError" :src="profil.logo" alt="" class="jadwal__logo" @error="logoError = true" />
      <div>
        <p v-if="profil?.nama" class="jadwal__klinik">{{ profil.nama }}</p>
        <h1 class="jadwal__judul">Jadwal Praktik Dokter</h1>
        <p v-if="profil?.alamat" class="jadwal__alamat">{{ profil.alamat }}</p>
      </div>
      <Button class="jadwal__cetak" icon="pi pi-print" label="Cetak" severity="secondary" outlined @click="cetak" />
    </header>

    <p v-if="loading" class="status"><i class="pi pi-spin pi-spinner" /> Memuat jadwal…</p>
    <Message v-else-if="error" severity="error" icon="pi pi-exclamation-circle">{{ error }}</Message>

    <template v-else>
      <div class="filter">
        <IconField class="filter__cari">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" placeholder="Cari dokter atau poli" fluid aria-label="Cari dokter atau poli" />
        </IconField>
        <Select v-model="poliDipilih" :options="daftarPoli" placeholder="Semua poli" showClear class="filter__poli" aria-label="Filter poli" />
        <label class="filter__hari">
          <ToggleSwitch v-model="hariIni" />
          <span>Praktik hari ini ({{ namaHari(hariSekarang) }})</span>
        </label>
      </div>

      <p v-if="!dokterList.length" class="kosong">Belum ada jadwal praktik yang tersedia.</p>
      <p v-else-if="!tersaring.length" class="kosong">Tidak ada dokter yang cocok dengan pencarian.</p>

      <section v-for="grup in perPoli" :key="grup.poli" class="poli">
        <h2 class="poli__nama"><i class="pi pi-building" /> {{ grup.poli }}</h2>
        <div class="poli__grid">
          <article v-for="d in grup.dokter" :key="d.nama" class="dokter">
            <header class="dokter__head">
              <h3 class="dokter__nama">{{ d.nama }}</h3>
              <Tag v-if="d.praktikHariIni" value="Praktik hari ini" severity="success" />
            </header>
            <ul class="dokter__jadwal">
              <li v-for="h in d.jadwal" :key="h.hari" class="hari" :class="{ 'hari--ini': h.hari === hariSekarang }">
                <span class="hari__nama">{{ h.nama }}</span>
                <span class="hari__jam">
                  <span v-for="(s, i) in h.sesi" :key="i" class="jam">{{ s.mulai }} – {{ s.selesai }}</span>
                </span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <footer class="jadwal__foot">
        <p>Hari ini {{ tanggalHariIni }}. Jadwal dapat berubah sewaktu-waktu<template v-if="diperbarui">; terakhir diperbarui {{ diperbarui }}</template>.</p>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.jadwal {
  width: min(64rem, 100%);
  align-self: start;
  display: grid;
  gap: 1.25rem;
}
.jadwal__head {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1.25rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
}
.jadwal__logo {
  width: 3.5rem;
  height: 3.5rem;
  object-fit: contain;
}
.jadwal__klinik {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-primary-color);
}
.jadwal__judul {
  margin: 0;
  font-size: 1.5rem;
}
.jadwal__alamat {
  white-space: pre-line;
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}
.jadwal__cetak {
  margin-left: auto;
}
.status,
.kosong {
  margin: 0;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--app-text-muted);
}

.filter {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}
.filter__cari {
  flex: 1 1 14rem;
}
.filter__poli {
  flex: 0 1 14rem;
}
.filter__hari {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.poli {
  display: grid;
  gap: 0.75rem;
}
.poli__nama {
  margin: 0;
  font-size: 1.0625rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.poli__nama i {
  color: var(--p-primary-color);
}
.poli__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: 0.75rem;
}
.dokter {
  display: grid;
  gap: 0.625rem;
  align-content: start;
  padding: 0.875rem 1rem;
  background: var(--app-panel);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-lg);
  break-inside: avoid;
}
.dokter__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.dokter__nama {
  margin: 0;
  font-size: 1rem;
}
.dokter__jadwal {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.hari {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--app-radius);
  font-size: 0.875rem;
}
.hari--ini {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
  font-weight: 600;
}
.hari__jam {
  display: grid;
  justify-items: end;
  font-variant-numeric: tabular-nums;
}
.jadwal__foot p {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  text-align: center;
}

@media print {
  .jadwal__cetak,
  .filter {
    display: none;
  }
}
</style>
