// Operations Dashboard auth helpers.
// ADMIN_PASSWORD lives in the environment only; it is never sent to the page.

import crypto from 'crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// 16 random bytes → 32 hex characters.
export function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Absolute expiry timestamp (ms since epoch) for a session created now.
export function getSessionTTL() {
  return Date.now() + SESSION_TTL_MS;
}

// Exact string match against ADMIN_PASSWORD. Both sides are hashed first so
// timingSafeEqual gets equal-length buffers and the comparison time does not
// depend on how much of the password was right.
export async function verifyPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;

  // No configured password (or a non-string guess) never authenticates.
  if (typeof expected !== 'string' || expected === '' || typeof password !== 'string') {
    return { valid: false, token: null };
  }

  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(expected).digest();

  if (!crypto.timingSafeEqual(a, b)) {
    return { valid: false, token: null };
  }

  return { valid: true, token: generateToken() };
}
