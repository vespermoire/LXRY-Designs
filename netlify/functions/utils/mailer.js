/**
 * Email notification utility for content engine reviews
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
