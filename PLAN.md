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

## Gold-9 — Planned

Mục tiêu: System users + authentication + authorization theo Zalo account + full profile storage

Scope dự kiến:

1. Mở rộng schema DB cho full profile:
   - `accounts` thêm `profile_json`, `last_profile_sync_at`, `bio`, `gender`, `birth_date`, `cover_url`, `avatar`
   - `friends` thêm `profile_json`, `last_profile_sync_at`
   - `groups` thêm `profile_json`, `last_profile_sync_at`
2. Thêm schema `system_users`, `system_user_sessions`, `zalo_account_memberships`
3. Auth flow: login/logout cho user hệ thống, session management
4. Role per account: `owner`, `manager`, `agent`, `viewer`
5. Middleware authorization cho toàn bộ API và WebSocket
6. UI chỉ hiện các account mà user hiện tại được cấp quyền
7. Dọn sạch `primary account` concept, chuyển `loginRuntime` sang manager-native
8. Dọn sạch `activeAccountId` trong store, bỏ compatibility wrapper

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
