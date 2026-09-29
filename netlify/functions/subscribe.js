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

export async function addSubscriber(email, name, source) {
  const apiKey = process.env.MAILERLITE_API_KEY;
  const groupId = process.env.MAILERLITE_GROUP_ID;

  const fields = {};
  if (name) fields.name = name;
  if (source) fields.source = source;

  const payload = { email };
  if (Object.keys(fields).length) payload.fields = fields;
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

  // 2xx = created/updated; 422 = already subscribed — both are success to the visitor.
  if (res.ok || res.status === 422) return { ok: true };
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

  // Honeypot: a real user never fills this. Pretend success, contact nothing.
  if (body.website) return json(200, { ok: true });

  const v = validateSubmission(body);
  if (!v.valid) return json(400, { error: v.error });

  try {
    await addSubscriber(v.email, v.name, body.source);
    return json(200, { ok: true });
  } catch {
    return json(502, {
      error: 'Something went wrong on our side — please email hello@lxrydesigns.com.',
    });
  }
};
