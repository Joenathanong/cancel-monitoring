# Pending Kiriman IEG

Monitoring order **pending kiriman**: Fulfillment mencatat Order ID + SKU OCS + jumlah yang pending,
Inventory menindaklanjuti (kenapa pending, sudah open PO ke PT Eka Jaya atau belum, barang sudah datang
atau belum, apakah Phase Out / Clearance), dan sistem memantau sendiri **penyelesaian** setiap Order ID
dari OCS — terproses atau batal.

Stack: Next.js 15 · Prisma 6 · TiDB Serverless · deploy Vercel (region sin1). UI mengikuti
`INV IEG/design-ocs.md` v3.1 (Morning/Evening, basis 360px untuk PDT Zebra).

---

## Alur

| Peran | Bisa apa |
|---|---|
| **Fulfillment** | Input pending (satu per satu atau tempel dari Excel), ubah/hapus input sendiri selama belum ditindaklanjuti |
| **Inventory** | Semua halaman + isi tindak lanjut per baris atau per SKU sekaligus |
| **Admin** | Semuanya + Pengaturan, Pengguna, kunci penyelesaian manual |
| **Lihat saja** | Membaca dashboard & monitoring |

1. **Input Pending** (`/input`) — scan/ketik Order ID → sistem langsung memanggil **Find Order** OCS dan
   menampilkan status order, toko, area, dan isi SKU-nya. Ketuk SKU untuk mengisi otomatis, isi jumlah, Simpan.
   Mode **Tempel banyak** menerima tempelan `OrderID ⇥ SKU ⇥ Qty` dari Excel/Sheet.
2. **Monitoring** (`/monitoring`) — semua baris input. Saringan: masih pending / terproses / batal, tanggal input,
   belum ditindaklanjuti, belum open PO, Phase Out/Clearance, umur lewat batas. Klik baris → detail,
   form tindak lanjut, dan **riwayat lengkap** (input, perubahan, tindak lanjut, perubahan status OCS).
3. **Rekap per SKU** (`/rekap-sku`) — SKU yang masih pending, total order & qty, status PO. Tindak lanjut di sini
   berlaku ke semua baris SKU tersebut (praktis saat satu SKU kosong membuat puluhan order pending).
4. **Dashboard KPI** (`/dashboard`) — pilih rentang bulan, lalu ekspor Excel.

## Definisi KPI

- Dihitung **per Order ID** (bukan per baris SKU) dan dikelompokkan menurut **bulan saat Order ID itu pertama
  kali diinput pending** (WIB).
- **Total ID sempat pending** = jumlah Order ID unik yang diinput di bulan itu.
- **Terselesaikan (order terproses)** = status OCS sudah mencapai batas terproses — bawaan **MANIFESTED (20030)**
  ke atas (In Transit, Delivered, Completed, Return ikut terhitung). Batasnya bisa diubah di Pengaturan.
- **Batal** = status OCS **CANCELLED (90000)**, dipecah 3:
  - **Batal ≤ 1 hari** — batal dalam 24 jam
  - **Batal hari ke-2** — setelah 24 jam s/d 48 jam
  - **Batal > 2 hari** — lebih dari 48 jam

  Jam dihitung dari **saat Fulfillment menginput pending** (bawaan) atau dari **saat order dibuat di marketplace**
  — pilih di Pengaturan. Waktu batal diambil dari log status OCS (perubahan pertama ke CANCELLED).
- **Masih pending** = belum terproses dan belum batal (termasuk IN CANCEL yang belum final).
- Order yang tidak ditemukan di OCS tetap "masih pending" sampai Admin menetapkannya manual di detail order.

## Integrasi

### OCS — `ocs.iegsystem.id`
Hanya endpoint BACA, dibongkar dari tombol **Find Order** di halaman Picklist (13 Okt 2026):

