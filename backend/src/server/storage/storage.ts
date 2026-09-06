/**
 * Object storage abstraction. IMAGE bytes are always private — they are served
 * only through an authorized app route (or a short-lived signed URL for S3), so
 * an unmoderated/unauthorized image is never reachable by URL guessing.
 */
export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageDriver {
  readonly kind: "local" | "s3";
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /**
   * A short-lived, authorized read URL. Local driver returns an in-app route;
   * S3 driver returns a presigned GET URL.
   */
  signedReadUrl(key: string, ttlSeconds?: number): Promise<string>;
}

/**
 * Build a safe, server-generated object key. The client's filename is NEVER
 * used in the path — only a random id + a validated extension — which prevents
 * path traversal and collisions.
 */
export function buildObjectKey(ownerId: string, ext: string): string {
  const rand = cryptoRandom(24);
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "bin";
  return `images/${ownerId}/${rand}.${safeExt}`;
}

function cryptoRandom(bytes: number): string {
  // Node's webcrypto is available in the server runtime.
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
