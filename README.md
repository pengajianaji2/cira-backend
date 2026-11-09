# Cira Project Management — Backend REST API (`cira-pm-backend`)

Backend REST API terpusat untuk aplikasi **Cira Project Management**, dirancang dengan arsitektur modular berlapis (`routes` ➔ `controller` ➔ `service` ➔ `repository`), validasi skema Zod di boundary request, autentikasi JWT berbasis `httpOnly` cookie + header Bearer, otorisasi RBAC dinamis per role (`RolePolicy`), dan Prisma ORM di atas PostgreSQL.

---

## 🛠️ Tech Stack & Spesifikasi

- **Runtime & Bahasa**: Node.js 20+ / TypeScript (`typescript: ^7.0.2`, dijalankan via `tsx: ^4.23.15`)
- **Framework**: Express.js v5 (`express: ^5.3.0`)
- **Database & ORM**: PostgreSQL via Prisma ORM (`@prisma/client: ^7.10.1`, `@prisma/adapter-pg: ^7.10.1`, `pg: ^8.23.1`)
- **Autentikasi & Keamanan**:
  - JWT HS256 (`jsonwebtoken: ^9.0.3`) di `httpOnly` cookie / Bearer token dengan mekanisme pencabutan sesi (`tokenVersion`)
  - Hashing password via `bcryptjs` (`^3.0.3`)
  - Proteksi origin browser & CSRF double-submit (`validateBrowserOrigin`, `validateCsrf`)
  - Shared rate limiter berbasis PostgreSQL (`AuthRateLimit`) untuk login, verifikasi undangan, dan reset password
  - Security headers (`helmet: ^8.3.0`), CORS kredensial (`cors: ^2.8.6`), `cookie-parser`
- **Validasi Skema**: Zod (`zod: ^4.6.7`) di boundary request handler (`params`, `query`, `body`)
- **Email Transaksional**: Nodemailer (`nodemailer: ^10.4.0`) dengan preset Gmail App Password (`GMAIL_USER`, `GMAIL_APP_PASSWORD`) — opsional
- **Media Storage**: Cloudinary SDK (`cloudinary: ^2.11.0`) authenticated delivery — opsional
- **Test Runner**: Node.js Built-in Test Runner (`node --import tsx --test tests/**/*.test.ts`)

---

## 🏛️ Arsitektur & Struktur Direktori

Setiap modul fitur terisolasi di `src/features/<fitur>` dengan pola `routes` ➔ `controller` ➔ `service` ➔ `repository` beserta `*.schema.ts` dan `*.types.ts`:

