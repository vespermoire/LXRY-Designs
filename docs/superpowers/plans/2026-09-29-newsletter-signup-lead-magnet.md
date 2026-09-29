# Newsletter Signup + AI Automation Starter Kit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor subscribe to the LXRY newsletter from the site and receive the AI Automation Starter Kit via a GDPR-compliant double-opt-in flow, with no third-party scripts added.

**Architecture:** A shared, on-brand signup form (four placements) posts JSON same-origin to a Netlify Function, which validates and forwards to the MailerLite API (key kept server-side). MailerLite handles double opt-in and, via an account-side automation, emails the Starter Kit PDF (served from our own `/assets`).

**Tech Stack:** Static HTML/CSS/JS (existing site), one Netlify Function on Node 20 (global `fetch`, zero runtime deps), `node --test` for function unit tests, MailerLite API.

**Spec:** `docs/superpowers/specs/2026-09-29-newsletter-signup-lead-magnet-design.md`

## Global Constraints

- Integration is **custom form → Netlify Function → MailerLite API** only. **No third-party scripts** on any page.
- **CSP unchanged.** Form posts same-origin (`connect-src 'self'`); PDF served from `'self'`. Do not add origins to `netlify.toml`'s CSP.
- Brand tokens (from `brand-pack.html`): `--turq #27F4D2`, `--teal #00A19B`, `--dark-bg #0D0D0D`, `--panel #0F1514`. Fonts via `assets/fonts/fonts.css` (Jura display, Inter body, JetBrains Mono accents). Self-host only — no Google Fonts links.
- All user-facing copy is **EN + FR**, added to the existing i18n dictionary in `index.html` (`data-i18n` keys).
- Every placement has an **explicit, required consent checkbox** linking the Privacy Policy (unbundled; no microcopy-only shortcut).
- Success UI shows **only on a real 2xx** response (same lesson as the contact-form fix).
- Node runtime **20** (`[build.environment] NODE_VERSION = "20"`); no `node-fetch`.
- Secrets via Netlify env vars: `MAILERLITE_API_KEY`, `MAILERLITE_GROUP_ID`. Never committed, never echoed in responses or logs.
- MailerLite endpoint: `POST https://connect.mailerlite.com/api/subscribers`, headers `Authorization: Bearer <key>`, `Content-Type: application/json`, `Accept: application/json`, body `{ email, fields: { name }, groups: [<group id>] }`. Double opt-in is an account/group setting, not an API flag.

## Review Focus

- **Honeypot filled** (`website` field non-empty): function must return `200 {ok:true}` WITHOUT calling MailerLite — no signal to the bot. → Task 1.
- **Already-subscribed email** (MailerLite 200 or 422 "already exists"): function returns success so the user still sees "check your inbox". → Task 1.
- **MailerLite 5xx / network failure:** function returns `502 {error}`; form re-enables the button and shows the email fallback. → Task 1 (status) + Task 2 (UI).
- **Consent false/missing on a direct POST** (bypassing client JS): function returns `400 {error}`. → Task 1.
- **Email with surrounding whitespace / uppercase:** normalized (trim + lowercase) before sending. → Task 1.

---

### Task 1: Netlify Function `subscribe` (validation + MailerLite forward)

**Files:**
- Create: `package.json` (repo root) — `{ "type": "module", "scripts": { "test": "node --test" } }`, no dependencies.
- Create: `netlify/functions/subscribe.js`
- Modify: `netlify.toml` — add `[functions] directory = "netlify/functions"` and `[build.environment] NODE_VERSION = "20"`.
- Test: `test/subscribe.test.js` (outside the functions dir so Netlify never treats it as a function).

**Interfaces:**
- Produces:
  - `validateSubmission({ email, name, consent }) -> { valid: true, email: string, name: string } | { valid: false, error: string }` (email trimmed + lowercased; `name` defaults to `""`).
  - `addSubscriber(email: string, name: string, source: string) -> Promise<{ ok: true }>` (throws on upstream failure). Reads `MAILERLITE_API_KEY` / `MAILERLITE_GROUP_ID` from `process.env`.
  - `handler(event) -> { statusCode, body }` (Netlify Function handler; JSON body).

- [ ] **Step 1: Write failing tests** in `test/subscribe.test.js` (import from `../netlify/functions/subscribe.js`; stub `global.fetch` per test):
  - `validateSubmission normalizes email` → `{email:'  A@B.CO '}` valid, email === `'a@b.co'`.
  - `validateSubmission rejects malformed email` → `'foo'` → `valid:false`.
  - `validateSubmission rejects empty email` → `''` → `valid:false`.
  - `validateSubmission rejects consent not true` → `{email:'a@b.co', consent:false}` → `valid:false`.
  - `handler ignores honeypot` → body with `website:'x'` → `statusCode 200`, and `fetch` was NOT called.
  - `handler subscribes valid submission` → fetch stub returns `{ok:true,status:201}` → `statusCode 200`; fetch called once to the MailerLite URL with Bearer header and the email in the body.
  - `handler treats duplicate as success` → fetch stub returns `{ok:false,status:422}` → `statusCode 200`.
  - `handler returns 502 on upstream 500` → fetch stub returns `{ok:false,status:500}` → `statusCode 502`.
  - `handler returns 400 on invalid JSON` → body `'not json'` → `statusCode 400`.
  - `handler returns 400 on missing consent` → valid email, `consent:false` → `statusCode 400`.
