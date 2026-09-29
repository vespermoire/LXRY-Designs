// Netlify Function: subscribe a visitor to the MailerLite newsletter group.
// The API key stays server-side; the page never talks to MailerLite directly.
// Double opt-in is a MailerLite account/group setting, not an API flag.

const MAILERLITE_URL = 'https://connect.mailerlite.com/api/subscribers';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSubmission({ email, name, consent } = {}) {
  if (consent !== true) {
    return { valid: false, error: 'Please tick the consent box to subscribe.' };
  }
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  return { valid: true, email: normalized, name: String(name ?? '').trim() };
}

export async function addSubscriber(email, name) {
  const apiKey = process.env.MAILERLITE_API_KEY;
  const groupId = process.env.MAILERLITE_GROUP_ID;

  const payload = { email };
  if (name) payload.fields = { name };
  if (groupId) payload.groups = [groupId];

  const res = await fetch(MAILERLITE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // MailerLite upserts an existing subscriber as 2xx, so 2xx is the only success.
  // 422 and other statuses are real failures (invalid email, bad group, etc.) —
  // surface them so we never claim success while dropping the lead.
  if (res.ok) return { ok: true };
  throw new Error(`MailerLite responded ${res.status}`);
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

export const handler = async (event) => {
  let body;
  try {
    body = JSON.parse((event && event.body) || '');
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  // JSON.parse('null')/'5'/'"x"' are valid JSON but not objects — reject them.
  if (!body || typeof body !== 'object') return json(400, { error: 'Invalid request.' });

  // Honeypot: a real user never fills this. Pretend success, contact nothing.
  if (body.website) return json(200, { ok: true });

  const v = validateSubmission(body);
  if (!v.valid) return json(400, { error: v.error });

  try {
    await addSubscriber(v.email, v.name);
    return json(200, { ok: true });
  } catch {
    return json(502, {
      error: 'Something went wrong on our side — please email hello@lxrydesigns.com.',
    });
  }
};
