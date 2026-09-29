/**
 * Platform-specific validation rules for social media posts
 */

/**
 * Validates a social media draft against platform constraints
 * @param {Object} draft - Draft object containing social section
 * @returns {Array} Array of validation errors (empty if valid)
 */
export function validateSocialPosts(draft) {
  const errors = [];

  if (!draft || !draft.social) {
    errors.push('Draft missing social section');
    return errors;
  }

  const social = draft.social;

  // Instagram: 15-25 hashtags
  if (social.instagram) {
    const instagramErrors = validateInstagram(social.instagram);
    errors.push(...instagramErrors);
  }

  // TikTok: 15-60 second duration
  if (social.tiktok) {
    const tiktokErrors = validateTikTok(social.tiktok);
    errors.push(...tiktokErrors);
  }

  // YouTube: 15-60 second duration
  if (social.youtube) {
    const youtubeErrors = validateYouTube(social.youtube);
    errors.push(...youtubeErrors);
  }

  // LinkedIn: 3-10 hashtags
  if (social.linkedin) {
    const linkedinErrors = validateLinkedIn(social.linkedin);
    errors.push(...linkedinErrors);
  }

  // Facebook: 3-10 hashtags
  if (social.facebook) {
    const facebookErrors = validateFacebook(social.facebook);
    errors.push(...facebookErrors);
  }

  // X: ≤280 characters
  if (social.x) {
    const xErrors = validateX(social.x);
    errors.push(...xErrors);
  }

  return errors;
}

/**
 * Validates Instagram post
 * @param {Object} post - Instagram post object
 * @returns {Array} Array of validation errors
 */
function validateInstagram(post) {
  const errors = [];

  if (!post.hashtags || !Array.isArray(post.hashtags)) {
    errors.push('Instagram: hashtags must be an array');
    return errors;
  }

  const hashtagCount = post.hashtags.length;
  if (hashtagCount < 15) {
    errors.push(`Instagram: must have at least 15 hashtags (found ${hashtagCount})`);
  }
  if (hashtagCount > 25) {
    errors.push(`Instagram: must have at most 25 hashtags (found ${hashtagCount})`);
  }

  return errors;
}

/**
 * Validates TikTok post
 * @param {Object} post - TikTok post object
 * @returns {Array} Array of validation errors
 */
function validateTikTok(post) {
  const errors = [];

  if (!post.duration || typeof post.duration !== 'string') {
    errors.push('TikTok: duration must be specified as a string (e.g., "30 seconds")');
    return errors;
  }

  const durationSeconds = parseDuration(post.duration);
  if (durationSeconds === null) {
    errors.push(`TikTok: invalid duration format "${post.duration}" (use format like "30 seconds")`);
    return errors;
  }

  if (durationSeconds < 15) {
    errors.push(`TikTok: video must be at least 15 seconds (found ${durationSeconds} seconds)`);
  }
  if (durationSeconds > 60) {
    errors.push(`TikTok: video must be at most 60 seconds (found ${durationSeconds} seconds)`);
  }

  return errors;
}

/**
 * Validates YouTube post
 * @param {Object} post - YouTube post object
 * @returns {Array} Array of validation errors
 */
function validateYouTube(post) {
  const errors = [];

  if (!post.duration || typeof post.duration !== 'string') {
    errors.push('YouTube: duration must be specified as a string (e.g., "60 seconds")');
    return errors;
  }

  const durationSeconds = parseDuration(post.duration);
  if (durationSeconds === null) {
    errors.push(`YouTube: invalid duration format "${post.duration}" (use format like "60 seconds")`);
    return errors;
  }

  if (durationSeconds < 15) {
    errors.push(`YouTube: video must be at least 15 seconds (found ${durationSeconds} seconds)`);
  }
  if (durationSeconds > 60) {
    errors.push(`YouTube: video must be at most 60 seconds (found ${durationSeconds} seconds)`);
  }

  return errors;
}

/**
 * Validates LinkedIn post
 * @param {Object} post - LinkedIn post object
 * @returns {Array} Array of validation errors
 */
function validateLinkedIn(post) {
  const errors = [];

  if (!post.hashtags || !Array.isArray(post.hashtags)) {
    errors.push('LinkedIn: hashtags must be an array');
    return errors;
  }

  const hashtagCount = post.hashtags.length;
  if (hashtagCount < 3) {
    errors.push(`LinkedIn: must have at least 3 hashtags (found ${hashtagCount})`);
  }
  if (hashtagCount > 10) {
    errors.push(`LinkedIn: must have at most 10 hashtags (found ${hashtagCount})`);
  }

  return errors;
}

/**
 * Validates Facebook post
 * @param {Object} post - Facebook post object
 * @returns {Array} Array of validation errors
 */
function validateFacebook(post) {
  const errors = [];

  if (!post.hashtags || !Array.isArray(post.hashtags)) {
    errors.push('Facebook: hashtags must be an array');
    return errors;
  }

  const hashtagCount = post.hashtags.length;
  if (hashtagCount < 3) {
    errors.push(`Facebook: must have at least 3 hashtags (found ${hashtagCount})`);
  }
  if (hashtagCount > 10) {
    errors.push(`Facebook: must have at most 10 hashtags (found ${hashtagCount})`);
  }

  return errors;
}

/**
 * Validates X (Twitter) post
 * @param {Object} post - X post object
 * @returns {Array} Array of validation errors
 */
function validateX(post) {
  const errors = [];

  if (!post.caption || typeof post.caption !== 'string') {
    errors.push('X: caption must be a non-empty string');
    return errors;
  }

  const captionLength = post.caption.length;
  if (captionLength > 280) {
    errors.push(`X: caption must be at most 280 characters (found ${captionLength})`);
  }

  return errors;
}

/**
 * Parses a duration string like "30 seconds" or "1-2 minutes" and returns the first number
 * @param {string} duration - Duration string
 * @returns {number|null} Parsed duration in seconds or null if invalid
 */
function parseDuration(duration) {
  if (typeof duration !== 'string') {
    return null;
  }

  // Match patterns like "30 seconds", "30-45 seconds", "1-2 minutes"
  const match = duration.match(/^(\d+)(?:-\d+)?\s*(seconds?|minutes?|hrs?|s|m|h)?/i);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();

  // Convert to seconds
  if (unit.startsWith('m') && !unit.startsWith('s')) {
    // minutes
    return value * 60;
  } else if (unit.startsWith('h')) {
    // hours
    return value * 3600;
  } else {
    // seconds (default)
    return value;
  }
}
