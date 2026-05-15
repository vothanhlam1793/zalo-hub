# Deploy — Zalo Hub

## Development

### Backend (`backend/`)

Chạy PostgreSQL + MinIO bằng Docker, backend chạy trực tiếp bằng tsx:

```bash
cd backend

# 1. Copy env
cp .env.example .env
# Sửa DB_PASSWORD, JWT_SECRET, MINIO_PASSWORD nếu cần
# Mặc định: DB_PASSWORD=zalohub, JWT_SECRET=zalohub-dev-secret-change-in-production

# 2. Khởi động PostgreSQL + MinIO
docker compose up -d postgres minio

# 3. Chạy migration
npx knex migrate:latest

# 4. (Nếu có dữ liệu SQLite cũ) Migrate sang PostgreSQL
npx tsx scripts/migrate-sqlite-to-pg.ts

# 5. Chạy server dev
npm run server:dev
# → http://localhost:3399

# 6. (Tuỳ chọn) Chạy admin SPA dev
npm run admin:dev
# → http://localhost:3401
```

### Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3400
# Proxy /api → localhost:3399, /ws → localhost:3399
```

### Truy cập

| URL | Mô tả |
|-----|-------|
| `http://localhost:3400` | Chat app |
| `http://localhost:3400/admin` | Admin page (nút gear ⚙ trong sidebar) |
| `http://localhost:3401` | Admin SPA standalone dev |
| `http://localhost:3399/api/health` | Backend health |
| `http://localhost:9001` | MinIO console |

### Tài khoản mặc định

| Email | Password | Role |
|-------|----------|------|
| `admin@zalohub.local` | `admin123` | super_admin |

---

## Production Deploy

### 1. Build

```bash
# Backend
cd backend
npm install
npm run build          # tsc + admin:build
# → dist/server/ (Express)
# → dist/admin/   (Admin SPA static)

# Frontend
cd ../frontend
npm install
npm run build
# → dist/ (Chat SPA static)
```

### 2. Docker (Backend services)

```bash
cd backend

# Cấu hình biến môi trường
cat > .env << 'EOF'
DB_PASSWORD=<mật khẩu mạnh>
JWT_SECRET=<chuỗi ngẫu nhiên dài>
MINIO_USER=zalohub
MINIO_PASSWORD=<mật khẩu MinIO mạnh>
EOF

# Khởi động toàn bộ stack
docker compose up -d
# → PostgreSQL :5432
# → MinIO :9000 (+ console :9001)
# → Backend :3399
```

### 3. Chạy migration + migrate dữ liệu cũ

```bash
cd backend

# Migration DB
npx knex migrate:latest

# Migrate data từ SQLite (nếu có data/gold-4.sqlite)
npx tsx scripts/migrate-sqlite-to-pg.ts
```

### 4. Nginx

Copy file config và reload:

```bash
sudo cp backend/deploy/nginx-zalohub.conf /etc/nginx/sites-enabled/zalohub.conf
sudo nginx -t && sudo systemctl reload nginx
```

Cập nhật đường dẫn trong nginx config:
- `root /opt/zalohub/frontend/dist;` → trỏ tới thư mục dist của frontend
- SSL cert/key → tạo bằng certbot hoặc dùng cert sẵn có

### 5. Verify

```bash
# Backend
curl -sk https://zalo.camerangochoang.com/api/health

# Frontend
curl -sk https://zalo.camerangochoang.com/

# Admin
curl -sk https://zalo.camerangochoang.com/admin/

# WebSocket
wscat -c wss://zalo.camerangochoang.com/ws
```

---

## Backup

### PostgreSQL

```bash
# Backup
docker exec zalohub-postgres-1 pg_dump -U zalohub zalohub > backup-$(date +%Y%m%d).sql

# Restore
docker exec -i zalohub-postgres-1 psql -U zalohub zalohub < backup-20250515.sql
```

### MinIO (media files)

```bash
# Backup toàn bộ bucket
mc mirror minio/zalohub-media ./backup-media/

# Hoặc copy trực tiếp volume
cp -r backend/docker-data/minio ./backup-minio-$(date +%Y%m%d)/
```

### Cả 2 database + media

```bash
# Backup toàn bộ docker volumes
tar -czf zalohub-backup-$(date +%Y%m%d).tar.gz \
  backend/docker-data/pgdata \
  backend/docker-data/minio

# Restore
docker compose down
tar -xzf zalohub-backup-YYYYMMDD.tar.gz
docker compose up -d
```

---

## Chuyển Server

