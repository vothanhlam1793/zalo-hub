# Technical Plan - Gold 1, Sprint 2

## Sprint Scope

Sprint 2 se bat dau frontend-first reorg. Muc tieu la tach `frontend/src/App.tsx` thanh cac khoi ro rang hon theo `app`, `features`, `shared`, dong thoi giu nguyen behavior nguoi dung thay duoc.

Sprint nay tap trung vao chat app. Admin-related UI con ton tai trong `frontend` se duoc tach khoi luong chinh cua chat app nhung chua xoa.

## Architecture Decisions

| Decision | Chosen Approach | Rationale |
|----------|-----------------|-----------|
| Reorg order | Frontend-first | Giam hotspot ro nhat truoc khi dong vao backend runtime va automation API |
| App shell ownership | Tao `app/` de chua shell va route orchestration | Giam do phinh cua `App.tsx` |
| Feature split | Tach theo `chat`, `accounts`, `realtime` | Theo capability da chot trong Gold-1 |
| Shared code | Dua utility/API/types chung vao `shared/*` khi phu hop | Tranh de feature folders chua utility khong dung domain |
| Admin-related frontend code | Giu lai nhung khong de lam trung tam phat trien | Tranh xoa som gay regression |

## File / Module Breakdown

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/App.tsx` | MODIFY | Giam vai tro orchestration, dua bot logic sang modules moi |
| `frontend/src/app/` | MODIFY | Them shell, route, va app entry helpers |
| `frontend/src/features/chat/` | MODIFY | Dat chat-centric UI/logic tach ra tu `App.tsx` neu phu hop |
| `frontend/src/features/accounts/` | MODIFY | Dat account selection / account-specific flow tach ra tu `App.tsx` neu phu hop |
| `frontend/src/features/realtime/` | MODIFY | Dat logic websocket/realtime wrapper tach ra tu `App.tsx` neu phu hop |
| `frontend/src/shared/api/` | MODIFY if needed | Dat wrapper/exports chung cho API layer |
| `frontend/src/shared/types/` | MODIFY if needed | Dat type exports dung chung |
| `frontend/src/pages/*` | MODIFY if needed | Dieu chinh import neu route layer doi |

## Implementation Sequence

1. Doc `frontend/src/App.tsx` va xac dinh cac concern co the tach an toan ma khong doi behavior.
2. Tao module app-level dau tien de giam logic bo cuc va shell khoi `App.tsx`.
3. Tach mot so helper/component orchestration sang `features/chat`, `features/accounts`, hoac `features/realtime` tuy theo concern.
4. Cap nhat `App.tsx` thanh mot entrypoint gon hon, uu tien composition hon la giu toan bo logic tai cho.
5. Giu admin-related code trong frontend o trang thai hoat dong duoc, nhung khong mo rong them vai tro cua no.
6. Build frontend de xac nhan khong vo compile/import.

## Dependencies & Risks

- Dependency: `frontend/src/App.tsx` la hotspot dang chua nhieu flow dang chay
- Dependency: `useWebSocket.ts`, `chat-store.ts`, `api.ts`, va cac pages/components lien quan co the rang buoc chat che
- Risk: Tach qua nhieu trong 1 sprint lam vo behavior -> Mitigation: chi tach cac khoi orchestration ro rang, tranh rewrite logic nghiep vu
- Risk: Admin-related code trong frontend bi anh huong giat day -> Mitigation: tranh xoa flow, chi giam su phu thuoc vao shell chinh
- Risk: Realtime flow vo do import/state -> Mitigation: build va kiem tra route/chat shell sau moi cum thay doi

## Out of Scope (this sprint)

- Backend route/service reorg
- Automation API implementation
- Xoa hoan toan admin-related UI khoi frontend
- Rewrite chat store hoac websocket flow tu dau
