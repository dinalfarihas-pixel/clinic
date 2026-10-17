<script setup>
import { ref, reactive } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import { gantiKataSandi } from '@/services/pengguna'

const auth = useAuthStore()
const toast = useToast()

const loading = ref(false)
const form = reactive({ password_lama: '', password_baru: '', konfirmasi: '' })
const errors = reactive({ password_lama: '', password_baru: '', konfirmasi: '' })

function clearErrors() {
  errors.password_lama = ''
  errors.password_baru = ''
  errors.konfirmasi = ''
}

function resetForm() {
  form.password_lama = ''
  form.password_baru = ''
  form.konfirmasi = ''
  clearErrors()
}

function validate() {
  clearErrors()
  let valid = true
  if (!form.password_lama) {
    errors.password_lama = 'Password lama wajib diisi'
    valid = false
  }
  if (!form.password_baru) {
    errors.password_baru = 'Password baru wajib diisi'
    valid = false
  } else if (form.password_baru.length < 6) {
    errors.password_baru = 'Password baru minimal 6 karakter'
    valid = false
  }
  if (!form.konfirmasi) {
    errors.konfirmasi = 'Konfirmasi password wajib diisi'
    valid = false
  } else if (form.konfirmasi !== form.password_baru) {
    errors.konfirmasi = 'Konfirmasi password tidak cocok'
    valid = false
  }
  return valid
}

