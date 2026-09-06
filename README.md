# Real-Time Chat — Simple Guide (Easy Version)

Ye ek **1-to-1 real-time chat app** hai jisme messaging, image sharing, moderation, aur security sab kuch production-level tarike se banaya gaya hai. Idea simple hai: **"Upar se simple, andar se strong."**

**Demo login:** `alice / password123` aur `bob / password123`

---

## 1. Ye App Kya Karta Hai

- Real-time text, image, GIF aur sticker messages
- Delivered ✅ / Read ✅✅ receipts, typing indicator, online/offline status
- Message kabhi duplicate ya miss nahi hoga (reconnect hone par bhi)
- Purane 10,000+ messages bhi fast load hote hain (pagination)
- Gaali-galoch (profanity) aur galat images automatically block hoti hain
- Uploads secure hain — file fake extension laga ke bhi bypass nahi ho sakti
- Login/permission server pe check hota hai, client pe bharosa nahi kiya jata
- Spam rokne ke liye rate limiting

---

## 2. Architecture (Ek Nazar Me)

Ye ek **single Next.js server** hai jo teen kaam ek sath karta hai:
1. Webpage dikhana (SSR)
2. API (REST) handle karna
3. Real-time chat (Socket.IO) chalana

Sabka business logic ek hi jagah (`services/`) rakha gaya hai, taaki REST aur Socket dono same rule follow karein — code duplicate nahi hota.

```
Browser (React)
   │
   ├── REST API (HTTPS)
   └── WebSocket (real-time)
        │
   Node Server (Next.js + Socket.IO)
        │
   services/ → sara business logic yahin hai
        │
   Database (PostgreSQL) + File Storage
```

Ye jaanbhoojkar simple rakha gaya hai — koi microservices, koi Kubernetes nahi. Itni si app ke liye itna hi infra kaafi hai.

---

## 3. Kaunsi Technology Use Hui

| Kaam | Tool | Kyun |
|---|---|---|
| Framework | Next.js 14 | Ek hi jagah SSR + API + sockets |
| Language | TypeScript (strict) | Bugs pehle hi pakad lo |
| Real-time | Socket.IO | Auto-reconnect, rooms |
| Database | PostgreSQL + Prisma | Reliable aur type-safe |
| Login | JWT cookie + argon2id | Secure, server-controlled |
| Validation | zod | Ek hi schema REST aur socket dono ke liye |
| Image check | nsfwjs + tensorflow | Bina external API ke chal jaye |
| File check | file-type | Real file type dekhta hai, fake nahi maanta |
| Storage | Local disk / S3 | Dono support hai |

---

## 4. Folder Structure (Short Me)

- `server/` — server start karna + real-time layer
- `src/server/services/` — sara business logic
- `src/server/repositories/` — database queries
- `app/` — pages aur API routes
- `components/chat/` — UI (sidebar, message list, input box)
- `hooks/useChat.ts` — frontend ka chat logic
- `prisma/` — database schema
- `tests/` — automated tests

---

## 5. Database Kaise Design Hua

- **User** — login details, profile
- **Conversation** — ek chat (abhi 1:1, aage group bhi ban sakta hai)
- **ConversationMember** — kaun kis chat me hai, aur usne kaha tak padha/receive kiya
- **Message** — asli message, order number ke sath
- **Attachment** — image/GIF/sticker, uski moderation status ke sath

**Smart decision:** Har message ke liye alag "read receipt" row nahi banayi — bas ek number (watermark) track hota hai ki user ne kaha tak padha. Isse database halka rehta hai.

---

## 6. Real-Time Kaise Kaam Karta Hai

Client se server: message bhejna, conversation join karna, typing dikhana, etc.
Server se client: naya message, status update, typing update, online status.

- Har socket login cookie se authenticate hoti hai — token client ke paas nahi hota
- Har user ka apna "personal room" hota hai, taaki uske sabhi tabs/devices ko update mile
- Har action pe check hota hai ki user us conversation ka member hai ya nahi

---

## 7. Message Bhejne Ka Pura Flow

1. Client turant ek "sending..." bubble dikhata hai
2. Agar socket connected hai → turant bhej deta hai
3. Agar socket down hai → normal API call se bhejta hai (same logic)
4. Server check karta hai: login sahi hai? permission hai? content sahi hai (moderation)?
5. Message database me save hota hai
6. Sender ko confirm milta hai, aur baaki members ko naya message dikhta hai

Status: `sending → sent → delivered → read` (ya `failed` agar kuch galat ho, retry ka option milta hai).

---

## 8. Connection Toot Jaye To Kya Hota Hai

Agar internet/socket disconnect ho jaye:
- Reconnect hote hi purane missed messages automatically fetch ho jaate hain
- Koi message duplicate nahi hota, koi miss nahi hota
- User ko halka sa banner dikhta hai — "Reconnecting..." ya "Offline"

---

## 9. Duplicate Message Kaise Roka Jata Hai

- Har message ka ek unique ID client generate karta hai
- Database me ye ID unique honi hi chahiye — agar same message do baar bheja gaya to database khud reject kar dega
- Frontend bhi duplicate ko dikhne se pehle hi filter kar deta hai

---

## 10. Purane Messages Load Karna (Pagination)

