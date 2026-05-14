# Gold-9 — System Users + Auth + Zalo Rich Features

## Kết Quả Nghiệm Thu

### Gold-8.5: Hạ Tầng UI ✅

1. **Zustand stores** — 4 stores thay 15+ useState:
   - `auth-store.ts`: user, token, isLoading, isChecking, login/logout/checkSession
   - `workspace-store.ts`: selectedAccountId, sidebarTab, query, knownAccounts
   - `chat-store.ts`: conversations, contacts, groups, messages, resetChat
   - `composer-store.ts`: text, attachFile, sending, statusMsg, loadError
2. **React Router** — `/`, `/login`, `/admin` với AuthGuard
3. **Tailwind CSS v4** + `@tailwindcss/vite` plugin
4. **shadcn/ui** 18 component (Button, Input, Textarea, Badge, Dialog, Avatar, Tabs, Tooltip, Select, DropdownMenu, Table, Sonner, Skeleton, Label, Switch, Separator, Card, ScrollArea)
5. Cleanup: xóa `src/web/index.css` → backup `archived/index.css.backup`

### Gold-9A: Auth Cơ Bản ✅

1. **DB Schema** — `system_users`, `system_sessions`, `zalo_account_memberships`
2. **Auth API**:
   - `POST /api/auth/login` — email + password → JWT token (7d expiry)
   - `POST /api/auth/logout` — invalidate session
   - `GET /api/auth/me` — return user + memberships
3. **Password hash** — `crypto.scryptSync` salt:hash
4. **JWT middleware** — `requireAuth` verify token, gán `req.systemUserId`
5. **Seed admin** — `admin@zalohub.local / admin123`, type `human`
6. **LoginPage** — form email/password, validation, error display
7. **AuthGuard** — async `checkSession()`, loading state "Đang kiểm tra đăng nhập..."
8. **localStorage-first auth** — token + user JSON lưu localStorage, decode JWT client-side check expiry, không cần gọi `/api/auth/me` mỗi lần refresh

### Gold-9B: Zalo Rich Features ✅

1. **9 MessageKind** — `text | image | file | video | sticker | reaction | poll | voice | gif`
2. **Backend methods** trong `GoldSender` + REST endpoints:
   - `sendSticker(conversationId, stickerId, catId)`
   - `sendTypingEvent(conversationId, isTyping)`
   - `addReaction(conversationId, messageId, type)`
   - `createPoll(groupId, question, options)`
   - `forwardMessage(conversationId, messageId, toThreadId, toType)`
3. **Account-scoped endpoints** — `/api/accounts/:accountId/conversations/:id/sticker|reaction|typing|forward`
4. **Frontend API client** — `accountSendSticker`, `accountAddReaction`, `accountCreatePoll`, `accountForwardMessage`
5. **MessageBubble** — render sticker (ảnh), poll (question + options), reaction (emoji dưới bubble)
6. **ChatPanel** — typing indicator "X đang nhập..." qua prop `typingUsers`
7. **History sync loop** — `syncConversationHistory` continuous loop: mỗi batch `hasMore=true` → auto request tiếp với `providerMessageId`, timeout 45s/batch, max 240s total. Test: 27 batch, 351 remote messages
8. **Per-conversation sync button** — `🔄 Đồng bộ` trong ChatPanel header
9. **Account-level sync button** — `📱 Đồng bộ từ ĐT` trong Sidebar, gọi `POST /:accountId/sync-all`
10. **Mobile sync investigation** — `requestMobileSyncThread` gửi `req_18` text frame thử nghiệm, xác nhận `requestOldMessages` (cmd 510/511 binary) là protocol đúng cho bot

### Gold-9C: Admin + Phân Quyền ✅

1. **AdminPage v2** — Sidebar + Content layout với 3 section:
   - 👤 **Người dùng**: table inline Select đổi System Role, Dialog thêm/sửa user (displayName, role, type, password), xoá user
   - 📱 **Tài khoản Zalo**: card grid trạng thái Online/Offline, nút Đồng bộ, Logout, Xoá account
   - 🔐 **Phân quyền**: Matrix Users × Accounts với dropdown role Owner/Manager/Agent/Viewer/None
2. **Admin API**:
   - `GET /api/admin/users`, `POST /api/admin/users`, `PUT /api/admin/users/:id`, `DELETE /api/admin/users/:id`
   - `PUT /api/admin/memberships`
   - `DELETE /api/admin/accounts/:id`, `POST /api/admin/accounts/:id/logout`
3. **System role** — cột `role` trong `system_users` (migration tự động), admin seed với `role='admin'`
4. **Middleware**:
   - `requireAuth` — JWT verification
   - `requireSystemRole('admin')` — chỉ admin vào `/api/admin/*`
   - `requireAccountAccess(minRole?)` — check membership role per account
5. **Auto-assign** — server boot tự động gán admin `owner` cho tất cả Zalo accounts
6. **API auth auto-inject** — `api.req()` tự động gửi Bearer token từ localStorage

### Defer (sẽ vào Gold-10)

- Sticker picker, emoji picker, poll creator, forward dialog (composer UI)
- Pin message backend + UI

### Test Pass

- ✅ 3 tài khoản Zalo active đồng thời
- ✅ Switch account — data correct
- ✅ Login/logout system user
- ✅ Refresh giữ session (localStorage)
- ✅ AdminPage v2: sidebar + 3 tabs
- ✅ Admin: thêm/sửa/xoá user, inline đổi role
- ✅ Admin: logout/xoá/đồng bộ account Zalo
- ✅ Admin: membership matrix
- ✅ Admin API protected: 401 (không auth), 403 (không admin)
- ✅ Auto-assign admin owner cho existing accounts
- ✅ History sync continuous loop 27 batches
- ✅ Account-level sync-all endpoint
- ✅ SelectConversation non-blocking (cache instant, sync background)
- ✅ Auto-scroll bottom với ResizeObserver (fix ảnh load sau)
- ✅ Public domain: `https://zalo.camerangochoang.com`
