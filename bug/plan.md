# Kế hoạch triển khai: ZaloHub Bugfixes & Group Whitelist

## Phần 1: Fix lỗi Session không hỗ trợ `sendMessage` (Bot Hermes 0869)

**Phân tích nguyên nhân:** 
Account Zalo `0869845558` (ID `623490462004154671`) đang được login bằng mã QR. Zalo API phân quyền session từ QR là **user-type**, không cung cấp hàm `sendMessage` trong đối tượng `api`. Tài khoản cần phải login bằng Mật khẩu (credentials) để lấy full-type session hỗ trợ gửi tin.

**Action Plan:**
- **Không có code thay đổi** cho phần này vì kiến trúc của hệ thống yêu cầu đúng loại Session từ Zalo API. 
- Thay vào đó, Coder/Admin cần làm việc sau trên Server:
  1. Vào ZaloHub Admin Dashboard.
  2. Bấm Stop Runtime hoặc Logout cho account `0869845558`.
  3. Xóa session hiện tại.
  4. Thực hiện login lại account này bằng phương thức **Số điện thoại + Mật khẩu** thay vì quét QR.
- (Optional): Có thể edit file `backend/src/core/runtime/sender.ts` dòng 127, sửa dòng throw Error cho rõ ràng hơn: `throw new Error('Session khong ho tro sendMessage (Vui long login lai bang Mat khau thay vi QR code)');`.

---

## Phần 2: Triển khai Dify Bot — Receive & Send Group Whitelist

Tính năng này giúp 1 account Zalo có thể tạo nhiều Bot Dify, mỗi Bot phụ trách các Group riêng biệt, hỗ trợ kiến trúc Multi-Agent theo spec.

### Bước 1: Database Migration
- Tạo file: `backend/db/migrations/20260611000000_add_whitelist_to_dify_bots.ts`
- Nội dung: 
  Sử dụng Knex để alter table `dify_bots`, thêm 2 cột mới (không notNullable vì có bot cũ):
  - `receive_groups` (jsonb, default: `'[]'`)
  - `send_groups` (jsonb, default: `'[]'`)

### Bước 2: Cập nhật Backend Interface
- File: `backend/src/server/services/dify-bot-service.ts`
  - Trong interface `DifyBotConfig`, thêm:
    ```typescript
    receive_groups?: string[];
    send_groups?: string[];
    ```
  - Trong hàm `listBots()`, khi map DB rows, thêm fallback nếu null:
    ```typescript
    receive_groups: Array.isArray(row.receive_groups) ? row.receive_groups : [],
    send_groups: Array.isArray(row.send_groups) ? row.send_groups : [],
    ```

### Bước 3: Áp dụng Receive Filter (ZaloHub → Dify)
- File: `backend/src/server/services/dify-bot-executor.ts`
  - Cập nhật hàm `matchesFilter(bot: DifyBotConfig, msg: GoldConversationMessage): boolean`
  - Thêm block check whitelist lên đầu:
    ```typescript
    if (bot.receive_groups && bot.receive_groups.length > 0) {
      if (!bot.receive_groups.includes(msg.conversationId)) {
        return false;
      }
    }
    ```

### Bước 4: Áp dụng Send Filter (Dify → ZaloHub)
- File: `backend/src/server/routes/bot-api.ts`
  - Tại endpoint `POST /send-message` (khoảng dòng 113)
  - Thêm block validation sau khi lấy được `req.difyBot`:
    ```typescript
    const sendGroups = bot.send_groups || [];
    if (sendGroups.length > 0 && !sendGroups.includes(conversationId)) {
      res.status(403).json({ 
        error: 'Bot khong duoc phep gui tin nhan vao group nay (Check Send Whitelist trong Admin)',
        conversationId,
        allowed_groups: sendGroups
      });
      return;
    }
    ```

### Bước 5: Cập nhật Frontend Admin UI
- File: `frontend/src/features/admin/DifyBotsTab.tsx`
  - Trong interface `DifyBot`, bổ sung 2 field `receive_groups: string[]; send_groups: string[];`
  - Bổ sung State Form: `const [formReceiveGroups, setFormReceiveGroups] = useState('');` và `const [formSendGroups, setFormSendGroups] = useState('');`.
  - Sửa logic `resetForm` và `openEdit` để map data.
  - Sửa `handleSubmit` để parsing string từ Input thành string array:
    ```typescript
    receive_groups: formReceiveGroups.split(',').map((k) => k.trim()).filter(Boolean),
    send_groups: formSendGroups.split(',').map((k) => k.trim()).filter(Boolean),
    ```
  - Trong UI Form Component: Thêm 1 section (ngay dưới Keywords) để nhập liệu Receive Whitelist và Send Whitelist (dạng Textarea nhập ID phân cách bằng dấu phẩy).
  - Trong UI Card List Component: Hiển thị tóm tắt `Receive Groups` và `Send Groups` cạnh thông tin Filter.
