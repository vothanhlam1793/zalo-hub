# Event Contracts V1

## Muc Tieu

Tai lieu nay chot contract giao tiep giua:

- `chat-server`
- `zalo-service`

Muc tieu cua V1:

1. tach ro `command` va `event`
2. dam bao idempotency
3. giam nguy co bat dong bo giua hai service
4. tao nen de implement `shared-contracts` package sau nay

## Nguyen Tac Tong Quat

### 1. Command va Event la hai huong khac nhau

`chat-server` gui `command` sang `zalo-service` de yeu cau hanh dong.

`zalo-service` phat `event` ve de thong bao ket qua, trang thai, hoac du lieu moi.

### 2. Moi payload phai co metadata chuan

Moi command/event deu can:

- `id`
- `type`
- `occurred_at` hoac `created_at`
- `provider`
- `workspace_id`
- `channel_id`
- `trace_id`
- `dedupe_key`

### 3. Idempotency la bat buoc

Moi consumer phai xu ly theo huong:

- cung `id` hoac `dedupe_key` khong duoc tao hieu ung hai lan

### 4. Khong dua credential nhay cam vao event payload

Cookie, session payload day du, token va du lieu dang nhap nhay cam khong duoc dua vao command/event chung.

### 5. Event la immutable

Khi da phat event, khong sua lai event cu. Neu state thay doi, phat event moi.

## Envelope Chuan

Tat ca contract nen theo mot envelope thong nhat.

```json
{
  "id": "evt_01",
  "type": "message.received",
  "provider": "zalo",
  "workspace_id": "ws_01",
  "channel_id": "ch_01",
  "trace_id": "trace_01",
  "dedupe_key": "zalo:ch_01:msg_123",
  "created_at": "2026-05-10T10:00:00.000Z",
  "payload": {}
}
```

## Shared Metadata Fields

### Required

- `id`
  - id noi bo cua command/event

- `type`
  - loai command/event

- `provider`
  - V1 la `zalo`

- `workspace_id`
  - workspace so huu channel

- `channel_id`
  - channel lien quan

- `trace_id`
  - de trace mot flow xuyen service

- `dedupe_key`
  - khoa dedupe

- `created_at`
  - thoi diem tao payload

- `payload`
  - noi dung nghiep vu

### Optional

- `causation_id`
  - id cua command/event gay ra event nay

- `correlation_id`
  - id gom nhom nhieu event/command cung mot flow

- `version`
  - version contract, mac dinh `1`

## Command Flow

Day la cac lenh `chat-server` gui sang `zalo-service`.

### 1. `channel.create`

Muc dich:

- tao channel runtime moi cho mot workspace

Payload:

```json
{
  "name": "Zalo Hotline 01",
  "provider": "zalo",
  "metadata": {
    "requested_by_user_id": "user_01"
  }
}
```

Ket qua mong doi:

- `channel.created`

### 2. `channel.start_qr_login`

Muc dich:

- bat dau quy trinh QR login cho channel

Payload:

```json
{
  "requested_by_user_id": "user_01"
}
```

Ket qua mong doi:

- `channel.qr_ready`
- `channel.connected`
- hoac `channel.login_failed`

### 3. `channel.reconnect`

Muc dich:

- yeu cau `zalo-service` reconnect channel bang credential da luu

Payload:

```json
{
  "requested_by_user_id": "user_01",
  "reason": "manual_reconnect"
}
```

Ket qua mong doi:

- `channel.connected`
- hoac `channel.disconnected`
- hoac `channel.login_failed`

### 4. `channel.sync_contacts`

Muc dich:

- dong bo danh ba/friend list cua channel

Payload:

```json
{
  "requested_by_user_id": "user_01",
  "sync_mode": "full"
}
```

Ket qua mong doi:

- nhieu event `contact.upserted`
- hoac `channel.sync_completed`
- hoac `channel.sync_failed`

### 5. `message.send`

Muc dich:

- gui mot tin nhan outbound ra channel

Payload:

```json
{
  "message_id": "msg_internal_01",
  "conversation_id": "conv_01",
  "external_conversation_id": "zalo_thread_01",
  "external_contact_id": "zalo_user_01",
  "text": "Xin chao",
  "attachments": [],
  "requested_by_user_id": "user_01"
}
```

Ket qua mong doi:

- `message.accepted`
- `message.sent`
- `message.failed`

### 6. `channel.disable`

Muc dich:

- tam vo hieu hoa mot channel

Payload:

```json
{
  "requested_by_user_id": "user_01",
  "reason": "admin_disabled"
}
```

Ket qua mong doi:

- `channel.disabled`

## Event Flow

Day la cac event `zalo-service` phat ra.

### 1. `channel.created`

Muc dich:

- thong bao channel runtime da duoc tao

Payload:

```json
{
  "channel_name": "Zalo Hotline 01",
  "status": "draft"
}
```

### 2. `channel.qr_ready`

Muc dich:

- thong bao QR code san sang de quet

Payload:

```json
{
  "status": "qr_pending",
  "qr_image_base64": "...",
  "expires_at": "2026-05-10T10:05:00.000Z"
}
```

Luu y:

- co the can doi thanh QR URL hoac artifact reference thay vi dua full base64 vao event neu payload qua lon

### 3. `channel.connected`

Muc dich:

- thong bao channel da ket noi thanh cong

Payload:

```json
{
  "status": "connected",
  "external_account_id": "zalo_account_01",
  "connected_at": "2026-05-10T10:02:00.000Z"
}
```

### 4. `channel.disconnected`

Muc dich:

- thong bao channel bi ngat ket noi

Payload:

