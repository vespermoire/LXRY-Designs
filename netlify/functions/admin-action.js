// Netlify Function: Operations Dashboard API (on-demand, no schedule).
// Reached via netlify.toml rewrites:
//   /admin-check-password → /.netlify/functions/admin-action/check-password
//   /admin-action/*       → /.netlify/functions/admin-action/:splat   (Task 4)
// A rewrite can hand the function either the original path or the function
// path, so routes are matched with endsWith().

import { verifyPassword } from './utils/admin-helpers.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  const path = event.path || '';

  if (event.httpMethod === 'POST' && path.endsWith('check-password')) {
    try {
      const { password } = JSON.parse(event.body);
      const result = await verifyPassword(password);
      return json(result.valid ? 200 : 401, result);
    } catch (err) {
      return json(400, { error: 'Invalid request' });
    }
  }

  // Other endpoints (Task 4) handled here. Task 4 must validate the session
  // token server-side; the page only checks its local expiry.
  return json(404, { error: 'Not found' });
};
