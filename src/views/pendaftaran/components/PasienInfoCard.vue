<script setup>
import { computed } from 'vue'

const props = defineProps({
  pasien: { type: Object, required: true }
})

const hasPasien = computed(() => !!props.pasien.nama)
const isAktif = computed(() => props.pasien.statusPeserta?.keterangan === 'AKTIF')

const genderText = (sex) => (sex === 'P' ? 'Perempuan' : sex === 'L' ? 'Laki-laki' : null)
const genderIcon = (sex) => (sex === 'P' ? 'pi pi-venus' : sex === 'L' ? 'pi pi-mars' : 'pi pi-user')

const rows = computed(() => [
  { label: 'No. RM', value: props.pasien.noMR, icon: 'pi pi-folder-open', mono: true },
  { label: 'NIK', value: props.pasien.nik, icon: 'pi pi-id-card', mono: true },
  { label: 'Jenis kelamin', value: genderText(props.pasien.sex), icon: genderIcon(props.pasien.sex) },
  { label: 'Tanggal lahir', value: props.pasien.tglLahirText, icon: 'pi pi-calendar' },
  { label: 'No. telepon', value: props.pasien.noTelepon, icon: 'pi pi-phone' },
  { label: 'Faskes tingkat I', value: props.pasien.provUmum?.nmProvider, icon: 'pi pi-building' },
  { label: 'Hak kelas', value: props.pasien.hakKelas?.keterangan, icon: 'pi pi-star' }
])
</script>

<template>
  <section class="panel pasien-card">
    <header class="panel__header">
      <h2 class="panel__title">Informasi pasien</h2>
    </header>

    <div class="identity" :class="{ 'identity--empty': !hasPasien }">
      <div class="identity__avatar">
        <span v-if="hasPasien">{{ pasien.nama.charAt(0).toUpperCase() }}</span>
        <i v-else class="pi pi-user" />
      </div>
      <div class="identity__info">
        <p class="identity__name">{{ pasien.nama || 'Belum ada pasien' }}</p>
        <p v-if="pasien.noKartu" class="identity__kartu">BPJS {{ pasien.noKartu }}</p>
        <Tag
          v-if="pasien.noKartu"
          :value="pasien.statusPeserta?.keterangan || 'Status tidak diketahui'"
          :severity="isAktif ? 'success' : 'danger'"
          :icon="isAktif ? 'pi pi-check-circle' : 'pi pi-times-circle'"
          class="identity__tag"
        />
        <Tag v-else-if="hasPasien" value="Non-BPJS" severity="secondary" class="identity__tag" />
      </div>
    </div>

    <ul v-if="hasPasien" class="info-list">
      <li v-for="row in rows" :key="row.label" class="info-list__row">
        <i :class="row.icon" class="info-list__icon" />
        <div class="info-list__body">
          <span class="info-list__label">{{ row.label }}</span>
          <span class="info-list__value" :class="{ mono: row.mono }">{{ row.value || '—' }}</span>
        </div>
      </li>
    </ul>

    <div v-else class="empty">
      <i class="pi pi-search empty__icon" />
      <p>Cari pasien untuk menampilkan informasinya di sini.</p>
    </div>
  </section>
</template>

<style scoped>
.pasien-card {
  padding: 0;
  overflow: hidden;
}
.pasien-card .panel__header {
  padding: 1rem 1.25rem 0;
}

.identity {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.75rem 1.25rem 1rem;
  border-bottom: 1px solid var(--app-border);
}
.identity--empty {
  opacity: 0.6;
}
.identity__avatar {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  font-size: 1.25rem;
  font-weight: 700;
}
.identity--empty .identity__avatar {
  background: var(--app-bg);
  color: var(--app-text-muted);
}
.identity__info {
  min-width: 0;
}
.identity__name {
  margin: 0;
  font-weight: 700;
  line-height: 1.3;
}
.identity__kartu {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
}
.identity__tag {
  margin-top: 0.375rem;
  font-size: 0.75rem;
}

.info-list {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0;
}
.info-list__row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.5rem 1.25rem;
}
.info-list__icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: var(--app-radius);
  background: var(--p-primary-50);
  color: var(--p-primary-color);
  font-size: 0.875rem;
}
:global(.app-dark) .info-list__icon {
  background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
}
.info-list__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.info-list__label {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.info-list__value {
  font-weight: 500;
  word-break: break-word;
}
.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.empty {
  padding: 2rem 1.25rem;
  text-align: center;
  color: var(--app-text-muted);
}
.empty__icon {
  font-size: 1.75rem;
  color: var(--p-primary-color);
  margin-bottom: 0.5rem;
}
.empty p {
  margin: 0;
  font-size: 0.875rem;
}
</style>
