# Chatwoot Fit Gap V1

## Muc Tieu

Tai lieu nay danh gia `Chatwoot` co phu hop den muc nao voi kien truc da chot trong `ARCHITECTURE_V1.md`.

Muc tieu khong phai la chon Chatwoot vi no pho bien, ma la xac dinh:

- co nen dung Chatwoot lam nen `chat-server` hay khong
- nhung phan nao co the tai su dung
- nhung phan nao phai tu xay
- cach tich hop `zalo-service` vao domain cua Chatwoot

## Ket Luan Nhanh

`Chatwoot` phu hop manh o phia `chat-server domain`, nhung khong phu hop de chua truc tiep `Zalo runtime`.

Huong de xuat:

1. dung Chatwoot lam `shared inbox core` hoac `domain reference` cho `chat-server`
2. tach rieng `zalo-service` cho login, session, reconnect, send/receive voi Zalo
3. tich hop hai ben qua `API + event contracts`
4. tranh custom qua sau vao core runtime cua Chatwoot ngay tu dau

Neu phai chot mot cau:

- `Chatwoot hop lam chat-server, khong hop lam zalo-service`

## Chatwoot Phu Hop O Dau

Chatwoot rat gan voi domain ma he thong nay can o cac diem sau:

### 1. Shared Inbox

Can he thong:

- nhieu user noi bo
- nhieu conversation
- danh sach inbox/channel
- giao dien van hanh hoi thoai

Chatwoot phu hop vi no duoc thiet ke xung quanh `shared inbox`, khong phai team chat.

### 2. Contact / Conversation / Message Model

Can he thong:

- `contact`
- `conversation`
- `message inbound/outbound`
- `message state`

Day la model rat sat voi bai toan Zalo channel -> external contact -> inbox conversation.

### 3. Agent Workflow

Can he thong:

- assignment
- labels
- notes
- resolve/reopen
- user noi bo xu ly hoi thoai

Chatwoot co san mot lop van hanh gan dung nhu vay.

### 4. Inbox UI

Can he thong:

- conversation list
- message detail
- composer
- contact side panel
- trang thai hoi thoai

Neu tu build toan bo UI nay tu dau se ton nhieu thoi gian. Chatwoot giup tiet kiem mot luong cong suc lon.

### 5. Realtime Messaging Experience

Can he thong:

- hoi thoai cap nhat nhanh
- user thay tin nhan moi gan real-time
- update trang thai message

Chatwoot da co nen tang chat UI va realtime workflow tot hon rat nhieu so voi MVP HTML/JS hien tai.

## Chatwoot Khong Phu Hop O Dau

### 1. QR Login va Session Runtime Cua Zalo

He thong can:

- QR login
- luu cookie/imei/userAgent
- reconnect session
- health check channel
- quan ly session de phong bi rot login

Day khong phai la bai toan ma Chatwoot sinh ra de giai quyet.

Neu nhet logic nay vao Chatwoot:

- boundary se vo
- kho maintain
- kho nang cap upstream
- core chat va core connector bi tron lan

Ket luan:

- phan nay phai de o `zalo-service`

### 2. Multi Channel Runtime Theo Kieu Tai Khoan Zalo

He thong cua ban xem moi tai khoan Zalo nhu mot `channel runtime` doc lap.

Moi channel can:

- own session state
- own reconnect cycle
- own credential
- own sync status

Chatwoot co kha nang lam viec voi inbox/channel o muc nghiep vu, nhung khong nen la noi chay runtime phuc tap cho tung tai khoan Zalo.

### 3. Event Reconciliation Va Durable Integration

He thong cua ban can rat ro:

- inbound event log
- outbound command log
- delivery receipt
- dedupe
- reconciliation jobs

Chatwoot co the xu ly phia conversation/message, nhung khong nen la noi duy nhat chiu trach nhiem cho event durability giua he thong va Zalo.

### 4. User Channel Access Model Theo Bai Toan Rieng

He thong can model:

- user noi bo A duoc xem channel 1 va 2
- user noi bo B chi duoc tra loi channel 3
- mot workspace co nhieu channel Zalo

