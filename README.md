# Real-Time Chat — Real-Time Messaging Module

A production-oriented one-to-one messaging module built to demonstrate real-time
communication, media handling, server-side moderation, reliability, and security
— with a clean, minimal UI. The guiding principle is **"simple on the surface,
strong underneath."**

> Demo accounts (after seeding): `alice / password123` and `bob / password123`.

---

## 1. Project overview

Real-Time Chat is a modular monolith: a single Next.js process serves the SSR pages, the
REST API, **and** the Socket.IO real-time layer. Business logic lives in a shared
service layer used identically by REST routes and socket handlers, so there is no
duplicated logic and no transport-dependent behavior.

Core capabilities:

- Real-time 1:1 messaging (text, images, GIFs, stickers)
- Delivery / read receipts, typing indicators, online-offline presence, unread counts
- Reliable message lifecycle: optimistic send → server ack → broadcast, with
  idempotency and reconnection reconciliation
- Cursor-based pagination for 10k+ message histories
- Server-side profanity moderation and in-process image (NSFW) moderation
- Secure uploads with content-type sniffing and private, authorized media delivery
- Authentication (JWT cookie) + authorization (membership) enforced server-side
- Configurable rate limiting on sensitive endpoints

## 2. Architecture

```
                    ┌─────────────────────────── Browser ───────────────────────────┐
                    │  React (Next.js app router)                                     │
                    │  components → hooks/useChat → apiClient (REST) + socket.io-client│
                    └───────────────┬──────────────────────────┬─────────────────────┘
                                    │ HTTPS (REST)              │ WebSocket
                    ┌───────────────▼──────────────────────────▼─────────────────────┐
                    │  Custom Node server (server/index.ts)                           │
                    │   ├─ Next.js request handler  (app/api/* route handlers)        │
                    │   └─ Socket.IO server         (server/socket/* handlers)        │
                    │            │                              │                      │
                    │            └──────────┬───────────────────┘                     │
                    │              services/ (single source of business logic)        │
                    │   messageService · conversationService · readService            │
                    │   uploadService · authService · presenceService · moderation/*  │
                    │            │                                                     │
                    │        repositories/ + Prisma ──────────────► PostgreSQL        │
                    │        storage/ (local | s3)  ──────────────► object storage    │
                    │        moderation/image (nsfwjs + tfjs-node) ► in-process ML    │
                    └─────────────────────────────────────────────────────────────────┘
```

Why this shape: sharing one process lets a REST-sent message broadcast through the
same `io` instance, and lets socket handlers reuse the exact validation/moderation/
persistence path. It stays a **modular monolith** — no microservices, no message
bus, no Kubernetes — which is the right amount of infrastructure for this scope.

## 3. Technology choices

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) + custom server | SSR + REST + sockets in one process |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | Type safety end-to-end |
| Real-time | Socket.IO | Rooms, acks, auto-reconnect, transport fallback |
| DB / ORM | PostgreSQL + Prisma | Relational integrity, indexes, typed queries |
| Auth | `jose` (HS256 JWT) in an httpOnly cookie + `argon2id` | Stateless, server-authoritative identity |
| Validation | `zod` | One schema validates REST bodies and socket payloads |
| Image moderation | `nsfwjs` + `@tensorflow/tfjs-node` | Runs locally, no external API/key needed |
| File type check | `file-type` (magic bytes) | Never trust client MIME/extension |
| Storage | Local disk (dev) / S3-R2 driver | Private media, pluggable |

## 4. Project structure

```
server/                 Custom server + real-time layer
  index.ts              HTTP server: Next + Socket.IO bootstrap
  loadEnv.ts            Dependency-free .env loader (runs before anything)
  socket/
    io.ts               Typed io singleton + room helpers
    auth.ts             Handshake authentication (cookie → user)
    registerHandlers.ts Event wiring (thin; delegates to services)
    broadcast.ts        Fan-out helpers (usable from REST too)
    dispatch.ts         Shared "after a message is created" fan-out

src/
  lib/                  env (zod), logger, errors, rateLimiter
  shared/               DTOs + typed socket event contracts (client+server)
  server/
    auth/               password (argon2), session (jwt/cookie), context
    db/prisma.ts        Prisma client singleton
    repositories/       messageRepo (idempotent create, cursor pagination)
    services/           messageService, conversationService, readService,
                        uploadService, authService, presenceService, serialize,
                        authz, gifService, moderation/{profanity,normalize,image}
    storage/            storage interface + local + s3 drivers
    http/respond.ts     Route wrapper: consistent JSON errors + body parsing

app/                    Next.js app router (pages + REST route handlers)
components/chat/        UI components (Sidebar, MessageList, Composer, pickers…)
hooks/useChat.ts        Client state: socket lifecycle, optimistic send, sync
lib/                    apiClient, socket factory, format helpers, sticker pack
prisma/                 schema.prisma + seed.ts
tests/                  vitest unit tests
scripts/rt-test.mjs     Headless end-to-end real-time test (two sockets)
```

