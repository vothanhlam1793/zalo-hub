# Spec: Dify Bot — Receive & Send Group Whitelist

**Ngày:** 2026-06-11
**Feature:** Cho phép mỗi Dify Bot giới hạn group nào được trigger webhook (receive) và group nào được gửi reply (send)
**Priority:** High — nền móng cho multi-agent architecture
**Repo:** ~/zalohub

---

## 1. Motivation

### Hiện tại
- Mỗi Dify Bot có `filter_mode` (all / keywords) + `filter_keywords` (["hermes", "@hermes"...])
- Bot bắn webhook cho **tất cả** group nó tham gia → Hermes phải tự check `allowed_groups` → bỏ 98% noise
- 1 bot không thể phục vụ nhiều agent vì không phân biệt được group nào của agent nào

### Sau khi có whitelist
- Bot chỉ trigger webhook cho group trong **receive whitelist**
- Bot chỉ được gửi reply vào group trong **send whitelist**
- 1 account = nhiều bot = nhiều agent, mỗi agent phụ trách group riêng
- ZaloHub filter ở tầng thấp → giảm webhook call → giảm token cost cho Hermes

---

## 2. Database Schema

### Migration

**File:** `backend/db/migrations/YYYYMMDDHHMMSS_add_whitelist_to_dify_bots.ts`

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dify_bots', (table) => {
    table.jsonb('receive_groups').defaultTo('[]'); // whitelist: chỉ nhận webhook từ những group này
    table.jsonb('send_groups').defaultTo('[]');    // whitelist: chỉ được gửi reply vào những group này
    // [] = all groups (giữ backward compatibility)
    // ["group:15333...", "group:52041..."] = chỉ những group này
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dify_bots', (table) => {
    table.dropColumn('receive_groups');
    table.dropColumn('send_groups');
  });
}
```

### Column spec

| Column | Type | Default | Mô tả |
|--------|------|---------|-------|
| `receive_groups` | JSONB | `[]` | Danh sách group IDs được trigger webhook. `[]` = tất cả. |
| `send_groups` | JSONB | `[]` | Danh sách group IDs được phép gửi reply. `[]` = tất cả. |

### Behavior

```
receive_groups = []         → nhận webhook từ tất cả group (backward compat)
receive_groups = ["id1"]    → CHỈ nhận webhook từ id1
receive_groups = [] và group không trong danh sách → KHÔNG gọi webhook

