// Netlify Function: Operations Dashboard API (on-demand, no schedule).
// Reached via netlify.toml rewrites:
//   /admin-check-password → /.netlify/functions/admin-action/check-password
//   /admin-action/*       → /.netlify/functions/admin-action/:splat
// A rewrite can hand the function either the original path or the function
// path, so routes are matched with endsWith().
//
// Routes:
//   POST check-password  { password }                              → { valid, token }
//   GET  draft           (x-admin-token)                           → { draftId, draft }
//   POST approve         (x-admin-token) { draftId, approvedItems, editedContent }
//                                                                  → { success, result }
//   GET  publish-log     (x-admin-token)                           → { entries }

import { verifyPassword, getSessionTTL } from './utils/admin-helpers.js';
import { connectStore, listDraftFiles, readDraftFile } from './utils/admin-store.js';
import { saveToken, validateToken, clearExpired } from './utils/token-storage.js';
import { readLog, findBlockingEntry, appendEntry, replaceEntry } from './utils/publish-log.js';
import { publishAll, sendNewsletter, queueSocial } from './utils/publisher.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export const ITEMS = ['blog', 'newsletter', 'instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'youtube'];
const SOCIAL = ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'youtube'];
const DRAFT_FILE_RE = /^draft-\d{13}\.json$/;
const DRAFT_ID_RE = /^draft-\d{13}$/;
const X_MAX_CHARS = 280;
const X_HASHTAGS_MIN = 3;
const X_HASHTAGS_MAX = 5;

