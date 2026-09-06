import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dirPath = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));

function load(file: string) {
  let content: string | undefined;
  const pathsToTry = [
    resolve(dirPath, "..", file),
    resolve(process.cwd(), file),
    resolve(process.cwd(), "backend", file),
  ];

  for (const p of pathsToTry) {
    try {
      content = readFileSync(p, "utf8");
      if (content) break;
    } catch {
      // try next
    }
  }

  if (!content) return;

  const parsed: Record<string, string> = {};
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    parsed[key] = value;
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

load(".env.local");
load(".env");
