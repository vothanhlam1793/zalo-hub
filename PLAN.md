# Plan

## Muc Tieu Tong The

Xay he thong theo thu tu uu tien:

1. `chat-server` chay doc lap truoc
2. chat domain va inbox flow chay duoc end-to-end truoc
3. sau do moi noi `zalo-service`
4. cuoi cung moi danh gia muc do tich hop `Chatwoot`

Ly do:

- chat-server la loi nghiep vu quan trong nhat
- can chot domain bang code that truoc khi bi framework hay source ngoai dan dat
- can co mot he thong chat chay duoc truoc khi xu ly bai toan session Zalo

## Giai Doan 1: Chat Server First

Muc tieu:

- dung `chat-server` doc lap trong repo hien tai
- co file store rieng cho chat domain
- co API cho:
  - workspace
  - workspace users
  - channels logic
  - contacts
  - conversations
  - messages
- co local messaging flow de chat duoc truoc
- chua phu thuoc Zalo that

Pham vi V1:

- backend API truoc
- file store thay vi Postgres de di nhanh
- fake/local conversation de test domain

Ket qua mong doi:

- co the tao channel logic
- co the tao conversation local
- co the gui message local
- co du lieu chat-server tach rieng khoi app Zalo MVP hien tai

## Giai Doan 2: Fake Provider / Mock Event Flow

Muc tieu:

- gia lap inbound events
- gia lap outbound commands
- kiem thu event contracts
- kiem thu assignment va conversation lifecycle

Pham vi:

- khong can Zalo that
- chi can event flow giong voi `EVENT_CONTRACTS_V1.md`

Ket qua mong doi:

- chat-server duoc test trong dieu kien co event vao/ra
- chot duoc integration boundaries

## Giai Doan 3: Zalo Service

Muc tieu:

- tach `zalo-service` thanh khoi rieng
- quan ly channel runtime
- QR login
- session reconnect
- sync contacts
- send/receive messages

Ket qua mong doi:

- `chat-server` khong can biet chi tiet session Zalo
- event/command flow chay thong qua contract da chot

## Giai Doan 4: Shared Persistence

Muc tieu:

- thay file store bang Postgres theo `POSTGRES_SCHEMA_V1.md`
- tach ro `chat_core`, `zalo_runtime`, `integration_events`
- bo sung retry, dead letter, reconciliation

Ket qua mong doi:

- luong du lieu ben vung hon
- san sang cho scale va van hanh that

## Giai Doan 5: Chatwoot Fit Integration

Muc tieu:

- sau khi chat-server domain da chay on dinh, moi danh gia lai `Chatwoot`
- quyet dinh reuse o muc nao:
  - chi reuse domain ideas
  - reuse UI mot phan
  - hay tich hop sau hon vao chat-server

Nguyen tac:

- khong dua Chatwoot vao qua som
- chi dua vao sau khi da co baseline chat-server cua minh

## Cong Viec Truc Tiep Ngay Bay Gio

### Buoc 1

Tao `chat-server` skeleton trong `src/chat-server`.

### Buoc 2

Tao file store rieng cho chat domain.

### Buoc 3

Expose chat APIs co ban:

- `GET /api/health`
- `GET /api/workspaces`
- `GET /api/users`
- `GET /api/channels`
- `POST /api/channels`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/messages`

### Buoc 4

Seed du lieu demo nho de co the chat local ngay.

## Dinh Nghia Hoan Thanh Giai Doan 1

Giai doan 1 duoc xem la xong khi:

1. co `chat-server` doc lap voi app cu
2. chay len duoc bang script rieng
3. tao duoc channel logic
4. tao duoc conversation local
5. gui duoc message local
6. du lieu duoc luu tach rieng khoi `state.json` hien tai
