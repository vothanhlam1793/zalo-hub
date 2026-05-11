# Postgres Schema V1

## Muc Tieu

Tai lieu nay chot cau truc luu tru Postgres V1 cho kien truc:

- `chat-server`
- `zalo-service`
- `integration event layer`

Schema duoc chia thanh 3 nhom ownership:

- `chat_core`
- `zalo_runtime`
- `integration_events`

Muc tieu:

1. chia ownership ro rang
2. giam nguy co hai service sua chong cheo du lieu
3. tao nen cho migration/database design
4. dam bao duoc idempotency va reconciliation

## Nguyen Tac Tong Quat

### 1. Mot bang co mot owner ro rang

- `chat-server` chi ghi vao `chat_core`
- `zalo-service` chi ghi vao `zalo_runtime`
- hai ben giao tiep qua `integration_events`

### 2. UUID cho id noi bo

Tat ca bang chinh nen dung `uuid` cho khoa chinh.

### 3. Timestamps thong nhat

Nen co:

- `created_at timestamptz not null`
- `updated_at timestamptz not null` neu bang co tinh chat cap nhat

### 4. JSONB cho metadata co kiem soat

Chi dung `jsonb` cho:

- metadata provider
- payload event
- payload raw

Khong nen day business query quan trong vao `jsonb` neu co the dat thanh cot ro rang.

### 5. Unique keys cho dedupe la bat buoc

Can unique index cho:

- external ids
- dedupe keys
- relation identity

## Schema 1: `chat_core`

Schema nay thuoc `chat-server`.

## 1. `chat_core.workspaces`

Muc dich:

- luu workspace

Cot de xuat:

- `id uuid pk`
- `name text not null`
- `status text not null default 'active'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint goi y:

- check `status in ('active', 'disabled')`

## 2. `chat_core.workspace_users`

Cot de xuat:

- `id uuid pk`
- `workspace_id uuid not null references chat_core.workspaces(id)`
- `email text`
- `username text`
- `display_name text not null`
- `status text not null default 'active'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Unique goi y:

- unique `(workspace_id, email)` where `email is not null`
- unique `(workspace_id, username)` where `username is not null`

## 3. `chat_core.roles`

Cot de xuat:

- `id uuid pk`
- `workspace_id uuid not null references chat_core.workspaces(id)`
- `name text not null`
- `permissions jsonb not null default '[]'::jsonb`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Unique goi y:

- unique `(workspace_id, name)`

## 4. `chat_core.workspace_user_roles`

Cot de xuat:

- `workspace_user_id uuid not null references chat_core.workspace_users(id)`
- `role_id uuid not null references chat_core.roles(id)`
- `created_at timestamptz not null`

PK goi y:

- primary key `(workspace_user_id, role_id)`

## 5. `chat_core.channel_access`

Muc dich:

- mapping user noi bo -> channel + permission

Cot de xuat:

- `id uuid pk`
- `workspace_id uuid not null references chat_core.workspaces(id)`
- `workspace_user_id uuid not null references chat_core.workspace_users(id)`
- `channel_id uuid not null`
- `permission_scope text not null`
- `created_at timestamptz not null`

Constraint goi y:

- check `permission_scope in ('view', 'reply', 'manage', 'admin')`

Unique goi y:

- unique `(workspace_user_id, channel_id, permission_scope)`

Luu y:

- `channel_id` logic owner nam ben `zalo_runtime.channels`
- co the khong dat FK truc tiep o V1 neu muon giam coupling migration, nhung neu dat duoc FK cung tot

## 6. `chat_core.external_contacts`

Cot de xuat:

- `id uuid pk`
- `workspace_id uuid not null references chat_core.workspaces(id)`
- `channel_id uuid not null`
- `provider text not null`
- `external_contact_id text not null`
- `display_name text not null`
- `avatar_url text`
- `phone_number text`
- `metadata jsonb not null default '{}'::jsonb`
- `last_seen_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Unique goi y:

- unique `(provider, channel_id, external_contact_id)`

Index goi y:

- index `(workspace_id, channel_id)`
- index `(display_name)`

## 7. `chat_core.conversations`

Cot de xuat:

- `id uuid pk`
- `workspace_id uuid not null references chat_core.workspaces(id)`
- `channel_id uuid not null`
- `contact_id uuid not null references chat_core.external_contacts(id)`
- `provider text not null`
- `external_conversation_id text not null`
- `status text not null default 'open'`
- `title text`
- `last_message_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint goi y:

- check `status in ('open', 'pending', 'resolved', 'closed')`

Unique goi y:

- unique `(provider, channel_id, external_conversation_id)`

Index goi y:

- index `(workspace_id, channel_id, status)`
- index `(contact_id)`
- index `(last_message_at desc)`

## 8. `chat_core.messages`

Cot de xuat:

- `id uuid pk`
- `workspace_id uuid not null references chat_core.workspaces(id)`
- `channel_id uuid not null`
- `conversation_id uuid not null references chat_core.conversations(id)`
- `provider text not null`
- `external_message_id text`
- `internal_dedupe_key text`
- `direction text not null`
- `sender_type text not null`
- `sender_ref_id uuid`
- `text text`
- `attachments jsonb not null default '[]'::jsonb`
- `raw_metadata jsonb not null default '{}'::jsonb`
- `delivery_status text not null default 'pending'`
- `sent_at timestamptz`
- `received_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint goi y:

- check `direction in ('inbound', 'outbound')`
- check `sender_type in ('contact', 'workspace_user', 'system', 'channel')`
- check `delivery_status in ('pending', 'sent', 'delivered', 'failed', 'unknown')`

Unique goi y:

- unique `(provider, channel_id, external_message_id)` where `external_message_id is not null`
- unique `(internal_dedupe_key)` where `internal_dedupe_key is not null`

Index goi y:

- index `(conversation_id, created_at)`
- index `(workspace_id, channel_id)`

## 9. `chat_core.conversation_assignments`

Cot de xuat:

- `id uuid pk`
- `conversation_id uuid not null references chat_core.conversations(id)`
- `workspace_user_id uuid not null references chat_core.workspace_users(id)`
- `assigned_by_user_id uuid references chat_core.workspace_users(id)`
- `assigned_at timestamptz not null`
- `status text not null default 'active'`
- `created_at timestamptz not null`

Constraint goi y:

- check `status in ('active', 'released', 'completed')`

Index goi y:

- index `(conversation_id, status)`
- index `(workspace_user_id, status)`

## 10. `chat_core.conversation_labels`

Cot de xuat:

- `id uuid pk`
- `workspace_id uuid not null references chat_core.workspaces(id)`
- `name text not null`
- `color text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Unique goi y:

- unique `(workspace_id, name)`

## 11. `chat_core.conversation_label_links`

Cot de xuat:

- `conversation_id uuid not null references chat_core.conversations(id)`
- `label_id uuid not null references chat_core.conversation_labels(id)`
- `created_at timestamptz not null`

PK goi y:

- primary key `(conversation_id, label_id)`

## 12. `chat_core.conversation_notes`

Cot de xuat:

- `id uuid pk`
- `conversation_id uuid not null references chat_core.conversations(id)`
- `workspace_user_id uuid not null references chat_core.workspace_users(id)`
- `content text not null`
- `created_at timestamptz not null`

Index goi y:

- index `(conversation_id, created_at)`

## 13. `chat_core.conversation_read_states`

Cot de xuat:

- `id uuid pk`
- `conversation_id uuid not null references chat_core.conversations(id)`
- `workspace_user_id uuid not null references chat_core.workspace_users(id)`
- `last_read_message_id uuid references chat_core.messages(id)`
- `last_read_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Unique goi y:

- unique `(conversation_id, workspace_user_id)`

## Schema 2: `zalo_runtime`

Schema nay thuoc `zalo-service`.

## 1. `zalo_runtime.channels`

Cot de xuat:

- `id uuid pk`
- `workspace_id uuid not null`
- `provider text not null default 'zalo'`
- `name text not null`
- `status text not null default 'draft'`
- `external_account_id text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint goi y:

- check `provider in ('zalo')`
- check `status in ('draft', 'qr_pending', 'connected', 'disconnected', 'error', 'disabled')`

Index goi y:

- index `(workspace_id, status)`

## 2. `zalo_runtime.channel_credentials`

Cot de xuat:

- `id uuid pk`
- `channel_id uuid not null references zalo_runtime.channels(id)`
- `credential_type text not null`
- `credential_payload jsonb not null`
- `version integer not null default 1`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Index goi y:

- index `(channel_id)`

Luu y:

- can xem xet ma hoa cot `credential_payload` o tang ung dung hoac o DB

## 3. `zalo_runtime.channel_sessions`

Cot de xuat:

- `id uuid pk`
- `channel_id uuid not null references zalo_runtime.channels(id)`
- `session_status text not null`
- `connected_at timestamptz`
- `last_heartbeat_at timestamptz`
- `last_error text`
- `retry_count integer not null default 0`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint goi y:

- check `session_status in ('idle', 'connecting', 'connected', 'disconnected', 'error')`

Unique goi y:

- unique `(channel_id)`

## 4. `zalo_runtime.channel_status_logs`

Cot de xuat:

- `id uuid pk`
- `channel_id uuid not null references zalo_runtime.channels(id)`
- `status text not null`
- `reason text`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`

Index goi y:

- index `(channel_id, created_at desc)`

## 5. `zalo_runtime.channel_sync_states`

Cot de xuat:

- `id uuid pk`
- `channel_id uuid not null references zalo_runtime.channels(id)`
- `sync_type text not null`
- `cursor text`
- `sync_status text not null`
- `last_synced_at timestamptz`
- `last_error text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraint goi y:

- check `sync_type in ('contacts', 'messages', 'conversations')`
- check `sync_status in ('idle', 'running', 'completed', 'failed')`

Unique goi y:

- unique `(channel_id, sync_type)`

## 6. `zalo_runtime.provider_contact_snapshots`

Cot de xuat:

- `id uuid pk`
- `channel_id uuid not null references zalo_runtime.channels(id)`
- `provider text not null`
- `external_contact_id text not null`
- `payload jsonb not null`
- `fetched_at timestamptz not null`

Unique goi y:

- unique `(provider, channel_id, external_contact_id)`

## Schema 3: `integration_events`

Schema nay la noi hai ben giao tiep qua event/command ben vung.

## 1. `integration_events.inbound_events`

Muc dich:

- event tu `zalo-service` phat ra de `chat-server` consume

Cot de xuat:

- `id uuid pk`
- `event_type text not null`
- `provider text not null`
- `workspace_id uuid not null`
- `channel_id uuid not null`
- `trace_id text not null`
- `causation_id text`
- `correlation_id text`
- `dedupe_key text not null`
- `payload jsonb not null`
- `processing_status text not null default 'pending'`
- `retry_count integer not null default 0`
- `created_at timestamptz not null`
- `processed_at timestamptz`

Constraint goi y:

- check `processing_status in ('pending', 'processing', 'processed', 'failed')`

Unique goi y:

- unique `(dedupe_key)`

Index goi y:

- index `(processing_status, created_at)`
- index `(channel_id, event_type, created_at)`

## 2. `integration_events.outbound_commands`

Muc dich:

- command tu `chat-server` gui sang `zalo-service`

Cot de xuat:

- `id uuid pk`
- `command_type text not null`
- `provider text not null`
- `workspace_id uuid not null`
- `channel_id uuid not null`
- `trace_id text not null`
- `causation_id text`
- `correlation_id text`
- `dedupe_key text not null`
- `payload jsonb not null`
- `processing_status text not null default 'pending'`
- `retry_count integer not null default 0`
- `created_at timestamptz not null`
- `processed_at timestamptz`

Constraint goi y:

- check `processing_status in ('pending', 'processing', 'processed', 'failed')`

Unique goi y:

- unique `(dedupe_key)`

Index goi y:

- index `(processing_status, created_at)`
- index `(channel_id, command_type, created_at)`

## 3. `integration_events.delivery_receipts`

Muc dich:

- ket qua xu ly outbound message

Cot de xuat:

- `id uuid pk`
- `channel_id uuid not null`
- `message_id uuid`
- `external_message_id text`
- `receipt_status text not null`
- `payload jsonb not null default '{}'::jsonb`
- `occurred_at timestamptz not null`
- `created_at timestamptz not null`

Constraint goi y:

- check `receipt_status in ('accepted', 'sent', 'delivered', 'failed')`

Index goi y:

- index `(message_id, occurred_at)`
- index `(channel_id, occurred_at)`

