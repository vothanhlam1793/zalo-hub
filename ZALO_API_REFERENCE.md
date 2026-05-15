# Zalo API Reference

Tai lieu noi bo tong hop tu repo private `git@github.com:vothanhlam1793/zalo-reverse.git` va source `zalo-api-final` dang dung trong project nay.

Muc tieu:
- ghi lai nhung API quan trong de debug profile/account, contact, group
- ghi lai cach mo lai repo private de tham khao ve sau
- ghi lai nhung nhan dinh quan trong ve self-profile cua account Zalo

## Nguon tham khao

- Repo private: `git@github.com:vothanhlam1793/zalo-reverse.git`
- Commit kiem tra duoc qua SSH: `c184a79b7d1bd88670feb85f9de10d666e140fdc`
- Tai lieu nguon chinh trong repo do:
  - `docs/ZALO_API_REVERSED.md`
  - `scripts/capture-zalo-api.ts`
  - `src/core/runtime.ts`

## Cach truy cap repo private

Kiem tra repo co ton tai qua SSH:

```bash
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
git ls-remote git@github.com:vothanhlam1793/zalo-reverse.git
```

Clone de doc source:

```bash
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" \
git clone --depth 1 git@github.com:vothanhlam1793/zalo-reverse.git
```

Ghi chu:
- Repo nay private, HTTPS URL tra `404` neu khong co auth.
- SSH key tren may hien tai truy cap duoc repo.

## Tai lieu ben repo private noi gi

Repo `zalo-reverse` co mot tool Playwright de mo `https://chat.zalo.me/`, capture REST API + WebSocket frames + cookies/localStorage roi sinh tai lieu tong hop.

File lien quan:
- `scripts/capture-zalo-api.ts`: mo Chromium, capture network/websocket/dom events, luu ra JSON
- `docs/ZALO_API_REVERSED.md`: tong hop endpoint, domain, payload, gap analysis

Dieu quan trong la tai lieu do duoc rut ra tu traffic that cua Web Zalo, khong chi dua vao typings cua package.

## Domain service quan trong

Theo `docs/ZALO_API_REVERSED.md`, cac domain can nho:

- `wpa.chat.zalo.me`: login info, legacy APIs
- `tt-profile-wpa.chat.zalo.me`: profile, friend, group member info
- `tt-group-wpa.chat.zalo.me`: group list, group info
- `tt-convers-wpa.chat.zalo.me`: preload conversation, unread, pinned conversations
- `tt-chat2-wpa.chat.zalo.me`: typing, delivered, seen, sms
- `tt-chat3-wpa.chat.zalo.me`: sticker send
- `reaction.chat.zalo.me`: reaction API
- `ws2-msg.chat.zalo.me`: realtime websocket

## API protocol chung

REST response theo envelope:

```json
{
  "error_code": 0,
  "error_message": "Successful.",
  "data": {}
}
```

POST/PUT thuong gui body da ma hoa AES-CBC trong field:

```text
params=<base64-aes-encrypted-json>
```

Moi request thuong kem query:

- `zpw_ver=<API_VERSION>`
- `zpw_type=<API_TYPE>`

## API profile quan trong

### 1. Own profile

```text
GET https://tt-profile-wpa.chat.zalo.me/api/social/profile/me-v2
GET https://tt-profile-wpa.chat.zalo.me/api/social/profile/extra
```

Theo tai lieu private repo, `me-v2` du kien tra ve:

```json
{
  "userId": "...",
  "displayName": "...",
  "avatar": "...",
  "phoneNumber": "..."
}
```

Nhan xet quan trong cho project hien tai:
- `zalo-api-final` dang goi `me-v2` qua `api.fetchAccountInfo()`
- trong runtime thuc te cua chung ta, co luc endpoint nay chi tra `userId`
- vi vay UI account co the chi fallback ve `accountId`

### 2. Own profile extra

```text
GET https://tt-profile-wpa.chat.zalo.me/api/social/profile/extra
```

Repo private co ghi nhan endpoint nay ton tai, nhung `zalo-api-final` hien tai chua expose san method tuong ung trong runtime dang dung.

Huong debug tiep neu can them profile self-account:
- thu goi truc tiep `profile/extra`
- so sanh response giua browser capture va `zalo-api-final`

### 3. Other profile / friend profiles

```text
POST https://tt-profile-wpa.chat.zalo.me/api/social/friend/getprofiles/v2
POST https://tt-profile-wpa.chat.zalo.me/api/social/friend/getminiprofiles
```