```bash
# Trên server cũ
cd ~/zalohub
docker compose -f backend/docker-compose.yml down
tar -czf zalohub-transfer.tar.gz backend/docker-data/ frontend/dist/

# Copy sang server mới
scp zalohub-transfer.tar.gz user@new-server:~/zalohub/

# Trên server mới
cd ~/zalohub
tar -xzf zalohub-transfer.tar.gz
cd backend
docker compose up -d
npx knex migrate:latest

# Cập nhật nginx config trỏ tới server mới
```

---

## Troubleshooting

### Backend không khởi động

```bash
# Kiểm tra PostgreSQL đã chạy chưa
docker compose ps postgres

# Kiểm tra log backend
docker compose logs backend

# Kiểm tra migration đã chạy chưa
npx knex migrate:status

# Kiểm tra kết nối DB
docker compose exec postgres psql -U zalohub -d zalohub -c "SELECT 1"
```

### MinIO không nhận file

```bash
# Kiểm tra MinIO chạy chưa
docker compose ps minio

# Kiểm tra bucket đã tạo chưa
docker compose exec minio mc ls local/zalohub-media

# Tạo bucket nếu chưa có
docker compose exec minio mc mb local/zalohub-media
```

### WebSocket không kết nối

```bash
# Kiểm tra WebSocket endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" \
  http://localhost:3399/ws
# Phải trả về HTTP 101 Switching Protocols

# Kiểm tra nginx proxy
nginx -T | grep -A5 "location /ws"
# Phải có: proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade;
```

### Admin page không load

```bash
# Build lại admin SPA
npm run admin:build

# Kiểm tra file đã build
ls dist/admin/index.html
ls dist/admin/assets/

# Kiểm tra nginx proxy /admin/ → backend :3399/admin/
```

### Sau khi sửa code backend

```bash
cd backend
npm run build                             # tsc + admin:build
docker compose up -d --build backend      # rebuild + restart (nếu dùng Docker)
# hoặc
# kill process cũ + npm run server:dev    # nếu chạy trực tiếp
```

### Sau khi sửa code frontend

```bash
cd frontend
npm run build
# Copy dist/ lên server
```

---

## Port Map

| Port | Service | Môi trường |
|------|---------|------------|
| 3399 | Backend Express | Dev + Production |
| 3400 | Frontend Vite | Dev only |
| 3401 | Admin Vite | Dev only |
| 5432 | PostgreSQL | Dev + Production |
| 9000 | MinIO API | Dev + Production |
| 9001 | MinIO Console | Dev + Production |
| 443  | Nginx | Production only |

---

## Infrastructure Architecture

```
Internet
  │
  ▼
svr12.creta.vn  (nginx proxy, SSL termination)
  │
  │  /           → serve static /var/www/zalohub-frontend/dist
  │  /api/*      → proxy_pass → 10.7.0.21:3399
  │  /ws         → proxy_pass → 10.7.0.21:3399  (WebSocket upgrade)
  │  /admin      → proxy_pass → 10.7.0.21:3399/admin
  │  /media/*    → proxy_pass → 10.7.0.21:9000/zalohub-media/
  │
  ▼
10.7.0.21  (application host)
  ├── Node.js backend :3399  (started via tmux session "zalohub")
  ├── Docker: backend-postgres-1  (127.0.0.1:5433→5432)
  └── Docker: backend-minio-1     (0.0.0.0:9000-9001)
```

Frontend static assets live on **svr12** (nginx serves directly).
Backend, PostgreSQL, and MinIO run entirely on **10.7.0.21**.

---

## Changelog

### 2026-05-15 — Performance + Media + Code fixes

#### Đã sửa

**1. PostgreSQL connection pool leak**
- `AccountRuntimeManager` và mỗi `GoldRuntime` đều tạo `GoldStore()` riêng → mỗi cái mở pool PostgreSQL riêng → cạn connection (`too many clients`).
- **Fix**: Cho toàn bộ runtime dùng chung một `knex` pool. `AccountRuntimeManager` nhận `knex` từ constructor.

**2. JSONB parsing errors**
- PostgreSQL JSONB columns trả về dạng object, nhưng code cũ dùng `JSON.parse(string)`.
- **Fix**: `account-repo.ts`, `group-repo.ts`, `message-repo.ts`, `conversation-repo.ts` thêm guard `typeof === 'string' ? JSON.parse() : raw`.

