// Task 4: admin-action endpoints (draft, approve, check-password) and token storage.
// Runs against the filesystem backend in a temp dir; publishing is stubbed.

import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, copyFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE = join(__dirname, '../../netlify/.drafts/draft-test.json');

process.env.ADMIN_STORE = 'fs';
process.env.ADMIN_PASSWORD = 'correct horse';

const { createHandler, toPublisherDraft, mergeEdits, findNewestDraftId } =
  await import('../../netlify/functions/admin-action.js');
const tokenStorage = await import('../../netlify/functions/utils/token-storage.js');

let dir;
let publishCalls;
let publishResult;

const stubPublish = async (draft) => {
  publishCalls.push(draft);
  return typeof publishResult === 'function' ? publishResult(draft) : publishResult;
};
const handler = createHandler({ publish: stubPublish });

const ALL_OK = (d) => ({
  success: true,
  published: {
    ...(d.blog ? { blog: { success: true, filename: 'x.md' } } : {}),
    ...(d.newsletter ? { newsletter: { success: true, subject: d.newsletter.subject } } : {}),
    ...(d.social ? { social: { success: true, platforms: Object.fromEntries(Object.keys(d.social).map((p) => [p, { success: true }])) } } : {}),
  },
  failures: {},
});

const DRAFT_ID = 'draft-1727617200000';

beforeEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = await mkdtemp(join(tmpdir(), 'admin-action-'));
  process.env.ADMIN_DATA_DIR = dir;
  await copyFile(FIXTURE, join(dir, `${DRAFT_ID}.json`));
  publishCalls = [];
  publishResult = ALL_OK;
});

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function login() {
  const res = await handler({ httpMethod: 'POST', path: '/.netlify/functions/admin-action/check-password', body: JSON.stringify({ password: 'correct horse' }) });
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body).token;
}

function getDraft(token) {
  return handler({ httpMethod: 'GET', path: '/admin-action/draft', headers: token ? { 'x-admin-token': token } : {} });
}

function approve(token, body) {
  return handler({ httpMethod: 'POST', path: '/admin-action/approve', headers: { 'X-Admin-Token': token }, body: JSON.stringify(body) });
}

const readLog = async () => JSON.parse(await readFile(join(dir, 'publish-log.json'), 'utf8'));

// ---- token storage ----

test('check-password saves the issued token to active-sessions.json', async () => {
  const token = await login();
  const sessions = JSON.parse(await readFile(join(dir, 'active-sessions.json'), 'utf8'));
  assert.equal(sessions[token].token, token);
  assert.equal(typeof sessions[token].timestamp, 'number');
  assert.ok(sessions[token].ttl > 6 * 24 * 3600 * 1000);
  assert.equal(await tokenStorage.validateToken(token), true);
});

test('wrong password issues no token and saves nothing', async () => {
  const res = await handler({ httpMethod: 'POST', path: '/admin-check-password', body: JSON.stringify({ password: 'nope' }) });
  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).token, null);
  await assert.rejects(readFile(join(dir, 'active-sessions.json'), 'utf8'));
});

test('validateToken rejects unknown, malformed and expired tokens', async () => {
  assert.equal(await tokenStorage.validateToken('0'.repeat(32)), false);
  assert.equal(await tokenStorage.validateToken('not-a-token'), false);
  assert.equal(await tokenStorage.validateToken(undefined), false);

  const token = 'a'.repeat(32);
  await tokenStorage.saveToken(token, Date.now() + 60_000);
  assert.equal(await tokenStorage.validateToken(token), true);

  const sessions = JSON.parse(await readFile(join(dir, 'active-sessions.json'), 'utf8'));
  sessions[token].timestamp = Date.now() - 120_000; // now expired
  await writeFile(join(dir, 'active-sessions.json'), JSON.stringify(sessions));
  assert.equal(await tokenStorage.validateToken(token), false);
  assert.equal(await tokenStorage.clearExpired(), 1);
});

// ---- GET draft ----

test('GET draft: 401 without a valid token', async () => {
  assert.equal((await getDraft()).statusCode, 401);
  assert.equal((await getDraft('b'.repeat(32))).statusCode, 401);
});

