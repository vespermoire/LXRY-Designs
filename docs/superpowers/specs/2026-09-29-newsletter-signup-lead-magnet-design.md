# Newsletter Signup + AI Automation Starter Kit — Design Spec

**Date:** 2026-09-29
**Status:** Draft for review
**Slice:** 1 of 4 (email capture + lead magnet). Later slices: newsletter engine, blog, content/repurposing workflow — each gets its own spec.

---

## 1. Intent & context

**Goal:** Start building an owned email list for LXRY Designs by offering a free, high-value lead magnet (the *AI Automation Starter Kit*) in exchange for a newsletter subscription. The newsletter will cover the latest AI news and developments and later feed social posts and YouTube shorts.

**Who it's for:** SMBs in the Geneva / Pays de Gex cross-border region (and beyond) who could become audit/build/automation/compliance clients.

**Success looks like:** A visitor can subscribe from the site, receives a GDPR-compliant double-opt-in confirmation, and — after confirming — receives the Starter Kit PDF. Subscribers land in MailerLite. No third-party scripts are added to the site; the tight CSP and privacy posture established in prior work are preserved.

**Decisions already made (via brainstorming):**
- Email platform: **MailerLite** (EU company / EU data hosting, strong GDPR posture, free to start) — chosen over beehiiv (US, growth-first) for compliance fit and staying on-brand.
- Blog stays **native on lxrydesigns.com** (not a hosted platform) — out of scope for this slice.
- Integration: **custom on-brand form → Netlify Function → MailerLite API** (Approach A) — chosen over MailerLite's embedded JS form (adds third-party scripts, off-brand) and client-side POST (exposes identifiers, weaker bot control).
- Lead magnet: **AI Automation Starter Kit**, produced as a premium, fully on-brand PDF matching `brand-pack.html` (turquoise/HUD, Jura + Inter + JetBrains Mono).
- Placement: **dedicated `/ai-kit` landing page + homepage signup section + footer field + a subtle scroll/exit-intent popup**.
- Bot protection: honeypot + server-side validation + MailerLite double opt-in. **No visible CAPTCHA.**

## 2. Scope

**In scope (this slice):**
- The Starter Kit PDF (on-brand HTML → PDF), hosted on the site.
- One reusable, on-brand signup form component with four placements: `/ai-kit` landing page, homepage section, footer field, popup.
- A Netlify Function (`subscribe`) that validates input and calls the MailerLite API.
- Double-opt-in subscription flow; delivery of the Starter Kit after confirmation.
- Privacy Policy update (EN + FR) disclosing MailerLite as processor and the newsletter/lead-magnet data use.
- Testing (function validation in isolation; local UX; one real end-to-end signup).

**Out of scope (later slices):**
- Composing/sending newsletter issues (MailerLite campaigns) — slice 2.
- The blog and any multipage/SSG tooling decision — slice 3 (its own brainstorm).
- Content repurposing to social / YouTube — slice 4.
- Analytics/growth experiments, referral mechanics.

## 3. Architecture & data flow

```
Browser (any of 4 placements)
  │  submit: { email, name?, consent, website(honeypot), source }
  ▼
POST /.netlify/functions/subscribe   (same-origin; connect-src 'self')
  │  validate: email format, honeypot empty, consent === true
  │  on invalid → 400 { error }
  ▼
MailerLite API  POST /api/subscribers   (Authorization: Bearer MAILERLITE_API_KEY)
  │  add to double-opt-in group (group id in env or constant)
  ▼
200 { ok:true } → form shows "Check your inbox to confirm"

MailerLite (async, platform-side):
  double-opt-in confirmation email → user clicks confirm
    → automation "on join group" → welcome email containing Starter Kit link
      → PDF served from https://www.lxrydesigns.com/assets/<kit>.pdf ('self')
```

**Why a function:** keeps the MailerLite API key server-side, keeps the page free of third-party JS, keeps CSP unchanged (`connect-src 'self'` already permits the same-origin POST), and centralises validation + honeypot enforcement.

## 4. Components

### 4.1 Starter Kit PDF (the product)
- Authored as an on-brand HTML document using the brand tokens from `brand-pack.html` (`--turq #27F4D2`, `--teal #00A19B`, `--dark-bg #0D0D0D`, `--panel #0F1514`; Jura headers, Inter body, JetBrains Mono accents), rendered to PDF.
- Hosted at `lxrydesigns/assets/<filename>.pdf` (filename chosen at implementation; unguessable is fine — link only shared via the confirmation email).
- Content outline (full copy drafted for approval during implementation):
  - Cover page (HUD styling, turquoise title)
  - Intro: why automation, who it's for
  - **10 workflows**, each a card: *what it does · which tools · hours saved · how to start*
  - Compliance sidebar ("automate without breaking GDPR") — ties to LXRY's brand
  - Closing CTA → book an AI Automation Audit
