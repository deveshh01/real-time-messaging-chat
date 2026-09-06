# 💬 Real-Time Messaging Chat

A high-performance, full-stack real-time messaging platform built with **Next.js 14**, **Node.js**, **Socket.IO**, **Prisma ORM**, and **PostgreSQL**. Features instant bidirectional communication, Google OAuth, media sharing, GIF reactions, and automated image moderation.

---

## 🚀 Live Demo

- 🌐 **Web Application:** [https://devchat-frontend-9jse.onrender.com](https://devchat-frontend-9jse.onrender.com)
- ⚙️ **Backend Service:** Hosted on Render with persistent WebSockets
- 🗄️ **Database:** Cloud Serverless PostgreSQL on Neon

---

## 🏗️ Architecture Notes

The application uses an **npm workspaces monorepo** architecture, cleanly separating frontend UI delivery from real-time backend orchestration.

```text
real-time-messaging-chat/
├── frontend/                # Next.js 14 App Router UI (SSR / Dynamic Client)
│   ├── app/                 # Routing (/login, /chat, etc.)
│   ├── components/          # Atomic and compound chat UI components
│   ├── hooks/               # State hooks (e.g., useChat, useSocket)
│   ├── lib/                 # Socket client & API fetch wrappers
│   └── types/                # Self-contained frontend DTOs & socket events
├── backend/                 # Standalone Node.js HTTP + Socket.IO server
│   ├── prisma/               # Prisma schema, migrations & seed scripts
│   ├── routes/               # RESTful API route handlers (/api/auth, /api/conversations)
│   ├── server/                # Native HTTP request router & Socket.IO handlers
│   └── src/                   # Services (auth, messaging, upload, moderation)
├── package.json              # Monorepo root workspace orchestrator
└── README.md
```

### Data Flow & Communication Lifecycle

1. **Authentication** — User authenticates via username/password or Google OAuth 2.0. On verification, an HTTP-only, `SameSite` secure JWT session cookie (`rc_session`) is issued.
2. **WebSocket Handshake** — The frontend Socket.IO client initiates a handshake with the backend. The backend inspects the session cookie, resolves the user identity from PostgreSQL, and joins the socket to a private user room (`user:{userId}`).
3. **Messaging Flow** — Messages sent from the client are validated via Zod, persisted via Prisma to PostgreSQL, and broadcast to all participants' active socket connections in real time.
4. **Presence Management** — An in-memory presence tracker monitors socket connections/disconnections, emitting status transitions (`user:online`, `user:offline`) to mutual contacts.

---

## 💡 Key Technical Decisions

| Decision | Chosen Solution | Rationale & Trade-offs |
|---|---|---|
| Decoupled Backend | Standalone Node.js HTTP + Socket.IO | Next.js serverless functions do not maintain persistent stateful WebSocket connections. Running a separate Node.js server guarantees continuous bi-directional socket streams. |
| Monorepo Layout | npm Workspaces | Keeps shared contracts and schema definitions accessible in a single repository while isolating deployable environments and dependencies. |
| Authentication Strategy | HTTP-only JWT Cookie (`jose` + Argon2) | Prevents XSS token exfiltration compared to `localStorage`. `jose` provides lightweight, standards-compliant JWT verification without heavyweight dependencies. |
| Real-Time Engine | Socket.IO | Provides automatic fallback (long polling), room-based pub/sub broadcasting, and resilient reconnection logic out-of-the-box. |
| Database & ORM | PostgreSQL + Prisma ORM | Relational integrity for conversations, participants, and foreign key cascades. Prisma ensures end-to-end compile-time type safety. |
| Content Moderation | Sightengine API + Async Pipeline | Uploaded images undergo automated NSFW/graphic content classification before persistence, preventing malicious or policy-violating media distribution. |
| Rate Limiting | In-Memory Sliding Window | Prevents brute-force attacks and abuse across authentication endpoints and message broadcasting. |

---

## ✨ Features

- ⚡ **Instant Real-Time Messaging** — Sub-100ms message delivery with Socket.IO
- 🟢 **Presence & Receipts** — Live online/offline presence tracking, delivered checkmarks, and read receipts
- 🔐 **Secure Dual Auth** — Username/Password (Argon2 hashing) and Google OAuth 2.0
- 📷 **Media Uploads** — Multi-format image and attachment support with MIME validation
- 🎉 **Giphy Integration** — Direct in-chat GIF search and inline animated message rendering
- 🛡️ **Content Moderation** — Automated NSFW inspection for user-uploaded media
- ⏱️ **Spam Protection** — Rate-limited authentication and conversation endpoints
- 🎨 **Responsive Design** — Tailored for both desktop and mobile layouts using Tailwind CSS

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 14, React 18, Tailwind CSS, Lucide React, Socket.IO Client, TypeScript
- **Backend:** Node.js, Socket.IO, Prisma ORM, Argon2, Jose (JWT), Zod, TypeScript
- **Database:** PostgreSQL (Cloud Neon / Local Docker)
- **Third-Party APIs:** Google OAuth 2.0, Giphy API, Sightengine Moderation

---

## 💻 Setup Instructions

### Prerequisites

- Node.js: v20.x or higher
- npm: v10.x or higher
- PostgreSQL: Local installation or Docker

### 1. Clone the Repository

```bash
git clone https://github.com/deveshh01/real-time-messaging-chat.git
cd real-time-messaging-chat
```

### 2. Install Dependencies

Install all workspace dependencies from the root directory:

```bash
npm install
```

### 3. Configure Environment Variables

Create `backend/.env`:

```env
PORT=3001
NODE_ENV=development
APP_ORIGIN=http://localhost:3000

# Database
DATABASE_URL="postgresql://chat:chat@localhost:5440/chat?schema=public"

# Authentication
AUTH_SECRET="8f3a1c9d2e7b4560af91d3c8e5f2a7b9c4d6e8f1a3b5c7d9e0f2a4b6c8d0e2f4"
SESSION_TTL_SECONDS=604800

# Media Uploads
STORAGE_DRIVER=local
UPLOAD_DIR=./data/uploads
MAX_UPLOAD_BYTES=8388608
ALLOWED_IMAGE_MIME=image/jpeg,image/png,image/webp,image/gif

# External Integrations (Optional)
GIF_PROVIDER=giphy
GIF_API_KEY=your_giphy_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### 4. Database Setup & Seeding

```bash
# Push schema migrations to the database
npm run db:push --workspace=backend

# Seed demo users (alice / bob)
npm run db:seed --workspace=backend
```

### 5. Run Development Servers

Run backend and frontend concurrently in two separate terminal tabs:

```bash
# Terminal 1: Backend Server (runs on port 3001)
npm run dev:backend
```

```bash
# Terminal 2: Frontend App (runs on port 3000)
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Default Demo Credentials:**

| Username | Password |
|---|---|
| `alice` | `password123` |
| `bob` | `password123` |

---

## 🧪 Testing & Verification

```bash
# Run backend test suite (Vitest)
npm run test --workspace=backend

# Validate TypeScript type consistency across workspaces
npm run typecheck:frontend
npm run typecheck:backend
```

---

## 🌐 Production Deployment (Render)

### Frontend (Render Web Service)

- **Root Directory:** *(leave blank)*
- **Build Command:** `npm install && npm run build --workspace=frontend`
- **Start Command:** `npm run start --workspace=frontend`
- **Env Vars:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`

### Backend (Render Web Service)

- **Root Directory:** `backend`
- **Build Command:** `npm install && npx prisma@5 db push && npm run build`
- **Start Command:** `npm run start`
- **Env Vars:** `DATABASE_URL` (Neon PostgreSQL), `APP_ORIGIN`, `AUTH_SECRET`, etc.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
