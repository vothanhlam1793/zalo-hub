# Gold-3 Result

## Muc tieu

`gold-3` duoc tao ra de nang cap `gold-2` tu web console gui tin don le thanh mot chat 1-1 co ban tren frontend.

Muc tieu cu the:

1. chon mot friend tren web de mo conversation rieng
2. gui tin nhan trong khung chat
3. nhan tin nhan moi tu friend do trong luc session dang chay
4. hien thi duoc timeline hai chieu tren web

## Ket qua

Da dat.

`gold-3` hien da co:

1. friend list va active conversation tren frontend
2. message timeline cho chat 1-1
3. gui tin nhan text trong khung chat
4. listener bat duoc incoming message that tu Zalo
5. websocket tich hop trong backend de day tin moi ra frontend
6. hien thi duoc tin nhan text incoming va outgoing
7. hien thi duoc tin nhan anh nhan toi
8. scroll va composer co hanh vi hop ly hon cho chat

## Thanh phan chinh

- `src/gold-1/runtime.ts`
- `src/gold-1/types.ts`
- `src/gold-2/server.ts`
- `src/gold-2/client/index.html`
- `src/gold-2/client/app.js`
- `src/gold-2/client/styles.css`

## Diem ky thuat quan trong

### 1. Khong tach thanh service rieng som

Websocket duoc tich hop ngay trong backend `gold-2` thay vi tao service moi. Ly do la message source, conversation cache, va web API deu dang o cung mot runtime nho.

### 2. Runtime bat incoming message that

`gold-3` prove duoc rang runtime co the:

- login/reconnect bang credential local
- start listener
- nhan event message that tu Zalo
- map ve `friendId`
- dua vao conversation cache

### 3. Frontend realtime qua websocket

Frontend khong con phu thuoc vao polling cho khung chat dang mo. Websocket `/ws` duoc dung de:

- subscribe conversation theo `friendId`
- nhan message moi ngay khi backend bat duoc
- append vao timeline tren UI

### 4. Support toi thieu cho image incoming

Khi payload incoming co `msgType = chat.photo` va `content.href`, frontend se render anh trong timeline.

## Dinh nghia thanh cong

`gold-3` duoc xem la dat khi:

- nguoi dung vao web va chon duoc mot friend
- web mo duoc khung chat rieng cho friend do
- gui duoc tin nhan text trong khung chat
- khi friend nhan lai, web hien duoc tin moi trong conversation
- khung chat hien thi duoc timeline co ban hai chieu

Tat ca cac diem tren da dat.
