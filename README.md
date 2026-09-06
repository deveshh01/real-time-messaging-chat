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
- **Framework:** Next.js 14 (App Router, React 18)
- **Styling:** Tailwind CSS, Lucide React Icons
- **Real-Time Client:** Socket.IO Client
- **Language:** TypeScript

### Backend
- **Runtime:** Node.js (Standalone HTTP + Socket.IO Server)
- **Database ORM:** Prisma ORM
- **Database:** PostgreSQL (Neon Serverless / Local Docker)
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