```text
backend/
├── prisma/
│   ├── schema.prisma                                     # Skema model Prisma ORM & relasi PostgreSQL
│   ├── seed.ts                                           # Seeder akun awal opsional non-production
│   ├── migrations/                                       # Riwayat migrasi SQL Prisma
│   │   ├── 0_init/
│   │   ├── 20261107191533_add_sprints_rosters_and_governance/
│   │   ├── 20261108010000_policy_email_and_sessions/
│   │   ├── 20261109130000_us3_payment_terms_triggers/
│   │   └── 20261109140000_us4_operational_calendar_events/
│   └── run_migration_{tasks,us3,us4}.ts                  # Skrip runner migrasi data tambahan
├── src/
│   ├── app.ts                                            # Setup Express app, security middleware, dan API router
│   ├── server.ts                                         # Entry point server listener
│   ├── config/
│   │   ├── cors.config.ts                                # Daftar origin CORS yang diizinkan
│   │   ├── db.config.ts                                  # PrismaClient singleton + PG adapter
│   │   └── env.config.ts                                 # Validasi environment variables via Zod
│   ├── features/
│   │   ├── auth/                                         # Login/logout, JWT, aktivasi undangan 24 jam, reset password 30 menit, avatar, RolePolicy
│   │   ├── users/                                        # Direktori anggota tim (/api/v1/users/directory)
│   │   ├── projects/                                     # CRUD proyek, nilai kontrak, voting roster, status approval, repo links, PRD GZIP
│   │   ├── tasks/                                        # Checklist TODO/DONE, default Backlog, pemindahan sprint, DP warning
│   │   ├── sprints/                                      # Daur hidup sprint (planning/active/completed), penutupan atomik, progres rasio sprint
│   │   ├── finance/                                      # Kontrak termin 100%, evaluator pemicu WIB, BAST opsional, invoice manual, legacy payments
│   │   ├── operations/                                   # Kalender operasional teragregasi (WIB maks 90 hari) & CRUD agenda manual
│   │   ├── activity/                                     # Audit trail & log aktivitas kronologis (read-only API, ditulis server-side)
│   │   └── assets/                                       # Galeri aset desain & integrasi Cloudinary authenticated storage
│   ├── routes/
│   │   └── index.ts                                      # Agregator router utama (/api/v1) + /health & /ready
│   └── shared/
│       ├── authz/permissions.ts                          # Katalog permission keys & default policy per role
│       ├── errors/AppError.ts                            # Hierarki error operasional (400, 401, 403, 404, 409, 429, 503)
│       ├── middlewares/                                  # auth, csrf, errorHandler, loginRateLimit, validateBrowserOrigin, validateRequest
│       ├── services/email.service.ts                     # Template HTML/Text & pengirim SMTP Gmail Nodemailer
│       └── utils/                                        # asyncHandler, businessDate (WIB / Asia/Jakarta), responseFormatter
└── tests/                                                # Automated test suite (10 file, 82 test)
    ├── tasks_todo_backlog.test.ts                        # 4 tests  — US-1 checklist & backlog
    ├── sprints.test.ts                                   # 11 tests — Daur hidup sprint & resolusi task todo
    ├── sprints_lifecycle_progress.test.ts                # 5 tests  — US-2 progres rasio sprint & tutup atomik
    ├── finance_contract.test.ts                          # 11 tests — Kontrak 100%, pembulatan, & BAST
    ├── finance_terms_invoicing.test.ts                   # 7 tests  — US-3 pemicu tunggal, ready idempotent, invoice & overdue WIB
    ├── operations_calendar.test.ts                       # 10 tests — US-4 kalender teragregasi WIB, agenda, & RBAC
    ├── governance.test.ts                                # 14 tests — Roster voting, repo links, & PRD GZIP
    ├── security.test.ts                                  # 13 tests — Auth, CSRF, origin check, signed upload & role policies
    ├── us1-avatar.test.ts                                # 4 tests  — Crop avatar, cleanup rollback, & delivery URL lintas service
    └── us2-profile-contacts.test.ts                      # 3 tests  — Kontak profil opsional/nullable & tampilan direktori tim
```

---

## 🚀 Memulai (Getting Started)

### 1. Prasyarat
- Node.js versi 20 atau lebih baru
- Database PostgreSQL (misalnya Supabase PostgreSQL)

### 2. Konfigurasi Variabel Lingkungan (`.env`)
Buat file `.env` di dalam folder `backend/` (referensi skema validasi ada di [`src/config/env.config.ts`](src/config/env.config.ts)). Jaga kredensial tetap di luar version control.

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
APP_PUBLIC_URL=http://localhost:3000
TRUST_PROXY_HOPS=0

# PostgreSQL Connection Strings
DATABASE_URL="postgresql://user:password@host:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/postgres"

# JWT Auth Secret (wajib >= 32 karakter acak dan bukan placeholder)
# Contoh pembangkitan: openssl rand -base64 48
JWT_SECRET=""
JWT_EXPIRES_IN="7d"

# Opsional: Email transaksional via Gmail App Password
# Gunakan Google App Password (setelah 2-Step Verification aktif), bukan password login akun Google.
# Sender otomatis memakai format: "Cira PM <GMAIL_USER>".
GMAIL_USER=""
GMAIL_APP_PASSWORD=""

# Opsional: Cloudinary server-side authenticated upload (ketiganya harus diisi bersama)
# Dipakai untuk foto profil (PNG/JPEG/WebP maks 2 MB), dokumen BAST data URL, dan bukti pembayaran.
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""

