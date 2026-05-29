# Zalo Hub

Nền tảng chat Zalo đa người dùng, đa tài khoản. Hỗ trợ agent monitor từ xa để giám sát chat, trích xuất task, và tự động hóa workflow.

Version: **v1.0.2**

## Cấu trúc

```
zalohub/
├── backend/                          Backend server + admin panel
│   ├── src/
│   │   ├── core/                     Zalo runtime: login, send/receive, sync
│   │   │   ├── runtime/              listener, sync, sender, session-auth, normalizer
│   │   │   ├── store/                message-repo, conversation-repo, group-repo, contact-repo
│   │   │   ├── types.ts              GoldConversationMessage, GoldConversationSummary, ...
│   │   │   └── logger.ts             structured JSON logger
│   │   ├── server/                   Express API + WebSocket + auth
│   │   │   ├── routes/
│   │   │   │   ├── accounts.ts       CRUD accounts, conversations, messages, send, sync
│   │   │   │   ├── monitor.ts        Agent monitor API (phase 1) — conversation discovery, message sync
│   │   │   │   ├── admin.ts          admin panel API: users, memberships, master transfer
│   │   │   │   ├── system-auth.ts    system login/logout/me (JWT)
│   │   │   │   ├── auth.ts           Zalo QR login support
│   │   │   │   ├── legacy.ts         legacy API tương thích ngược (friend, groups, conversations, send)
│   │   │   │   └── system.ts         health/status
│   │   │   ├── helpers/              auth-middleware, status, context
│   │   │   └── index.ts              server entry point, mount routers, CORS, media proxy
│   │   └── admin/                    Admin SPA (React)
│   ├── db/
│   │   └── migrations/               Knex migrations (PostgreSQL)
│   │       ├── 20260516052000_add_last_read_at.ts
│   │       ├── 20260517000000_create_conversation_read_state.ts
│   │       └── 20260529000000_add_monitor_indexes.ts
│   ├── docker-compose.yml
│   └── package.json
│
├── frontend/                         Chat React app
│   ├── src/
│   │   ├── components/               MiniSidebar, ChatPanel, MessageBubble, Sidebar, ...
│   │   ├── features/chat/            DashboardPage
│   │   ├── app/                      AppRoutes
│   │   ├── stores/                   Zustand: auth, workspace, chat, composer
│   │   ├── hooks/                    useWebSocket, useMessageCache, useConversationManager
│   │   └── api.ts                    API client (sends JWT on all requests)
│   ├── package.json
│   └── vite.config.ts
│
├── data/                             Database + media (volume ra ngoài)
├── logs/                             Server logs
│
├── ARCHITECTURE.md                   Sơ đồ luồng dữ liệu
├── DEPLOY.md                         Cài đặt, dev, production
└── ZALO_API_REFERENCE.md             Zalo API nội bộ
```

## Kiến trúc

Xem [ARCHITECTURE.md](./ARCHITECTURE.md) để hiểu luồng dữ liệu và cách các thành phần kết nối.

## Triển khai

Xem [DEPLOY.md](./DEPLOY.md) để biết cách cài đặt, chạy development, và deploy production.

## Phân quyền

| Role          | Chat | Xem phân quyền | Sửa phân quyền | Thêm user | Chuyển master | Monitor API |
|---------------|------|----------------|----------------|-----------|---------------|-------------|
| **master**    | ✅   | ✅             | ✅             | ✅        | ✅            | ✅          |
| **admin**     | ✅   | ✅             | ✅             | ✅        | ❌            | ✅          |
| **editor**    | ✅   | ✅             | ❌             | ❌        | ❌            | ✅          |
| **viewer**    | ✅   | ✅             | ❌             | ❌        | ❌            | ✅          |

- **Mỗi Zalo account có 1 Master** (người tạo/đăng nhập QR đầu tiên)
- **Super admin** quản lý user hệ thống, không tự động là master của account nào
- **Admin page** (`/admin`): thêm tài khoản QR, phân quyền, transfer master
- **Monitor API**: yêu cầu `requireAuth` + `requireAccountAccess('viewer')` trên mọi endpoint

## Auth flow

```
POST /api/auth/login     → email + password → JWT token (7-day expiry)
GET  /api/auth/me        → lấy user info + memberships
POST /api/auth/logout    → xóa session token

Tất cả API data yêu cầu: Authorization: Bearer <token>
Middleware: requireAuth → verify JWT → gắn systemUserId vào request
             requireAccountAccess(minRole?) → verify membership zalo_account_memberships
```

