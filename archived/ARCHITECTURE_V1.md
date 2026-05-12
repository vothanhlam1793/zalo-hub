# Architecture V1

## Tong Quan

He thong duoc chot theo huong tach rieng:

- `zalo-service`
- `chat-server`
- `shared persistence + integration event flow`

Muc tieu cua he thong khong phai la team chat kieu Slack, ma la mot nen tang `omnichannel shared inbox`, trong do nhieu user noi bo cung van hanh nhieu tai khoan Zalo nhu nhieu kenh giao tiep.

## Muc Tieu

He thong can ho tro:

- user noi bo dang nhap vao UI chat
- moi tai khoan Zalo duoc xem la mot `channel`
- moi user noi bo duoc gan quyen voi mot hoac nhieu channel
- tin nhan tu Zalo duoc dua vao inbox trung tam
- user noi bo tra loi trong UI
- sau nay co the them AI/agent layer

## Ba Khai Niem Chinh

Can tach bach 3 loai doi tuong:

1. `System User`
   - nguoi dung noi bo cua he thong
   - vi du: admin, sales, CSKH

2. `Channel`
   - mot tai khoan Zalo da dang nhap
   - moi channel la mot duong giao tiep voi ben ngoai

3. `External Contact`
   - nguoi ngoai he thong dang nhan tin vao channel

Neu khong tach 3 khai niem nay, domain model se roi vao tinh trang dung tu `user` cho nhieu nghia khac nhau va rat de roi.

## So Do Khoi Tong The

```text
+------------------------------------------------------------------+
|                              Web UI                              |
|          Admin / Inbox / Conversation / Assignment UI            |
+--------------------------------+---------------------------------+
                                 |
                                 v
+------------------------------------------------------------------+
|                           Chat Server                            |
|                                                                  |
|  Domain: Shared Inbox / Customer Conversation                    |
|  - auth cho user noi bo                                          |
|  - workspace / roles / permissions                               |
|  - contact / conversation / message                              |
|  - assignment / notes / labels                                   |
|  - realtime API cho UI                                           |
|                                                                  |
|  Reference domain: Chatwoot-style inbox                          |
+------------------------------+-----------------------------------+
                               |
                 Commands       |       Events / Sync
                               |
                               v
+------------------------------------------------------------------+
|                           Zalo Service                           |
|                                                                  |
|  Domain: Channel Runtime / Connector                             |
|  - create channel                                                 |
|  - QR login                                                       |
|  - store credential/session                                       |
|  - reconnect                                                     |
|  - sync contacts/friends                                          |
|  - send outbound message                                          |
|  - receive inbound message                                        |
|  - publish status/events                                          |
+------------------------------+-----------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|                               Zalo                               |
+------------------------------------------------------------------+
```

## So Do Voi Tang Luu Tru

```text
+--------------------+         +--------------------+
|    Chat Server     | <-----> |   Shared Storage   |
|                    |         |                    |
| chat domain owner  |         | chat_core          |
|                    |         | zalo_runtime       |
+---------+----------+         | integration_events |
          |                    +----------+---------+
          |                               ^
          v                               |
+--------------------+                    |
|    Zalo Service    | -------------------+
|                    |
| runtime owner      |
+---------+----------+
          |
          v
+--------------------+
|        Zalo        |
+--------------------+
```

## Vai Tro Tung Khoi

### 1. Web UI

Phu trach:

- dang nhap user noi bo
- xem danh sach conversation
- tra loi tin nhan
- phan cong hoi thoai
- loc theo channel
- quan tri channel Zalo
- xem trang thai ket noi channel

UI nen noi chuyen chu yeu voi `chat-server`.

### 2. Chat Server

Day la loi nghiep vu van hanh.

Phu trach:

- auth/permission cho user noi bo
- quan ly `workspace`
- quan ly `channel access`
- quan ly `contact`
- quan ly `conversation`
- quan ly `message`
- assignment, labels, notes
- websocket/realtime cho UI

Khong phu trach:

- QR login that
- giu cookie Zalo
- reconnect session Zalo
- giao tiep truc tiep voi Zalo

### 3. Zalo Service

Day la connector/runtime chuyen cho Zalo.

Phu trach:

- tao channel Zalo moi
- khoi dong QR login
- luu `cookie`, `imei`, `userAgent`
- reconnect khi restart
- send message ra Zalo
- nhan message tu Zalo
- sync friend list
- phat event ve trang thai channel

Khong phu trach:

- assignment
- UI inbox
- internal notes
- permission cua user noi bo
- dashboard chat

### 4. Shared Storage / Integration Layer

Khong phai `god service`. Day la tang giup luu tru va dong bo ben vung.

Co the gom:

- `Postgres` chung, chia schema ro rang
- `Redis` hoac queue neu can realtime/retry

## Ownership Du Lieu

### `chat_core`

Chi `chat-server` duoc ghi:

- `workspace_users`
- `roles`
- `channel_access`
- `contacts`
- `conversations`
- `messages`
- `assignments`
- `labels`
- `notes`

### `zalo_runtime`

Chi `zalo-service` duoc ghi:

- `channels`
- `channel_credentials`
- `channel_sessions`
- `channel_status_history`
- `channel_sync_state`
- `raw_contacts` neu can

### `integration_events`

Dung de trao doi:

- `inbound_event`
- `outbound_command`
- `delivery_receipt`
- `status_changed_event`
- `reconciliation_job`
- `dead_letter_event`

## Luong Du Lieu Chinh

### 1. Tao channel

```text
Admin UI
-> Chat Server
-> Zalo Service: create channel
-> Shared Storage: create runtime channel state
-> Chat Server: luu mapping channel vao workspace
```

### 2. QR login

```text
Admin UI
-> Chat Server
-> Zalo Service: start QR login
-> Zalo Service giu state QR/session
-> Zalo Service cap nhat channel status
-> Chat Server doc/pull hoac nhan event status de hien thi len UI
```

### 3. Tin nhan den

```text
Zalo
-> Zalo Service nhan inbound event
-> Zalo Service chuan hoa event
-> ghi integration_events
-> Chat Server consume event
-> upsert contact/conversation/message
-> day realtime len UI
```

### 4. Tin nhan di

```text
User noi bo gui tin tren UI
-> Chat Server tao outbound message trang thai pending
-> Chat Server ghi outbound_command
-> Zalo Service consume command
-> gui tin qua Zalo
-> ghi delivery_receipt sent/failed
-> Chat Server cap nhat trang thai message
-> UI nhan realtime update
```

### 5. Sync contact/friend

```text
Chat Server yeu cau sync
-> Zalo Service goi Zalo API
-> lay friend/contact data
-> publish event hoac sync record
-> Chat Server cap nhat contact directory
```

## Domain Chot

Domain phu hop nhat cho `chat-server` la:

`Omnichannel Shared Inbox`

Tham chieu manh nhat la mo hinh cua `Chatwoot`, khong phai team chat.

`Chatwoot` duoc dung nhu:

- domain reference manh
- ung vien cho chat-server base neu can reuse

Khong dung `Chatwoot` nhu noi nhung runtime session Zalo truc tiep vao core.

## Mo Hinh Trien Khai De Xuat

Giai doan dau:

1. `2 app`
   - `zalo-service`
   - `chat-server`

2. `1 monorepo`
   - de chia se contracts/types
   - de de refactor dong thoi

3. `1 Postgres`
   - nhung chia schema ro ownership

4. co the them `Redis`
   - cho queue / realtime / cache neu can

## Cau Truc Monorepo De Xuat

```text
/apps
  /chat-server
  /zalo-service

/packages
  /shared-contracts
  /shared-types
  /shared-utils

/infrastructure
  /docker
  /db
```

## Shared Packages Can Co

### `shared-contracts`

Chua:

- `InboundMessageEvent`
- `OutboundMessageCommand`
- `ChannelStatusChanged`
- `ContactSyncEvent`

### `shared-types`

Chua:

- enums
- ids
- common metadata

## Cac Entity Cot Loi

### Chat side

- `workspace`
- `workspace_user`
- `role`
- `channel_access`
- `contact`
- `conversation`
- `message`
- `conversation_assignee`
- `conversation_note`
- `conversation_label`

### Zalo side

- `channel`
- `channel_session`
- `channel_credential`
- `channel_sync_state`
- `channel_status_log`

### Integration side

- `inbound_event`
- `outbound_command`
- `delivery_receipt`
- `reconciliation_job`
- `dead_letter_event`

## Nguyen Tac Thiet Ke

1. `zalo-service` khong so huu business inbox
2. `chat-server` khong so huu session Zalo
3. moi event phai `idempotent`
4. phai co `external ids` de dedupe
5. phai co co che `reconciliation`
6. khong de ca hai service cung sua cung mot bang business

## Tom Tat Chot

He thong duoc dinh nghia la:

- mot `shared inbox platform`
- dung `Chatwoot-style domain`
- voi `Zalo` la channel provider tach rieng
- co `shared storage + integration event flow`
- de nhieu user noi bo cung quan ly nhieu account Zalo trong mot he thong

## So Do Chot V1

```text
                         +----------------------+
                         |       Web UI         |
                         | admin + inbox        |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |     Chat Server      |
                         | shared inbox core    |
                         | users/conversations  |
                         | messages/assignments |
                         +----+------------+----+
                              |            |
                      commands |            | consumes events
                              v            v
                         +----------------------+
                         |     Shared DB        |
                         | chat_core            |
                         | zalo_runtime         |
                         | integration_events   |
                         +----+------------+----+
                              ^            |
                              | writes     | reads/writes
                              |            v
                         +----------------------+
                         |     Zalo Service     |
                         | login/session/send   |
                         | receive/reconnect    |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |         Zalo         |
                         +----------------------+
```