- `POST /Auth/Login` `{username, password, companydb}` → `{Token}` (JWT 24 jam, disimpan di DB dan dipakai ulang)
- `GET /Orders/FindOrder?keyword=<OrderID>` → `{MatchedBy, Order{StatusCode, StatusName, ShopName, CommercePlatform, Location, CreatedAt…}, Skus[], Logs[]}`

Sinkron status berjalan: (a) saat order baru diinput, (b) otomatis saat halaman dibuka bila sinkron terakhir sudah
lewat interval di Pengaturan (bawaan 15 menit), (c) tombol **Cek status OCS**, (d) Vercel Cron harian 06.00 WIB.
Yang dicek hanya order yang **masih pending**; paling lama belum dicek didahulukan, maks. `Order per sinkron`.

> Pakai akun OCS yang punya akses **semua area** (Pusat + cabang), supaya order cabang ikut ditemukan.

### doi-monitor — `doi-monitor.vercel.app/phase-out`
`POST /api/auth/login` lalu `GET /api/phase-out` (cukup akun peran *Lihat saja*). Baris berbasis kode SAP sudah
dijabarkan doi-monitor ke kolom SKU-nya, jadi aturan pencocokan sama persis dengan doi-monitor. Daftar ditarik ulang
tiap 6 jam (bisa diubah) atau lewat tombol di Pengaturan, lalu semua baris pending ditandai ulang.

**Clearance** = SKU yang mengandung `CS-` (aturan yang sama dengan ATP di doi-monitor).

---

---

## Monitoring Cancel (`/cancel`)

Memantau order CANCELLED di OCS yang terjadi karena gudang terlambat. Aturan (ditetapkan 13 Okt 2026, semua bisa diubah di Pengaturan):

- **Kesalahan gudang** = order cancel setelah **≥ 4 jam kerja** (order *instant* ≥ 2 jam) sejak **READY TO PROCESS**, dan saat
  dibatalkan belum mencapai **MANIFESTED** (bisa diganti IN TRANSIT). Cancel di bawah batas jam = wajar dari pembeli.
- **Jam kerja** 08:00–23:59 WIB (shift 1 s/d shift 2). Jam di luar itu tidak dihitung — order masuk 23:00 lalu batal 09:00
  besoknya = 2 jam kerja.
- **Atribusi tim** otomatis:
  - **Inventory** — order juga tercatat di Pending Kiriman (stok bermasalah), atau sudah masuk picklist tapi tidak pernah dipick / gagal pick.
  - **Fulfillment** — sudah dipick/dipack tapi tidak sampai diserahkan tepat waktu, atau belum dibuatkan picklist sama sekali.
- **Review lead**: Admin atau user bertanda **Lead** (centang di menu Pengguna) bisa menandai *Benar kesalahan gudang*
  (boleh mengganti tim) atau *Bukan kesalahan gudang* + alasan — karena OCS tidak menyimpan alasan / pelaku cancel.
  Yang dikecualikan lead tidak dihitung di KPI.
- Tanggal di dashboard = **tanggal order dibuat** (WIB). Rasio cancel = cancel ÷ semua order hari itu (dari OCS).
- Perubahan Pengaturan (batas jam, jam kerja, batas status) langsung berlaku ke data lama — klasifikasi dihitung saat dibaca.

### Sumber data & sinkron
1. **Daftar cancel** — `GET /odata/DTO_Orders` (halaman Orders OCS) dengan filter `StatusCode eq 90000 or 11100`,
   dibaca bertahap urut `UpdatedAt` dengan kursor, jadi tiap sinkron hanya mengambil yang baru berubah.
2. **Log status** — `GET /Orders/FindOrder` (sama seperti Pending Kiriman) **hanya** untuk order yang *mungkin* kesalahan:
   jam kerja dari order dibuat sampai terakhir berubah ≥ batas. Cancel cepat pembeli (mayoritas) tidak perlu dibuka lognya.
3. Sinkron otomatis saat halaman dibuka (tiap 30 menit, bisa diubah), tombol **Tarik sekarang**, dan cron `/api/cron/sync`.

