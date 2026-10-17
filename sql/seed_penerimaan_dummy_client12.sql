-- =====================================================================
-- Seed penerimaan barang DUMMY (id_client 12) untuk obat di tabel `barang`
-- Jalankan SETELAH seed_master_obat_client12.sql.
--
-- Meniru alur PenerimaanV3::save_penerimaan_tanpa_sp (M_penerimaan_v3) tanpa lewat API:
--   t_penerimaan_header  -> 5 penerimaan (3 supplier dummy), tanggal mundur tiap 3 hari
--   t_stock_barang       -> 1 batch per obat (stok masuk di gudang induk)
--   t_penerimaan_detail  -> baris penerimaan per obat
--   t_stock_card         -> kartu stok "IN / PENERIMAAN"
-- Obat yang dimasukkan: semua obat aktif (OBAT-OBATAN) klien ini yang BELUM punya stok
-- di gudang induk, jadi aman dijalankan ulang (obat yang sudah ber-stok dilewati).
--
-- Nilai: qty = 3 x stok minimum (min. 60) satuan kecil; harga pokok = HARGABELI barang;
-- harga jual = HARGAJUAL barang; tanpa pajak & diskon; pembayaran KREDIT (IDPAYMENT 3,
-- jatuh tempo +30 hari, belum lunas) sehingga tidak membuat mutasi buku kas.
-- =====================================================================
SET @IDCLIENT := 12;
SET @USER_ID  := 'admin';   -- ganti dengan user_id yang ada di sistem
SET @ID_LOKASI := (SELECT ID FROM m_lokasi WHERE IDCLIENT = @IDCLIENT AND INDUK = 1 ORDER BY ID LIMIT 1);

-- Harus terisi (bukan NULL). Bila NULL, klien ini belum punya gudang induk -> hentikan.
SELECT @ID_LOKASI AS id_lokasi_gudang_induk;

-- ---------------------------------------------------------------------
-- 1) Supplier dummy (dibuat hanya bila namanya belum ada)
-- ---------------------------------------------------------------------
INSERT INTO m_supplier (NAMASUPLIER, KOTA, ALAMAT, NOHP, CATATAN, IDCLIENT)
SELECT 'PT DUMMY FARMA SEJAHTERA', 'Banda Aceh', 'Jl. Contoh No. 1', '081200000001', 'Data dummy', @IDCLIENT FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM m_supplier WHERE IDCLIENT = @IDCLIENT AND NAMASUPLIER = 'PT DUMMY FARMA SEJAHTERA');
INSERT INTO m_supplier (NAMASUPLIER, KOTA, ALAMAT, NOHP, CATATAN, IDCLIENT)
SELECT 'PT DUMMY MEDIKA UTAMA', 'Medan', 'Jl. Contoh No. 2', '081200000002', 'Data dummy', @IDCLIENT FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM m_supplier WHERE IDCLIENT = @IDCLIENT AND NAMASUPLIER = 'PT DUMMY MEDIKA UTAMA');
INSERT INTO m_supplier (NAMASUPLIER, KOTA, ALAMAT, NOHP, CATATAN, IDCLIENT)
SELECT 'PT DUMMY SEHAT BERSAMA', 'Meulaboh', 'Jl. Contoh No. 3', '081200000003', 'Data dummy', @IDCLIENT FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM m_supplier WHERE IDCLIENT = @IDCLIENT AND NAMASUPLIER = 'PT DUMMY SEHAT BERSAMA');

SET @S1 := (SELECT MIN(IDSUPLIER) FROM m_supplier WHERE IDCLIENT = @IDCLIENT AND NAMASUPLIER = 'PT DUMMY FARMA SEJAHTERA');
SET @S2 := (SELECT MIN(IDSUPLIER) FROM m_supplier WHERE IDCLIENT = @IDCLIENT AND NAMASUPLIER = 'PT DUMMY MEDIKA UTAMA');
SET @S3 := (SELECT MIN(IDSUPLIER) FROM m_supplier WHERE IDCLIENT = @IDCLIENT AND NAMASUPLIER = 'PT DUMMY SEHAT BERSAMA');

