# Domain Model V1

## Muc Tieu

Tai lieu nay chot `domain model V1` cho kien truc da thong nhat:

- `chat-server`
- `zalo-service`
- `shared persistence / integration events`

Muc tieu cua domain model la:

1. tach ro ownership giua cac khoi
2. tranh dung trung mot khai niem cho nhieu nghia
3. chuan bi san cho viec map sang `Chatwoot-style shared inbox`
4. tao nen cho DB schema va event contracts o buoc tiep theo

## Nguyen Tac Dat Ten

Can tranh dung tu `user` mot cach mo ho.

He thong nay co 3 nhom doi tuong khac nhau:

1. `WorkspaceUser`
   - nguoi noi bo dang dung he thong

2. `Channel`
   - mot tai khoan Zalo da dang nhap va dang duoc quan ly

3. `ExternalContact`
   - nguoi ben ngoai dang nhan tin vao channel

Day la 3 doi tuong khac nhau va khong duoc dung chung mot model `user`.

## Boi Canh Domain Tong The

Domain tong the cua he thong la:

`Omnichannel Shared Inbox`

Trong V1, kenh chinh la `Zalo`, nhung model nen duoc dat ten theo huong co the mo rong them provider khac sau nay.

Vi vay:

- `Channel` la khai niem tong quat
- `ZaloChannel` la implementation/provider cu the

## Bounded Contexts

Toan he thong duoc chia thanh 3 bounded context chinh.

### 1. Chat Core

Thuoc `chat-server`.

Trach nhiem:

- workspace users
- permissions
- contact
- conversation
- message
- assignment
- notes
- labels
- UI/inbox operational state

### 2. Channel Runtime

Thuoc `zalo-service`.

Trach nhiem:

- channel registry
- login/session
- credential
- reconnect
- provider sync state
- provider raw metadata

### 3. Integration Flow

Thuoc shared integration layer.

Trach nhiem:

- inbound events
- outbound commands
- delivery receipts
- reconciliation
- dead letter / retry

## Chat Core Entities

Day la cac entity thuoc `chat-server`.

### 1. Workspace

Y nghia:

- mot khong gian van hanh chat
- co nhieu user noi bo va nhieu channel

Thuoc tinh chinh:

- `id`
- `name`
- `status`
- `created_at`
- `updated_at`

### 2. WorkspaceUser

Y nghia:

- nguoi noi bo dang nhap vao he thong

Thuoc tinh chinh:

- `id`
- `workspace_id`
- `email` hoac `username`
- `display_name`
- `status`
- `created_at`
- `updated_at`

Luu y:

- day khong phai tai khoan Zalo
- day khong phai contact ben ngoai

### 3. Role

Y nghia:

- dinh nghia nhom quyen noi bo

Thuoc tinh chinh:

- `id`
- `workspace_id`
- `name`
- `permissions`

### 4. ChannelAccess

Y nghia:

- quan he giua `WorkspaceUser` va `Channel`
- user nao duoc xem/tra loi/quan ly kenh nao

Thuoc tinh chinh:

- `id`
- `workspace_id`
- `workspace_user_id`
- `channel_id`
- `permission_scope`
- `created_at`

Gia tri goi y cho `permission_scope`:

- `view`
- `reply`
- `manage`
- `admin`

### 5. ExternalContact

Y nghia:

- doi tuong ben ngoai dang giao tiep voi mot channel

Thuoc tinh chinh:

- `id`
- `workspace_id`
- `channel_id`
- `provider`
- `external_contact_id`
- `display_name`
- `avatar_url`
- `phone_number`
- `metadata`
- `last_seen_at`
- `created_at`
- `updated_at`

Luu y:

- cung mot nguoi co the xuat hien o nhieu channel khac nhau
- khong nen vọi gop contact giua cac channel neu chua co quy tac identity ro rang

### 6. Conversation

Y nghia:

- mot luong hoi thoai nghiep vu trong inbox

Thuoc tinh chinh:

- `id`
- `workspace_id`
- `channel_id`
- `contact_id`
- `provider`
- `external_conversation_id`
- `status`
- `subject` hoac `title`
- `last_message_at`
- `created_at`
- `updated_at`

Gia tri goi y cho `status`:

- `open`
- `pending`
- `resolved`
- `closed`

### 7. Message

Y nghia:

- mot tin nhan trong conversation

Thuoc tinh chinh:

- `id`
- `workspace_id`
- `channel_id`
- `conversation_id`
- `provider`
- `external_message_id`
- `direction`
- `sender_type`
- `sender_ref_id`
- `text`
- `attachments`
- `delivery_status`
- `sent_at`
- `received_at`
- `created_at`
- `updated_at`

Gia tri goi y:

- `direction`: `inbound`, `outbound`
- `sender_type`: `contact`, `workspace_user`, `system`, `channel`
- `delivery_status`: `pending`, `sent`, `delivered`, `failed`, `unknown`