Theo package `zalo-api-final`, `getUserInfo(userId)` map vao `getprofiles/v2` va tra ve:

```json
{
  "changed_profiles": {
    "123_0": {
      "userId": "123",
      "displayName": "...",
      "zaloName": "...",
      "avatar": "...",
      "phoneNumber": "..."
    }
  }
}
```

Day la ly do da bo sung fallback trong project hien tai:
- lay `ownUserId` bang `getOwnId()`
- goi `getUserInfo(ownUserId)`
- merge `displayName`, `phoneNumber`, `avatar` vao profile account

## API contact / friend quan trong

### Friend list

```text
GET https://tt-profile-wpa.chat.zalo.me/api/social/friend/getfriends
```

Theo tai lieu private repo, response chua mang friend voi cac field nhu:
- `userId`
- `displayName`
- `alias`
- `avatar`

Trong project hien tai, danh sach contact duoc normalize tu:
- `aliasName`
- `alias`
- `displayName`
- `zaloName`
- `username`
- `userId`

### Friend profiles chi tiet

```text
POST https://tt-profile-wpa.chat.zalo.me/api/social/friend/getprofiles/v2
```

Dung khi can bo sung thong tin chi tiet cho user IDs cu the.

## API group quan trong

### Group list

```text
GET https://tt-group-wpa.chat.zalo.me/api/group/getlg/v4
```

Response co `gridVerMap` hoac danh sach group IDs.

### Group info batch

```text
POST https://tt-group-wpa.chat.zalo.me/api/group/getmg-v2
```

Dung de lay metadata cua nhieu group cung luc sau khi co `gridVerMap`.

### Group members

```text
POST https://tt-profile-wpa.chat.zalo.me/api/social/group/members
```

Response du kien:

```json
{
  "members": [
    {
      "userId": "...",
      "displayName": "...",
      "avatar": "...",
      "role": "..."
    }
  ]
}
```

## API hoi thoai / message / reaction dang can cho roadmap

### Conversation preload

```text
GET https://tt-convers-wpa.chat.zalo.me/api/preloadconvers/get-last-msgs
```

### Reaction

```text
POST https://reaction.chat.zalo.me/api/message/reaction
```

### Typing

```text
POST https://tt-chat2-wpa.chat.zalo.me/api/message/typing
POST https://tt-group-wpa.chat.zalo.me/api/group/typing
```

### Delivered / seen

```text
POST https://tt-chat2-wpa.chat.zalo.me/api/message/deliveredv2
POST https://tt-chat2-wpa.chat.zalo.me/api/message/seenv2
```

### Sticker send

```text
POST https://tt-chat3-wpa.chat.zalo.me/api/message/sticker
```

## Thuc trang project hien tai

### Da xac nhan

- `api.fetchAccountInfo()` trong `zalo-api-final` goi `GET /api/social/profile/me-v2`
- type cua package khai bao co day du `displayName`, `zaloName`, `avatar`, `phoneNumber`
- nhung runtime thuc te co account chi tra ve `userId`

### Da ap dung trong project nay

Project da bo sung fallback trong runtime:

1. `getOwnId()` lay `userId`
2. `fetchAccountInfo()` thu lay profile qua `me-v2`
3. `getUserInfo(ownUserId)` bo sung profile neu `me-v2` khong du field

Neu van khong du data, huong tiep theo la custom call:

- `GET /api/social/profile/extra`
- hoac capture lai traffic bang browser that de so sanh payload

## File can doc lai khi quay ve chu de nay

Trong repo hien tai:
- `src/core/runtime/session-auth.ts`
- `src/core/runtime/index.ts`
- `src/server/routes/accounts.ts`
- `src/server/routes/admin.ts`

Trong repo private:
- `docs/ZALO_API_REVERSED.md`
- `scripts/capture-zalo-api.ts`
- `src/core/runtime.ts`

## Ghi chu thao tac lan sau

Neu can tham khao lai repo private:

1. `git ls-remote git@github.com:vothanhlam1793/zalo-reverse.git`
2. clone repo vao `/tmp/opencode/` de doc
3. mo `docs/ZALO_API_REVERSED.md`
4. neu can xac minh traffic moi, dung `scripts/capture-zalo-api.ts`

## Ket luan ngan

- Repo private khong co meo dac biet nao hon cho self-account; no cung dua vao `me-v2`
- Gia tri lon nhat cua repo private la tai lieu capture API that va tool Playwright de capture lai session Web Zalo
- Cho bai toan hien tai, `getUserInfo(ownUserId)` la fallback thuc dung nhat da duoc dua vao project