- [ ] **Step 2: Run tests, verify they fail** — `npm test` → FAIL (module/exports not defined).
- [ ] **Step 3: Implement `subscribe.js`** with the three exported functions above. Handler order: parse JSON (catch → 400) → if `body.website` truthy return 200 without calling MailerLite → `validateSubmission` (invalid → 400) → `addSubscriber` (success/422 → 200; other non-2xx or throw → 502). Never include the API key or MailerLite's raw response in the returned body.
- [ ] **Step 4: Run tests, verify they pass** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `git add package.json netlify/functions/subscribe.js test/subscribe.test.js netlify.toml && git commit -m "feat: add MailerLite subscribe Netlify Function with validation"`

---

### Task 2: Shared signup form component (CSS + JS)

**Files:**
- Create: `lxrydesigns/assets/signup.css` — HUD-brand styling for the form and its states.
- Create: `lxrydesigns/assets/signup.js` — progressive-enhancement submit handler.
- Test: browser (manual) via `npx netlify dev` (runs pages + function together).

**Interfaces:**
- Consumes: `POST /.netlify/functions/subscribe` (Task 1).
- Produces: behavior bound to every `form[data-signup]` on a page. Required markup contract each placement must follow (Tasks 3–5): a `form[data-signup]` containing `input[name=email]` (required), optional `input[name=name]`, `input[type=checkbox][name=consent]` (required), a visually-hidden `input[name=website]` (honeypot), an optional `input[type=hidden][name=source]`, a submit `button`, and an empty `[data-signup-status]` element for messages.

- [ ] **Step 1: Write `signup.js`** — on `DOMContentLoaded`, for each `form[data-signup]`: intercept submit, `preventDefault`, disable button, build JSON `{ email, name, consent, website, source }` from the fields, `fetch` the endpoint. Show success message from `[data-signup-status]` only when `response.ok`; on non-ok or network error, re-enable the button and show the fallback message pointing to `hello@lxrydesigns.com`. Read success/error/loading strings from `data-*` attributes on the form so copy stays per-page and translatable.
- [ ] **Step 2: Write `signup.css`** — style the form, inputs, consent row, button (turquoise, matches `.cta-primary`), success and error states, using the brand tokens. Honeypot input hidden via an off-screen class (reuse the `.hidden-hp` pattern from the contact form).
- [ ] **Step 3: Verify in browser** — start `npx netlify dev`; on a scratch page (or the Task 3 page once built) load the form, submit a valid email and confirm the success message appears and a subscriber reaches MailerLite (or, without env keys, confirm the request hits the function and the 502 path shows the fallback). Confirm the consent checkbox blocks submit when unchecked (HTML `required`).
- [ ] **Step 4: Commit** — `git add lxrydesigns/assets/signup.css lxrydesigns/assets/signup.js && git commit -m "feat: shared on-brand newsletter signup form component"`

---

### Task 3: `/ai-kit` landing page

**Files:**
- Create: `lxrydesigns/ai-kit.html`
- Modify: `netlify.toml` — add a `/ai-kit` → `/ai-kit.html` 200 redirect (mirror the existing `/privacy` and `/legal` rules).

**Interfaces:**
- Consumes: `signup.css` + `signup.js` (Task 2) and the form markup contract.

- [ ] **Step 1: Build `ai-kit.html`** — standalone on-brand page (same `<head>` conventions as `index.html`: meta, self-hosted `assets/fonts/fonts.css`, favicon). Sections: hero (what the Kit is), "what's inside" (the 10 workflows summarized), and the signup form (`source="ai-kit"`). EN copy first; provide FR via the page's own small i18n block or bilingual copy consistent with how `index.html` handles language. Link back to the homepage and Privacy Policy.
- [ ] **Step 2: Add the redirect** to `netlify.toml`.
- [ ] **Step 3: Verify in browser** — `npx netlify dev`, load `/ai-kit`, confirm styling matches brand, fonts are self-hosted (no `googleapis`/`gstatic` requests), and the form submits through the function.
- [ ] **Step 4: Commit** — `git add lxrydesigns/ai-kit.html netlify.toml && git commit -m "feat: /ai-kit Starter Kit landing page"`

---

### Task 4: Homepage signup section + footer field

**Files:**
- Modify: `lxrydesigns/index.html` — link `assets/signup.css`/`assets/signup.js`; add a signup section (near the FAQ/contact area) and a slim footer signup; add EN + FR `data-i18n` keys to the existing dictionary.

**Interfaces:**
- Consumes: Task 2 component + markup contract.

