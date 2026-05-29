# REORG Migration Plan

## Muc tieu

Thuc hien REORG theo tung buoc an toan, uu tien bao toan behavior he thong hien tai trong khi mo duong cho cac sprint/gold tiep theo.

## Migration Principles

- Khong vua di chuyen cau truc vua doi business logic trong cung mot buoc lon
- Tuan thu 3 capability da chot: `admin`, `chat`, `automation`
- `backend/src/admin` la source of truth tam thoi cho admin UI
- Moi code moi lien quan toi integration tu dong hoa phai di vao boundary `automation`

## Phase 1 - Documentation And Scaffolding

### Actions

- Tao `reorg/analysis.md`
- Tao `reorg/proposal.md`
- Tao `reorg/migration_plan.md`
- Tao khung frontend: `app`, `features`, `shared`
- Tao khung backend: `http/routes/*`, `services/*`, `domain/automation`

### Expected Outcome

- Team co direction ro rang
- Sprint sau biet dat code moi vao dau
- Chua anh huong code path dang chay

## Phase 2 - Frontend Chat Reorg

### Actions

- Tach `frontend/src/App.tsx` thanh route layer, shell layer, va feature hooks
- Dua code chat vao `features/chat`
- Dua account-related UI/chat ownership vao `features/accounts`
- Dua realtime vao `features/realtime`
- Dua utilities va contracts vao `shared/*`

### Manual Review Required

- Mappings giua component cu va feature moi
- Admin-related code con song trong `frontend`
- Cac import cycle neu co

## Phase 3 - Backend Capability Split

### Actions

- Tach route chat tu `backend/src/server/routes/accounts.ts` sang `backend/src/http/routes/chat`
- Tach route admin lien quan sang `backend/src/http/routes/admin`
- Tao `backend/src/http/routes/automation`
- Dua orchestration sang `backend/src/services/*`

### Manual Review Required

- Noi nao dang broadcast websocket truc tiep trong route
- Noi nao dang goi runtime core truc tiep
- Cac flow nhay cam: unread, sync, send message, reconnect

## Phase 4 - Admin Consolidation

### Actions

- Inventory day du admin flows o `frontend` va `backend/src/admin`
- Dan dan ngung phat trien admin trong `frontend`
- Neu can, dat marker/comment hoac tai lieu chi ro admin source of truth

### Manual Review Required

- Feature parity giua hai be mat
- Cac link/route user dang su dung
- Bat ky auth flow nao co the dang phu thuoc vao frontend chat

## Phase 5 - Automation API Foundation

### Actions

- Dinh nghia route dau tien cho automation
- Xac dinh auth model cho external caller
- Dat audit va event boundary cho receive/send flow
- Chuan bi tai lieu integration `n8n`

### Manual Review Required

- Security model cho token/API key
- Event schema cho inbound/outbound automation
- Scope API can mo trong sprint tiep theo

## Rollback Guidance

- Neu scaffold moi gay nham lan, co the xoa folder rong ma khong anh huong business logic
- Neu bat dau di chuyen code o sprint sau, rollback theo tung phase, khong gop nhieu capability vao mot commit lon
- Moi phase reorg nen duoc commit rieng de de truy vet

## Success Criteria

- Sprint sau co the bat dau tren cau truc ro rang
- Khong tiep tuc dat code moi vao hotspot cu theo thoi quen
- Capability `automation` co cho dung de khoi dong API `n8n`
