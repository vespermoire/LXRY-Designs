// Operations Dashboard: server-side session tokens (ruling R1).
// Stored in active-sessions.json (Netlify Blobs in production, see admin-store.js):
//   { "<32-hex token>": { token, timestamp, ttl, expiresAt, userId } }
// A token is valid while timestamp + ttl > now.

import { readJSON, writeJSON } from './admin-store.js';

export const SESSIONS_FILE = 'active-sessions.json';
const TOKEN_RE = /^[0-9a-f]{32}$/;

function isLive(entry, now) {
  return !!entry && typeof entry.timestamp === 'number' && typeof entry.ttl === 'number' &&
    entry.timestamp + entry.ttl > now;
}

async function readSessions() {
  const sessions = await readJSON(SESSIONS_FILE);
  return sessions && typeof sessions === 'object' && !Array.isArray(sessions) ? sessions : {};
}

function pruneExpired(sessions, now) {
  let removed = 0;
  for (const key of Object.keys(sessions)) {
    if (!isLive(sessions[key], now)) {
      delete sessions[key];
      removed++;
    }
  }
  return removed;
}

// expiresAt: absolute expiry in ms since epoch (what getSessionTTL() returns).
// Expired sessions are dropped on every save so the file stays small.
export async function saveToken(token, expiresAt, userId = 'admin') {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
    throw new Error('saveToken: token must be 32 lowercase hex characters');
  }
  const now = Date.now();
  if (typeof expiresAt !== 'number' || !(expiresAt > now)) {
    throw new Error('saveToken: expiresAt must be a future timestamp in ms');
  }
  const sessions = await readSessions();
  pruneExpired(sessions, now);
  sessions[token] = { token, timestamp: now, ttl: expiresAt - now, expiresAt, userId };
  await writeJSON(SESSIONS_FILE, sessions);
  return sessions[token];
}

export async function validateToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return false;
  const sessions = await readSessions();
  return isLive(sessions[token], Date.now());
}

// Returns the number of sessions removed. Only writes when something changed.
export async function clearExpired() {
  const sessions = await readSessions();
  const removed = pruneExpired(sessions, Date.now());
  if (removed > 0) await writeJSON(SESSIONS_FILE, sessions);
  return removed;
}
