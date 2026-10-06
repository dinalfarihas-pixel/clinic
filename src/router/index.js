import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { useAuthStore } from '@/stores/auth'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'Klinik'
const Placeholder = () => import('@/views/PlaceholderView.vue')

/**
 * meta.title      : judul halaman (tampil di header halaman & tab browser)
 * meta.breadcrumb : array label untuk breadcrumb di navbar
 * meta.public     : true jika halaman bisa diakses tanpa login
 */
const routes = [
  {
    path: '/',
    component: MainLayout,
    children: [
      { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: 'Dashboard', breadcrumb: ['Dashboard'] } },
      { path: 'antrian', name: 'antrian', component: Placeholder, meta: { title: 'Antrian', breadcrumb: ['Antrian'] } },
      { path: 'pendaftaran', name: 'pendaftaran', component: () => import('@/views/pendaftaran/PendaftaranView.vue'), meta: { title: 'Pendaftaran Pasien', breadcrumb: ['Pelayanan', 'Pendaftaran'] } },
      { path: 'data-pasien', name: 'data-pasien', component: () => import('@/views/pasien/DataPasienView.vue'), meta: { title: 'Data Pasien', breadcrumb: ['Pelayanan', 'Data Pasien'] } },
      { path: 'riwayat-pendaftaran', name: 'riwayat-pendaftaran', component: () => import('@/views/pendaftaran/RiwayatPendaftaranView.vue'), meta: { title: 'Riwayat Pendaftaran', breadcrumb: ['Pelayanan', 'Riwayat Pendaftaran'] } },
      { path: 'rawat-jalan/:kode?', name: 'rawat-jalan', component: () => import('@/views/poliklinik/PasienPoliView.vue'), meta: { title: 'Pasien Poliklinik', breadcrumb: ['Rawat Jalan', 'Pasien Poliklinik'] } },
      { path: 'pemeriksaan/:noreg', name: 'pemeriksaan', component: () => import('@/views/poliklinik/PemeriksaanView.vue'), meta: { title: 'Pemeriksaan Pasien', breadcrumb: ['Rawat Jalan', 'Pemeriksaan (SOAP)'] } },
      { path: 'rekam-medis', name: 'rekam-medis', component: Placeholder, meta: { title: 'Rekam Medis', breadcrumb: ['Pelayanan', 'Rekam Medis'] } },
      { path: 'laboratorium', name: 'laboratorium', component: Placeholder, meta: { title: 'Laboratorium', breadcrumb: ['Pelayanan', 'Laboratorium'] } },
      { path: 'farmasi/resep', name: 'farmasi-resep', component: () => import('@/views/farmasi/ResepMasukView.vue'), meta: { title: 'Resep Masuk', breadcrumb: ['Farmasi', 'Resep Masuk'] } },
      { path: 'farmasi/resep/:trans/proses', name: 'farmasi-resep-proses', component: () => import('@/views/farmasi/ProsesResepView.vue'), meta: { title: 'Proses Resep', breadcrumb: ['Farmasi', 'Resep Masuk', 'Proses'] } },
      { path: 'farmasi/stok', name: 'farmasi-stok', component: () => import('@/views/farmasi/StokObatView.vue'), meta: { title: 'Stok Obat', breadcrumb: ['Farmasi', 'Stok Obat'] } },
      { path: 'farmasi/pesanan', name: 'farmasi-pesanan', component: () => import('@/views/farmasi/PemesananView.vue'), meta: { title: 'Surat Pesanan Obat', breadcrumb: ['Farmasi', 'Surat Pesanan Obat'] } },
      { path: 'farmasi/pesanan/baru', name: 'farmasi-pesanan-baru', component: () => import('@/views/farmasi/PemesananFormView.vue'), meta: { title: 'Tambah Surat Pesanan', breadcrumb: ['Farmasi', 'Surat Pesanan Obat', 'Tambah'] } },
      { path: 'farmasi/pesanan/:id/edit', name: 'farmasi-pesanan-edit', component: () => import('@/views/farmasi/PemesananFormView.vue'), meta: { title: 'Edit Surat Pesanan', breadcrumb: ['Farmasi', 'Surat Pesanan Obat', 'Edit'] } },
      { path: 'farmasi/penerimaan', name: 'farmasi-penerimaan', component: () => import('@/views/farmasi/PenerimaanView.vue'), meta: { title: 'Penerimaan Barang', breadcrumb: ['Farmasi', 'Penerimaan Barang'] } },
      { path: 'farmasi/penerimaan/langsung', name: 'farmasi-penerimaan-langsung', component: () => import('@/views/farmasi/PenerimaanLangsungView.vue'), meta: { title: 'Penerimaan Langsung', breadcrumb: ['Farmasi', 'Penerimaan Barang', 'Langsung'] } },
      { path: 'farmasi/penerimaan/:idPemesanan/terima', name: 'farmasi-penerimaan-terima', component: () => import('@/views/farmasi/PenerimaanTerimaView.vue'), meta: { title: 'Terima Barang', breadcrumb: ['Farmasi', 'Penerimaan Barang', 'Terima'] } },
      { path: 'penjualan', name: 'penjualan', component: () => import('@/views/penjualan/KasirPenjualanView.vue'), meta: { title: 'Kasir Penjualan', breadcrumb: ['Penjualan Apotek', 'Kasir Penjualan'] } },
      { path: 'penjualan/riwayat', name: 'penjualan-riwayat', component: () => import('@/views/penjualan/RiwayatPenjualanView.vue'), meta: { title: 'Riwayat Penjualan', breadcrumb: ['Penjualan Apotek', 'Riwayat'] } },
      { path: 'penjualan/kas-lain', name: 'penjualan-kas-lain', component: () => import('@/views/penjualan/KasLainView.vue'), meta: { title: 'Kas Lain', breadcrumb: ['Penjualan Apotek', 'Kas Lain'] } },
      { path: 'kasir', name: 'kasir', component: () => import('@/views/keuangan/KasirView.vue'), meta: { title: 'Kasir', breadcrumb: ['Keuangan', 'Kasir'] } },
      { path: 'laporan', name: 'laporan', component: () => import('@/views/penjualan/LaporanPenjualanView.vue'), meta: { title: 'Laporan', breadcrumb: ['Keuangan', 'Laporan'] } },
      { path: 'master/dokter', name: 'master-dokter', component: () => import('@/views/master/DokterView.vue'), meta: { title: 'Data Dokter', breadcrumb: ['Master Data', 'Dokter'] } },
      { path: 'master/supplier', name: 'master-supplier', component: () => import('@/views/master/SupplierView.vue'), meta: { title: 'Data Supplier', breadcrumb: ['Master Data', 'Supplier'] } },
      { path: 'master/poli', name: 'master-poli', component: () => import('@/views/master/PoliView.vue'), meta: { title: 'Data Poliklinik', breadcrumb: ['Master Data', 'Poliklinik'] } },
      { path: 'master/tarif', name: 'master-tarif', component: () => import('@/views/farmasi/JasaTindakanView.vue'), meta: { title: 'Tindakan & Tarif', breadcrumb: ['Master Data', 'Tindakan & Tarif'] } },
      { path: 'pengguna', name: 'pengguna', component: Placeholder, meta: { title: 'Pengguna', breadcrumb: ['Sistem', 'Pengguna'] } },
      { path: 'pengaturan', name: 'pengaturan', component: Placeholder, meta: { title: 'Pengaturan', breadcrumb: ['Sistem', 'Pengaturan'] } }
    ]
  },
  {
    path: '/',
    component: BlankLayout,
    children: [
      { path: 'login', name: 'login', component: () => import('@/views/auth/LoginView.vue'), meta: { title: 'Masuk', public: true } },
      { path: 'cetak/bukti-pendaftaran/:noreg', name: 'cetak-bukti-pendaftaran', component: () => import('@/views/cetak/BuktiPendaftaranView.vue'), meta: { title: 'Bukti Pendaftaran' } },
      { path: 'cetak/surat-pesanan/:id', name: 'cetak-surat-pesanan', component: () => import('@/views/cetak/SuratPesananView.vue'), meta: { title: 'Surat Pesanan' } },
      { path: 'cetak/struk', name: 'cetak-struk', component: () => import('@/views/cetak/CetakStrukView.vue'), meta: { title: 'Cetak Struk' } },
      { path: 'cetak/resep/:trans', name: 'cetak-resep', component: () => import('@/views/cetak/CetakResepView.vue'), meta: { title: 'Cetak Resep' } },
      { path: 'cetak/billing/:noreg', name: 'cetak-billing', component: () => import('@/views/cetak/CetakBillingView.vue'), meta: { title: 'Cetak Billing' } },
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('@/views/errors/NotFoundView.vue'), meta: { title: 'Halaman tidak ditemukan', public: true } }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  // Sesi dianggap habis jika tidak ada aktivitas selama 3 jam (mis. aplikasi ditinggal idle lalu dibuka lagi)
  if (auth.isLoggedIn && auth.isSessionExpired()) {
    auth.logout()
  }

  if (!to.meta.public && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isLoggedIn) {
    return { name: 'dashboard' }
  }

  if (auth.isLoggedIn) auth.touchActivity()
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME
})

export default router
