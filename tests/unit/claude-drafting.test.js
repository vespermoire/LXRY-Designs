import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateContent } from '../../netlify/functions/utils/claude-drafting.js';

// Mock story data for testing
const mockStories = [
  {
    title: 'AI Advances in Natural Language Processing',
    link: 'https://example.com/ai-nlp',
    summary: 'New breakthrough in transformer models shows 40% improvement in language understanding.',
    source: 'TechCrunch',
    publishedDate: new Date('2024-01-15')
  },
  {
    title: 'Enterprise Cloud Adoption Accelerates',
    link: 'https://example.com/cloud-adoption',
    summary: 'Survey shows 78% of enterprises increased cloud spending in 2024.',
    source: 'Bloomberg',
    publishedDate: new Date('2024-01-14')
  },
  {
    title: 'Cybersecurity Threats Rise With AI',
    link: 'https://example.com/cyber-threats',
    summary: 'New report highlights increasing sophistication of AI-powered cyberattacks.',
    source: 'Reuters',
    publishedDate: new Date('2024-01-13')
  }
];

// Test 1: Generate content from stories - verify structure and all sections present
test('claude-drafting: generate content from stories with complete structure', async () => {
  // Skip if API key is not available
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  Skipping API test - ANTHROPIC_API_KEY not set');
    return;
  }

  try {
    const draft = await generateContent(mockStories);

    // Verify top-level structure
    assert.ok(draft, 'Draft should be returned');
    assert.ok(draft.blog, 'Draft should have blog section');
    assert.ok(draft.newsletter, 'Draft should have newsletter section');
    assert.ok(draft.social, 'Draft should have social section');

    // Verify blog section
    assert.ok(draft.blog.title, 'Blog should have a title');
    assert.ok(typeof draft.blog.title === 'string', 'Blog title should be a string');
    assert.ok(draft.blog.title.length > 10, 'Blog title should be meaningful');

    assert.ok(draft.blog.content, 'Blog should have content');
    assert.ok(typeof draft.blog.content === 'string', 'Blog content should be a string');
    assert.ok(draft.blog.content.length > 500, 'Blog content should be substantial (800-1200 words)');

    assert.ok(draft.blog.frontmatter, 'Blog should have frontmatter');
    assert.ok(draft.blog.frontmatter.slug, 'Frontmatter should have slug');
    assert.ok(Array.isArray(draft.blog.frontmatter.seo_keywords), 'Frontmatter should have seo_keywords array');
    assert.ok(draft.blog.frontmatter.seo_keywords.length > 0, 'Should have at least one SEO keyword');
    assert.ok(draft.blog.frontmatter.date, 'Frontmatter should have date');

    // Verify newsletter section
    assert.ok(draft.newsletter.subject, 'Newsletter should have subject');
    assert.ok(typeof draft.newsletter.subject === 'string', 'Newsletter subject should be string');
    assert.ok(draft.newsletter.subject.length > 10, 'Newsletter subject should be meaningful');

    assert.ok(draft.newsletter.body, 'Newsletter should have body');
    assert.ok(typeof draft.newsletter.body === 'string', 'Newsletter body should be string');
    assert.ok(draft.newsletter.body.length > 100, 'Newsletter body should be substantial');
    assert.ok(draft.newsletter.body.includes('<'), 'Newsletter body should contain HTML');

    // Verify social section has all 6 platforms
    const requiredPlatforms = ['linkedin', 'x', 'instagram', 'tiktok', 'facebook', 'youtube'];
    for (const platform of requiredPlatforms) {
      assert.ok(draft.social[platform], `Social section should have ${platform}`);
      assert.ok(draft.social[platform].caption, `${platform} should have caption`);
      assert.ok(typeof draft.social[platform].caption === 'string', `${platform} caption should be string`);
      assert.ok(Array.isArray(draft.social[platform].hashtags), `${platform} should have hashtags array`);
      assert.ok(draft.social[platform].hashtags.length > 0, `${platform} should have at least one hashtag`);
      assert.ok(draft.social[platform].dimensions, `${platform} should have dimensions`);
    }

    console.log('✓ Test 1 passed: Content generated with complete structure');
  } catch (error) {
    console.error('Test 1 error:', error.message);
    throw error;
  }
});