### Backfill (sekali, dari komputer Anda)
Sejak 1 Okt 2026 ada ±42 ribu order cancel — tarik sekali dari laptop supaya tidak kena batas waktu Vercel:

```bat
npm run backfill:cancel                      :: mulai dari "Tarik data mulai tanggal" (bawaan 2026-10-01)
npm run backfill:cancel -- --from 2026-09-01 :: ubah tanggal mulai lalu tarik dari sana
npm run backfill:cancel -- --detail-only     :: hanya membuka log yang belum dicek
```
Aman dihentikan (Ctrl+C) dan dijalankan ulang — lanjut dari posisi terakhir.

### Update database (bila tabel dibuat manual lewat SQL Editor)
Jalankan `prisma/update-2026-10-13-cancel.sql` sekali di TiDB, lalu `npx prisma generate` dan jalankan ulang `npm run dev`.

---

## Pemasangan (Windows, CMD / PowerShell)

```bat
cd "C:\Users\EJI\Claude\Projects\INV IEG\pending-kiriman"
copy .env.example .env
:: isi DATABASE_URL, AUTH_SECRET, OCS_*, DOI_MONITOR_*, CRON_SECRET di .env
npm install
npm run setup          :: buat tabel + collation + admin pertama
npm run ocs:test -- 2704148346952818   :: tes login & Find Order OCS dari komputer ini
npm run doi:test       :: tes login & daftar phase out doi-monitor
npm run dev            :: buka http://localhost:3000 — login admin / Admin123! lalu ganti password
```

Database: boleh cluster TiDB yang sama dengan app lain, tapi **nama database sendiri** (mis. `pending_kiriman`)
di akhir `DATABASE_URL`. Setelah menambah tabel di kemudian hari: `npm run db:push && npm run db:collation`.

Reset password dari terminal: `npm run db:passwd -- username PasswordBaru`.

## Deploy Vercel

1. Push folder ini ke repo GitHub baru, lalu **Import Project** di Vercel.
2. Settings → Environment Variables: salin semua isi `.env` (kecuali `SEED_*`).
3. Deploy. Cron `/api/cron/sync` otomatis terdaftar dari `vercel.json` (harian — batas paket Hobby).
   Ingin lebih sering? Daftarkan `https://<domain>/api/cron/sync?key=<CRON_SECRET>` di cron-job.org tiap 15–30 menit.
4. Cek `https://<domain>/api/health` → `db: up`, `ocs: configured`, `doiMonitor: configured`.

## Struktur

```
prisma/schema.prisma        users, pending_orders (1/Order ID), pending_items (1/Order+SKU),
                            item_logs (riwayat), phase_out_skus, sync_runs, app_settings
src/lib/ocs-client.ts       login + Find Order OCS
src/lib/doi-client.ts       login + daftar Phase Out doi-monitor
src/lib/ocs-status.ts       kode status OCS → terproses / batal / pending
src/lib/kpi.ts              rumus KPI per bulan & kategori batal (diuji: npm test)
src/server/sync.ts          sinkron OCS & phase out, sinkron otomatis
src/server/items.ts         simpan input, bentuk baris
src/server/followup.ts      tindak lanjut + catatan riwayat
src/server/summary.ts       data dashboard & rekap SKU
src/lib/cancel.ts           aturan kesalahan cancel & atribusi tim (diuji: npm test)
src/lib/workhours.ts        hitung jam kerja 08:00–23:59 WIB
src/server/cancel-sync.ts   tarik daftar cancel (OData) + buka log (Find Order)
src/server/cancel-query.ts  data dashboard Monitoring Cancel
src/app/(app)/…             halaman: dashboard, input, monitoring, rekap-sku, cancel, settings, users, akun
```

`npm test` menjalankan uji rumus KPI, klasifikasi status OCS, parser tempel Excel, dan deteksi Clearance.
