# Gold-4

## Muc Tieu

`gold-4` duoc chot la moc nang cap tu `gold-3` thanh mot app chat Zalo hoan chinh hon cho `1 user`.

Huong chot:

1. backend Zalo phai chay on dinh truoc
2. realtime chinh di qua `websocket`
3. co `history local` thay vi chi giu message trong RAM
4. mo rong tu text sang `image + file`
5. frontend duoc lam moi bang `React`
6. UI layer uu tien dung `opensource chat view components`, nhung backend contract van do project nay so huu

`gold-4` khong nham toi:

1. multi-user shared inbox
2. role/permission noi bo
3. tach kien truc lon thanh nhieu service moi
4. nhom feature enterprise nhu poll/reminder/catalog

## Ket Qua Mong Muon

Sau khi `gold-4` chay duoc, he thong can dat:

1. QR login thanh cong
2. reconnect sau restart thanh cong bang credential local
3. friend list tai duoc tu Zalo that
4. co conversation list local cho `1 user`
5. co message history local sau restart
6. gui/nhan text realtime qua `websocket`
7. gui/nhan image chay duoc
8. gui/nhan file chay duoc
9. co session health va listener health de quan sat
10. co nen san cho typing / seen / delivered / reaction neu prove duoc

## Pham Vi Trien Khai

`gold-4` duoc chia thanh `3 phase nghiem thu`, moi phase la mot moc ban co the tu test truc tiep tren may cua minh.

### Phase 1 - Chat Core

Muc tieu:

1. giu `gold-3` dang chay duoc
2. nang backend thanh mot chat core dung duoc hon cho `1 user`
3. tap trung vao session, realtime, conversation list, history local, text chat

Scope chinh:

1. persistent local cho conversation va message history
2. conversation list local
3. websocket event ro rang hon cho message va session state
4. session health / listener health
5. gui/nhan text on dinh hon

### Phase 2 - Media Va File

Muc tieu:

1. mo rong app tu text chat thanh chat co media/file
2. uu tien `image` va `file`

Scope chinh:

1. gui image outgoing
2. nhan image incoming on dinh hon
3. gui file outgoing
4. hien thi file trong timeline
5. luu metadata attachment trong local history

### Phase 3 - React UI Va Advanced Features

Muc tieu:

1. thay UI hien tai bang frontend `React`
2. tang do linh hoat cua giao dien chat
3. them mot phan advanced chat events neu backend prove duoc

Scope chinh:

1. sidebar conversation tot hon
2. message timeline tot hon
3. composer co attachment preview
4. session/reconnect state ro hon tren UI
5. typing / seen / delivered / reaction neu prove duoc

## Tieu Chi Nghiem Thu

Chi khi phase truoc pass thi moi sang phase sau.

### Phase 1 - Chat Core

Checklist:

1. QR login thanh cong
2. reconnect sau restart thanh cong
3. friend list tai duoc
4. co conversation list local
5. co history local sau restart
6. gui/nhan text realtime qua `websocket`
7. websocket reconnect khong lam hong chat flow
8. co session health va listener health de quan sat

Pass khi:

1. tat ca checklist tren pass voi tai khoan Zalo that
2. dac biet 3 bai bat buoc phai pass:
   - QR login
   - reconnect sau restart
   - gui/nhan text realtime

### Ket Qua Ghi Nhan

`Phase 1` da duoc nghiem thu pass tren codebase hien tai.

Nhung gi da chot va da prove:

1. app co `SQLite` local nho tai `data/gold-4.sqlite`
2. du lieu da bat dau duoc to chuc theo `account_id`
3. `logout` khong xoa history local cua account
4. sau `logout`, session khong con active va API chat bi chan dung cach
5. `friend list` van tai duoc khi session active
6. co `conversation list` local
7. co `message history` local
8. websocket va text chat realtime van hoat dong tren backend `gold-2`
9. login lai dung account co the dung lai data local da luu

Nhung diem ky thuat da duoc sua trong `Phase 1`:

1. bo persistence JSON cu da duoc thay bang DB nho cho `gold-4`
2. `logout` da doi semantics:
   - khong xoa history
   - khong giu session active
   - khong cho frontend tiep tuc dung friends/chat API nhu dang login
3. runtime da hydrate lai conversations tu store theo account sau login
4. server da co gate cho cac API can session active:
   - `/api/friends`
   - `/api/conversations`
   - `/api/conversations/:friendId/messages`
   - `/api/send`

Ghi chu cho session sau:

1. `Phase 1` duoc xem la on, khong quay lai doi huong persistence nua tru khi co bug moi
2. muc tieu tiep theo la `Phase 2 - Media Va File`
3. `Phase 2` se uu tien:
   - gui image outgoing
   - nhan image incoming on dinh hon
   - gui file outgoing
   - hien thi file trong timeline
   - luu metadata attachment trong DB

### Phase 2 - Media Va File

Checklist:

1. gui anh that thanh cong
2. nhan anh that thanh cong
3. gui file that thanh cong
4. timeline hien thi duoc image va file
5. attachment van con trong history sau restart
6. mixed conversation gom text + image + file van render on dinh

Pass khi:

1. gui anh pass
2. nhan anh pass
3. gui file pass
4. history attachment sau restart pass

Ghi chu chuan bi cho `Phase 2`:

1. DB da co bang `attachments`, nen co the tan dung cho metadata media/file
2. backend hien tai da co nen `conversation history + websocket + account-scoped persistence`
3. khong can doi lai `Phase 1`, co the di thang vao outbound image/file flow

### Phase 3 - React UI Va Advanced Features

Checklist:

1. UI React thay han UI cu cho luong chinh
2. sidebar conversation dung duoc that
3. composer text + attachment dung duoc that
4. reconnect state hien thi ro tren UI
5. co it nhat `1` advanced event chay that

Pass khi:

1. UI moi co the dung de login, chon conversation, gui text, gui attachment
2. co it nhat `1` advanced feature prove duoc bang hanh vi that

## Ket Qua Ghi Nhan Moi Nhat

`gold-4` duoc xem la dat tren codebase hien tai theo muc tieu da chot cho `1 user`.

Nhung gi da duoc prove trong ban cap nhat nay:

1. backend van giu duoc `QR login`, `reconnect`, `friend list`, `conversation list`, `history local`, `websocket realtime`
2. message model da duoc nang cap tu `text + imageUrl` thanh `text | image | file | video` voi `attachments[]`
3. metadata attachment da duoc luu vao `SQLite` bang `attachments`
4. incoming `image/file/video` da duoc normalize lai ro hon trong runtime
5. outgoing attachment da co duong gui rieng theo `multipart` qua backend `gold-4`
6. UI `React` moi da thay the vai tro giao dien chinh cho `gold-4`
7. UI moi co:
   - login QR
   - conversation sidebar
   - message timeline
   - composer text + attachment
   - render `image/file/video`
   - status banner ro hon
8. public app da duoc expose tai `https://zalo.camerangochoang.com`
9. domain public da route chung:
   - `/` -> frontend `gold-4`
   - `/api/*` -> backend `gold-4`
   - `/ws` -> websocket realtime

## Deploy Ghi Nho

Thong tin deploy/public da duoc prove trong session nay:

1. app host local dang expose backend tai `10.7.0.21:3399`
2. frontend `gold-4` duoc build thanh static files tai `dist/gold-4-web`
3. backend Express dang serve `dist/gold-4-web` truoc, roi moi fallback ve client cu
4. public domain dang dung:
   - `https://zalo.camerangochoang.com`
5. proxy nginx dang nam tren:
   - `root@svr12.creta.vn`
6. file config nginx da sua:
   - `/etc/nginx/sites-enabled/zalo.camerangochoang.com.conf`

Rule route public da chot:

1. `/` -> `10.7.0.21:3399`
2. `/api/*` -> `10.7.0.21:3399`
3. `/ws` -> `10.7.0.21:3399`

Runbook deploy lai lan sau:

1. `npm run gold4:build`
2. `npm run build`
3. restart backend local
4. neu can, `ssh root@svr12.creta.vn` de `nginx -t && systemctl reload nginx`
5. verify:
   - `curl -sk https://zalo.camerangochoang.com/`
   - `curl -sk https://zalo.camerangochoang.com/api/health`

## Ket Luan Phase

Trang thai chot cho session nay:

1. `Phase 1 - Chat Core`: pass
2. `Phase 2 - Media Va File`: pass o muc nghiem thu thuc te cua codebase hien tai
3. `Phase 3 - React UI Va Advanced Features`: pass o muc thay the giao dien chinh bang `React` va prove duoc `composer + attachment`

## Huong Tiep Theo

Sau `gold-4`, huong tiep theo duoc goi la `gold-5`.

Muc tieu hop ly cho `gold-5` nen la:

1. on dinh listener va reconnect sau thoi gian dai
2. polish upload/download attachment va preview tot hon
3. them telemetry / health checks ro hon cho van hanh
4. xem xet `typing / seen / delivered / reaction` neu backend prove duoc
5. doi tu `pass duoc` sang `on dinh de dung thuong xuyen`
