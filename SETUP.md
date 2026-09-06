# Running Real-Time Chat on another device

## Prerequisites (install on the target machine)

- **Node.js 20+** and npm (`node -v` should be ≥ 20)
- **Docker + Docker Compose** (for PostgreSQL) — or an existing PostgreSQL 14+
- **Internet access** for the first run (npm install, and the NSFW model download
  on the first image upload)

## Steps

```bash
# 1. Unzip and enter the folder
unzip devesh.zip && cd devesh

# 2. Install dependencies  (rebuilds native modules for THIS machine)
npm install

# 3. Create your environment file and set a strong secret
cp .env.example .env
#   - set AUTH_SECRET to a long random string, e.g.:
#     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   - (optional) add GIF_API_KEY, GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

# 4. Start PostgreSQL
docker compose up -d db          # exposes Postgres on host port 5440

# 5. Create tables + demo users (alice/bob, password: password123)
npm run db:push
npm run db:seed

# 6. Run it
npm run dev                      # http://localhost:3000
```

Open two separate browsers (or one normal + one incognito) and sign in as
`alice` and `bob` to see real-time messaging.

## Important notes

- **Do NOT copy `node_modules` between machines.** `argon2` and
  `@tensorflow/tfjs-node` are compiled native modules; always run `npm install`
  fresh on the target OS/CPU. (The zip excludes `node_modules` for this reason.)
- **`.env` is not in the zip** (it holds secrets). Recreate it from
  `.env.example`. `AUTH_SECRET` and `DATABASE_URL` are the only required values.
- **Port 5440:** `docker-compose.yml` maps Postgres to host port **5440** (5432
  was already in use on the original machine). `.env`'s `DATABASE_URL` already
  points at 5440 — keep them matching. If 5432 is free on the new machine you may
  change both to 5432, but it's not required.
- **Docker must be running** before `docker compose up`. To use an existing
  Postgres instead, skip step 4 and point `DATABASE_URL` at your database.
- **Offline / no internet for the ML model?** Set
  `MODERATION_IMAGE_PROVIDER=heuristic` in `.env` — uploads still work (type/size
  validated) but nudity detection is disabled. With internet, keep the default
  `nsfwjs`; the model downloads once on the first upload.
- **Production run:** `npm run build` then `npm run start` (uses the custom server,
  which includes Socket.IO — do not use `next start`).

## Quick troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` on start | `.env` missing `AUTH_SECRET`/`DATABASE_URL` |
| Can't connect to DB | Docker not running, or `DATABASE_URL` port ≠ compose port |
| `npm install` fails on argon2/tfjs | ensure build tools exist (`python3`, `make`, a C++ compiler); on Debian/Ubuntu: `sudo apt-get install -y build-essential python3` |
| Port 3000 in use | set `PORT=3001` (and `APP_ORIGIN=http://localhost:3001`) in `.env` |
| GIF picker says "not configured" | add `GIF_API_KEY` (Tenor or Giphy) to `.env` |