Chatwoot co quyen va inbox ownership rieng, nhung co the can custom them de khop hoan toan voi bai toan `channel access` cua ban.

Ket luan:

- co the reuse mot phan
- nhung can custom role/access layer bo sung

## Bang Danh Gia Fit / Gap

| Khu vuc | Muc do phu hop | Ghi chu |
|---|---|---|
| Shared inbox domain | Cao | Rat sat bai toan |
| Contact / conversation / message | Cao | Reuse duoc nhieu |
| Assignment / notes / labels | Cao | Chatwoot co san workflow co ban |
| Inbox UI | Cao | Tiet kiem nhieu thoi gian |
| Realtime update | Trung binh - Cao | Co san nen tang tot |
| Internal auth/user management | Trung binh | Dung duoc nhung can map voi mo hinh workspace cua ban |
| User -> channel permissions | Trung binh | Co the can custom them |
| Channel registry cho Zalo | Thap | Nen de service rieng |
| QR login / reconnect / credential | Rat thap | Khong nen dua vao Chatwoot |
| Zalo session lifecycle | Rat thap | Phai tach rieng |
| Inbound/outbound event durability | Trung binh | Nen co integration layer rieng |
| Reconciliation jobs | Thap | Nen tu xay theo bai toan Zalo |

## Mapping Domain De Xuat

Can map nghiep vu cua he thong sang domain Chatwoot theo huong sau.

### 1. `Zalo account` -> `Inbox` hoac `Channel-like inbox unit`

Moi tai khoan Zalo nen duoc xem nhu mot don vi inbox rieng ben chat-server.

Y nghia:

- de phan quyen theo channel
- de loc hoi thoai theo tai khoan Zalo
- de quan ly van hanh theo tung tai khoan

### 2. `External Contact` -> `Contact`

Nguoi ngoai dang chat qua Zalo map sang `contact` trong chat domain.

Can luu them metadata:

- `provider = zalo`
- `external_user_id`
- `channel_id`
- ten hien thi / avatar / so dien thoai neu co

### 3. `Zalo thread` -> `Conversation`

Moi luong hoi thoai ngoai he thong map thanh `conversation`.

Can co external identity ro rang:

- `provider_conversation_id`
- `channel_id`
- `contact_id`

### 4. `Tin nhan` -> `Message`

Inbound va outbound deu map vao `message`.

Can them metadata:

- `provider_message_id`
- `direction`
- `delivery_status`
- `raw_event_ref` neu can doi soat

### 5. `Nhan vien noi bo` -> `Agent/User`

Nguoi noi bo xu ly chat map vao user/agent cua chat-server.

Neu dung Chatwoot, day la phan co the reuse duoc kha nhieu, nhung can bo sung `channel access rules` theo bai toan rieng.

## Phan Nen Reuse Truc Tiep

Day la cac phan nen uu tien tai su dung neu chon Chatwoot.

### 1. Inbox UI va UX

Reuse:

- conversation list
- message panel
- contact detail panel
- assignment UX
- notes/labels workflow

Loi ich:

- giam rat nhieu thoi gian xay frontend

### 2. Shared Inbox Data Model

Reuse y tuong va co the reuse implementation o cac khoi:

- contacts
- conversations
- messages
- assignees
- labels
- internal notes

### 3. Realtime Interaction Layer

Reuse kha nang:

- push update cho UI
- cap nhat conversation khi co message moi
- cap nhat assignee / status

### 4. Admin / Operations Flow Co Ban

Reuse luong:

- dang nhap agent
- xu ly hoi thoai
- phan cong
- giai quyet va mo lai hoi thoai

## Phan Nen Tu Xay

Day la cac phan khong nen ky vong Chatwoot giai quyet tot cho bai toan nay.

### 1. `zalo-service`

Phai tu xay:

- tao channel
- QR login
- luu session
- reconnect
- sync contacts
- send message
- nhan message
- status event

### 2. Integration Contracts

Phai tu xay:

- `InboundMessageEvent`
- `OutboundMessageCommand`
- `ChannelStatusChanged`
- `ContactSyncEvent`
- `DeliveryReceipt`

