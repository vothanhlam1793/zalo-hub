# Multi-Account Implementation

## Mục Tiêu

Tài liệu này chốt bản triển khai thực dụng để đưa codebase từ trạng thái `gold-8 / multi-account dang chuyen do` sang trạng thái co the coi la `done` cho phan multi-account foundation.

Phạm vi của bản này bám theo `gold-8.md`, `gold-multi.md`, và code hiện tại trong `src/`.
Trọng tâm là đóng các khoảng hở kiến trúc trước, thay vì mở thêm feature mới.

## Definition Of Done

Chỉ coi là done khi đạt toàn bộ các điều sau:

1. Runtime nghiệp vụ chính không còn phụ thuộc vào `primary account` để chat, sync, realtime.
2. `1 runtime = 1 account` là sự thật duy nhất trong code.
3. Các read/write lõi ở store không còn phụ thuộc ngầm vào `activeAccountId`.
4. Frontend workspace chỉ dùng `account-scoped API` cho các flow chính.
5. Realtime, send message, history sync, metadata sync không lẫn giữa các account.
6. Restart backend vẫn restore được nhiều account đã lưu và mỗi account giữ listener/session riêng.

## Pham Vi 4 Bước Triển Khai

4 bước bên dưới là thứ tự triển khai đề xuất ngắn nhất để chốt multi-account foundation.

### Bước 1 - Dọn Server Hybrid, Chuẩn Hóa Account-Scoped Flow

Mục tiêu:

1. `AccountRuntimeManager` trở thành cửa vào duy nhất cho runtime nghiệp vụ.
2. Route cũ không còn là luồng xử lý chính.
3. `primary account` chỉ còn là default workspace selection, không còn là data/runtime truth.

Hiện trạng cần xử lý:

1. `src/server/index.ts` vẫn giữ đồng thời:
   - `loginRuntime`
   - `accountManager`
   - các route cũ theo `primaryRuntime`
2. Route mới `account-scoped` đã có, nhưng route cũ vẫn còn chạy nghiệp vụ thật.
3. WebSocket bootstrap ban đầu vẫn đẩy state theo `primaryAccountId`.

File chính cần sửa:

1. `src/server/index.ts`
2. `src/server/account-manager.ts`

Checklist triển khai:

1. Rà toàn bộ route cũ trong `src/server/index.ts`:
   - `/api/friends`
   - `/api/contacts`
   - `/api/groups`
   - `/api/conversations`
   - `/api/conversations/:conversationId/messages`
   - `/api/conversations/:conversationId/sync-metadata`
   - `/api/conversations/sync-history`
   - `/api/send`
   - `/api/send-attachment`
   - `/api/logout`
2. Quyết định rõ từng route cũ thuộc loại nào:
   - wrapper tạm qua active account
   - deprecated nhưng còn giữ tương thích
   - xóa hẳn nếu frontend không còn dùng
3. Gom các helper lấy runtime trong server về một hướng duy nhất:
   - ưu tiên `getRuntimeForAccount(accountId)`
   - hạn chế `getPrimaryRuntimeOrThrow()` chỉ còn cho compatibility nếu bắt buộc
4. Chuẩn hóa API status/account list:
   - `GET /api/accounts` trả đúng danh sách account + runtime/session state
   - `GET /api/accounts/:accountId/status` là nguồn sự thật cho từng account
5. Chuẩn hóa login completion flow:
   - sau QR login, account mới được đăng ký vào manager
   - nếu cần set active account mặc định thì chỉ là UI default, không làm đổi logic runtime lõi
6. Rà WebSocket bootstrap khi client mới kết nối:
   - không giả định chỉ có một account duy nhất đáng quan tâm
   - event bootstrap phải rõ là cho account nào
7. Giảm broadcast mù cho mọi client nếu payload vốn chỉ liên quan một account.

Acceptance cho bước 1:

1. Mọi API chat/sync/send mới đều đi qua route có `accountId`.
2. Route cũ không còn là luồng chính cho workspace mới.
3. `primary account` không còn giữ vai trò runtime truth trong server.

Rủi ro cần để ý:

1. Frontend hoặc script cũ có thể vẫn gọi route legacy.
2. Login flow QR hiện đang gắn với singleton `loginRuntime`, nên cần đổi dần thay vì đập một lần.

### Bước 2 - Chốt Runtime Per Account Thật Sự

Mục tiêu:

1. `GoldRuntime` đại diện đúng một tài khoản Zalo.
2. Không còn flow switch account trên cùng runtime instance.
3. Session/listener/cache/conversation state tách biệt hoàn toàn theo account.

Hiện trạng cần xử lý:

1. `src/core/runtime.ts` vẫn có `activateAccount(accountId)`.
2. Cách làm này stop listener, clear cache, rồi login account khác trên cùng instance.
3. Điều này trái với hướng chuẩn trong `gold-multi.md`.

