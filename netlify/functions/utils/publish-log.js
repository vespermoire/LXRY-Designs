// Operations Dashboard: publish history (publish-log.json, Blobs in production).
// Shape: { entries: [{ timestamp, draftId, status, itemsPublished, itemsSkipped, errors }] }
// status: "publishing" (in progress) | "success" | "partial" | "failure". Newest first.

import { readJSON, writeJSON } from './admin-store.js';

export const LOG_FILE = 'publish-log.json';
// An in-progress marker older than this is treated as a crashed run.
export const STALE_PUBLISHING_MS = 10 * 60 * 1000;

export async function readLog() {
  const log = await readJSON(LOG_FILE);
  return log && Array.isArray(log.entries) ? log : { entries: [] };
}

// Ruling R2: a draft with a "success" entry must not be published again.
// A recent "publishing" entry also blocks, so two clicks cannot both publish.
export async function findBlockingEntry(draftId, now = Date.now()) {
  const { entries } = await readLog();
  return entries.find((e) => e.draftId === draftId && (
    e.status === 'success' ||
    (e.status === 'publishing' && now - Date.parse(e.timestamp) < STALE_PUBLISHING_MS)
  )) || null;
}

export async function appendEntry(entry) {
  const log = await readLog();
  log.entries.unshift(entry);
  await writeJSON(LOG_FILE, log);
}

// Swaps the in-progress marker (matched by draftId + start timestamp) for the
// final entry. Adds the entry if the marker has gone missing.
export async function replaceEntry(draftId, startedAt, entry) {
  const log = await readLog();
  const i = log.entries.findIndex((e) => e.draftId === draftId && e.timestamp === startedAt && e.status === 'publishing');
  if (i >= 0) log.entries[i] = entry;
  else log.entries.unshift(entry);
  await writeJSON(LOG_FILE, log);
}
