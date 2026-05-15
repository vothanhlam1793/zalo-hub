# Kiến trúc Zalo Hub

## Tổng quan

```
┌────────────────────────────────────────────────────────────────┐
│                        Nginx (:443)                            │
│                                                                │
│  /              → frontend static build                        │
│  /api/*  /ws    → backend :3399                                │
│  /admin         → backend :3399/admin (admin SPA)              │
│  /media/*       → MinIO :9000                                  │
└────────────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────────┐   ┌─────────────────────┐
│  frontend/          │   │  backend/            │
│  Chat React app     │   │                      │
│                     │   │  ┌─────────────────┐ │
│  ┌───────────────┐  │   │  │ Express :3399   │ │
│  │ App.tsx       │  │   │  │  /api/* REST    │ │
│  │  Dashboard    │──┼───┼─▶│  /ws WebSocket  │ │
│  │  AdminPage    │  │   │  │  /admin static  │ │
│  └───────────────┘  │   │  └───────┬─────────┘ │
│                     │   │          │            │
│  ┌───────────────┐  │   │  ┌───────▼─────────┐ │
│  │ useWebSocket  │──┼───┼─▶│ AccountManager  │ │
│  │   + token     │  │   │  │  multi-runtime   │ │
│  └───────────────┘  │   │  └───────┬─────────┘ │
│                     │   │          │            │
│  ┌───────────────┐  │   │  ┌───────▼─────────┐ │
│  │ api.ts        │──┼───┼─▶│ src/core/       │ │
│  │  auth + chat  │  │   │  │  GoldRuntime    │ │
│  │  + admin      │  │   │  │  GoldStore(Knex)│ │
│  └───────────────┘  │   │  │  GoldMediaStore │ │
│                     │   │  └───┬───┬─────────┘ │
│  Port: 3400 (dev)   │   │      │   │           │
└─────────────────────┘   │      │   │           │
                          │  ┌───▼───┴─────────┐ │
                          │  │ PostgreSQL :5432│ │
                          │  │ MinIO :9000     │ │
                          │  └─────────────────┘ │
                          │                      │
                          │  Port: 3399          │
                          └─────────────────────┘
```

## Luồng dữ liệu

### 1. Đăng nhập hệ thống
```
User → POST /api/auth/login (email, password)
     → system_users (verify password)
     → system_sessions (tạo session)
     → JWT token trả về client
```

### 2. Thêm tài khoản Zalo (QR)
```
Master → POST /api/login/start (có auth)
       → Playwright mở chat.zalo.me
       → QR code hiển thị cho user quét
       → Zalo xác thực → lấy cookie/imei
       → accounts + account_sessions (lưu credential)
       → zalo_account_memberships (auto-assign master)
       → AccountRuntimeManager warm start
```

### 3. Nhận tin nhắn realtime
```
Zalo server → WebSocket listener (src/core/runtime/listener.ts)
            → normalize message (normalizer.ts)
            → appendConversationMessage → GoldStore (PostgreSQL)
            → broadcastConversationMessage → chỉ client subscribed
```

### 4. Gửi tin nhắn
```
User → POST /api/accounts/:id/send (có auth + quyền editor)
     → requireAccountAccess('editor')
     → GoldRuntime.sendText()
     → Zalo API send message
     → appendConversationMessage → GoldStore
```

### 5. WebSocket auth flow
```
Client → ws://host/ws
       → on open: nhận connected, conversation_summaries, session_state
       → subscribe { accountId, conversationId, token }
       → backend verify JWT → check zalo_account_memberships
       → nếu có quyền → subscribed
       → nếu không → error
```

### 6. Phân quyền
```
Middleware chain:
  requireAuth          → verify JWT, set req.systemUserId
  requireSystemRole    → check system_users.role (super_admin/admin)
  requireAccountAccess → check zalo_account_memberships (master/admin/editor/viewer)
  requireAccountMaster → check role === 'master' trên account cụ thể
```

## Cây thư mục backend/src/