**3. MinIO media 502 bad gateway**
- MinIO port chỉ bind `127.0.0.1:9000` → svr12 không proxy được.
- Bucket `zalohub-media` chưa set anonymous read → trả 403.
- **Fix**: Bind `0.0.0.0:9000`, set bucket policy: `anonymous download`.

**4. Frontend request loop → `ERR_INSUFFICIENT_RESOURCES`**
- `App.tsx` effect load bootstrap có dependency `workspace` → mỗi lần store thay đổi chạy lại → spam `api.accounts()` + `api.myAccounts()`.
- **Fix**: Dùng `useRef` flag `initialBootstrapDoneRef`, chỉ chạy 1 lần.

**5. Self-sent messages not appearing**
- Sau khi gửi, frontend refetch messages nhưng chỉ cập nhật cache, không gọi `setMessages`.
- **Fix**: `useComposer.ts` gọi `setMessages(next)` sau khi merge cache.

**6. QR login moved to `/admin` only; removed from chat interface**
- Toàn bộ QR login giờ chỉ ở backend admin (`/admin`): nút "Thêm tài khoản (QR)" + "Quét QR" cho account mất kết nối.
- Frontend chat: nút `+` ở MiniSidebar chuyển hướng sang `/admin`.
- **API mới**: `POST /api/admin/accounts/:id/reconnect`, `GET /api/admin/accounts/:id/reconnect/qr`.

**7. Account visibility toggle (hide from MiniSidebar)**
- Thêm cột `visible` vào `zalo_account_memberships`.
- **API mới**: `PUT /api/me/accounts/:id/visible`.
- Switch "Hiện/Ẩn" trong MyAccountsTab cả 2 bên frontend + admin.
- MiniSidebar lọc account theo `visible`.

**8. Conversation open performance**
- **Nguyên nhân**: Mỗi lần bấm conversation, backend chạy `syncConversationMetadata()`:
  - `canonicalizeConversationDataForAccount()` — scan TOÀN BỘ messages account, UPDATE từng dòng, DELETE rồi INSERT lại cả bảng conversations (~100-200 queries).
  - `hydrateConversationsFromStore()` — load tất cả messages của tất cả conversations vào RAM (nhiều chục query).
  - `enrichConversationMessageSendersByAccount()` — resolve sender names rồi rewrite messages.
- **Fix**:
  - `canonicalize` + `hydrate` chỉ chạy 1 lần lúc login/warmStart (đã có sẵn trong `loginWithCredential`).
  - Bỏ 3 operations nặng khỏi `syncConversationMetadata()` — giờ chỉ refresh contact/group metadata từ Zalo.
  - Frontend: fetch `messages` song song với `sync-metadata` (không cần đợi metadata sync xong mới hiện tin).
  - `hasMoreHistory = true` luôn khi mở chat — nút "Kéo lên để tải thêm tin cũ" luôn hiện.
  - Debounce scroll handler 150ms.

#### Files đã sửa

| File | Change |
|------|--------|
| `backend/src/server/index.ts` | Pass `knex` to `AccountRuntimeManager` |
| `backend/src/server/account-manager.ts` | Share `knex` pool |
| `backend/src/core/store/account-repo.ts` | JSONB parse guard |
| `backend/src/core/store/group-repo.ts` | JSONB parse guard |
| `backend/src/core/store/message-repo.ts` | JSONB parse guard |
| `backend/src/core/store/conversation-repo.ts` | JSONB parse guard (×2) |
| `backend/src/core/runtime/sync.ts` | Remove canonicalize/hydrate/enrich from `syncConversationMetadata` |
| `backend/docker-compose.yml` | MinIO bind `0.0.0.0:9000` |
| `backend/run-migrations.mjs` | Add `visible` column |
| `backend/src/server/routes/admin.ts` | Reconnect + visible APIs |
| `backend/src/admin/components/QrLoginDialog.tsx` | Reconnect mode |
| `backend/src/admin/components/MyAccountsTab.tsx` | Reconnect + visible toggle |
| `backend/src/admin/api.ts` | Reconnect + visible APIs |
| `frontend/src/App.tsx` | Bootstrap loop fix + scroll debounce + setMessages |
| `frontend/src/hooks/useConversationManager.ts` | Parallel fetch + hasMoreHistory=true + no auto-sync |
| `frontend/src/hooks/useComposer.ts` | setMessages after send |
| `frontend/src/components/MiniSidebar.tsx` | Remove QR, filter visible |
| `frontend/src/components/MyAccountsTab.tsx` | Visible toggle |
| `frontend/src/api.ts` | Visible + reconnect APIs |
