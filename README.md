# Zalo Hub

Nền tảng chat Zalo đa người dùng, đa tài khoản.

## Cấu trúc

```
zalohub/
├── backend/          Backend server + admin panel
│   ├── src/
│   │   ├── core/     Zalo runtime: login, send/receive, sync
│   │   ├── server/   Express API + WebSocket + auth
│   │   └── admin/    Admin SPA (React)
│   ├── db/           Knex migrations (PostgreSQL)
│   ├── docker-compose.yml
│   └── package.json
│
├── frontend/         Chat React app
│   ├── src/
│   │   ├── components/  MiniSidebar, ChatPanel, MessageBubble...
│   │   ├── pages/       LoginPage, AdminPage
│   │   ├── hooks/       useWebSocket, useMessageCache...
│   │   └── stores/      Zustand: auth, workspace, chat, composer
│   ├── package.json
│   └── vite.config.ts
│
├── data/             Database + media (volume ra ngoài)
├── logs/             Server logs
│
└── archived/
    └── v1-monolith/  Source monolith cũ (giữ để tham khảo)
```

## Kiến trúc

Xem [ARCHITECTURE.md](./ARCHITECTURE.md) để hiểu luồng dữ liệu và cách các thành phần kết nối.

## Triển khai

Xem [DEPLOY.md](./DEPLOY.md) để biết cách cài đặt, chạy development, và deploy production.

## Phân quyền

| Role       | Chat | Xem phân quyền | Sửa phân quyền | Thêm user | Chuyển master |
|------------|------|----------------|----------------|-----------|---------------|
| **master** | ✅   | ✅             | ✅             | ✅        | ✅            |
| **admin**  | ✅   | ✅             | ✅             | ✅        | ❌            |
| **editor** | ✅   | ✅             | ❌             | ❌        | ❌            |
| **viewer** | ✅   | ✅             | ❌             | ❌        | ❌            |

- **Mỗi Zalo account có 1 Master** (người tạo/đăng nhập QR đầu tiên)
- **Super admin** quản lý user hệ thống, không tự động là master của account nào
- **Admin page** (`/admin`): thêm tài khoản QR, phân quyền, transfer master

## Tech Stack

| Layer      | Công nghệ                          |
|------------|------------------------------------|
| Backend    | Node.js 22+, Express, WebSocket    |
| Database   | PostgreSQL (Knex migrations)       |
| Media      | MinIO (S3-compatible)              |
| Frontend   | React 19, Vite, Tailwind CSS 4     |
| State      | Zustand                            |
| UI         | Radix UI + shadcn                  |
| Auth       | JWT + bcrypt (scryptSync)          |
| Deploy     | Docker Compose + Nginx             |