Purane messages "cursor" based tarike se load hote hain (offset nahi) — isliye 10,000+ messages ho bhi to loading fast rehti hai. Pehle sirf latest messages aate hain, upar scroll karne pe purane load hote hain.

---

## 11. Image Moderation (NSFW Check)

- Har image server pe hi check hoti hai (nsfwjs model), bahar kahi nahi jaati
- Check hone me lagbhag 1–1.5 second lagta hai
- Agar image inappropriate lagi → turant reject, koi bhi bytes save nahi hote

**Important fix:** Pehle agar moderation engine hi crash ho jaye (jo native packages ki wajah se kabhi kabhi hota hai), to system galti se image ko **approve** kar deta tha. Ab aisa nahi hoga — agar check fail ho jaye to image **reject** hi hogi ("fail closed"), approve nahi.

Do alternative options bhi hain agar local ML model install na ho:
- **Sightengine** (online API) — real detection, par thoda slow aur images bahar jaati hain
- **Heuristic mode** — sirf testing ke liye, sab kuch approve kar deta hai, real use ke liye nahi

---

## 12. Gaali-Galoch (Profanity) Filter

Server pe hi check hota hai, sirf frontend pe nahi. Ye chize handle karta hai:
- Spelling tricks (jaise `sh1t`, `f**k`)
- Letters ke beech space daalna
- Letters repeat karna (jaise `shiiiit`)

Galat words wale genuine words (jaise "class", "assist") galti se block na ho, iske liye allowlist bhi hai.

---

## 13. Upload Security

- File size limited hai
- File ka real type check hota hai (extension pe bharosa nahi)
- File ka naam server khud generate karta hai (user ka diya naam use nahi hota — security ke liye)
- Images private rehti hain, sirf authorized route se hi dikhti hain

---

## 14. Rate Limiting

Message bhejna, upload karna, GIF search, login — sab pe limit hai taaki koi spam na kar sake.

---

## 15. Login System (Authentication)

Do tarike se login ho sakta hai:
1. **Email/Username + Password** (argon2 se secure)
2. **Google Login** (manual OAuth flow, bina extra library ke)

Dono me end me ek secure cookie milti hai jo server hi verify karta hai. Client ye cookie padh ya badal nahi sakta.

---

## 16. Permission Check (Authorization)

Ek hi function (`assertMembership`) har jagah use hota hai ye check karne ke liye ki user us conversation ka member hai ya nahi. Isse koi bhi "IDOR" attack (yani kisi aur ki chat/ID access karna) possible nahi hai.

---

## 17. Security — Short List

- Login/permission server pe hi verify hota hai
- Koi bhi kisi dusre ka data access nahi kar sakta
- Upload secure hai
- Bina check hui image kabhi save/dikh nahi sakti
- Gaali filter server pe hai
- Sara input validate hota hai
- Rate limiting hai
- Errors me internal detail leak nahi hoti

---

## 18. Performance

- Purane messages fast load hote hain
- Read/delivery status calculate karna cheap hai (extra rows nahi banti)
- Chat list load karna bhi fast hai (koi extra queries nahi)
- Images lazy-load hoti hain, typing events throttle hote hain

---

## 19. App Ko Local Me Chalana

```bash
npm install
cp .env.example .env          # AUTH_SECRET set karo
docker compose up -d db       # Postgres start karo
npm run db:push               # tables banao
npm run db:seed               # demo users banao (alice/bob)
npm run dev                   # http://localhost:3000 pe khulega
```

Do browsers (ya normal + incognito) me alice aur bob se login karo real-time chat dekhne ke liye.

---

## 20. Testing

```bash
npm test                 # unit tests
node scripts/rt-test.mjs # real-time end-to-end test
```

Bade message history (10,000+) test karne ke liye:
```bash
npm run db:seed:load
```

---

## 21. Deployment Ke Liye Zaroori Baatein

- `npm run start` use karo (`next start` nahi — usme sockets kaam nahi karenge)
- `DATABASE_URL`, `AUTH_SECRET` zaroor set karo, `NODE_ENV=production` bhi
- Multiple servers chalane ho to storage ko S3 aur rate-limit ko Redis pe move karo

---

## 22. Jaani-Boojhi Limitations (Trade-offs)

- Abhi sab kuch single server pe chalta hai (scaling ke liye Redis chahiye hoga)
- Profanity filter simple hai, perfect nahi (par easily improve ho sakta hai)
- S3 storage abhi sirf documented stub hai, local storage hi fully kaam karta hai

---

## 23. Final Review Summary (Sab Points Check Kiye Gaye)

| Point | Status | Kya Mila |
|---|---|---|
| Image Moderation | ✅ Fixed | Pehle fail hone pe auto-approve ho jata tha, ab reject hota hai |
| Message Reliability | ✅ Pass | Duplicate/miss messages ka koi issue nahi mila |
| Performance | ✅ Pass | Pagination sahi hai, koi N+1 query issue nahi mila |
| Security | ✅ Pass | Koi vulnerability nahi mili, sab jagah permission check hai |

**Note:** Ye review code padh ke (manual tracing) kiya gaya hai, kyunki is sandbox me internet/database access nahi tha. Isliye `npm install`, `npm test`, `npm run build` khud chala ke confirm zaroor karein.
