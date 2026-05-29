# Test Key - Gold 1, Sprint 2

## Test Cases

### TC-01: App entry giam do phinh va van compile (Weight: 25%)
- **Input**: So sanh `frontend/src/App.tsx` truoc va sau thay doi, chay frontend build
- **Expected Output**: `App.tsx` gon hon hoac co it nhat mot phan orchestration duoc tach ra module moi, build thanh cong
- **Pass Criteria**: Frontend compile duoc va `App.tsx` khong chi tang them logic moi

### TC-02: Feature boundaries duoc bat dau su dung (Weight: 20%)
- **Input**: Kiem tra `frontend/src/app`, `frontend/src/features/*`, `frontend/src/shared/*`
- **Expected Output**: Co module that su duoc su dung, khong chi la folder rong
- **Pass Criteria**: It nhat mot phan logic hoac composition duoc dua vao khu vuc moi dung capability

### TC-03: Chat behavior khong bi thay doi ngoai y muon (Weight: 25%)
- **Input**: Build app va review code path chat shell chinh
- **Expected Output**: Route/app shell/chat bootstrap van nhat quan voi behavior cu
- **Pass Criteria**: Khong co dau hieu vo compile, vo import, hoac doi flow ro rang trong code review

### TC-04: Admin-related frontend code khong bi xoa vo toi va (Weight: 15%)
- **Input**: Kiem tra cac file admin-related lien quan trong frontend
- **Expected Output**: Van ton tai va van co cho dung, nhung khong tiep tuc lam trung tam trong app shell moi
- **Pass Criteria**: Khong gay mat flow do xoa/bo nham

### TC-05: Sprint giu dung scope frontend-first (Weight: 15%)
- **Input**: Review diff cua Sprint 2
- **Expected Output**: Khong co drift sang backend reorg hoac automation implementation
- **Pass Criteria**: Thay doi tap trung vao frontend organization

## Scoring Summary

| TC | Name | Weight |
|----|------|--------|
| 01 | App entry reduced and builds | 25% |
| 02 | Feature boundaries used | 20% |
| 03 | Chat behavior preserved | 25% |
| 04 | Admin frontend not broken | 15% |
| 05 | Frontend-first scope maintained | 15% |
| **Total** |  | **100%** |

## Out of Scope for Testing (this sprint)

- Backend automation routes
- End-to-end websocket runtime validation voi live data
- Full admin feature parity audit