File chính cần sửa:

1. `src/core/runtime.ts`
2. `src/server/account-manager.ts`
3. `src/server/index.ts`

Checklist triển khai:

1. Audit toàn bộ chỗ nào còn gọi `runtime.activateAccount(...)`.
2. Xóa hoặc ngưng sử dụng `GoldRuntime.activateAccount(accountId)` trong nghiệp vụ chính.
3. Chốt contract của `GoldRuntime`:
   - runtime được tạo cho một account đã biết
   - runtime chỉ reconnect/login/listen cho account đó
   - runtime không tự chuyển sang account khác
4. Nếu cần, thêm metadata tường minh trên runtime:
   - `boundAccountId`
   - hoặc getter tương đương để debug/tracing rõ hơn
5. Trong `AccountRuntimeManager`:
   - `ensureRuntime(accountId)` phải là lối vào chính
   - runtime được cache theo `accountId`
   - warm start nhiều account dùng cùng cơ chế này
6. Review listener lifecycle:
   - start listener khi runtime sẵn sàng
   - reconnect/lỗi của account A không làm ảnh hưởng account B
7. Review cache nội bộ runtime:
   - conversations
   - seen message keys
   - contact cache
   - group cache
   - current account info
   Tất cả phải chỉ phản ánh một account duy nhất.

Acceptance cho bước 2:

1. Không còn switch-account semantics trong runtime lõi.
2. Mỗi account có runtime riêng, listener riêng, cache riêng.
3. Lỗi reconnect của một account không làm reset account khác.

### Bước 3 - Refactor Store Sang Explicit AccountId

Mục tiêu:

1. Các read/write lõi của `GoldStore` nhận `accountId` tường minh.
2. `activeAccountId` chỉ còn là compatibility/default state tạm thời.
3. Data layer đủ an toàn để nhiều runtime cùng dùng mà không phụ thuộc implicit global state.

Hiện trạng cần xử lý:

1. `src/core/store.ts` vẫn phụ thuộc mạnh vào `activeAccountId`.
2. Nhiều query SQL đúng là có `account_id`, nhưng đầu vào lại lấy ngầm từ state của store.
3. Đây là rủi ro correctness lớn nhất nếu về sau code reuse sai store instance hoặc thêm flow mới.

File chính cần sửa:

1. `src/core/store.ts`
2. `src/core/runtime.ts`
3. `src/server/account-manager.ts`
4. Có thể thêm cập nhật ở `src/core/types.ts` nếu cần tách kiểu rõ hơn.

Ưu tiên refactor các hàm sau trước:

1. `getCredential()`
2. `listContacts()`
3. `listGroups()`
4. `listConversationSummaries()`
5. `listConversationMessages()`
6. `hasMessageByProviderId()`
7. `replaceConversationMessages()`
8. các hàm upsert contact/group/message/conversation
9. các helper lookup avatar/display name nếu còn implicit theo active account

Chiến lược triển khai:

1. Không refactor toàn bộ file theo kiểu big bang.
2. Thêm các hàm explicit mới trước, ví dụ:
   - `listContactsByAccount(accountId)`
   - `listGroupsByAccount(accountId)`
   - `listConversationSummariesByAccount(accountId)`
   - `listConversationMessagesByAccount(accountId, conversationId, options)`
3. Chuyển runtime sang dùng các hàm explicit này.
4. Giữ hàm cũ làm wrapper tạm nếu cần để tránh thay đổi quá rộng cùng lúc.
5. Sau khi toàn bộ caller chính đã đổi xong, mới thu gọn hoặc bỏ wrapper cũ.

Checklist triển khai:

1. Liệt kê các hàm store còn implicit và caller của chúng.
2. Tạo nhóm API explicit theo account cho read path trước.
3. Chuyển runtime/message hydration/history load sang read path explicit.
4. Tạo nhóm API explicit theo account cho write path.
5. Chuyển luồng persist contacts/groups/messages/attachments/conversations sang write path explicit.
6. Audit lại tất cả query `SELECT/INSERT/UPDATE/DELETE` để chắc chắn `account_id` luôn được ràng buộc đúng.
7. Rà các helper private như lookup avatar/display name để không vô tình quay lại dùng `activeAccountId`.

Acceptance cho bước 3:

1. Read/write lõi của store không còn correctness phụ thuộc vào `activeAccountId`.
2. Runtime có thể hoạt động đúng chỉ với `accountId` bound của nó.
3. Không có path ghi đè chéo dữ liệu giữa các account do lấy sai active account.

Ghi chú triển khai:

1. `activeAccountId` có thể vẫn giữ lại tạm cho:
   - login mặc định
   - account đang chọn ở mức app meta
   - wrapper compatibility
