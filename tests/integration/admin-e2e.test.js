// Operations Dashboard end-to-end flow (Task 7).
//
// No browser and no npm packages: the page's own inline scripts from admin.html
// (session/auth, dashboard rules, dashboard grid, history rules) run in node:vm
// against a small stub DOM, and the page's fetch() is routed to the real
// admin-action handler with the file backend in a temp dir. The only thing
// faked on the server side is the outbound publisher (blog/MailerLite/Buffer),
// so nothing leaves the machine.
//
// Flow: /admin -> password form -> log in -> draft shown -> approve items ->
// "Approve & Publish All" -> success in history -> reload keeps the session ->
// log out -> password form again, footer link hidden.
//
// The history DOM script and the Task 6 polling script are not run here: they
// build table rows and timers, which need a real DOM. History is exercised
// through the same AdminHistory.createHistoryLoader() the page uses.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const adminHtml = readFileSync(join(ROOT, 'lxrydesigns/admin.html'), 'utf8');
const indexHtml = readFileSync(join(ROOT, 'lxrydesigns/index.html'), 'utf8');
const netlifyToml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
const fixture = readFileSync(join(ROOT, 'netlify/.drafts/draft-test.json'), 'utf8');

// Arrays/objects built inside node:vm come from another realm; copy before deepEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---- password: environment, then .env, then a throwaway test value ----

function resolvePassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    const m = readFileSync(join(ROOT, '.env'), 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m);
    const value = m && m[1].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value) return value;
  } catch (err) { /* no .env: fall through */ }
  return 'e2e-test-password';
}

const PASSWORD = resolvePassword();
process.env.ADMIN_PASSWORD = PASSWORD;
process.env.ADMIN_STORE = 'fs';

// ---- inline scripts ----

function inlineScripts(html) {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1] || '') && !/application\/ld\+json/.test(m[1] || ''))
    .map((m) => ({ attrs: m[1] || '', code: m[2] }));
}

const ADMIN_SCRIPTS = (() => {
  const all = inlineScripts(adminHtml);
  const pick = (label, test) => {
    const s = all.find(test);
    assert.ok(s, `admin.html has the ${label} script`);
    return s.code;
  };
  return [
    pick('session/auth', (s) => s.code.includes("SESSION_KEY = 'admin_session'")),
    pick('dashboard-rules', (s) => /id="dashboard-rules"/.test(s.attrs)),
    pick('dashboard grid', (s) => s.code.includes("DRAFT_ENDPOINT = '/admin-action/draft'")),
    pick('history-rules', (s) => /id="history-rules"/.test(s.attrs)),
  ];
})();

const FOOTER_SCRIPT = (() => {
  const s = inlineScripts(indexHtml).find((x) => /id="admin-link-script"/.test(x.attrs));
  assert.ok(s, 'index.html has <script id="admin-link-script">');
  return s.code;
})();

// ---- stub DOM ----
// Elements are created on demand from ids and selectors, but only when the
// matching markup exists in the HTML, so a renamed id or class fails the test.

class ClassList {
  constructor(names) { this.set = new Set(names); }
  contains(n) { return this.set.has(n); }
  add(...n) { n.forEach((x) => this.set.add(x)); }
  remove(...n) { n.forEach((x) => this.set.delete(x)); }
  toggle(n, force) {
    const on = force === undefined ? !this.set.has(n) : !!force;
    if (on) this.set.add(n); else this.set.delete(n);
    return on;
  }
}

