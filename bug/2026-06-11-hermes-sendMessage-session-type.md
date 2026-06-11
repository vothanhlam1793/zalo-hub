# Bug Report: Hermes Bot (0869) — Session không hỗ trợ sendMessage

**Ngày:** 2026-06-11
**Đơn vị báo cáo:** Hermes Agent (phát hiện khi test agent ngochoang)
**Mức độ:** High — chặn toàn bộ automation reply vào group

---

## 1. Mô tả lỗi

Bot Hermes (token `zhb_v7Au...`, account `623490462004154671`) không thể gửi tin nhắn vào group Zalo qua Bot API `/api/bot/send-message`. Trả về HTTP 500:

```json
{
  "error": "Khong tim thay send API phu hop tren session. Available methods: acceptFriendRequest, addGroupBlockedMember, addGroupDeputy, addQuickMessage, addReaction, addUnreadMark, addUserToGroup, blockUser, blockViewFeed, changeAccountAvatar, changeFriendAlias, changeGroupAvatar, changeGroupName, changeGroupOwner, createAutoReply, createCatalog, createGroup, createNoteGroup, createPoll, createProductCatalog, createReminder, custom, deleteAutoReply, deleteAvatarList, deleteCatalog, deleteChat, deleteMessage, deleteProductCatalog, disableGroupLink, disperseGroup, editNoteGroup, editReminder, enableGroupLink, fetchAccountInfo, findUser, forwardMessage, getAliasList, getAllFriends, getAllGroups, getArchivedChatList, getAutoDeleteChat, getAutoReplyList, getAvatarList, getBizAccount, getCatalogList, getContext, getCookie, getFriendBoardList, getFriendRequestStatus, getGroupBlockedMember, getGroupInfo, getGroupLinkDetail, getGroupLinkInfo, getGroupMembersInfo, getHiddenConversations, getLabels, getListBoard, getListReminder, getMute, getOwnId, getPendingGroupMembers, getPinConversations, getPollDetail, getProductCatalogList, getQR, getQuickMessage, getReceivedFriendRequests, getReminder, getReminderResponses, getSentFriendRequest, getStickers, getStickersDetail, getUnreadMark, getUserInfo, inviteUserToGroups, joinGroupLink, keepAlive, lastOnline, leaveGroup, listener, lockPoll, parseLink, removeFriend, removeFriendAlias, removeGroupBlockedMember, removeGroupDeputy, removeQuickMessage, removeReminder, removeUnreadMark, removeUserFromGroup, resetHiddenConversPin, reuseAvatar, reviewPendingMemberRequest, sendBankCard, sendCard, sendDeliveredEvent, sendFriendRequest, sendLink, sendReport, sendSeenEvent, sendSticker, sendTypingEvent, sendVideo, sendVoice, setHiddenConversations, setMute, setPinnedConversations, unblockUser, undo, undoFriendRequest, updateAutoDeleteChat, updateAutoReply, updateCatalog, updateGroupSettings, updateHiddenConversPin, updateLabels, updateLang, updateProductCatalog, updateProfile, updateQuickMessage, updateSettings, uploadAttachment, uploadProductPhoto, zpwServiceMap"
}
```

**Lưu ý:** `sendMessage` KHÔNG có trong danh sách available methods — nhưng `sendVideo`, `sendVoice`, `sendSticker` thì có. Đây là session không đầy đủ.

---

## 2. Cách tái hiện

```bash
# Token bot Hermes
TOKEN=$(cat ~/gtd-vault/tokens/hermes.txt)

# Gửi message vào group Ngọc Hoàng
curl -s -X POST 'https://hub.besen.vn/api/bot/send-message' \
  -H "X-Bot-Token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"group:1533316465603451045","text":"test"}'

# → HTTP 500 + error trên
```

**Đọc message cũng không được (0 results):**

```bash
curl -s -H "X-Bot-Token: $TOKEN" \
  'https://hub.besen.vn/api/bot/messages?from=2026-06-01T00:00:00Z&to=2026-06-11T23:59:59Z&conversationId=group:1533316465603451045'

# → {"messages":[],"count":0} (trong khi personal token đọc được 10+ tin)
```

**So sánh với personal token (account 2223644954053185337) — HOẠT ĐỘNG BÌNH THƯỜNG:**