## 5. Database schema

Models (see `prisma/schema.prisma`):

- **User** — credentials (`argon2` hash), profile, `lastSeenAt`.
- **Conversation** — `isGroup` flag (1:1 today, groups are a natural extension),
  `updatedAt` bumped on each message for cheap sidebar ordering.
- **ConversationMember** — join table with `@@unique([conversationId, userId])`.
  Holds `lastReadSeq` and `lastDeliveredSeq` watermarks.
- **Message** — `seq` (autoincrement ordering key), `type`, `body`, optional
  `attachmentId`, and `clientId` for idempotency.
- **Attachment** — `IMAGE` (private `storageKey`) or `GIF`/`STICKER` (external
  `url`), plus `moderationStatus`, `moderationScore`, `moderationReason`.

**Key design decision — no per-message receipts.** Read/delivery state is derived
from the *other* member's `lastReadSeq` / `lastDeliveredSeq` watermarks in O(1),
instead of writing a receipt row per message per user. This keeps writes cheap and
the schema small even for 10k+ message conversations.

## 6. Real-time architecture

Typed contracts live in `src/shared/socketEvents.ts`.

Client → server: `conversation:join`, `conversation:leave`, `message:send`,
`message:read`, `typing:start`, `typing:stop`, `sync:since`.

Server → client: `message:new`, `message:status` (delivered/read),
`typing:update`, `presence:update`, `conversation:bump`.

- Every socket authenticates from the **httpOnly cookie** on the handshake
  (`server/socket/auth.ts`); the client never holds a token.
- Each user joins a personal room `user:{id}`; broadcasts target user rooms so
  **all of a user's tabs/devices** receive events.
- Conversation actions verify membership via the same `assertMembership` used by
  REST — a socket cannot act on a conversation it doesn't belong to.
- Handlers are thin: they rate-limit, call a service, and fan out. All business
  logic is in the service layer.

## 7. Message lifecycle

```
client generates clientId (uuid) ─► optimistic bubble (status: sending)
   │
   ├─ socket connected ─► emit message:send (12s ack timeout)
   └─ socket down      ─► POST /conversations/:id/messages   (same service, idempotent)
        │
        ▼  messageService.sendMessage(senderId, payload)
        authenticate (server identity) → authorize (membership)
        → validate (zod) → moderate (profanity / approved-image check)
        → persist idempotently → return DTO
        │
        ├─ ack to sender  (optimistic bubble reconciled to real id, status: sent)
        └─ broadcast message:new to participants' user rooms
             └─ if recipient online → markDelivered → message:status(delivered) to sender
             └─ recipient viewing   → message:read  → message:status(read) to sender
```

Message states: **sending → sent → delivered → read**, plus **failed** (with a
retry action). A message is never shown as sent before the server has persisted it.

## 8. Reconnection strategy

Socket.IO reconnects automatically with capped backoff. On `connect` the client
does **not** reload the app; instead it:

1. re-joins the active conversation room,
2. emits `sync:since { afterSeq: <max real seq it holds> }` and appends any
   messages it missed (deduplicated), and
3. re-marks read and refreshes the conversation list (presence/unread).

Because sends are idempotent and the client tracks known ids/clientIds, reconnect
never produces duplicates or loses already-accepted messages. A subtle
connection banner ("Reconnecting…" / "offline") appears when not connected.

## 9. Idempotency / duplicate prevention

- The client generates a `clientId` per message.
- `Message` has `@@unique([conversationId, senderId, clientId])` — the **database**
  is the real guard. Concurrent retries race into `create()`; the loser catches
  the unique violation (`P2002`) and returns the winning row.
