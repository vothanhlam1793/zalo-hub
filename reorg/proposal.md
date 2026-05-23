## Proposed Structure

Muc tieu cua sprint REORG dau tien la chuan bi repo cho viec phat trien tiep theo theo 3 capability ro rang:

- `admin`: quan ly user, account, session dang nhap, van hanh he thong
- `chat`: giao dien hoi thoai, realtime, conversation, message, attachment
- `automation`: API va integration cho n8n va cac he thong tu dong hoa nhan/gui tin

Quyet dinh da chot:

- Giai doan chuyen tiep: `backend/src/admin` la source of truth cho admin UI
- Backend duoc phep tao khung `automation` ngay trong sprint REORG dau tien
- Muc tieu sprint: giam roi de vao cac sprint/gold moi, khong uu tien doi hanh vi nguoi dung
- Archive/legacy khong la trong tam cua sprint nay, chi can quan ly duoc

### Target Structure

Day la cau truc dich de huong toi. Sprint dau tien khong can dat duoc toan bo, nhung moi thay doi nen di theo huong nay.

```text
frontend/                     # chat-web
  src/
    app/
    features/
      chat/
      accounts/
      realtime/
      auth/
    shared/
      api/
      ui/
      lib/
      types/

backend/
  src/
    bootstrap/
    http/
      routes/
        admin/
        chat/
        automation/
      middleware/
    services/
      admin/
      chat/
      automation/
    domain/
      accounts/
      auth/
      conversations/
      messages/
      automation/
    integrations/
      zalo/
      storage/
    realtime/
    persistence/
    legacy/
    admin/                    # source of truth tam thoi cho admin UI

docs/
  architecture/
  integrations/
  ops/

reorg/
  proposal.md
  migration_plan.md
  analysis.md
```

## Changes Explained

### 1. Chat UI va Admin UI duoc tach theo capability

- FROM: `frontend` dang vua co chat, vua co mot phan admin
- TO: `frontend` tap trung vao chat; `backend/src/admin` tiep tuc la goc admin trong giai doan chuyen tiep
- WHY: Chat va admin co muc tieu san pham khac nhau. Tiep tuc de chung se lam roi sprint sau, nhat la khi them integration `n8n`
- RISK: Co the dang ton tai mot so flow admin o `frontend` chua duoc doi chieu day du

### 2. Frontend duoc doi tu folder theo kieu ky thuat sang feature-oriented

- FROM: `frontend/src/App.tsx` va cac component/store/api dang om nhieu concern
- TO: `frontend/src/app`, `frontend/src/features/*`, `frontend/src/shared/*`
- WHY: Giam do phinh cua `App.tsx`, de them sprint moi ma khong tiep tuc don logic vao mot entrypoint
- RISK: Di chuyen file co the gay vo import neu lam qua rong trong mot sprint

### 3. Backend duoc tach route theo capability

- FROM: route layer lon, nhat la `backend/src/server/routes/accounts.ts`, vua nhan request vua dieu phoi nghiep vu va broadcast
- TO: `http/routes/chat`, `http/routes/admin`, `http/routes/automation` va `services/*`
- WHY: Chuan bi nen cho API-first, dac biet cho automation va n8n
- RISK: Neu vua tach file vua sua logic runtime trong cung sprint se de gay regression

### 4. Tao boundary rieng cho automation

- FROM: chua co cho ro rang de dat webhook, API token, outbound send, inbound event, audit
- TO: `domain/automation`, `services/automation`, `http/routes/automation`
- WHY: Day la huong phat trien tiep theo cua du an, can cho dat logic ro truoc khi viet tinh nang
- RISK: Neu tao qua nhieu placeholder khong can thiet se tang boilerplate

### 5. Legacy va archive khong dua vao trung tam sprint dau

- FROM: archive/legacy dang ton tai gan code active
- TO: tam thoi giu nguyen, chi tranh de logic moi tiep tuc phu thuoc vao no
- WHY: Uu tien sprint nay la mo duong cho chat/admin/automation, khong phai don dep lich su
- RISK: Engineer van co the tiep tuc tham chieu code cu neu khong dat boundary ro

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Admin logic bi chia doi giua `frontend` va `backend/src/admin` | High | Lap inventory cac man hinh/flow admin truoc khi di chuyen |
| Tach `frontend/src/App.tsx` gay vo flow chat/realtime | High | Chi tach theo shell/feature, khong doi behavior trong sprint dau |
| Tach backend route lam anh huong unread/send/realtime | High | Tach route -> service truoc, khong cham sau vao runtime core |
| Tao khung automation qua som dan toi boilerplate | Medium | Chi tao boundary va module toi thieu can cho sprint API tiep theo |
| Legacy/compatibility tiep tuc len vao code moi | Medium | Dua code moi vao capability moi, khong them logic moi vao khu vuc legacy |

## If You Don't Refactor

Neu khong REORG bay gio:

- Sprint tiep theo de roi vao tinh trang them API automation bang cach chen vao route/chat flow hien co
- Admin va chat se tiep tuc dan vao nhau, kho biet dau la source of truth
- `frontend/src/App.tsx` va backend route lon se tiep tuc la diem xung dot khi them tinh nang moi
- Viec tich hop `n8n` co nguy co tro thanh patchwork thay vi thanh capability rieng

## Phased Approach

### Phase 1: Inventory + boundaries (safe, low risk)

- Liet ke toan bo flow admin hien co o `frontend` va `backend/src/admin`
- Xac dinh man hinh nao con song, man hinh nao se bo
- Xac dinh boundary cho 3 capability: `admin`, `chat`, `automation`
- Tao khung folder moi cho frontend feature-oriented va backend capability-oriented

### Phase 2: Frontend chat reorg (medium risk)

- Tach `frontend/src/App.tsx` thanh:
  - `app/`
  - shell desktop/mobile
  - route layer
  - feature hooks cho chat/accounts/realtime
- Di chuyen `api`, `types`, `stores`, `components` vao `features/*` va `shared/*`
- Khong doi hanh vi UI

### Phase 3: Backend route/service split (medium risk)

- Tach `accounts.ts` thanh route nho hon theo capability chat
- Dua orchestration sang `services/chat/*`
- Tao `http/routes/automation` va `services/automation` o muc toi thieu
- Chua dong vao runtime core tru khi can noi adapter

### Phase 4: Admin consolidation preparation (medium to high risk)

- Dat `backend/src/admin` la source of truth tam thoi
- Loai bo dan cac admin flow trung lap ben `frontend`
- Ghi ro target dai han: co the tach thanh `admin-web` rieng khi can

### Phase 5: Optional deeper backend cleanup (high risk, later sprint)

- Sau khi route/service on dinh, moi xem xet tach sau `runtime`, `listener`, va persistence hotspot
- Phase nay khong thuoc sprint REORG dau tien