### 3. Reconciliation Jobs

Phai tu xay:

- retry event loi
- doi soat message bi mat
- dedupe event
- sync lai contact/conversation neu can

### 4. Channel Access Model

Phai tu xay hoac custom them:

- user nao duoc xem channel nao
- user nao duoc tra loi channel nao
- admin nao duoc quan ly channel nao

### 5. Channel Management UI

Can custom them giao dien quan tri:

- tao channel Zalo
- xem trang thai `connected / qr_pending / error`
- yeu cau quet QR lai
- reconnect
- sync ban be

Chatwoot khong co san dung bai toan nay theo cach ban dang can.

## Cach Tich Hop De Xuat

Huong tich hop tot nhat la:

- Chatwoot la `chat-server`
- `zalo-service` la connector runtime rieng
- giao tiep giua hai ben qua `API + event sync`

### Command Flow

Chat-server -> zalo-service:

- create channel
- start QR login
- reconnect channel
- sync contacts
- send outbound message

### Event Flow

Zalo-service -> chat-server:

- QR pending
- login success
- login error
- inbound message
- contact synced
- delivery sent
- delivery failed
- channel disconnected

## Kien Truc Tich Hop Khuyen Nghi

```text
Web UI
  |
  v
Chat Server (Chatwoot-like domain)
  |
  +-- manages users, inbox, conversations, assignments
  |
  +-- sends commands --> Zalo Service
  |
  <-- consumes events --+
                        |
                  Zalo Service
                        |
                        v
                       Zalo
```

Neu can do ben vung cao hon:

```text
Chat Server <-> Shared DB / integration_events <-> Zalo Service
```

## Muc Do Custom Neu Dung Chatwoot

### Muc 1. Low Custom

Dung Chatwoot chu yeu nhu UI/domain reference.

Can lam:

- bridge event vao conversation/message
- them metadata provider Zalo
- them channel management page toi thieu

Muc nay an toan nhat.

### Muc 2. Medium Custom

Dung Chatwoot lam chat-server that su.

Can lam them:

- custom quyen user -> channel
- custom inbox/channel mapping cho Zalo
- custom trang thai ket noi channel
- custom sync contact flow

Muc nay kha hop ly neu thuc su chon Chatwoot.

### Muc 3. High Custom

Fork sau vao core internals de bien Chatwoot thanh native Zalo platform.

Rui ro:

- kho nang cap upstream
- custom debt cao
- internals phuc tap hon nhieu

Khong khuyen nghi o giai doan dau.

## Quyết Định De Xuat

Neu uu tien la `tiet kiem thoi gian phat trien`, toi de xuat:

1. dung `Chatwoot` lam `chat-server reference` hoac base
2. khong nhet Zalo runtime vao Chatwoot
3. xay `zalo-service` rieng tu dau
4. custom Chatwoot o muc `Low -> Medium`, khong di vao `High Custom`
5. uu tien chot event contract va channel mapping som

## Tra Loi Thang Cac Cau Hoi Quan Trong

### Co nen dung Chatwoot khong?

Co, neu muc tieu la tiet kiem thoi gian xay phan inbox/chat domain.

### Co nen dung Chatwoot lam noi xu ly QR login / session Zalo khong?

Khong.

### Co nen fork Chatwoot va sua sau core ngay tu dau khong?

Khong nen.

### Co nen dung Chatwoot lam domain tham chieu ngay ca khi chua quyet dung no lam base khong?

Co. Day la gia tri lon nhat ngay ca trong truong hop cuoi cung van tu build chat-server.

## Chot V1

`Chatwoot` la ung vien phu hop nhat de tai su dung phia `chat-server`, vi no rat sat domain `omnichannel shared inbox`.

Tuy nhien, bai toan `Zalo runtime` van la phan phai tu xay va tach rieng thanh `zalo-service`.

Huong chot V1:

- `Chatwoot-style chat-server`
- `zalo-service` doc lap
- `shared contracts + integration events`
- custom Chatwoot o muc vua phai