class FakeElement {
  constructor(doc, { id = '', tag = 'div', classes = [], hidden = false, markup = '', parent = null } = {}) {
    this.ownerDocument = doc;
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.classList = new ClassList(classes);
    this.hidden = hidden;
    this.markup = markup;
    this.parent = parent;
    this.attributes = {};
    this.listeners = {};
    this.children = new Map();
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.title = '';
    this.style = {};
  }
  get className() { return [...this.classList.set].join(' '); }
  set className(v) { this.classList = new ClassList(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  matches(selectorList) {
    return selectorList.split(',').map((s) => s.trim()).some((s) => {
      if (/^\.[\w-]+$/.test(s)) return this.classList.contains(s.slice(1));
      if (/^#[\w-]+$/.test(s)) return this.id === s.slice(1);
      throw new Error(`stub DOM: unsupported matches() selector "${s}"`);
    });
  }
  closest(selectorList) {
    for (let el = this; el; el = el.parent) if (el.matches(selectorList)) return el;
    return null;
  }
  // Supported: '.content-card[data-type="x"]' on #dashboard, and '.class' or
  // '[data-bind="x"]' inside a card.
  querySelector(selector) {
    if (this.children.has(selector)) return this.children.get(selector);
    let child = null;
    const cardSel = /^\.content-card\[data-type="([a-z]+)"\]$/.exec(selector);
    if (cardSel) {
      const start = this.markup.indexOf(`<article class="content-card" data-type="${cardSel[1]}"`);
      if (start !== -1) {
        child = new FakeElement(this.ownerDocument, {
          tag: 'article', classes: ['content-card'], parent: this,
          markup: this.markup.slice(start, this.markup.indexOf('</article>', start)),
        });
        child.setAttribute('data-type', cardSel[1]);
      }
    } else if (/^\.[\w-]+$/.test(selector)) {
      const cls = selector.slice(1);
      if (new RegExp(`class="[^"]*\\b${cls}\\b`).test(this.markup)) {
        child = new FakeElement(this.ownerDocument, { classes: [cls], parent: this });
      }
    } else if (/^\[data-bind="[\w-]+"\]$/.test(selector)) {
      if (this.markup.includes(selector.slice(1, -1))) {
        child = new FakeElement(this.ownerDocument, { parent: this });
      }
    } else {
      throw new Error(`stub DOM: unsupported querySelector "${selector}"`);
    }
    this.children.set(selector, child);
    return child;
  }
  // Runs listeners on this element, then bubbles to its ancestors.
  dispatch(type) {
    const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (let el = this; el; el = el.parent) {
      for (const fn of el.listeners[type] || []) fn.call(el, event);
    }
    return event;
  }
  click() { return this.disabled ? null : this.dispatch('click'); }
}

function makeDocument(html) {
  const byId = new Map();
  const doc = {
    activeElement: null,
    visibilityState: 'visible',
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    getElementById(id) {
      if (byId.has(id)) return byId.get(id);
      const m = new RegExp(`<([a-z]+)\\b([^>]*\\bid="${id}"[^>]*)>`).exec(html);
      let el = null;
      if (m) {
        const attrs = m[2];
        const cls = /\bclass="([^"]*)"/.exec(attrs);
        el = new FakeElement(doc, {
          id, tag: m[1],
          classes: cls ? cls[1].split(/\s+/).filter(Boolean) : [],
          hidden: /\shidden(?=[\s>=\/]|$)/.test(attrs),
        });
        const disabled = /\sdisabled(?=[\s>=\/]|$)/.test(attrs);
        el.disabled = disabled;
        const style = /\bstyle="([^"]*)"/.exec(attrs);
        if (style) {
          for (const decl of style[1].split(';')) {
            const [k, v] = decl.split(':').map((x) => x && x.trim());
            if (k && v) el.style[k] = v;
          }
        }
        if (id === 'dashboard') {
          const start = m.index;
          el.markup = html.slice(start, html.indexOf('<div id="publish-history"', start));
        }
      }
      byId.set(id, el);
      return el;
    },
  };
  return doc;
}

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

// ---- server: real handler, fake publisher, fetch routed like netlify.toml ----

let dataDir;
let handler;
const published = []; // publisher drafts the fake publisher received

async function fakePublish(pubDraft) {
  published.push(pubDraft);
  const out = { success: true, published: {}, failures: {} };
  if (pubDraft.blog) out.published.blog = { success: true };
  if (pubDraft.newsletter) out.published.newsletter = { success: true, subject: pubDraft.newsletter.subject };
  if (pubDraft.social) {
    const platforms = {};
    for (const p of Object.keys(pubDraft.social)) platforms[p] = { success: true };
    out.published.social = { success: true, platforms };
  }
  return out;
}

// '/admin-check-password' and '/admin-action/*' mirror the netlify.toml rewrites.
function toFunctionPath(url) {
  if (url === '/admin-check-password') return '/.netlify/functions/admin-action/check-password';
  if (url.startsWith('/admin-action/')) return '/.netlify/functions/admin-action/' + url.slice('/admin-action/'.length);
  return null;
}