- [ ] **Step 1: Add the homepage section** — an on-brand band with heading, short pitch (offer the Starter Kit), and the form (`source="homepage"`), all strings via `data-i18n`.
- [ ] **Step 2: Add the footer field** — compact form in the footer (`source="footer"`) with email, required consent checkbox (small) linking Privacy, honeypot, and status element; strings via `data-i18n`.
- [ ] **Step 3: Add EN + FR translations** for every new key to the `I18N` object (both `fr` and the English defaults in markup).
- [ ] **Step 4: Verify in browser** — `npx netlify dev`, toggle FR/EN and confirm both render; submit from both the section and footer and confirm `source` differs in the function/MailerLite.
- [ ] **Step 5: Commit** — `git add lxrydesigns/index.html && git commit -m "feat: homepage signup section + footer capture"`

---

### Task 5: Subtle signup popup

**Files:**
- Modify: `lxrydesigns/index.html` — popup markup (reusing the form contract, `source="popup"`), its styles (inline with the page's style block, matching brand), and its trigger script; EN + FR keys.

**Interfaces:**
- Consumes: Task 2 component; independent trigger logic.

- [ ] **Step 1: Add popup markup + styles** — a dismissible on-brand card containing the form; hidden by default; `role="dialog"`, focus-trap not required but an accessible close button is.
- [ ] **Step 2: Add trigger script** — show once when the visitor reaches ~50% scroll depth OR exit-intent (whichever first); after shown or dismissed, persist `localStorage['lxry_kit_seen'] = '1'` so it never re-nags; wrap storage in try/catch; do not animate when `prefers-reduced-motion: reduce`.
- [ ] **Step 3: Verify in browser** — confirm it appears once, dismiss persists across reload, submitting works, and reduced-motion disables the animation.
- [ ] **Step 4: Commit** — `git add lxrydesigns/index.html && git commit -m "feat: subtle scroll/exit-intent signup popup"`

---

### Task 6: AI Automation Starter Kit PDF

**Files:**
- Create: `starter-kit/starter-kit.html` (repo root, OUTSIDE the publish dir so the raw source isn't served).
- Create (generated): `lxrydesigns/assets/lxry-ai-automation-starter-kit.pdf`.

- [ ] **Step 1: Write `starter-kit/starter-kit.html`** — print-oriented on-brand document using the brand tokens and self-hosted fonts, following the spec outline: cover → intro → 10 workflow cards (*what · tools · hours saved · how to start*) → compliance sidebar → audit CTA. Draft the 10 workflows' copy here (this is the open item from the spec) and get it confirmed before rendering.
- [ ] **Step 2: Render to PDF** — produce `lxrydesigns/assets/lxry-ai-automation-starter-kit.pdf` from the HTML (headless-Chrome print-to-PDF or equivalent; A4, backgrounds on). Verify colours/fonts render faithfully.
- [ ] **Step 3: Verify** — open the PDF, check brand fidelity and that all 10 workflows are present and legible; confirm it is reachable at `/assets/lxry-ai-automation-starter-kit.pdf` under `npx netlify dev`.
- [ ] **Step 4: Commit** — `git add starter-kit/starter-kit.html lxrydesigns/assets/lxry-ai-automation-starter-kit.pdf && git commit -m "feat: AI Automation Starter Kit (source + rendered PDF)"`

---

### Task 7: Privacy Policy update (EN + FR)

**Files:**
- Modify: `lxrydesigns/privacy.html`

- [ ] **Step 1: Add a newsletter/marketing section** disclosing: MailerLite as an **EU data processor**; data collected (email + optional first name); lawful basis (**consent**); double opt-in; retention and the right to unsubscribe/withdraw consent at any time. Mirror the existing Netlify Forms disclosure in tone and structure, EN + FR.
- [ ] **Step 2: Verify** — load `/privacy`, confirm both languages render and links from the consent checkboxes resolve here.
- [ ] **Step 3: Commit** — `git add lxrydesigns/privacy.html && git commit -m "docs: disclose MailerLite newsletter processing in Privacy Policy"`

---

### Task 8: End-to-end verification + setup checklist

**Files:**
- Create: `docs/superpowers/plans/mailerlite-setup.md` — the exact user steps.

- [ ] **Step 1: Write the setup checklist** — MailerLite: create account → verify sending domain (SPF/DKIM) → create the double-opt-in group → note its group id → build the "on join group → welcome email with the Starter Kit link (`/assets/lxry-ai-automation-starter-kit.pdf`)" automation → generate an API key. Netlify: set `MAILERLITE_API_KEY` and `MAILERLITE_GROUP_ID` env vars.
- [ ] **Step 2: Full run-through** (after the user completes Step 1) — from the live/preview site: subscribe → receive double-opt-in email → confirm → receive the Starter Kit email → download the PDF. Confirm the subscriber appears in MailerLite with the correct `source`.
- [ ] **Step 3: Confirm no third-party requests** — on each page, verify the network panel shows no `googleapis`/`gstatic`/MailerLite script requests (only the same-origin function POST on submit).
- [ ] **Step 4: Commit** — `git add docs/superpowers/plans/mailerlite-setup.md && git commit -m "docs: MailerLite + Netlify setup checklist for newsletter signup"`
