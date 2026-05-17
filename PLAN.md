# Plan

Xem `GOLD.md` để hiểu quy trình phát triển, convention đặt tên, và lịch sử các gold.

## Mục Tiêu Hiện Tại

Sau gold-7, dự án đổi hướng từ app `1 user` sang nền tảng nhiều tài khoản Zalo active đồng thời, có user hệ thống và phân quyền theo từng tài khoản Zalo.

Những gì đã chốt lại về hướng đi:
- Không còn xem app là tool cá nhân cho `1 user`
- `Zalo account` là partition dữ liệu gốc cho contacts, groups, conversations, messages
- Hệ thống sẽ có nhiều `system user` nội bộ đăng nhập vào app
- Mỗi `system user` được cấp quyền vào một hay nhiều `Zalo account`
- Nhiều `Zalo account` phải có thể active listener đồng thời trong cùng hệ thống

## Scope Nền Tảng Đã Có

`src/core/` hiện có:

- `index.ts`: CLI menu
- `runtime.ts`: runtime login, reconnect, friends, send, receive, attachment
- `store.ts`: SQLite local — accounts, friends, conversations, messages, attachments
- `logger.ts`: log theo từng run
- `types.ts`: kiểu dữ liệu core

`src/server/` hiện có:

- `index.ts`: backend Express + WebSocket + REST API
- `client/`: fallback UI HTML cũ

`src/web/` hiện có:

- `App.tsx`: React app chính
- `api.ts`: client HTTP
- `useWebSocket.ts`: WebSocket hook
- `types.ts`: kiểu dữ liệu frontend

## Những Việc Đã Hoàn Tất

- Login và reconnect với credential local
- Friend sync
- Send text 1-1
- QR render trong terminal
- Log debug theo run
- Doctor pass
- Web login flow
- Web friend list
- Web send message
- Web logout
- Web chat 1-1
- Incoming message listener
- WebSocket realtime
- Incoming image/file/video render
- Outgoing attachment multipart
- SQLite local history
- React UI
- Public domain qua proxy
- Refactor cấu trúc src/ theo vai trò (gold-5)
- Tài liệu convention gold (gold-5)

## Gold-6 — Done

Mục tiêu đã chốt: Contacts + Groups + Conversations

Những gì đã done:

1. Có 3 tab UI:
   - `Cuộc trò chuyện`
   - `Bạn bè`
   - `Nhóm`
2. `Bạn bè` có tìm kiếm và mở direct conversation
3. `Nhóm` có tìm kiếm và mở group conversation
4. Domain local đổi từ `friendId -> messages` sang `conversationId = direct:<id> | group:<id>`
5. Sync được danh sách group
6. Chat được với group
7. Nhận được direct/group message realtime
8. UI group conversation hiển thị tên người gửi cho incoming message
9. Lazy load history theo `before + limit`
10. Incoming/outgoing attachment được mirror vào app server local storage `data/media/`
11. Backend serve media qua `/media/*`
12. Repair dữ liệu cũ:
    - chuẩn hóa lại `kind`
    - chuẩn hóa lại `attachments`
    - backfill file cũ còn nguồn về local storage
13. Case legacy `share.file`/`text + image_url + filename` được canonicalize về file attachment thay vì neo text

Ghi chú trạng thái:

- gold-6 đã pass nghiệm thu
- dữ liệu cũ được cứu tối đa trong phạm vi còn source/raw payload

## Gold-7 — Done

Mục tiêu đã chốt: Recent/history sync + canonical conversation identity + metadata sync khi mở chat

Những gì đã done:

1. Có history sync nội bộ từ runtime bằng `listener.requestOldMessages(...)`
2. Merge old history vào local DB và dedupe ưu tiên theo `provider_message_id`
3. Canonicalize dữ liệu local từ `direct:<groupId>` sai về `group:<groupId>` đúng dựa trên raw payload
4. Rebuild `conversations` từ `messages` canonical thay vì giữ summary sai cũ
5. Khi mở conversation, backend sync lại metadata của contact/group rồi persist vào DB local
6. Với group conversation, backend enrich lại `senderName` cho messages và ghi lại DB
7. Fallback `raw_message_json.dName` được dùng để lấp tên sender khi metadata member chưa đủ
8. Frontend gọi sync metadata trước khi load chat, sau đó reload conversation/messages từ DB đã cập nhật
9. Frontend có guard chống stale async update khi đổi conversation nhanh và cache per-conversation để UI mượt hơn

Ghi chú trạng thái:

- gold-7 đã pass nghiệm thu
- remote history hiện tại vẫn dựa trên runtime/session của Zalo package, không phải API cloud chính thức độc lập
- trong phạm vi app `1 user`, local DB hiện đã được reconcile/canonical tốt hơn và đủ dùng thực tế