## 4. `integration_events.reconciliation_jobs`

Muc dich:

- job doi soat va sua lech state

Cot de xuat:

- `id uuid pk`
- `job_type text not null`
- `channel_id uuid not null`
- `status text not null default 'pending'`
- `input_payload jsonb not null default '{}'::jsonb`
- `result_payload jsonb not null default '{}'::jsonb`
- `retry_count integer not null default 0`
- `created_at timestamptz not null`
- `started_at timestamptz`
- `finished_at timestamptz`

Constraint goi y:

- check `status in ('pending', 'running', 'completed', 'failed', 'cancelled')`

Index goi y:

- index `(channel_id, status, created_at)`

## 5. `integration_events.dead_letter_events`

Muc dich:

- luu event/command loi vuot nguong retry

Cot de xuat:

- `id uuid pk`
- `source_type text not null`
- `source_id uuid not null`
- `error_message text not null`
- `payload jsonb not null`
- `created_at timestamptz not null`

Constraint goi y:

- check `source_type in ('inbound_event', 'outbound_command', 'reconciliation_job')`

Index goi y:

- index `(source_type, created_at desc)`

## Khoa Ngoai Xuyen Schema

Co 2 lua chon.

### Lua chon 1. FK day du

Uu diem:

- du lieu chac hon
- DB enforce lien ket

Nhuoc diem:

- migration coupling cao hon
- kho hon neu sau nay tach DB rieng cho service

### Lua chon 2. Logical references

Uu diem:

- de tach service ve sau
- giam coupling migration

Nhuoc diem:

- ung dung phai tu enforce integrity nhieu hon

De xuat V1:

- FK noi bo trong cung schema: co
- FK xuyen schema, dac biet tu `chat_core` sang `zalo_runtime`: co the de dang logical reference o V1 de giu duong lui khi tach DB sau nay

## Audit Va Lich Su

V1 nen giu lai:

- status logs cua channel
- inbound/outbound event logs
- delivery receipts
- notes va assignment history

Khong nen xoa som, vi day la du lieu quan trong de debug bat dong bo.

## Index Quan Trong Nhat

Neu phai uu tien index som, toi uu tien:

1. `chat_core.conversations (workspace_id, channel_id, status)`
2. `chat_core.messages (conversation_id, created_at)`
3. `chat_core.external_contacts (provider, channel_id, external_contact_id)` unique
4. `chat_core.conversations (provider, channel_id, external_conversation_id)` unique
5. `chat_core.messages (provider, channel_id, external_message_id)` unique
6. `integration_events.inbound_events (dedupe_key)` unique
7. `integration_events.outbound_commands (dedupe_key)` unique
8. `integration_events.inbound_events (processing_status, created_at)`
9. `integration_events.outbound_commands (processing_status, created_at)`
10. `zalo_runtime.channels (workspace_id, status)`

## Bao Mat

### 1. Credential

`zalo_runtime.channel_credentials.credential_payload` la du lieu rat nhay cam.

De xuat:

- ma hoa o tang ung dung truoc khi luu
- gioi han quyen doc cot nay
- log tuyet doi khong in day du credential

### 2. Event payload

Khong dua full credential hoac secret vao `integration_events`.

### 3. PII

Thong tin contact nhu `phone_number`, `display_name`, `avatar_url` can duoc xem la du lieu nhay cam muc vua va can co chinh sach truy cap phu hop.

## DDL Huong Dan Tham Khao

Khong viet full SQL trong V1, nhung structure khoi tao nen theo thu tu:

1. tao schemas
2. tao bang `chat_core.workspaces`
3. tao bang `zalo_runtime.channels`
4. tao bang identity va chat tables
5. tao bang runtime tables
6. tao bang integration tables
7. tao indexes va unique constraints

## Chot V1

Postgres schema V1 duoc to chuc theo 3 schema:

1. `chat_core`
   - business inbox data

2. `zalo_runtime`
   - channel/session/runtime data

3. `integration_events`
   - command/event/reconciliation layer

Mo hinh nay dung voi huong kien truc da chot:

- `chat-server` doc lap
- `zalo-service` doc lap
- cung dung mot Postgres trong giai doan dau
- nhung van giu duoc ownership va duong lui de tach xa hon sau nay
