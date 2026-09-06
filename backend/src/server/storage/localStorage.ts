import { promises as fs } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "@/src/lib/env";
import type { StorageDriver, PutObjectInput } from "./storage";

/**
 * Local-disk driver for development. Files live under UPLOAD_DIR, OUTSIDE the
 * web root, and are only ever streamed back through the authorized attachment
 * route — never via a static/public path.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly kind = "local" as const;
  private root = resolve(env.UPLOAD_DIR);

  private pathFor(key: string): string {
    // Resolve and assert the final path stays within root (defense in depth;
    // keys are server-generated, but never trust that alone).
    const full = resolve(join(this.root, key));
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error("Resolved storage path escapes the upload root");
    }
    return full;
  }

  async put({ key, body }: PutObjectInput): Promise<void> {
    const path = this.pathFor(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.pathFor(key), { force: true });
  }

  async signedReadUrl(key: string): Promise<string> {
    // Authorization is enforced by the route itself; the id maps to the key.
    return `/api/attachments/by-key?key=${encodeURIComponent(key)}`;
  }
}