```
src/
├── core/                  Zalo runtime core
│   ├── index.ts           CLI entry point
│   ├── logger.ts          GoldLogger (file logger)
│   ├── media-store.ts     MinIO object storage wrapper
│   ├── types.ts           Core data types
│   ├── runtime/           Runtime services
│   │   ├── index.ts       GoldRuntime orchestrator
│   │   ├── session-auth.ts  Login + credential
│   │   ├── listener.ts    WebSocket message listener
│   │   ├── sender.ts      Send messages/attachments
│   │   ├── sync.ts        Data sync (friends, groups, history)
│   │   ├── normalizer.ts  Data normalization
│   │   └── qr.ts          QR code rendering
│   └── store/             Database layer (Knex + PostgreSQL)
│       ├── index.ts       GoldStore (top-level)
│       ├── account-repo.ts
│       ├── contact-repo.ts
│       ├── group-repo.ts
│       ├── conversation-repo.ts
│       ├── message-repo.ts
│       └── helpers.ts
│
├── server/                Express backend
│   ├── index.ts           Server entry point
│   ├── account-manager.ts Multi-account runtime manager
│   ├── helpers/
│   │   ├── auth-middleware.ts  JWT + role middleware
│   │   ├── context.ts     Runtime context helpers
│   │   └── status.ts      Status builders
│   ├── routes/
│   │   ├── system.ts      Health/status endpoints
│   │   ├── auth.ts        QR login/logout
│   │   ├── system-auth.ts System user auth (login/me/logout)
│   │   ├── accounts.ts    Per-account REST API
│   │   ├── admin.ts       Admin CRUD + membership
│   │   └── legacy.ts      Legacy compatibility
│   └── ws/
│       └── handler.ts     WebSocket handler (auth + subscribe)
│
└── admin/                 Admin SPA (React)
    ├── App.tsx
    ├── pages/AdminPage.tsx
    ├── components/
    │   ├── MyAccountsTab.tsx
    │   ├── QrLoginDialog.tsx
    │   └── ui/            (Radix/shadcn components)
    ├── stores/auth-store.ts
    └── api.ts
```

## Database Schema (PostgreSQL)

11 bảng:

| Table | Vai trò |
|-------|---------|
| `accounts` | Tài khoản Zalo |
| `account_sessions` | Cookie/credential session |
| `friends` | Danh sách bạn bè |
| `conversations` | Tổng hợp cuộc trò chuyện |
| `messages` | Tin nhắn (raw_message_json JSONB) |
| `groups` | Nhóm (members_json JSONB) |
| `attachments` | File đính kèm |
| `system_users` | User hệ thống |
| `system_sessions` | Session JWT |
| `zalo_account_memberships` | Phân quyền user↔account |

Xem migrations tại `backend/db/migrations/`.

## Các file quan trọng cần biết khi sửa

| Muốn sửa gì | File |
|---|---|
| Thêm API endpoint | `backend/src/server/routes/*.ts` |
| Sửa middleware auth | `backend/src/server/helpers/auth-middleware.ts` |
| Sửa WebSocket logic | `backend/src/server/ws/handler.ts` |
| Sửa database schema | `backend/db/migrations/` + `backend/src/core/store/*.ts` |
| Sửa Zalo login/receive | `backend/src/core/runtime/session-auth.ts` hoặc `listener.ts` |
| Sửa gửi tin nhắn | `backend/src/core/runtime/sender.ts` |
| Sửa media storage | `backend/src/core/media-store.ts` |
| Sửa cấu trúc DB query | `backend/src/core/store/*-repo.ts` |
| Sửa admin page UI | `backend/src/admin/` |
| Sửa chat UI | `frontend/src/components/` |
| Sửa admin page (user view) | `frontend/src/pages/AdminPage.tsx` + `MyAccountsTab.tsx` |
| Sửa WebSocket client | `frontend/src/useWebSocket.ts` |
| Sửa API client calls | `frontend/src/api.ts` |
| Thêm Docker service | `backend/docker-compose.yml` |
| Sửa Nginx route | `backend/deploy/nginx-zalohub.conf` |
| Migrate dữ liệu cũ | `backend/scripts/migrate-sqlite-to-pg.ts` |