- A fast pre-check short-circuits retries before any re-moderation or attachment
  creation, so retries never create orphan media rows.
- On the client, incoming `message:new` events are deduplicated by id/clientId, so
  the same event reaching multiple tabs renders once.

## 10. Pagination strategy

`GET /api/conversations/:id/messages?cursor=<seq>&limit=<n>` returns the newest
`limit` messages, then older pages via `cursor` (a `seq`). It uses
`WHERE seq < cursor ORDER BY seq DESC LIMIT n+1` on the `(conversationId, seq)`
index — **keyset pagination**, never `OFFSET`, so deep history stays O(limit).
The initial load fetches only the most recent page; scrolling up loads older
pages while the UI preserves scroll position (no jump).

## 11. Database indexes

| Index | Serves |
|---|---|
| `ConversationMember @@unique([conversationId, userId])` | membership/authorization lookups; prevents duplicate membership |
| `ConversationMember @@index([userId])` | "conversations for a user" (sidebar) |
| `Message @@index([conversationId, seq])` | message pagination + newest-message queries |
| `Message @@unique([conversationId, senderId, clientId])` | idempotency guard |
| `Conversation @@index([updatedAt])` | conversation list ordering |
| `Attachment @@index([ownerId])` | ownership checks |

No speculative indexes were added — each maps to a real query path above.

## 12. Image moderation

