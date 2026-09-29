// Operations Dashboard publish history (Task 5): markup, formatting, merging and
// loadHistory(). The logic lives in <script id="history-rules"> in admin.html and
// has no DOM dependencies, so it runs here in node:vm without a browser. The
// GET publish-log endpoint is exercised against the real handler (file backend).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(join(ROOT, 'lxrydesigns/admin.html'), 'utf8');

function loadHistoryRules() {
  const m = html.match(/<script id="history-rules">([\s\S]*?)<\/script>/);
  assert.ok(m, 'admin.html has a <script id="history-rules"> block');
  const sandbox = { window: {} };
  vm.runInNewContext(m[1], sandbox);
  return sandbox.window.AdminHistory;
}

const H = loadHistoryRules();
// Arrays built inside node:vm come from another realm; copy before deepEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

const SUCCESS = {
  timestamp: '2026-09-15T09:05:00.000Z',
  draftId: 'draft-1757926800000',
  status: 'success',
  itemsPublished: ['blog', 'newsletter', 'instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'youtube'],
  itemsSkipped: [],
  errors: [],
};
const PARTIAL = {
  timestamp: '2026-09-22T10:30:00.000Z',
  draftId: 'draft-1758531600000',
  status: 'partial',
  itemsPublished: ['blog', 'newsletter', 'instagram', 'linkedin', 'x'],
  itemsSkipped: ['youtube'],
  errors: [
    { item: 'tiktok', error: 'Buffer API connection timeout' },
    { item: 'facebook', error: '403 Forbidden - check credentials' },
  ],
};
const FAILURE = {
  timestamp: '2026-09-29T14:00:00.000Z',
  draftId: 'draft-1759136400000',
  status: 'failure',
  itemsPublished: [],
  itemsSkipped: ['blog'],
  errors: [{ item: 'newsletter', error: 'MailerLite 401 Unauthorized' }],
};

// ---- markup ----

test('markup: history section with Date | Status | Items | Details headers', () => {
  const start = html.indexOf('<div id="publish-history"');
  assert.notEqual(start, -1, '#publish-history exists');
  const section = html.slice(start, html.indexOf('</section>', start));
  assert.match(section, /<section class="history-section"/);
  assert.match(section, /<h2[^>]*>Publish History<\/h2>/);
  const headers = [...section.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, ['Date', 'Status', 'Items', 'Details']);
  assert.match(section, /<tbody id="history-rows">/);
  assert.match(section, /id="history-empty"[^>]*>No publishes yet</);
});

test('markup: window.loadHistory is exposed for Task 6 polling', () => {
  assert.match(html, /window\.loadHistory\s*=/);
});

// ---- formatting ----

test('formatShort: "Sep 22, 10:30 AM UTC", year only when not the current year', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  assert.equal(H.formatShort('2026-09-22T10:30:00.000Z', now), 'Sep 22, 10:30 AM UTC');
  assert.equal(H.formatShort('2026-01-05T00:07:00Z', now), 'Jan 5, 12:07 AM UTC');
  assert.equal(H.formatShort('2026-03-01T12:00:00Z', now), 'Mar 1, 12:00 PM UTC');
  assert.equal(H.formatShort('2025-12-31T23:59:00Z', now), 'Dec 31 2025, 11:59 PM UTC');
  assert.equal(H.formatShort('not a date', now), 'not a date');
  assert.equal(H.formatShort(undefined, now), 'Unknown date');
});

test('formatLong: "2026-09-22 10:30 AM UTC" with plain ASCII spaces', () => {
  const s = H.formatLong('2026-09-22T10:30:00.000Z');
  assert.equal(s, '2026-09-22 10:30 AM UTC');
  assert.doesNotMatch(s, /[  ]/);
});

test('status badges: success and partial are ✓, failure is ✗', () => {
  assert.equal(H.statusInfo('success').symbol, '✓');
  assert.equal(H.statusInfo('partial').symbol, '✓');
  assert.equal(H.statusInfo('failure').symbol, '✗');
  assert.equal(H.statusInfo('success').tone, 'ok');
  assert.equal(H.statusInfo('failure').tone, 'fail');
  assert.equal(H.statusInfo('publishing').label, 'In progress');
  assert.equal(H.statusInfo('weird').symbol, '?');
});

