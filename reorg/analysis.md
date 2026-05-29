# REORG Analysis

## Top-level Structure Overview

Repo hien tai co cac khu vuc lon sau:

- `backend/`: backend chinh, runtime, route, persistence, admin UI nhung trong backend
- `frontend/`: chat web app chinh
- `archived/`: code va tai lieu lich su
- `data/`: runtime state va media
- `logs/`: runtime logs
- root docs/scripts: `README.md`, `ARCHITECTURE.md`, `DEPLOY.md`, `deploy.sh`, `start-backend.sh`

He thong hien tai dang van hanh nhu mot workspace nhieu be mat, nhung cau truc repo chua the hien ro rang dieu do.

## Key REORG Problems Ranked By Severity

### 1. Admin UI dang bi tach doi giua hai be mat

- `backend/src/admin/*`
- `frontend` cung dang co mot phan admin flow

Day la van de lon nhat vi no tao duplicate source of truth cho auth, account management, va system operations.

### 2. Frontend chat dang co mot orchestration hotspot lon

- `frontend/src/App.tsx` dang om nhieu concern: shell, route, realtime, unread/read-state, bootstrap, admin entry

Dieu nay lam kho them sprint moi ma khong dan them logic vao cung mot noi.

### 3. Backend route layer dang om qua nhieu orchestration

- `backend/src/server/routes/accounts.ts` la diem nong chinh

Route, business flow, va realtime broadcast chua duoc tach thanh boundary ro rang.

### 4. Chua co boundary rieng cho automation capability

Repo chua co cho dat ro rang cho:

- webhook
- outbound API send
- inbound event
- token/auth model cho external integration
- audit cho automation flow

Day la khoang trong kien truc can duoc tao ngay de phuc vu sprint API `n8n` tiep theo.

### 5. Runtime artifacts va scripts dang lam source tree nhieu nhieu

`data/`, `logs/`, `dist/`, va script placement chua ro purpose lam giam do ro cua code active.

## Probable Hotspots

### Frontend

- `frontend/src/App.tsx`
- `frontend/src/api.ts`
- `frontend/src/useWebSocket.ts`
- `frontend/src/stores/chat-store.ts`
- `frontend/src/pages/AdminPage.tsx`

### Backend

- `backend/src/server/routes/accounts.ts`
- `backend/src/server/index.ts`
- `backend/src/core/runtime/index.ts`
- `backend/src/core/runtime/listener.ts`
- `backend/src/core/store/conversation-repo.ts`
- `backend/src/core/store/message-repo.ts`
- `backend/src/admin/*`

## Chosen Direction

Direction da duoc chot voi user:

- `backend/src/admin` la source of truth tam thoi cho admin UI
- `frontend` duoc xem la chat app chinh
- tao boundary `automation` trong backend ngay tu Gold-1 / Sprint 1
- chua dong vao runtime core neu khong can

## Recommended Target Structure

### Frontend

```text
frontend/src/
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
```

### Backend

```text
backend/src/
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
  realtime/
  persistence/
  legacy/
  admin/
```

## Risks And Tradeoffs

- Tach admin/chat sai thu tu co the lam source of truth tiep tuc mo ho
- Tach frontend qua nhanh co the gay vo import va flow runtime
- Tach backend route/service ma dong vao runtime core cung luc se de gay regression
- Tao automation placeholders qua da co the thanh boilerplate

## Sprint 1 Focus

Sprint 1 chi lam:

- tai lieu hoa direction REORG
- tao migration plan
- tao boundary scaffolding toi thieu

Sprint 1 khong lam:

- rewrite luong chat
- rewrite runtime core
- xoa admin flow trung lap khi chua doi chieu xong
- build full automation API
