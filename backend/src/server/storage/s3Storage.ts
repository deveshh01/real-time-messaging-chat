import { env } from "@/src/lib/env";
import type { StorageDriver, PutObjectInput } from "./storage";

/**
 * S3 / Cloudflare R2 driver.
 *
 * Left as a documented, typed stub so the abstraction is complete without
 * pulling `@aws-sdk/*` into the default install. To enable: add
 * `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, set STORAGE_DRIVER=s3
 * and the S3_* env vars, then fill in the three methods below (PutObjectCommand,
 * GetObjectCommand, getSignedUrl). The rest of the app is already written
 * against this interface, so no call sites change.
 *
 * Production upload flow (README "Object storage strategy"):
 *   1. client asks server for an upload target
 *   2. server authenticates + authorizes, then returns a short-lived signed
 *      PUT URL restricted by content-type and size
 *   3. client uploads bytes directly to object storage (bypassing the app server)
 *   4. server runs moderation on the stored object before marking it APPROVED
 */
export class S3StorageDriver implements StorageDriver {
  readonly kind = "s3" as const;

  constructor() {
    if (!env.S3_BUCKET || !env.S3_ENDPOINT) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET and S3_ENDPOINT");
    }
  }

  async put(_input: PutObjectInput): Promise<void> {
    throw new Error("S3 driver not implemented in this build — see s3Storage.ts");
  }
  async get(_key: string): Promise<Buffer> {
    throw new Error("S3 driver not implemented in this build — see s3Storage.ts");
  }
  async delete(_key: string): Promise<void> {
    throw new Error("S3 driver not implemented in this build — see s3Storage.ts");
  }
  async signedReadUrl(_key: string, _ttlSeconds = 300): Promise<string> {
    throw new Error("S3 driver not implemented in this build — see s3Storage.ts");
  }
}
