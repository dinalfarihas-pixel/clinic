# Klinik App — Vue 3 + PrimeVue 4

## Menjalankan
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # hasil di folder dist/
```

## Struktur
```
src/
├── main.js                  # registrasi PrimeVue, Pinia, Router, Toast, Confirm, Tooltip
├── App.vue
├── theme/preset.js          # warna tema PrimeVue (turunan Aura, primer teal)
├── assets/styles/main.css   # variabel & gaya layout, sidebar, navbar, .page/.panel
├── config/menu.js           # daftar menu sidebar (tambah menu di sini)
├── router/index.js          # route + meta title/breadcrumb + guard login
├── stores/
│   ├── layout.js            # state sidebar (mini/mobile) & dark mode
│   └── auth.js              # user & token (masih dummy)
├── layouts/
│   ├── MainLayout.vue       # sidebar + navbar + konten + footer
│   ├── BlankLayout.vue      # untuk login / 404
│   └── components/
│       ├── AppSidebar.vue
│       ├── AppMenuItem.vue  # item menu rekursif (mendukung submenu)
│       ├── AppNavbar.vue    # toggle, breadcrumb, dark mode, notifikasi, menu user
│       └── AppFooter.vue
└── views/
    ├── DashboardView.vue
    ├── PlaceholderView.vue  # halaman sementara untuk menu yang belum dibuat
    ├── auth/LoginView.vue
    └── errors/NotFoundView.vue
```

## Menambah halaman baru
1. Buat file di `src/views/`, misalnya `views/pendaftaran/PendaftaranView.vue`.
2. Di `router/index.js`, ganti `component: Placeholder` pada route terkait.
3. Jika menu baru, tambahkan di `config/menu.js`.

Komponen PrimeVue ter-import otomatis (unplugin-vue-components), jadi cukup tulis
`<DataTable>`, `<Button>`, dll langsung di template.

Gunakan kelas `.page`, `.page-header`, `.page-title`, `.panel`, `.panel__header`
agar tampilan setiap halaman konsisten.
