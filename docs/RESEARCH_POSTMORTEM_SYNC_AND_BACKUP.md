# BÁO CÁO NGHIÊN CỨU & THỰC NGHIỆM: ĐỒNG BỘ DỮ LIỆU LỊCH SỬ & SAO LƯU ZALO

- **Dự án**: ZaloHub Platform
- **Thời gian thực hiện**: Tháng 09/2026
- **Tác giả / Kỹ sư**: Võ Thanh Lâm & Đội ngũ AI Engineering ZaloHub
- **Trạng thái**: Đã thử nghiệm toàn diện — Kết luận giới hạn kiến trúc & Đóng băng 3 hướng nghiên cứu

---

## 1. BỐI CẢNH & MỤC TIÊU BAN ĐẦU
Khi máy chủ ZaloHub gặp sự cố gián đoạn (ví dụ: máy chủ đầy dung lượng `ENOSPC`, sập mạng, hoặc bảo trì trong vài giờ đến 1-2 ngày), các tài khoản Zalo bị ngắt kết nối WebSocket. Khi kết nối lại, ZaloHub cần một cơ chế tự động lấy lại toàn bộ tin nhắn bị lỡ trong khoảng thời gian sập, đồng thời mở rộng khả năng nhập kho dữ liệu tin nhắn nhiều năm từ chính tài khoản Zalo cá nhân.

Ba (03) hướng tiếp cận kỹ thuật độc lập đã được đặt ra và thử nghiệm chi tiết:
1. **Phương án 1 (Recent)**: Bù tin nhắn lỡ thông qua giao thức Socket Catchup (`cmd 510`, `cmd 511`).
2. **Phương án 2 (Đồng bộ P2P)**: Đăng nhập Zalo Web qua Chromium headless, kích hoạt luồng đồng bộ từ điện thoại sang PC và giải mã IndexedDB.
3. **Phương án 3 (Google Drive Backup)**: Quét và giải mã gói tin sao lưu của Zalo Mobile trên Google Drive.

---

## 2. CHI TIẾT KẾT QUẢ THỰC NGHIỆM TỪNG PHƯƠNG ÁN

### ❌ PHƯƠNG ÁN 1: BÙ TIN QUA API / WEBSOCKET RECENT CATCHUP (`cmd 510/511`)
- **Ý tưởng**: Khi tài khoản kết nối lại vào WebSocket Zalo (`chat.zalo.me`), client gửi lệnh `cmd 510` (sync event) hoặc `cmd 511` (get recent messages) kèm timestamp tin nhắn cuối cùng nhận được để server bù đắp các tin nhắn bị thiếu.
- **Thực nghiệm đã làm**:
  - Tích hợp logic `catchupRecentConversations` trong `sync.ts` và `listener.ts`.
  - Phân tích gói tin nhị phân bắt từ WebSocket bằng `pako.inflate` và `inflateRawSync`.
- **Nguyên nhân thất bại**:
  - Server Zalo Web **chỉ duy trì ring-buffer tạm thời cực ngắn trong RAM (khoảng 3–5 phút)**.
  - Khi client bị ngắt kết nối quá 15–30 phút, server Zalo coi như bộ đệm đã bị xả bỏ và trả về `0` tin nhắn.
  - Zalo có kiến trúc lưu trữ phân tán nhưng dữ liệu tin nhắn người dùng cuối (E2EE/Client Storage) **không được lưu trữ vĩnh viễn trên Cloud cho Web Client**.
- **Kết luận**: Phương án 1 chỉ có tác dụng hứng tin realtime khi socket đang sống; hoàn toàn bất khả thi để bù tin nhắn cũ quá 30 phút.

---

### ❌ PHƯƠNG ÁN 2: ĐỒNG BỘ ĐIỆN THOẠI ➜ TRÌNH DUYỆT (P2P Transfer-Sync)
- **Ý tưởng**: Zalo Web có tính năng "Đồng bộ tin nhắn gần đây từ điện thoại sang máy tính". Ta dùng Playwright / Chromium tự động hóa việc quét mã QR, bấm nút Đồng bộ để điện thoại stream dữ liệu sang trình duyệt, sau đó trích xuất ra Postgres.
- **Thực nghiệm đã làm**:
  - Xây dựng worker `standalone-sync-worker.ts` chạy Chromium Persistent Context.
  - Tự động bắt mã QR và hiển thị lên Terminal/API.
  - Bấm nút "Đồng bộ" trên Zalo Web và xác nhận trên điện thoại.
  - **Kết quả thu được**: Điện thoại thực sự đã stream thành công **12.061 tin nhắn** và **154 hội thoại** vào IndexedDB `zdb_<accountId>` (store `message`).