function json(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function header(event, name) {
  const headers = (event && event.headers) || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

// ---- drafts ----

// Newest draft-<13-digit ms>.json. draft-test.json, *-approved.json and
// publish-log.json never match the pattern.
export async function findNewestDraftId() {
  const files = (await listDraftFiles()).filter((f) => DRAFT_FILE_RE.test(f));
  if (!files.length) return null;
  files.sort((a, b) => Number(b.slice(6, 19)) - Number(a.slice(6, 19)));
  return files[0].replace(/\.json$/, '');
}

// ---- edits + validation ----

function cleanTags(value) {
  const list = Array.isArray(value) ? value : [value];
  const tags = [];
  for (const v of list) {
    if (v == null) continue;
    for (const part of String(v).split(/[\s,#]+/)) if (part) tags.push(part);
  }
  return tags;
}

// Deep-copies the draft and applies edits for approved items only.
// Edits to pending/rejected items, and to the (read-only) blog, are ignored.
export function mergeEdits(draft, approvedItems, editedContent) {
  const merged = JSON.parse(JSON.stringify(draft));
  const edits = editedContent && typeof editedContent === 'object' ? editedContent : {};
  const approved = new Set(approvedItems);

  if (approved.has('newsletter') && merged.newsletter && edits.newsletter &&
      typeof edits.newsletter.subject === 'string') {
    merged.newsletter.subject = edits.newsletter.subject.trim();
  }

  const socialEdits = edits.social && typeof edits.social === 'object' ? edits.social : {};
  for (const p of SOCIAL) {
    if (!approved.has(p) || !merged.social || !merged.social[p] || !socialEdits[p]) continue;
    const e = socialEdits[p];
    if (typeof e.caption === 'string') merged.social[p].caption = e.caption.trim();
    if (e.hashtags !== undefined) merged.social[p].hashtags = cleanTags(e.hashtags);
  }
  return merged;
}

function postText(post) {
  const caption = String(post.caption ?? post.text ?? '').trim();
  const tags = cleanTags(post.hashtags || []).map((t) => '#' + t).join(' ');
  return tags ? `${caption} ${tags}` : caption;
}

// Server-side gate for approved items (ruling R3 + the dashboard's X rule).
export function validateApproved(draft, approvedItems) {
  const errors = [];
  for (const item of approvedItems) {
    if (item === 'blog') {
      if (!draft.blog || !draft.blog.title || !draft.blog.content) errors.push('blog: missing title or content');
    } else if (item === 'newsletter') {
      if (!draft.newsletter || !String(draft.newsletter.subject || '').trim()) errors.push('newsletter: subject is required');
    } else {
      const post = draft.social && draft.social[item];
      if (!post) { errors.push(`${item}: not in this draft`); continue; }
      if (!String(post.caption ?? post.text ?? '').trim()) errors.push(`${item}: caption is required`);
      if (item === 'x') {
        const n = cleanTags(post.hashtags || []).length;
        if (n < X_HASHTAGS_MIN || n > X_HASHTAGS_MAX) {
          errors.push(`x: needs ${X_HASHTAGS_MIN}-${X_HASHTAGS_MAX} hashtags (found ${n})`);
        }
        const len = postText(post).length;
        if (len > X_MAX_CHARS) errors.push(`x: exceeds ${X_MAX_CHARS} characters including hashtags (${len})`);
      }
    }
  }
  return errors;
}

// ---- publishing ----

// Converts the content engine's draft shape into the shape publisher.js reads
// (title/blog string, newsletter.content, social[p].text), keeping only the
// approved items.
export function toPublisherDraft(draft, approvedItems) {
  const approved = new Set(approvedItems);
  const blog = draft.blog || {};
  const fm = blog.frontmatter || {};
  const out = { title: blog.title || (draft.newsletter && draft.newsletter.subject) || 'Untitled' };

  if (approved.has('blog')) {
    out.blog = blog.content;
    if (fm.slug) out.slug = fm.slug;
    if (fm.description) out.description = fm.description;
    if (Array.isArray(fm.seo_keywords)) out.tags = fm.seo_keywords;
  }
  if (approved.has('newsletter') && draft.newsletter) {
    out.newsletter = {
      ...draft.newsletter,
      content: draft.newsletter.body ?? draft.newsletter.content ?? draft.newsletter.html,
    };
  }
  const social = {};
  for (const p of SOCIAL) {
    if (approved.has(p) && draft.social && draft.social[p]) {
      social[p] = { ...draft.social[p], text: postText(draft.social[p]) };
    }
  }
  if (Object.keys(social).length) out.social = social;
  return out;
}

// publishAll() treats the blog as mandatory and aborts without it, so when the
// blog is not approved we call the newsletter and social steps directly and
// return the same { success, published, failures } shape.
export async function publishSelected(pubDraft) {
  if (pubDraft.blog) return publishAll(pubDraft);

  const published = {};
  const failures = {};
  if (pubDraft.newsletter) {
    const r = await sendNewsletter(pubDraft);
    if (r.success) published.newsletter = { success: true, subject: r.subject };
    else failures.newsletter = r.error;
  }
  if (pubDraft.social) {
    const r = await queueSocial(pubDraft);
    published.social = { success: !r.hasErrors, platforms: r.results };
  }
  const socialOk = !published.social || published.social.success;
  return { success: Object.keys(failures).length === 0 && socialOk, published, failures };
}

// Turns publisher output into the log's itemsPublished / errors lists.
export function summarise(result, approvedItems) {
  const published = (result && result.published) || {};
  const failures = (result && result.failures) || {};
  const itemsPublished = [];
  const errors = [];

  for (const item of approvedItems) {
    if (item === 'blog' || item === 'newsletter') {
      if (published[item] && published[item].success) itemsPublished.push(item);
      else errors.push({ item, error: failures[item] || failures.general || 'Not published' });
      continue;
    }
    const platforms = (published.social && published.social.platforms) || {};
    const r = platforms[item];
    if (r && r.success) itemsPublished.push(item);
    else errors.push({ item, error: (r && r.error) || platforms.error || failures.general || 'Not published' });
  }
  const status = errors.length === 0 ? 'success' : itemsPublished.length ? 'partial' : 'failure';
  return { status, itemsPublished, errors };
}

// ---- handlers ----

async function handleCheckPassword(event) {
  let password;
  try {
    ({ password } = JSON.parse(event.body));
  } catch (err) {
    return json(400, { error: 'Invalid request' });
  }
  const result = await verifyPassword(password);
  // R1: persist the issued token so later invocations can validate it.
  if (result.valid) await saveToken(result.token, getSessionTTL());
  return json(result.valid ? 200 : 401, result);
}

async function requireToken(event) {
  return validateToken(header(event, 'x-admin-token'));
}

async function handleGetDraft(event) {
  if (!(await requireToken(event))) return json(401, { error: 'Invalid or expired session' });
  const draftId = await findNewestDraftId();
  if (!draftId) return json(404, { error: 'No draft found' });
  const draft = await readDraftFile(`${draftId}.json`);
  if (!draft) return json(404, { error: 'No draft found' });
  return json(200, { draftId, draft });
}

// Publish history for the dashboard table. Newest first, as stored.
async function handleGetPublishLog(event) {
  if (!(await requireToken(event))) return json(401, { error: 'Invalid or expired session' });
  const { entries } = await readLog();
  return json(200, { entries });
}

async function handleApprove(event, publish) {
  if (!(await requireToken(event))) return json(401, { error: 'Invalid or expired session' });
  await clearExpired();

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Invalid JSON' });
  }
  const { draftId, approvedItems, editedContent } = body || {};

  if (typeof draftId !== 'string' || !DRAFT_ID_RE.test(draftId)) {
    return json(400, { error: 'Invalid draftId' });
  }
  if (!Array.isArray(approvedItems) || !approvedItems.length ||
      approvedItems.some((i) => !ITEMS.includes(i))) {
    return json(400, { error: 'approvedItems must be a non-empty list of: ' + ITEMS.join(', ') });
  }
  const items = ITEMS.filter((i) => approvedItems.includes(i)); // dedupe, stable order

  // R2: never publish the same draft twice.
  const blocking = await findBlockingEntry(draftId);
  if (blocking) {
    return json(409, {
      error: blocking.status === 'success' ? 'Draft already published' : 'Publish already in progress',
    });
  }

  const draft = await readDraftFile(`${draftId}.json`);
  if (!draft) return json(404, { error: 'Draft not found' });

  const merged = mergeEdits(draft, items, editedContent);
  const validationErrors = validateApproved(merged, items);
  if (validationErrors.length) {
    return json(400, { error: 'Validation failed: ' + validationErrors.join('; '), validationErrors });
  }

  const startedAt = new Date().toISOString();
  const skipped = ITEMS.filter((i) => !items.includes(i));
  // Mark in-progress first so a double click or retry cannot publish twice.
  await appendEntry({ timestamp: startedAt, draftId, status: 'publishing', itemsPublished: [], itemsSkipped: skipped, errors: [] });

  let result;
  try {
    result = await publish(toPublisherDraft(merged, items));
  } catch (err) {
    result = { success: false, published: {}, failures: { general: err.message } };
  }

  const summary = summarise(result, items);
  const entry = {
    timestamp: new Date().toISOString(),
    draftId,
    status: summary.status,
    itemsPublished: summary.itemsPublished,
    itemsSkipped: skipped,
    errors: summary.errors,
  };
  await replaceEntry(draftId, startedAt, entry);

  if (summary.status === 'success') return json(200, { success: true, result: { ...entry, publisher: result } });
  return json(502, {
    success: false,
    error: summary.status === 'partial'
      ? 'Some items failed: ' + summary.errors.map((e) => e.item).join(', ')
      : 'Publishing failed: ' + summary.errors.map((e) => `${e.item} (${e.error})`).join('; '),
    result: { ...entry, publisher: result },
  });
}

export function createHandler({ publish = publishSelected } = {}) {
  return async (event) => {
    const path = event.path || '';
    const method = event.httpMethod;

    try {
      await connectStore(event);

      if (method === 'POST' && path.endsWith('check-password')) return await handleCheckPassword(event);
      if (method === 'GET' && path.endsWith('publish-log')) return await handleGetPublishLog(event);
      if (method === 'GET' && path.endsWith('draft')) return await handleGetDraft(event);
      if (method === 'POST' && path.endsWith('approve')) return await handleApprove(event, publish);
    } catch (err) {
      console.error('[admin-action] error:', err);
      return json(500, { error: 'Server error' });
    }
    return json(404, { error: 'Not found' });
  };
}

export const handler = createHandler();
