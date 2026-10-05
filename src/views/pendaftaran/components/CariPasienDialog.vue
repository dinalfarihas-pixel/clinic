<script setup>
import { ref } from 'vue'

const visible = defineModel('visible', { type: Boolean, default: false })

defineProps({
  pasien: { type: Object, required: true },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['cari', 'pasien-baru', 'lanjut'])

const modeOptions = [
  { label: 'No. RM', value: 'rm', placeholder: 'Contoh: 000231' },
  { label: 'No. BPJS / NIK', value: 'bpjs', placeholder: 'Nomor kartu BPJS atau NIK' }
]
const mode = ref('rm')
const keyword = ref('')

const placeholder = () => modeOptions.find((m) => m.value === mode.value)?.placeholder

function cari() {
  emit('cari', { mode: mode.value, keyword: keyword.value.trim() })
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    header="Cari pasien"
    modal
    :style="{ width: '40rem' }"
    :breakpoints="{ '1199px': '75vw', '575px': '94vw' }"
  >
    <form class="search" @submit.prevent="cari">
      <SelectButton
        v-model="mode"
        :options="modeOptions"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        class="search__mode"
      />
      <div class="search__row">
        <IconField class="search__input">
          <InputIcon class="pi pi-search" />
          <InputText v-model="keyword" :placeholder="placeholder()" autofocus fluid />
        </IconField>
        <Button type="submit" label="Cari" icon="pi pi-search" :loading="loading" />
      </div>
      <p class="search__hint">Belum pernah berobat? Daftarkan sebagai pasien baru.</p>
    </form>

    <div v-if="pasien.nama" class="result">
      <div class="result__head">
        <div>
          <p class="result__name">{{ pasien.nama }}</p>
          <p class="result__meta">
            RM {{ pasien.noMR || '—' }}
            <template v-if="pasien.tglLahirText"> · {{ pasien.tglLahirText }}</template>
            <template v-if="pasien.umur"> · {{ pasien.umur }}</template>
          </p>
        </div>
        <Tag
          v-if="pasien.noKartu"
          :value="pasien.statusPeserta?.keterangan || 'BPJS'"
          :severity="pasien.statusPeserta?.keterangan === 'AKTIF' ? 'success' : 'danger'"
        />
        <Tag v-else value="Non-BPJS" severity="secondary" />
      </div>
      <dl class="result__grid">
        <div>
          <dt>No. kartu BPJS</dt>
          <dd>{{ pasien.noKartu || '—' }}</dd>
        </div>
        <div>
          <dt>NIK</dt>
          <dd>{{ pasien.nik || '—' }}</dd>
        </div>
        <div>
          <dt>Jenis peserta</dt>
          <dd>{{ pasien.jenisPeserta?.keterangan || '—' }}</dd>
        </div>
        <div>
          <dt>Faskes tingkat I</dt>
          <dd>{{ pasien.provUmum?.nmProvider || '—' }}</dd>
        </div>
      </dl>
    </div>

    <template #footer>
      <Button label="Pasien baru" icon="pi pi-user-plus" severity="secondary" outlined @click="emit('pasien-baru')" />
      <Button
        label="Lanjutkan"
        icon="pi pi-arrow-right"
        iconPos="right"
        :disabled="!pasien.nama"
        @click="emit('lanjut')"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.search {
  display: grid;
  gap: 0.75rem;
}
.search__row {
  display: flex;
  gap: 0.5rem;
}
.search__input {
  flex: 1;
}
.search__hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

.result {
  margin-top: 1.25rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  overflow: hidden;
}
.result__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  background: var(--app-bg);
}
.result__name {
  margin: 0;
  font-weight: 700;
}
.result__meta {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}
.result__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  margin: 0;
  padding: 0.875rem 1rem;
}
.result__grid dt {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.result__grid dd {
  margin: 0.125rem 0 0;
  font-weight: 500;
  word-break: break-word;
}

@media (max-width: 575px) {
  .result__grid {
    grid-template-columns: 1fr;
  }
}
</style>