function makeServer() {
  const calls = [];
  const pending = new Set();
  const fetch = (url, init = {}) => {
    const method = init.method || 'GET';
    const headers = { ...(init.headers || {}) };
    calls.push({ url, method, headers, body: init.body ? JSON.parse(init.body) : undefined });
    const p = (async () => {
      const path = toFunctionPath(url);
      const res = path
        ? await handler({ httpMethod: method, path, headers, body: init.body ?? null })
        : { statusCode: 404, headers: {}, body: JSON.stringify({ error: 'Not found' }) };
      return {
        status: res.statusCode,
        ok: res.statusCode >= 200 && res.statusCode < 300,
        headers: res.headers,
        json: async () => JSON.parse(res.body),
      };
    })();
    const done = () => pending.delete(p);
    pending.add(p);
    p.then(done, done);
    return p;
  };
  // Waits until every request (including ones started by earlier responses) has
  // resolved and the page's promise chains have run.
  const flush = async () => {
    for (let i = 0; i < 100; i++) {
      if (pending.size) await Promise.allSettled([...pending]);
      await new Promise((r) => setImmediate(r));
      if (!pending.size) return;
    }
    throw new Error('flush: requests never settled');
  };
  return { fetch, flush, calls };
}

// ---- pages ----

// Opens /admin: a fresh document and window sharing `storage` and `server`,
// which is what a reload does in a real browser.
function openAdmin({ storage, server }) {
  const doc = makeDocument(adminHtml);
  const timers = [];
  const win = {
    document: doc,
    localStorage: storage,
    location: { href: '/admin', pathname: '/admin' },
    fetch: server.fetch,
    confirm: () => true,
    console,
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    clearTimeout: () => {},
    setInterval: (fn, ms) => timers.push({ fn, ms, repeat: true }),
    clearInterval: () => {},
  };
  win.window = win;
  vm.createContext(win);
  for (const code of ADMIN_SCRIPTS) vm.runInContext(code, win);

  // Same wiring as the page's history script: token from the session, 401 logs out.
  const history = { renders: [] };
  history.loader = win.AdminHistory.createHistoryLoader({
    getToken: () => win.adminSession.getToken(),
    fetch: server.fetch,
    onUnauthenticated: () => win.adminSession.logout(),
    render: (entries, info) => history.renders.push({ entries: plain(entries), info: plain(info || {}) }),
  });
  history.calls = 0;
  win.loadHistory = () => { history.calls++; return history.loader.load(); };

  const $ = (id) => {
    const el = doc.getElementById(id);
    assert.ok(el, `#${id} exists in admin.html`);
    return el;
  };
  const card = (type) => $('dashboard').querySelector(`.content-card[data-type="${type}"]`);
  const inCard = (type, sel) => card(type).querySelector(sel);

  async function login(password) {
    $('admin-password').value = password;
    $('login-form').dispatch('submit');
    await server.flush();
  }

  return { win, doc, $, card, inCard, history, login };
}

// Runs the footer script from index.html with the given storage.
function openHome(storage) {
  const doc = makeDocument(indexHtml);
  const win = { document: doc, localStorage: storage, console };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(FOOTER_SCRIPT, win);
  return doc.getElementById('admin-link');
}

function isLoginView(page) {
  return !page.$('login-section').hidden && page.$('dashboard').hidden &&
    page.$('publish-history').hidden && page.$('logout-btn').hidden;
}

function isDashboardView(page) {
  return page.$('login-section').hidden && !page.$('dashboard').hidden &&
    !page.$('publish-history').hidden && !page.$('logout-btn').hidden;
}

// ---- lifecycle ----

const DRAFT_ID = `draft-${Date.now()}`;
const storage = new MemoryStorage();
let server;
let page;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'admin-e2e-'));
  process.env.ADMIN_DATA_DIR = dataDir;
  const { createHandler } = await import('../../netlify/functions/admin-action.js');
  handler = createHandler({ publish: fakePublish });
  await writeFile(join(dataDir, `${DRAFT_ID}.json`), fixture);
  server = makeServer();
});