# Opsional: Seeding akun awal (khusus non-production, password minimal 6 karakter)
SEED_ADMIN_EMAIL=""
SEED_ADMIN_PASSWORD=""
```

Catatan penting environment:
- Di `production`, `FRONTEND_URL` wajib berupa origin HTTPS publik (bukan localhost), dan jika `APP_PUBLIC_URL` diisi juga wajib menggunakan HTTPS.
- `GMAIL_USER` dan `GMAIL_APP_PASSWORD` harus diisi berpasangan (atau sama-sama dikosongkan jika fitur kirim email belum diaktifkan). Tautan undangan berlaku 24 jam (disimpan sebagai hash SHA-256), sedangkan tautan reset password berlaku 30 menit dan sekali pakai.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, dan `CLOUDINARY_API_SECRET` harus diisi bersama jika fitur unggah diaktifkan. Tidak diperlukan preset atau env Cloudinary di frontend.
- `TRUST_PROXY_HOPS` harus mengikuti jumlah proxy yang benar-benar dipercaya pada jalur deployment. Nilai default production adalah `1` untuk satu reverse proxy; jangan mempercayai header proxy dari jaringan yang tidak tepercaya.

### 3. Instalasi Dependensi & Sinkronisasi Database
```bash
npm install
npx prisma migrate deploy
npx prisma generate
```
*(Saat development skema baru, gunakan `npx prisma migrate dev`.)*

### 4. Seeding Akun Awal (Opsional, Non-Production)
Seeder hanya membuat akun apabila `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` diisi pada `.env`. Tidak ada kredensial bawaan hardcoded:
```bash
npx tsx --env-file=.env prisma/seed.ts
```

### 5. Menjalankan Server
- **Development Mode** (hot reload): `npm run dev`
- **Build Produksi** (`dist/`): `npm run build`
- **Production Mode**: `npm run start`

---

## 🧪 Menjalankan Automated Tests

Suite pengujian otomatis dijalankan dengan Node built-in test runner (`tsx --test`):

```bash
npm test
```

*Terverifikasi: `82 tests passing, 0 failing` across 10 test files.*

---

## 🔐 Kebijakan Role & Keamanan

- **RBAC Dinamis (`RolePolicy`)**: Owner dapat mengatur capability permission untuk role `owner`, `developer`, dan `operasional` pada halaman `/access-policies` (`PUT /api/v1/policies/:role`). Middleware server membaca policy aktif pada setiap request terproteksi.
- **Gabungan Role & Proteksi Lockout**: Pengguna dengan lebih dari satu role mendapat gabungan (`union`) seluruh permission-nya. Capability `policies.manage` wajib tetap aktif untuk role `owner`. Administrasi user/role (`invite`, `role`, `status`) khusus untuk `owner`.
- **Integritas Perubahan Status & Kontrak**: Endpoint umum `PATCH /api/v1/projects/:id` tidak mengubah `status` maupun `contractValue`. Perubahan status proyek wajib melalui alur voting roster/arbitrase Owner, sementara perubahan nilai kontrak melalui endpoint keuangan khusus. Log aktivitas (`ActivityLog`) ditulis oleh domain service di server.

---

## 📖 Ringkasan API Endpoints (`/api/v1`)

### 1. Kesehatan Sistem
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/health` | Status liveness layanan backend | Publik |
| `GET` | `/api/v1/ready` | Pengecekan readiness koneksi database PostgreSQL | Publik |

### 2. Autentikasi, Direktori Tim & Policy (`/auth`, `/users`, `/policies`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/auth/csrf` | Mengambil token CSRF untuk request mutasi browser | Publik |
| `POST` | `/api/v1/auth/login` | Login pengguna & menerbitkan JWT cookie (`7d` / `30d` rememberMe) | Publik (rate-limited) |
| `POST` | `/api/v1/auth/logout` | Mencabut sesi JWT aktif melalui kenaikan `tokenVersion` | Sesi Valid |
| `POST` | `/api/v1/auth/forgot-password` | Mengirim tautan reset password 30 menit ke email aktif | Publik (rate-limited) |
| `POST` | `/api/v1/auth/reset-password` | Memperbarui password dari token reset sekali pakai | Publik (rate-limited) |
| `GET` | `/api/v1/auth/me` | Mengambil data profil pengguna terautentikasi | Sesi Valid |
| `PUT` | `/api/v1/auth/profile` | Memperbarui nama, email, serta WhatsApp dan Instagram (opsional/nullable) | Sesi Valid |
| `POST` | `/api/v1/auth/avatar` | Mengunggah foto profil hasil crop 1:1 ke Cloudinary (signed delivery URL) | Sesi Valid |
| `PUT` | `/api/v1/auth/password` | Mengubah password dengan verifikasi password lama | Sesi Valid |
| `POST` | `/api/v1/auth/invite` | Membuat undangan 24 jam (`developer` / `operasional`) + kirim email | Owner (`users.invite`) |
| `POST` | `/api/v1/auth/invite/verify` | Memverifikasi validitas dan masa berlaku token undangan | Publik (rate-limited) |
| `POST` | `/api/v1/auth/activate` | Aktivasi akun anggota dari token undangan sekali pakai | Publik |
| `PATCH` | `/api/v1/auth/users/:id/role` | Mengubah role anggota tim | Owner (`users.manage`) |
| `PATCH` | `/api/v1/auth/users/:id/status` | Mengaktifkan/menonaktifkan akun anggota | Owner (`users.manage`) |
| `GET` | `/api/v1/users/directory` | Daftar direktori anggota tim beserta kontak, signed `avatarUrl`, & status aktif | `directory.read` |
| `GET` | `/api/v1/policies/me` | Daftar permission efektif pengguna yang sedang login | Sesi Valid |
| `GET` | `/api/v1/policies` | Daftar policy permission seluruh role + katalog permission | Owner (`policies.manage`) |
| `GET` | `/api/v1/policies/history` | Riwayat perubahan policy RBAC (maks 100 terbaru) | Owner (`policies.manage`) |
| `PUT` | `/api/v1/policies/:role` | Memperbarui daftar permission role (`owner`/`developer`/`operasional`) | Owner (`policies.manage`) |