-- ---------------------------------------------------------------------
-- 2) Daftar item penerimaan: obat aktif yang belum punya stok, dibagi rata ke 5 penerimaan
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_pen;
CREATE TEMPORARY TABLE tmp_pen (
  rn          INT NOT NULL PRIMARY KEY,
  grp         INT NOT NULL,            -- nomor penerimaan 1..5
  seq         INT NOT NULL,            -- urutan baris dalam penerimaan
  IDBARANG    VARCHAR(30) NOT NULL,
  qty         INT NOT NULL,            -- satuan kecil
  harga       DECIMAL(15,2) NOT NULL,  -- harga pokok per satuan kecil
  jual        DECIMAL(15,2) NOT NULL,  -- harga jual per satuan kecil
  batch       VARCHAR(30) NOT NULL,
  exp_date    DATE NOT NULL,
  sub_barcode VARCHAR(10) NULL
);

SET @r := 0;
INSERT INTO tmp_pen (rn, grp, seq, IDBARANG, qty, harga, jual, batch, exp_date)
SELECT @r := @r + 1,
       MOD(@r - 1, 5) + 1,
       FLOOR((@r - 1) / 5) + 1,
       b.IDBARANG,
       GREATEST(b.STOCKMINIMUM, 20) * 3,
       b.HARGABELI,
       IF(b.HARGAJUAL > 0, b.HARGAJUAL, b.HARGABELI),
       CONCAT('BTC', DATE_FORMAT(CURDATE(), '%y%m'), LPAD(@r, 3, '0')),
       DATE_ADD(CURDATE(), INTERVAL 12 + MOD(@r, 24) MONTH)
FROM (
  SELECT IDBARANG, STOCKMINIMUM, HARGABELI, HARGAJUAL
  FROM barang x
  WHERE x.IDCLIENT = @IDCLIENT AND x.KATEGORI = 'OBAT-OBATAN' AND x.DELETED = 0 AND x.ARSIPKAN = 0
    AND x.HARGABELI > 0
    AND NOT EXISTS (SELECT 1 FROM t_stock_barang s
                    WHERE s.BARCODE = x.IDBARANG AND s.IDCLIENT = @IDCLIENT
                      AND s.ID_LOKASI = @ID_LOKASI AND s.DELETED = 0)
  ORDER BY x.IDBARANG
) b;

-- Pratinjau item yang akan diterima (jumlah per penerimaan)
SELECT grp AS penerimaan, COUNT(*) AS jumlah_item, SUM(qty * harga) AS total FROM tmp_pen GROUP BY grp ORDER BY grp;

-- ---------------------------------------------------------------------
-- 3) Stok batch (t_stock_barang). SUB_BARCODE = nomor 7 digit melanjutkan ID terbesar,
--    ID diisi sama dengan nomornya agar penomoran berikutnya dari aplikasi tetap konsisten.
-- ---------------------------------------------------------------------
SET @sb := (SELECT IFNULL(MAX(ID), 0) FROM t_stock_barang);
UPDATE tmp_pen SET sub_barcode = LPAD(@sb := @sb + 1, 7, '0') ORDER BY rn;

INSERT INTO t_stock_barang
  (ID, IDBARANG, SUB_BARCODE, BARCODE, QTY, BATCH_NUMBER, ID_LOKASI, TGL_EXPIRED, USE_EXP,
   HARGA, HARGAJUAL, HARGAJUAL_SEDANG, HARGAJUAL_BESAR, IDCLIENT, LAST_TRANSACTION)
SELECT CAST(sub_barcode AS UNSIGNED), IDBARANG, sub_barcode, IDBARANG, qty, batch, @ID_LOKASI, exp_date, 1,
       harga, jual, NULL, NULL, @IDCLIENT, NOW()
FROM tmp_pen ORDER BY rn;

-- ---------------------------------------------------------------------
-- 4) Header penerimaan. ID_penerimanaan = id_client + nomor urut 10 digit (cth. 120000000001)
-- ---------------------------------------------------------------------
SET @pen0 := (SELECT IFNULL(MAX(ID_No), 0) FROM t_penerimaan_header WHERE IDCLIENT = @IDCLIENT);

INSERT INTO t_penerimaan_header
  (ID_No, ID_penerimanaan, SUPPLIER, TANGGAL, NO_REFF, USER_ID, SUB_TOTAL, PAJAK, GRAND_TOTAL,
   pajak_include, IDPAYMENT, MODIF_DATE, ID_LOKASI, JATUH_TEMPO, STATUS_LUNAS, LAMPIRAN, IDCLIENT, id_pemesanan)
