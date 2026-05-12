# gold-1

## Muc tieu

Dung mot backend-lite/CLI de xac minh flow toi thieu voi Zalo:

1. dang nhap bang QR
2. tai danh sach ban be
3. gui mot tin nhan text den mot `friendId`

## Nguyen tac

- khong di qua `chat-server`
- khong lam event layer
- khong toi uu kien truc
- uu tien chung minh flow that su chay duoc

## Pham vi CLI

Lenh du kien:

```bash
npm run gold:menu
npm run gold:login
npm run gold:friends
npm run gold:send -- --to <friendId> --text "hello world"
npm run gold:doctor
```

## Du lieu local

CLI se luu state trong:

- `data/gold-1-state.json`

State gom:

- `cookie`
- `imei`
- `userAgent`
- friend cache gan nhat

## Log debug

Moi lan chay se tao log rieng trong:

- `logs/gold-1/*.log`

Log dung de xem:

- QR da tao chua
- credential da bat duoc chua
- reconnect co pass khong
- `getAllFriends()` tra gi ve
- send message dang thu bang method nao

## Dinh nghia hoan thanh

- QR login thanh cong va luu duoc credential
- `friends` tra ve > 0 neu tai khoan co ban be
- `send` goi duoc API gui text voi `friendId`
- neu that bai, log du ro de dieu tra tiep
