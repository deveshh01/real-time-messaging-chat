// Headless end-to-end real-time test: two authenticated sockets (alice + bob).
import { io } from "socket.io-client";

const B = "http://localhost:3000";

async function login(identifier) {
  const res = await fetch(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: "password123" }),
  });
  if (!res.ok) throw new Error(`login ${identifier} failed ${res.status}`);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const { user } = await res.json();
  return { cookie, user };
}

function connect(cookie) {
  return io(B, {
    path: "/socket.io",
    transports: ["websocket"],
    extraHeaders: { Cookie: cookie },
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

async function main() {
  const alice = await login("alice");
  const bob = await login("bob");

  // find shared conversation via REST
  const convRes = await fetch(`${B}/api/conversations`, { headers: { Cookie: alice.cookie } });
  const { conversations } = await convRes.json();
  const conv = conversations.find((c) => c.otherUser?.username === "bob");
  const cid = conv.id;

  const sa = connect(alice.cookie);
  const sb = connect(bob.cookie);

  const events = { bobGotNew: null, aliceTyping: null, aliceRead: null, alicePresence: null };
  sb.on("message:new", (m) => (events.bobGotNew = m));
  sa.on("typing:update", (p) => (events.aliceTyping = p));
  sa.on("message:status", (p) => (events.aliceRead = p));
  sa.on("presence:update", (p) => {
    if (p.userId === bob.user.id) events.alicePresence = p;
  });

  sa.on("connect_error", (e) => console.log("alice connect_error:", e.message));
  sb.on("connect_error", (e) => console.log("bob connect_error:", e.message));
  const connOr = (s, name) =>
    Promise.race([
      new Promise((r) => s.on("connect", () => r(true))),
      wait(8000).then(() => {
        console.log(`${name} did not connect in 8s`);
        return false;
      }),
    ]);
  check("alice socket connects (cookie auth)", await connOr(sa, "alice"));
  check("bob socket connects (cookie auth)", await connOr(sb, "bob"));

  await new Promise((r) => sa.emit("conversation:join", { conversationId: cid }, r));
  await new Promise((r) => sb.emit("conversation:join", { conversationId: cid }, r));

  await wait(300);
  check("alice receives bob presence online", events.alicePresence?.online === true);

  // alice sends -> ack + bob receives
  const clientId = "rt-" + Date.now();
  const ack = await new Promise((r) =>
    sa.emit("message:send", { conversationId: cid, clientId, type: "TEXT", body: "hello over socket" }, r),
  );
  check("send ack ok with server id", ack.ok === true && !!ack.message?.id);
  await wait(300);
  check("bob receives message:new in real time", events.bobGotNew?.clientId === clientId);
  check("message delivered (bob online)", ["delivered", "read"].includes(
    (await fetchStatus(alice.cookie, cid, clientId)),
  ));

  // idempotent resend of same clientId -> no duplicate, ack still ok
  const ack2 = await new Promise((r) =>
    sa.emit("message:send", { conversationId: cid, clientId, type: "TEXT", body: "hello over socket" }, r),
  );
  check("idempotent resend returns same id", ack2.ok && ack2.message.id === ack.message.id);

  // typing
  sb.emit("typing:start", { conversationId: cid });
  await wait(200);
  check("alice sees bob typing", events.aliceTyping?.typing === true && events.aliceTyping?.userId === bob.user.id);

  // read receipt: bob reads -> alice gets status read
  sb.emit("message:read", { conversationId: cid, upToSeq: ack.message.seq });
  await wait(300);
  check("alice sees read receipt", events.aliceRead?.status === "read");

  // presence offline on disconnect
  sb.close();
  await wait(400);
  check("alice sees bob presence offline", events.alicePresence?.online === false);

  sa.close();
  // cleanup the socket-sent message
  await fetch(`${B}/api/conversations/${cid}/messages`, { headers: { Cookie: alice.cookie } });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

async function fetchStatus(cookie, cid, clientId) {
  const res = await fetch(`${B}/api/conversations/${cid}/messages?limit=10`, { headers: { Cookie: cookie } });
  const { messages } = await res.json();
  return messages.find((m) => m.clientId === clientId)?.status;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
