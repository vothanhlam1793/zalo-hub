# Gold-1 Result

## Muc tieu

`gold-1` duoc tao ra de tra loi mot cau hoi don gian:

- lieu co the lam mot backend-lite/CLI de login Zalo, lay ban be, va gui tin nhan that su hay khong

## Ket qua

Co.

`gold-1` da chay thanh cong voi flow that:

1. dang nhap bang QR
2. tai danh sach ban be
3. gui tin nhan text toi ban be
4. reconnect lai va verify bang `doctor`

## Cac van de da gap va cach xu ly

### 1. QR tra ve base64 image

Xu ly:

- decode QR tu PNG base64
- render QR ASCII tren terminal
- luu anh QR vao log folder de debug neu can

### 2. `loginQR` bao `Can't login` sau khi da confirm thanh cong

Xu ly:

- recover credential tu `cookieJar`
- luu lai `cookie + imei + userAgent`
- reconnect bang credential recover duoc

### 3. Cookie noise giua `id.zalo.me` va `chat.zalo.me`

Xu ly:

- loc cookie theo dung nhom web-session domains can thiet
- loai cookie `EXPIRED`
- giam warning nhiem trong `doctor`

### 4. `sendMessage` goi sai signature

Xu ly:

- sua ve signature dung cho chat 1-1:
  - `api.sendMessage({ msg: text }, friendId)`

## Artefacts

- CLI: `src/gold-1/index.ts`
- Runtime: `src/gold-1/runtime.ts`
- Logger: `src/gold-1/logger.ts`
- State: `data/gold-1-state.json`
- Logs: `logs/gold-1/*.log`
- Launcher: `gold.sh`

## Dinh nghia thanh cong

`gold-1` duoc xem la dat khi:

- login thanh cong
- friend list tra ve duoc du lieu that
- gui duoc tin nhan 1-1
- `doctor` pass

Tat ca cac diem tren da dat.
