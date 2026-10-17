/**
 * Definisi menu sidebar.
 * - item dengan `to`    : link ke route
 * - item dengan `items` : grup yang bisa dibuka/tutup (maks. 2 level disarankan)
 * - `section`           : judul kelompok menu
 * - `badge`             : angka kecil di kanan (mis. jumlah antrian)
 * - `key`               : kunci hak akses (= nama route); dipilih admin di halaman Pengguna
 * - `adminOnly`         : hanya admin yang boleh melihat/membuka menu ini
 * - `dynamic: 'poli'`   : sub-menu diisi dari daftar poli klinik (lihat AppSidebar.vue)
 */
export const menu = [
  {
    section: 'Utama',
    items: [
      { label: 'Dashboard', icon: 'pi pi-home', key: 'dashboard', to: '/' }
      // Disembunyikan sementara — aktifkan lagi dengan menghapus komentar ini
      // { label: 'Antrian', icon: 'pi pi-ticket', to: '/antrian', badge: 12 }
    ]
  },
  {
    section: 'Pelayanan',
    items: [
      { label: 'Pendaftaran', icon: 'pi pi-user-plus', key: 'pendaftaran', to: '/pendaftaran' },
      { label: 'Riwayat Pendaftaran', icon: 'pi pi-history', key: 'riwayat-pendaftaran', to: '/riwayat-pendaftaran' },
      { label: 'Data Pasien', icon: 'pi pi-address-book', key: 'data-pasien', to: '/data-pasien' },
      {
        label: 'Rawat Jalan',
        icon: 'pi pi-heart',
        // Diisi otomatis dari daftar poli klinik (stores/poli.js), tiap poli -> /rawat-jalan/:kode
        key: 'rawat-jalan',
        dynamic: 'poli',
        items: []
      }
    ]
  },
  {
    section: 'Farmasi & Keuangan',
    items: [
      {
        label: 'Farmasi',
        icon: 'pi pi-box',
        items: [
          { label: 'Resep Masuk', key: 'farmasi-resep', to: '/farmasi/resep' },
          { label: 'Stok Obat', key: 'farmasi-stok', to: '/farmasi/stok' },
          { label: 'Surat Pesanan Obat', key: 'farmasi-pesanan', to: '/farmasi/pesanan' },
          { label: 'Penerimaan Barang', key: 'farmasi-penerimaan', to: '/farmasi/penerimaan' },
          { label: 'Stock Opname', key: 'farmasi-opname', to: '/farmasi/opname', exact: true },
          { label: 'Riwayat Opname', key: 'farmasi-opname-riwayat', to: '/farmasi/opname/riwayat' }
        ]
      },
      {
        label: 'Penjualan Apotek',
        icon: 'pi pi-shopping-cart',
        items: [
          { label: 'Kasir Penjualan', key: 'penjualan', to: '/penjualan', exact: true },
          { label: 'Riwayat Penjualan', key: 'penjualan-riwayat', to: '/penjualan/riwayat' },
          { label: 'Kas Lain', key: 'penjualan-kas-lain', to: '/penjualan/kas-lain' }
        ]
      },
      { label: 'Kasir', icon: 'pi pi-wallet', key: 'kasir', to: '/kasir' },
      { label: 'Laporan', icon: 'pi pi-chart-bar', key: 'laporan', to: '/laporan' }
    ]
  },
  {
    section: 'Sistem',
    items: [
      {
        label: 'Master Data',
        icon: 'pi pi-database',
        items: [
          { label: 'Dokter', key: 'master-dokter', to: '/master/dokter' },
          { label: 'Jadwal Dokter', key: 'master-jadwal-dokter', to: '/master/jadwal-dokter' },
          { label: 'Poliklinik', key: 'master-poli', to: '/master/poli' },
          { label: 'Tindakan & Tarif', key: 'master-tarif', to: '/master/tarif' },
          { label: 'Supplier', key: 'master-supplier', to: '/master/supplier' },
          { label: 'Format Surat', key: 'master-format-surat', to: '/master/format-surat' },
          { label: 'Migrasi Barang & Stok', key: 'master-migrasi-barang', to: '/master/migrasi-barang' }
        ]
      },
      { label: 'Pengguna', icon: 'pi pi-users', key: 'pengguna', adminOnly: true, to: '/pengguna' },
      { label: 'Pengaturan', icon: 'pi pi-cog', key: 'pengaturan', adminOnly: true, to: '/pengaturan' }
    ]
  }
]

/** Semua item menu yang punya `key` (rata, tanpa grup/section) — dipakai halaman hak akses & guard router. */
export function semuaItemMenu() {
  const hasil = []
  const telusuri = (items, section, grup) => {
    for (const it of items) {
      if (it.key) hasil.push({ key: it.key, label: it.label, section, grup, adminOnly: !!it.adminOnly })
      if (it.items?.length) telusuri(it.items, section, it.label)
    }
  }
  menu.forEach((g) => telusuri(g.items, g.section, null))
  return hasil
}
