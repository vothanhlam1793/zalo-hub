# GOLD-8-RESULT

## Trạng Thái
✅ **Done** — Foundation multi-account đã pass nghiệm thu thực chiến với 3 tài khoản Zalo active đồng thời.

## Mục Tiêu Ban Đầu
Từ `gold-8.md`: đặt nền data model, runtime direction, API direction và permission direction cho nền tảng nhiều tài khoản Zalo active đồng thời.

## Những Gì Đã Đạt

### 1. Runtime Per Account Thật Sự
- `GoldRuntime` giờ có `boundAccountId`, constructor nhận `options: { boundAccountId?: string }`
- `1 runtime = 1 account` là sự thật duy nhất
- Đã xóa `GoldRuntime.activateAccount(accountId)` — không còn semantics switch-account
- `startBoundAccount()` bắt buộc runtime phải có `boundAccountId`
- Guard kiểm tra credential login khớp với account đã bind

### 2. AccountRuntimeManager
- `src/server/account-manager.ts` — quản lý nhiều runtime qua `Map<accountId, GoldRuntime>`
- `ensureRuntime(accountId)` — tạo runtime với `{ boundAccountId: accountId }`, cache runtime
- `warmStartAllAccounts()` — restore nhiều account lúc boot
- Mỗi runtime có store instance riêng, listener riêng, cache riêng
- Lỗi reconnect của 1 account không làm ảnh hưởng các account khác

### 3. Store Explicit AccountId Cho Runtime Path Chính
- `GoldStore` thêm các API explicit theo `accountId`:
  - `listContactsByAccount`, `listGroupsByAccount`
  - `listConversationSummariesByAccount`, `listConversationMessagesByAccount`
  - `replaceConversationMessagesByAccount`, `replaceContactsByAccount`, `replaceGroupsByAccount`
  - `upsertContactByAccount`, `upsertGroupByAccount`
  - `canonicalizeConversationDataForAccount`, `enrichConversationMessageSendersByAccount`
  - `clearSessionForAccount`, `hasMessageByProviderIdForAccount`
  - `updateAccountProfile`, `getCredentialForAccount`
- Hàm cũ giữ làm compatibility wrapper
- Helper private lookup (display name, avatar) giờ nhận `accountId` tham số
- Runtime path chính đã chuyển sang dùng các API explicit này
- Không còn correctness phụ thuộc ngầm vào `activeAccountId` trong luồng chính

### 4. Data Identity Account-Safe
- `messages.id` namespace theo account: `buildStoredMessageId(accountId, messageId)`
- `attachments.id` namespace theo account: `buildStoredAttachmentId(accountId, attachmentId)`
- Dedupe theo `provider_message_id` trong phạm vi account + conversation
- Không còn collision giữa nhiều account

### 5. Server Account-Scoped Routes
Route mới là flow chính, route cũ là compatibility wrapper:
- `GET /api/accounts` — danh sách account + trạng thái
- `POST /api/accounts/activate` — chọn workspace account
- `GET /api/accounts/:accountId/status` — trạng thái từng account
- `GET /api/accounts/:accountId/contacts` — contacts theo account
- `GET /api/accounts/:accountId/groups` — groups theo account
- `GET /api/accounts/:accountId/conversations` — conversations theo account
- `GET /api/accounts/:accountId/conversations/:conversationId/messages`
- `POST /api/accounts/:accountId/conversations/:conversationId/sync-metadata`
- `POST /api/accounts/:accountId/conversations/sync-history`
- `POST /api/accounts/:accountId/send`
- `POST /api/accounts/:accountId/send-attachment`
- `GET /api/accounts/:accountId/conversations`
- Route legacy được đánh dấu header `X-Gold-Legacy-Route`

### 6. WebSocket Account-Scoped
- Subscribe theo `{ accountId, conversationId }`
- Event message kèm `accountId`
- Frontend filter event theo `accountId` workspace hiện tại
- Realtime không lẫn giữa các account

### 7. Frontend Multi-Account UI
- **Sidebar account switcher**: hiển thị danh sách account, dot xanh cho account có session active
- **Nút +**: thêm tài khoản mới bằng QR, overlay hiện giữa màn hình
- **Re-login**: bấm account mất session tự mở QR overlay, quét xong tự chuyển workspace + `activateAccount`
- **QR overlay**: hiện QR ngay trên màn hình chính khi đang login/relogin, có nút Hủy
- **Cache partition**: `accountId::conversationId`
- **Header**: hiển thị account đang chọn, không phải primary
- **Nút Làm mới**: đã sửa truyền đúng `getWorkspaceAccountId()`
- **Send/sync/history**: toàn bộ dùng account-scoped APIs
- **Guard stale async**: token-based selection guard khi đổi conversation nhanh

### 8. Server Hybrid Cleanup
- Route cũ chuyển sang wrapper qua `getLegacyPrimaryContextOrRespond()`
- `logout` ưu tiên logout runtime của account đang active trong manager
- `GET /api/login/qr` trả `{ qrCode: null, ready: false }` thay vì 404

## Những Gì Chưa Nằm Trong Gold-8 (Giữ Cho Gold-9/10)
- `primary account` vẫn còn là khái niệm trong server (status, WebSocket bootstrap)
- `loginRuntime` singleton vẫn dùng cho QR login flow
- `GoldStore` vẫn giữ `activeAccountId` và wrapper compatibility
- Full profile field mở rộng: `profile_json`, `last_profile_sync_at`, `bio`, `gender`, `birth_date`, `cover_url`
- Schema `system_users`, `system_user_sessions`, `zalo_account_memberships`
- Auth/authorization cho user hệ thống

## Nghiệm Thu Thực Chiến
- ✅ 3 tài khoản Zalo active đồng thời (listener, session, runtime)
- ✅ Switch account load đúng workspace (contacts, groups, conversations)
- ✅ Gửi tin đúng account đang chọn
- ✅ Realtime không lẫn giữa các account
- ✅ Restart warm-start restore lại toàn bộ account
- ✅ Data không ghi đè chéo
- ✅ Thêm account mới bằng QR từ UI
- ✅ Re-login account mất session từ UI
- ✅ Public domain hoạt động ổn định: `https://zalo.camerangochoang.com`

## File Chính Đã Sửa Trong Gold-8

| File | Thay đổi |
|------|----------|
| `src/core/runtime.ts` | `boundAccountId`, constructor options, xóa `activateAccount`, guard credential mismatch, dùng store APIs explicit |
| `src/core/store.ts` | Thêm lớp API explicit theo account cho toàn bộ read/write lõi, helper lookup theo account, `updateAccountProfile` |
| `src/server/account-manager.ts` | Tạo runtime với `boundAccountId`, warm start |
| `src/server/index.ts` | Route legacy → wrapper, logout theo active account, QR endpoint 200 thay vì 404 |
| `src/web/App.tsx` | Account sidebar, QR overlay, re-login flow, cache account-scoped, header account đúng, fix nút Làm mới, `activateAccount` sau re-login |
| `src/web/api.ts` | Cập nhật kiểu `loginQr` |
| `src/web/useWebSocket.ts` | Subscribe theo `{ accountId, conversationId }` |
| `src/web/index.css` | CSS cho QR overlay |
