// Operations Dashboard: small JSON key/value store shared by admin-action.js.
//
// Why: Netlify Functions run in separate, short-lived instances with no shared
// (or even writable) filesystem, so a session saved by one invocation is not
// visible to the next. On Netlify we therefore keep state in Netlify Blobs.
// Locally (node --test, plain node) we fall back to JSON files in
// netlify/.drafts/ (override with ADMIN_DATA_DIR).
//
// Backend selection, per invocation (call connectStore(event) first):
//   1. ADMIN_STORE=fs                         -> filesystem (forced)
//   2. event.blobs present (Netlify runtime)  -> Blobs via connectLambda(event)
//   3. NETLIFY_SITE_ID + NETLIFY_BLOBS_KEY    -> Blobs with explicit credentials
//   4. otherwise                              -> filesystem
// If Blobs is expected (2 or 3) but @netlify/blobs cannot load, we throw rather
// than silently using the ephemeral filesystem, which would lose sessions.

import { mkdir, readFile, writeFile, rename, readdir } from 'fs/promises';
import { DRAFTS_DIR } from './paths.js';
import { join } from 'path';

const DEFAULT_DIR = DRAFTS_DIR;
const STORE_NAME = 'admin-dashboard';

let blobStore = null;

export function dataDir() {
  return process.env.ADMIN_DATA_DIR || DEFAULT_DIR;
}

export function backendName() {
  return blobStore ? 'blobs' : 'fs';
}

export async function connectStore(event) {
  blobStore = null;
  if (process.env.ADMIN_STORE === 'fs') return 'fs';

  const hasLambdaContext = !!(event && event.blobs);
  const hasCredentials = !!(process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_KEY);
  console.log('[admin-store] hasLambdaContext:', hasLambdaContext, 'hasCredentials:', hasCredentials, 'SITE_ID:', !!process.env.NETLIFY_SITE_ID, 'BLOBS_KEY:', !!process.env.NETLIFY_BLOBS_KEY);
  if (!hasLambdaContext && !hasCredentials) return 'fs';

  let blobs;
  try {
    blobs = await import('@netlify/blobs');
  } catch (err) {
    throw new Error('Netlify Blobs is configured but @netlify/blobs is not installed: ' + err.message);
  }

  if (hasLambdaContext) {
    blobs.connectLambda(event);
    blobStore = blobs.getStore(STORE_NAME);
  } else {
    blobStore = blobs.getStore({
      name: STORE_NAME,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_KEY,
    });
  }
  return 'blobs';
}

// Returns the parsed value, or null when the key does not exist.
export async function readJSON(name) {
  if (blobStore) {
    const value = await blobStore.get(name, { type: 'json' });
    return value == null ? null : value;
  }
  try {
    return JSON.parse(await readFile(join(dataDir(), name), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeJSON(name, value) {
  if (blobStore) {
    await blobStore.setJSON(name, value);
    return;
  }
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  // Write-then-rename so a crash never leaves a half-written file behind.
  const tmp = join(dir, `.${name}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, join(dir, name));
}

// Draft files are still written to the filesystem by content-engine.js
// (utils/storage.js), so drafts are always read from disk. See the Task 4
// report: this is a production blocker until the engine also uses Blobs.
export async function listDraftFiles() {
  try {
    return await readdir(dataDir());
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function readDraftFile(fileName) {
  try {
    return JSON.parse(await readFile(join(dataDir(), fileName), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
