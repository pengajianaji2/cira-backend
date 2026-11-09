# Cira PM Production Readiness Runbook

Panduan ini mencakup perubahan sesi autentikasi, constraint status, penyimpanan aset, dan logging request. Jalankan di staging lebih dahulu. Perubahan repository belum berarti migration sudah diterapkan ke database atau deployment.

## 1. Sebelum migrasi

0. Jalankan preflight terhadap database target yang benar dari direktori backend. Pastikan `DIRECT_URL` atau `DATABASE_URL` disetel secara eksplisit dan tidak menunjuk database lokal/production yang keliru:

   ```bash
   npx prisma migrate status
   ```

   Jika perintah gagal karena koneksi, hentikan rilis dan perbaiki konfigurasi koneksi. Jika status menunjukkan migrasi belum diterapkan, lanjutkan hanya setelah backup dan validasi staging pada langkah berikut.

1. Buat snapshot/backup PostgreSQL yang konsisten dan catat timestamp serta identitas backup.
2. Pastikan backup dapat dipulihkan ke database staging terisolasi. Jangan menjadikan status “backup sukses” sebagai pengganti uji restore.
3. Ambil inventaris status yang tidak dikenal sebelum constraint dipasang:

   ```sql
   SELECT 'projects.status' AS field, status AS value, COUNT(*)
   FROM projects GROUP BY status
   UNION ALL
   SELECT 'tasks.status', status, COUNT(*)
   FROM tasks GROUP BY status
   UNION ALL
   SELECT 'sprints.status', status, COUNT(*)
   FROM sprints GROUP BY status
   UNION ALL
   SELECT 'payments.status', status, COUNT(*)
   FROM payments GROUP BY status
   UNION ALL
   SELECT 'payment_terms.status', status, COUNT(*)
   FROM payment_terms GROUP BY status
   UNION ALL
   SELECT 'payment_terms.triggerType', "triggerType", COUNT(*)
   FROM payment_terms GROUP BY "triggerType"
   UNION ALL
   SELECT 'operational_events.status', status, COUNT(*)
   FROM operational_events GROUP BY status
   UNION ALL
   SELECT 'operational_events.eventType', "eventType", COUNT(*)
   FROM operational_events GROUP BY "eventType";
   ```

4. Periksa seluruh kategori/status di luar himpunan valid yang didefinisikan pada migrasi. Putuskan pemetaan domain sebelum menerapkan constraint. Migrasi akan berhenti jika ada nilai yang tidak cocok.
5. Pastikan tiga kredensial Cloudinary backend telah dikonfigurasi dan akun Cloudinary menerima unggahan authenticated bertanda tangan.
6. Cocokkan `TRUST_PROXY_HOPS` dengan jumlah proxy tepercaya aktual. Jangan menebak nilainya dari environment lokal.
7. Terapkan frontend dan backend ke staging yang menggunakan database salinan, lalu jalankan alur manual di bagian 4.

## 2. Urutan migrasi database

