# Plan

Xem `GOLD.md` để hiểu quy trình phát triển, convention đặt tên, và lịch sử các gold.

## Mục Tiêu Hiện Tại

Sau gold-5, hướng phát triển tiếp theo là gold-6.

gold-5 đã chốt:
- Refactor cấu trúc `src/` theo vai trò (`core/`, `server/`, `web/`)
- Tạo `GOLD.md` định nghĩa convention gold
- Cập nhật README và PLAN

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
- chưa có history API chính thức từ Zalo package để mỗi lần mở conversation pull full remote history rồi reconcile tự động

## Gold-7 — Planned

Mục tiêu: Recent/history sync từ Zalo theo hướng có remote history thật

Scope dự kiến:

1. Research/reverse khả năng tải recent/history từ Zalo package/runtime hoặc `custom`
2. Sync danh sách conversation gần nhất từ Zalo
3. Sync incremental message history từ remote source thật
4. Reconcile local DB với remote history theo `provider_message_id` và canonical attachment shape

## Gold-8 — Planned

Mục tiêu: Account profile + avatar

Scope dự kiến:

1. Lấy đầy đủ self profile từ `fetchAccountInfo()` — bao gồm avatar
2. Expose qua `/api/status`
3. Hiển thị avatar account ở sidebar
4. Hiển thị avatar thật của contact/group trên UI
5. Enrich profile contact/group khi cần

## Những Việc Không Còn Là Ưu Tiên Trực Tiếp

- `chat-server` / `zalo-service` (đã chuyển vào `archived/`)
- Event contracts / Postgres / Chatwoot integration
- Tách websocket thành service riêng
- Multi-user shared inbox (chưa có nhu cầu thực)
