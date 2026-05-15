# GOLD — Quy Ước Phát Triển Dự Án

## Gold là gì?

**Gold là milestone ngắn hạn, không phải folder hay module.**

Mỗi `gold-N` là một tập tính năng được chốt, prove, và ghi kết quả trong một sprint.
Sau khi done, kết quả được lưu vào `archived/GOLD-N-RESULT.md`.

**Không bao giờ tạo folder `gold-N` trong `src/`.**

---

## Cấu trúc `src/` hiện tại

```
src/
  core/      Zalo runtime core: login, reconnect, send/receive, store, logger
  server/    Backend Express + WebSocket + REST API
    index.ts     Entry point backend
    client/      Fallback UI HTML cũ (giữ để debug/fallback)
  web/       Frontend React chính
```

Khi thêm tính năng mới, code đi vào đúng folder theo vai trò:
- Logic Zalo / session / data local → `src/core/`
- API endpoint / WebSocket handler → `src/server/`
- UI React / component / hook → `src/web/`

---

## Cấu trúc `archived/`

```
archived/
  GOLD-1-RESULT.md        Kết quả gold-1: CLI runtime Zalo
  GOLD-2-RESULT.md        Kết quả gold-2: Web UI cơ bản
  GOLD-3-RESULT.md        Kết quả gold-3: Chat 1-1 realtime
  GOLD-5-RESULT.md        Kết quả gold-5: Refactor src + tài liệu
  GOLD-6-RESULT.md        Kết quả gold-6: Contacts + Groups + Conversations
  GOLD-7-RESULT.md        Kết quả gold-7: History sync + canonical + metadata
  GOLD-8-RESULT.md        Kết quả gold-8: Foundation multi-account
  gold-1.md               Spec gốc gold-1
  PLAN1.md                Tài liệu kế hoạch kiến trúc ban đầu

  ARCHITECTURE_V1.md      Kiến trúc shared inbox 2-service (tham khảo)
  DOMAIN_MODEL_V1.md      Domain model V1 (tham khảo)
  EVENT_CONTRACTS_V1.md   Event contracts V1 (tham khảo)
  POSTGRES_SCHEMA_V1.md   Schema Postgres V1 (tham khảo)
  CHATWOOT_FIT_GAP_V1.md  Đánh giá Chatwoot fit/gap (tham khảo)

  src-chat-server/        Source chat-server từ kiến trúc 2-service ban đầu
                          Vai trò thiết kế: shared inbox domain (workspace,
                          contact, conversation, message, assignment, labels).
                          Chưa chạy thực tế. Lưu để tham khảo domain model
                          nếu sau này mở rộng sang multi-user shared inbox.

  src-zalo-service/       Source zalo-service từ kiến trúc 2-service ban đầu
                          Vai trò thiết kế: Zalo channel connector tách riêng
                          (QR login, credential, reconnect, sync contacts,
                          send/receive). Đã được thay thế bởi src/core/ trong
                          mô hình monolith nhỏ hiện tại. Lưu để tham khảo
                          nếu sau này cần tách service thật sự.
```

---

## Lịch sử các gold

