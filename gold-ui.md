# Gold-UI — Lộ Trình Giao Diện & Nền Tảng CSKH

## Mục tiêu

Zalohub thành nền tảng CSKH hoàn chỉnh: nhân viên + AI cùng trực chat trên Zalo,
giao diện hiện đại, đầy đủ tính năng chat, phân quyền rõ ràng.

## Trạng thái trước Gold-UI

| Layer | Tech | Trạng thái |
|-------|------|------------|
| CSS | Tailwind CSS v4 + shadcn/ui (New York) | ✅ Done |
| State | 15+ `useState` trong App.tsx, prop drilling | ⚠️ Cần Zustand |
| Routing | Toggle `loggedIn ? app : login` thô sơ | ⚠️ Cần React Router |
| shadcn | Button, Input, Textarea, Badge, Dialog, Avatar, Tabs, Tooltip | ⚠️ Thiếu Select, Table, Toast... |
| Zalo features | text, image, file, video (4/13 msgType) | ⚠️ Thiếu sticker, reaction, typing, poll... |
| Auth | Không có system user | ⚠️ Cần JWT + roles |
| Inbox | Không có assignment, notes, labels | ⚠️ Cần shared inbox |
| AI | Không có interface cho AI agent | ⚠️ Cần WS + webhook |

---

## Gold-8.5: Hạ Tầng UI ✅ Done

### Zustand Stores (thay 15+ useState)

```
src/web/stores/
  auth-store.ts         system user session, JWT token
  workspace-store.ts    selectedAccountId, sidebarTab, query
  chat-store.ts         conversations[], contacts[], groups[], messages[], messageCache
  composer-store.ts     text, attachFile, sending, statusMsg, loadError
```

Mỗi store ~40-60 dòng. App.tsx: 356 → ~100 dòng.

### React Router

```
/login          LoginScreen (system user, email+password)
/               App shell — cần auth
/admin          User management — cần role admin
```

### shadcn thêm

```
Select, DropdownMenu, Table, Sonner (toast), Skeleton, Label, Switch, Separator
```

### Cleanup

- Xóa `src/web/index.css` (đã backup ở `archived/index.css.backup`)
- Build + verify public domain

---

## Gold-9A: Auth Cơ Bản ✅ Done

### DB Schema

```sql
CREATE TABLE system_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT,
  type TEXT DEFAULT 'human',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE system_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES system_users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE zalo_account_memberships (
  user_id TEXT NOT NULL REFERENCES system_users(id),
  account_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  PRIMARY KEY (user_id, account_id)
);
```

### Roles

```
owner    — toàn quyền account: quản lý, chat, xem audit
manager  — quản lý conversation, gán agent, xem audit
agent    — chat với conversation được gán
viewer   — chỉ xem, không chat
```

### API

```
POST /api/auth/login      body: { email, password } → { token, user }
POST /api/auth/logout     header: Authorization: Bearer <token>
GET  /api/auth/me         → { user, memberships[] }
```

### Middleware

```
requireAuth                   — check JWT, gán req.user
requireAccountAccess(role?)   — check membership role
requireRole('admin')          — check system role
```

---

## Gold-9B: Zalo Rich Features ✅ Done

### Mở rộng GoldMessageKind (4 → 9)

```ts
type GoldMessageKind = 'text' | 'image' | 'file' | 'video'
                     | 'sticker' | 'reaction' | 'poll'
                     | 'voice' | 'gif'
```

### Tính năng

| # | Tính năng | API (`zalo-api-final`) | Backend | Frontend |
|---|-----------|----------------------|---------|----------|
| 1 | **Sticker** | `POST /api/message/sticker` | `sendSticker()` + listener sticker | Sticker picker popover, render ảnh |
| 2 | **Reaction** | `POST reaction.../api/message/reaction` | `addReaction()` + listener reaction | Emoji picker, hiện reaction dưới bubble |
| 3 | **Typing** | `POST /api/message/typing` | `sendTyping()` + WS broadcast typing | "Đang nhập..." trên chat header |
| 4 | **Poll** | `POST /api/poll/create` | `createPoll()` + listener poll | Modal tạo poll, poll card + vote |
| 5 | **Pin Message** | `POST groupboard.../api/board/pinv2` | `pinMessage()` + listener | Pinned bar cố định trên cùng |
| 6 | **Forward** | `POST /api/message/forward` | `forwardMessage()` | Menu chuột phải → dialog chọn đích |

