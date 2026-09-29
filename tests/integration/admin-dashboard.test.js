// Operations Dashboard grid (Task 3): markup structure, validation rules and the
// draft fixture. The rules live in <script id="dashboard-rules"> in admin.html and
// have no DOM dependencies, so they run here in node:vm without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(join(ROOT, 'lxrydesigns/admin.html'), 'utf8');
const draft = JSON.parse(readFileSync(join(ROOT, 'netlify/.drafts/draft-test.json'), 'utf8'));

function loadRules() {
  const m = html.match(/<script id="dashboard-rules">([\s\S]*?)<\/script>/);
  assert.ok(m, 'admin.html has a <script id="dashboard-rules"> block');
  const sandbox = { window: {} };
  vm.runInNewContext(m[1], sandbox);
  return sandbox.window.AdminDashboardRules;
}

const R = loadRules();
const ALL = ['blog', 'newsletter', 'instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'youtube'];
const SOCIAL = ALL.slice(2);

function cardMarkup(type) {
  const start = html.indexOf(`<article class="content-card" data-type="${type}"`);
  assert.notEqual(start, -1, `card for ${type} exists`);
  return html.slice(start, html.indexOf('</article>', start));
}

function tags(n) {
  return Array.from({ length: n }, (_, i) => `#tag${i + 1}`).join(' ');
}

// ---- markup ----

test('grid: exactly 8 content cards, one per item, in order', () => {
  const types = [...html.matchAll(/<article class="content-card" data-type="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(types, ALL);
});

test('grid: every card has a status badge, validation badge and Approve/Reject buttons', () => {
  for (const type of ALL) {
    const c = cardMarkup(type);
    for (const cls of ['status-badge', 'validation-badge', 'btn-approve', 'btn-reject']) {
      assert.match(c, new RegExp(`class="[^"]*\\b${cls}\\b`), `${type} has .${cls}`);
    }
  }
});

test('grid: social cards have image placeholder, caption textarea and hashtags input', () => {
  for (const type of SOCIAL) {
    const c = cardMarkup(type);
    assert.match(c, /class="image-placeholder"/, `${type} image placeholder`);
    assert.match(c, /<textarea class="caption-field"/, `${type} caption textarea`);
    assert.match(c, /<input type="text" class="hashtags-field"/, `${type} hashtags input`);
  }
});

test('grid: newsletter has an editable subject; blog is a read-only preview', () => {
  assert.match(cardMarkup('newsletter'), /<input type="text" class="subject-field"/);
  const blog = cardMarkup('blog');
  assert.doesNotMatch(blog, /<(input|textarea)\b/);
  assert.match(blog, /data-bind="title"/);
  assert.match(blog, /data-bind="excerpt"/);
});

test('page: empty state, publish and reset controls exist', () => {
  assert.match(html, /id="draft-empty"[\s\S]*?No draft yet/);
  assert.match(html, /id="publish-all-btn"[^>]*>Approve &amp; Publish All</);
  assert.match(html, /id="reset-btn"[^>]*>Reset</);
});

// ---- hashtag parsing ----

// Arrays built inside node:vm have another realm's Array.prototype, which strict
// deepEqual rejects; spreading copies them into this realm.
const parse = (v) => [...R.parseHashtags(v)];

test('parseHashtags: accepts spaces, commas, "#a#b" and arrays; strips "#"', () => {
  assert.deepEqual(parse('#a #b  #c'), ['a', 'b', 'c']);
  assert.deepEqual(parse('a, b,c'), ['a', 'b', 'c']);
  assert.deepEqual(parse('#a#b'), ['a', 'b']);
  assert.deepEqual(parse(['a', '#b', '']), ['a', 'b']);
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse(null), []);
  assert.deepEqual(parse(' # # '), []);
});

test('formatHashtags: bare or prefixed tags render as "#a #b"', () => {
  assert.equal(R.formatHashtags(['ai', '#tech']), '#ai #tech');
  assert.equal(R.formatHashtags([]), '');
});

// ---- validation rules (plan Global Constraints) ----

const HASHTAG_RULES = {
  instagram: [15, 25],
  tiktok: [5, 10],
  linkedin: [5, 10],
  facebook: [3, 5],
  youtube: [5, 10],
};

for (const [type, [min, max]] of Object.entries(HASHTAG_RULES)) {
  test(`validate ${type}: ${min}-${max} hashtags`, () => {
    const at = (n) => R.validateFields(type, { caption: 'Hello', hashtags: tags(n) });
    assert.equal(at(min - 1).valid, false, `${min - 1} is too few`);
    assert.equal(at(min).valid, true, `${min} is enough`);
    assert.equal(at(max).valid, true, `${max} is the limit`);
    assert.equal(at(max + 1).valid, false, `${max + 1} is too many`);
    assert.equal(at(max).message, `${max}/${max} ✓`);
    assert.equal(at(max + 1).message, `❌ Need ${min}-${max} (${max + 1})`);
  });
}

test('validate instagram: 30 hashtags is rejected (review focus 4)', () => {
  const r = R.validateFields('instagram', { caption: 'Hi', hashtags: tags(30) });
  assert.equal(r.valid, false);
  assert.equal(r.message, '❌ Need 15-25 (30)');
});

test('validate instagram: 18 hashtags shows "18/25 ✓"', () => {
  assert.equal(R.validateFields('instagram', { caption: 'Hi', hashtags: tags(18) }).message, '18/25 ✓');
});

test('validate x: caption plus hashtags must fit 280 characters', () => {
  const ok = R.validateFields('x', { caption: 'a'.repeat(280), hashtags: '' });
  assert.equal(ok.valid, true);
  assert.equal(ok.message, '280/280 ✓');

  const over = R.validateFields('x', { caption: 'a'.repeat(281), hashtags: '' });
  assert.equal(over.valid, false);
  assert.equal(over.message, '❌ Exceeds 280 (281)');

  // 270 + space + "#ab #cd" (7) = 278
  assert.equal(R.postLength('a'.repeat(270), 'ab cd'), 278);
  // 275 + space + "#ab #cd" = 283: caption alone fits, the published post does not
  assert.equal(R.validateFields('x', { caption: 'a'.repeat(275), hashtags: '#ab #cd' }).valid, false);
});

test('validate social: empty caption is invalid regardless of hashtags', () => {
  for (const type of SOCIAL) {
    const r = R.validateFields(type, { caption: '   ', hashtags: tags(8) });
    assert.equal(r.valid, false, type);
    assert.equal(r.message, '❌ Caption required');
  }
});

test('validate newsletter and blog', () => {
  assert.equal(R.validateFields('newsletter', { subject: 'Hello' }).valid, true);
  assert.equal(R.validateFields('newsletter', { subject: '  ' }).valid, false);
  assert.equal(R.validateFields('blog', { title: 'T' }).valid, true);
  assert.equal(R.validateFields('blog', { title: '' }).valid, false);
});

// ---- fixture ----

test('fixture draft-test.json: has all 8 items and every item validates', () => {
  assert.ok(draft.blog.title);
  assert.equal(R.validateFields('blog', { title: draft.blog.title }).valid, true);
  assert.equal(R.validateFields('newsletter', { subject: draft.newsletter.subject }).valid, true);
  for (const type of SOCIAL) {
    const post = draft.social[type];
    assert.ok(post, `fixture has ${type}`);
    const r = R.validateFields(type, { caption: post.caption, hashtags: post.hashtags });
    assert.equal(r.valid, true, `${type}: ${r.message}`);
  }
});
