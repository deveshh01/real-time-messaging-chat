import "./loadEnv"; // must run before any module that reads env
import { createServer } from "node:http";
import { Server } from "socket.io";
import { env } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { setIO, type AppServer } from "./socket/io";
import { socketAuth } from "./socket/auth";
import { registerHandlers } from "./socket/registerHandlers";
import { handleHttpApi } from "./httpRouter";

/**
 * Backend HTTP server hosting Socket.IO and REST routes in backend/routes/
 */
async function main() {
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/" || url.pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", service: "devchat-backend" }));
      return;
    }

    const handled = await handleHttpApi(req, res);
    if (!handled) {
      res.statusCode = 404;
      res.end("Not found");
    }
  });

  const io: AppServer = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: env.APP_ORIGIN, credentials: true },
    transports: ["websocket", "polling"],
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(socketAuth);
  registerHandlers(io);
  setIO(io);

  httpServer.listen(env.PORT, "0.0.0.0", () => {
    logger.info(`server ready`, { url: `http://0.0.0.0:${env.PORT}`, env: env.NODE_ENV });
  });

  const shutdown = (signal: string) => {
    logger.info("shutting down", { signal });
    io.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("fatal server error", { err: (err as Error).message });
  process.exit(1);
});
