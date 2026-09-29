# MailerLite + Netlify setup — newsletter signup

These are the one-time steps **you** complete so the signup goes live. Everything in
the code is already built and tested; these steps connect it to MailerLite and are
the only thing gating a real end-to-end test.

## 1. MailerLite

1. **Create an account** at mailerlite.com (the free plan covers up to 1,000 subscribers).
2. **Verify your sending domain** — Settings → Domains → add `lxrydesigns.com` and add the
   SPF/DKIM DNS records they give you at your DNS host. This is what stops confirmation
   and Kit emails landing in spam.
3. **Create a subscriber group** — e.g. "Newsletter / AI Kit". Note its **group ID**
   (visible in the URL when you open the group, or via the API).
4. **Turn on double opt-in** — Settings → Subscribe settings (or the group's settings) →
   enable double opt-in, and customise the confirmation email.
5. **Build the delivery automation** — Automations → new → trigger "when a subscriber
   joins the group" → action "send email" → include the Starter Kit link:
   `https://www.lxrydesigns.com/assets/lxry-ai-automation-starter-kit.pdf`
6. **Generate an API key** — Integrations → API → generate a token. Copy it (you'll paste
   it into Netlify, not the code).

## 2. Netlify

1. Site → **Site configuration → Environment variables** → add:
   - `MAILERLITE_API_KEY` = the API token from step 1.6
   - `MAILERLITE_GROUP_ID` = the group ID from step 1.3
2. **Redeploy** (Deploys → Trigger deploy) so the function picks up the new variables.

## 3. End-to-end test (after the above)

1. On the live site, subscribe from `/ai-kit` (and try the homepage section, footer, popup).
2. Confirm the entry appears in MailerLite → the group, with the correct `source` field
   (`ai-kit` / `homepage` / `footer` / `popup`).
3. Receive the double-opt-in email → click confirm.
4. Receive the welcome email → download the Starter Kit PDF.
5. Check it arrives in the inbox, not spam (that's what step 1.2 secures).

## Notes

- The API key lives **only** in Netlify's environment — never in the repo.
- The site adds **no third-party scripts**; the browser only ever posts to our own
  `/.netlify/functions/subscribe`. MailerLite is contacted server-side.
- Bot protection: honeypot + server-side validation + double opt-in. No CAPTCHA needed.