test('itemsSummary: named blog/newsletter plus a social count', () => {
  assert.equal(H.itemsSummary(SUCCESS), 'Blog, Newsletter, 6 social');
  assert.equal(H.itemsSummary(PARTIAL), 'Blog, Newsletter, 3 social');
  assert.equal(H.itemsSummary({ itemsPublished: ['x', 'newsletter'] }), 'Newsletter, 1 social');
  assert.equal(H.itemsSummary(FAILURE), 'None');
  assert.equal(H.itemsSummary({ status: 'publishing', itemsPublished: [] }), 'Publishing...');
  assert.equal(H.itemsSubline(PARTIAL), '2 failed · 1 skipped');
  assert.equal(H.itemsSubline(SUCCESS), '');
});

test('detailsText: plain, copy-paste friendly error report', () => {
  const text = H.detailsText(PARTIAL);
  assert.equal(text, [
    'Publishing: 2026-09-22 10:30 AM UTC',
    'Draft: draft-1758531600000',
    'Status: Partial',
    '',
    'Published: Blog ✓, Newsletter ✓, Instagram ✓, LinkedIn ✓, X ✓',
    'Failed: TikTok ✗ (Buffer API connection timeout), Facebook ✗ (403 Forbidden - check credentials)',
    'Skipped: YouTube',
    '',
    'Errors:',
    'TikTok: Buffer API connection timeout',
    'Facebook: 403 Forbidden - check credentials',
  ].join('\n'));
  assert.doesNotMatch(text, /[<>]|&[a-z]+;/, 'no markup or entities');
});

test('detailsText: success, failure, string errors and long errors', () => {
  assert.match(H.detailsText(SUCCESS), /\nErrors: none$/);
  assert.doesNotMatch(H.detailsText(SUCCESS), /Failed:/);
  const fail = H.detailsText(FAILURE);
  assert.match(fail, /^Status: Failed$/m);
  assert.match(fail, /^Published: none$/m);
  assert.match(fail, /^Newsletter: MailerLite 401 Unauthorized$/m);
  const long = 'x'.repeat(120);
  const odd = H.detailsText({ timestamp: SUCCESS.timestamp, status: 'failure', errors: ['boom', { item: 'x', error: long }] });
  assert.match(odd, /^General: boom$/m);
  assert.match(odd, new RegExp(`^X: ${long}$`, 'm'), 'full error kept in the Errors list');
  assert.match(odd, /X ✗ \(x{37}\.\.\.\)/, 'Failed line is truncated');
});

// ---- sorting + merging ----

test('sortEntries: newest first, unreadable timestamps last', () => {
  const sorted = H.sortEntries([SUCCESS, { draftId: 'bad', timestamp: 'nope' }, FAILURE, PARTIAL]);
  assert.deepEqual(plain(sorted.map((e) => e.draftId)),
    [FAILURE.draftId, PARTIAL.draftId, SUCCESS.draftId, 'bad']);
});

test('mergeEntries: keeps old entries, adds new ones, updates changed ones', () => {
  const first = H.mergeEntries([], [SUCCESS]);
  const second = H.mergeEntries(first, [PARTIAL]); // server list missing SUCCESS
  assert.deepEqual(plain(second.map((e) => e.draftId)), [PARTIAL.draftId, SUCCESS.draftId]);
  const edited = { ...PARTIAL, errors: [] };
  const third = H.mergeEntries(second, [edited, SUCCESS]);
  assert.equal(third.length, 2);
  assert.equal(third[0].errors.length, 0);
});

test('mergeEntries: drops an in-progress marker the server has replaced', () => {
  const marker = { timestamp: '2026-09-29T14:00:00.000Z', draftId: 'draft-1', status: 'publishing', itemsPublished: [], errors: [] };
  const done = { ...marker, timestamp: '2026-09-29T14:00:09.000Z', status: 'success', itemsPublished: ['blog'] };
  const withMarker = H.mergeEntries([SUCCESS], [marker, SUCCESS]);
  assert.equal(withMarker.length, 2);
  const after = H.mergeEntries(withMarker, [done, SUCCESS]);
  assert.deepEqual(plain(after.map((e) => e.status)), ['success', 'success']);
});

// ---- loadHistory() ----

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)),
  };
}

function makeLoader({ token = 'tok', responses }) {
  const calls = { fetch: [], render: [], logout: 0 };
  const queue = [...responses];
  const loader = H.createHistoryLoader({
    getToken: () => token,
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    onUnauthenticated: () => { calls.logout++; },
    render: (entries, info) => calls.render.push({ entries: plain(entries), info: plain(info) }),
  });
  return { loader, calls };
}