send_groups = []            → gửi được vào tất cả group (backward compat)
send_groups = ["id1","id2"] → CHỈ gửi được vào id1, id2
send_groups = [] và group không trong danh sách → Bot API trả 403 Forbidden
```

---

## 3. Backend Changes

### 3.1 DifyBotService (`backend/src/server/services/dify-bot-service.ts`)

Thêm 2 field vào interface và create/update:

```typescript
export interface DifyBotData {
  // ... existing fields
  receive_groups?: string[];  // NEW
  send_groups?: string[];     // NEW
}
```

Hàm `create` và `update` đã dùng `knex('dify_bots')` — knex tự map JSONB column ↔ JS array. Không cần thay đổi logic DB.

### 3.2 DifyBotExecutor (`backend/src/server/services/dify-bot-executor.ts`)

**Thêm filter receive_groups** — trong hàm xử lý message, trước khi gọi webhook:

```typescript
// Trong method xử lý message (onConversationMessage hoặc tương đương)
async handleMessage(message: GoldConversationMessage): Promise<void> {
  const bot = this.bot; // DifyBot đã load từ DB
  
  // === NEW: Receive whitelist filter ===
  if (bot.receive_groups && bot.receive_groups.length > 0) {
    const conversationId = message.conversationId;
    if (!bot.receive_groups.includes(conversationId)) {
      // Group không trong whitelist → không gọi webhook
      this.logger.debug('whitelist_skip', { 
        bot: bot.name, 
        conversationId, 
        reason: 'not_in_receive_whitelist' 
      });
      return;
    }
  }
  
  // ... existing filter logic (keywords, mode...)
  // ... call webhook
}
```

### 3.3 Bot API (`backend/src/server/routes/bot-api.ts`)

**Thêm filter send_groups** — trong endpoint `/send-message`:

```typescript
// POST /api/bot/send-message — thêm check trước dòng 129
router.post('/send-message', async (req, res) => {
  const bot = req.difyBot!;
  const { conversationId, text } = req.body;

  // ... validation ...

  // === NEW: Send whitelist filter ===
  const sendGroups: string[] = bot.send_groups || [];
  if (sendGroups.length > 0 && !sendGroups.includes(conversationId)) {
    res.status(403).json({ 
      error: 'Bot khong duoc phep gui tin nhan vao group nay',
      conversationId,
      allowed_groups: sendGroups,
    });
    return;
  }

  // ... existing send logic ...
});
```

### 3.4 Bot Auth (`backend/src/server/routes/bot-auth.ts`)

Đảm bảo `req.difyBot` object trả về từ auth middleware có include `receive_groups` và `send_groups`. Nếu hiện tại DifyBotService.findByToken đã trả về full row → không cần sửa. Nếu chỉ trả về subset → thêm 2 field.

### 3.5 Admin API (`backend/src/server/routes/dify-bots.ts` hoặc `admin-bots.ts`)

Thêm 2 field vào request body validation cho create/update:

```typescript
// POST /api/admin/bots + PUT /api/admin/bots/:id
{
  // ... existing fields
  "receive_groups": ["group:1533316465603451045"],  // optional, default []
  "send_groups": ["group:1533316465603451045"],     // optional, default []
}
```

Response GET đã trả về full row từ DB → tự động include 2 field mới.

---

## 4. Admin UI Changes

### 4.1 DifyBotsTab (`frontend/src/features/admin/DifyBotsTab.tsx`)

Thêm 2 section vào form create/edit bot:

```
┌─────────────────────────────────────────────────┐
│ ☰ Dify Bots                                     │
├─────────────────────────────────────────────────┤
│ Bot Name: [ngochoang-agent            ]         │
│ Account:  [0869845558 ▼              ]          │
│ Dify Webhook URL: [http://...:8422/zalo-webhook]│
│ Filter Mode:  ○ All  ● Keywords                │
│ Keywords:     [hermes, lâm võ, ...  ]          │
│                                                 │ ← NEW SECTION
│ ─── Group Whitelist ──────────────────────      │
│ Receive Groups (chỉ nhận webhook từ):           │
│ ┌──────────────────────────────────────┐        │
│ │ group:1533316465603451045        [✕] │        │
│ │ + Thêm group                         │        │
│ └──────────────────────────────────────┘        │
│                                                 │
│ Send Groups (chỉ gửi reply vào):                │
│ ┌──────────────────────────────────────┐        │
│ │ group:1533316465603451045        [✕] │        │
│ │ + Thêm group                         │        │
│ └──────────────────────────────────────┘        │
│                                                 │
│ [💾 Save Bot]                                   │
└─────────────────────────────────────────────────┘
```

**UX cho "Thêm group":**
- Text input để paste conversation ID
- Hoặc dropdown chọn từ danh sách group của account (gọi API `/api/bot/conversations?type=group`)
- Mỗi group hiển thị kèm tên nếu có (từ API conversations)
- Nút ✕ để xóa khỏi whitelist

### UI States

| receive_groups | send_groups | Hiển thị |
|----------------|-------------|----------|
| `[]` | `[]` | "(tất cả group)" — badge màu xanh |
| `["id1"]` | `["id1"]` | List từng group kèm tên |
| `[]` | `["id1"]` | Receive: tất cả, Send: chỉ id1 |

---

## 5. Files to Change — Summary

| File | Change |
|------|--------|
| `backend/db/migrations/YYYYMMDDHHMMSS_add_whitelist_to_dify_bots.ts` | **NEW** — migration thêm 2 column |
| `backend/src/server/services/dify-bot-service.ts` | Thêm `receive_groups`, `send_groups` vào interface |
| `backend/src/server/services/dify-bot-executor.ts` | Filter receive_groups trước khi gọi webhook |
| `backend/src/server/routes/bot-api.ts` | Filter send_groups trong `/send-message` |
| `backend/src/server/routes/dify-bots.ts` (admin API) | Thêm 2 field vào request validation |
| `frontend/src/features/admin/DifyBotsTab.tsx` | UI thêm Group Whitelist section |

---

## 6. Testing Checklist

- [ ] Migration up/down chạy không lỗi
- [ ] Bot cũ (`receive_groups: []`) vẫn hoạt động như trước (nhận tất cả group)
- [ ] Bot mới với `receive_groups: ["group:X"]` — group X trigger webhook, group Y không
- [ ] Bot mới với `send_groups: ["group:X"]` — gửi vào group X OK, gửi vào group Y → 403
- [ ] Admin API create/update bot với receive_groups + send_groups
- [ ] UI hiển thị whitelist, thêm/xóa group hoạt động
- [ ] Personal token (không qua Dify Bot) không bị ảnh hưởng

---

## 7. Rollout Plan

1. **Merge migration + backend** — backward compatible, bot cũ không bị ảnh hưởng
2. **Deploy backend** — test API với curl
3. **Merge + deploy frontend** — UI whitelist
4. **Cấu hình bot ngochoang-agent** — set receive/send = group Ngọc Hoàng
5. **Verify** — webhook chỉ bắn cho group Ngọc Hoàng, không bắn cho group khác
