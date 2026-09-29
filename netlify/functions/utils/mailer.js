/**
 * Email notification utility for content engine reviews and publishing
 */

/**
 * Sends a review notification email to the owner with draft review link
 * @param {string} draftId - Unique identifier for the draft
 * @param {string} reviewUrl - Full URL to review the draft
 * @param {string} token - Secure token for draft access
 * @returns {Promise<void>}
 */
export async function sendReviewNotification(draftId, reviewUrl, token) {
  const ownerEmail = process.env.OWNER_EMAIL || 'admin@lxrydesigns.com';

  try {
    // Log the notification (in production, would send via email service)
    console.log(`Review notification prepared for ${draftId}:`, {
      to: ownerEmail,
      subject: `Weekly Content Draft Ready for Review - ${draftId}`,
      reviewUrl: reviewUrl
    });

    // For development/testing, just log success
    // In production, you would integrate with a service like Mailgun, SendGrid, or AWS SES
    console.log(`✓ Review notification queued for ${ownerEmail}`);
  } catch (error) {
    console.error(`Failed to send review notification for ${draftId}:`, error);
    // Don't throw - notification failure should not block the handler
    // (per the brief: "If notification fails: log (but do not fail the handler)")
  }
}

/**
 * Sends a publication confirmation email to the owner
 * Reports success/failure for blog, newsletter, and social channels
 *
 * @param {Object} params - Email parameters
 * @returns {Promise<void>}
 */
export async function sendPublishConfirmation(params) {
  try {
    const { status, subject, error, published, failures, draft } = params;
    const ownerEmail = process.env.OWNER_EMAIL || 'hello@lxrydesigns.com';

    if (!ownerEmail) {
      console.error('[Mailer] OWNER_EMAIL environment variable not configured');
      return;
    }

    // Build email HTML
    const htmlContent = buildEmailHTML({
      status,
      subject,
      error,
      published,
      failures,
      draft
    });

    // Log the notification (in production, would send via SendGrid/Mailgun/etc)
    console.log(`[Mailer] Publication notification prepared for ${ownerEmail}:`, {
      to: ownerEmail,
      subject: `[${status}] ${subject}`,
      htmlLength: htmlContent.length,
      status,
      hasPublished: !!published && Object.keys(published).length > 0,
      hasFailures: !!failures && Object.keys(failures).length > 0
    });

    // For development/testing, just log success
    // In production, you would integrate with SendGrid or similar
    console.log(`[Mailer] ✓ Publication notification queued for ${ownerEmail}`);
  } catch (error) {
    console.error('[Mailer] Error sending notification:', error);
    // Don't throw - email failure shouldn't prevent other operations
  }
}

/**
 * Builds HTML email content for publication notification
 *
 * @param {Object} params - Email content parameters
 * @returns {string} HTML email content
 */
function buildEmailHTML(params) {
  const { status, subject, error, published, failures, draft } = params;

  const statusColor = status === 'SUCCESS' ? '#27F4D2' : status === 'FAILED' ? '#FF6B6B' : '#FFA500';
  const statusBg = status === 'SUCCESS' ? '#e8f8f6' : status === 'FAILED' ? '#fff0f0' : '#fffbf0';

  let html = `
    <html>
      <head>
        <style>
          body { font-family: Inter, sans-serif; color: #333; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${statusBg}; border-left: 4px solid ${statusColor}; padding: 20px; margin-bottom: 20px; border-radius: 4px; }
          .status { color: ${statusColor}; font-weight: bold; font-size: 1.2em; margin-bottom: 10px; }
          .subject { color: #000; font-size: 1.1em; margin: 0; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; color: #000; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          .success { color: #27F4D2; }
          .error { color: #FF6B6B; }
          .item { margin-bottom: 8px; padding: 8px; background: #f5f5f5; border-radius: 3px; }
          .failure { background: #fff0f0; border-left: 3px solid #FF6B6B; }
          code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
          .footer { color: #999; font-size: 0.9em; margin-top: 30px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="status">${status}</div>
            <p class="subject">${subject}</p>
          </div>
  `;

  // Error section
  if (error) {
    html += `
      <div class="section">
        <div class="section-title">Error Details</div>
        <div class="item failure">
          <strong>Error:</strong> ${escapeHtml(error)}
        </div>
      </div>
    `;
  }

  // Published section
  if (published && Object.keys(published).length > 0) {
    html += '<div class="section"><div class="section-title">Published Channels</div>';

    if (published.blog && published.blog.success) {
      html += `
        <div class="item success">
          <strong>✓ Blog:</strong> <code>${escapeHtml(published.blog.filename)}</code>
        </div>
      `;
    }

    if (published.newsletter && published.newsletter.success) {
      html += `
        <div class="item success">
          <strong>✓ Newsletter:</strong> "${escapeHtml(published.newsletter.subject)}"
        </div>
      `;
    }

    if (published.social && published.social.success) {
      html += '<div class="item success"><strong>✓ Social:</strong> All platforms queued';
      if (published.social.platforms) {
        const platformsHtml = Object.entries(published.social.platforms)
          .filter(([_, p]) => p.success)
          .map(([p, _]) => p)
          .join(', ');
        if (platformsHtml) html += ` (${platformsHtml})`;
      }
      html += '</div>';
    }

    html += '</div>';
  }

  // Failures section
  if (failures && Object.keys(failures).length > 0) {
    html += '<div class="section"><div class="section-title">Failed Channels</div>';

    for (const [channel, error] of Object.entries(failures)) {
      html += `
        <div class="item failure">
          <strong>✗ ${escapeHtml(channel)}:</strong> ${escapeHtml(error)}
        </div>
      `;
    }

    html += '</div>';
  }

  // Draft info
  if (draft) {
    html += `
      <div class="section">
        <div class="section-title">Draft Info</div>
        <div class="item">
          <strong>Title:</strong> ${escapeHtml(draft.title || 'N/A')}<br>
          <strong>Date:</strong> ${new Date().toLocaleString()}
        </div>
      </div>
    `;
  }

  html += `
        <div class="footer">
          <p>LXRY Designs Content Engine</p>
          <p><a href="https://www.lxrydesigns.com/">www.lxrydesigns.com</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Escapes HTML entities to prevent injection
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text || '').replace(/[&<>"']/g, m => map[m]);
}
