import { env } from "@/src/lib/env";
import type { StorageDriver } from "./storage";
import { LocalStorageDriver } from "./localStorage";
import { S3StorageDriver } from "./s3Storage";

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  driver = env.STORAGE_DRIVER === "s3" ? new S3StorageDriver() : new LocalStorageDriver();
  return driver;
}

export * from "./storage";