// Test 2: Verify platform-specific requirements
test('claude-drafting: verify platform-specific requirements', async () => {
  // Skip if API key is not available
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  Skipping API test - ANTHROPIC_API_KEY not set');
    return;
  }

  try {
    const draft = await generateContent(mockStories);

    // Verify LinkedIn requirements: 5-10 hashtags, 1200x627 dimensions
    assert.ok(draft.social.linkedin.hashtags.length >= 5, 'LinkedIn should have at least 5 hashtags');
    assert.ok(draft.social.linkedin.hashtags.length <= 10, 'LinkedIn should have at most 10 hashtags');
    assert.ok(
      draft.social.linkedin.dimensions.includes('1200') && draft.social.linkedin.dimensions.includes('627'),
      'LinkedIn dimensions should be 1200x627'
    );
    assert.ok(draft.social.linkedin.caption.length > 50, 'LinkedIn caption should be substantial');
    assert.ok(draft.social.linkedin.caption.length <= 300, 'LinkedIn caption should be under 300 chars');

    // Verify X requirements: 280 character limit, 3-5 hashtags
    assert.ok(draft.social.x.length === 280, 'X post should be exactly 280 characters');
    assert.ok(draft.social.x.caption.length <= 280, 'X caption should be 280 chars or less');
    assert.ok(draft.social.x.hashtags.length >= 3, 'X should have at least 3 hashtags');
    assert.ok(draft.social.x.hashtags.length <= 5, 'X should have at most 5 hashtags');

    // Verify Instagram requirements: 15-25 hashtags, 1080x1350 or 1080x1920 dimensions
    assert.ok(draft.social.instagram.hashtags.length >= 15, 'Instagram should have at least 15 hashtags');
    assert.ok(draft.social.instagram.hashtags.length <= 25, 'Instagram should have at most 25 hashtags');
    assert.ok(
      (draft.social.instagram.dimensions.includes('1080') && draft.social.instagram.dimensions.includes('1350')) ||
        (draft.social.instagram.dimensions.includes('1080') && draft.social.instagram.dimensions.includes('1920')),
      'Instagram dimensions should be 1080x1350 or 1080x1920'
    );

    // Verify TikTok requirements: 5-10 hashtags, 1080x1920 dimensions, 15-60 sec
    assert.ok(draft.social.tiktok.hashtags.length >= 5, 'TikTok should have at least 5 hashtags');
    assert.ok(draft.social.tiktok.hashtags.length <= 10, 'TikTok should have at most 10 hashtags');
    assert.ok(
      draft.social.tiktok.dimensions.includes('1080') && draft.social.tiktok.dimensions.includes('1920'),
      'TikTok dimensions should be 1080x1920'
    );
    assert.ok(draft.social.tiktok.duration, 'TikTok should have duration specified');
    assert.match(
      draft.social.tiktok.duration,
      /\d+[\s-]*\d*\s*(?:seconds?|secs?)/i,
      'TikTok duration should be in "15-60 seconds" format'
    );

    // Verify Facebook requirements: 3-5 hashtags, 1200x627 dimensions
    assert.ok(draft.social.facebook.hashtags.length >= 3, 'Facebook should have at least 3 hashtags');
    assert.ok(draft.social.facebook.hashtags.length <= 5, 'Facebook should have at most 5 hashtags');
    assert.ok(
      draft.social.facebook.dimensions.includes('1200') && draft.social.facebook.dimensions.includes('627'),
      'Facebook dimensions should be 1200x627'
    );

    // Verify YouTube Shorts requirements: 5-10 hashtags, 1080x1920 dimensions, 15-60 sec
    assert.ok(draft.social.youtube.hashtags.length >= 5, 'YouTube should have at least 5 hashtags');
    assert.ok(draft.social.youtube.hashtags.length <= 10, 'YouTube should have at most 10 hashtags');
    assert.ok(
      draft.social.youtube.dimensions.includes('1080') && draft.social.youtube.dimensions.includes('1920'),
      'YouTube dimensions should be 1080x1920'
    );
    assert.ok(draft.social.youtube.duration, 'YouTube should have duration specified');
    assert.match(
      draft.social.youtube.duration,
      /\d+[\s-]*\d*\s*(?:seconds?|secs?|minutes?|mins?)/i,
      'YouTube duration should specify time in proper format'
    );

    // Verify all hashtags are strings and non-empty
    for (const platform of ['linkedin', 'x', 'instagram', 'tiktok', 'facebook', 'youtube']) {
      for (const hashtag of draft.social[platform].hashtags) {
        assert.ok(typeof hashtag === 'string', `${platform} hashtags should be strings`);
        assert.ok(hashtag.length > 0, `${platform} hashtags should not be empty`);
        assert.ok(hashtag.startsWith('#') || !hashtag.includes(' '), `${platform} hashtags should be valid`);
      }
    }

    console.log('✓ Test 2 passed: All platform requirements verified');
  } catch (error) {
    console.error('Test 2 error:', error.message);
    throw error;
  }
});

// Test 3: Handle errors gracefully
test('claude-drafting: handle errors gracefully', async () => {
  // Test with empty stories array
  try {
    await generateContent([]);
    assert.fail('Should throw error for empty stories array');
  } catch (error) {
    assert.ok(error.message.includes('No stories'), 'Should throw error for empty stories');
  }

  // Test with null stories
  try {
    await generateContent(null);
    assert.fail('Should throw error for null stories');
  } catch (error) {
    assert.ok(error.message.includes('No stories'), 'Should throw error for null stories');
  }

  console.log('✓ Test 3 passed: Errors handled gracefully');
});