**Nguyên tắc backend mới:** endpoint theo account-scoped:
```
POST /api/accounts/:accountId/conversations/:id/sticker
POST /api/accounts/:accountId/conversations/:id/reaction
POST /api/accounts/:accountId/conversations/:id/typing
POST /api/accounts/:accountId/conversations/:id/poll
POST /api/accounts/:accountId/conversations/:id/pin
POST /api/accounts/:accountId/conversations/:id/forward
```

---

## Gold-9C: Roles + Admin UI ✅ Done

### API Admin

```
GET    /api/admin/users               list users
POST   /api/admin/users               create user
DELETE /api/admin/users/:id           delete user
GET    /api/admin/memberships          list all memberships
PUT    /api/admin/memberships/:userId  update role per account
```

### Admin UI (`/admin`)

- **Table users**: email, display name, type, created at, actions
- **Dialog thêm user**: email + password + display name + type (human/ai_bot)
- **Membership panel**: mỗi user → bảng Zalo accounts với Select role (owner/manager/agent/viewer)

### Gia cố middleware

```
requireAdmin — cho /api/admin/*
requireAccountAccess('agent') — tối thiểu để gửi message
requireAccountAccess('viewer') — tối thiểu để xem conversation
```

---

## Gold-10A: Shared Inbox (1 session)

### DB Schema

```sql
CREATE TABLE conversation_assignments (
  conversation_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  assigned_user_id TEXT REFERENCES system_users(id),
  assigned_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, account_id)
);

CREATE TABLE internal_notes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES system_users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE conversation_labels (
  conversation_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (conversation_id, account_id, label)
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Sidebar — tab mới "Hộp thư đến"

```
  Cần xử lý    — unassigned
  Của tôi      — assigned to current user
  Tất cả       — all conversations
```

### Conversation header — bổ sung

- Assignee dropdown (Select user)
- Status badge: `open` / `pending` / `closed`
- Label chips + add label
- Internal notes panel (drawer bên phải)

### Audit log

Tự động ghi mọi hành động: send_message, assign, close, add_label, add_note, handoff, change_role...

---

## Gold-10B: AI Interface (1 session)

### DB bổ sung

```sql
ALTER TABLE system_users ADD COLUMN api_key TEXT;

CREATE TABLE webhook_configs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT,
  active INTEGER DEFAULT 1
);
```

### AI agent — 2 kênh nhận message

| Kênh | Cơ chế | Dùng khi |
|------|--------|----------|
| **WebSocket** | Header `Authorization: Bearer <api_key>`, subscribe như frontend | Realtime, cùng code base |
| **Webhook** | Backend HTTP POST ra URL khi có message | Decoupled, bot bên ngoài |

### Webhook payload

```json
POST <webhook_url>
{
  "event": "message.new",
  "account_id": "...",
  "message": { ... },
  "conversation": { ... },
  "assigned_to": null
}
```

### Handoff API

```
POST /api/conversations/:id/handoff
{ from: 'ai_bot_id', to: 'human_user_id', note: '...' }
→ audit_log + re-assign + WS notify
```

---

## Kiến trúc tổng thể sau Gold-10

```
┌─────────────────────────────────────────────────────────┐
│         Frontend React (Zustand + Router + shadcn)       │
│  /login (Auth)  │  / (Dashboard)  │  /admin (Users)     │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + WS
┌──────────────────────┴──────────────────────────────────┐
│              Backend Express + WS + SQLite               │
│  Auth JWT │ AccountManager │ Zalo Rich │ Inbox │ Audit  │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ Zalo API │ │ AI Agent │ │ AI Agent │
    │(external)│ │   (WS)   │ │(webhook) │
    └──────────┘ └──────────┘ └──────────┘
```

---

## Thứ tự triển khai

```
Gold-8.5  ████████████████████████ Done — Hạ tầng (Zustand + Router + shadcn)
Gold-9A   ████████████████████████ Done — Auth cơ bản (login, JWT, middleware)
Gold-9B   ████████████████████████ Done — Zalo Rich Features (sticker, reaction, typing, poll, forward)
Gold-9C   ████████████████████████ Done — Roles + Admin UI
Gold-10A  ░░░░░░░░░░░░░░░░░░░░░░ Planned — Shared Inbox (assignment, notes, labels)
Gold-10B  ░░░░░░░░░░░░░░░░░░░░░░ Planned — AI Interface
```

## Nguyên tắc

1. **Mỗi gold là 1 milestone có thể test được độc lập**
2. **Không phá vỡ API contract cũ** — route mới thêm vào, route cũ giữ compatibility
3. **Backend + Frontend làm song song mỗi gold** — không làm backend xong hết rồi mới frontend
4. **Kết quả ghi vào `archived/GOLD-UI-N-RESULT.md`**
5. **Build + verify public domain sau mỗi gold**
