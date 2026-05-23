# Escalation Guide — Khi nào Planner hỏi Main (và Main hỏi User)?

## Nguyên tắc cốt lõi

Planner tự quyết những thứ **không ảnh hưởng đến kết quả cuối mà user quan tâm**.
Planner escalate những thứ **user sẽ hỏi "sao lại làm vậy?" nếu thấy kết quả**.

---

## ✅ Planner TỰ QUYẾT (không cần hỏi)

- Tên biến, tên hàm, tên file (trừ khi có convention rõ trong brief)
- Folder structure nội bộ không ảnh hưởng API
- Chọn thư viện helper nhỏ (logging, date formatting, etc.)
- Thứ tự implement các bước trong plan
- Cách viết test case cụ thể
- Comment style, code formatting
- Cách handle error nội bộ không expose ra ngoài

---

## 🔴 Planner PHẢI ESCALATE lên Main → Main hỏi User

### Kiến trúc & Data

- Chọn giữa 2+ schema DB có tradeoff rõ ràng
  - Ví dụ: normalize vs denormalize, UUID vs auto-increment ID
- Thay đổi schema của table/collection đã có sẵn
- Quyết định cache hay không cache (ảnh hưởng consistency)
- Chọn storage strategy (local file vs S3 vs DB blob)

### Tech Stack

- Thêm dependency lớn chưa có trong project (new framework, ORM, message queue)
- Nâng version major của dependency quan trọng
- Chuyển từ sync sang async hoặc ngược lại cho một flow

### API & Interfaces

- Thay đổi API contract đã tồn tại (endpoint, request/response shape)
- Thêm endpoint mới expose ra ngoài
- Authentication/authorization approach thay đổi

### Scope & Risk

- Cần touch vào module đã được đánh dấu "sensitive" trong gold_brief.md
- Estimate sprint scope vượt quá khả năng hoàn thành trong 1 sprint
- Phát hiện dependency chưa được build (cần sprint khác trước)
- Hai cách tiếp cận có tradeoff rõ và Planner không có đủ context để chọn

### User-defined

- Bất kỳ hạng mục nào user đã thông báo trong gold_brief.md là "cần confirm"

---

## Cách Planner escalate

Planner viết vào plan.md phần `## Escalation Required` và dừng lại:

```markdown
## ⚠️ Escalation Required — Cần User Confirm Trước Khi Tiếp Tục

### Quyết định: <Tên quyết định>

**Bối cảnh**: <Tại sao cần quyết định này>

**Phương án A**: <Mô tả>
- Ưu: ...
- Nhược: ...

**Phương án B**: <Mô tả>
- Ưu: ...
- Nhược: ...

**Recommendation của Planner**: <A hoặc B — và lý do ngắn>

**Ảnh hưởng đến kết quả**: <Nếu chọn A thì X, nếu chọn B thì Y>
```

Main đọc phần này và trình bày cho user theo ngôn ngữ dễ hiểu, chờ confirm rồi mới cho Planner tiếp tục.

---

## Ngưỡng "significant enough to escalate"

Tự hỏi: **"Nếu tôi chọn sai cái này, user có phải làm lại không?"**

- Nếu có → escalate
- Nếu không → tự quyết