Jalankan migrasi Prisma dari direktori backend pada database target setelah backup diverifikasi:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
```

Migrasi `20261108010000_policy_email_and_sessions` membuat tabel `auth_rate_limits` yang dipakai middleware pembatasan login, reset password, dan verifikasi undangan. Bila endpoint `/api/v1/ready` mengembalikan 503 atau log sebelumnya berisi PostgreSQL `42P01` untuk tabel ini, periksa status migrasi pada database target. Jalankan `migrate deploy` hanya bila database target dan backup sudah terverifikasi.

Urutan migrasi baru:

1. `20261109150000_preserve_project_history` mengubah FK riwayat PRD dan activity log menjadi `RESTRICT` agar penghapusan proyek tidak menghapus catatan historis.
2. `20261109160000_constrain_domain_statuses` mencatat normalisasi task `in_progress` ke `todo`, lalu menambahkan dan memvalidasi constraint nilai domain.
3. `20261109170000_asset_storage_reference` mengganti nama kolom aset dari `dataUrl` menjadi `storageReference`. Nilai lama dipertahankan; kode kompatibilitas tetap mengembalikan URL lama apa adanya.

Semua migrasi di atas belum dijalankan pada database staging atau produksi dari workspace ini. Migrasi status sengaja gagal jika ditemukan nilai yang belum dipetakan; jangan menghapus check constraint untuk melewati kegagalan tersebut.

## 3. Rilis aplikasi

1. Isi `NEXT_PUBLIC_API_URL` dengan URL API HTTPS produksi di environment build frontend.
2. Isi `FRONTEND_URL`, `APP_PUBLIC_URL`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `TRUST_PROXY_HOPS`, serta kredensial email dan Cloudinary backend sesuai lingkungan.
3. Pastikan tidak ada secret pada environment `NEXT_PUBLIC_*`.
4. Deploy backend, verifikasi `/api/v1/health` dan `/api/v1/ready`, lalu deploy frontend.
5. Verifikasi header frontend dan API melalui response HTTPS live, termasuk CSP nonce dari Next.js Proxy, `Referrer-Policy`, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, CORS, cookie `HttpOnly`/`Secure`, dan CSRF.
6. Pastikan request ID tersedia di log dan tidak ada token, cookie, body sensitif, atau data pribadi yang tercatat.

### Diagnosis cookie sesi

- Cira PM menerbitkan cookie sesi bernama `token` (`HttpOnly`) dan cookie `csrfToken`; kode ini tidak menerbitkan cookie `accessToken` atau `refreshToken`.
- Jika browser localhost menunjukkan nama cookie lain, cocokkan request login dan header `Set-Cookie` di Network untuk menemukan backend penerbitnya. Periksa nama, domain, path, atribut, serta URL respons; jangan menyalin nilai cookie ke tiket, chat, atau log.
- Cabut token pada aplikasi yang menerbitkannya, lalu hapus cookie terkait dari browser. Perubahan source Cira PM tidak dapat mencabut token yang diterbitkan backend lain.

## 4. Pemeriksaan staging pascarilis

- Login, reload halaman, buka tab baru, kedaluwarsakan sesi, lalu pastikan halaman privat menunggu verifikasi server dan sesi invalid mengarah ke login.
- Logout saat jaringan normal dan gagal; pastikan cache privat dibersihkan dan halaman privat tidak tampil lagi.
- Reset password: buka link, pastikan token hanya ada di fragment, URL segera bersih, dan token sekali pakai tetap diterima.
- Buat proyek, edit metadata, edit PRD, ubah nilai kontrak, dan pastikan setiap perubahan beserta log/version tersimpan lengkap.
- Paksa kegagalan penulisan activity log di staging lalu pastikan mutasi proyek/task/aset rollback bersama lognya.
- Cari, filter, dan navigasikan halaman daftar proyek dengan lebih dari 25 data.
- Upload aset PNG/JPEG/WebP yang valid; uji file >2 MB, MIME tidak cocok, upload batal, dan penghapusan. Pastikan file menjadi objek authenticated di folder project yang benar dan URL yang dikirim aplikasi bertanda tangan.
- Cek status proyek, task, sprint, payment, termin, dan kalender; pastikan nilai ilegal ditolak oleh DB.
- Uji role owner, developer, operasional dan akses yang diizinkan/ditolak sesuai policy saat ini.
- Periksa respons mobile, keyboard, fokus, pesan error, kontras light/dark, dan tema warna komponen.

## 5. Backup, restore, dan kegagalan rilis

- Jadwalkan backup sesuai RPO/RTO yang disetujui pemilik layanan dan pantau keberhasilan job pada provider database.
- Uji restore berkala ke instance terisolasi; catat durasi, versi snapshot, dan hasil pemeriksaan data.
- Jangan mengandalkan rollback SQL otomatis untuk migrasi kolom/constraint ini. Jika rilis gagal setelah migrasi, pertahankan migrasi database dan lakukan forward-fix kompatibel, atau pulihkan backup ke instance baru sesuai prosedur insiden.
- Untuk rollback aplikasi, gunakan build aplikasi sebelumnya hanya setelah memeriksa kompatibilitas skema: build lama tidak mengetahui kolom `storageReference` setelah migrasi aset diterapkan.
- Tentukan kanal alert untuk HTTP 5xx, readiness gagal, lonjakan 401/403, kegagalan kirim email, dan kegagalan Cloudinary.

## 6. Catatan penerapan

Runbook ini mendokumentasikan langkah dan kondisi verifikasi. Backup provider, uji restore nyata, deployment, header live, dan alert tetap membutuhkan akses ke akun infrastruktur perusahaan dan belum dilakukan dari source lokal.