## Unread & Realtime

- **Hệ unread nội bộ Hub**, không phụ thuộc Zalo API
- `conversation_read_state.last_read_at` là mốc đã đọc của conversation
- Unread = số `messages.direction = 'incoming'` có `timestamp > last_read_at`
- Mark-read: `POST /api/accounts/:id/conversations/:cid/read-state`
- WebSocket `/ws` broadcast realtime cập nhật badge đến mọi client

## Monitor API (phase 1 — v1.0.2)

API cho external agent giám sát chat, trích xuất task, và tự động hóa. Tất cả endpoint dùng JWT auth + account membership.

### Auth

```
POST /api/auth/login          → { token, user }
GET  /api/auth/me             → { user, memberships }
GET  /api/me/accounts         → { accounts: [{ accountId, role, displayName, hasSession }] }
```

### Conversation discovery

```
GET /api/accounts/:accountId/monitor/conversations?from=ISO&to=ISO
  → { items: [{ conversationId, threadId, type: direct|group, title, avatar,
                messageCount, messageCountInRange, unreadCount, lastMessageTimestamp, lastReadAt }],
      nextCursor }

GET /api/accounts/:accountId/monitor/conversations/unread
  → { items: [{ conversationId, type, title, unreadCount, lastMessageTimestamp }] }

GET /api/accounts/:accountId/monitor/conversations/:conversationId
  → { conversation: { conversationId, threadId, type, title, avatar,
                      messageCount, unreadCount, lastMessageTimestamp, lastReadAt } }
```

### Message sync

```
GET /api/accounts/:accountId/monitor/messages?from=ISO&to=ISO[&conversationId=...]
  → { items: [{ id, conversationId, conversationType, timestamp, direction, isSelf,
                senderId, senderName, text, kind, attachments, providerMessageId,
                quote, reactions, rawMessageJson }],
      nextCursor }

GET /api/accounts/:accountId/monitor/conversations/:conversationId/messages[?from=&to=]
  → incremental hoặc full history của một conversation
```

### Agent sync flow

```
1. POST /api/auth/login
2. GET /api/me/accounts → biết được phép vào account nào
3. Với mỗi account:
   GET /api/accounts/{id}/monitor/conversations?from={checkpoint}&to={now}
   Với mỗi conversation thay đổi:
     GET /api/accounts/{id}/monitor/messages?from={checkpoint}&to={now}&conversationId={cid}
4. Phân tích NLP, trích xuất task
5. Cập nhật checkpoint sang phía agent
```

### Query params

| Param | Mô tả | Endpoint |
|-------|-------|----------|
| `from` | ISO 8601, bắt buộc. `timestamp >= from` | conversations, messages |
| `to` | ISO 8601, bắt buộc. `timestamp < to` | conversations, messages |
| `conversationId` | lọc theo conversationId (direct:uid hoặc group:gid) | messages |
| `type` | `direct` hoặc `group` | conversations, messages |
| `onlyUnread` | `1` = chỉ trả conversation có unread trong range | conversations |
| `limit` | số items tối đa (default 100, max 1000) | conversations, messages |
| `cursor` | phân trang. Format: `timestamp\|id` (messages) hoặc `timestamp` (conversations) | conversations, messages |

### Models

**GoldConversationMessage**: `id`, `conversationId`, `conversationType` (direct|group), `threadId`, `timestamp`, `direction` (incoming|outgoing), `isSelf`, `senderId`, `senderName`, `text`, `kind` (text|image|file|video|sticker|gif|voice|poll), `attachments`, `providerMessageId`, `quote`, `reactions`, `rawMessageJson`

**GoldConversationSummary**: `id`, `accountId`, `threadId`, `type` (direct|group), `title`, `avatar`, `lastMessageText`, `lastMessageKind`, `lastMessageTimestamp`, `lastDirection`, `messageCount`, `unreadCount`, `lastReadAt`

## Tech Stack

| Layer      | Công nghệ                          |
|------------|------------------------------------|
| Backend    | Node.js 22+, Express, WebSocket    |
| Database   | PostgreSQL (Knex migrations)       |
| Media      | MinIO (S3-compatible)              |
| Frontend   | React 19, Vite, Tailwind CSS 4     |
| State      | Zustand                            |
| UI         | Radix UI + shadcn                  |
| Auth       | JWT (jsonwebtoken) + scryptSync    |
| Deploy     | Docker Compose + Nginx             |
| Zalo       | zalo-api-final v2.1.0              |