### 3. Proyek & Tata Kelola (`/projects`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `POST` | `/api/v1/projects` | Membuat proyek baru (default `lead`, roster pembuat, PRD Versi #1 GZIP) | `projects.create` (+ `projects.contract.update` bila isi kontrak) |
| `GET` | `/api/v1/projects` | Daftar proyek (filter: `?status=...&search=...`) | `projects.read` |
| `GET` | `/api/v1/projects/:id` | Detail lengkap proyek, PRD, dan pembayaran terformat | `projects.read` |
| `PATCH` | `/api/v1/projects/:id` | Pembaruan info proyek / konten PRD (auto-snapshot Versi PRD) | `projects.update` (+ `prd.write` bila ubah PRD) |
| `PATCH` | `/api/v1/projects/:projectId/contract-value` | Memperbarui nilai kontrak proyek | `projects.contract.update` |
| `GET` | `/api/v1/projects/:projectId/roster` | Daftar anggota roster voting proyek | `projects.read` |
| `POST` | `/api/v1/projects/:projectId/roster` | Menambahkan anggota aktif ke roster voting proyek | `roster.manage` |
| `DELETE` | `/api/v1/projects/:projectId/roster/:userId` | Menghapus anggota dari roster voting proyek | `roster.manage` |
| `GET` | `/api/v1/projects/:projectId/status-requests` | Riwayat pengajuan perubahan status proyek | `projects.read` |
| `GET` | `/api/v1/projects/:projectId/status-request/active` | Pengajuan status proyek yang masih berstatus `pending` | `projects.read` |
| `POST` | `/api/v1/projects/:projectId/status-requests` | Mengajukan perubahan status proyek (juga alias `/status-request`) | `status.request` |
| `POST` | `/api/v1/projects/:projectId/status-requests/:reqId/vote` | Memberi suara `approve`/`reject` (otomatis berubah saat konsensus 100%) | `status.vote` |
| `POST` | `/api/v1/projects/:projectId/status-requests/:reqId/final-decision` | Keputusan final/arbitrase Owner pada pengajuan `pending` | `projects.status.change` |
| `GET` | `/api/v1/projects/:projectId/repositories` | Daftar tautan repositori berlabel + `repoType` | `projects.read` |
| `POST` | `/api/v1/projects/:projectId/repositories` | Menambah tautan repositori berlabel | `repositories.write` |
| `PATCH` | `/api/v1/projects/:projectId/repositories/:repoId` | Memperbarui tautan repositori berlabel | `repositories.write` |
| `DELETE` | `/api/v1/projects/:projectId/repositories/:repoId` | Menghapus tautan repositori berlabel | `repositories.write` |
| `PATCH` | `/api/v1/projects/:projectId/repo-type` | Mengubah tipe repositori (`monorepo` / `separate`) | `repositories.write` |
| `GET` | `/api/v1/projects/:projectId/prd/versions` | Daftar versi arsip PRD proyek | `projects.read` |
| `GET` | `/api/v1/projects/:projectId/prd/versions/:versionId` | Membaca & mendekompresi konten GZIP suatu versi PRD | `projects.read` |
| `POST` | `/api/v1/projects/:projectId/prd/versions` | Menyimpan snapshot versi PRD baru terkompresi GZIP | `prd.write` |
| `POST` | `/api/v1/projects/:projectId/prd/versions/:versionId/restore` | Memulihkan versi PRD lama menjadi versi baru di urutan teratas | `prd.write` |