after(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

// ---- 1. page + routing ----

test('page loads at /admin: rewrite to admin.html and API rewrites exist', () => {
  assert.match(netlifyToml, /from = "\/admin"\s+to = "\/admin\.html"\s+status = 200/);
  assert.match(netlifyToml, /from = "\/admin-check-password"\s+to = "\/\.netlify\/functions\/admin-action\/check-password"/);
  assert.match(netlifyToml, /from = "\/admin-action\/\*"\s+to = "\/\.netlify\/functions\/admin-action\/:splat"/);
  assert.match(adminHtml, /<title>[^<]+<\/title>/);
  assert.match(adminHtml, /<meta name="robots" content="noindex/i);
});

// ---- 2. logged out ----

test('logged out: password form visible, dashboard and history hidden', async () => {
  page = openAdmin({ storage, server });
  await server.flush();
  assert.ok(isLoginView(page), 'login view');
  assert.equal(page.doc.activeElement, page.$('admin-password'), 'password field focused');
  assert.equal(server.calls.length, 0, 'no API calls without a session');
});

test('logged out: footer link is hidden and points at /admin', () => {
  assert.match(indexHtml, /<a href="\/admin" id="admin-link" class="admin-link" style="display: none;"[^>]*>Operations<\/a>/);
  const link = openHome(storage);
  assert.equal(link.style.display, 'none');
});

test('login: wrong password shows an error and stays on the form', async () => {
  await page.login(PASSWORD + '-wrong');
  assert.ok(isLoginView(page));
  assert.equal(page.$('login-error').textContent, 'Incorrect password');
  assert.equal(storage.getItem('admin_session'), null);
  assert.equal(page.$('login-submit').disabled, false);
});

// ---- 3. log in ----

test('login: correct password shows the dashboard with the current draft', async () => {
  await page.login(PASSWORD);
  assert.ok(isDashboardView(page), 'dashboard view');
  assert.equal(page.$('login-error').textContent, '');
  assert.equal(page.$('admin-password').value, '', 'password cleared from the field');

  const session = JSON.parse(storage.getItem('admin_session'));
  assert.match(session.token, /^[0-9a-f]{32}$/);
  assert.equal(session.ttl, 7 * 24 * 60 * 60 * 1000);

  const draftCall = server.calls.find((c) => c.url === '/admin-action/draft');
  assert.ok(draftCall, 'draft requested after login');
  assert.equal(draftCall.headers['x-admin-token'], session.token);

  assert.equal(page.$('draft-body').hidden, false, 'draft shown');
  assert.equal(page.$('draft-empty').hidden, true);
  assert.match(page.$('draft-meta').textContent, new RegExp(`${DRAFT_ID}$`));
  assert.equal(page.inCard('blog', '[data-bind="title"]').textContent, JSON.parse(fixture).blog.title);
  assert.equal(page.$('approval-summary').textContent, '0 approved · 8 pending · 0 rejected');
  assert.equal(page.$('publish-all-btn').disabled, true, 'nothing approved yet');
});

test('logged in: footer link is visible', () => {
  assert.equal(openHome(storage).style.display, 'inline');
});

test('footer link: hidden for expired, corrupt or blocked sessions', () => {
  const expired = new MemoryStorage();
  expired.setItem('admin_session', JSON.stringify({ token: 'abc', timestamp: Date.now() - 8 * 864e5, ttl: 7 * 864e5 }));
  assert.equal(openHome(expired).style.display, 'none', 'expired');

  const corrupt = new MemoryStorage();
  corrupt.setItem('admin_session', '{not json');
  assert.equal(openHome(corrupt).style.display, 'none', 'corrupt');

  const noToken = new MemoryStorage();
  noToken.setItem('admin_session', JSON.stringify({ timestamp: Date.now(), ttl: 864e5 }));
  assert.equal(openHome(noToken).style.display, 'none', 'no token');

  const blocked = { getItem() { throw new Error('SecurityError'); } };
  assert.equal(openHome(blocked).style.display, 'none', 'storage blocked');
});

// ---- 4. approve + publish ----

const APPROVE = ['blog', 'newsletter', 'x'];

test('approve: items move to Approved and the summary updates', () => {
  for (const type of APPROVE) {
    assert.equal(page.inCard(type, '.validation-badge').classList.contains('is-valid'), true, `${type} valid`);
    page.inCard(type, '.btn-approve').click();
    assert.equal(page.inCard(type, '.status-badge').textContent, '✓ Approved', type);
    assert.equal(page.card(type).getAttribute('data-status'), 'approved');
    assert.equal(page.inCard(type, '.btn-approve').disabled, true, `${type} cannot be approved twice`);
  }
  page.inCard('tiktok', '.btn-reject').click();
  assert.equal(page.inCard('tiktok', '.status-badge').textContent, '✗ Rejected');

  assert.deepEqual(plain(page.win.adminDashboard.getApprovedItems()), APPROVE);
  assert.equal(page.$('approval-summary').textContent, '3 approved · 4 pending · 1 rejected');
  assert.equal(page.$('publish-all-btn').disabled, false);
});

test('Approve & Publish All: publishes the approved items and history shows success', async () => {
  const before = server.calls.length;
  page.$('publish-all-btn').click();
  assert.equal(page.$('publish-all-btn').textContent, 'Publishing...');
  await server.flush();

  const approveCall = server.calls.slice(before).find((c) => c.url === '/admin-action/approve');
  assert.ok(approveCall, 'approve endpoint called');
  assert.equal(approveCall.method, 'POST');
  assert.equal(approveCall.headers['x-admin-token'], JSON.parse(storage.getItem('admin_session')).token);
  assert.equal(approveCall.body.draftId, DRAFT_ID);
  assert.deepEqual(approveCall.body.approvedItems, APPROVE);

  // Only approved items reached the publisher.
  assert.equal(published.length, 1);
  assert.ok(published[0].blog && published[0].newsletter);
  assert.deepEqual(Object.keys(published[0].social), ['x']);

  assert.equal(page.$('publish-message').textContent, 'Published 3 items: Blog post, Newsletter, X.');
  assert.ok(page.$('publish-message').classList.contains('is-ok'));
  assert.equal(page.$('publish-all-btn').textContent, 'Approve & Publish All');

  // The page refreshes history straight after publishing.
  assert.equal(page.history.calls, 1);
  const logCall = server.calls.slice(before).find((c) => c.url === '/admin-action/publish-log');
  assert.ok(logCall, 'publish log requested');
  const { entries, info } = page.history.renders.at(-1);
  assert.equal(info.error, undefined);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].draftId, DRAFT_ID);
  assert.equal(entries[0].status, 'success');
  assert.deepEqual(entries[0].itemsPublished, APPROVE);
  assert.deepEqual(entries[0].itemsSkipped, ['instagram', 'tiktok', 'linkedin', 'facebook', 'youtube']);
  assert.equal(page.win.AdminHistory.statusInfo(entries[0].status).symbol, '✓');
  assert.equal(page.win.AdminHistory.itemsSummary(entries[0]), 'Blog, Newsletter, 1 social');

  // Stored on the server too, not just in the page.
  const log = JSON.parse(await readFile(join(dataDir, 'publish-log.json'), 'utf8'));
  assert.equal(log.entries[0].status, 'success');
});

