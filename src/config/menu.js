/**
 * Definisi menu sidebar.
 * - item dengan `to`    : link ke route
 * - item dengan `items` : grup yang bisa dibuka/tutup (maks. 2 level disarankan)
 * - `section`           : judul kelompok menu
 * - `badge`             : angka kecil di kanan (mis. jumlah antrian)
 * - `dynamic: 'poli'`   : sub-menu diisi dari daftar poli klinik (lihat AppSidebar.vue)
 */
export const menu = [
  {
    section: 'Utama',
    items: [
      { label: 'Dashboard', icon: 'pi pi-home', to: '/' },
      { label: 'Antrian', icon: 'pi pi-ticket', to: '/antrian', badge: 12 }
    ]
  },
  {
    section: 'Pelayanan',
    items: [
      { label: 'Pendaftaran', icon: 'pi pi-user-plus', to: '/pendaftaran' },
      { label: 'Riwayat Pendaftaran', icon: 'pi pi-history', to: '/riwayat-pendaftaran' },
      { label: 'Data Pasien', icon: 'pi pi-address-book', to: '/data-pasien' },
      {
        label: 'Rawat Jalan',
        icon: 'pi pi-heart',
        // Diisi otomatis dari daftar poli klinik (stores/poli.js), tiap poli -> /rawat-jalan/:kode
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
          { label: 'Resep Masuk', to: '/farmasi/resep' },
          { label: 'Stok Obat', to: '/farmasi/stok' },
          { label: 'Surat Pesanan Obat', to: '/farmasi/pesanan' },
          { label: 'Penerimaan Barang', to: '/farmasi/penerimaan' }
        ]
      },
      {
        label: 'Penjualan Apotek',
        icon: 'pi pi-shopping-cart',
        items: [
          { label: 'Kasir Penjualan', to: '/penjualan', exact: true },
          { label: 'Riwayat Penjualan', to: '/penjualan/riwayat' },
          { label: 'Kas Lain', to: '/penjualan/kas-lain' }
        ]
      },
      { label: 'Kasir', icon: 'pi pi-wallet', to: '/kasir' },
      { label: 'Laporan', icon: 'pi pi-chart-bar', to: '/laporan' }
    ]
  },
  {
    section: 'Sistem',
    items: [
      {
        label: 'Master Data',
        icon: 'pi pi-database',
        items: [
          { label: 'Dokter', to: '/master/dokter' },
          { label: 'Poliklinik', to: '/master/poli' },
          { label: 'Tindakan & Tarif', to: '/master/tarif' },
          { label: 'Supplier', to: '/master/supplier' }
        ]
      },
      { label: 'Pengguna', icon: 'pi pi-users', to: '/pengguna' },
      { label: 'Pengaturan', icon: 'pi pi-cog', to: '/pengaturan' }
    ]
  }
]
