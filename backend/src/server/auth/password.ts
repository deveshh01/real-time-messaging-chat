import argon2 from "argon2";

/**
 * Password hashing via argon2id (memory-hard, current OWASP recommendation).
 * Hash format is self-describing, so verification needs no stored params.
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash etc. — treat as a failed login, never throw to caller.
    return false;
  }
}