2. Nhưng không được tiếp tục là nền của data correctness.

### Bước 4 - Audit Data Identity, Frontend Workspace, Và Verify End-To-End

Mục tiêu:

1. Đảm bảo dữ liệu và cache không collision giữa nhiều account.
2. Frontend workspace chỉ dùng flow `account-scoped`.
3. Hoàn tất bộ verify thực tế để có thể kết luận multi-account pass.

Phần A - Audit data identity

Hiện trạng cần xử lý:

1. Theo `gold-multi.md`, `messages.id` đã từng gặp lỗi collision toàn cục.
2. `attachments.id` vẫn cần audit kỹ.
3. Cần xác nhận mọi key liên quan message/attachment/conversation cache đều account-safe.

File chính cần rà:

1. `src/core/store.ts`
2. `src/core/runtime.ts`
3. mọi chỗ tạo ID message/attachment nếu có helper riêng

Checklist:

1. Audit rule tạo `message.id` hiện tại.
2. Audit rule tạo `attachment.id` hiện tại.
3. Nếu chưa namespace an toàn, chốt một rule duy nhất:
   - `accountId::...`
   - hoặc local generated id + unique key riêng cho dedupe
4. Verify load attachments theo `message_id` vẫn đúng sau khi namespace hóa.
5. Review dedupe theo `provider_message_id` để chắc vẫn giới hạn đúng theo account + conversation.

Phần B - Chốt frontend workspace account-scoped

Hiện trạng:

1. `src/web/App.tsx` đã có `selectedAccountId` và cache key theo account.
2. `src/web/api.ts` vẫn còn cả API cũ và API mới.
3. Cần khóa hẳn flow workspace theo `accountId`.

File chính cần sửa:

1. `src/web/App.tsx`
2. `src/web/api.ts`
3. `src/web/useWebSocket.ts`
4. `src/web/types.ts` nếu cần rõ semantics hơn

Checklist:

1. Xác nhận UI chính chỉ dùng các API `account*` cho:
   - contacts
   - groups
   - conversations
   - messages
   - sync metadata
   - sync history
   - send text
   - send attachment
2. Rà fallback logic của `selectedAccountId` để không tạo hành vi khó đoán khi nhiều account active.
3. Xác nhận message cache luôn key theo `accountId::conversationId`.
4. Xác nhận khi đổi account:
   - clear selection conversation cũ
   - không reuse message list của account khác
   - websocket resubscribe đúng account mới
5. Xác nhận khi socket reconnect:
   - chỉ resubscribe conversation hiện tại của workspace hiện tại
   - event đến từ account khác không làm bẩn UI hiện tại

Phần C - Verify end-to-end

Đây là bộ verify tối thiểu để coi là pass:

1. Có ít nhất 2 account đã lưu credential.
2. Restart backend.
3. Xác nhận `warmStartAllAccounts()` load lại được nhiều runtime.
4. Xác nhận cả 2 account có thể hiện status riêng qua API.
5. Mở workspace account A:
   - load contacts/groups/conversations đúng account A
   - mở conversation và load message đúng account A
6. Chuyển sang account B:
   - dữ liệu list đổi đúng theo account B
   - không reuse nhầm cache/message của A
7. Gửi tin nhắn từ A rồi từ B:
   - message đi đúng account đang chọn
   - summary cập nhật đúng account tương ứng
8. Realtime incoming ở A không làm conversation của B cập nhật sai.
9. Realtime incoming ở B không làm timeline đang mở của A nhảy message sai.
10. Restart lại backend và kiểm tra data vẫn sạch.

Acceptance cho bước 4:

1. Không còn collision hoặc lẫn cache giữa nhiều account.
2. Frontend workspace vận hành thuần account-scoped.
3. Verify thực tế pass với ít nhất 2 account.

## Những Việc Chưa Nằm Trong 4 Bước Này

Các phần dưới đây quan trọng nhưng không bắt buộc phải hoàn thành để chốt multi-account foundation:

1. Mở rộng full profile field đầy đủ như `bio`, `gender`, `birth_date`, `cover_url`, `profile_json`, `last_profile_sync_at`.
2. Thêm schema `system_users`, `system_user_sessions`, `zalo_account_memberships`.
3. Authentication và authorization đầy đủ cho user hệ thống.
4. Shared inbox workflow như assignment, notes, labels, audit log.

Các phần này nên được làm tiếp sau khi 4 bước trên đã ổn định, hoặc tách thành phase sau của `gold-8 closeout`.

## Trạng Thái Triển Khai

✅ **Đã hoàn tất 4 bước** — Gold-8 đã pass nghiệm thu với 3 tài khoản Zalo active đồng thời.

Kết quả chi tiết xem tại: `archived/GOLD-8-RESULT.md`

## Những Việc Chuyển Sang Gold-9
