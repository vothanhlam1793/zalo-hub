# fix-react.md — Sửa lỗi reaction không đồng bộ sau khi người dùng thả

## Nguyên nhân gốc

1. **Zalo không echo self-reaction**: zalo-api-final listener mặc định `selfListen: false`, nên khi người dùng tự thả reaction, Zalo **không** gửi ngược lại event `reaction` qua listener. Frontend chỉ còn trông chờ optimistic update, nhưng optimistic update có thể bị stale closure.

2. **Optimistic update dùng stale state**: `onReactMessage` callback trong `App.tsx` đọc `chat.messages` trực tiếp từ closure. Nếu có nhiều tin đến cùng lúc, giá trị `chat.messages` cũ có thể ghi đè state mới.

3. **cliMsgId fallback sai**: Đoạn fallback `cliMsgId = message.providerMessageId` (fix trước đó) gửi `providerMessageId` (global msgId) làm `cliMsgId` (client-side timestamp ID). Zalo API có thể từ chối hoặc bỏ qua nếu sai định dạng.

---

## Fix 1: Frontend — thêm try/catch + toast lỗi

**File:** `frontend/src/App.tsx`, dòng 301

**Trước:**
```tsx
await api.accountAddReaction(accountId, message.conversationId, message.providerMessageId, cliMsgId, reaction.icon);

chat.setMessages(chat.messages.map((entry) => {
  if (entry.id !== message.id) return entry;
  ...
}));
```

**Sau:**
```tsx
try {
  await api.accountAddReaction(accountId, message.conversationId, message.providerMessageId, cliMsgId, reaction.icon);
} catch (err) {
  composer.setLoadError(err instanceof Error ? err.message : 'Gửi reaction thất bại');
  return;
}

chat.setMessages((prev) => prev.map((entry) => {
  if (entry.id !== message.id) return entry;
  const existing = entry.reactions ?? [];
  const existingIndex = existing.findIndex((item) => item.emoji === reaction.emoji);
  const nextReactions = existingIndex >= 0
    ? existing.map((item, index) => index === existingIndex ? { ...item, count: item.count + 1 } : item)
    : [...existing, { emoji: reaction.emoji, count: 1 }];
  return { ...entry, reactions: nextReactions };
}));
```

**Điểm sửa:**
- Bọc `api.accountAddReaction` trong try/catch, hiện lỗi nếu fail
- Dùng `chat.setMessages((prev) => prev.map(...))` thay vì `chat.setMessages(chat.messages.map(...))` để tránh stale closure

---

## Fix 2: Backend — tự cập nhật reaction sau khi gửi thành công (không chờ echo)

**File:** `backend/src/server/routes/accounts.ts`, dòng 448-451

**Trước:**
```ts
try {
  const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
  const result = await targetRuntime.addReaction(conversationId, messageId, cliMsgId, reactionIcon);
  res.json(result);
} catch (error) {
  res.status(500).json({ error: error instanceof Error ? error.message : 'Gui reaction that bai' });
}
```

**Sau:**
```ts
try {
  const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
  const result = await targetRuntime.addReaction(conversationId, messageId, cliMsgId, reactionIcon);
  res.json(result);

  // Tự cập nhật reaction vào message, không chờ listener echo (Zalo không echo self-reaction)
  const iconEmojiMap: Record<string, string> = {
    '/-heart': '❤️', '/-strong': '👍', ':>': '😆', ':o': '😮', ':-((': '😢', ':-h': '😡',
  };
  const emoji = iconEmojiMap[reactionIcon] ?? reactionIcon;
  await targetRuntime.handleReactionUpdate(conversationId, messageId, emoji, 1, [accountId]);
} catch (error) {
  res.status(500).json({ error: error instanceof Error ? error.message : 'Gui reaction that bai' });
}
```

**Điểm cần làm:**
- Export `handleReactionUpdate` từ `GoldRuntime` (hiện là private method, dòng ~520 trong `runtime/index.ts`)
- Đổi `private async handleReactionUpdate` → public, hoặc thêm method wrapper public

---

## Fix 3: Frontend — bỏ useCallback dependency `chat.messages`

**File:** `frontend/src/App.tsx`, dòng 316

**Trước:**
```tsx
}, [resolveWorkspaceId, chat, chat.messages, composer]);
```

**Sau:**
```tsx
}, [resolveWorkspaceId, chat, composer]);
```

**Lý do:** Vì đã chuyển sang `chat.setMessages((prev) => prev.map(...))`, không còn đọc `chat.messages` từ closure nữa. Bỏ dependency này tránh re-create callback không cần thiết.

---

## Fix 4 (tùy chọn): Frontend — sửa cliMsgId fallback

**File:** `frontend/src/App.tsx`, dòng 282-299

**Vấn đề:** Dùng `providerMessageId` làm fallback cho `cliMsgId` có thể sai định dạng. `cliMsgId` thực tế là timestamp string (dạng `"1778840123106"`), còn `providerMessageId` là global msg ID (dạng `"7829167264686"`).

**Sửa:** Thử thêm tìm trong content:

```tsx
let cliMsgId = message.cliMsgId?.trim() || '';
if (!cliMsgId && message.rawMessageJson) {
  try {
    const raw = JSON.parse(message.rawMessageJson) as Record<string, unknown>;
    const data = (raw.data ?? raw) as Record<string, unknown>;
    cliMsgId = String(
      raw.cliMsgId
      ?? data?.cliMsgId
      ?? (raw.message as Record<string, unknown>)?.cliMsgId
      ?? (raw.content as Record<string, unknown>)?.cliMsgId    // ← thêm dòng này
      ?? ''
    ).trim();
  } catch {
    cliMsgId = '';
  }
}
if (!cliMsgId) {
  cliMsgId = message.providerMessageId;  // vẫn giữ làm fallback cuối
}
```

---

## File cần sửa

| File | Dòng | Việc |
|------|------|------|
| `frontend/src/App.tsx` | 301-315 | Bọc try/catch, dùng `setMessages(prev => prev.map(...))` |
| `frontend/src/App.tsx` | 316 | Bỏ `chat.messages` khỏi dependency array |
| `frontend/src/App.tsx` | 282-299 | Thêm fallback `raw.content?.cliMsgId` |
| `backend/src/runtime/index.ts` | ~520 | Đổi `private handleReactionUpdate` → public |
| `backend/src/server/routes/accounts.ts` | 448-451 | Tự gọi `handleReactionUpdate` sau khi gửi thành công |

---

## Sau khi sửa

1. `cd backend && npm run build`
2. Restart backend
3. `cd frontend && npm run build`
4. Deploy frontend lên svr12
5. Verify: thả reaction trên app → thấy ngay (optimistic) + không báo lỗi
