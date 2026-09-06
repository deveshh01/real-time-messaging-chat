// Headless end-to-end real-time test for WhatsApp-style Group Chat.
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

function waitForConnect(s, name) {
  if (s.connected) return Promise.resolve(true);
  return Promise.race([
    new Promise((r) => s.on("connect", () => r(true))),
    wait(5000).then(() => {
      console.log(`${name} did not connect in 5s`);
      return false;
    }),
  ]);
}

async function main() {
  const alice = await login("alice");
  const bob = await login("bob");
  const charlie = await login("charlie");
  const david = await login("david");

  // 1. Create group via REST (Alice is Admin)
  const groupRes = await fetch(`${B}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: alice.cookie },
    body: JSON.stringify({
      isGroup: true,
      title: "Core Engineers",
      userIds: [bob.user.id, charlie.user.id],
    }),
  });
  check("1. Alice creates group 'Core Engineers' with Bob & Charlie", groupRes.status === 201);
  const { conversationId: cid } = await groupRes.json();

  // 2. Authenticated Socket Connections
  const sa = connect(alice.cookie);
  const sb = connect(bob.cookie);
  const sc = connect(charlie.cookie);
  const sd = connect(david.cookie);

  check("2a. Alice socket connected", await waitForConnect(sa, "Alice"));
  check("2b. Bob socket connected", await waitForConnect(sb, "Bob"));
  check("2c. Charlie socket connected", await waitForConnect(sc, "Charlie"));
  check("2d. David socket connected", await waitForConnect(sd, "David"));

  const events = {
    bobNew: null,
    charlieNew: null,
    aliceTyping: null,
    davidGroupUpdated: null,
    charlieGroupUpdated: null,
  };

  sb.on("message:new", (m) => { if (m.conversationId === cid) events.bobNew = m; });
  sc.on("message:new", (m) => { if (m.conversationId === cid) events.charlieNew = m; });
  sa.on("typing:update", (t) => { if (t.conversationId === cid) events.aliceTyping = t; });
  sd.on("group:updated", (g) => { if (g.conversationId === cid) events.davidGroupUpdated = g; });
  sc.on("group:updated", (g) => { if (g.conversationId === cid) events.charlieGroupUpdated = g; });

  await wait(500);

  // Join rooms
  await new Promise((r) => sa.emit("conversation:join", { conversationId: cid }, r));
  await new Promise((r) => sb.emit("conversation:join", { conversationId: cid }, r));
  await new Promise((r) => sc.emit("conversation:join", { conversationId: cid }, r));

  // 3. Real-Time Group Messaging
  const clientId = "grp-msg-" + Date.now();
  const ack = await new Promise((r) =>
    sa.emit("message:send", { conversationId: cid, clientId, type: "TEXT", body: "Welcome team!" }, r),
  );
  check("3. Alice sends group message & receives ack", ack.ok === true && ack.message.body === "Welcome team!");
  await wait(300);

  check("4. Bob receives group message in real-time", events.bobNew?.clientId === clientId);
  check("5. Charlie receives group message in real-time", events.charlieNew?.clientId === clientId);

  // 6. Typing indicators in group
  sc.emit("typing:start", { conversationId: cid });
  await wait(200);
  check("6. Alice sees Charlie typing in group", events.aliceTyping?.typing === true && events.aliceTyping?.userId === charlie.user.id);

  // 7. Admin adds member (Alice adds David)
  const addRes = await fetch(`${B}/api/conversations/${cid}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: alice.cookie },
    body: JSON.stringify({ userIds: [david.user.id] }),
  });
  check("7. Admin Alice adds David to group", addRes.status === 201);
  await wait(300);
  check("8. David receives real-time group:updated notification", events.davidGroupUpdated?.type === "member_added");

  // 9. Non-Admin restriction check (Bob tries to remove David -> 403)
  const nonAdminRemoveRes = await fetch(`${B}/api/conversations/${cid}/members/${david.user.id}`, {
    method: "DELETE",
    headers: { Cookie: bob.cookie },
  });
  check("9. Non-admin Bob blocked from removing David (403 Forbidden)", nonAdminRemoveRes.status === 403);

  // 10. Admin removes member (Alice removes Charlie)
  const adminRemoveRes = await fetch(`${B}/api/conversations/${cid}/members/${charlie.user.id}`, {
    method: "DELETE",
    headers: { Cookie: alice.cookie },
  });
  check("10. Admin Alice removes Charlie", adminRemoveRes.status === 200);
  await wait(300);
  check("11. Charlie receives member_removed update", events.charlieGroupUpdated?.type === "member_removed");

  // 12. Removed member cannot read group messages (403)
  const charlieReadRes = await fetch(`${B}/api/conversations/${cid}/messages`, {
    headers: { Cookie: charlie.cookie },
  });
  check("12. Removed member Charlie cannot read group messages (403)", charlieReadRes.status === 403);

  // 13. Admin leaves group -> Auto transfer admin role to Bob
  const aliceLeaveRes = await fetch(`${B}/api/conversations/${cid}/leave`, {
    method: "POST",
    headers: { Cookie: alice.cookie },
  });
  check("13. Admin Alice leaves group", aliceLeaveRes.status === 200);
  const leaveData = await aliceLeaveRes.json();
  check("14. Admin role auto-transferred to Bob", leaveData.newAdminId === bob.user.id);

  // Clean up sockets
  sa.close();
  sb.close();
  sc.close();
  sd.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASSED`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