```bash
TOKEN=$(cat ~/gtd-vault/tokens/personal.txt)

# Gửi OK
curl -s -X POST 'https://hub.besen.vn/api/bot/send-message' \
  -H "X-Bot-Token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"group:1533316465603451045","text":"test"}'
# → {"ok":true,"message":{...}}

# Đọc OK
curl -s -H "X-Bot-Token: $TOKEN" \
  'https://hub.besen.vn/api/bot/messages?from=...&to=...&conversationId=group:1533316465603451045'
# → 10+ messages
```

---

## 3. So sánh 2 account

| | Account Lâm (222364...) | Account Bot (623490...) |
|---|---|---|
| Token | personal.txt | hermes.txt |
| Phone | 0932032732 | 0869845558 |
| api.sendMessage | CÓ | **KHÔNG** |
| api.sendMsg | CÓ | **KHÔNG** |
| Available methods | Đầy đủ (bao gồm sendMessage) | Chỉ user methods (thiếu sendMessage) |
| Đọc message group NH | OK | 0 results |
| Gửi message group NH | OK | 500 |

---

## 4. Nguyên nhân gốc

Session của account `623490462004154671` trong ZaloHub được tạo với **user-type session** — api object không chứa method `sendMessage`. Chỉ chứa các method quản lý nhóm/tài khoản (acceptFriendRequest, changeGroupName...) và một số method gửi đặc thù (sendVideo, sendVoice, sendSticker) nhưng thiếu `sendMessage`.

Đây là vấn đề ở tầng **account/session**, không phải tầng Dify Bot. Tạo bot mới không giải quyết được vì mọi bot của cùng account đều dùng chung runtime.

### File & dòng code liên quan

**`backend/src/core/runtime/sender.ts`** — dòng 49-109:

```typescript
// Dòng 49: check sendMessage — FAIL vì api không có method này
if (typeof api?.sendMessage === 'function') {
    const result = await api.sendMessage(...);
    return { method: 'sendMessage', result };
}

// Dòng 79: fallback sendMsg — FAIL vì cũng không có
if (typeof api?.sendMsg === 'function') {
    const result = await api.sendMsg(...);
    return { method: 'sendMsg', result };
}

// Dòng 105-109: throw error với danh sách available methods
const apiKeys = Object.keys(api).sort();
throw new Error(
    `Khong tim thay send API phu hop tren session. Available methods: ${apiKeys.join(', ')}`
);
```

**`backend/src/server/routes/bot-api.ts`** — dòng 113-134:
Gọi `runtime.sendText()` → không catch được lỗi session type → trả 500.

```typescript
router.post('/send-message', async (req, res) => {
    const runtime = accountManager.getRuntime(bot.account_id);
    const msg = await runtime.sendText(conversationId, text);  // ← lỗi ở đây
    res.json({ ok: true, message: msg });
});
```

**`backend/src/server/account-manager.ts`** — cần kiểm tra cách tạo session:
- Account 222364... (Lâm) → session có sendMessage → login bằng credentials?
- Account 623490... (0869) → session KHÔNG có sendMessage → login bằng QR?

---

## 5. Hướng fix

### Option A: Fix tầng account (khuyên dùng)
- Kiểm tra `account-manager.ts` — cách session được tạo cho từng account
- Nếu account 0869 login bằng QR code → thử re-login bằng credentials (giống account Lâm)
- Hoặc đảm bảo mọi account đều được tạo session với đầy đủ API methods

### Option B: Fix tầng sender (fallback)
- Trong `sender.ts`, nếu `sendMessage` và `sendMsg` đều không có, thử fallback sang `sendVideo`/`sendVoice` pattern hoặc gọi qua Zalo WS protocol
- Rủi ro: workaround có thể không ổn định

### Option C: Dùng chung account
- Cho bot Hermes dùng account 222364... (Lâm) thay vì 623490... (0869)
- Đơn giản nhất nhưng trộn lẫn personal và bot

---

## 6. Workaround tạm thời

Dùng personal token (account 2223644954053185337, `~/gtd-vault/tokens/personal.txt`) để gửi message. Token này có session đầy đủ, hoạt động bình thường.

```bash
TOKEN=$(cat ~/gtd-vault/tokens/personal.txt)
curl -s -X POST 'https://hub.besen.vn/api/bot/send-message' \
  -H "X-Bot-Token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"group:1533316465603451045","text":"nội dung"}'
```

---

## 7. Impact

- **Agent Ngọc Hoàng không thể tự động reply** vào group
- **Bot 0869 không đọc được message history** của group (chỉ nhận real-time qua webhook)
- **Toàn bộ automation Zalo qua bot 0869 bị chặn** nếu cần sendMessage