```json
{
  "status": "disconnected",
  "reason": "session_expired",
  "retryable": true
}
```

### 5. `channel.login_failed`

Muc dich:

- thong bao login/reconnect that bai

Payload:

```json
{
  "status": "error",
  "reason": "can't login",
  "retryable": true
}
```

### 6. `channel.disabled`

Muc dich:

- thong bao channel da bi vo hieu hoa

Payload:

```json
{
  "status": "disabled",
  "reason": "admin_disabled"
}
```

### 7. `channel.sync_completed`

Muc dich:

- thong bao mot dot sync da thanh cong

Payload:

```json
{
  "sync_type": "contacts",
  "sync_mode": "full",
  "processed_count": 120,
  "completed_at": "2026-05-10T10:10:00.000Z"
}
```

### 8. `channel.sync_failed`

Muc dich:

- thong bao mot dot sync that bai

Payload:

```json
{
  "sync_type": "contacts",
  "reason": "provider_timeout",
  "retryable": true
}
```

### 9. `contact.upserted`

Muc dich:

- thong bao du lieu contact tu provider da duoc lay/lam moi

Payload:

```json
{
  "external_contact_id": "zalo_user_01",
  "display_name": "Nguyen Van A",
  "avatar_url": "https://...",
  "phone_number": "0900000000",
  "metadata": {
    "status": "friend"
  },
  "synced_at": "2026-05-10T10:09:00.000Z"
}
```

### 10. `message.received`

Muc dich:

- thong bao co tin nhan inbound moi tu Zalo

Payload:

```json
{
  "external_message_id": "zalo_msg_01",
  "external_conversation_id": "zalo_thread_01",
  "external_contact_id": "zalo_user_01",
  "text": "Xin chao shop",
  "attachments": [],
  "sent_at": "2026-05-10T10:12:00.000Z",
  "raw_metadata": {
    "thread_type": "user"
  }
}
```

### 11. `message.accepted`

Muc dich:

- thong bao `zalo-service` da nhan lenh gui tin

Payload:

```json
{
  "message_id": "msg_internal_01",
  "conversation_id": "conv_01",
  "accepted_at": "2026-05-10T10:13:00.000Z"
}
```

### 12. `message.sent`

Muc dich:

- thong bao tin da gui thanh cong len provider

Payload:

```json
{
  "message_id": "msg_internal_01",
  "conversation_id": "conv_01",
  "external_message_id": "zalo_msg_02",
  "sent_at": "2026-05-10T10:13:01.000Z"
}
```

### 13. `message.failed`

Muc dich:

- thong bao gui tin that bai

Payload:

```json
{
  "message_id": "msg_internal_01",
  "conversation_id": "conv_01",
  "reason": "session_disconnected",
  "retryable": true,
  "failed_at": "2026-05-10T10:13:01.000Z"
}
```

## Idempotency Rules

### 1. Dedupe cho event inbound

`message.received` nen unique theo:

- `provider`
- `channel_id`
- `external_message_id`

Neu `external_message_id` khong on dinh, `zalo-service` phai sinh `dedupe_key` tu:

- external sender id
- external conversation id
- timestamp
- hash noi dung

### 2. Dedupe cho outbound command

`message.send` nen unique theo:

- `message_id`

Neu consumer nhan lai cung command, khong duoc gui lai tin mot cach mu quang neu da co ket qua `sent`.

### 3. Dedupe cho contact sync

`contact.upserted` nen duoc upsert theo:

- `provider`
- `channel_id`
- `external_contact_id`

## Trang Thai Xu Ly

Moi command/event nen co vong doi xu ly trong integration layer:

- `pending`
- `processing`
- `processed`
- `failed`

Khong nen xoa record sau khi xu ly. Nen giu lai cho audit va reconciliation.

## Error Handling

### 1. Neu `chat-server` xu ly event that bai

- danh dau event `failed`
- dua vao retry flow
- neu vuot nguong retry, dua vao `dead_letter`

### 2. Neu `zalo-service` xu ly command that bai

- phat `message.failed` hoac `channel.login_failed`
- cap nhat command status
- luu reason day du

### 3. Neu provider tra ket qua khong chac chan

Vi du:

- gui tin co the da di nhung API timeout

Thi nen uu tien:

- phat `message.accepted`
- sau do dung reconciliation de xac minh `message.sent` hay `message.failed`

## Traceability

Moi flow nen giu lien ket sau:

- `trace_id`
- `causation_id`
- `correlation_id`

Vi du flow gui tin:

```text
message.send command
-> message.accepted event
-> message.sent event
```

Ca 3 payload nen chia se cung `trace_id`.

## Versioning

Moi payload nen co:

- `version: 1`

Khi thay doi pha vo contract:

- tang version
- consumer ho tro chuyen tiep trong mot giai doan chuyen doi

## Danh Sach Contract V1 Can Co

### Commands

- `channel.create`
- `channel.start_qr_login`
- `channel.reconnect`
- `channel.sync_contacts`
- `channel.disable`
- `message.send`

### Events

- `channel.created`
- `channel.qr_ready`
- `channel.connected`
- `channel.disconnected`
- `channel.login_failed`
- `channel.disabled`
- `channel.sync_completed`
- `channel.sync_failed`
- `contact.upserted`
- `message.received`
- `message.accepted`
- `message.sent`
- `message.failed`

## Chot V1

Event contracts V1 duoc thiet ke theo huong:

- `chat-server` gui `commands`
- `zalo-service` phat `events`
- moi payload co `envelope` thong nhat
- moi xu ly deu `idempotent`
- event log duoc giu lai cho doi soat va retry

Day la tang ket noi cot loi giua `chat-server` va `zalo-service`.