- Rendering method (HTML→PDF tool) decided at implementation; must reproduce the brand fonts/colours faithfully.

### 4.2 Signup form component
- **Fields:** Email (required), First name (optional), consent checkbox (required, links to Privacy Policy), hidden honeypot input (e.g. `website`).
- **Behaviour:** JS intercepts submit → POST JSON to the function → states: idle → submitting → success ("Check your inbox to confirm your subscription") → error (re-enable + fallback to `hello@lxrydesigns.com`). Success only on a real 2xx (same lesson as the contact-form fix).
- **Styling:** matches the HUD brand; shared markup/CSS reused across all four placements to avoid divergence.
- **`source` field:** identifies which placement produced the signup (landing / homepage / footer / popup), passed to the function for later segmentation.

### 4.3 Placements
1. **`/ai-kit` landing page** (`lxrydesigns/ai-kit.html`, clean-URL redirect in `netlify.toml` like the existing legal/privacy ones): full sell page for the Kit — hero, what's inside, the form. Primary shareable link for social/YT.
2. **Homepage section** (`index.html`): an on-brand signup band (likely near the FAQ/contact area), EN + FR via the existing i18n dictionary.
3. **Footer field** (`index.html` footer): compact version of the same component — email + submit + a small **required consent checkbox** linking the Privacy Policy (consent must be explicit and unbundled, so no microcopy-only shortcut even in the footer).
4. **Popup:** subtle, triggered on scroll depth or exit-intent, shown once per visitor (remembered via `localStorage`, e.g. `lxry_kit_seen`), dismissible, respects `prefers-reduced-motion`, contains the form.

### 4.4 Netlify Function `subscribe`
- Location: `netlify/functions/subscribe.js`; `netlify.toml` gains a `[functions] directory = "netlify/functions"` entry. No site build step required (Node 18+ runtime has global `fetch`).
- Input: JSON `{ email, name?, consent, website, source }`.
- Validation: email regex, `website` (honeypot) must be empty, `consent === true`. Reject otherwise with 400.
- Action: `POST https://connect.mailerlite.com/api/subscribers` with `Authorization: Bearer ${MAILERLITE_API_KEY}`, body including the target group and `fields.name`. Group configured for double opt-in.
- Output: `200 { ok:true }` on success; `4xx/5xx { error }` otherwise. Never leaks the API key or MailerLite's raw response.
- Secrets: `MAILERLITE_API_KEY` (and group id, if not constant) via Netlify environment variables — never committed.

## 5. Compliance & privacy
- Explicit **consent checkbox** required before submit; links to the Privacy Policy.
- **Double opt-in**: serves as consent proof *and* as bot filtering.
- **Privacy Policy update** (`privacy.html`, EN + FR): disclose MailerLite as an EU data processor, data collected (email + optional first name), lawful basis (consent), retention/unsubscribe rights — following the pattern used for the Netlify Forms disclosure.
- **CSP:** unchanged. Form posts same-origin to the function (`connect-src 'self'`); PDF served from `'self'`. No new third-party origins, no new scripts.

## 6. Prerequisites (user actions — guided at implementation)
In **MailerLite**: create account → verify sending domain (SPF/DKIM DNS records) → create the subscriber group with **double opt-in enabled** → build the "on join group → send welcome email with Starter Kit link" automation → generate an API key.
In **Netlify**: add `MAILERLITE_API_KEY` (and group id if needed) as environment variable(s).

These are external to the codebase and block only the *live end-to-end test*, not the build.

## 7. Testing
- **Function (isolation):** valid input succeeds (MailerLite call mocked); missing/invalid email → 400; non-empty honeypot → rejected; `consent !== true` → 400.
- **Local UX:** form states, consent gating, popup show-once logic, reduced-motion, EN/FR.
- **End-to-end (once prerequisites done):** real signup → double-opt-in email → confirm → receive Starter Kit PDF. Verify subscriber appears in MailerLite with correct `source`.

## 8. Open items to resolve during implementation
- Exact Starter Kit copy (10 workflows) — draft for approval.
- HTML→PDF rendering tool choice.
- PDF filename and whether to obfuscate it.
- Final homepage section placement/wording (EN + FR).
- Popup trigger threshold (scroll % vs exit-intent) and frequency cap details.
