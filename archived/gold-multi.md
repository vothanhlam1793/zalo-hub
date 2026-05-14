# Gold Multi

## Mục Tiêu

Tài liệu này chốt lại các vấn đề đang gặp khi chuyển app từ mô hình `1 account active` sang `multi-account active đồng thời`, và ghi rõ hướng sửa để tiếp tục implement không bị lệch kiến trúc.

## Các Vấn Đề Chính

### 1. Hybrid architecture trong server

`src/server/index.ts` hiện còn giữ đồng thời:

1. `runtime` singleton cũ
2. `store` singleton cũ
3. `AccountRuntimeManager` mới

Điều này tạo ra hai nguồn sự thật cho session, status, message flow và workspace APIs.

### 2. Runtime vẫn còn tư duy switch account

`GoldRuntime.activateAccount(accountId)` đang stop listener, clear cache và login account mới trên cùng runtime instance.

Điều này trái với mục tiêu đích:

1. `1 runtime = 1 Zalo account`
2. nhiều account phải active đồng thời

### 3. Store vẫn phụ thuộc mạnh vào `activeAccountId`

Các hàm lõi của `GoldStore` vẫn implicit theo account active hiện tại.

Điều này chưa đủ an toàn cho multi-account lâu dài, dù có thể tạm thời chạy được khi mỗi runtime có `GoldStore` instance riêng.

### 4. Data identity chưa account-safe hoàn toàn

Đã gặp lỗi thực tế với `messages.id` unique toàn cục khi nhiều account cùng tồn tại.

Đã vá theo hướng namespace hóa `message id` bằng `accountId::messageId`.

Tuy nhiên `attachments.id` vẫn còn nguy cơ tương tự và cần được namespace hóa hoặc redesign schema sau đó.

### 5. Frontend cache chưa partition theo account

`messageCacheRef` đang key theo `conversationId` đơn thuần.

Với multi-account, `conversationId` có thể trùng giữa các account nên cache cần key theo:

`accountId::conversationId`

### 6. Route cũ và route account-scoped đang cùng tồn tại

UI mới đã bắt đầu đi theo `accountId`, nhưng server vẫn giữ nhiều route cũ chạy nghiệp vụ trực tiếp trên singleton runtime.

Nếu không dọn dần, hành vi hệ thống sẽ không nhất quán.

## Hướng Sửa Chốt

### Giai đoạn 1 - Dọn server hybrid

1. `AccountRuntimeManager` trở thành cửa vào chính cho runtime
2. server route account-scoped lấy runtime từ manager
3. route cũ chỉ còn là wrapper theo active account hoặc deprecated

### Giai đoạn 2 - Runtime per account thật sự

1. `GoldRuntime` không còn giữ vai trò switch account
2. manager tạo runtime cho account, khởi động runtime đó, dùng lại runtime đó
3. mỗi runtime giữ session/listener/cache riêng

### Giai đoạn 3 - Store explicit accountId

1. refactor các hàm lõi của store sang nhận `accountId` tường minh
2. `activeAccountId` chỉ còn là compatibility state tạm

### Giai đoạn 4 - Frontend account-safe

1. cache message theo `accountId::conversationId`
2. sidebar có trạng thái runtime theo từng account
3. workspace chỉ dùng account-scoped APIs

### Giai đoạn 5 - Session recovery và bootstrap

1. warm-start nhiều account lúc boot
2. audit lại restore credential/cookie normalization
3. verify public flow thực tế với ít nhất 2 account

## Tiêu Chí Pass Cho Multi-Account

Chỉ coi là đạt khi pass toàn bộ:

1. nhiều account cùng có runtime/listener active đồng thời
2. bấm account nào thì workspace account đó load ra
3. gửi tin nhắn đúng theo account đang chọn
4. realtime không lẫn giữa các account
5. data không ghi đè chéo giữa các account
6. restart backend vẫn restore được nhiều account đã lưu
