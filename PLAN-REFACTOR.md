# Kế Hoạch Tái Cấu Trúc Source Code

## Mục tiêu
Tổ chức lại toàn bộ codebase để dễ tái sử dụng, dễ xác định vị trí code, giảm kích thước file.

## Trạng thái
- [x] Bước 1: Tách `src/web/utils.ts`
- [x] Bước 2: Tách `MessageBubble` ra component riêng
- [x] Bước 3: Tách components UI chính
- [x] Bước 4: Tách custom hooks
- [x] Bước 5: Xóa legacy client + tách server routes + WebSocket + helpers
- [x] Bước 6: Tách `store.ts` theo repository pattern
- [x] Bước 7: Tách `runtime.ts` theo service pattern
- [x] Bước 8: Cleanup, verify tổng thể, restart

## Cấu trúc mục tiêu

```
src/
  core/
    types.ts
    logger.ts
    media-store.ts
    zalo-group-client.ts
    index.ts
    runtime/            # [Bước 7] Tách từ runtime.ts
      index.ts
      types.ts
      normalizer.ts
      session-auth.ts
      listener.ts
      sender.ts
      sync.ts
      qr.ts
    store/              # [Bước 6] Tách từ store.ts
      index.ts
      helpers.ts
      schema.ts
      account-repo.ts
      contact-repo.ts
      group-repo.ts
      message-repo.ts
      conversation-repo.ts
  server/
    account-manager.ts
    index.ts            # ~80 dòng orchestrator
    routes/             # [Bước 5]
      system.ts
      auth.ts
      accounts.ts
      legacy.ts
      media.ts
    ws/                 # [Bước 5]
      handler.ts
    helpers/            # [Bước 5]
      status.ts
      context.ts
  web/
    main.tsx
    index.html
    index.css
    utils.ts            # [Bước 1]
    api.ts
    useWebSocket.ts
    types.ts
    App.tsx             # ~100 dòng orchestrator
    components/         # [Bước 2+3]
      MessageBubble.tsx
      LoginScreen.tsx
      QrOverlay.tsx
      MiniSidebar.tsx
      Sidebar.tsx
      ChatPanel.tsx
    hooks/              # [Bước 4]
      useMessageCache.ts
      useLogin.ts
      useAccountManager.ts
      useConversationManager.ts
      useComposer.ts
```

## Kết quả thực tế

| File | Trước | Sau | Giảm |
|------|-------|-----|------|
| `src/web/App.tsx` | 948 dòng | 356 dòng | -62% |
| `src/server/index.ts` | 870 dòng | 62 dòng | -93% |
| `src/core/runtime.ts` | 2,080 dòng | 1 dòng (re-export) | -99.9% |
| `src/core/store.ts` | 1,699 dòng | 1 dòng (re-export) | -99.9% |

Tổng số file tăng: 21 → 49 (+28 files chuyên biệt)
Tổng số thư mục con mới: `web/components/`, `web/hooks/`, `server/routes/`, `server/ws/`, `server/helpers/`, `core/runtime/`, `core/store/`

Build backend + frontend: ✅ pass

