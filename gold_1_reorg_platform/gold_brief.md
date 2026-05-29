# Gold Brief - Gold 1: Reorganize Platform For Chat, Admin, And Automation

## Muc tieu

Tai to chuc codebase hien tai de du an co the phat trien tiep theo huong platform ro rang, khong con tinh trang chat, admin, va logic tich hop chong cheo nhau.

Gold-1 khong nham them tinh nang lon cho nguoi dung cuoi. Gold nay nham tao nen sach de cac gold/sprint sau co the trien khai:

- API tich hop `n8n`
- webhook nhan su kien tin nhan
- gui tin qua automation flow
- quan ly token/quyen truy cap
- audit va van hanh he thong

## Ket qua cuoi (Definition of Done)

- [ ] Repo duoc to chuc lai theo 3 capability ro rang: `admin`, `chat`, `automation`
- [ ] Xac dinh va khoa `backend/src/admin` la source of truth tam thoi cho admin UI
- [ ] `frontend` duoc lam ro la chat app, khong tiep tuc la noi phat trien admin flow chinh
- [ ] Backend co boundary ro cho `automation` de chuan bi sprint API tiep theo
- [ ] Frontend duoc tach dan khoi `App.tsx` theo huong feature-oriented
- [ ] Backend route layer duoc tach dan khoi orchestration de de them API moi
- [ ] Khong co regression ro rang o cac flow chat chinh: load conversation, realtime, unread/read-state, send message
- [ ] Co tai lieu REORG du ro de cac sprint sau bam vao ma khong roi lai

## Tech Constraints

- Language/Framework: Backend Node.js + Express + WebSocket + Knex, Frontend React + Vite + TypeScript
- Existing modules lien quan: `frontend/src/App.tsx`, `frontend/src/api.ts`, `frontend/src/stores/chat-store.ts`, `backend/src/server/routes/accounts.ts`, `backend/src/core/runtime/*`, `backend/src/admin/*`
- Khong duoc dung vao runtime core neu khong can thiet cho boundary moi

## Sensitive Areas (can user confirm truoc khi Planner quyet dinh)

- Bat ky thay doi nao lam doi behavior chat runtime
- Bat ky quyet dinh xoa hoan toan mot admin flow ma chua doi chieu xong
- Bat ky thay doi auth/access model de phuc vu automation API

## Sprint Breakdown (du kien)

- Sprint 1: Inventory admin/chat/automation boundaries + tao khung cau truc moi
- Sprint 2: Tach frontend chat theo feature, giam vai tro `frontend/src/App.tsx`
- Sprint 3: Tach backend route/service theo capability chat/admin/automation
- Sprint 4: Tao foundation cho automation API phuc vu `n8n`
