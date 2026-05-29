# Technical Plan - Gold 1, Sprint 1

## Sprint Scope

Sprint 1 se xac lap boundary ro rang cho 3 capability `admin`, `chat`, `automation`, dong thoi tao khung cau truc moi trong repo de cac sprint sau co the di chuyen code vao dung cho ma khong doi behavior he thong.

Sprint nay khong rework sau business logic, khong rewrite runtime core, va khong xoa code admin/chat trung lap khi chua hoan tat inventory.

## Architecture Decisions

| Decision | Chosen Approach | Rationale |
|----------|-----------------|-----------|
| Source of truth tam thoi cho admin UI | Giu `backend/src/admin` | Admin la be mat van hanh, tach khoi chat app se ro trach nhiem hon |
| Chat app ownership | `frontend` tap trung cho chat | Giam viec admin tiep tuc lon len trong chat shell |
| Automation boundary | Tao khung `automation` trong backend ngay Sprint 1 | Mo duong cho sprint API tich hop `n8n` |
| Reorg depth | Uu tien boundary va inventory, han che doi behavior | Giam rui ro regression o he thong dang chay |

## File / Module Breakdown

| File | Action | Description |
|------|--------|-------------|
| `gold_1_reorg_platform/reorg/analysis.md` or `reorg/analysis.md` | CREATE or UPDATE | Ghi ket qua inventory va boundary hien trang |
| `reorg/migration_plan.md` | CREATE | Liet ke cac buoc di chuyen an toan cho Sprint 2+ |
| `frontend/src/app/` | CREATE | Dat shell va route layer moi cho chat app |
| `frontend/src/features/` | CREATE | Tao khung feature-oriented cho chat/accounts/realtime/auth |
| `frontend/src/shared/` | CREATE | Tao khung cho api/ui/lib/types dung chung |
| `backend/src/http/routes/admin/` | CREATE | Dat route admin ro rang |
| `backend/src/http/routes/chat/` | CREATE | Dat route chat ro rang |
| `backend/src/http/routes/automation/` | CREATE | Placeholder route cho automation API |
| `backend/src/services/admin/` | CREATE | Boundary service admin |
| `backend/src/services/chat/` | CREATE | Boundary service chat |
| `backend/src/services/automation/` | CREATE | Boundary service automation |
| `backend/src/domain/automation/` | CREATE | Cho dat model/use-case automation |
| `docs/integrations/` | CREATE if needed | Cho dat tai lieu integration `n8n` sau nay |

## Implementation Sequence

1. Ghi lai inventory va boundary hien trang thanh tai lieu REORG chinh thuc.
2. Tao `reorg/migration_plan.md` cho nhung sprint tiep theo.
3. Tao khung folder moi ben frontend theo `app`, `features`, `shared`.
4. Tao khung folder moi ben backend theo `http/routes/*`, `services/*`, `domain/automation`.
5. Neu can, them file README nho trong cac khu vuc moi de giai thich purpose.
6. Khong di chuyen code business lon trong Sprint 1 tru khi can toi thieu de tranh conflict cau truc.

## Dependencies & Risks

- Dependency: Can ton trong cac flow chat/realtime dang hoat dong
- Dependency: Admin flow hien co co the dang nam o ca `frontend` va `backend/src/admin`
- Risk: Tao khung moi qua rong se thanh boilerplate -> Mitigation: chi tao muc toi thieu can cho sprint sau
- Risk: Doi ten/di chuyen file som gay vo import -> Mitigation: Sprint 1 chi dung boundary scaffolding + tai lieu
- Risk: Team tiep tuc viet code moi vao cho cu -> Mitigation: Ghi ro proposal va migration plan trong repo

## Out of Scope (this sprint)

- Tach sau `frontend/src/App.tsx`
- Tach sau `backend/src/server/routes/accounts.ts`
- Rewrite runtime core
- Xoa archive/legacy
- Implement full automation API
