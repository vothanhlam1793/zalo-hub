# Zalo Hub

Repo nay hien duoc chot theo huong 2 service tach rieng:

- `chat-server`: UI + shared inbox domain local
- `zalo-service`: QR login, session, reconnect, sync contacts

## Chay local

Can cai dependency truoc:

```bash
npm install
```

Start ca 2 service:

```bash
./start.sh
```

Dung service:

```bash
./stop.sh
```

Restart service:

```bash
./restart.sh
```

URL mac dinh:

- `chat-server`: `http://localhost:3199`
- `zalo-service`: `http://localhost:3299`

## Cau truc chinh

- `src/chat-server/*`: inbox API, local UI, file store cho chat domain
- `src/zalo-service/*`: runtime API va adapter Zalo hien tai
- `PLAN1.md`: diem tiep noi quan trong nhat cho session sau

## Trang thai hien tai

`chat-server` va `zalo-service` da tach thanh 2 service rieng va chay duoc.

Tuy nhien, theo ket luan trong `PLAN1.md`, adapter Zalo hien tai chua on dinh o phan:

- session restore / reconnect
- sync contacts sau restart
- do tin cay cua trang thai `connected`

## Huong tiep theo

Khong nen tiep tuc va adapter hien tai.

Buoc tiep theo da duoc chot:

1. doc source `n8n-nodes-zalo-ca-nhan`
2. tim logic `zaloApi`, QR login, trigger, `getAllFriends`, persist session
3. so sanh voi `src/zalo-service/*`
4. port logic on dinh hon vao `zalo-service`

Tai lieu nen doc theo thu tu:

1. `PLAN1.md`
2. `PLAN.md`
3. `ARCHITECTURE_V1.md`
4. `EVENT_CONTRACTS_V1.md`
5. `DOMAIN_MODEL_V1.md`
