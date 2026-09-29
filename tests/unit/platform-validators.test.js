import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSocialPosts } from '../../netlify/functions/utils/platform-validators.js';

// Test 1: Validate Instagram hashtags (15-25)
test('platform-validators: Instagram hashtags must be 15-25', async () => {
  // Valid: 15 hashtags
  const validDraft15 = {
    social: {
      instagram: {
        caption: 'Great post!',
        hashtags: Array(15).fill('#tech'),
        dimensions: '1080x1350'
      }
    }
  };
  const errors15 = validateSocialPosts(validDraft15);
  assert.equal(errors15.length, 0, 'Should pass with 15 hashtags');

  // Valid: 25 hashtags
  const validDraft25 = {
    social: {
      instagram: {
        caption: 'Great post!',
        hashtags: Array(25).fill('#tech'),
        dimensions: '1080x1350'
      }
    }
  };
  const errors25 = validateSocialPosts(validDraft25);
  assert.equal(errors25.length, 0, 'Should pass with 25 hashtags');

  // Invalid: 14 hashtags (too few)
  const tooFewDraft = {
    social: {
      instagram: {
        caption: 'Great post!',
        hashtags: Array(14).fill('#tech'),
        dimensions: '1080x1350'
      }
    }
  };
  const errorsTooFew = validateSocialPosts(tooFewDraft);
  assert.ok(
    errorsTooFew.some((e) => e.includes('Instagram') && e.includes('15 hashtags')),
    'Should error when fewer than 15 hashtags'
  );

  // Invalid: 26 hashtags (too many)
  const tooManyDraft = {
    social: {
      instagram: {
        caption: 'Great post!',
        hashtags: Array(26).fill('#tech'),
        dimensions: '1080x1350'
      }
    }
  };
  const errorsTooMany = validateSocialPosts(tooManyDraft);
  assert.ok(
    errorsTooMany.some((e) => e.includes('Instagram') && e.includes('25 hashtags')),
    'Should error when more than 25 hashtags'
  );
});

// Test 2: Validate TikTok duration (15-60 sec)
test('platform-validators: TikTok duration must be 15-60 seconds', async () => {
  // Valid: 30 seconds
  const validDraft30 = {
    social: {
      tiktok: {
        caption: 'Viral video!',
        hashtags: ['#viral', '#tech'],
        dimensions: '1080x1920',
        duration: '30 seconds'
      }
    }
  };
  const errors30 = validateSocialPosts(validDraft30);
  assert.equal(errors30.length, 0, 'Should pass with 30 seconds');

  // Valid: 15 seconds
  const validDraft15 = {
    social: {
      tiktok: {
        caption: 'Viral video!',
        hashtags: ['#viral', '#tech'],
        dimensions: '1080x1920',
        duration: '15 seconds'
      }
    }
  };
  const errors15 = validateSocialPosts(validDraft15);
  assert.equal(errors15.length, 0, 'Should pass with 15 seconds');

  // Valid: 60 seconds
  const validDraft60 = {
    social: {
      tiktok: {
        caption: 'Viral video!',
        hashtags: ['#viral', '#tech'],
        dimensions: '1080x1920',
        duration: '60 seconds'
      }
    }
  };
  const errors60 = validateSocialPosts(validDraft60);
  assert.equal(errors60.length, 0, 'Should pass with 60 seconds');

  // Invalid: 14 seconds (too short)
  const tooShortDraft = {
    social: {
      tiktok: {
        caption: 'Viral video!',
        hashtags: ['#viral', '#tech'],
        dimensions: '1080x1920',
        duration: '14 seconds'
      }
    }
  };
  const errorsTooShort = validateSocialPosts(tooShortDraft);
  assert.ok(
    errorsTooShort.some((e) => e.includes('TikTok') && e.includes('15 seconds')),
    'Should error when duration < 15 seconds'
  );

  // Invalid: 61 seconds (too long)
  const tooLongDraft = {
    social: {
      tiktok: {
        caption: 'Viral video!',
        hashtags: ['#viral', '#tech'],
        dimensions: '1080x1920',
        duration: '61 seconds'
      }
    }
  };
  const errorsTooLong = validateSocialPosts(tooLongDraft);
  assert.ok(
    errorsTooLong.some((e) => e.includes('TikTok') && e.includes('60 seconds')),
    'Should error when duration > 60 seconds'
  );

  // Valid: range format "30-45 seconds" (takes first number)
  const rangeFormatDraft = {
    social: {
      tiktok: {
        caption: 'Viral video!',
        hashtags: ['#viral', '#tech'],
        dimensions: '1080x1920',
        duration: '30-45 seconds'
      }
    }
  };
  const errorsRange = validateSocialPosts(rangeFormatDraft);
  assert.equal(errorsRange.length, 0, 'Should pass with range format like "30-45 seconds"');
});

// Test 3: Pass validation for correct data
test('platform-validators: full draft with valid data passes all validations', async () => {
  const validDraft = {
    blog: {
      title: 'Great Article',
      content: '# Article\nThis is great content.',
      frontmatter: {
        slug: 'great-article',
        seo_keywords: ['tech', 'innovation'],
        date: '2024-01-15'
      }
    },
    newsletter: {
      subject: 'Weekly Tech Digest',
      body: '<h2>Hello</h2><p>Great insights this week!</p>'
    },
    social: {
      instagram: {
        caption: 'Check out this amazing content!',
        hashtags: Array(15).fill('#tech'), // Exactly 15 hashtags
        dimensions: '1080x1350'
      },
      x: {
        caption: 'Breaking tech news today',
        hashtags: ['#tech', '#news'],
        length: 280
      },
      linkedin: {
        caption: 'Professional insights',
        hashtags: ['#tech', '#business', '#innovation'],
        dimensions: '1200x627'
      },
      tiktok: {
        caption: 'Trending insight!',
        hashtags: ['#tech', '#viral'],
        dimensions: '1080x1920',
        duration: '45 seconds'
      },
      facebook: {
        caption: 'Share this amazing find',
        hashtags: ['#tech', '#awesome', '#amazing'],
        dimensions: '1200x627'
      },
      youtube: {
        caption: 'Full video description here',
        hashtags: ['#tech', '#tutorial'],
        dimensions: '1080x1920',
        duration: '60 seconds'
      }
    }
  };

  const errors = validateSocialPosts(validDraft);
  assert.equal(errors.length, 0, 'Valid draft should have no validation errors');
});
