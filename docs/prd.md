# PRD: Cira Project Management — Backend REST API (`cira-pm-backend`)
## Siklus Pengembangan Lanjutan (Target Features)

> Dokumen spesifikasi teknis REST API backend di `./backend`.
> Berdasarkan keputusan discovery `08-PRD-Pengembangan-Cira-PM.md` dan `09-Business-Rules-Pengembangan-Cira-PM.md`.

---

## 1. Problem & Goals
Backend `cira-pm-backend` perlu diperluas dari MVP awal untuk mendukung:
1. **RBAC 3-Role Ketat**: Pembagian role eksplisit (`Owner`, `Developer`, `Operasional`) di middleware backend, token aktivasi undangan 24 jam sekali pakai, profil kontak wajib (WhatsApp internasional & Instagram handle), dan isolasi akun nonaktif.
2. **Persetujuan Status Proyek & Versioning PRD**: Sistem voting permohonan status oleh roster proyek (dengan final override Owner jika ada penolakan), manajemen repositori berlabel, catatan audit *append-only*, dan riwayat versi PRD terkompresi GZIP (`zlib`).
3. **Sprint, Todo & Progres**: Pengelolaan Sprint dan Todo, pembuatan Sprint beserta Todo template dalam satu transaksi, dan progres berbasis jumlah Todo selesai dibanding seluruh Todo.
4. **Tata Kelola Finansial Terstruktur**: Kontrak proyek dengan daftar termin terbobot tepat 100% (penyerapan selisih pembulatan), trigger kesiapan termin (BAST modul/sprint, tanggal, manual), dan penerbitan invoice PDF resmi dengan penomoran berurutan unik tahunan `INV-YYYY-NNN/Tn`.

---

## 2. Non-goals (Siklus Ini)
- Tidak ada integrasi webhook eksternal (GitHub/GitLab API) — URL repo disimpan sebagai string referensi.
- Tidak ada integrasi Google Calendar API — kalender dikelola internal.
- Tidak ada kalkulasi perpajakan (PPN/PPh) otomatis atau ekspor software akuntansi (field disiapkan nullable).
- Tidak ada penghapusan data audit trail, riwayat PRD, atau akun nonaktif dari database.

---

## 3. Matriks Otorisasi RBAC Backend
Setiap request ke `/api/v1/*` divalidasi oleh `requireAuth` dan `requireRole(...)`:

| Endpoint / Aksi | Owner | Developer | Operasional |
|---|:---:|:---:|:---:|
| `POST /auth/invite` (Undang anggota) | ✅ Ya | ❌ 403 | ❌ 403 |
| `PATCH /auth/users/:id/role` & `status` | ✅ Ya | ❌ 403 | ❌ 403 |
| `GET /users/directory` (Direktori tim) | ✅ Ya | ✅ Ya | ✅ Ya |
| `POST /projects/:id/status-request` (Ajukan status) | ✅ Roster | ✅ Roster | ✅ Roster |
| `POST /projects/:id/status-request/:reqId/vote` | ✅ Roster | ✅ Roster | ✅ Roster |
| `POST /projects/:id/status-request/:reqId/final-decision` | ✅ Ya (Final) | ❌ 403 | ❌ 403 |
| `POST/PATCH/DELETE /projects/:id/repositories` | ✅ Ya | ✅ Ya | ❌ 403 (Read-only) |
| `POST /projects/:id/prd/versions` & `restore` | ✅ Ya | ✅ Ya | ✅ Ya |
| `POST/PATCH /projects/:id/sprints` | ✅ Ya | ✅ Ya | ✅ Ya |
| `DELETE /projects/:id/tasks/:id` | ✅ Ya | ❌ 403 | ✅ Ya |
| `POST /projects/:id/contracts` & Termin | ✅ Ya | ❌ 403 | ✅ Ya |
| `POST /payment-terms/:id/invoice` | ✅ Ya | ❌ 403 | ✅ Ya |

---

## 4. User Stories & Acceptance Criteria (Backend)

### US-1: RBAC 3-Role, Undangan Token 24 Jam, & Direktori Anggota
- **AC-B1-1 (Otorisasi Role)**: Given pengguna dengan role `Developer` atau `Operasional`, When memanggil endpoint khusus Owner (`POST /api/v1/auth/invite`, `PATCH /api/v1/auth/users/:id/role`), Then server mengembalikan response `403 Forbidden`.
- **AC-B1-2 (Token Undangan 24 Jam)**: Given Owner mengirim payload `{ email, role }`, When `POST /api/v1/auth/invite` dipanggil, Then token acak kriptografis dibuat dengan masa berlaku 24 jam; jika email sudah memiliki undangan pending sebelumnya, token lama otomatis dibatalkan/dihapus.
- **AC-B1-3 (Aktivasi Akun & Validasi Kontak)**: Given token aktivasi yang valid, When `POST /api/v1/auth/activate` mengirim `{ token, name, password, whatsapp, instagram }`, Then server memvalidasi format nomor WhatsApp internasional (regex `^\+?[1-9]\d{6,14}$`), handle IG, password hash `bcrypt`, mengubah status akun menjadi `active`, dan menyetel sesi/cookie login.
- **AC-B1-4 (Blokir Akun Nonaktif)**: Given akun anggota diubah statusnya menjadi nonaktif oleh Owner, When akun tersebut mencoba login atau memanggil endpoint API yang diproteksi `requireAuth`, Then middleware melempar error `401 Unauthorized` / `403 Forbidden` *"Akun Anda dinonaktifkan"*, sementara relasi data historis di DB tetap utuh.
- **AC-B1-5 (Direktori Anggota)**: Given pengguna login aktif, When memanggil `GET /api/v1/users/directory`, Then server mengembalikan daftar anggota (id, nama, email, whatsapp, instagram, role, isActive) terurut.

