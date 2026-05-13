# Gold-5 Result

## Mục tiêu

Refactor cấu trúc `src/` theo vai trò thay vì mốc thời gian, và tạo tài liệu định nghĩa convention gold để các giai đoạn sau không nhầm lẫn.

## Kết quả

Đạt.

## Thay đổi cấu trúc

**Trước:**
```
src/
  gold-1/       runtime Zalo core
  gold-2/       backend Express + client HTML
  gold-4-web/   frontend React
  chat-server/  kiến trúc cũ, không dùng
  zalo-service/ kiến trúc cũ, không dùng
```

**Sau:**
```
src/
  core/     Zalo runtime core (từ gold-1/)
  server/   Backend Express + WebSocket + REST API (từ gold-2/)
  web/      Frontend React (từ gold-4-web/)

archived/
  src-chat-server/   (từ src/chat-server/)
  src-zalo-service/  (từ src/zalo-service/)
```

## Thay đổi file

| File | Thay đổi |
|------|---------|
| `src/server/index.ts` | Import path `../gold-1/*` → `../core/*` |
| `src/server/index.ts` | Dist path `dist/gold-4-web` → `dist/web` |
| `src/core/logger.ts` | Log dir `logs/gold-1` → `logs/app` |
| `src/core/index.ts` | Prefix `[gold-1]` → `[cli]`, script names |
| `src/web/vite.config.ts` | outDir `../../dist/gold-4-web` → `../../dist/web` |
| `tsconfig.json` | Exclude `src/gold-4-web/**/*` → `src/web/**/*` |
| `package.json` | Scripts đổi tên (xem bên dưới) |
| `gold.sh` | Gọi `cli:menu` thay vì `gold:menu` |

## Scripts mới

| Script | Chức năng |
|--------|----------|
| `npm run server:dev` | Chạy backend (thay `gold2:web`) |
| `npm run web:dev` | Chạy frontend dev (thay `gold4:web`) |
| `npm run web:build` | Build frontend static (thay `gold4:build`) |
| `npm run cli:menu` | CLI menu tương tác (thay `gold:menu`) |
| `npm run cli:login` | CLI login QR (thay `gold:login`) |
| `npm run cli:friends` | CLI tải danh bạ (thay `gold:friends`) |
| `npm run cli:doctor` | CLI kiểm tra session (thay `gold:doctor`) |
| `npm run cli:send` | CLI gửi tin nhắn (thay `gold:send`) |

## Tài liệu tạo mới

- `GOLD.md` — định nghĩa convention gold, lịch sử các gold, quy trình phát triển
- `README.md` — cập nhật cấu trúc và scripts mới
- `PLAN.md` — cập nhật hướng phát triển gold-6

## Verify

- TypeScript compile: pass (no errors)
- Frontend build (`npm run web:build`): pass, output vào `dist/web/`
- `dist/` đã dọn sạch các thư mục build cũ

## Ghi chú

- `data/gold-4.sqlite` giữ nguyên tên — không đổi để tránh rủi ro mất data
- `logs/app/` là thư mục log mới (tạo tự động khi chạy)
- Vite yêu cầu Node.js ≥ 20.19 hoặc ≥ 22.12 — build cần dùng đúng Node version
