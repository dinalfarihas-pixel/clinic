/**
 * API master supplier — ws_posindo_v2.1 (modul inventory, tabel m_suplier).
 * Endpoint sama dengan views/Inventory/Supplier di SIMRS (simrs_spa_v2).
 */
import { apotik } from './http'

/**
 * Daftar semua supplier (inventory/supplier_all).
 * Item: IDSUPLIER, NAMASUPLIER, ALAMAT, KOTA, NOHP, CATATAN.
 */
export async function getDaftarSupplier() {
  const res = await apotik.get('/index.php/api/inventory/supplier_all')
  return Array.isArray(res?.response) ? res.response : []
}

/** Tambah supplier (inventory/supplier_create). */
export async function simpanSupplier(supplier) {
  await apotik.post('/index.php/api/inventory/supplier_create', {}, payloadSupplier(supplier))
}

/** Ubah supplier (inventory/supplier_update/:id). `supplier.IDSUPLIER` wajib. */
export async function updateSupplier(supplier) {
  await apotik.post(`/index.php/api/inventory/supplier_update/${supplier.IDSUPLIER}`, {}, payloadSupplier(supplier))
}

/** Hapus supplier (inventory/supplier_delete/:id). */
export async function hapusSupplier(idSuplier) {
  await apotik.post(`/index.php/api/inventory/supplier_delete/${idSuplier}`, {})
}

function payloadSupplier(supplier) {
  return {
    NAMASUPLIER: supplier.NAMASUPLIER,
    ALAMAT: supplier.ALAMAT,
    KOTA: supplier.KOTA,
    NOHP: supplier.NOHP,
    CATATAN: supplier.CATATAN || ''
  }
}
