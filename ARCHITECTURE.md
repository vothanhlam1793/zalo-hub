# ZaloHub — Sơ đồ luồng dữ liệu

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                              ZALO API (External)                             ║
║  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     ║
║  │  Messages    │  │  Reactions   │  │  Old Msgs    │  │  Group Info  │     ║
║  │  (real-time) │  │  (real-time) │  │  (history)   │  │  (metadata)  │     ║
║  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     ║
╚═════════╪═════════════════╪═════════════════╪═════════════════╪═══════════════╝
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                          BACKEND (Express :3399)                             ║
║                                                                              ║
║  ┌─────────────────────────────────┐                                        ║
║  │         ZaloListener            │  ← WebSocket tới Zalo                  ║
║  │  selfListen: true               │  ← Echo cả tin mình gửi                ║
║  │                                 │                                        ║
║  │  on('message') → handleMessage  │─────────────────────┐                  ║
║  │  on('reaction') → handleReact.  │                     │                  ║
║  │  on('old_messages') → handleOld │                     │                  ║
║  └─────────────────────────────────┘                     │                  ║
║                                                          ▼                  ║
║  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐   ║
║  │         Normalizer              │  │       GoldMediaStore             │   ║
║  │                                 │  │                                 │   ║
║  │  normalizeMessageKind()         │  │  mirrorRemoteUrl()              │   ║
║  │  normalizeMessageText()         │  │    fetch Zalo CDN → MinIO       │   ║
║  │  normalizeAttachments()         │  │    url = /media/{path}          │   ║
║  │  normalizeImageUrl()            │  │  saveBuffer() → MinIO           │   ║
║  │  normalizeReactionEvent()       │  │                                 │   ║
║  │  getConversationType()          │  │  ┌─────────────┐                │   ║
║  └─────────────────────────────────┘  │  │   MinIO     │                │   ║
║                                       │  │ (S3 object) │                │   ║
║  ┌─────────────────────────────────┐  │  └──────┬──────┘                │   ║
║  │         GoldRuntime             │  │         │ GET /media/*          │   ║
║  │                                 │  │         │  stream pipe → res    │   ║
║  │  appendConversationMessage()    │  └─────────┼───────────────────────┘   ║
║  │    → cache (Map) → replace()    │            │                           ║
║  │    → DB + WebSocket broadcast   │            │                           ║
║  │                                 │            │                           ║
║  │  handleReactionUpdate()         │            │                           ║
║  │  getConversationSummaries()     │            │                           ║
║  │    → derive unread từ DB        │            │                           ║
║  │      (incoming msg timestamp    │            │                           ║
║  │       > last_read_at)           │            │                           ║
║  │  markConversationRead()         │            │                           ║
║  └─────────────────────────────────┘            │                           ║
║                                 │               │                           ║
║  ┌──────────────────────────────┼───────────────┼───────────────────────┐   ║
║  │           GoldStore           │               │                       │   ║
║  │                               ▼               ▼                       │   ║
║  │  ┌──────────────────────────────────┐  ┌──────────────────────────┐  │   ║
║  │  │  PostgreSQL                      │  │  MinIO (S3)              │  │   ║
║  │  │                                  │  │                          │  │   ║
║  │  │  accounts       messages         │  │  zalohub-media/          │  │   ║
║  │  │  conversations  attachments      │  │    {acc}/{year}/{month}/ │  │   ║
║  │  │  contacts       groups           │  │    {msg}-{uuid}-{file}   │  │   ║
║  │  │  system_users   zalo_account_*   │  │                          │  │   ║
║  │  │                                  │  │                          │  │   ║
║  │  │  → replaceConversationMessages() │  │                          │  │   ║
║  │  │    GUARD: skip DELETE if         │  │                          │  │   ║
║  │  │    incoming ≤ 10 & DB > 10       │  │                          │  │   ║
║  │  └──────────────────────────────────┘  └──────────────────────────┘  │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ┌─ API Routes ──────────────────────────────────────────────────────────┐  ║
║  │  GET  /api/status                    POST /api/accounts/:id/activate   │  ║
║  │  GET  /api/accounts                  POST /api/accounts/.../send       │  ║
║  │  GET  /api/accounts/.../conversations POST /api/accounts/.../reaction  │  ║
║  │  GET  /api/accounts/.../messages     POST /api/accounts/.../read-state │  ║
║  │  POST /api/accounts/.../sync-history POST /api/accounts/.../sync-all   │  ║
║  │  POST /api/conversations/sync-metadata                                 │  ║
║  │  GET  /media/*   ← stream từ MinIO                                    │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  ┌─ WebSocket /ws ───────────────────────────────────────────────────────┐  ║
║  │  Client subscribe(accountId, conversationId)                          │  ║
║  │  Server broadcast:                                                     │  ║
║  │    conversation_message  ← khi appendConversationMessage()             │  ║
║  │    conversation_summaries ← sau mỗi message mới / sau mark-read        │  ║
║  │    session_state         ← khi trạng thái listener thay đổi            │  ║
║  │    ws_sync_status       ← tiến độ mobile sync (req_18)                 │  ║
║  │                                                                        │  ║
║  │  Unread guard: nếu tin incoming và CÓ client subscribe conversation   │  ║
║  │  đó → KHÔNG tăng unread_count; nếu KHÔNG có → unread_count += 1       │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
          │
          │ HTTP/WS
          ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                         FRONTEND (Vite React, svr12)                         ║
║                                                                              ║
║  ┌─ Stores (zustand) ────────────────────────────────────────────────────┐  ║
║  │  useWorkspaceStore  → selectedAccountId (localStorage)                │  ║
║  │  useChatStore       → conversationsByAccount, messages, contacts,     │  ║
║  │  │                    groups, pendingReadAtByConversation              │  ║
║  │  useComposerStore   → text, attachFile, statusMsg, loadError          │  ║
║  │  useAuthStore       → user, token, login/logout                       │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  ┌─ Hooks ───────────────────────────────────────────────────────────────┐  ║
║  │  useWebSocket          → connect ws://host/ws, subscribe, onMessage   │  ║
║  │  useConversationManager → selectConversation, loadOlder, auto-sync    │  ║
║  │  useMessageCache       → Map<acc::conv, Message[]>                    │  ║
║  │  useAccountManager     → activate, deactivate, loadData               │  ║
║  │  useComposer           → handleSend, handleKeyDown                    │  ║
║  │  useLogin              → QR login flow                                │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  ┌─ Components ──────────────────────────────────────────────────────────┐  ║
║  │  App.tsx          → Router + WebSocket + onReactMessage                │  ║
║  │  MiniSidebar      → Account switcher + unread badge + status dots    │  ║
║  │  Sidebar          → Conversation list + Contacts list + unread badge  │  ║
║  │  ChatPanel        → Message list + load older on scroll               │  ║
║  │  MessageBubble    → text, image, sticker, video, reaction             │  ║
║  │  ConversationDetailsPanel → metadata + sync history button            │  ║
║  │  QrOverlay        → QR code for login                                 │  ║
║  │  AdminPage        → users, accounts, memberships management           │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  ┌─ API (fetch wrapper) ─────────────────────────────────────────────────┐  ║
║  │  status(), accounts(), accountMessages(), accountAddReaction(),        │  ║
║  │  accountMarkRead(), accountSyncHistory(), accountSyncMetadata(), etc   │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Luồng tin nhắn đến

```
Zalo WebSocket
     │
     ▼
Listener.on('message')
     │
     ▼
Normalizer (msgType → kind, content → text, attachs → url)
     │
     ▼
persistMessageAttachmentsLocally()
  → fetch Zalo CDN → lưu MinIO → url = /media/...
     │
     ▼
appendConversationMessage()
  ├─ cache.set(convId, messages + newMsg)
  ├─ store.replaceConversationMessagesByAccount(convId, cache)
  │   └─ GUARD: nếu incoming quá ít → skip DELETE, return DB
  └─ broadcastConversationMessage() → WebSocket tới frontend
```

## Luồng reaction

```
Frontend click reaction
     │
     ▼
api.accountAddReaction() → POST /api/accounts/.../reaction
     │
     ▼
Backend: sender.addReaction() → Zalo API
     │
     ▼
Zalo echo (selfListen: true)
     │
     ▼
Listener.on('reaction')
     │
     ▼
handleReaction() → handleReactionUpdate() → DB + broadcast WS
     │
     ▼
Frontend nhận WS conversation_message → cập nhật reactions
```

## Luồng sync lịch sử

```
Frontend mở conversation (auto nếu < 10 tin + hasMore)
     │
     ▼
POST /api/accounts/.../sync-history
     │
     ▼
syncConversationHistory()
  ├─ (1) requestOldMessages(threadType, beforeMessageId)
  │      → Listener gửi cmd 510/511 qua Zalo WS
  │      → Zalo trả 'old_messages' → handleOldMessages → appendConversationMessage
  │
  └─ (2) Fallback nếu group + remoteCount=0:
         requestMobileSyncThread(threadId, 'group', timeout)
            → ZaloPcHandshake binary WS → req_18 → giải mã frame
            → merge DB + insert messages mới
```

## Luồng media (ảnh/sticker)

```
Tin nhắn đến có attachment (image/sticker)
     │
     ▼
normalizeAttachments() → { url: "https://zalo-xxx.zdn.vn/..." }
     │
     ▼
persistMessageAttachmentsLocally()
  → persistAttachmentLocally()
    → fetch(url) → buffer
    → mediaStore.saveBuffer(buffer) → MinIO
    → publicUrl = "/media/acc/2026/05/msg-uuid-file.jpg"
    → ghi vào attachment.url
     │
     ▼
Frontend render <img src="/media/...">
     │
     ▼
Browser GET /media/acc/2026/05/msg-uuid-file.jpg
     │
     ▼
Express route GET /media/* → MinIO getObject() → stream.pipe(res)
```

## Deploy flow

```
./deploy.sh                     auto-detect thay đổi từ git
./deploy.sh --backend           build tsc + restart :3399
./deploy.sh --frontend          build vite + scp lên svr12

deploy_backend():
  npm run build --prefix backend/
  kill $(ss -ltnp | awk /:3399/)
  env NODE_ENV=production DATABASE_URL=... node dist/server/index.js &

deploy_frontend():
  npm run build --prefix frontend/
  tar dist/ → scp → svr12:/var/www/zalohub-frontend/
```
