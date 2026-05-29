# Test Key - Gold 1, Sprint 1

## Test Cases

### TC-01: Gold tai lieu duoc tao day du (Weight: 25%)
- **Input**: Kiem tra thu muc `gold_1_reorg_platform/` va cac file sprint 1
- **Expected Output**: Co `gold_brief.md`, `sprint_1/plan.md`, `sprint_1/test_key.md`
- **Pass Criteria**: Tat ca file ton tai va noi dung phan anh dung scope Gold-1/Sprint-1

### TC-02: REORG proposal va migration direction nhat quan (Weight: 25%)
- **Input**: Doc `reorg/proposal.md` va `plan.md`
- **Expected Output**: Cung mot huong capability-based cho `admin`, `chat`, `automation`
- **Pass Criteria**: Khong mau thuan ve source of truth admin, frontend ownership, hay automation boundary

### TC-03: Cau truc muc tieu mo duong cho sprint sau (Weight: 20%)
- **Input**: Xem cac thu muc khung moi duoc de xuat/tao ra
- **Expected Output**: Co cho dat ro rang cho frontend chat va backend automation/admin/chat
- **Pass Criteria**: Team co the biet noi dat code moi o sprint sau ma khong can doan

### TC-04: Khong doi behavior he thong dang chay (Weight: 15%)
- **Input**: Kiem tra pham vi Sprint 1
- **Expected Output**: Sprint 1 chu yeu la tai lieu + scaffolding, khong rewrite luong chat/runtime
- **Pass Criteria**: Khong co thay doi business logic chat/realtime ngoai y muon

### TC-05: Scope du ro de vao execution (Weight: 15%)
- **Input**: Doc `plan.md`
- **Expected Output**: Implementation sequence ro, risk ro, out-of-scope ro
- **Pass Criteria**: Coder co the bat dau Sprint 1 ma khong can hoi lai ve pham vi co ban

## Scoring Summary

| TC | Name | Weight |
|----|------|--------|
| 01 | Gold documents created | 25% |
| 02 | Proposal consistency | 25% |
| 03 | Target structure readiness | 20% |
| 04 | No behavior change intent | 15% |
| 05 | Execution clarity | 15% |
| **Total** |  | **100%** |

## Out of Scope for Testing (this sprint)

- End-to-end chat runtime testing
- Automation API functional testing
- Admin UI parity testing giua `frontend` va `backend/src/admin`
