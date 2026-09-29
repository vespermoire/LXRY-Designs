// Operations Dashboard auto-refresh (Task 6): the 5-second loop that calls loadDraft()
// and loadHistory(). The loop lives in <script id="polling-rules"> in admin.html and
// has no DOM dependencies, so it runs here in node:vm with injected fake timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(join(ROOT, 'lxrydesigns/admin.html'), 'utf8');

function loadPollingRules() {
  const m = html.match(/<script id="polling-rules">([\s\S]*?)<\/script>/);
  assert.ok(m, 'admin.html has a <script id="polling-rules"> block');
  const sandbox = { window: {}, Promise };
  vm.runInNewContext(m[1], sandbox);
  return sandbox.window.AdminPolling;
}

const P = loadPollingRules();
const flush = () => new Promise((r) => setImmediate(r));

// Fake interval timers: tick() fires every registered callback once (one 5 s period).
function fakeTimers() {
  const timers = new Map();
  let next = 1;
  return {
    setInterval: (fn, ms) => { timers.set(next, { fn, ms }); return next++; },
    clearInterval: (id) => { timers.delete(id); },
    active: () => [...timers.values()],
    tick: () => { for (const t of [...timers.values()]) t.fn(); },
  };
}

function setup({ draft, history, token = 'tok' } = {}) {
  const timers = fakeTimers();
  const calls = { draft: 0, history: 0, refresh: [] };
  const state = { token };
  let clock = 0;
  const poller = P.createPoller({
    loadDraft: () => { calls.draft++; return draft ? draft(calls.draft) : Promise.resolve({ status: 'loaded' }); },
    loadHistory: () => { calls.history++; return history ? history(calls.history) : Promise.resolve({ status: 'loaded' }); },
    getToken: () => state.token,
    onRefresh: (date, info) => calls.refresh.push({ date, ok: info.ok }),
    now: () => new Date(Date.UTC(2026, 8, 29, 10, 35, clock++)),
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  });
  return { poller, timers, calls, state };
}

// ---- markup ----

test('markup: header has the refresh status with #last-refresh-time', () => {
  const header = html.slice(html.indexOf('<header class="admin-header">'), html.indexOf('</header>'));
  assert.match(header, /id="refresh-status"[^>]*hidden/);
  assert.match(header, /Last updated: <span id="last-refresh-time">Just now<\/span>/);
});

test('markup: logout stops polling before redirecting', () => {
  const m = html.match(/function logout\(\) \{([\s\S]*?)\n        \}/);
  assert.ok(m, 'auth script defines logout()');
  const body = m[1];
  assert.ok(body.indexOf('window.stopPolling()') !== -1, 'logout calls stopPolling');
  assert.ok(body.indexOf('stopPolling') < body.indexOf('location.href'), 'stops before navigating');
  assert.match(html, /logoutBtn\.addEventListener\('click', logout\)/);
  assert.match(html, /logout: logout/);
});

// ---- formatClock ----

test('formatClock: zero-padded HH:MM:SS in local time', () => {
  assert.equal(P.formatClock(new Date(2026, 8, 29, 10, 35, 5)), '10:35:05');
  assert.equal(P.formatClock(new Date(2026, 8, 29, 0, 0, 0)), '00:00:00');
  assert.equal(P.formatClock(new Date(2026, 8, 29, 23, 9, 59)), '23:09:59');
});

// ---- loop ----

test('start: refreshes immediately, then every 5 seconds', async () => {
  const { poller, timers, calls } = setup();
  await poller.start();
  assert.equal(P.INTERVAL_MS, 5000);
  assert.equal(timers.active().length, 1);
  assert.equal(timers.active()[0].ms, 5000);
  assert.equal(calls.draft, 1);
  assert.equal(calls.history, 1);
  assert.ok(poller.isRunning());

  for (let i = 0; i < 3; i++) { timers.tick(); await flush(); }
  assert.equal(calls.draft, 4);
  assert.equal(calls.history, 4);
});