### 8. ConversationAssignment

Y nghia:

- conversation dang duoc giao cho ai

Thuoc tinh chinh:

- `id`
- `conversation_id`
- `workspace_user_id`
- `assigned_by_user_id`
- `assigned_at`
- `status`

### 9. ConversationLabel

Y nghia:

- nhan gan cho conversation de phan loai

Thuoc tinh chinh:

- `id`
- `workspace_id`
- `name`
- `color`

Bang lien ket:

- `conversation_label_link`
  - `conversation_id`
  - `label_id`

### 10. ConversationNote

Y nghia:

- ghi chu noi bo khong gui ra ngoai

Thuoc tinh chinh:

- `id`
- `conversation_id`
- `workspace_user_id`
- `content`
- `created_at`

### 11. ConversationReadState

Y nghia:

- trang thai da doc cua moi user noi bo voi conversation

Thuoc tinh chinh:

- `id`
- `conversation_id`
- `workspace_user_id`
- `last_read_message_id`
- `last_read_at`

## Channel Runtime Entities

Day la cac entity thuoc `zalo-service`.

### 1. Channel

Y nghia:

- mot kenh giao tiep ngoai he thong
- trong V1, kenh nay chu yeu la mot tai khoan Zalo

Thuoc tinh chinh:

- `id`
- `workspace_id`
- `provider`
- `name`
- `status`
- `external_account_id`
- `created_at`
- `updated_at`

Gia tri goi y cho `provider`:

- `zalo`

Gia tri goi y cho `status`:

- `draft`
- `qr_pending`
- `connected`
- `disconnected`
- `error`
- `disabled`

### 2. ChannelCredential

Y nghia:

- thong tin nhay cam de dang nhap lai channel

Thuoc tinh chinh:

- `id`
- `channel_id`
- `credential_type`
- `credential_payload`
- `version`
- `created_at`
- `updated_at`

Luu y:

- du lieu nay rat nhay cam
- can xem xet ma hoa khi luu

### 3. ChannelSession

Y nghia:

- phien runtime hien tai cua channel

Thuoc tinh chinh:

- `id`
- `channel_id`
- `session_status`
- `connected_at`
- `last_heartbeat_at`
- `last_error`
- `retry_count`
- `updated_at`

### 4. ChannelStatusLog

Y nghia:

- lich su thay doi trang thai channel

Thuoc tinh chinh:

- `id`
- `channel_id`
- `status`
- `reason`
- `payload`
- `created_at`

### 5. ChannelSyncState

Y nghia:

- theo doi tien trinh dong bo du lieu provider

Thuoc tinh chinh:

- `id`
- `channel_id`
- `sync_type`
- `cursor`
- `last_synced_at`
- `sync_status`
- `last_error`

Gia tri goi y cho `sync_type`:

- `contacts`
- `messages`
- `conversations`

### 6. ProviderContactSnapshot

Y nghia:

- du lieu raw hoac semi-normalized lay tu provider
- phuc vu doi soat va re-sync neu can

Thuoc tinh chinh:

- `id`
- `channel_id`
- `provider`
- `external_contact_id`
- `payload`
- `fetched_at`

Day la entity tuy chon, nhung nen co neu muon doi soat ben vung hon.

## Integration Flow Entities

Day la cac entity trung gian de giai bai toan bat dong bo giua `chat-server` va `zalo-service`.

### 1. InboundEvent

Y nghia:

- su kien di tu provider vao he thong

Thuoc tinh chinh:

- `id`
- `event_type`
- `provider`
- `channel_id`
- `dedupe_key`
- `payload`
- `occurred_at`
- `processed_at`
- `processing_status`

Gia tri goi y cho `event_type`:

- `message_received`
- `contact_updated`
- `channel_connected`
- `channel_disconnected`
- `login_qr_ready`
- `login_failed`

### 2. OutboundCommand

Y nghia:

- lenh tu chat-server gui sang channel runtime

Thuoc tinh chinh:

- `id`
- `command_type`
- `provider`
- `channel_id`
- `dedupe_key`
- `payload`
- `created_at`
- `processed_at`
- `processing_status`

Gia tri goi y cho `command_type`:

- `send_message`
- `start_qr_login`
- `reconnect_channel`
- `sync_contacts`

### 3. DeliveryReceipt

Y nghia:

- phan hoi ket qua xu ly outbound

Thuoc tinh chinh:

- `id`
- `channel_id`
- `message_id`
- `external_message_id`
- `receipt_status`
- `payload`
- `occurred_at`

Gia tri goi y cho `receipt_status`:

- `sent`
- `delivered`
- `failed`

### 4. ReconciliationJob

Y nghia:

- job doi soat de sua lech state giua cac ben

Thuoc tinh chinh:

- `id`
- `job_type`
- `channel_id`
- `status`
- `input_payload`
- `result_payload`
- `created_at`
- `finished_at`

Gia tri goi y cho `job_type`:

- `resync_contacts`
- `resync_messages`
- `repair_conversation`
- `retry_failed_delivery`

### 5. DeadLetterEvent

Y nghia:

- noi giu event/command loi de phan tich va retry sau

Thuoc tinh chinh:

- `id`
- `source_type`
- `source_id`
- `error_message`
- `payload`
- `created_at`

## Quan He Chinh Giua Cac Entity

```text
Workspace
  -> WorkspaceUser
  -> Channel

WorkspaceUser
  -> ChannelAccess -> Channel

Channel
  -> ExternalContact
  -> Conversation
  -> ChannelCredential
  -> ChannelSession
  -> ChannelSyncState
  -> ChannelStatusLog

ExternalContact
  -> Conversation

Conversation
  -> Message
  -> ConversationAssignment
  -> ConversationNote
  -> ConversationLabelLink
  -> ConversationReadState

OutboundCommand
  -> co the tao DeliveryReceipt

InboundEvent
  -> duoc chat-server consume de tao/cap nhat Contact/Conversation/Message
```

## Ownership Rules

Day la nguyen tac quan trong nhat cua V1.

### Chi `chat-server` duoc ghi vao:

- `Workspace`
- `WorkspaceUser`
- `Role`
- `ChannelAccess`
- `ExternalContact`
- `Conversation`
- `Message`
- `ConversationAssignment`
- `ConversationLabel`
- `ConversationNote`
- `ConversationReadState`

### Chi `zalo-service` duoc ghi vao:

- `Channel`
- `ChannelCredential`
- `ChannelSession`
- `ChannelStatusLog`
- `ChannelSyncState`
- `ProviderContactSnapshot`

### Ca hai ben tham gia qua contract vao:

- `InboundEvent`
- `OutboundCommand`
- `DeliveryReceipt`
- `ReconciliationJob`
- `DeadLetterEvent`

Nhung van phai co ownership xu ly ro rang o muc processing.

## Identity Va Dedupe Rules

Can chot som cac khoa nhan dang ngoai he thong.

### Contact identity

Nen unique theo:

- `provider`
- `channel_id`
- `external_contact_id`

Khong nen unique toan he thong theo `external_contact_id` don le.

### Conversation identity

Nen unique theo:

- `provider`
- `channel_id`
- `external_conversation_id`

### Message identity

Nen unique theo:

- `provider`
- `channel_id`
- `external_message_id`

Neu provider khong luon tra `external_message_id` on dinh, can them `dedupe_key` do `zalo-service` tao.

## Message Model Bo Sung

Tin nhan trong he thong khong chi la text don gian. V1 nen du phong:

- `attachments`
- `quoted_message_ref`
- `raw_metadata`

Dieu nay giup sau nay mo rong sang:

- hinh anh
- file
- sticker
- system event message

## Trang Thai Quan Trong

### Conversation status

- `open`
- `pending`
- `resolved`
- `closed`

### Channel status

- `draft`
- `qr_pending`
- `connected`
- `disconnected`
- `error`
- `disabled`

### Message delivery status

- `pending`
- `sent`
- `delivered`
- `failed`
- `unknown`

### Event processing status

- `pending`
- `processing`
- `processed`
- `failed`

## Mapping Sang Chatwoot Style Domain

Neu chon reuse Chatwoot-style domain, map nhu sau:

- `WorkspaceUser` -> agent/user
- `Channel` -> inbox unit
- `ExternalContact` -> contact
- `Conversation` -> conversation
- `Message` -> message
- `ConversationAssignment` -> assignee relation
- `ConversationNote` -> internal note
- `ConversationLabel` -> label

Phan `ChannelSession`, `ChannelCredential`, `ChannelSyncState` khong nen ep map vao chat domain. No thuoc runtime cua `zalo-service`.

## Nhung Diem Co Chu Y O V1

1. `Channel` co xuat hien trong chat-core relation, nhung ownership van thuoc `zalo-service`
2. `ExternalContact` khong nen gop contact xuyen channel qua som
3. `Message` phai thiet ke cho idempotency tu dau
4. `InboundEvent` va `OutboundCommand` la thanh phan cot loi, khong phai phu tro
5. khong duoc de `chat-server` doc session credential truc tiep

## Chot V1

Domain model V1 duoc chia ro thanh 3 nhom:

1. `Chat Core`
   - van hanh inbox va nguoi dung noi bo

2. `Channel Runtime`
   - van hanh ket noi va session provider

3. `Integration Flow`
   - dam bao dong bo ben vung giua hai ben

Mo hinh nay phu hop voi huong:

- `Chatwoot-style chat-server`
- `zalo-service` doc lap
- co kha nang mo rong them provider khac sau nay
