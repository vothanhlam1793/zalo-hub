# Zalo Hub

Repo nay hien tap trung vao `gold-4`:

- mot app chat Zalo cho `1 user`
- co `SQLite` local cho history
- realtime qua `websocket`
- support `text + image + file`
- UI chinh hien tai la frontend `React`

## Trang thai hien tai

`gold-4` da duoc chot la moc hien tai.

Nhung gi da co trong codebase hien tai:

1. dang nhap bang QR
2. reconnect bang credential local sau restart
3. tai danh sach ban be
4. conversation list local theo account
5. message history local bang `SQLite`
6. realtime text qua `websocket`
7. render incoming `image/file/video`
8. outgoing attachment qua backend multipart
9. frontend `React` moi cho `gold-4`
10. public domain da expose qua proxy

Noi ngan gon:

- `gold-1`: runtime/core voi Zalo that
- `gold-2`: backend web va client cu, hien van giu server/API cho `gold-4`
- `gold-4`: UI React moi + attachment persistence + public domain

## Chay `gold-1`

Lenh nhanh nhat:

```bash
./gold.sh
```

Menu hien tai:

1. `Login bang QR`
2. `Tai danh sach ban be`
3. `Gui tin nhan`
4. `Doctor`
5. `Thoat`

## Chay Backend

Backend hien tai chay tren:

```bash
http://localhost:3399
```

Neu truy cap tu may khac trong cung mang LAN, dung dia chi IP cua may host. Vi du:

```bash
http://192.168.110.111:3399
```

Kha nang hien tai cua web app (`gold-3`):

1. tao QR dang nhap
2. hien thi QR tren web
3. tai danh sach ban be
4. chon ban be de mo khung chat rieng
5. gui tin nhan trong khung chat
6. nhan tin nhan moi theo realtime tu backend websocket tich hop
7. hien thi tin nhan text hai chieu trong timeline
8. hien thi tin nhan anh nhan toi
9. hien thi trang thai dang nhap
10. hien thi thong tin tai khoan dang nhap
11. dang xuat

## Chay Frontend `gold-4`

Dev frontend:

```bash
npm run gold4:web
```

Frontend dev mac dinh chay tren:

```bash
http://localhost:3400
```

Build frontend tĩnh:

```bash
npm run gold4:build
```

Build output:

- `dist/gold-4-web/*`

## Du lieu va log

State local:

- `data/gold-4.sqlite`

Log theo tung lan chay:

- `logs/gold-1/*.log`

## Cau truc chinh

- `src/gold-1/*`: runtime/core + store + listener + send/receive
- `src/gold-2/server.ts`: backend API/WebSocket hien tai cho `gold-4`
- `src/gold-2/client/*`: client cu, giu lam fallback/debug
- `src/gold-4-web/*`: frontend React chinh hien tai cua `gold-4`
- `gold.sh`: script chay menu nhanh trong terminal
- `gold-4.md`: tai lieu moc va ket qua `gold-4`
- `archived/*`: tai lieu va huong cu duoc luu lai de tham chieu

## Deploy / Public

Public app hien tai:

- `https://zalo.camerangochoang.com`

Public routing hien tai:

- `/` -> frontend `gold-4` duoc serve tu backend `:3399`
- `/api/*` -> backend `gold-4` `:3399`
- `/ws` -> websocket `:3399`

Backend local phai chay tren may nay tai:

- `10.7.0.21:3399`

Proxy nginx dang chay tren:

- `root@svr12.creta.vn`

File config da sua tren proxy:

- `/etc/nginx/sites-enabled/zalo.camerangochoang.com.conf`

Deploy runbook lan sau:

1. build frontend:

```bash
npm run gold4:build
```

2. build TypeScript backend:

```bash
npm run build
```

3. restart backend local tren may app

Lenh da duoc dung trong session nay:

```bash
/usr/lib/code-server/lib/node \
  --require /home/leco/zalohub/node_modules/tsx/dist/preflight.cjs \
  --import file:///home/leco/zalohub/node_modules/tsx/dist/loader.mjs \
  /home/leco/zalohub/src/gold-2/server.ts
```

4. neu proxy can doi route, vao server proxy va `reload nginx`:

```bash
ssh root@svr12.creta.vn
nginx -t && systemctl reload nginx
```

5. verify public:

```bash
curl -sk https://zalo.camerangochoang.com/
curl -sk https://zalo.camerangochoang.com/api/health
```

## Ghi chu

Repo van con `chat-server` va `zalo-service` trong `src/`, nhung hien tai khong phai mui nhon phat trien.

Moc tiep theo sau tai lieu nay la `gold-5`.
