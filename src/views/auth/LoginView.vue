<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const appName = import.meta.env.VITE_APP_NAME || 'Klinik'
const REMEMBER_KEY = 'klinik.remember_username'

const form = ref({ username: '', password: '' })
const rememberMe = ref(false)
const loading = ref(false)

// ── Latar ticker: fitur-fitur aplikasi ───────────────────────
const tickerRows = [
  {
    dir: 'ltr',
    speed: '38s',
    items: [
      { icon: 'pi pi-folder-open', title: 'Rekam Medis Elektronik', sub: 'EMR terintegrasi' },
      { icon: 'pi pi-box', title: 'Farmasi', sub: 'Resep & stok obat' },
      { icon: 'pi pi-filter', title: 'Laboratorium', sub: 'Hasil lab digital' },
      { icon: 'pi pi-heart', title: 'Pemeriksaan Klinis', sub: 'Poli umum, gigi & KIA' },
      { icon: 'pi pi-user-plus', title: 'Pendaftaran', sub: 'Pasien baru & lama' }
    ]
  },
  {
    dir: 'rtl',
    speed: '28s',
    items: [
      { icon: 'pi pi-id-card', title: 'BPJS Kesehatan', sub: 'SEP & rujukan' },
      { icon: 'pi pi-wallet', title: 'Kasir', sub: 'Tagihan & pembayaran' },
      { icon: 'pi pi-ticket', title: 'Antrian', sub: 'Panggilan antrian pasien' },
      { icon: 'pi pi-calendar', title: 'Jadwal Dokter', sub: 'Praktik & kehadiran' },
      { icon: 'pi pi-lock', title: 'Keamanan Data', sub: 'Kerahasiaan pasien' }
    ]
  },
  {
    dir: 'ltr',
    speed: '44s',
    items: [
      { icon: 'pi pi-mobile', title: 'Mobile JKN', sub: 'Antrian online' },
      { icon: 'pi pi-shield', title: 'Imunisasi', sub: 'Program vaksinasi' },
      { icon: 'pi pi-users', title: 'Prolanis', sub: 'Penyakit kronis' },
      { icon: 'pi pi-print', title: 'Cetak Dokumen', sub: 'Surat & resume medis' },
      { icon: 'pi pi-bell', title: 'Notifikasi', sub: 'Pengingat kontrol' }
    ]
  },
  {
    dir: 'rtl',
    speed: '24s',
    items: [
      { icon: 'pi pi-send', title: 'Satu Sehat', sub: 'Integrasi Kemenkes RI' },
      { icon: 'pi pi-chart-bar', title: 'Laporan & Analitik', sub: 'Dashboard manajemen' },
      { icon: 'pi pi-database', title: 'Master Data', sub: 'Dokter, poli & tarif' },
      { icon: 'pi pi-verified', title: 'Tanda Tangan Elektronik', sub: 'Dokumen sah digital' },
      { icon: 'pi pi-cloud', title: 'Cloud Backup', sub: 'Data aman tersimpan' }
    ]
  }
]

async function submit() {
  if (!form.value.username || !form.value.password) {
    toast.add({ severity: 'warn', summary: 'Data belum lengkap', detail: 'Isi nama pengguna dan kata sandi.', life: 3000 })
    return
  }
  loading.value = true
  try {
    await auth.login(form.value.username, form.value.password)

    // Hanya nama pengguna yang diingat; kata sandi tidak disimpan di browser
    try {
      if (rememberMe.value) localStorage.setItem(REMEMBER_KEY, form.value.username)
      else localStorage.removeItem(REMEMBER_KEY)
    } catch {
      /* abaikan jika storage tidak tersedia */
    }

    toast.add({ severity: 'success', summary: 'Login berhasil', detail: `Selamat datang, ${auth.user?.name || form.value.username}`, life: 3000 })
    router.push(route.query.redirect || '/')
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Gagal masuk',
      detail: err?.message || 'Nama pengguna atau kata sandi salah.',
      life: 4000
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(REMEMBER_KEY)
    if (saved) {
      form.value.username = saved
      rememberMe.value = true
    }
  } catch {
    /* abaikan */
  }
})
</script>