test('GET draft: returns the newest draft-<13 digits>.json and ignores other files', async () => {
  const token = await login();
  const newer = 'draft-1727617300000';
  await writeFile(join(dir, `${newer}.json`), JSON.stringify({ blog: { title: 'newer' } }));
  await writeFile(join(dir, 'draft-1999999999999-approved.json'), '{}');
  await writeFile(join(dir, 'draft-test.json'), '{}');
  await writeFile(join(dir, 'publish-log.json'), '{"entries":[]}');

  const res = await getDraft(token);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const body = JSON.parse(res.body);
  assert.equal(body.draftId, newer);
  assert.equal(body.draft.blog.title, 'newer');
  assert.equal(await findNewestDraftId(), newer);
});

test('GET draft: 404 when there is no draft', async () => {
  const token = await login();
  await rm(join(dir, `${DRAFT_ID}.json`));
  await writeFile(join(dir, 'draft-test.json'), '{}');
  assert.equal((await getDraft(token)).statusCode, 404);
});

// ---- POST approve ----

test('approve: 401 with a wrong or expired token, nothing published', async () => {
  const res = await approve('c'.repeat(32), { draftId: DRAFT_ID, approvedItems: ['blog'], editedContent: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(publishCalls.length, 0);
});

test('approve: new draft publishes, logs success and returns { success, result }', async () => {
  const token = await login();
  const res = await approve(token, { draftId: DRAFT_ID, approvedItems: ['blog', 'newsletter', 'x'], editedContent: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.deepEqual(body.result.itemsPublished, ['blog', 'newsletter', 'x']);

  assert.equal(publishCalls.length, 1);
  const sent = publishCalls[0];
  assert.match(sent.blog, /Small Firms/);
  assert.equal(sent.slug, 'small-firms-big-models');
  assert.match(sent.newsletter.content, /practical AI/);
  assert.deepEqual(Object.keys(sent.social), ['x']);
  assert.match(sent.social.x.text, /#AI #SMEs #Automation$/);

  const log = await readLog();
  assert.equal(log.entries.length, 1);
  const e = log.entries[0];
  assert.equal(e.draftId, DRAFT_ID);
  assert.equal(e.status, 'success');
  assert.ok(e.timestamp);
  assert.deepEqual(e.errors, []);
  assert.ok(e.itemsSkipped.includes('instagram'));
});

test('approve: draft already published returns 409 and does not publish again', async () => {
  const token = await login();
  assert.equal((await approve(token, { draftId: DRAFT_ID, approvedItems: ['blog'], editedContent: {} })).statusCode, 200);
  const res = await approve(token, { draftId: DRAFT_ID, approvedItems: ['blog'], editedContent: {} });
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.parse(res.body).error, 'Draft already published');
  assert.equal(publishCalls.length, 1);
});

test('approve: an in-progress publish blocks a second request', async () => {
  const token = await login();
  await writeFile(join(dir, 'publish-log.json'), JSON.stringify({ entries: [{ timestamp: new Date().toISOString(), draftId: DRAFT_ID, status: 'publishing' }] }));
  const res = await approve(token, { draftId: DRAFT_ID, approvedItems: ['blog'], editedContent: {} });
  assert.equal(res.statusCode, 409);
  assert.equal(publishCalls.length, 0);
});

test('approve: X with 0 hashtags is rejected', async () => {
  const token = await login();
  const res = await approve(token, { draftId: DRAFT_ID, approvedItems: ['x'], editedContent: { social: { x: { caption: 'Hello', hashtags: [] } } } });
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /x: needs 3-5 hashtags \(found 0\)/);
  assert.equal(publishCalls.length, 0);
});

test('approve: X with 2 or 6 hashtags is rejected, 3 and 5 are accepted', async () => {
  const token = await login();
  for (const [tags, code] of [[['a', 'b'], 400], [['a', 'b', 'c', 'd', 'e', 'f'], 400]]) {
    const res = await approve(token, { draftId: DRAFT_ID, approvedItems: ['x'], editedContent: { social: { x: { caption: 'Hi', hashtags: tags } } } });
    assert.equal(res.statusCode, code, `tags=${tags.length}`);
  }
  assert.equal(publishCalls.length, 0);

  const res3 = await approve(token, { draftId: DRAFT_ID, approvedItems: ['x'], editedContent: { social: { x: { caption: 'Hi', hashtags: ['a', 'b', 'c'] } } } });
  assert.equal(res3.statusCode, 200);

  // Fresh draft for the 5-tag case (the first one is now published).
  const other = 'draft-1727617999999';
  await copyFile(FIXTURE, join(dir, `${other}.json`));
  const res5 = await approve(token, { draftId: other, approvedItems: ['x'], editedContent: { social: { x: { caption: 'Hi', hashtags: '#a #b #c #d #e' } } } });
  assert.equal(res5.statusCode, 200);
});

test('approve: X over 280 characters including hashtags is rejected', async () => {
  const token = await login();
  const res = await approve(token, { draftId: DRAFT_ID, approvedItems: ['x'], editedContent: { social: { x: { caption: 'y'.repeat(275), hashtags: ['a', 'b', 'c'] } } } });
  assert.equal(res.statusCode, 400);
});

test('approve: edits apply only to approved items; X is not validated when not approved', async () => {
  const token = await login();
  const res = await approve(token, {
    draftId: DRAFT_ID,
    approvedItems: ['blog', 'linkedin'],
    editedContent: {
      newsletter: { subject: 'IGNORED' },
      social: {
        linkedin: { caption: 'Edited LinkedIn', hashtags: ['a', 'b', 'c', 'd', 'e'] },
        x: { caption: 'bad', hashtags: [] },
        instagram: { caption: 'IGNORED', hashtags: [] },
      },
    },
  });
  assert.equal(res.statusCode, 200);
  const sent = publishCalls[0];
  assert.deepEqual(Object.keys(sent.social), ['linkedin']);
  assert.equal(sent.social.linkedin.text, 'Edited LinkedIn #a #b #c #d #e');
  assert.equal(sent.newsletter, undefined);
});

test('approve: bad input is rejected with 400', async () => {
  const token = await login();
  for (const body of [
    { draftId: '../secrets', approvedItems: ['blog'] },
    { draftId: DRAFT_ID, approvedItems: [] },
    { draftId: DRAFT_ID, approvedItems: ['myspace'] },
  ]) {
    assert.equal((await approve(token, body)).statusCode, 400, JSON.stringify(body));
  }
  assert.equal((await approve(token, { draftId: 'draft-1000000000000', approvedItems: ['blog'] })).statusCode, 404);
});

test('approve: publisher failure is logged as failure and returns an error; a retry is allowed', async () => {
  const token = await login();
  publishResult = { success: false, published: {}, failures: { blog: 'GITHUB_TOKEN missing' } };
  const res = await approve(token, { draftId: DRAFT_ID, approvedItems: ['blog'], editedContent: {} });
  assert.equal(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.equal(body.success, false);
  assert.match(body.error, /GITHUB_TOKEN missing/);
  const log = await readLog();
  assert.equal(log.entries[0].status, 'failure');
  assert.deepEqual(log.entries[0].errors, [{ item: 'blog', error: 'GITHUB_TOKEN missing' }]);

  publishResult = ALL_OK;
  assert.equal((await approve(token, { draftId: DRAFT_ID, approvedItems: ['blog'], editedContent: {} })).statusCode, 200);
});

test('unknown routes return 404', async () => {
  const res = await handler({ httpMethod: 'GET', path: '/admin-action/nothing' });
  assert.equal(res.statusCode, 404);
});

// ---- pure helpers ----

test('toPublisherDraft maps the engine shape to publisher.js fields', async () => {
  const draft = JSON.parse(await readFile(FIXTURE, 'utf8'));
  const out = toPublisherDraft(mergeEdits(draft, ['newsletter', 'instagram'], {}), ['newsletter', 'instagram']);
  assert.equal(out.blog, undefined);
  assert.equal(out.title, draft.blog.title);
  assert.equal(out.newsletter.subject, draft.newsletter.subject);
  assert.equal(out.newsletter.content, draft.newsletter.body);
  assert.ok(out.social.instagram.text.startsWith(draft.social.instagram.caption));
  assert.deepEqual(Object.keys(out.social), ['instagram']);
});
