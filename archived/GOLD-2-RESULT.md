# Gold-2 Result

## Muc tieu

`gold-2` duoc tao ra de nang cap `gold-1` tu CLI thanh mot web app toi gian, van dua tren cung runtime da prove.

Muc tieu cu the:

1. dang nhap tren web
2. tai danh sach ban be tren web
3. gui tin nhan tren web

## Ket qua

Da dat.

`gold-2` hien da co:

1. tao QR dang nhap tu web
2. hien thi QR tren web
3. polling trang thai dang nhap
4. hien thi friend list
5. gui tin nhan text 1-1
6. hien thi thong tin account o muc API cho phep
7. logout va xoa credential local
8. expose web server cho may khac trong LAN

## Thanh phan chinh

- `src/gold-2/server.ts`
- `src/gold-2/client/index.html`
- `src/gold-2/client/app.js`
- `src/gold-2/client/styles.css`

## Diem ky thuat quan trong

### 1. Khong viet lai runtime

`gold-2` dung lai runtime cua `gold-1` thay vi tao them adapter rieng.

### 2. Login state tren web

Them cac trang thai:

- `loginInProgress`
- `loggedIn`
- `sessionActive`

de UI phan biet ro:

- dang cho quet QR
- da co credential
- da dang nhap thanh cong

### 3. Logout flow

Them nut dang xuat de:

- xoa session memory
- xoa QR dang giu
- xoa credential local
- xoa friend cache

## Dinh nghia thanh cong

`gold-2` duoc xem la dat khi:

- nguoi dung vao web va thuc hien duoc login
- web tai duoc friend list
- web gui duoc tin nhan
- web cho biet trang thai dang nhap hop ly
- web dang xuat duoc

Tat ca cac diem tren da dat.