### 4. Checklist Tasks & Backlog (`/projects/:projectId/tasks` & `/tasks`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/projects/:projectId/tasks` | Daftar seluruh task + status `hasVerifiedDp` / `dpWarning` | `projects.read` |
| `POST` | `/api/v1/projects/:projectId/tasks` | Membuat task baru (default `status: "todo"`, `sprintId: null` Backlog) | `tasks.write` |
| `PATCH` | `/api/v1/tasks/:id/status` | Mengubah status checklist (`todo` \| `done`) dan urutan | `tasks.write` |
| `PATCH` | `/api/v1/tasks/:id/move-sprint` | Memindahkan task ke Sprint non-completed atau Backlog (`null`) | `tasks.write` |
| `PATCH` | `/api/v1/tasks/:id` | Memperbarui detail task, prioritas, storyPoints Fibonacci, atau assignee | `tasks.write` |
| `DELETE` | `/api/v1/tasks/:id` | Menghapus task dari proyek | `tasks.delete` |

### 5. Sprint Lifecycle & Progres (`/projects/:projectId/sprints` & `/sprints`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/projects/:projectId/sprints` | Daftar sprint proyek terurut (Developer terbatas pada roster proyeknya) | `projects.read` |
| `POST` | `/api/v1/projects/:projectId/sprints` | Membuat sprint baru berstatus `planning` (tanggal opsional) | `sprints.write` |
| `GET` | `/api/v1/projects/:projectId/sprints/progress` | Progres kumulatif proyek: `completedSprintCount / totalSprintCount * 100%` | `projects.read` |
| `GET` | `/api/v1/sprints/:id` | Detail satu sprint beserta daftar task di dalamnya | `projects.read` |
| `PATCH` | `/api/v1/sprints/:id` | Memperbarui nama, goal, atau rentang tanggal sprint (`planning`/`active`) | `sprints.write` |
| `POST` | `/api/v1/sprints/:id/start` | Mengaktifkan sprint (`planning` ➔ `active`, maks 1 sprint aktif per proyek) | `sprints.write` |
| `PATCH` / `POST` | `/api/v1/sprints/:id/complete` | Menutup sprint secara atomik beserta `taskMoves` wajib untuk task `todo` | `sprints.write` |
| `POST` | `/api/v1/sprints/:id/reopen` | Membuka kembali sprint `completed` ke `planning` & hitung ulang progres | `sprints.write` |
| `DELETE` | `/api/v1/sprints/:id` | Menghapus sprint & menghitung ulang progres proyek | `sprints.delete` |
| `POST` | `/api/v1/sprints/:id/tasks` | Menambahkan sekumpulan task ke sprint non-completed | `sprints.write` |