| Gold | Mục tiêu | Trạng thái | Kết quả |
|------|-----------|-----------|---------|
| gold-1 | CLI runtime Zalo: login QR, friends, send text | Done | `archived/GOLD-1-RESULT.md` |
| gold-2 | Web UI cơ bản: login, friends, send | Done | `archived/GOLD-2-RESULT.md` |
| gold-3 | Chat 1-1 realtime: websocket, timeline, incoming | Done | `archived/GOLD-3-RESULT.md` |
| gold-4 | App hoàn chỉnh 1 user: SQLite, React UI, image/file, public domain | Done | `archived/gold-4.md` |
| gold-5 | Refactor cấu trúc src + tài liệu convention gold | Done | `archived/GOLD-5-RESULT.md` |
| gold-6 | Contacts + Groups + Conversations: 3 tab UI, group chat realtime, refactor conversation model, lazy history, local media mirror, legacy attachment repair | Done | `archived/GOLD-6-RESULT.md` |
| gold-7 | Recent/history sync từ Zalo, chống duplicate theo provider message id, canonical direct/group conversation, sync metadata khi mở chat, enrich sender name group và persist local DB | Done | `archived/GOLD-7-RESULT.md` |
| gold-8 | Foundation cho multi-account: runtime per account, AccountRuntimeManager, store explicit accountId, account-scoped API/WebSocket, frontend account switcher + QR overlay, warm-start nhiều account, data identity account-safe | Done | `archived/GOLD-8-RESULT.md` |
| gold-9 | System users + authentication + authorization theo từng Zalo account: schema system_users, sessions, memberships, middleware auth, UI login user hệ thống, phân quyền | Done | `archived/GOLD-9-RESULT.md` |
| gold-10 | Shared inbox workflow: assignment, notes, labels, trạng thái conversation, audit log | Planned | — |
| gold-11 | Advanced: presence, notification, analytics, multi-language, mobile PWA | Planned | — |

---

## Quy trình làm một gold mới

1. Viết spec ngắn vào root: `gold-N.md`
   - Mục tiêu
   - Phạm vi (scope)
   - Tiêu chí nghiệm thu
2. Implement vào đúng folder trong `src/` theo vai trò
3. Khi done, ghi kết quả vào `archived/GOLD-N-RESULT.md`
4. Cập nhật bảng lịch sử trong `GOLD.md`
5. Cập nhật `README.md` nếu cấu trúc hoặc hướng dẫn chạy thay đổi

---

## Nguyên tắc

1. **Folder theo vai trò, không theo thời gian.** `src/core/`, `src/server/`, `src/web/` — không phải `src/gold-5/`.
2. **Gold là mốc, không phải module.** Tính năng của gold-N vẫn nằm trong `src/core|server|web`.
3. **Không tách service sớm.** Chỉ tách khi có nhu cầu thực sự, không tách vì thiết kế.
4. **Kiến trúc cũ sống trong `archived/`.** Không xóa — lưu để tham khảo và không bị tái phát minh.
5. **Data không đổi tên theo gold.** `data/gold-4.sqlite` giữ nguyên tên cho đến khi có lý do migrate rõ ràng.

---

## Data và log

- DB local: `data/gold-4.sqlite` (tên giữ nguyên, không đổi theo gold)
- Log: `logs/app/` (các run log của backend)
- DB được scope theo `account_id` — mỗi tài khoản Zalo có dữ liệu riêng

---

## Deploy

- Public app: `https://zalo.camerangochoang.com`
- Backend host: `10.7.0.21:3399`
- Proxy: `root@svr12.creta.vn` / nginx

Runbook deploy:
```bash
npm run web:build     # build frontend static
npm run build         # compile TypeScript backend
# restart backend local tren 10.7.0.21
# app runtime hien tai can Node >= 22.15 de ho tro node:sqlite
# verify local:
#   curl -sk http://127.0.0.1:3399/api/status
# verify upstream IP:
#   curl -sk http://10.7.0.21:3399/api/status
# verify tu proxy host:
#   ssh root@svr12.creta.vn "curl -sv http://10.7.0.21:3399/api/status"
# verify public:
#   curl -sk https://zalo.camerangochoang.com/api/status
```

Proxy fact da duoc xac minh:

- `root@svr12.creta.vn` / nginx dang proxy `zalo.camerangochoang.com` -> `http://10.7.0.21:3399`
- Neu public `502 Bad Gateway`:
  1. kiem tra app host co listen o `127.0.0.1:3399`
  2. kiem tra host co reach duoc `10.7.0.21:3399`
  3. kiem tra `svr12` co reach duoc upstream `10.7.0.21:3399`