- **Model / service:** [NSFW.js](https://github.com/infinitered/nsfwjs) with the
  default **MobileNetV2** classifier.
- **Where inference runs:** in-process on the Node server via
  `@tensorflow/tfjs-node` (CPU). No image bytes leave the server.
- **Approximate size:** MobileNetV2 quantized model ≈ a few MB, loaded once and
  memoized.
- **Expected latency:** ~1–1.5 s per image on a typical CPU including decode
  (measured ~1.4 s locally; the first call also pays a one-time model load).
- **Threshold / decision rule:** reject when
  `porn + hentai + 0.5·sexy ≥ MODERATION_NSFW_THRESHOLD` (default `0.6`). "sexy"
  is down-weighted because it fires on swimwear/fitness imagery.
- **Failure behavior — FAIL CLOSED (fixed):** an explicit rejection (score over
  threshold) returns 422 `MODERATION_IMAGE` ("Image could not be sent because
  it failed moderation") and stores a `REJECTED` audit row with no bytes.
  Separately, if the moderation *check itself* cannot complete — the
  `nsfwjs`/`tfjs-node` engine fails to load, throws mid-inference, or does not
  finish within `MODERATION_TIMEOUT_MS` (default 10s) — the upload is **also
  rejected**, with a distinct 503 `MODERATION_UNAVAILABLE` ("moderation is
  temporarily unavailable ... please try again shortly") and a `FAILED` audit
  row. **The image is never approved just because the check couldn't run.**
  This was the actual Point 3 bug reported: the previous implementation treated
  an engine failure as "approve automatically" (fail-open). Because `nsfwjs`
  and `@tensorflow/tfjs-node` are native, optional dependencies, they routinely
  fail to install/load in Docker, CI, and network-restricted environments —
  which meant real deployments could silently stop moderating altogether while
  looking like they still worked. This is fixed: see
  `src/server/services/moderation/image/index.ts` (`moderateImage`) and
  `tests/imageModeration.test.ts`.
- **Sync vs async:** **synchronous.** The upload endpoint only succeeds for a safe
  image, and its returned `attachmentId` is the *only* capability to attach an
  image to a message — so moderation cannot be bypassed by calling the message API
  directly. (For very high throughput this could move to async "pending →
  approved" without changing the data model, since `Attachment.moderationStatus`
  already exists.)
- **`MODERATION_IMAGE_PROVIDER=sightengine`:** a second **real** detection
  option that needs no native compilation at all — a plain HTTPS POST to
  Sightengine's nudity-2.1 model
  (`src/server/services/moderation/image/sightengineProvider.ts`), same
  decision-rule shape as nsfwjs. Use this if `nsfwjs`/`@tensorflow/tfjs-node`
  won't install in your environment (native modules are fragile: OS/Node/glibc
  mismatches, or a postinstall step that downloads a prebuilt binary from a
  CDN some networks block). Sign up for a free API user/secret at
  https://dashboard.sightengine.com and set `SIGHTENGINE_API_USER` /
  `SIGHTENGINE_API_SECRET` + `MODERATION_IMAGE_PROVIDER=sightengine`. Adds
  network latency per upload (a remote API call) instead of nsfwjs's in-process
  inference, and images leave the server to be checked (see their privacy
  policy) — trade-offs to weigh against "it just works without native builds."
- **`MODERATION_IMAGE_PROVIDER=heuristic`:** an explicit, opt-in, **no-ML**
  placeholder for a throwaway dev box with no ML engine at all. It approves
  every image and does **not** perform real nudity detection — it logs a loud
  warning on every call and must never be used for anything graded or real. It
  is *not* an automatic fallback: a runtime failure of the configured `nsfwjs`
  provider does not switch to this provider — it fails closed as described
  above.

## 13. Profanity moderation

Enforced server-side in `messageService` (never client-only). Pipeline
(`moderation/normalize.ts` + `moderation/profanity.ts`):

1. Unicode NFKC fold, strip diacritics, lowercase.
2. Map common leet substitutions (`0→o`, `1→i`, `4→a`, `$→s`, …).
3. Remove non-letters (defeats spaces/punctuation/zero-width tricks).
4. Collapse repeated letters (`shiiit → shit`).
5. Match per token **and** against the allowlist-filtered dense string (defeats
   `b i t c h` spacing bypass). An allowlist (`class`, `pass`, `assist`, …)
   prevents the classic "Scunthorpe" false positives.

The word strategy is behind a `WordStrategy` interface, so the list can move to a
DB/config/remote service **without touching the messaging code**. Blocked messages
return a 422 with a generic reason (internal match details are logged only).

## 14. Upload security

- Authenticated + rate-limited endpoint.
- Size capped (declared `Content-Length` early check + real byte check).
- **Real content type** sniffed from magic bytes (`file-type`); only
  `ALLOWED_IMAGE_MIME` types pass. Declared MIME/extension are never trusted.
- **Server-generated object keys** (`images/{ownerId}/{random}.{ext}`) — the client
  filename never influences the storage path (no traversal).
- Bytes are stored **privately** and served only through the authorized attachment
  route.

## 15. Object storage strategy

`StorageDriver` abstracts storage. The **local** driver (dev default) writes under
`UPLOAD_DIR` (outside the web root) and streams bytes back only via the authorized
`/api/attachments/:id` route. The **S3/R2** driver is a typed, documented stub;
enabling it (add `@aws-sdk/client-s3`, set `STORAGE_DRIVER=s3` + `S3_*`) unlocks the
production pattern: authenticate → authorize → issue a short-lived signed PUT URL
restricted by content-type/size → client uploads **directly** to object storage
(bypassing the app server for large bodies) → server moderates the stored object
before marking it `APPROVED`. No call sites change because everything is written
against the interface.

## 16. Rate limiting

Configurable fixed-window limiter (`src/lib/rateLimiter.ts`) applied to message
sends, uploads, GIF search, and auth endpoints (per user, or per IP for auth).
Returns `429` with `retryAfterMs`. Limits come from `RL_*` env vars. Single-instance
in-memory today; swap for a Redis counter behind the same `consume()` interface for
multi-instance deployments.

## 17. Authentication

Two sign-in methods, both resulting in the **same session cookie**:

- **Email/username + password** — hashed with **argon2id**.
- **Google OAuth 2.0** — a manual authorization-code flow (no NextAuth):
  `/api/auth/google` sets a CSRF `state` cookie and redirects to Google;
  `/api/auth/google/callback` verifies the state, exchanges the code for tokens,
  fetches the verified profile, and find-or-creates the user (linking by
  `googleId`, then by email — so an existing password account can also use Google).
  The client secret never leaves the server; unverified Google emails are rejected.
  The "Continue with Google" button only appears when `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` are configured (exposed via `/api/auth/providers`).

Both paths issue an HS256 JWT stored in an **httpOnly, SameSite=Lax** cookie
(`secure` in production). The server derives identity *only* from the verified
cookie — REST via `getAuthUser()`, sockets via the handshake middleware. Clients
cannot read or forge the token, and cannot send as another user by editing a
payload. Google-only accounts have a null `passwordHash` and cannot be
password-logged-in.

## 18. Authorization

`assertMembership(userId, conversationId)` is the single authorization gate, called
by every conversation-touching REST route and socket event. Reading a conversation,
sending, marking read, and fetching an attachment all verify membership, so
changing an id in a request cannot access someone else's data (**no IDOR**).
Attachments are served only if `APPROVED` **and** the requester is a member (or the
owner, for a pre-send preview).

## 19. Security considerations

- Server-authoritative identity and authorization (REST + WebSocket).
- IDOR prevention on conversations, messages, and media.
- Uploads: size + magic-byte type validation, server-generated keys, private storage.
- Unmoderated/unsafe images are never persisted or exposed.
- Profanity enforced server-side and resistant to simple bypasses.
- All external input validated with zod; unknown fields ignored (no mass assignment).
- Rate limiting on sensitive endpoints.
- Errors return typed, non-leaking payloads; stack traces never reach clients.
- `poweredByHeader` disabled; secrets only in env; `.env` git-ignored.

## 20. Performance considerations

- Keyset pagination + `(conversationId, seq)` index; no `OFFSET`.
- O(1) read/delivery state via watermarks (no receipt-row fan-out).
- Conversation list uses a single `updatedAt`-ordered query with one bundled
  last-message per row (no N+1 on messages).
- Client: memoized message bubbles, lazy-loaded media, debounced GIF/user search,
  throttled typing events, scroll-position preservation, and DOM that grows only
  as the user scrolls (pages of 30).
- Prisma client is a singleton; the NSFW model is loaded once and memoized.

## 21. Local setup

**Prerequisites:** Node 20+, Docker (for Postgres) or an existing PostgreSQL.

```bash
npm install
cp .env.example .env          # then set a strong AUTH_SECRET
docker compose up -d db       # Postgres on host port 5440 (avoids clashing 5432)
npm run db:push               # create tables
npm run db:seed               # demo users alice/bob (password123)
npm run dev                   # http://localhost:3000
```

Open two different browsers (or a normal + incognito window) and sign in as
`alice` and `bob` to see real-time messaging between two accounts.

## 22. Environment variables

See `.env.example` for the full annotated list. Highlights: `DATABASE_URL`,
`AUTH_SECRET` (required), `STORAGE_DRIVER` + `UPLOAD_DIR`/`S3_*`,
`MAX_UPLOAD_BYTES`, `ALLOWED_IMAGE_MIME`, `MODERATION_IMAGE_PROVIDER`,
`MODERATION_NSFW_THRESHOLD`, `MODERATION_TIMEOUT_MS` (moderation fails
*closed*, i.e. is rejected, if it doesn't finish in time), `GIF_PROVIDER` + `GIF_API_KEY`,
`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (optional; enable Google sign-in with
redirect URI `<APP_ORIGIN>/api/auth/google/callback`), and the `RL_*` limits.

## 23. Running the project

```bash
npm run dev        # development (tsx watch, HMR)
npm run build      # production build of the Next app
npm run start      # run the custom server in production mode
```

## 24. Running tests

```bash
npm test                 # vitest unit tests (moderation, rate limiter, status derivation)
node scripts/rt-test.mjs # headless end-to-end real-time test (server must be running)
```

Unit tests cover text normalization, profanity blocking + bypass handling +
allowlist, rate-limiting windows, message read/delivery status derivation, and
**image-moderation fail-closed behavior** (`tests/imageModeration.test.ts` —
asserts an engine failure or timeout is never approved). The real-time script
drives two authenticated sockets and asserts connection, presence, delivery,
delivered/read receipts, typing, and idempotent resend.

### Verifying pagination against a large history (Point 6)

`prisma/seed.ts` only creates a handful of demo messages. To verify pagination
and query performance against a realistic 10,000+ message history:

```bash
npm run db:seed:load                  # creates ~12,000 messages (alice <-> bob)
MESSAGE_COUNT=25000 npm run db:seed:load
```

This is a dev-only script (refuses to run when `NODE_ENV=production`, and is
deliberately not wired into `prisma db seed`, so it can never run against a
shared/staging database by accident). After seeding, log in as alice/bob and
confirm the conversation opens instantly showing only the most recent page,
and that scrolling up smoothly fetches older pages via `GET
/api/conversations/:id/messages?cursor=...` without loading the full history.

## 24a. Note on how these changes were verified

The Point 3 fix, the new `tests/imageModeration.test.ts` test, and the audit of
Points 5/6/7 below were verified by **careful manual code tracing**, not by
executing `npm install` / `npm test` / `npm run build` in the environment that
produced this changeset — that environment has no outbound network access, so
dependencies (including the very `@tensorflow/tfjs-node` / `nsfwjs` packages at
the center of the Point 3 bug) could not be installed there. Please run the
commands in section 24 yourself after `npm install` to get an authoritative
pass/fail; do not treat this README as a substitute for that. See the Final
Audit section for exactly what is and isn't independently confirmed.

## 25. Deployment considerations

- Run the **custom server** (`npm run start`), not `next start` — the latter has no
  Socket.IO. Provide `DATABASE_URL`, `AUTH_SECRET`, and set `NODE_ENV=production`
  (enables `secure` cookies; terminate TLS at your proxy).
- Use `prisma migrate deploy` with committed migrations in production (this build
  uses `db push` for local speed).
- Move storage to S3/R2 (`STORAGE_DRIVER=s3`) and rate limiting to Redis for
  multiple instances; Socket.IO would then use the Redis adapter and presence a
  shared store — all behind the interfaces already in place.

## 26. Known trade-offs

- **Single-instance state.** Presence and rate limits are in-memory; horizontal
  scaling needs the Redis adapter/store noted above (interfaces are ready).
- **`seq` serialized as a JS number.** Safe well beyond realistic volumes; a
  string cursor would be needed only past `Number.MAX_SAFE_INTEGER`.
- **Profanity is deliberately lightweight.** It targets simple evasion; a
  determined adversary or nuanced context (e.g. "a bit cheesy") isn't the goal —
  the point is a clear, swappable pipeline, not a perfect classifier.
- **Message list isn't windowed with a virtualization library.** Pagination keeps
  the DOM small in practice; a `react-virtual` layer is a drop-in enhancement.
- **S3 driver is a stub** (documented) to keep the default install lean; local
  disk fully exercises the same interface and authorization path.
- **`db push` not migrations** for local convenience.

## External services / env that gate features

- **PostgreSQL** — required (Docker compose provided).
- **`AUTH_SECRET`** — required; generate a long random value.
- **GIF picker** — needs `GIF_API_KEY` (Tenor or Giphy). Without it the picker
  degrades gracefully and shows a "not configured" message; everything else works.
- **Image moderation** — works out of the box (in-process, no key), as long as
  the optional `@tensorflow/tfjs-node` + `nsfwjs` packages installed
  successfully (`npm install` installs them by default, but they are native
  modules and can fail to build in some environments — check the install log).
  **If they are not installed/loadable, uploads now fail closed**: every image
  upload is rejected with `MODERATION_UNAVAILABLE` rather than being silently
  approved. Run `node -e "require('@tensorflow/tfjs-node')"` after install to
  confirm the native engine loaded; if it throws, image uploads will not work
  at all until that's resolved (this is intentional — see section 12).

## 27. Final audit (this changeset)

**Environment note:** this audit was produced by manual code tracing in a
sandbox with no outbound network access, so `npm install` / `npm test` / `npm
run build` / `npm run lint` / `tsc --noEmit` could not actually be executed
here. Findings below are marked accordingly. Please run those commands
yourself (section 24) for an authoritative result — in particular, run
`npm test` to execute the new `tests/imageModeration.test.ts`.

### Point 3 — Image Upload & Nudity Detection: **FIXED (fail-open bug found and closed; a build-time issue was also found and fixed)**

- **Build-time fix (found after initial delivery):** if `@tensorflow/tfjs-node`
  fails to install (a native module — common on some OS/Node combinations),
  Next's webpack build previously **failed to compile at all** with `Module
  not found: Can't resolve '@tensorflow/tfjs-node'`, because webpack tried to
  statically resolve the dynamic `import()` in `nsfwProvider.ts` at build
  time. That's a much worse failure mode than intended (the whole app
  refusing to build, instead of just the moderation call failing closed at
  runtime). Fixed with a `/* webpackIgnore: true */` comment on both optional
  dynamic imports (`@tensorflow/tfjs-node`, `nsfwjs`) so webpack defers
  resolution to plain Node `require`/`import` at runtime, plus an ambient
  `src/types/optional-deps.d.ts` fallback so `tsc`/the build's type-check step
  doesn't separately fail with "Cannot find module ... or its corresponding
  type declarations" when the packages aren't installed. With this fix the
  app **builds and runs** regardless of whether the optional ML deps
  installed; only an actual image upload attempt exercises the fail-closed
  path if they didn't.

- **What I found:** the upload pipeline itself (magic-byte sniffing, size caps,
  private storage, synchronous moderation gate, `attachmentId`-as-capability
  design, authorized-only media route) was already solid. The actual bug: if
  the `nsfwjs`/`@tensorflow/tfjs-node` engine failed to load or threw at
  runtime, `moderateImage()` silently degraded to a heuristic provider that
  **approved every image**. Because those are native `optionalDependencies`
  that commonly fail to install in Docker/CI/restricted-network environments,
  this could make nudity detection silently do nothing while looking normal —
  matching the "not working correctly" symptom.
- **What I changed:** `moderateImage()` now fails **closed**. An engine
  failure or a timeout (new `MODERATION_TIMEOUT_MS`) returns a distinct
  `failed: true` result that is never treated as approved; `uploadService`
  responds with a new `MODERATION_UNAVAILABLE` (503) error and records a new
  `FAILED` `ModerationStatus` (added to the Prisma enum) for audit, storing no
  bytes. The heuristic no-ML provider is now explicit opt-in only
  (`MODERATION_IMAGE_PROVIDER=heuristic`), never an automatic fallback, and
  logs loudly on every call. Files touched: `src/server/services/moderation/
  image/{index,provider,heuristicProvider}.ts`, `src/server/services/
  uploadService.ts`, `src/lib/{env,errors}.ts`, `src/shared/types.ts`,
  `prisma/schema.prisma`, `.env.example`.
- **How I tested it:** added `tests/imageModeration.test.ts`, which injects a
  fake moderator via a test-only seam (`__setModeratorForTest`) and asserts (a)
  a throwing provider yields `approved:false, failed:true`, (b) a
  never-resolving provider yields the same after the configured timeout, and
  (c) a successful provider still returns its normal verdict unchanged. I
  traced the REST (`/api/upload`) and message-send (`resolveApprovedOwnedImage`
  in `messageService.ts`, which already rejects anything not `APPROVED`) paths
  by hand to confirm a `FAILED` or `REJECTED` attachment can never be attached
  to a message, and that the private attachment route
  (`/api/attachments/:id`) already 404s anything not `APPROVED`.
  **Not independently executed:** `npm test` itself (no network to install
  vitest/deps in this sandbox), and I could not exercise the real `nsfwjs`
  model against an actual explicit image (no model/network access here) — the
  scoring logic and threshold were not changed, only the failure path around
  them.

### Point 5 — Messaging Reliability: **PASS (reviewed, no changes needed)**

- **What I found:** idempotency is enforced by a real DB unique constraint
  (`Message @@unique([conversationId, senderId, clientId])`), not just an
  app-level check — concurrent retries race into `create()`, the loser catches
  `P2002` and reads the winning row (`messageRepo.createMessageIdempotent`).
  Reconnection replay is handled by a `sync:since` socket event that fetches
  everything after the client's last known real `seq`
  (`getMessagesAfter`/`registerHandlers.ts`), triggered on every `connect`
  (`hooks/useChat.ts`). The client dedupes by message id **and** clientId per
  conversation (`seenRef`), so a message arriving via optimistic UI, socket
  echo, REST fallback, and another tab all converge to one row. Multi-tab
  consistency comes from server fan-out to a per-user Socket.IO room
  (`userRoom(uid)`), so every open tab receives every event independently.
  REST send (`POST .../messages`) is a full fallback through the *same*
  `sendMessage()` service, so behavior is identical to the socket path when a
  socket is down.
- **What I changed:** nothing — this already meets the requirements.
- **How I tested it:** traced `messageRepo.ts`, `registerHandlers.ts`,
  `dispatch.ts`, `broadcast.ts`, and `hooks/useChat.ts` end to end for each of
  the 7 listed scenarios. `scripts/rt-test.mjs` already exercises two live
  authenticated sockets (connect, presence, delivered/read receipts, typing)
  against a running server. **Not independently executed:** I could not start
  Postgres/the dev server or run `scripts/rt-test.mjs` in this sandbox (no
  network/DB), so I did not personally observe live disconnect/reconnect or
  two-tab behavior — please run `node scripts/rt-test.mjs` yourself against a
  running server, and manually try the two-tab / airplane-mode scenarios in
  section "TEST EVERYTHING" of the assignment.

### Point 6 — Performance & Data Handling: **PASS (reviewed, added a large-history seed)**

- **What I found:** pagination is real cursor-based pagination on the
  `(conversationId, seq)` index (`getMessagePage`, `seq: { lt: cursor }`,
  never `OFFSET`), returns `hasMore`/`nextCursor`, and the frontend only
  loads older pages on scroll-up (`loadOlder` in `useChat.ts`). No N+1s found:
  `listConversations` batches per-conversation unread counts with
  `Promise.all` rather than sequential awaits, and message pages `include` the
  attachment in the same query. Indexes exist for every hot query path
  (documented in section 11 and matching the actual schema). Media uses
  `loading="lazy"` throughout. Large uploads go through a size-capped
  in-process endpoint rather than an unbounded body; a documented (stub) path
  to direct-to-object-storage uploads exists for when that matters at scale.
- **What I changed:** there was no existing way to verify pagination against
  a realistic 10,000+ message history (only ~4 demo messages are seeded), so
  I added `prisma/seedLoad.ts` (`npm run db:seed:load`, default 12,000
  messages, `MESSAGE_COUNT` env override, refuses to run in production, not
  wired into `prisma db seed` so it can't run by accident).
- **How I tested it:** traced `messageRepo.getMessagePage`/`getMessagesAfter`
  against the schema's indexes, and `listConversations`/`readService.ts` for
  N+1 patterns. **Not independently executed:** I do not have a database
  connection in this sandbox, so I could not actually run `db:seed:load`,
  inspect an `EXPLAIN ANALYZE` plan, or click through the scrolling UI against
  a live 10k+ message conversation. Please run `npm run db:seed:load` and
  manually verify scroll-up pagination and response latency yourself.

### Point 7 — Security Requirements: **PASS (reviewed, no vulnerabilities found)**

- **What I found:** `assertMembership(userId, conversationId)` is called
  before every conversation read/send/read-receipt/attachment-access
  operation, on both REST and socket layers, and is the single authorization
  gate (no per-route reimplementation to drift out of sync) — this is the
  IDOR defense. Identity always comes from a server-verified, httpOnly, signed
  (HS256) session cookie — `getAuthUser()`/`requireAuthUser()` for REST,
  `socketAuth()` reading the same cookie from the WebSocket handshake headers
  for sockets — never from a client-supplied `userId`/`senderId` in a body or
  query string, so sender impersonation isn't possible. File uploads validate
  real content via magic-byte sniffing (not client MIME/extension), enforce
  size limits, and store under server-generated keys (path-traversal-checked
  in `LocalStorageDriver.pathFor`) rather than the client filename. Rate
  limiting is applied to message send, upload, GIF search, and auth endpoints.
  Media access requires both `APPROVED` moderation status and conversation
  membership (or upload ownership for a pre-send preview), and 404s rather
  than 403s for anything not approved, so it doesn't even confirm existence of
  unmoderated content. WebSocket authorization is enforced per-event
  (`conversation:join` calls `assertMembership` before joining a room), not
  just at handshake.
- **What I changed:** nothing structural — no vulnerability was found in this
  review. (The Point 3 fail-open bug above is itself a Point 7-relevant fix,
  since "trusting a moderation result you never actually got" is a broken-
  authorization-adjacent issue; it's listed under Point 3 since that's its
  primary heading.)
- **How I tested it:** traced every REST route under `app/api/**` and every
  socket handler in `server/socket/registerHandlers.ts` for an auth check +
  membership check before touching conversation data; traced
  `conversationService.ts`/`gifService.ts` for query scoping and SSRF/host
  allowlisting. **Not independently executed:** I did not run live IDOR probes
  (e.g. an authenticated request with someone else's `conversationId`) against
  a running instance — no server/DB available in this sandbox. Please run the
  scenarios listed under "SECURITY" in the assignment's test list against a
  running instance to get an independently-observed pass.
