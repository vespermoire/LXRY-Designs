import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MAILERLITE_API_KEY = 'test-key';
process.env.MAILERLITE_GROUP_ID = '123456';

const { validateSubmission, handler } = await import('../netlify/functions/subscribe.js');

function evt(bodyObj) {
  return {
    httpMethod: 'POST',
    body: typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj),
  };
}

test('validateSubmission normalizes email', () => {
  const r = validateSubmission({ email: '  A@B.CO ', name: 'X', consent: true });
  assert.equal(r.valid, true);
  assert.equal(r.email, 'a@b.co');
});

test('validateSubmission rejects malformed email', () => {
  assert.equal(validateSubmission({ email: 'foo', consent: true }).valid, false);
});

test('validateSubmission rejects empty email', () => {
  assert.equal(validateSubmission({ email: '', consent: true }).valid, false);
});

test('validateSubmission rejects consent not true', () => {
  assert.equal(validateSubmission({ email: 'a@b.co', consent: false }).valid, false);
});

test('handler ignores honeypot', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, status: 201, json: async () => ({}) };
  };
  const res = await handler(evt({ email: 'a@b.co', consent: true, website: 'x' }));
  assert.equal(res.statusCode, 200);
  assert.equal(called, false);
});

test('handler subscribes valid submission', async () => {
  let url, opts;
  global.fetch = async (u, o) => {
    url = u;
    opts = o;
    return { ok: true, status: 201, json: async () => ({}) };
  };
  const res = await handler(evt({ email: 'a@b.co', name: 'X', consent: true, source: 'ai-kit' }));
  assert.equal(res.statusCode, 200);
  assert.match(url, /connect\.mailerlite\.com\/api\/subscribers/);
  assert.match(opts.headers.Authorization, /^Bearer /);
  assert.match(opts.body, /a@b\.co/);
  // source is NOT forwarded to MailerLite (would require an undocumented custom field)
  assert.ok(!/source/.test(opts.body));
});

test('handler treats existing subscriber (200 upsert) as success', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  const res = await handler(evt({ email: 'a@b.co', consent: true }));
  assert.equal(res.statusCode, 200);
});

test('handler returns 502 on upstream 422 (does not silently claim success)', async () => {
  global.fetch = async () => ({ ok: false, status: 422, json: async () => ({}) });
  const res = await handler(evt({ email: 'a@b.co', consent: true }));
  assert.equal(res.statusCode, 502);
});

test('handler returns 400 on JSON null body', async () => {
  const res = await handler(evt('null'));
  assert.equal(res.statusCode, 400);
});

test('handler returns 502 on upstream 500', async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const res = await handler(evt({ email: 'a@b.co', consent: true }));
  assert.equal(res.statusCode, 502);
});

test('handler returns 400 on invalid JSON', async () => {
  const res = await handler(evt('not json'));
  assert.equal(res.statusCode, 400);
});

test('handler returns 400 on missing consent', async () => {
  const res = await handler(evt({ email: 'a@b.co', consent: false }));
  assert.equal(res.statusCode, 400);
});
