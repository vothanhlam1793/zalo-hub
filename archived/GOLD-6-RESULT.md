# GOLD-6 Result

## Muc tieu

Hoan thien UI 3 tab `Cuoc tro chuyen` / `Ban be` / `Nhom`, group chat realtime, lazy history, attachment/media on dinh tren public domain.

## Da hoan tat

1. Refactor conversation model theo `conversationId`
   - `direct:<contactId>`
   - `group:<groupId>`
2. UI 3 tab:
   - `Cuoc tro chuyen`
   - `Ban be`
   - `Nhom`
3. Search cho `Ban be` va `Nhom`
4. Load duoc contacts va groups that
5. Group conversation realtime
6. Hien ten nguoi gui trong incoming group message
7. Lazy history load theo `before + limit`
8. Render tot hon cho image / video / file attachment
9. Outgoing attachment qua backend multipart
10. Mirror attachment vao app server local storage `data/media/`
11. Backend serve media qua `/media/*`
12. Repair/backfill du lieu cu:
    - chuan hoa `kind`
    - chuan hoa `attachments`
    - cuu file cu con source ve local storage
13. Canonicalize case legacy `share.file` / `text + image_url + file name`

## Van de da xu ly trong gold-6

- Public domain tung `502` khi backend local chua len dung runtime
- App runtime can Node >= 22.15 de ho tro `node:sqlite`
- File mirror cu bi luu thieu extension -> browser nhan sai content type
- Route `/media/...` tung roi vao catch-all tra `index.html`
- Attachment cu co case bi neo theo text thay vi file block

## Quy trinh deploy/test thuc te da duoc xac minh

- Public domain: `https://zalo.camerangochoang.com`
- Proxy host: `root@svr12.creta.vn`
- Upstream nginx: `http://10.7.0.21:3399`
- Thu tu verify dung:
  1. app host local `127.0.0.1:3399`
  2. app host public IP `10.7.0.21:3399`
  3. tu `svr12` toi `10.7.0.21:3399`
  4. public domain `zalo.camerangochoang.com`

## Ket qua nghiem thu

- User da pass gold-6.