- **Nguyên nhân thất bại ở khâu giải mã & tái sử dụng session**:
  1. **Nội dung bị mã hóa**: Toàn bộ chuỗi văn bản trong store `message` của IndexedDB bị mã hóa Base64 cipher bằng WebCrypto API (`SubtleCrypto`). Khóa giải mã được sinh ngẫu nhiên trong bộ nhớ phiên duyệt web lúc trao đổi khóa P2P với điện thoại.
  2. **Chặn chéo Session (`18022: Invalid Signature`)**: Khi lấy bộ Cookie và LocalStorage từ trình duyệt Chromium nạp sang thư viện `zalo-api-final` để gọi API đọc tin, Zalo server từ chối với lỗi:
     ```json
     {"error_code": 18022, "error_message": "Invalid Signature", "data": null}
     ```
     Thuật toán băm chữ ký của Zalo Web liên kết chặt chẽ với IMEI và Secret Key sinh ra từ bundle JS của trình duyệt, không cho phép script backend giả lập gọi chéo API.
  3. **Rủi ro vận hành**: Bundle JS của Zalo Web bị làm rối (obfuscated) nặng và cập nhật phiên bản liên tục hàng tuần, việc duy trì bộ giải mã ngược dịch ngược RAM là bài toán không ổn định và tiêu tốn tài nguyên bảo trì quá lớn.
- **Kết luận**: Dữ liệu có về máy nhưng bị khóa chặt trong IndexedDB mã hóa; không thể giải mã và chuyển hóa tự động về Postgres một cách ổn định.

---

### ❌ PHƯƠNG ÁN 3: GIẢI MÃ BẢN SAO LƯU ZALO MOBILE TRÊN GOOGLE DRIVE
- **Ý tưởng**: Người dùng Zalo trên Android/iOS thường xuyên sao lưu dữ liệu lên Google Drive. Ta cấp quyền Google OAuth (`drive.appdata`, `drive`) cho ZaloHub để tải bundle sao lưu về và giải mã cơ sở dữ liệu SQLite `message.db`.
- **Thực nghiệm đã làm**:
  - Xây dựng module `GoogleDriveClient`, `ZaloBackupImporterService` và tích hợp cơ chế ủy quyền 1-Click OAuth / CLIProxy-style copy link.
  - Kết nối thành công tài khoản Google Drive cá nhân của người dùng vào ZaloHub.
  - Gọi Google Drive API để quét các vùng `drive` và `appDataFolder`.
- **Nguyên nhân thất bại (Rào cản bảo mật Google AppData Sandbox)**:
  - Zalo Mobile lưu file sao lưu vào thư mục hệ thống đặc biệt: **`appDataFolder`**.
  - **Chính sách bảo mật của Google**: `appDataFolder` được cô lập tuyệt đối theo từng **OAuth Client ID**. Chỉ có chính ứng dụng tạo ra file (trong trường hợp này là Zalo Mobile của VNG Corporation) mới có quyền liệt kê và tải các file trong `appDataFolder` của nó.
  - Bất kỳ ứng dụng nào khác (dù là ZaloHub hay bên thứ 3), kể cả khi được người dùng cấp toàn quyền `https://www.googleapis.com/auth/drive` và `drive.appdata`, khi query `spaces=appDataFolder` cũng **chỉ nhìn thấy các file do chính Client ID của ứng dụng đó tạo ra**. Do đó Google API luôn trả về danh sách rỗng:
    ```json
    { "files": [] }
    ```
- **Kết luận**: Về mặt kiến trúc bảo mật của nền tảng Google, không một ứng dụng bên ngoài nào có thể tải được file sao lưu Zalo Mobile từ Google Drive của người dùng.

---

## 3. TỔNG KẾT & KẾT LUẬN CHIẾN LƯỢC

1. **Đánh dấu đóng băng 3 hướng nghiên cứu**:
   - Cả 3 hướng (Recent Socket, P2P Sync Web, Google Drive Backup) chính thức được đóng lại và lưu trữ vào tài liệu kỹ thuật để tránh lặp lại nguồn lực nghiên cứu trong tương lai.
2. **Khẳng định năng lực hiện tại của ZaloHub**:
   - ZaloHub **hoạt động xuất sắc ở vai trò Realtime Hub 24/7**: Khi online, hệ thống hứng 100% tin nhắn gửi/nhận, lưu trữ văn bản tức thì vào PostgreSQL và media về MinIO/Google Drive.
   - Cơ chế **Group Redundancy** (dự phòng chéo giữa các nick cùng trong nhóm) là phương pháp bù tin khả thi nhất khi có 1 nick bị mất kết nối.
3. **Đề xuất hướng tiếp cận mới trong tương lai**:
   - **Tối ưu tính sẵn sàng cao (High Availability)**: Tăng cường giám sát ổ cứng, cảnh báo Telegram khi disk > 85%, auto-restart service để đảm bảo ZaloHub không bao giờ bị gián đoạn.
   - **Trích xuất cục bộ (Local ADB Backup)**: Nếu bắt buộc cần dữ liệu lịch sử nhiều năm từ điện thoại, thực hiện trích xuất trực tiếp qua cáp USB và công cụ ADB/Backup nội bộ từ thiết bị Android, hoàn toàn độc lập với Cloud Google và Zalo Server.

---
*Tài liệu được lưu trữ tại `docs/RESEARCH_POSTMORTEM_SYNC_AND_BACKUP.md` - ZaloHub Platform v5.2.1.*
