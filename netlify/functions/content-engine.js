import { DEFAULT_FEEDS, aggregateFeeds } from './utils/feed-monitor.js';
import { generateContent } from './utils/claude-drafting.js';
import { saveDraft, getDraftApprovalToken } from './utils/storage.js';
import { validateSocialPosts } from './utils/platform-validators.js';
import { sendReviewNotification } from './utils/mailer.js';

/**
 * Main content engine orchestration handler
 * Runs weekly (Monday 9 AM) to:
 * 1. Aggregate AI news from RSS feeds
 * 2. Generate blog, newsletter, and social content via Claude
 * 3. Validate social posts against platform constraints
 * 4. Store draft for owner review
 * 5. Send review notification email
 */
export const handler = async (event, context) => {
  const startTime = Date.now();
  console.log('Content engine triggered at', new Date().toISOString());

  try {
    // Step 1: Aggregate feeds
    console.log('Step 1: Aggregating feeds...');
    let stories;
    try {
      stories = await aggregateFeeds(DEFAULT_FEEDS);
      console.log(`✓ Aggregated ${stories.length} stories from ${DEFAULT_FEEDS.length} feeds`);
    } catch (error) {
      console.error('Feed aggregation failed:', error);
      return json(500, {
        success: false,
        error: 'Feed aggregation failed',
        details: error.message
      });
    }

    // Validate we have stories to process
    if (!stories || stories.length === 0) {
      console.warn('No stories aggregated from feeds');
      return json(400, {
        success: false,
        error: 'No stories aggregated from feeds'
      });
    }

    // Step 2: Generate content with Claude
    console.log('Step 2: Generating content with Claude API...');
    let draft;
    try {
      draft = await generateContent(stories);
      console.log('✓ Content generated successfully');
    } catch (error) {
      console.error('Content generation failed:', error);
      return json(500, {
        success: false,
        error: 'Content generation failed',
        details: error.message,
        storiesProcessed: stories.length
      });
    }

    // Step 3: Validate social posts
    console.log('Step 3: Validating social posts against platform constraints...');
    let validationErrors = [];
    try {
      validationErrors = validateSocialPosts(draft);
      if (validationErrors.length > 0) {
        console.warn(`Validation found ${validationErrors.length} issues:`, validationErrors);
      } else {
        console.log('✓ All social posts validated successfully');
      }
    } catch (error) {
      console.error('Validation failed:', error);
      // Don't fail - attach errors to draft instead
      validationErrors = [{ error: 'Validation check failed', details: error.message }];
    }

    // Attach validation results to draft
    draft._validation = {
      timestamp: new Date().toISOString(),
      errors: validationErrors,
      isValid: validationErrors.length === 0
    };

    // Step 4: Save draft
    console.log('Step 4: Saving draft...');
    const draftId = `draft-${Date.now()}`;
    try {
      await saveDraft(draftId, draft);
      console.log(`✓ Draft saved with ID: ${draftId}`);
    } catch (error) {
      console.error('Draft storage failed:', error);
      return json(500, {
        success: false,
        error: 'Failed to save draft',
        details: error.message,
        storiesProcessed: stories.length,
        draftId: draftId
      });
    }

    // Generate approval token and construct review URL
    const token = getDraftApprovalToken(draftId);
    const reviewUrl = `${process.env.SITE_URL || 'https://lxrydesigns.com'}/.netlify/functions/review-handler?draftId=${encodeURIComponent(draftId)}&token=${encodeURIComponent(token)}`;

    // Step 5: Send review notification
    console.log('Step 5: Sending review notification...');
    try {
      await sendReviewNotification(draftId, reviewUrl, token);
      console.log('✓ Review notification sent');
    } catch (error) {
      // Log but don't fail the handler (per brief: "If notification fails: log (but do not fail the handler)")
      console.error('Review notification failed (non-blocking):', error);
    }

    const duration = Date.now() - startTime;
    console.log(`✓ Content engine completed successfully in ${duration}ms`);

    // Success response
    return json(200, {
      success: true,
      draftId: draftId,
      reviewUrl: reviewUrl,
      storiesProcessed: stories.length,
      validationIssues: validationErrors.length,
      duration: `${duration}ms`
    });

  } catch (error) {
    console.error('Unexpected error in content engine:', error);
    return json(500, {
      success: false,
      error: 'Unexpected error in content engine',
      details: error.message
    });
  }
};

/**
 * Utility: Return JSON response with proper Netlify Function headers
 */
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(obj)
  };
}
