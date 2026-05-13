# GOLD-7 Result

## Muc tieu

`gold-7` duoc chot de dua app tu local-history-first sang remote-history-sync va canonical conversation model on dinh hon.

Muc tieu chinh:

1. co co che xin history cu tu runtime Zalo
2. reconcile local DB theo `provider_message_id`
3. khong de group conversation bi persist nham thanh `direct:<groupId>`
4. khi mo conversation, metadata phai duoc dong bo lai va ghi xuong DB local
5. group message phai co du du lieu ten nguoi gui o muc dung duoc trong thuc te

## Ket qua da dat

`gold-7` da dat tren codebase hien tai.

Nhung gi da duoc implement va prove:

1. Backend co history sync API noi bo dua tren `listener.requestOldMessages(...)`
2. Old messages tu runtime duoc normalize ve cung message model va merge vao SQLite
3. Dedupe uu tien theo `provider_message_id`
4. Conversation/message data duoc canonicalize lai theo `group:<id>` hoac `direct:<id>` tu raw payload thay vi giu state sai trong summary
5. Co repair toan account de chuyen cac group message cu bi luu nham thanh `direct:<groupId>` ve `group:<groupId>`
6. `conversations` duoc rebuild tu `messages` canonical thay vi tiep tuc tin vao summary cu
7. Khi mo conversation, backend se sync lai metadata cua contact/group roi persist xuong DB local
8. Khi mo group conversation, backend se enrich lai `senderName` cho messages va ghi vao DB local
9. Fallback `raw_message_json.dName` duoc dung de lap day ten nguoi gui khi roster/member metadata chua du
10. Frontend khi mo conversation se goi sync metadata truoc, sau do moi reload messages/conversations tu DB da duoc cap nhat
11. Frontend co in-memory cache theo `conversationId` va guard chong stale async update khi doi conversation nhanh

## Cac case da prove

Nhung case loi thuc te da duoc sua tren local backend va duoc user xac nhan pass:

1. group bi persist nham thanh `direct:5204171834933792432` da duoc chuyen thanh `group:5204171834933792432`
2. group bi persist nham thanh `direct:2900076444936251831` da duoc chuyen thanh `group:2900076444936251831`
3. history query cua 2 group tren tra ve message voi `conversationType = group`
4. sender name trong 2 group tren duoc lap day tu metadata/contact/raw payload va duoc persist vao DB
5. loi UI doi conversation nhanh dan den ten mot nguoi nhung noi dung conversation khac da duoc sua

## Ghi chu pham vi

`gold-7` van khong co nghia la app co API history chinh thuc tu Zalo cloud doc lap voi session.

Co che hien tai van dua tren runtime/session/listener cua Zalo package va co the phu thuoc vao kha nang sync tai thoi diem dang nhap/ket noi.

Tuy vay, trong pham vi app hien tai cho `1 user`, muc tieu nghiem thu da dat:

1. sync duoc old history theo runtime co san
2. reconcile local data theo `provider_message_id`
3. canonicalize group/direct dung hon
4. metadata conversation va sender name duoc dong bo va persist local tot hon

## Huong tiep theo

Sau `gold-7`, huong tiep theo la `gold-8`:

1. account profile/avatar
2. enrich avatar that cua contact/group
3. dua profile/avatar vao UI ro hon