SELECT @pen0 + g.grp,
       CONCAT(@IDCLIENT, LPAD(@pen0 + g.grp, 10, '0')),
       ELT(MOD(g.grp - 1, 3) + 1, @S1, @S2, @S3),
       DATE_SUB(CURDATE(), INTERVAL (6 - g.grp) * 3 DAY),
       CONCAT('FKT-DUMMY-', LPAD(g.grp, 3, '0')),
       @USER_ID, g.total, 0, g.total,
       0, 3, DATE_SUB(CURDATE(), INTERVAL (6 - g.grp) * 3 DAY), @ID_LOKASI,
       DATE_ADD(DATE_SUB(CURDATE(), INTERVAL (6 - g.grp) * 3 DAY), INTERVAL 30 DAY), 0, '', @IDCLIENT, NULL
FROM (SELECT grp, SUM(qty * harga) AS total FROM tmp_pen GROUP BY grp) g
ORDER BY g.grp;

-- ---------------------------------------------------------------------
-- 5) Detail penerimaan
-- ---------------------------------------------------------------------
INSERT INTO t_penerimaan_detail
  (ID_PENERIMAAN, ID_BARANG, SUB_BARCODE, BARCODE, QTY, HARGA_POKOK, BACTH_NUMBER, EXP_DATE,
   HARGA_TOTAL, ITEMSEQNO, diskon)
SELECT CONCAT(@IDCLIENT, LPAD(@pen0 + grp, 10, '0')), IDBARANG, sub_barcode, IDBARANG, qty, harga, batch, exp_date,
       qty * harga, seq, 0
FROM tmp_pen ORDER BY rn;

-- ---------------------------------------------------------------------
-- 6) Kartu stok (IN / PENERIMAAN). SALDO = total stok obat itu di gudang induk.
-- ---------------------------------------------------------------------
INSERT INTO t_stock_card
  (CAPTION, JENIS_TRANS, SUB_BARCODE, BARCODE, ITEM_SEQNO, TANGGAL_TRANS, QTY, HARGA_SATUAN,
   SALDO, SALDO_SUB, STATUS, REFF_NUMBER, ID_CLIENT, ID_LOKASI)
SELECT 'PENERIMAAN', 'IN', p.sub_barcode, p.IDBARANG, p.seq,
       CONCAT(DATE_SUB(CURDATE(), INTERVAL (6 - p.grp) * 3 DAY), ' 09:00:00'),
       p.qty, p.harga,
       (SELECT IFNULL(SUM(s.QTY), 0) FROM t_stock_barang s
         WHERE s.BARCODE = p.IDBARANG AND s.ID_LOKASI = @ID_LOKASI AND s.IDCLIENT = @IDCLIENT),
       p.qty, '', CONCAT(@IDCLIENT, LPAD(@pen0 + p.grp, 10, '0')), @IDCLIENT, @ID_LOKASI
FROM tmp_pen p ORDER BY p.rn;

-- ---------------------------------------------------------------------
-- Cek hasil: jumlah baris harus sama di keempat tabel
-- ---------------------------------------------------------------------
-- (tabel sementara hanya boleh dipakai sekali per query, jadi jumlahnya diambil ke variabel dulu)
SET @jml_item := (SELECT COUNT(*) FROM tmp_pen);
SELECT
  @jml_item AS item_dimasukkan,
  (SELECT COUNT(*) FROM t_stock_barang WHERE IDCLIENT = @IDCLIENT AND CAST(SUB_BARCODE AS UNSIGNED) > @sb - @jml_item) AS stok_baru,
  (SELECT COUNT(*) FROM t_penerimaan_detail WHERE ID_PENERIMAAN IN (SELECT ID_penerimanaan FROM t_penerimaan_header WHERE IDCLIENT = @IDCLIENT AND ID_No > @pen0)) AS detail_baru,
  (SELECT COUNT(*) FROM t_penerimaan_header WHERE IDCLIENT = @IDCLIENT AND ID_No > @pen0) AS header_baru;

DROP TEMPORARY TABLE IF EXISTS tmp_pen;
