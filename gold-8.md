# Gold-8

## Mục Tiêu

`gold-8` là mốc đổi hướng kiến trúc từ app chat Zalo cho `1 user` sang nền tảng nhiều tài khoản Zalo active đồng thời, có `system user` và phân quyền theo từng tài khoản Zalo.

Mục tiêu của `gold-8` không còn chỉ là thêm avatar/profile cho UI.
`gold-8` phải đặt nền data model, runtime direction, API direction và permission direction đủ đúng để các gold sau không phải đập lại phần lõi.

Những gì phải chốt ở mốc này:

1. `Zalo account` là partition dữ liệu gốc cho chat data
2. `system user` là user đăng nhập vào app, không phải Zalo account
3. Quan hệ `system user <-> zalo account` là many-to-many qua bảng membership/permission
4. Nhiều `Zalo account` phải có thể active cùng lúc ở các gold sau
5. Full profile của account/contact/group phải được persist đủ rộng và không ghi đè chéo giữa các account

## Phạm Vi Triển Khai

### 1. Full Profile Storage

Mở rộng schema DB để lưu profile đầy đủ hơn cho:

1. `accounts`
2. `friends`
3. `groups`

Nguyên tắc lưu:

1. Có bộ field chuẩn hóa dùng trực tiếp trong app:
   - `display_name`
   - `avatar`
   - `zalo_name`
   - `status`
   - `phone_number`
   - `bio`
   - `gender`
   - `birth_date`
   - `cover_url`
2. Có `profile_json` để giữ raw payload đầy đủ nhất đang lấy được từ upstream
3. Có `last_profile_sync_at`
4. Mọi dữ liệu đều phải scope theo `account_id` đúng nghĩa, không ghi đè chéo giữa các account

### 2. Refactor Store Direction

`GoldStore` hiện đang nghiêng mạnh về `activeAccountId`.

Trong `gold-8`, cần chốt hướng refactor:

1. Các hàm read/write quan trọng phải nhận `accountId` tường minh
2. `activeAccountId` chỉ còn là convenience state tạm thời, không phải trụ cột logic lâu dài
3. `replaceContacts`, `replaceGroups`, `listConversationSummaries`, `listConversationMessages`, `upsertContact`, `upsertGroup`, `canonicalizeConversationData` phải được audit theo hướng multi-account-safe

### 3. Runtime Direction

`GoldRuntime` hiện là singleton runtime cho cả app.

Trong `gold-8`, phải chốt và chuẩn bị hướng mới:

1. `1 GoldRuntime = 1 Zalo account`
2. Tương lai `server` sẽ có `AccountRuntimeManager`
3. Session/listener/cache/profile của mỗi account phải tách biệt
4. Login flow hiện tại phải được xem là tiền đề cho `add account flow`, không phải flow duy nhất của toàn hệ thống

### 4. Account-Scoped API Direction

Trong `gold-8`, chưa cần chuyển hết toàn bộ route sang dạng mới, nhưng phải chốt contract direction:

1. `/api/accounts`
2. `/api/accounts/:accountId/status`
3. `/api/accounts/:accountId/contacts`
4. `/api/accounts/:accountId/groups`
5. `/api/accounts/:accountId/conversations`
6. `/api/accounts/:accountId/conversations/:conversationId/messages`
7. `/api/accounts/:accountId/send`

Mục tiêu là mọi feature mới từ `gold-9` trở đi đều đi theo route có `accountId`.

### 5. WebSocket Direction

Trong `gold-8`, phải chốt lại contract WebSocket:

1. subscribe theo `{ accountId, conversationId }`
2. event message phải phát kèm `accountId`
3. event summary/status phải tách theo account
4. sau `gold-10`, WebSocket sẽ còn phải check permission theo system user

### 6. System Users và Permissions Domain

`gold-8` phải chốt domain mới của app:

1. `system_users`
2. `system_user_sessions`
3. `zalo_accounts`
4. `zalo_account_memberships`

Role dự kiến theo account:

1. `owner`
2. `manager`
3. `agent`
4. `viewer`

### 7. UI/Profile/Avatar

Vì full profile đã có trong DB, `gold-8` vẫn bao gồm phần hiển thị:

1. avatar account ở sidebar/header
2. avatar contact/group trong list
3. avatar conversation summary
4. avatar chat header
5. expose account profile rộng hơn qua API status/account endpoints

## Tiêu Chí Nghiệm Thu

`gold-8` pass khi:

1. Tài liệu kiến trúc mới đã chốt rõ trong repo
2. DB đã có hướng mở rộng profile đúng cho `accounts`, `friends`, `groups`
3. Không còn assumption cứng rằng app chỉ có `1 account active duy nhất` ở tầng dữ liệu lõi
4. Full profile/account/contact/group có thể được persist mà không làm bẩn dữ liệu account khác
5. Hướng API/WebSocket/runtime cho multi-account active đồng thời đã được khóa trong tài liệu và phản ánh vào code chuẩn bị

## Kết Quả Mong Muốn Sau Gold-8

Sau `gold-8`, codebase phải ở trạng thái:

1. đủ an toàn để thêm nhiều Zalo account mà không mất dữ liệu cũ
2. đủ dữ liệu profile để render UI tốt hơn ngay
3. đủ đúng về mô hình để sang `gold-9` triển khai `AccountRuntimeManager`
4. đủ rõ về domain để sang `gold-10` thêm `system users + permissions`

## Ngoài Phạm Vi Trực Tiếp Của Gold-8

Những phần này là đích tiếp theo, nhưng không bắt buộc phải hoàn tất trọn vẹn trong `gold-8`:

1. nhiều runtime active đồng thời chạy production hoàn chỉnh
2. user hệ thống login thật và authorization đầy đủ
3. assignment/notes/labels/audit workflow

Các phần trên sẽ đi vào `gold-9`, `gold-10`, `gold-11`.
