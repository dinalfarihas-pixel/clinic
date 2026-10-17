<script setup>
import { computed } from 'vue'
import { menuBisaDiatur, ROLE_ADMIN, ROLE_USER } from '@/config/akses'

const role = defineModel('role', { type: String, default: ROLE_USER })
const akses = defineModel('akses', { type: Array, default: () => [] })

const peran = [
  { value: ROLE_ADMIN, label: 'Admin', hint: 'Akses ke semua menu, termasuk Pengguna & Pengaturan.' },
  { value: ROLE_USER, label: 'User', hint: 'Hanya menu yang dicentang di bawah (Dashboard selalu tersedia).' }
]

// Kelompokkan menu per grup (Farmasi, Master Data, …) atau section bila tidak punya grup
const kelompok = computed(() => {
  const peta = new Map()
  for (const m of menuBisaDiatur()) {
    const nama = m.grup || m.section
    if (!peta.has(nama)) peta.set(nama, [])
    peta.get(nama).push(m)
  }
  return [...peta].map(([nama, items]) => ({ nama, items }))
})

const semuaKey = computed(() => menuBisaDiatur().map((m) => m.key))
const semuaTerpilih = computed(() => semuaKey.value.every((k) => akses.value.includes(k)))

function toggleSemua() {
  akses.value = semuaTerpilih.value ? [] : [...semuaKey.value]
}

function toggleKelompok(k) {
  const keys = k.items.map((m) => m.key)
  const penuh = keys.every((x) => akses.value.includes(x))
  akses.value = penuh ? akses.value.filter((x) => !keys.includes(x)) : [...new Set([...akses.value, ...keys])]
}
</script>

<template>
  <div class="picker">
    <div class="field">
      <label>Peran</label>
      <SelectButton v-model="role" :options="peran" optionLabel="label" optionValue="value" :allowEmpty="false" />
      <small class="hint">{{ peran.find((p) => p.value === role)?.hint }}</small>
    </div>

    <div v-if="role === ROLE_USER" class="menus">
      <div class="menus__head">
        <strong>Hak akses menu</strong>
        <Button type="button" :label="semuaTerpilih ? 'Kosongkan semua' : 'Pilih semua'" size="small" text @click="toggleSemua" />
      </div>
      <div v-for="k in kelompok" :key="k.nama" class="group">
        <div class="group__head">
          <span>{{ k.nama }}</span>
          <Button type="button" label="Semua" size="small" text severity="secondary" @click="toggleKelompok(k)" />
        </div>
        <div class="group__items">
          <label v-for="m in k.items" :key="m.key" class="check">
            <Checkbox v-model="akses" :value="m.key" :inputId="`hk-${m.key}`" />
            <span>{{ m.label }}</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
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
.hint {
  color: var(--app-text-muted);
  font-size: 0.8125rem;
}
.menus {
  display: grid;
  gap: 0.75rem;
  max-height: 22rem;
  overflow-y: auto;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
}
.menus__head,
.group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.group__head {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--app-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.group__items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem 1rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
}
@media (max-width: 575px) {
  .group__items {
    grid-template-columns: 1fr;
  }
}
</style>
