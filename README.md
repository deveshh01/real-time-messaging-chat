# 💬 Real-Time Messaging Chat

A modern, full-stack real-time messaging platform built with **Next.js 14**, **Node.js**, **Socket.IO**, **Prisma ORM**, and **PostgreSQL**. Features instant bidirectional communication, Google OAuth, media sharing, GIF integration, and automated image moderation.

---

## 🚀 Live Demo

- 🌐 **Web Application:** [https://devchat-frontend-9jse.onrender.com](https://devchat-frontend-9jse.onrender.com)
- ⚙️ **Backend Service:** Hosted on Render with persistent WebSockets
- 🗄️ **Database:** Cloud Serverless PostgreSQL on Neon

---

## ✨ Features

- **⚡ Instant Real-Time Chat:** Low-latency bidirectional messaging powered by Socket.IO.
- **🔐 Flexible Authentication:**
  - Traditional secure credentials (Argon2 password hashing & HTTP-only JWT sessions).
  - Social login via **Google OAuth 2.0**.
- **🟢 Presence & Activity:** Real-time online/offline status indicators and message delivery/read receipts.
- **📷 Media & File Sharing:** Secure upload handling for images and attachments.
- **🎉 Rich Reactions & GIFs:** Direct Giphy API integration for inline GIF search and sending.
- **🛡️ Automated Content Moderation:** Built-in NSFW and image content moderation powered by Sightengine.
- **⏱️ Spam Protection:** Endpoint rate limiting on authentication, messaging, and uploads.
- **🎨 Responsive UI:** Clean, polished design crafted with Next.js App Router and Tailwind CSS.

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** [Next.js 14](https://nextjs.org/) (App Router, React 18)
- **Styling:** Tailwind CSS, Lucide React Icons
- **Real-Time Client:** Socket.IO Client
- **Language:** TypeScript

### Backend
- **Runtime:** Node.js (Standalone HTTP + Socket.IO Server)
- **Database ORM:** [Prisma ORM](https://www.prisma.io/)
- **Database:** PostgreSQL (Neon / Local Docker)
- **Security:** Argon2, Jose (JWT), Custom Rate Limiting
- **Third-Party Services:** Google OAuth 2.0, Giphy API, Sightengine

---

## 📂 Project Structure

This repository is structured as an **npm monorepo workspace**:

```text
real-time-messaging-chat/
├── frontend/                # Next.js frontend application
│   ├── app/                 # App router pages (chat, login, etc.)
│   ├── components/          # Reusable UI & chat components
│   ├── hooks/               # Custom hooks (e.g., useChat)
│   ├── lib/                 # Socket & API client utilities
│   └── types/               # Frontend DTOs and Socket event types
├── backend/                 # Standalone backend server
│   ├── prisma/              # Prisma schema & seed scripts
│   ├── routes/              # Modular REST API routes (/api/*)
│   ├── server/              # HTTP router, server init & Socket.IO handlers
│   └── src/                 # Business logic, services & database client
├── package.json             # Root monorepo workspace orchestrator
└── README.md
```

---

## 💻 Local Development Setup

### 1. Clone & Install
```bash
git clone https://github.com/deveshh01/real-time-messaging-chat.git
cd real-time-messaging-chat

# Install dependencies for both frontend and backend
npm install
```

### 2. Environment Variables

Create `backend/.env`:
```env
PORT=3001
NODE_ENV=development
APP_ORIGIN=http://localhost:3000

# Database
DATABASE_URL="postgresql://chat:chat@localhost:5440/chat?schema=public"

# Auth Secrets
AUTH_SECRET="your-32-byte-secret-key"
SESSION_TTL_SECONDS=604800

# File Uploads
STORAGE_DRIVER=local
UPLOAD_DIR=./data/uploads

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

### 3. Database Setup & Seed
```bash
# Push schema to database
npm run db:push --workspace=backend

# Seed test users (alice / bob)
npm run db:seed --workspace=backend
```

### 4. Run Development Servers
Open two terminal windows:

```bash
# Terminal 1: Start Backend (Port 3001)
npm run dev:backend

# Terminal 2: Start Frontend (Port 3000)
npm run dev:frontend
```

Navigate to `http://localhost:3000` in your browser.

> **Default Seed Accounts:**
> - `alice` / `password123`
> - `bob` / `password123`

---

## 🧪 Testing & Verification

```bash
# Run unit & integration tests
npm run test --workspace=backend

# Run TypeScript checks across workspaces
npm run typecheck:frontend
npm run typecheck:backend
```

---

## 🌐 Production Deployment (Render)

- **Frontend Configuration:**
  - Build Command: `npm install && npm run build --workspace=frontend`
  - Start Command: `npm run start --workspace=frontend`
- **Backend Configuration:**
  - Build Command: `npm install && npx prisma@5 db push && npm run build`
  - Start Command: `npm run start`
- **Database:** Serverless PostgreSQL on [Neon](https://neon.tech).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