### 6. Keuangan, Kontrak Termin 100% & Invoice (`/projects/:projectId/*`, `/payment-terms`, `/payments`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `POST` | `/api/v1/projects/:projectId/contracts` | Menetapkan `contractValue` & daftar termin berbobot tepat 100% | `finance.payment_terms.manage` + `projects.contract.update` |
| `GET` | `/api/v1/projects/:projectId/payment-terms` | Daftar termin proyek + evaluasi pemicu `date`/`sprint` WIB idempotent & flag `overdue` | `finance.read` |
| `GET` | `/api/v1/projects/:projectId/finance-summary` | Ringkasan kas proyek (`contractValue`, `totalVerified`, `totalInvoiced`, `remainingBalance`, `hasVerifiedDp`) | `finance.read` |
| `GET` | `/api/v1/payment-terms/:id` | Detail satu termin pembayaran + evaluasi kesiapan pemicu | `finance.read` |
| `PATCH` | `/api/v1/payment-terms/:id` | Mengubah judul, catatan, atau pemicu tunggal (`date` \| `sprint` \| `manual`) | `finance.payment_terms.manage` |
| `PATCH` | `/api/v1/payment-terms/:id/ready` | Menandai termin `ready` (dengan atau tanpa lampiran BAST; idempotent) | `finance.payment_terms.manage` |
| `POST` | `/api/v1/payment-terms/:id/invoice` | Mencatat invoice resmi dari termin `ready` (wajib `invoiceDueDate`, mengunci termin) | `finance.invoices.create` |
| `PATCH` | `/api/v1/payment-terms/:id/pay` | Menandai invoice termin telah lunas (`invoiced` ➔ `paid`) | `finance.invoices.create` |
| `DELETE` | `/api/v1/payment-terms/:id` | Menghapus termin yang belum terkunci dan belum memiliki invoice | `finance.payment_terms.manage` |
| `GET` | `/api/v1/projects/:projectId/payments` | *(Legacy)* Daftar catatan pembayaran proyek | `finance.read` |
| `POST` | `/api/v1/projects/:projectId/payments` | *(Legacy)* Menambah catatan pembayaran proyek | `finance.write` |
| `PATCH` | `/api/v1/payments/:id/verify` | *(Legacy)* Verifikasi/batal verifikasi bukti pembayaran | `finance.write` |
| `PATCH` | `/api/v1/payments/:id` | *(Legacy)* Memperbarui detail atau bukti transfer pembayaran | `finance.write` |
| `DELETE` | `/api/v1/payments/:id` | *(Legacy)* Menghapus catatan pembayaran | `finance.write` |

### 7. Kalender Operasional & Agenda Manual (`/operations`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/operations/calendar` | Feed kalender teragregasi WIB (`sprint`, `payment_term`, `invoice`, `operational_event`), maks rentang 90 hari | `operations.calendar.read` (Developer ditolak `403`) |
| `POST` | `/api/v1/operations/events` | Membuat agenda manual (`client_demo` \| `deployment` \| `maintenance` \| `meeting`), `projectId` nullable | `operations.events.manage` |
| `PATCH` | `/api/v1/operations/events/:id` | Memperbarui jadwal atau detail agenda manual | `operations.events.manage` |
| `PATCH` | `/api/v1/operations/events/:id/cancel` | Pembatalan soft-status agenda (`status = "cancelled"`) tanpa hapus DB | `operations.events.manage` |
| `POST` | `/api/v1/operations/events/:id/remind` | Mencatat log tindak lanjut (follow-up) manual agenda | `operations.events.manage` |

### 8. Audit Trail & Galeri Aset Desain (`/projects/:projectId/activities` & `/assets`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/projects/:projectId/activities` | Riwayat aktivitas proyek kronologis (`?category=...&limit=...`, read-only API) | `activities.read` |
| `GET` | `/api/v1/projects/:projectId/assets` | Galeri aset desain proyek beserta signed delivery `dataUrl` | `projects.read` |
| `POST` | `/api/v1/projects/:projectId/assets/upload-signature` | Menerbitkan signature direct upload Cloudinary (`publicId` UUID) | `assets.write` |
| `DELETE` | `/api/v1/projects/:projectId/assets/upload/:publicId` | Membersihkan unggahan sementara Cloudinary yatim | `assets.write` |
| `POST` | `/api/v1/projects/:projectId/assets` | Memverifikasi unggahan & menyimpan metadata aset desain (`publicId`) | `assets.write` |
| `DELETE` | `/api/v1/assets/:id` | Menghapus aset desain proyek dari database & Cloudinary | `assets.write` |

---

## 🔒 Format Standar Respons API

Seluruh respons API menggunakan struktur payload terstandar:

```json
{
  "success": true,
  "message": "Operasi berhasil dilakukan",
  "data": { ... }
}
```

Format respons error:

```json
{
  "success": false,
  "message": "Pesan deskriptif penyebab error",
  "error": [ ... ]
}
```

## Perubahan source dan deployment

- Upload aset desain menggunakan signature singkat dari backend dan transfer file langsung ke Cloudinary; secret tetap di backend. Pastikan bucket/folder Cloudinary menggunakan mode authenticated.
- Perubahan schema baru dan prosedur deploy/validasinya dijelaskan di [`docs/production-readiness-runbook.md`](docs/production-readiness-runbook.md).
- Migrasi database tidak otomatis dijalankan saat aplikasi start. Jalankan `prisma migrate deploy` setelah backup dan pemeriksaan status data.