<template>
  <div class="login-page">
    <!-- Latar ticker bergerak -->
    <div class="ticker" aria-hidden="true">
      <div v-for="(row, ri) in tickerRows" :key="ri" class="ticker__row" :style="{ '--speed': row.speed }">
        <div class="ticker__track" :class="`ticker__track--${row.dir}`">
          <div v-for="(item, ii) in [...row.items, ...row.items]" :key="`${ri}-${ii}`" class="ticker__box">
            <i :class="item.icon" class="ticker__icon" />
            <div class="ticker__text">
              <span class="ticker__title">{{ item.title }}</span>
              <span class="ticker__sub">{{ item.sub }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Kartu login -->
    <div class="login">
      <div class="login__brand">
        <h1 class="login__heading"><strong>{{ appName }}</strong> Login</h1>
        <span class="login__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" /></svg>
        </span>
        <p class="login__tagline">Sistem Informasi Manajemen Klinik</p>
      </div>

      <form class="login__form" @submit.prevent="submit">
        <div class="field">
          <label for="username">Nama pengguna</label>
          <IconField>
            <InputIcon class="pi pi-user" />
            <InputText
              id="username"
              v-model="form.username"
              placeholder="Masukkan nama pengguna"
              autocomplete="username"
              fluid
            />
          </IconField>
        </div>
        <div class="field">
          <label for="password">Kata sandi</label>
          <Password
            inputId="password"
            v-model="form.password"
            placeholder="Masukkan kata sandi"
            :feedback="false"
            toggleMask
            fluid
          />
        </div>

        <div class="login__remember">
          <Checkbox v-model="rememberMe" inputId="remember" binary />
          <label for="remember">Ingat nama pengguna</label>
        </div>

        <Button type="submit" label="Masuk" icon="pi pi-sign-in" :loading="loading" fluid />
      </form>

      <p class="login__footer">© {{ new Date().getFullYear() }} {{ appName }}. Hak cipta dilindungi.</p>
    </div>
  </div>
</template>

<style scoped>
/* Menutupi padding BlankLayout agar latar penuh satu layar */
.login-page {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow-y: auto;
  background: linear-gradient(135deg, var(--sidebar-bg) 0%, var(--p-primary-700) 100%);
}
:global(.app-dark) .login-page {
  background: linear-gradient(135deg, var(--sidebar-bg) 0%, var(--p-primary-900) 100%);
}

/* ── Ticker ── */
.ticker {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.6) 10%, rgba(0, 0, 0, 0.6) 90%, transparent);
  mask-image: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.6) 10%, rgba(0, 0, 0, 0.6) 90%, transparent);
}
.ticker__row {
  flex: 1;
  display: flex;
  overflow: hidden;
  border-bottom: 1px solid var(--sidebar-border);
}
.ticker__row:last-child {
  border-bottom: 0;
}
.ticker__track {
  display: flex;
  width: max-content;
  will-change: transform;
}
.ticker__track--ltr {
  animation: scroll-ltr var(--speed) linear infinite;
}
.ticker__track--rtl {
  animation: scroll-rtl var(--speed) linear infinite;
}
@keyframes scroll-ltr {
  from { transform: translateX(-50%); }
  to { transform: translateX(0); }
}
@keyframes scroll-rtl {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.ticker__box {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-right: 1px solid var(--sidebar-border);
  white-space: nowrap;
}
.ticker__icon {
  font-size: 1.125rem;
  color: var(--sidebar-active-text);
}
.ticker__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.ticker__title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
}
.ticker__sub {
  font-size: 0.6875rem;
  color: var(--sidebar-muted);
}

/* ── Kartu login ── */
.login {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 25rem;
  padding: 2rem 2.25rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--app-radius-lg);
  background: color-mix(in srgb, var(--app-panel) 88%, transparent);
  backdrop-filter: blur(18px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
:global(.app-dark) .login {
  border-color: rgba(255, 255, 255, 0.08);
}
.login__brand {
  text-align: center;
  margin-bottom: 1.75rem;
}
.login__heading {
  margin: 0 0 1rem;
  font-size: 1.375rem;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.login__heading strong {
  font-weight: 800;
  color: var(--p-primary-color);
}
.login__logo {
  display: inline-grid;
  place-items: center;
  width: 4.25rem;
  height: 4.25rem;
  border-radius: 50%;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--p-primary-color) 40%, transparent);
}
.login__tagline {
  margin: 1rem 0 0;
  font-size: 0.8125rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.login__form {
  display: grid;
  gap: 1rem;
}
.field {
  display: grid;
  gap: 0.375rem;
}
.field label {
  font-size: 0.875rem;
  font-weight: 600;
}
.login__remember {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.login__remember label {
  cursor: pointer;
}
.login__footer {
  margin: 1.5rem 0 0;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

@media (max-width: 480px) {
  .ticker {
    display: none;
  }
  .login {
    padding: 1.5rem 1.25rem;
  }
}
</style>
