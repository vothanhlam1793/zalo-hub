# Plan

## Muc Tieu Hien Tai

Sau `gold-3`, huong phat trien duoc chot lai thanh:

1. giu `gold-1` va `gold-2` lam nen tang da prove
2. giu `gold-3` lam moc chat 1-1 da prove tren web
3. chi mo rong them khi co KPI ro rang cho `gold-3B` hoac `gold-4`

## Ket Qua `gold-1`

Da dat duoc:

1. QR login thanh cong
2. recover session tu cookie jar khi `loginQR` cua package fail o buoc hau kiem
3. reconnect session bang credential luu local
4. `getAllFriends()` tra ve du lieu that
5. gui duoc tin nhan text 1-1
6. co `doctor` de verify session
7. co menu CLI va log theo tung lan chay

## Ket Qua `gold-2`

Da dat duoc:

1. web UI co ban cho login QR
2. web UI tai duoc friend list
3. web UI gui duoc tin nhan text 1-1
4. web UI hien thi trang thai dang nhap ro hon
5. web UI hien thi thong tin tai khoan dang nhap o muc API cho phep
6. web UI co logout flow
7. server `gold-2` co the truy cap tu may khac trong LAN

## Ket Qua `gold-3`

Da dat duoc:

1. web UI co khung chat 1-1 co ban
2. chon friend de mo conversation rieng
3. gui tin nhan text trong khung chat
4. backend bat duoc incoming message that tu Zalo
5. frontend nhan tin moi qua websocket tich hop trong cung backend `gold-2`
6. timeline hien thi duoc tin text hai chieu
7. timeline hien thi duoc tin nhan anh nhan toi
8. giu duoc logout flow va reconnect flow da co

## Scope Nen Tang Da Co

`gold-1` hien co:

- `src/gold-1/index.ts`: CLI menu
- `src/gold-1/runtime.ts`: runtime login, reconnect, friends, send
- `src/gold-1/store.ts`: luu credential va friend cache
- `src/gold-1/logger.ts`: log theo tung run
- `gold.sh`: script chay nhanh

`gold-2` hien co:

- `src/gold-2/server.ts`: backend-lite cho web
- `src/gold-2/client/index.html`: giao dien co ban
- `src/gold-2/client/app.js`: login, friends, send, status, logout
- `src/gold-2/client/styles.css`: giao dien web toi gian

`gold-3` hien co them:

- runtime conversation cache trong `src/gold-1/runtime.ts`
- listener bat incoming message that tu Zalo
- websocket tich hop trong `src/gold-2/server.ts`
- chat UI 1-1 trong `src/gold-2/client/*`

## Huong `gold-3`

`gold-3` da duoc prove. Huong hien tai la giu no on dinh truoc khi mo rong them.

Nguyen tac sau `gold-3`:

1. bat dau tu logic da prove trong `gold-1`
2. bat dau tu web UX va API da prove trong `gold-2`
3. uu tien nang cap kha nang van hanh va do on dinh cua `gold-3`
4. chi tach thanh service lon hon khi co nhu cau that su, khong tach som

## Nhung Viec Da Hoan Tat

- login va reconnect voi credential local
- friend sync
- send text 1-1
- QR render trong terminal
- log debug theo run
- `doctor` pass
- web login flow
- web friend list flow
- web send message flow
- web logout flow
- web chat 1-1 flow
- incoming message listener flow
- websocket realtime flow tu backend sang frontend
- incoming image render flow

## Nhung Viec Khong Con La Uu Tien Truc Tiep Luc Nay

- tai lieu kien truc cu o root
- `chat-server` / `zalo-service` lam tam diem phat trien ngay lap tuc
- event contracts / Postgres / Chatwoot integration trong pha hien tai
- tach websocket thanh service rieng truoc khi co nhu cau that

## Ghi Chu

Tai lieu cu duoc dua vao `archived/` de tra cuu khi can.