test('loadHistory: fetches the publish log with the session token and parses JSON', async () => {
  const { loader, calls } = makeLoader({ responses: [response(200, { entries: [SUCCESS, FAILURE, PARTIAL] })] });
  const r = await loader.load();
  assert.deepEqual(plain(r), { status: 'loaded', count: 3 });
  assert.equal(calls.fetch[0].url, '/admin-action/publish-log');
  assert.equal(calls.fetch[0].init.headers['x-admin-token'], 'tok');
  assert.equal(calls.fetch[0].init.cache, 'no-store');
  const rendered = calls.render.at(-1).entries;
  assert.deepEqual(rendered.map((e) => e.draftId), [FAILURE.draftId, PARTIAL.draftId, SUCCESS.draftId]);
});

test('loadHistory: empty log resolves "empty" and renders no rows', async () => {
  const { loader, calls } = makeLoader({ responses: [response(200, { entries: [] })] });
  assert.equal((await loader.load()).status, 'empty');
  assert.deepEqual(calls.render.at(-1).entries, []);
  assert.equal(calls.render.at(-1).info.error, undefined);
});

test('loadHistory: repeated polls append without clearing earlier entries', async () => {
  const { loader, calls } = makeLoader({
    responses: [response(200, { entries: [SUCCESS] }), response(200, { entries: [PARTIAL] })],
  });
  await loader.load();
  await loader.load();
  assert.deepEqual(calls.render.at(-1).entries.map((e) => e.draftId), [PARTIAL.draftId, SUCCESS.draftId]);
});

test('loadHistory: overlapping calls share one request', async () => {
  const { loader, calls } = makeLoader({ responses: [response(200, { entries: [SUCCESS] })] });
  const [a, b] = await Promise.all([loader.load(), loader.load()]);
  assert.equal(calls.fetch.length, 1);
  assert.deepEqual(plain(a), plain(b));
});

test('loadHistory: 401 clears the rows and logs the user out', async () => {
  const { loader, calls } = makeLoader({
    responses: [response(200, { entries: [SUCCESS] }), response(401, { error: 'Invalid or expired session' })],
  });
  await loader.load();
  const r = await loader.load();
  assert.equal(r.status, 'unauthenticated');
  assert.equal(calls.logout, 1);
  assert.deepEqual(calls.render.at(-1).entries, []);
  assert.deepEqual(plain(loader.getEntries()), []);
});

test('loadHistory: no token logs out without calling the server', async () => {
  const { loader, calls } = makeLoader({ token: null, responses: [] });
  assert.equal((await loader.load()).status, 'unauthenticated');
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.logout, 1);
});

test('loadHistory: server and network errors keep the last loaded rows', async () => {
  const { loader, calls } = makeLoader({
    responses: [
      response(200, { entries: [SUCCESS] }),
      response(500, { error: 'Server error' }),
      new Error('offline'),
      response(200, new SyntaxError('bad json')),
      response(200, { nope: true }),
    ],
  });
  await loader.load();
  for (const expected of ['Server error 500.', 'Could not reach the server.', 'could not be read', 'could not be read']) {
    const r = await loader.load();
    assert.equal(r.status, 'error');
    assert.match(r.error, new RegExp(expected.replace('.', '\\.')));
    assert.equal(calls.render.at(-1).entries.length, 1, 'old rows kept');
  }
  assert.equal(calls.logout, 0);
});

// ---- GET /admin-action/publish-log ----

process.env.ADMIN_STORE = 'fs';
process.env.ADMIN_PASSWORD = 'correct horse';
const { createHandler } = await import('../../netlify/functions/admin-action.js');
const handler = createHandler({ publish: async () => ({ success: true, published: {}, failures: {} }) });
let dir;

beforeEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = await mkdtemp(join(tmpdir(), 'admin-history-'));
  process.env.ADMIN_DATA_DIR = dir;
});

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function login() {
  const res = await handler({ httpMethod: 'POST', path: '/admin-check-password', body: JSON.stringify({ password: 'correct horse' }) });
  return JSON.parse(res.body).token;
}

const getLog = (token) => handler({
  httpMethod: 'GET',
  path: '/.netlify/functions/admin-action/publish-log',
  headers: token ? { 'X-Admin-Token': token } : {},
});

test('GET publish-log: 401 without a valid token', async () => {
  assert.equal((await getLog()).statusCode, 401);
  assert.equal((await getLog('nope')).statusCode, 401);
});

test('GET publish-log: returns entries (empty when no log yet), not cached', async () => {
  const token = await login();
  let res = await getLog(token);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(res.body), { entries: [] });

  await writeFile(join(dir, 'publish-log.json'), JSON.stringify({ entries: [PARTIAL, SUCCESS] }));
  res = await getLog(token);
  assert.deepEqual(JSON.parse(res.body).entries.map((e) => e.draftId), [PARTIAL.draftId, SUCCESS.draftId]);
});
