# Cira Project Management — Backend REST API (`cira-pm-backend`)

Backend REST API terpusat untuk aplikasi **Cira Project Management**, dirancang dengan arsitektur modular berlapis (*Ivan's DNA 4-Layer Architecture*), standar validasi ketat menggunakan Zod, autentikasi sesi berbasis JWT token pada HTTP-only secure cookie, dan Prisma ORM dengan PostgreSQL (Supabase).

---

## 🛠️ Tech Stack & Spesifikasi

- **Runtime & Bahasa**: Node.js 20+ / TypeScript 5+ (dijalankan via `tsx`)
- **Framework**: Express.js v5 (`express: ^5.3.0`)
- **Database & ORM**: PostgreSQL (Supabase) via Prisma ORM (`@prisma/client: ^7.10.1`, `@prisma/adapter-pg`)
- **Autentikasi & Keamanan**:
  - JWT (`jsonwebtoken`) di `httpOnly` secure cookie
  - Hashing password via `bcryptjs`
  - Cookie Parser: `cookie-parser`
  - Security Headers: `helmet`
  - CORS: `cors` (mendukung kredensial dari frontend web)
- **Validasi Skema**: Zod (`zod: ^4.6.7`) di boundary request handler (body, query, params)
- **Media Storage**: Cloudinary SDK (`cloudinary: ^2.11.0`)
- **Test Runner**: Node.js Built-in Test Runner (`node:test` + `node:assert` via `tsx --test`)

---

## 🏛️ Arsitektur & Struktur Direktori

Sistem menerapkan arsitektur modular berbasis fitur (*Feature-based Modular*) dengan 4 lapisan tanggung jawab:
`routes` ➔ `controller` ➔ `service` ➔ `repository` (validasi batas via Zod `schema`).

```text
backend/
├── docs/                             # Spesifikasi & kontrak teknis
│   ├── prd.md                        # Product Requirements Document
│   └── project-config.md             # Konfigurasi & gaya koding baku
├── prisma/
│   ├── schema.prisma                 # Skema model data Prisma ORM
│   └── seed.ts                       # Database seeder awal
├── src/
│   ├── app.ts                        # Express app, middleware global, router utama
│   ├── server.ts                     # Entry point server listener & bootstrap DB
│   ├── config/                       # Konfigurasi environment & database
│   │   ├── env.config.ts             # Validasi variabel lingkungan via Zod
│   │   └── db.config.ts              # PrismaClient singleton instance
│   ├── features/                     # Modul per fitur (terisolasi)
│   │   ├── auth/                     # Autentikasi, login, logout, profile, session /me
│   │   ├── projects/                 # CRUD proyek, pipeline status, editor PRD markdown
│   │   ├── tasks/                    # Kanban board tasks, status columns, card ordering, DP warning
│   │   ├── finance/                  # Termin pembayaran, verifikasi bukti transfer, neraca kas
│   │   ├── activity/                 # Audit trail & riwayat aktivitas kronologis
│   │   └── assets/                   # Galeri aset desain terkompresi & metadata
│   ├── routes/
│   │   └── index.ts                  # Agregator router API (/api/v1)
│   └── shared/                       # Utilitas bersama
│       ├── errors/                   # AppError, BadRequestError, UnauthorizedError, NotFoundError
│       ├── middlewares/              # validateRequest, requireAuth, errorHandler
│       └── utils/                    # asyncHandler, responseFormatter
└── tests/                            # Automated test suite (17 tests covering AC-1 s/d AC-17)
    ├── auth.test.ts
    ├── projects.test.ts
    ├── tasks.test.ts
    └── finance.test.ts
```

---

## 🚀 Memulai (Getting Started)

### 1. Prasyarat
- Node.js versi 20 atau lebih baru
- Akun / Database PostgreSQL (Supabase)

### 2. Konfigurasi Variabel Lingkungan (`.env`)
Salin atau buat file `.env` di root folder `backend/`:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# PostgreSQL Supabase Connection Strings
DATABASE_URL="postgresql://user:password@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:password@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres"

# JWT Auth Secret
# Setel ke output `openssl rand -base64 48` (minimal 32 karakter acak).
JWT_SECRET=""
JWT_EXPIRES_IN="7d"

# Seed akun awal opsional (hanya non-production)
SEED_ADMIN_EMAIL="admin@local.test"
SEED_ADMIN_PASSWORD="use-a-local-password-of-12-chars-or-more"

# Cloudinary (wajib untuk upload baru; gunakan API key/secret server-side)
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
```

### 3. Instalasi Dependensi
```bash
npm install
```

### 4. Sinkronisasi Database Prisma
```bash
npx prisma generate
npx prisma db push
```

Untuk deployment berbasis migrasi, jalankan `npx prisma migrate deploy`. Rollback indeks query: `DROP INDEX IF EXISTS` untuk nama indeks yang tercantum pada `prisma/migrations/202611060001_add_query_indexes/migration.sql`; tindakan ini hanya menghapus indeks, bukan data.

Upload aset dan bukti transfer memakai Cloudinary authenticated delivery. Isi `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, dan `CLOUDINARY_API_SECRET` pada backend `.env`; ketiganya harus diisi bersama. Tidak perlu upload preset, widget, atau env Cloudinary di frontend. File tersimpan di folder `cira-pm/projects/...`; backend menyimpan reference dan mengirim signed URL untuk preview.

Quick-fill login hanya aktif untuk build development dan memerlukan `NEXT_PUBLIC_DEMO_EMAIL` serta `NEXT_PUBLIC_DEMO_PASSWORD`. Jangan set variabel ini pada build production karena nilainya menjadi publik di bundle browser.

### 5. Seeding Akun Awal (Opsional)
Seeder hanya membuat akun non-production apabila `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` telah ditentukan. Tidak ada akun/password default. Jangan gunakan credential ini pada production.
```bash
npx tsx --env-file=.env prisma/seed.ts
```

### 6. Menjalankan Server
- **Development Mode** (Hot Reload):
  ```bash
  npm run dev
  ```
- **Build Produksi**:
  ```bash
  npm run build
  ```
- **Production Mode**:
  ```bash
  npm run start
  ```

---

## 🧪 Menjalankan Automated Tests

Suite pengujian otomatis mencakup seluruh 17 Acceptance Criteria (AC-1 s/d AC-17):

```bash
npm test
```

*Output yang diharapkan: `17 tests passing, 0 failing`.*

---

## 📖 Ringkasan API Endpoints (`/api/v1`)

### 1. Autentikasi (`/auth`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Login tim & set secure cookie `token` | Publik |
| `POST` | `/api/v1/auth/logout` | Logout & clear auth cookie | Publik |
| `GET` | `/api/v1/auth/me` | Memeriksa data profil pengguna aktif | Sesi Valid |
| `PUT` | `/api/v1/auth/profile` | Memperbarui nama dan email | Sesi Valid |
| `PUT` | `/api/v1/auth/password` | Mengubah password akun | Sesi Valid |

### 2. Proyek (`/projects`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `POST` | `/api/v1/projects` | Membuat proyek baru (default status `lead` + PRD template) | Sesi Valid |
| `GET` | `/api/v1/projects` | Daftar proyek (filter: `?status=lead` & `?search=...`) | Sesi Valid |
| `GET` | `/api/v1/projects/:id` | Detail lengkap proyek, PRD markdown, owner, dan tasks | Sesi Valid |
| `PATCH` | `/api/v1/projects/:id` | Update data proyek, status pipeline, atau konten PRD | Sesi Valid |

### 3. Kanban Tasks (`/projects/:projectId/tasks` & `/tasks`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/projects/:projectId/tasks` | Daftar task kanban + status peringatan DP (`dpWarning`) | Sesi Valid |
| `POST` | `/api/v1/projects/:projectId/tasks` | Membuat task baru di kolom kanban (`order` otomatis) | Sesi Valid |
| `PATCH` | `/api/v1/tasks/:id/status` | Memindahkan kolom kartu kanban (`todo`, `in_progress`, `done`) | Sesi Valid |
| `PATCH` | `/api/v1/tasks/:id` | Memperbarui detail task, prioritas, atau assignee | Sesi Valid |
| `DELETE` | `/api/v1/tasks/:id` | Menghapus kartu task dari kanban board | Sesi Valid |

### 4. Keuangan & Termin (`/projects/:projectId/payments` & `/payments`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/projects/:projectId/payments` | Daftar termin pembayaran proyek | Sesi Valid |
| `POST` | `/api/v1/projects/:projectId/payments` | Menambah termin baru (status default `pending`) | Sesi Valid |
| `PATCH` | `/api/v1/payments/:id/verify` | Verifikasi bukti bayar (`{ verified: true/false }`) | Owner / Ops |
| `PATCH` | `/api/v1/payments/:id` | Memperbarui nominal, jatuh tempo, atau bukti transfer | Sesi Valid |
| `DELETE` | `/api/v1/payments/:id` | Menghapus termin pembayaran | Sesi Valid |
| `GET` | `/api/v1/projects/:projectId/finance-summary` | Ringkasan kas: `contractValue`, `totalVerified`, `remainingBalance` | Sesi Valid |

### 5. Audit Trail & Log Aktivitas (`/projects/:projectId/activities`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/projects/:projectId/activities` | Riwayat aktivitas proyek kronologis (`?category=...`) | Sesi Valid |
| `POST` | `/api/v1/projects/:projectId/activities` | Mencatat aktivitas / catatan manual tim | Sesi Valid |

### 6. Galeri Aset Desain (`/projects/:projectId/assets` & `/assets`)
| Method | Endpoint | Deskripsi | Hak Akses |
|---|---|---|---|
| `GET` | `/api/v1/projects/:projectId/assets` | Galeri aset desain proyek | Sesi Valid |
| `POST` | `/api/v1/projects/:projectId/assets` | Menyimpan metadata dan dataUrl aset terkompresi | Sesi Valid |
| `DELETE` | `/api/v1/assets/:id` | Menghapus aset desain | Sesi Valid |

---

## 🔒 Format Standar Respons API

Seluruh respons API menggunakan format terstandar:

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
