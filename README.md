# Zalo Hub

App chat Zalo cho `1 user`, chạy trên nền backend Node.js + React frontend.

Xem `GOLD.md` để hiểu quy trình phát triển và ý nghĩa các mốc gold.

## Cấu trúc src/

```
src/
  core/     Zalo runtime: login, reconnect, store, send/receive, logger
  server/   Backend Express + WebSocket + REST API
  web/      Frontend React
```

## Tính năng hiện tại (tính đến gold-6)

1. Đăng nhập bằng QR
2. Reconnect bằng credential local sau restart
3. Tải danh sách bạn bè
4. Conversation list local theo account
5. Message history local bằng SQLite
6. Realtime text qua websocket
7. Render incoming image/file/video
8. Outgoing attachment qua backend multipart
9. Frontend React
10. Public domain qua proxy
11. UI 3 tab: cuộc trò chuyện / bạn bè / nhóm
12. Group chat realtime
13. Lazy load history
14. Local media mirror tại app server `data/media/`
15. Repair/backfill attachment cho dữ liệu cũ còn cứu được

## Chạy backend (server)

```bash
npm run server:dev
```

Mặc định chạy trên:

```
http://localhost:3399
```

## Chạy frontend (web)

Dev server:

```bash
npm run web:dev
```

Chạy trên:

```
http://localhost:3400
```

Build static:

```bash
npm run web:build
```

Output: `dist/web/`

## CLI (debug/phát triển backend)

```bash
npm run cli:menu      # menu tương tác
npm run cli:login     # login QR
npm run cli:friends   # tải danh sách bạn bè
npm run cli:doctor    # kiểm tra session
npm run cli:send -- --to <friendId> --text "hello"
```

Hoặc dùng script nhanh:

```bash
./gold.sh
```

## Data và log

- DB local: `data/gold-4.sqlite`
- Media local: `data/media/`
- Log: `logs/app/`

## Deploy / Public

- Public app: `https://zalo.camerangochoang.com`
- Backend host local: `10.7.0.21:3399`
- Proxy nginx: `root@svr12.creta.vn`

Public routing:

- `/` → frontend `dist/web/` được serve bởi backend `:3399`
- `/api/*` → backend `:3399`
- `/ws` → websocket `:3399`

Runbook deploy:

```bash
# 1. Build frontend
npm run web:build

# 2. Build TypeScript backend
npm run build

# 3. Restart backend local trên máy app (10.7.0.21)
# Lưu ý: app hiện cần Node >= 22.15 để dùng node:sqlite
# Ví dụ local runtime:
# export PATH="/tmp/opencode/node-v22.15.0-linux-x64/bin:$PATH"
# nohup npm run server:dev >/tmp/opencode/zalohub-server.log 2>&1 </dev/null &

# 4. Từ proxy host, xác nhận nginx đang trỏ đúng upstream
ssh root@svr12.creta.vn
# kiểm tra site config:
# nginx -T | grep -n 'zalo.camerangochoang.com\|10.7.0.21:3399'

# thường không cần reload nginx nếu upstream không đổi,
# chỉ reload khi chỉnh config:
nginx -t && systemctl reload nginx

# 5. Verify
curl -sk https://zalo.camerangochoang.com/
curl -sk https://zalo.camerangochoang.com/api/status

# 6. Nếu public 502, debug theo đúng hướng:
# từ app host:
# curl -sk http://127.0.0.1:3399/api/status
# curl -sk http://10.7.0.21:3399/api/status
# từ proxy host:
# ssh root@svr12.creta.vn "curl -sv http://10.7.0.21:3399/api/status"
```

## Quy trình test public

1. Build + restart app server trên `10.7.0.21`
2. Verify local backend trước:
   - `curl -sk http://127.0.0.1:3399/api/status`
3. Verify upstream IP listener:
   - `curl -sk http://10.7.0.21:3399/api/status`
4. Verify từ `svr12` tới upstream:
   - `ssh root@svr12.creta.vn "curl -sv http://10.7.0.21:3399/api/status"`
5. Sau đó mới verify public domain:
   - `curl -sk https://zalo.camerangochoang.com/`
   - `curl -sk https://zalo.camerangochoang.com/api/status`
6. Với attachment/media cũ, có thể chạy backfill:
   - `curl -sk -X POST https://zalo.camerangochoang.com/api/media/backfill`

## Archived

Tài liệu và source cũ được lưu trong `archived/` để tham khảo.
Xem `GOLD.md` để biết mô tả từng thư mục trong `archived/`.