async function submit() {
  if (!validate()) return
  loading.value = true
  try {
    const msg = await gantiKataSandi(auth.userId, form.password_lama, form.password_baru)
    toast.add({ severity: 'success', summary: 'Berhasil', detail: msg, life: 3000 })
    resetForm()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Gagal', detail: err.message, life: 5000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="gp-layout">
    <!-- Panel petunjuk -->
    <div class="gp-guide">
      <div class="gp-guide-header">
        <i class="pi pi-shield"></i>
        <span>Keamanan Password</span>
      </div>

      <div class="gp-guide-section">
        <div class="gp-guide-title"><i class="pi pi-info-circle"></i> Mengapa Mengganti Password?</div>
        <p class="gp-guide-text">
          Password adalah kunci utama keamanan akun Anda. Mengganti password secara berkala membantu melindungi data
          pasien dan informasi klinik dari akses yang tidak sah. Jaga kerahasiaan password dan jangan membagikannya
          kepada siapa pun, termasuk sesama petugas.
        </p>
      </div>

      <div class="gp-guide-section">
        <div class="gp-guide-title"><i class="pi pi-check-circle"></i> Syarat Password yang Kuat</div>
        <ul class="gp-guide-list">
          <li><i class="pi pi-check-circle"></i><span>Minimal <strong>6 karakter</strong></span></li>
          <li><i class="pi pi-check-circle"></i><span>Kombinasi <strong>huruf besar dan kecil</strong></span></li>
          <li><i class="pi pi-check-circle"></i><span>Sisipkan <strong>angka</strong> (contoh: 12, 99)</span></li>
          <li><i class="pi pi-check-circle"></i><span>Jangan gunakan <strong>nama atau tanggal lahir</strong></span></li>
          <li><i class="pi pi-check-circle"></i><span>Hindari password yang <strong>sama dengan sebelumnya</strong></span></li>
        </ul>
      </div>

      <div class="gp-guide-section">
        <div class="gp-guide-title"><i class="pi pi-list"></i> Cara Mengganti Password</div>
        <ol class="gp-guide-steps">
          <li>Masukkan <strong>password lama</strong> Anda yang sedang aktif.</li>
          <li>Masukkan <strong>password baru</strong> yang memenuhi syarat keamanan.</li>
          <li>Ulangi password baru pada kolom <strong>konfirmasi</strong>.</li>
          <li>Klik tombol <strong>Simpan Password</strong> untuk menyimpan perubahan.</li>
        </ol>
      </div>

      <div class="gp-guide-warning">
        <i class="pi pi-exclamation-triangle"></i>
        <div>
          <strong>Perhatian!</strong> Setelah mengganti password, gunakan password baru untuk login berikutnya. Jangan
          catat password di tempat yang mudah dilihat orang lain.
        </div>
      </div>
    </div>

    <!-- Form -->
    <div class="gp-card">
      <div class="gp-header">
        <div class="gp-header-icon"><i class="pi pi-lock"></i></div>
        <div>
          <h4 class="gp-title">Ganti Password</h4>
          <p class="gp-subtitle">Perbarui password akun Anda</p>
        </div>
      </div>

      <Divider />

      <div class="gp-user-info">
        <i class="pi pi-user gp-user-icon"></i>
        <div>
          <div class="gp-user-name">{{ auth.user?.name || auth.userId }}</div>
          <div class="gp-user-label">Pengguna aktif</div>
        </div>
      </div>

      <form class="gp-form" @submit.prevent="submit">
        <div class="gp-field">
          <label class="gp-label"><i class="pi pi-key"></i> Password Lama</label>
          <Password
            v-model="form.password_lama"
            :feedback="false"
            toggleMask
            placeholder="Masukkan password lama"
            fluid
            :invalid="!!errors.password_lama"
          />
          <small v-if="errors.password_lama" class="gp-error">{{ errors.password_lama }}</small>
        </div>

        <div class="gp-field">
          <label class="gp-label"><i class="pi pi-lock"></i> Password Baru</label>
          <Password
            v-model="form.password_baru"
            toggleMask
            placeholder="Minimal 6 karakter"
            fluid
            :invalid="!!errors.password_baru"
            promptLabel="Masukkan password"
            weakLabel="Lemah"
            mediumLabel="Sedang"
            strongLabel="Kuat"
          />
          <small v-if="errors.password_baru" class="gp-error">{{ errors.password_baru }}</small>
        </div>

        <div class="gp-field">
          <label class="gp-label"><i class="pi pi-check-circle"></i> Konfirmasi Password Baru</label>
          <Password
            v-model="form.konfirmasi"
            :feedback="false"
            toggleMask
            placeholder="Ulangi password baru"
            fluid
            :invalid="!!errors.konfirmasi"
          />
          <small v-if="errors.konfirmasi" class="gp-error">{{ errors.konfirmasi }}</small>
        </div>

        <div class="gp-actions">
          <Button label="Batal" icon="pi pi-times" severity="secondary" outlined :disabled="loading" @click="resetForm" />
          <Button type="submit" label="Simpan Password" icon="pi pi-check" severity="success" :loading="loading" />
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.gp-layout {
  display: flex;
  gap: 1.5rem;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  align-items: flex-start;
}

.gp-guide,
.gp-card {
  background: var(--p-content-background, #fff);
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  padding: 1.5rem;
}

.gp-guide {
  flex: 1;
  min-width: 0;
}

.gp-card {
  width: 100%;
  max-width: 420px;
  flex-shrink: 0;
  padding: 2rem;
}

.gp-guide-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 1.2rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid var(--p-content-border-color, #e5e7eb);
}

.gp-guide-header i,
.gp-guide-title i,
.gp-label i,
.gp-user-icon {
  color: var(--p-primary-color, #0d9488);
}

.gp-guide-section {
  margin-bottom: 1.2rem;
}

.gp-guide-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.gp-guide-text {
  font-size: 13px;
  color: var(--p-text-muted-color, #6b7280);
  line-height: 1.7;
  margin: 0;
}

.gp-guide-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gp-guide-list li {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.gp-guide-list li i {
  color: #16a34a;
  font-size: 12px;
  flex-shrink: 0;
}

.gp-guide-steps {
  padding-left: 1.2rem;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  line-height: 1.6;
}

.gp-guide-warning {
  display: flex;
  gap: 10px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: #92400e;
  line-height: 1.6;
}

.gp-guide-warning i {
  color: #f97316;
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

.gp-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.gp-header-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--p-primary-color, #0d9488);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  flex-shrink: 0;
}

.gp-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.gp-subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--p-text-muted-color, #6b7280);
}

.gp-user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 1.5rem;
}

.gp-user-icon {
  font-size: 22px;
}

.gp-user-name {
  font-weight: 600;
  font-size: 14px;
}

.gp-user-label {
  font-size: 11px;
  color: var(--p-text-muted-color, #6b7280);
}

.gp-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.gp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gp-label {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.gp-error {
  color: #ef4444;
  font-size: 12px;
}

.gp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 0.5rem;
}

@media (max-width: 768px) {
  .gp-layout {
    flex-direction: column-reverse;
  }

  .gp-card {
    max-width: 100%;
  }
}
</style>