### US-2: Persetujuan Status Proyek, Repositori Berlabel, & PRD Versi GZIP
- **AC-B2-1 (Pengajuan Perubahan Status)**: Given anggota roster proyek, When memanggil `POST /api/v1/projects/:id/status-request` dengan `{ targetStatus, reason }`, Then permohonan berstatus `pending` tersimpan di database, pemohon otomatis tercatat sebagai 1 voter setuju, dan status proyek belum berubah.
- **AC-B2-2 (Konsensus Voting Roster)**: Given permohonan status aktif, When seluruh anggota roster proyek telah memanggil `POST /api/v1/projects/:id/status-request/:reqId/vote` dengan `{ vote: "approve" }`, Then status proyek otomatis berpindah ke `targetStatus` dan dicatat ke history proyek append-only.
- **AC-B2-3 (Penolakan & Arbitrase Owner)**: Given ada 1 anggota roster yang memberi vote `"reject"`, When Owner memanggil `POST /api/v1/projects/:id/status-request/:reqId/final-decision` dengan `{ decision: "approve" | "reject" }`, Then status permohonan terselesaikan sesuai keputusan Owner, dan dicatat di audit log.
- **AC-B2-4 (PRD Versioning & GZIP)**: Given pembaruan isi PRD pada `POST /api/v1/projects/:id/prd/versions`, When teks PRD berbeda dari versi terakhir, Then isi teks dikompresi dengan `zlib.gzipSync` dan disimpan sebagai record versi baru; When endpoint restore dipanggil, versi lama didekompresi dan disimpan sebagai versi baru di urutan teratas.
- **AC-B2-5 (Tautan Repositori)**: Given proyek bertipe Monorepo atau Repo Terpisah, When Owner/Developer memanggil endpoint CRUD `POST/PATCH/DELETE /api/v1/projects/:id/repositories`, Then data tautan berlabel tersimpan dan divalidasi URL formatnya.

### US-3: Sprint Lifecycle, Todo & Progres
- **AC-B3-1 (Buat Sprint + Todo)**: `POST /api/v1/projects/:projectId/sprints` menerima daftar Todo opsional; Sprint dan seluruh Todo dibuat dalam transaksi yang sama.
- **AC-B3-2 (Progres Berbasis Todo)**: API menghitung `task done / total task * 100`; setiap task memiliki bobot sama dan story points tidak digunakan.
- **AC-B3-3 (Penutupan Sprint)**: Todo berstatus `todo` yang tersisa wajib dialihkan ke Sprint planning lain saat Sprint ditutup.
- **AC-B3-4 (Sprint Wajib & PIC Opsional)**: Setiap Todo wajib terhubung ke satu Sprint dan dapat memiliki maksimal satu PIC dari roster proyek. PIC tidak wajib untuk aktivasi Sprint dan dapat diubah melalui dialog edit Sprint. Data Todo lama tanpa Sprint dimigrasikan ke Sprint planning.

### US-4: Kontrak, Termin 100%, Trigger BAST, & Invoice PDF
- **AC-B4-1 (Validasi Termin 100% & Penyerapan Pembulatan)**: Given pembuatan kontrak awal di `POST /api/v1/projects/:id/contracts`, When daftar termin dikirimkan, Then server memvalidasi jumlah persentase seluruh termin wajib tepat `100.00%`, termin terakhir menyerap selisih pembulatan rupiah dari `contractValue`, dan total nominal seluruh termin sama persis dengan `contractValue`.
- **AC-B4-2 (Trigger Termin Siap Ditagih)**: Given termin dengan trigger penyelesaian modul/sprint, When modul/sprint selesai dan file BAST diunggah ke `PATCH /api/v1/payment-terms/:id/ready`, Then status termin berubah menjadi `ready_to_invoice`.
- **AC-B4-3 (Penerbitan Invoice)**: Given termin berstatus `ready_to_invoice`, When `POST /api/v1/payment-terms/:id/invoice` dipanggil, Then nomor invoice otomatis di-generate dengan format `INV-YYYY-NNN/Tn` (nomor urut NNN unik per tahun kalender, Tn = nomor termin), status termin menjadi `invoiced`, dan termin terkunci dari perubahan/penghapusan.
