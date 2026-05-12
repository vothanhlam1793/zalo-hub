# Zalo Hub

Repo nay hien tap trung vao mot muc tieu rat cu the:

- xay mot nen tang nho nhung chay duoc voi Zalo that, va hien da dat toi `gold-3`

## Trang thai hien tai

`gold-3` da dat duoc mot chat 1-1 co ban tren web.

Nhung gi da chay duoc:

1. dang nhap bang QR
2. tai danh sach ban be
3. gui tin nhan text toi ban be
4. nhan tin nhan 1-1 moi tu ban be trong luc session dang chay
5. hien thi khung chat co ban tren web
6. nhan tin nhan anh va hien thumbnail/anh trong khung chat
7. `doctor` de verify session reconnect
8. giao dien web de thao tac cac buoc tren
9. hien thi trang thai dang nhap
10. hien thi thong tin tai khoan dang nhap o muc co the lay duoc
11. dang xuat va xoa credential local

Noi ngan gon:

- da co `gold-1` CLI chay duoc voi Zalo that
- da co `gold-2` web UI co ban truy cap tu may khac trong LAN
- da co `gold-3` chat 1-1 co ban theo khung hoi thoai tren web
- da login thanh cong
- da lay duoc friend list
- da gui va nhan duoc tin nhan 1-1
- da hien duoc tin nhan anh nhan toi trong khung chat
- da verify duoc reconnect bang credential luu local
- da co logout flow

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

## Chay `gold-2`

Web app hien tai chay tren:

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

## Du lieu va log

State local:

- `data/gold-1-state.json`

Log theo tung lan chay:

- `logs/gold-1/*.log`

## Cau truc chinh

- `src/gold-1/*`: CLI va runtime nho de test flow Zalo that
- `src/gold-2/*`: web UI va backend nho dung lai runtime cua `gold-1`, hien da co chat 1-1 realtime co ban
- `gold.sh`: script chay menu nhanh trong terminal
- `PLAN.md`: ke hoach hien tai sau khi `gold-3` da dat
- `archived/*`: tai lieu va huong cu duoc luu lai de tham chieu

## Ghi chu

Repo van con `chat-server` va `zalo-service` trong `src/`, nhung giai doan hien tai khong lay chung lam mui nhon phat trien.

Muc tieu tiep theo la giu `gold-3` on dinh, va chi mo rong them neu can cho `gold-3B`.
