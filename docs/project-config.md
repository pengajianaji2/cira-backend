# Project Configuration & Conventions

Dokumen ini mendefinisikan konfigurasi teknis, gaya koding, arsitektur, dan alur pengerjaan untuk proyek **Cira Project Management (Backend: cira-pm-backend)**.

---

## 1. Tech Stack & Environment (Backend)

- **Mode**: Mandiri (Semua dependensi inti telah terpasang di `package.json`)
- **Scope / Structure**: Standalone Express.js REST API di `./backend` (repo `cira-pm-backend`)
- **Documentation Path**: `./backend/docs/`
- **Language & Runtime**: TypeScript 5+ / Node.js 20+ (eksekusi via `tsx`)
- **Framework**: Express.js v5 (`express: ^5.3.0`)
- **Database & ORM**: PostgreSQL (Supabase) via Prisma ORM (`@prisma/client: ^7.10.1`, `@prisma/adapter-pg: ^7.10.1`, `pg: ^8.23.1`)
- **Autentikasi & Keamanan**:
  - Token: JWT (`jsonwebtoken`) disimpan di `httpOnly` secure cookie
  - Enkripsi Password: `bcryptjs`
  - Cookie Parser: `cookie-parser`
  - Security Headers: `helmet`
  - CORS: `cors` (mendukung kredensial dari `http://localhost:3000`)
  - Request Logger: `morgan`
- **Validasi Skema**: Zod (`zod: ^4.6.7`) di boundary request handler (body, params, query)
- **Media / Cloud Storage**: Cloudinary SDK (`cloudinary: ^2.11.0`)
- **Package Manager & Perintah**:
  - Package Manager: `npm`
  - Jalankan Dev Server: `npm run dev` (`tsx watch --env-file=.env src/server.ts`)
  - Build Produksi: `npm run build` (`tsc`)
  - Jalankan Produksi: `npm run start` (`node --env-file=.env dist/server.js`)
  - Prisma Sync / Generate: `npx prisma generate` / `npx prisma db push`

---

## 2. Struktur Direktori Baku

Mengikuti standar `coding-style` (Feature-based Modular / Ivan's DNA):

```text
backend/
├── docs/                             # Dokumentasi spesifik backend (PRD, project-config)
├── prisma/
│   └── schema.prisma                 # Skema model data PostgreSQL Prisma
├── src/
│   ├── app.ts                        # Setup middleware Express, CORS, cookie, router utama
│   ├── server.ts                     # Entry point server listener & DB bootstrap
│   ├── config/                       # Konfigurasi env & database
│   │   ├── env.config.ts             # Validasi variabel lingkungan via Zod
│   │   └── db.config.ts              # PrismaClient singleton instance dengan pg adapter
│   ├── features/                     # Modul per fitur (terisolasi)
│   │   ├── auth/                     # Autentikasi, login, logout, profile, session me
│   │   ├── projects/                 # CRUD proyek, pipeline status, editor PRD markdown
│   │   ├── tasks/                    # Kanban tasks, update status/urutan, warning DP
│   │   ├── finance/                  # Termin pembayaran, verifikasi DP, audit log finansial
│   │   ├── assets/                   # Metadata aset desain, signature/upload handler
│   │   └── activity/                 # Audit trail & riwayat aktivitas proyek
│   ├── routes/
│   │   └── index.ts                  # Agregator router seluruh fitur (/api/v1)
│   └── shared/                       # Utilitas, error handler, dan middleware bersama
│       ├── errors/                   # AppError, BadRequestError, UnauthorizedError, NotFoundError
│       ├── middlewares/              # validateRequest (Zod), requireAuth, errorHandler
│       └── utils/                    # asyncHandler, responseFormatter (ApiResponse<T>)
```

---

## 3. Aturan Arsitektur & Gaya Koding (Ivan's DNA)

1. **Alur 4 Lapisan Backend**:
   `routes` ➔ `controller` ➔ `service` ➔ `repository` (validasi batas via Zod `schema`)
   - **Routes**: Mendaftarkan endpoint HTTP dan middleware validasi skema Zod.
   - **Controller**: Menerima request HTTP, mengekstrak data tervalidasi, memanggil service, mengembalikan respons terstandar (`res.status(code).json({ success: true, message, data })`).
   - **Service**: Pusat logika bisnis, otorisasi, dan orkestrasi aktivitas. Melempar `AppError` saat kondisi bisnis gagal.
   - **Repository**: Akses database murni melalui Prisma Client.
   - **Schema**: Validasi ketat format data request body, params, dan query string.
2. **Public API Enforced**:
   - Rute di-expose melalui `features/<fitur>/<fitur>.routes.ts` dan diagregasi di `src/routes/index.ts`.
   - Modul luar dilarang mengakses repository langsung lintas fitur.
3. **Pemisahan `shared/`**:
   - `shared/` tidak boleh mengimpor dari `features/`.
4. **Standard Error Handling & Async Wrapper**:
   - Seluruh route handler dibungkus dengan `asyncHandler` agar error ditangkap otomatis oleh global `errorHandler`.
   - Menggunakan `AppError` terstruktur dengan HTTP status code yang jelas.
5. **Clean Code & YAGNI**:
   - Kode bersih, ringkas, penamaan variabel/fungsi deskriptif berbahasa Inggris/campuran konsisten.
   - Strict typing (hindari tipe `any`).

---

## 4. Alur Kerja Git & Commit

- **Base Branch**: `main`
- **Branch Fitur**: `feat/us-<N>-<slug>` (1 User Story = 1 branch git terisolasi)
- **Format Commit**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
- **Aturan Mutlak Eksekusi**:
  - Agent **hanya membaca status** (`git status`, `git diff`, `git log`) dan membuat branch lokal baru (`git switch -c`).
  - `git add`, `git commit`, `git push`, dan `git merge` **selalu dieksekusi oleh manusia** di terminal.
