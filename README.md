# Real-Time Chat App — Simple README

A 1-to-1 real-time chat app with messaging, image sharing, moderation, and security. Simple to use, solid underneath.

Demo login: alice / password123 and bob / password123

## What it does

- Real-time text, image, GIF, and sticker messages
- Delivered/read receipts, typing indicator, online status
- No lost or duplicate messages, even if the connection drops
- Loads old chat history fast, even with 10,000+ messages
- Auto-blocks bad language and inappropriate images
- Secure file uploads
- Server always checks login and permissions, never trusts the client
- Rate limiting to stop spam

## How it's built

One Node.js server handles everything — the web pages, the API, and the real-time chat (Socket.IO). All the actual logic lives in one shared place, so the API and the real-time system always behave the same way. No microservices, no extra complexity — just what this app actually needs.

Tech used: Next.js, TypeScript, Socket.IO, PostgreSQL + Prisma, JWT login, zod for validation, nsfwjs for image checks, and local/S3 storage.

## Database, in short

- Users, Conversations, and Messages are the core tables
- Instead of saving a "read receipt" for every single message, it just tracks one number per user showing how far they've read — keeps things lightweight

## How messaging works

1. You hit send — it shows up instantly on your screen
2. It's sent to the server (through the socket, or a normal API call if the socket is down)
3. Server checks your login, your permission, and the message content
4. It's saved, then delivered to the other person
5. Status updates: sending → sent → delivered → read (or failed, with a retry option)

If your connection drops, it reconnects automatically and fetches anything you missed — no duplicates, nothing lost.

Each message has a unique ID, so even if it's sent twice by accident, the database only keeps one copy.

## Loading old messages

Old messages load in pages as you scroll up, instead of loading everything at once — so it stays fast no matter how long the chat history is.

## Image moderation

Every uploaded image is scanned on the server before it's allowed through. If it fails the check — or if the checker itself breaks for some reason — the image gets rejected. It never gets approved by accident. (This was actually a bug before: if the check crashed, the image would silently get approved. That's fixed now.)

There are backup options if the main image-checking tool can't be installed — one that checks via an online service, and one that's for testing only and shouldn't be used for real.

## Bad language filter

Checked on the server, not just on-screen. It catches common tricks like swapping letters for numbers, adding spaces, or repeating letters — while still allowing normal words like "class" or "assist" through.

## Upload security

- File size is limited
- The real file type is checked, not just its label
- Uploaded files get a new server-generated name
- Images are kept private and only shown through an authorized link

## Login & permissions

You can log in with email/password or Google. Either way, you get a secure cookie that only the server can read or verify — the app never trusts anything the client claims about who's logged in.

Every action — reading a chat, sending a message, opening an image — checks that you're actually part of that conversation. So changing an ID in a request can't get you into someone else's chat.

## Running it locally

```
npm install
cp .env.example .env
docker compose up -d db
npm run db:push
npm run db:seed
npm run dev
```

Then open two browsers and log in as alice and bob to try it out.

## Testing

```
npm test
node scripts/rt-test.mjs
```

To test with a big chat history: `npm run db:seed:load`

## Known limitations

- Runs on a single server for now — scaling to multiple servers needs Redis
- The bad-language filter is basic, not bulletproof
- S3 storage support exists but isn't the default — local storage is what's fully tested

## Review summary

Everything was checked by tracing through the code carefully (no live server available while reviewing):

- Image moderation — fixed a bug where failed checks used to silently approve images; now they're rejected
- Message reliability — no issues found, duplicates and dropped messages are both handled correctly
- Performance — pagination and queries are efficient, no problems found
- Security — no vulnerabilities found, permission checks are in place everywhere

Please still run `npm test` and try it locally yourself to confirm everything works end to end.