test('timestamp: onRefresh fires after each poll with a new time', async () => {
  const { poller, timers, calls } = setup();
  await poller.start();
  timers.tick(); await flush();
  timers.tick(); await flush();
  assert.equal(calls.refresh.length, 3);
  assert.ok(calls.refresh.every((r) => r.ok));
  const times = calls.refresh.map((r) => r.date.getTime());
  assert.equal(new Set(times).size, 3, 'each poll gets its own timestamp');
});

test('start twice: restarts, never two intervals', async () => {
  const { poller, timers } = setup();
  await poller.start();
  await poller.start();
  assert.equal(timers.active().length, 1);
});

test('stop: clears the interval, no further polls', async () => {
  const { poller, timers, calls } = setup();
  await poller.start();
  poller.stop();
  assert.equal(timers.active().length, 0);
  assert.equal(poller.isRunning(), false);
  timers.tick(); await flush();
  assert.equal(calls.draft, 1);
});

test('errors: polling continues and onRefresh reports ok=false', async () => {
  const { poller, timers, calls } = setup({
    draft: (n) => Promise.resolve(n === 2 ? { status: 'error', error: 'Server error 500.' } : { status: 'loaded' }),
  });
  await poller.start();
  timers.tick(); await flush(); // draft 500
  timers.tick(); await flush(); // recovers
  assert.equal(calls.draft, 3);
  assert.equal(calls.history, 3);
  assert.deepEqual(calls.refresh.map((r) => r.ok), [true, false, true]);
  assert.ok(poller.isRunning());
});

test('errors: a loader that throws or rejects does not stop the other or the loop', async () => {
  const { poller, timers, calls } = setup({
    draft: () => { throw new Error('boom'); },
    history: () => Promise.reject(new Error('network')),
  });
  const r = await poller.start();
  assert.equal(r.status, 'error');
  assert.equal(calls.history, 1, 'history still loaded when draft threw');
  timers.tick(); await flush();
  assert.equal(calls.draft, 2);
  assert.ok(poller.isRunning());
});

test('404 empty draft counts as a good refresh', async () => {
  const { poller, calls } = setup({ draft: () => Promise.resolve({ status: 'empty' }) });
  await poller.start();
  assert.equal(calls.refresh[0].ok, true);
});

test('401: a loader reporting unauthenticated stops the loop without a timestamp', async () => {
  const { poller, timers, calls } = setup({
    history: (n) => Promise.resolve(n === 2 ? { status: 'unauthenticated' } : { status: 'loaded' }),
  });
  await poller.start();
  timers.tick(); await flush();
  assert.equal(poller.isRunning(), false);
  assert.equal(timers.active().length, 0);
  assert.equal(calls.refresh.length, 1);
});

test('no token: refresh stops the loop and calls no loader', async () => {
  const { poller, timers, calls, state } = setup();
  await poller.start();
  state.token = null;
  timers.tick(); await flush();
  assert.equal(calls.draft, 1);
  assert.equal(poller.isRunning(), false);
});

test('slow poll: a tick during an in-flight refresh is skipped, not stacked', async () => {
  let release;
  const { poller, timers, calls } = setup({
    draft: (n) => (n === 1 ? new Promise((r) => { release = () => r({ status: 'loaded' }); }) : Promise.resolve({ status: 'loaded' })),
  });
  const first = poller.start();
  timers.tick(); timers.tick();
  await flush();
  assert.equal(calls.draft, 1);
  release();
  await first;
  assert.equal(calls.refresh.length, 1);
  timers.tick(); await flush();
  assert.equal(calls.draft, 2);
});

test('onRefresh that throws does not wedge the loop', async () => {
  const timers = fakeTimers();
  let n = 0;
  const poller = P.createPoller({
    loadDraft: () => { n++; return Promise.resolve({ status: 'loaded' }); },
    loadHistory: () => Promise.resolve({ status: 'loaded' }),
    getToken: () => 'tok',
    onRefresh: () => { throw new Error('display'); },
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  });
  await poller.start();
  timers.tick(); await flush();
  assert.equal(n, 2);
});