test('publish again: the server refuses to publish the same draft twice', async () => {
  page.$('publish-all-btn').click();
  await server.flush();
  assert.equal(published.length, 1, 'publisher not called again');
  assert.equal(page.$('publish-message').textContent, 'Publish failed: Draft already published.');
  assert.ok(page.$('publish-message').classList.contains('is-error'));
  assert.equal(page.history.renders.at(-1).entries.length, 1, 'no new history entry');
});

// ---- 5. reload ----

test('reload: the session persists and the dashboard loads without the form', async () => {
  const token = JSON.parse(storage.getItem('admin_session')).token;
  page = openAdmin({ storage, server });
  assert.ok(isDashboardView(page), 'dashboard shown before any request completes');
  await server.flush();
  assert.equal(page.$('draft-body').hidden, false, 'draft loaded with the stored token');
  assert.equal(JSON.parse(storage.getItem('admin_session')).token, token, 'same token');

  const r = await page.win.loadHistory();
  assert.equal(r.status, 'loaded');
  assert.equal(page.history.renders.at(-1).entries[0].status, 'success', 'history still there');
});

// ---- 6. log out ----

test('logout: clears the session, returns to /admin and shows the form again', async () => {
  page.$('logout-btn').click();
  assert.equal(storage.getItem('admin_session'), null);
  assert.equal(page.win.location.href, '/admin');

  page = openAdmin({ storage, server }); // the redirect to /admin
  await server.flush();
  assert.ok(isLoginView(page), 'login view after logout');
});

test('logout: footer link is hidden again', () => {
  assert.equal(openHome(storage).style.display, 'none');
});

// ---- 7. empty state ----

test('no draft yet: dashboard shows the empty state', async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), 'admin-e2e-empty-'));
  const previous = process.env.ADMIN_DATA_DIR;
  process.env.ADMIN_DATA_DIR = emptyDir;
  try {
    const emptyStorage = new MemoryStorage();
    const emptyServer = makeServer();
    const p = openAdmin({ storage: emptyStorage, server: emptyServer });
    await p.login(PASSWORD);
    assert.ok(isDashboardView(p));
    assert.equal(p.$('draft-empty').hidden, false);
    assert.equal(p.$('draft-body').hidden, true);
    assert.match(adminHtml, /id="draft-empty"[\s\S]*?No draft yet/);
    assert.equal(p.$('publish-all-btn').disabled, true);

    const r = await p.win.loadHistory();
    assert.equal(r.status, 'empty');
  } finally {
    process.env.ADMIN_DATA_DIR = previous;
    await rm(emptyDir, { recursive: true, force: true });
  }
});