## Gold-8 — Done ✅

Mục tiêu đã chốt: Foundation cho multi-account runtime.

Những gì đã done:

1. `1 runtime = 1 account` — `GoldRuntime` có `boundAccountId`, xóa `activateAccount`, guard credential mismatch
2. `AccountRuntimeManager` — quản lý nhiều runtime, tạo runtime per account, warm-start tất cả account lúc boot
3. Store explicit `accountId` — thêm lớp API `*ByAccount` cho toàn bộ read/write lõi, runtime path chính không còn phụ thuộc `activeAccountId`
4. Data identity account-safe — `messages.id` và `attachments.id` namespace theo `accountId`
5. Account-scoped API routes — route mới `GET/POST /api/accounts/:accountId/...` là flow chính, route cũ là compatibility wrapper
6. WebSocket account-scoped — subscribe theo `{ accountId, conversationId }`, frontend filter event theo workspace account
7. Frontend multi-account UI — account sidebar switcher, QR overlay thêm/re-login account, cache partition `accountId::conversationId`, header hiển thị account đang chọn, nút Làm mới đã sửa
8. Server hybrid cleanup — route legacy về wrapper, QR endpoint trả 200 thay vì 404, logout theo active account

Nghiệm thu thực chiến:
- ✅ 3 tài khoản Zalo active đồng thời
- ✅ Switch account, realtime, send message, restart warm-start đều pass
- ✅ Public domain ổn định: `https://zalo.camerangochoang.com`

Ghi chú trạng thái:
- Còn giữ `primary account` và `loginRuntime` singleton để compatibility
- `GoldStore` còn `activeAccountId` làm wrapper cho compatibility
- Full profile field mở rộng và `system_users` schema sẽ vào gold-9

## Gold-9 — Done ✅

Mục tiêu: System users + auth + phân quyền + Zalo rich features + admin UI

Đã hoàn tất (xem `archived/GOLD-9-RESULT.md`):

- **Gold-8.5**: Zustand stores, React Router, Tailwind CSS v4, shadcn/ui 18 components
- **Gold-9A**: DB schema `system_users/sessions/memberships`, JWT auth, login/logout/me API, middleware `requireAuth`, seed admin
- **Gold-9B**: 9 MessageKind (sticker, reaction, poll, voice, gif), backend sender methods + REST endpoints, typing indicator, history sync continuous loop, per-conversation + account-level sync buttons
- **Gold-9C**: AdminPage v2 (users/Zalo accounts/phân quyền matrix), admin API, `requireSystemRole('admin')`, `requireAccountAccess(minRole?)`, auto-assign admin owner

## Post Gold-9 — Done ✅

Mục tiêu: Internal unread system + multi-account badge UI + listener stability

Đã hoàn tất:

- **Unread nội bộ Hub**: bỏ dependency Zalo `getUnreadMark()`, thay bằng `last_read_at` trong DB + derive unread từ `SELECT COUNT(*) WHERE timestamp > last_read_at`
- **WS increment**: mỗi tin incoming và không có WS subscriber nào xem → `last_read_at` giữ nguyên → unread tăng
- **Read-state API**: `POST /api/accounts/:id/conversations/:cid/read-state` lưu mốc đọc, broadcast summaries
- **MiniSidebar badge**: tổng unread mỗi account + chấm trạng thái (xanh: active, vàng: có cred chưa active, xám: chưa login)
- **Contacts badge**: unread per contact trong tab "Bạn bè"
- **conversationsByAccount**: lưu list conversation riêng từng account để tính unread toàn cục
- **Optimistic mark-read**: UI clear unread ngay khi click, sync với backend qua pendingReadAtByConversation
- **Listener restart storm fix**: set `started=true` khi reconnect, watchdog skip restart nếu `connected=true`

## Gold-10 — Planned

Mục tiêu: Shared inbox workflow cho team vận hành

Scope dự kiến:

1. Assignment conversation
2. Internal notes
3. Labels/tags
4. Trạng thái conversation: `open/pending/closed`
5. Audit log: ai gửi, ai gán, ai đổi quyền, ai thao tác account
6. Presence/collaboration cơ bản trong UI

## Những Việc Không Còn Là Ưu Tiên Trực Tiếp

- `chat-server` / `zalo-service` (đã chuyển vào `archived/`)
- Event contracts / Postgres / Chatwoot integration
- Tách websocket thành service riêng khi chưa prove được nhu cầu tải thực tế
- Tách nhiều process/service quá sớm trước khi chốt xong account manager + permissions trong monolith hiện tại
