# AI Content Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weekly AI news-to-content automation pipeline that monitors RSS feeds, drafts evergreen blog posts (SEO), newsletters, and 6-platform social media captions, and surfaces all drafts for human review before publishing.

**Architecture:** A Netlify Function runs on a weekly schedule (Monday 9 AM), aggregates AI news from RSS feeds, calls Claude API once to generate blog + newsletter + 6 social posts with platform-specific formatting, stores drafts, and sends a review dashboard link. Owner reviews within 24 hours and clicks "Approve & Publish" to atomically commit the blog post to the repo, send the newsletter via MailerLite, and queue social posts to Buffer.

**Tech Stack:** Node.js (Netlify Functions), Claude API, RSS feed parser, MailerLite API, Buffer API, GitHub API (for commits), Supabase (optional, or JSON file storage).

**Spec:** `docs/superpowers/specs/2026-09-29-ai-content-engine-design.md`

---

## Global Constraints

- Claude API budget: <$2/month (1 call/week, ~4K tokens input max)
- RSS feed polling interval: Weekly (Monday 9 AM UTC)
- Review window: 24 hours (Monday 9 AM notification → Tuesday 9 AM deadline)
- All social posts must include captions, hashtags, and platform-specific dimensions
- Blog posts must be valid markdown with frontmatter (title, date, slug, seo_keywords)
- No external dependencies on paid services except MailerLite (already integrated), Buffer, and Claude API
- All secrets must be stored in Netlify environment variables, never committed

---

## Review Focus

These five input classes or failure modes are most likely to cause problems in production and are not fully tested by the task test suites:

1. **Empty/malformed RSS feeds** — If a monitored feed returns invalid XML or is temporarily unavailable, the aggregator must gracefully skip it and continue with other feeds, not crash the entire pipeline.

2. **Claude API timeout or rate limit** — A slow Claude API response or rate limiting must not cause the Netlify Function to exceed Lambda timeout; implement a timeout and fallback, and notify the owner if drafting fails.

3. **MailerLite/Buffer API failures during publish** — If the newsletter send or social queue fails after the blog post is already committed, the owner must be notified so they can retry those steps; no silent partial failures.

4. **Editing and re-approval** — The owner edits the blog post text in the review dashboard, approves, and expects the *edited* version to be published, not the original draft. Verify that edited content is what gets committed.

5. **Social content platform-specific validation** — Instagram hashtags, TikTok video dimensions, YouTube Shorts duration — each platform has different constraints. A draft with Instagram hashtags in excess of the limit or a TikTok video that's too long must be caught and reported to the owner before publishing.

---

## File Structure

```
netlify/
  functions/
    content-engine.js              (Main orchestration, scheduled trigger)
    utils/
      feed-monitor.js              (RSS aggregation)
      claude-drafting.js           (Claude API + prompting)
      storage.js                   (Draft storage/retrieval)
      publisher.js                 (Blog/newsletter/social publishing)
      mailer.js                    (Email notifications)
      platform-validators.js       (Social media format validation)
  
lxrydesigns/
  posts/                           (NEW folder for blog posts)
  blog.html                        (NEW blog listing/archive page)
  index.html                       (MODIFY: add blog nav link)

tests/
  unit/
    feed-monitor.test.js
    claude-drafting.test.js
    storage.test.js
    platform-validators.test.js
  integration/
    content-engine.test.js

public/
  review-dashboard.html            (Review UI, served as static file)

.env.example                       (MODIFY: add new variables)
netlify.toml                       (MODIFY: configure function + cron)
package.json                       (MODIFY: add dependencies)
```

---

## Task 1: Infrastructure & Configuration

**Files:**
- Create: `netlify/functions/content-engine.js` (skeleton)
- Create: `.env.example`
- Modify: `netlify.toml`
- Modify: `package.json`

**Interfaces:**
- Consumes: Netlify deploy context, environment variables
- Produces: Configured Netlify Function with scheduled trigger (Monday 9 AM) and accessible utility modules

**Description:**
Set up the Netlify Function boilerplate, configure environment variables for Claude, MailerLite, Buffer, and GitHub APIs, and ensure the function is scheduled to run weekly.

- [ ] **Step 1: Add required npm packages**

In `package.json`, add dependencies:
```json
{
  "dependencies": {
    "node-fetch": "^2.6.0",
    "rss-parser": "^3.13.0",
    "@anthropic-ai/sdk": "^0.25.0",
    "nodemailer": "^6.9.0"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Create `.env.example` with all required environment variables**

```
CLAUDE_API_KEY=sk-ant-...
MAILERLITE_API_KEY=...
BUFFER_API_KEY=...
GITHUB_TOKEN=...
GITHUB_REPO=user/lxrydesigns
GITHUB_REPO_OWNER=user
GITHUB_REPO_NAME=lxrydesigns
OWNER_EMAIL=barkerlovett@outlook.com
REVIEW_DASHBOARD_URL=https://[site-url]/review-dashboard.html
STORAGE_TYPE=json
SUPABASE_URL=...
SUPABASE_KEY=...
```

- [ ] **Step 3: Create `netlify/functions/content-engine.js` skeleton**

```javascript
// Netlify Function scheduled to run weekly (Monday 9 AM)
exports.handler = async (event, context) => {
  console.log("Content engine triggered at", new Date().toISOString());
  
  // Placeholder: will be implemented in subsequent tasks
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Content engine running" })
  };
};
```

- [ ] **Step 4: Update `netlify.toml` to configure the scheduled function**

```toml
[functions]
  directory = "netlify/functions"

[[scheduled_functions]]
name = "content-engine"
# Monday 9 AM UTC (adjust timezone as needed)
schedule = "0 9 * * 1"
```

- [ ] **Step 5: Commit**

```bash
git add package.json .env.example netlify.toml netlify/functions/content-engine.js
git commit -m "chore: set up Netlify Function infrastructure for AI content engine"
```

---

## Task 2: Feed Monitoring & Aggregation

**Files:**
- Create: `netlify/functions/utils/feed-monitor.js`
- Create: `tests/unit/feed-monitor.test.js`

**Interfaces:**
- Consumes: RSS feed URLs (array of strings from config)
- Produces: `aggregateFeeds(feedUrls: string[]): Promise<Story[]>` where `Story = { title, link, summary, source, publishedDate }`

**Description:**
Implement RSS feed polling and aggregation. Fetch 7 monitored AI news feeds in parallel, extract stories, deduplicate by link, and return sorted by date (newest first).

- [ ] **Step 1: Write failing test for feed aggregation**

In `tests/unit/feed-monitor.test.js`:
```javascript
const { aggregateFeeds } = require('../../netlify/functions/utils/feed-monitor');

describe('Feed Monitor', () => {
  it('should aggregate stories from multiple RSS feeds', async () => {
    const feedUrls = [
      'https://example.com/feed1.xml',
      'https://example.com/feed2.xml'
    ];
    
    const stories = await aggregateFeeds(feedUrls);
    
    expect(stories).toBeInstanceOf(Array);
    expect(stories.length).toBeGreaterThan(0);
    expect(stories[0]).toHaveProperty('title');
    expect(stories[0]).toHaveProperty('link');
    expect(stories[0]).toHaveProperty('summary');
    expect(stories[0]).toHaveProperty('source');
  });

  it('should deduplicate stories by link', async () => {
    const feedUrls = [
      'https://example.com/feed1.xml',
      'https://example.com/feed2.xml'
    ];
    
    const stories = await aggregateFeeds(feedUrls);
    const links = stories.map(s => s.link);
    const uniqueLinks = new Set(links);
    
    expect(links.length).toBe(uniqueLinks.size);
  });

  it('should return stories sorted by date (newest first)', async () => {
    const feedUrls = [
      'https://example.com/feed1.xml'
    ];
    
    const stories = await aggregateFeeds(feedUrls);
    
    for (let i = 0; i < stories.length - 1; i++) {
      expect(new Date(stories[i].publishedDate).getTime()).toBeGreaterThanOrEqual(
        new Date(stories[i + 1].publishedDate).getTime()
      );
    }
  });

  it('should gracefully handle a failed feed and continue with others', async () => {
    const feedUrls = [
      'https://example.com/bad-feed.xml',
      'https://example.com/good-feed.xml'
    ];
    
    const stories = await aggregateFeeds(feedUrls);
    
    expect(stories.length).toBeGreaterThan(0);
    // Should have stories from at least the good feed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/feed-monitor.test.js`  
Expected: FAIL with "aggregateFeeds is not defined"

- [ ] **Step 3: Implement `aggregateFeeds()` in `netlify/functions/utils/feed-monitor.js`**

Use the `rss-parser` npm package to fetch and parse RSS feeds. Implement:
- Fetch all feeds in parallel (Promise.all)
- Extract title, link, summary, source (from feed title), and publishedDate
- Deduplicate by link
- Sort by publishedDate descending
- On feed error, log and continue (do not throw)
- Return top 15 stories (per spec, "top 10-15 stories")

```javascript
const Parser = require('rss-parser');

const DEFAULT_FEEDS = [
  'https://www.therunddown.ai/feed', // Example URLs; adjust based on actual feed endpoints
  'https://www.bensbites.co/rss.xml',
  // ... add all 7 feeds from spec
];

async function aggregateFeeds(feedUrls = DEFAULT_FEEDS) {
  const parser = new Parser();
  const stories = [];

  const results = await Promise.allSettled(
    feedUrls.map(url => parser.parseURL(url))
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const feed = result.value;
      (feed.items || []).forEach(item => {
        stories.push({
          title: item.title,
          link: item.link,
          summary: item.content || item.summary || '',
          source: feed.title,
          publishedDate: item.pubDate || new Date().toISOString()
        });
      });
    } else {
      console.error(`Failed to fetch feed ${feedUrls[index]}:`, result.reason);
    }
  });

  // Deduplicate by link
  const seen = new Set();
  const unique = stories.filter(s => {
    if (seen.has(s.link)) return false;
    seen.add(s.link);
    return true;
  });

  // Sort by date descending
  unique.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));

  // Return top 15
  return unique.slice(0, 15);
}

module.exports = { aggregateFeeds };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/feed-monitor.test.js`  
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/utils/feed-monitor.js tests/unit/feed-monitor.test.js
git commit -m "feat: implement RSS feed monitoring and aggregation"
```

---

## Task 3: Storage Layer (Draft Management)

**Files:**
- Create: `netlify/functions/utils/storage.js`
- Create: `tests/unit/storage.test.js`

**Interfaces:**
- Consumes: Draft object (blog, newsletter, social)
- Produces: 
  - `saveDraft(draftId: string, draft: Draft): Promise<void>`
  - `getDraft(draftId: string): Promise<Draft>`
  - `deleteDraft(draftId: string): Promise<void>`
  - `getDraftApprovalToken(draftId: string): string` (returns a secure token for reviewing)

**Description:**
Implement a simple storage layer for keeping drafts between the generation step and the review/approval step. Use JSON file (simpler) or Supabase (more scalable). For now, implement JSON file storage; Supabase can be swapped in later.

- [ ] **Step 1: Write failing test for draft storage**

In `tests/unit/storage.test.js`:
```javascript
const { saveDraft, getDraft, deleteDraft } = require('../../netlify/functions/utils/storage');

describe('Draft Storage', () => {
  it('should save and retrieve a draft', async () => {
    const draftId = 'draft-' + Date.now();
    const draft = {
      blog: { title: 'Test Post', content: '# Test', frontmatter: {} },
      newsletter: { subject: 'AI News', body: '<p>...</p>' },
      social: {
        linkedin: { caption: 'Test', hashtags: ['#AI'], dimensions: '1200x627' },
        x: { caption: 'Test', hashtags: ['#AI'], length: '280 chars' }
      }
    };
    
    await saveDraft(draftId, draft);
    const retrieved = await getDraft(draftId);
    
    expect(retrieved).toEqual(draft);
  });

  it('should delete a draft', async () => {
    const draftId = 'draft-' + Date.now();
    const draft = { blog: {}, newsletter: {}, social: {} };
    
    await saveDraft(draftId, draft);
    await deleteDraft(draftId);
    
    const retrieved = await getDraft(draftId);
    expect(retrieved).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/storage.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement storage functions in `netlify/functions/utils/storage.js`**

```javascript
const fs = require('fs').promises;
const path = require('path');

const DRAFTS_DIR = path.join(__dirname, '../../.drafts');

async function ensureDraftsDir() {
  try {
    await fs.mkdir(DRAFTS_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create drafts directory:', err);
  }
}

async function saveDraft(draftId, draft) {
  await ensureDraftsDir();
  const filePath = path.join(DRAFTS_DIR, `${draftId}.json`);
  await fs.writeFile(filePath, JSON.stringify(draft, null, 2), 'utf-8');
}

async function getDraft(draftId) {
  try {
    const filePath = path.join(DRAFTS_DIR, `${draftId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function deleteDraft(draftId) {
  try {
    const filePath = path.join(DRAFTS_DIR, `${draftId}.json`);
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function getDraftApprovalToken(draftId) {
  // Simple token: base64(draftId + timestamp)
  // In production, use a real JWT or secure token library
  return Buffer.from(`${draftId}:${Date.now()}`).toString('base64');
}

module.exports = { saveDraft, getDraft, deleteDraft, getDraftApprovalToken };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/storage.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/utils/storage.js tests/unit/storage.test.js
git commit -m "feat: implement draft storage layer"
```

---

## Task 4: Claude API Integration & Content Drafting

**Files:**
- Create: `netlify/functions/utils/claude-drafting.js`
- Create: `tests/unit/claude-drafting.test.js`

**Interfaces:**
- Consumes: `stories: Story[]` (from feed aggregation)
- Produces: `generateContent(stories: Story[]): Promise<Draft>` where `Draft` contains blog (markdown + frontmatter), newsletter (HTML), and social (6 platforms with captions, hashtags, dimensions)

**Description:**
Call Claude API with the week's stories and a detailed prompt that generates:
1. One evergreen blog post (800–1,200 words, SEO-optimized, markdown with frontmatter)
2. One newsletter email (200–300 words, HTML)
3. Six social media posts (one per platform: LinkedIn, X, Instagram, TikTok, Facebook, YouTube) with captions, hashtags, and platform-specific dimensions

- [ ] **Step 1: Write failing test for content generation**

In `tests/unit/claude-drafting.test.js`:
```javascript
const { generateContent } = require('../../netlify/functions/utils/claude-drafting');

describe('Claude Drafting', () => {
  it('should generate blog + newsletter + social content from stories', async () => {
    const stories = [
      {
        title: 'OpenAI Releases GPT-5',
        link: 'https://example.com/story1',
        summary: 'OpenAI announced GPT-5 with improved reasoning.',
        source: 'OpenAI Blog',
        publishedDate: new Date().toISOString()
      },
      {
        title: 'Google AI Updates Gemini',
        link: 'https://example.com/story2',
        summary: 'Gemini now supports longer context windows.',
        source: 'Google AI Blog',
        publishedDate: new Date().toISOString()
      }
    ];

    const draft = await generateContent(stories);

    // Check blog post
    expect(draft.blog).toBeDefined();
    expect(draft.blog.title).toBeTruthy();
    expect(draft.blog.content).toBeTruthy();
    expect(draft.blog.frontmatter).toBeDefined();
    expect(draft.blog.frontmatter.slug).toBeTruthy();
    expect(draft.blog.frontmatter.seo_keywords).toBeTruthy();

    // Check newsletter
    expect(draft.newsletter).toBeDefined();
    expect(draft.newsletter.subject).toBeTruthy();
    expect(draft.newsletter.body).toBeTruthy();

    // Check social (6 platforms)
    expect(draft.social).toBeDefined();
    const platforms = ['linkedin', 'x', 'instagram', 'tiktok', 'facebook', 'youtube'];
    platforms.forEach(platform => {
      expect(draft.social[platform]).toBeDefined();
      expect(draft.social[platform].caption).toBeTruthy();
      expect(draft.social[platform].hashtags).toBeTruthy();
      expect(draft.social[platform].dimensions || draft.social[platform].length).toBeTruthy();
    });
  });

  it('should include specific platform requirements (hashtag count, dimensions)', async () => {
    const stories = [{
      title: 'Test Story',
      link: 'https://example.com',
      summary: 'A test story',
      source: 'Test',
      publishedDate: new Date().toISOString()
    }];

    const draft = await generateContent(stories);

    // Instagram: 15-25 hashtags
    expect(draft.social.instagram.hashtags.length).toBeGreaterThanOrEqual(15);
    expect(draft.social.instagram.hashtags.length).toBeLessThanOrEqual(25);

    // TikTok: 15-60 second duration mentioned
    expect(draft.social.tiktok.duration).toMatch(/(\d+)-(\d+) sec/);

    // LinkedIn: 1200x627 dimension
    expect(draft.social.linkedin.dimensions).toBe('1200x627');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/claude-drafting.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `generateContent()` in `netlify/functions/utils/claude-drafting.js`**

```javascript
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic.default({
  apiKey: process.env.CLAUDE_API_KEY
});

async function generateContent(stories) {
  const storiesSummary = stories
    .map((s, i) => `${i + 1}. **${s.title}** (${s.source})\n   ${s.summary}\n   Link: ${s.link}`)
    .join('\n\n');

  const prompt = `You are an AI content strategist for LXRY Designs, a business that helps clients with AI automation.

This week's top AI news stories:
${storiesSummary}

Your task: Generate a complete content package for the week, including:

1. **Blog Post** (800–1,200 words):
   - Write an evergreen, SEO-optimized blog post inspired by these stories
   - Focus on practical business implications and how to use these AI tools
   - Include an original take, not just news rehash
   - Format as markdown with YAML frontmatter
   - Include: title, slug (kebab-case), date (YYYY-MM-DD), seo_keywords (array of 5-10)

2. **Newsletter** (200–300 words):
   - Summarize the week's highlights
   - Include a call-to-action linking to the blog post
   - Format as HTML snippet (<p>, <ul>, <li>, <a> tags only)

3. **Social Media Posts** (one for each platform below):
   - Each platform has specific tone, length, and format requirements
   - Include captions, hashtags, and platform specifications
   - Ensure hashtags meet platform guidelines (e.g., Instagram 15–25, TikTok 5–10)

**LinkedIn:**
- Professional tone, link to blog
- Caption: 1–3 sentences
- Hashtags: 5–10
- Dimensions: 1200x627 (for image)

**X (Twitter):**
- Punchy, news-focused
- Caption: up to 280 characters
- Hashtags: 3–5
- Format: text + link

**Instagram:**
- Engaging, visual focus
- Caption: 1–2 sentences
- Hashtags: 15–25
- Dimensions: 1080x1350 (feed) or 1080x1920 (Reel)

**TikTok:**
- Trendy, informal, relatable
- Caption: 1 sentence hook
- Hashtags: 5–10
- Dimensions: 1080x1920
- Duration: 15–60 seconds

**Facebook:**
- Community-friendly, conversational
- Caption: 1–2 sentences
- Hashtags: 3–5
- Dimensions: 1200x627

**YouTube Shorts:**
- Story-driven, educational
- Caption: 1 sentence hook
- Hashtags: 5–10
- Dimensions: 1080x1920
- Duration: 15–60 seconds

Return your response as a JSON object with this exact structure:
{
  "blog": {
    "title": "...",
    "content": "...(full markdown content)...",
    "frontmatter": {
      "slug": "...",
      "seo_keywords": ["keyword1", "keyword2", ...]
    }
  },
  "newsletter": {
    "subject": "AI News Roundup: Week of [DATE]",
    "body": "...(HTML snippet)..."
  },
  "social": {
    "linkedin": {
      "caption": "...",
      "hashtags": ["#tag1", "#tag2"],
      "dimensions": "1200x627"
    },
    "x": {
      "caption": "...",
      "hashtags": ["#tag1"],
      "length": "280 chars"
    },
    "instagram": {
      "caption": "...",
      "hashtags": [...],
      "dimensions": "1080x1350 (feed) or 1080x1920 (Reel)"
    },
    "tiktok": {
      "caption": "...",
      "hashtags": [...],
      "dimensions": "1080x1920",
      "duration": "15-60 sec"
    },
    "facebook": {
      "caption": "...",
      "hashtags": [...],
      "dimensions": "1200x627"
    },
    "youtube": {
      "caption": "...",
      "hashtags": [...],
      "dimensions": "1080x1920",
      "duration": "15-60 sec"
    }
  }
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const draft = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

    // Add blog frontmatter date
    if (!draft.blog.frontmatter.date) {
      draft.blog.frontmatter.date = new Date().toISOString().split('T')[0];
    }

    return draft;
  } catch (err) {
    console.error('Failed to generate content:', err);
    throw new Error(`Claude API error: ${err.message}`);
  }
}

module.exports = { generateContent };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/claude-drafting.test.js`  
Expected: PASS (may take a minute since it calls Claude API; consider mocking for faster tests)

Note: For faster local testing, mock the Claude API call. For integration tests, use real API.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/utils/claude-drafting.js tests/unit/claude-drafting.test.js
git commit -m "feat: implement Claude API integration for content drafting"
```

---

## Task 5: Platform Validation & Review Dashboard

**Files:**
- Create: `netlify/functions/utils/platform-validators.js`
- Create: `public/review-dashboard.html`
- Create: `netlify/functions/review-handler.js`
- Create: `tests/unit/platform-validators.test.js`

**Interfaces:**
- Consumes: Draft object with social posts
- Produces: 
  - `validateSocialPosts(draft: Draft): ValidationResult[]` (returns list of errors if any)
  - Review dashboard HTML that accepts draft ID + approval token, displays preview, allows editing, and submits approval

**Description:**
Validate that each social media post meets platform requirements (hashtag count, video dimensions, caption length) before presenting to the owner. Build a simple HTML review dashboard that:
1. Fetches the draft by ID and token
2. Displays blog, newsletter, and social previews
3. Allows inline editing of captions and hashtags
4. Submits an approval request that triggers publishing

- [ ] **Step 1: Write failing test for platform validation**

In `tests/unit/platform-validators.test.js`:
```javascript
const { validateSocialPosts } = require('../../netlify/functions/utils/platform-validators');

describe('Platform Validators', () => {
  it('should validate Instagram hashtag count (15-25)', () => {
    const draft = {
      social: {
        instagram: {
          caption: 'Test',
          hashtags: ['#tag1', '#tag2'] // Too few
        }
      }
    };

    const errors = validateSocialPosts(draft);

    expect(errors).toContainEqual(
      expect.objectContaining({
        platform: 'instagram',
        message: expect.stringContaining('hashtags')
      })
    );
  });

  it('should validate TikTok duration (15-60 sec)', () => {
    const draft = {
      social: {
        tiktok: {
          caption: 'Test',
          duration: '120 sec' // Too long
        }
      }
    };

    const errors = validateSocialPosts(draft);

    expect(errors).toContainEqual(
      expect.objectContaining({
        platform: 'tiktok',
        message: expect.stringContaining('duration')
      })
    );
  });

  it('should pass validation for correct data', () => {
    const draft = {
      social: {
        instagram: {
          caption: 'Test',
          hashtags: Array.from({ length: 20 }, (_, i) => `#tag${i}`)
        },
        tiktok: {
          caption: 'Test',
          duration: '30 sec'
        }
      }
    };

    const errors = validateSocialPosts(draft);

    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/platform-validators.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `validateSocialPosts()` in `netlify/functions/utils/platform-validators.js`**

```javascript
function validateSocialPosts(draft) {
  const errors = [];
  const social = draft.social || {};

  // Instagram: 15-25 hashtags
  if (social.instagram) {
    const tagCount = social.instagram.hashtags?.length || 0;
    if (tagCount < 15 || tagCount > 25) {
      errors.push({
        platform: 'instagram',
        message: `Instagram hashtags must be 15-25 (found ${tagCount})`
      });
    }
  }

  // TikTok: 15-60 seconds
  if (social.tiktok) {
    const durationStr = social.tiktok.duration || '';
    const match = durationStr.match(/(\d+)/);
    if (match) {
      const seconds = parseInt(match[1]);
      if (seconds < 15 || seconds > 60) {
        errors.push({
          platform: 'tiktok',
          message: `TikTok duration must be 15-60 seconds (found ${seconds})`
        });
      }
    }
  }

  // YouTube Shorts: 15-60 seconds
  if (social.youtube) {
    const durationStr = social.youtube.duration || '';
    const match = durationStr.match(/(\d+)/);
    if (match) {
      const seconds = parseInt(match[1]);
      if (seconds < 15 || seconds > 60) {
        errors.push({
          platform: 'youtube',
          message: `YouTube Shorts duration must be 15-60 seconds (found ${seconds})`
        });
      }
    }
  }

  // LinkedIn & Facebook: hashtags 3-10
  ['linkedin', 'facebook'].forEach(platform => {
    if (social[platform]) {
      const tagCount = social[platform].hashtags?.length || 0;
      if (tagCount < 3 || tagCount > 10) {
        errors.push({
          platform,
          message: `${platform} hashtags should be 3-10 (found ${tagCount})`
        });
      }
    }
  });

  // X: caption <= 280 chars
  if (social.x) {
    const caption = social.x.caption || '';
    if (caption.length > 280) {
      errors.push({
        platform: 'x',
        message: `X caption must be ≤280 chars (found ${caption.length})`
      });
    }
  }

  return errors;
}

module.exports = { validateSocialPosts };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/platform-validators.test.js`  
Expected: PASS

- [ ] **Step 5: Create review dashboard HTML in `public/review-dashboard.html`**

This is a single-page HTML/JS app that:
- Accepts `?draftId=...&token=...` in URL
- Fetches draft from server
- Displays blog preview (rendered markdown), newsletter preview (HTML), social previews (cards per platform)
- Allows inline editing of captions and hashtags
- Has "Approve & Publish" button that POSTs approval request

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Content Review Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { color: #333; margin-bottom: 10px; }
    .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .section h2 { color: #333; margin-bottom: 15px; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
    .blog-preview { line-height: 1.6; color: #666; }
    .blog-preview h1, .blog-preview h2, .blog-preview h3 { margin: 15px 0 10px; color: #333; }
    .newsletter-preview { background: #f9f9f9; padding: 15px; border-radius: 4px; }
    .social-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
    .social-card { border: 1px solid #ddd; padding: 15px; border-radius: 4px; }
    .social-card h3 { margin-bottom: 10px; color: #0066cc; }
    .social-card textarea { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 12px; }
    .social-card ul { margin-left: 20px; }
    .hashtags { margin: 10px 0; }
    .hashtags input { width: 100%; padding: 8px; margin: 5px 0; }
    .error { background: #ffe6e6; color: #c00; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
    .error ul { margin-left: 20px; }
    .button-group { display: flex; gap: 10px; margin-top: 20px; }
    button { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
    .btn-primary { background: #0066cc; color: white; }
    .btn-primary:hover { background: #0052a3; }
    .btn-secondary { background: #ccc; color: #333; }
    .loading { text-align: center; padding: 40px; }
    .error-message { background: #ffe6e6; color: #c00; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AI Content Review Dashboard</h1>
      <p>Review and approve this week's blog, newsletter, and social media content.</p>
    </div>

    <div id="loading" class="loading">Loading draft...</div>
    <div id="content" style="display: none;">
      <div id="errors"></div>

      <!-- Blog Section -->
      <div class="section">
        <h2>📝 Blog Post</h2>
        <div class="blog-preview" id="blogPreview"></div>
      </div>

      <!-- Newsletter Section -->
      <div class="section">
        <h2>📧 Newsletter</h2>
        <div class="newsletter-preview" id="newsletterPreview"></div>
      </div>

      <!-- Social Media Section -->
      <div class="section">
        <h2>📱 Social Media Posts</h2>
        <div class="social-cards" id="socialCards"></div>
      </div>

      <div class="button-group">
        <button class="btn-primary" onclick="approveDraft()">✓ Approve & Publish</button>
        <button class="btn-secondary" onclick="window.location.reload()">↻ Refresh</button>
      </div>
    </div>
  </div>

  <script>
    let draft = null;
    let draftId = null;
    let token = null;

    async function loadDraft() {
      const params = new URLSearchParams(window.location.search);
      draftId = params.get('draftId');
      token = params.get('token');

      if (!draftId || !token) {
        document.getElementById('errors').innerHTML = '<div class="error-message">Invalid draft ID or token.</div>';
        document.getElementById('loading').style.display = 'none';
        return;
      }

      try {
        const response = await fetch(`/.netlify/functions/review-handler?draftId=${draftId}&token=${token}&action=get`);
        if (!response.ok) throw new Error('Failed to load draft');
        draft = await response.json();

        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';

        renderBlog();
        renderNewsletter();
        renderSocial();
        displayValidationErrors();
      } catch (err) {
        document.getElementById('errors').innerHTML = `<div class="error-message">Error loading draft: ${err.message}</div>`;
        document.getElementById('loading').style.display = 'none';
      }
    }

    function renderBlog() {
      const blog = draft.blog;
      const markdown = blog.content || '';
      // Simple markdown to HTML (basic; consider using markdown-it library for production)
      const html = markdown
        .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
        .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
        .replace(/^\* (.*?)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^([^<].*?)$/gm, '<p>$1</p>');

      document.getElementById('blogPreview').innerHTML = `
        <h1>${blog.title}</h1>
        <p><small>Slug: ${blog.frontmatter.slug} | Date: ${blog.frontmatter.date}</small></p>
        <div>${html}</div>
      `;
    }

    function renderNewsletter() {
      const newsletter = draft.newsletter;
      document.getElementById('newsletterPreview').innerHTML = `
        <strong>Subject:</strong> ${newsletter.subject}<br>
        <hr>
        ${newsletter.body}
      `;
    }

    function renderSocial() {
      const social = draft.social;
      const platforms = ['linkedin', 'x', 'instagram', 'tiktok', 'facebook', 'youtube'];
      const html = platforms.map(platform => {
        const post = social[platform];
        return `
          <div class="social-card">
            <h3>${platform.charAt(0).toUpperCase() + platform.slice(1)}</h3>
            <p><strong>Caption:</strong></p>
            <textarea id="caption-${platform}" rows="3">${post.caption}</textarea>
            <p><strong>Hashtags:</strong></p>
            <div class="hashtags" id="hashtags-${platform}">
              ${post.hashtags.map((tag, i) => `<input type="text" value="${tag}" data-index="${i}">`).join('')}
            </div>
            <p><small>${post.dimensions || post.length || ''}</small></p>
          </div>
        `;
      }).join('');
      document.getElementById('socialCards').innerHTML = html;
    }

    function displayValidationErrors() {
      const validation = draft.validation || [];
      if (validation.length > 0) {
        const errorHtml = `
          <div class="error">
            <strong>⚠️ Validation Issues:</strong>
            <ul>
              ${validation.map(e => `<li>${e.platform}: ${e.message}</li>`).join('')}
            </ul>
          </div>
        `;
        document.getElementById('errors').innerHTML = errorHtml;
      }
    }

    async function approveDraft() {
      // Collect edited content
      const editedDraft = JSON.parse(JSON.stringify(draft));
      const platforms = ['linkedin', 'x', 'instagram', 'tiktok', 'facebook', 'youtube'];

      platforms.forEach(platform => {
        editedDraft.social[platform].caption = document.getElementById(`caption-${platform}`).value;
        editedDraft.social[platform].hashtags = Array.from(
          document.querySelectorAll(`#hashtags-${platform} input`)
        ).map(input => input.value);
      });

      try {
        const response = await fetch('/.netlify/functions/review-handler', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId,
            token,
            action: 'approve',
            draft: editedDraft
          })
        });

        if (!response.ok) throw new Error('Failed to approve draft');
        alert('✓ Draft approved and publishing...');
        window.location.href = '/';
      } catch (err) {
        alert('Error approving draft: ' + err.message);
      }
    }

    loadDraft();
  </script>
</body>
</html>
```

- [ ] **Step 6: Create review handler function in `netlify/functions/review-handler.js`**

This function:
- GET: retrieves draft by ID and token, runs validation
- POST: receives approved (possibly edited) draft and triggers publishing

```javascript
const { getDraft, deleteDraft, getDraftApprovalToken } = require('./utils/storage');
const { validateSocialPosts } = require('./utils/platform-validators');

exports.handler = async (event, context) => {
  const { draftId, token, action } = event.queryStringParameters || {};

  if (event.httpMethod === 'GET' && action === 'get') {
    try {
      const draft = await getDraft(draftId);
      if (!draft) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Draft not found' }) };
      }

      // Validate draft
      const validation = validateSocialPosts(draft);
      draft.validation = validation;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'POST' && action === 'approve') {
    try {
      const body = JSON.parse(event.body);
      // In production, verify token is valid
      // await publishDraft(body.draft); // This will be implemented in Task 6

      await deleteDraft(draftId);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Draft approved and scheduled for publishing' })
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
};
```

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/utils/platform-validators.js netlify/functions/review-handler.js public/review-dashboard.html tests/unit/platform-validators.test.js
git commit -m "feat: add platform validation and review dashboard"
```

---

## Task 6: Publishing Pipeline (Blog, Newsletter, Social)

**Files:**
- Create: `netlify/functions/utils/publisher.js`
- Create: `netlify/functions/utils/mailer.js`
- Modify: `lxrydesigns/posts/.gitkeep` (create folder)
- Create: `lxrydesigns/blog.html`
- Modify: `lxrydesigns/index.html` (add blog nav link)
- Modify: `netlify.toml` (add build command for blog rendering)

**Interfaces:**
- Consumes: Approved draft (blog, newsletter, social)
- Produces: 
  - Blog post committed to repo and published on rebuild
  - Newsletter sent to MailerLite subscribers
  - Social posts queued in Buffer
  - Email notification to owner

**Description:**
Implement the publishing pipeline: commit blog markdown to `/posts/`, trigger newsletter send, queue social posts, and notify owner of success/failure.

- [ ] **Step 1: Create blog folder and gitkeep**

```bash
mkdir -p lxrydesigns/posts
touch lxrydesigns/posts/.gitkeep
```

- [ ] **Step 2: Implement `publisher.js` with three publishing functions**

In `netlify/functions/utils/publisher.js`:

```javascript
const fetch = require('node-fetch');

async function publishBlog(draft) {
  // Create markdown file with frontmatter
  const date = draft.blog.frontmatter.date || new Date().toISOString().split('T')[0];
  const slug = draft.blog.frontmatter.slug;
  const filename = `${date}-${slug}.md`;

  const frontmatter = `---
title: "${draft.blog.frontmatter.title || draft.blog.title}"
date: ${date}
slug: ${slug}
description: "${draft.blog.frontmatter.description || ''}"
tags: ["AI", "News", "Automation"]
seo_keywords: ${JSON.stringify(draft.blog.frontmatter.seo_keywords || [])}
---

${draft.blog.content}
`;

  // Commit to GitHub (simulated; in production use GitHub API)
  const githubApiUrl = `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/contents/lxrydesigns/posts/${filename}`;

  const response = await fetch(githubApiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `blog: add post "${draft.blog.title}"`,
      content: Buffer.from(frontmatter).toString('base64'),
      branch: 'main'
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to publish blog: ${response.statusText}`);
  }

  return { success: true, filename };
}

async function sendNewsletter(draft) {
  const mailerliteApiUrl = 'https://connect.mailerlite.com/api/subscribers';

  // Send newsletter to all subscribers
  // Note: MailerLite doesn't have a direct "send to all" endpoint
  // This is a simplification; in production, use MailerLite's campaigns API

  const response = await fetch('https://api.mailerlite.com/v1/campaigns', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subject: draft.newsletter.subject,
      body_html: draft.newsletter.body,
      type: 'newsletter'
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send newsletter: ${response.statusText}`);
  }

  return { success: true, subject: draft.newsletter.subject };
}

async function queueSocial(draft) {
  const bufferApiUrl = 'https://api.bufferapp.com/1/updates/create.json';
  const results = [];

  for (const [platform, post] of Object.entries(draft.social)) {
    const text = `${post.caption}\n\n${post.hashtags.join(' ')}`;

    const response = await fetch(bufferApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: process.env.BUFFER_API_KEY,
        profile_ids: [`[${platform}_profile_id]`], // Note: Profile IDs need to be configured
        text,
        media: { title: post.caption },
        shorten: false
      })
    });

    if (response.ok) {
      results.push({ platform, success: true });
    } else {
      results.push({ platform, success: false, error: response.statusText });
    }
  }

  return { results };
}

async function publishAll(draft) {
  const results = {};

  try {
    results.blog = await publishBlog(draft);
  } catch (err) {
    results.blog = { success: false, error: err.message };
  }

  try {
    results.newsletter = await sendNewsletter(draft);
  } catch (err) {
    results.newsletter = { success: false, error: err.message };
  }

  try {
    results.social = await queueSocial(draft);
  } catch (err) {
    results.social = { success: false, error: err.message };
  }

  return results;
}

module.exports = { publishBlog, sendNewsletter, queueSocial, publishAll };
```

- [ ] **Step 3: Implement `mailer.js` for email notifications**

In `netlify/functions/utils/mailer.js`:

```javascript
const nodemailer = require('nodemailer');

// Configure your email provider (e.g., SendGrid, Mailgun)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or use SendGrid, Mailgun, etc.
  auth: {
    user: process.env.OWNER_EMAIL,
    pass: process.env.EMAIL_PASSWORD // Use app-specific password or API key
  }
});

async function sendReviewNotification(draftId, reviewUrl) {
  await transporter.sendMail({
    from: process.env.OWNER_EMAIL,
    to: process.env.OWNER_EMAIL,
    subject: '🤖 AI Content Ready for Review',
    html: `
      <p>Your weekly AI news content is ready for review!</p>
      <p><a href="${reviewUrl}?draftId=${draftId}" style="background: #0066cc; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none;">Review & Approve</a></p>
      <p>You have 24 hours to review and approve.</p>
    `
  });
}

async function sendPublishConfirmation(results) {
  const failedItems = Object.entries(results).filter(([key, val]) => !val.success);

  await transporter.sendMail({
    from: process.env.OWNER_EMAIL,
    to: process.env.OWNER_EMAIL,
    subject: failedItems.length > 0 ? '⚠️ Content Published (with issues)' : '✓ Content Published Successfully',
    html: `
      <p>Your content has been published:</p>
      <ul>
        <li>Blog: ${results.blog.success ? '✓' : '✗ ' + results.blog.error}</li>
        <li>Newsletter: ${results.newsletter.success ? '✓' : '✗ ' + results.newsletter.error}</li>
        <li>Social: ${results.social.results.filter(r => r.success).length} of ${results.social.results.length} posted</li>
      </ul>
      ${failedItems.length > 0 ? '<p>Please check the failed items and retry manually.</p>' : ''}
    `
  });
}

module.exports = { sendReviewNotification, sendPublishConfirmation };
```

- [ ] **Step 4: Create blog listing page `lxrydesigns/blog.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Blog — LXRY Designs</title>
  <link rel="stylesheet" href="assets/fonts/fonts.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: white; color: #333; }
    .container { max-width: 1000px; margin: 0 auto; padding: 60px 20px; }
    h1 { font-size: 2.5em; margin-bottom: 10px; color: #1a1a1a; }
    .intro { font-size: 1.1em; color: #666; margin-bottom: 40px; }
    .posts { list-style: none; }
    .post { padding: 30px 0; border-bottom: 1px solid #eee; }
    .post:last-child { border-bottom: none; }
    .post h2 { font-size: 1.5em; margin-bottom: 10px; }
    .post h2 a { color: #0066cc; text-decoration: none; }
    .post h2 a:hover { text-decoration: underline; }
    .post .meta { color: #999; font-size: 0.9em; margin-bottom: 15px; }
    .post .description { color: #666; line-height: 1.6; margin-bottom: 15px; }
    .post a.read-more { color: #0066cc; text-decoration: none; font-weight: 500; }
    .post a.read-more:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <nav>
    <a href="index.html" class="logo">← Back to Home</a>
  </nav>

  <div class="container">
    <h1>AI Insights & News</h1>
    <p class="intro">Weekly explorations of AI trends, practical tools, and automation strategies for businesses.</p>

    <ul class="posts" id="postsList">
      <li class="post"><p>Loading posts...</p></li>
    </ul>
  </div>

  <script>
    async function loadPosts() {
      try {
        const response = await fetch('/api/posts.json');
        const posts = await response.json();

        const postsList = document.getElementById('postsList');
        postsList.innerHTML = posts.map(post => `
          <li class="post">
            <h2><a href="/posts/${post.slug}.html">${post.title}</a></h2>
            <div class="meta">${new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <p class="description">${post.description}</p>
            <a href="/posts/${post.slug}.html" class="read-more">Read more →</a>
          </li>
        `).join('');
      } catch (err) {
        document.getElementById('postsList').innerHTML = '<li class="post"><p>Unable to load posts.</p></li>';
      }
    }

    loadPosts();
  </script>
</body>
</html>
```

- [ ] **Step 5: Modify `lxrydesigns/index.html` to add blog link to navigation**

Find the `<nav>` section and add a blog link:

```html
<li><a href="/blog.html" data-i18n="nav.blog">Blog</a></li>
```

(Add this line to both EN and FR nav sections if applicable.)

- [ ] **Step 6: Update `netlify.toml` to build blog post listings**

Add a build command that processes markdown posts and generates an `api/posts.json` index:

```toml
[build]
command = "node scripts/build-blog.js && npm run build"
```

Create `scripts/build-blog.js`:

```javascript
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const postsDir = path.join(__dirname, '../lxrydesigns/posts');
const outputDir = path.join(__dirname, '../public/api');

const posts = [];

fs.readdirSync(postsDir).forEach(file => {
  if (!file.endsWith('.md')) return;

  const content = fs.readFileSync(path.join(postsDir, file), 'utf-8');
  const { data } = matter(content);

  posts.push({
    title: data.title,
    slug: data.slug,
    date: data.date,
    description: data.description
  });
});

posts.sort((a, b) => new Date(b.date) - new Date(a.date));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, 'posts.json'),
  JSON.stringify(posts, null, 2)
);

console.log(`Built blog index: ${posts.length} posts`);
```

- [ ] **Step 7: Update `review-handler.js` to call `publishAll()`**

Modify the POST handler to call publishing:

```javascript
if (event.httpMethod === 'POST' && action === 'approve') {
  try {
    const body = JSON.parse(event.body);
    const { publishAll } = require('./utils/publisher');
    const { sendPublishConfirmation } = require('./utils/mailer');

    const results = await publishAll(body.draft);
    await sendPublishConfirmation(results);
    await deleteDraft(draftId);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Content published successfully', results })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/utils/publisher.js netlify/functions/utils/mailer.js lxrydesigns/blog.html lxrydesigns/posts/.gitkeep scripts/build-blog.js netlify.toml
git commit -m "feat: implement publishing pipeline (blog, newsletter, social, email)"
```

---

## Task 7: Main Orchestration & End-to-End Integration

**Files:**
- Modify: `netlify/functions/content-engine.js` (complete implementation)

**Interfaces:**
- Consumes: Scheduled trigger (Monday 9 AM)
- Produces: Complete workflow execution (fetch feeds → draft → store → notify owner)

**Description:**
Tie everything together in the main `content-engine` function: fetch feeds, draft content, validate, store draft, send review notification.

- [ ] **Step 1: Implement the complete `content-engine.js`**

```javascript
const { aggregateFeeds } = require('./utils/feed-monitor');
const { generateContent } = require('./utils/claude-drafting');
const { saveDraft, getDraftApprovalToken } = require('./utils/storage');
const { validateSocialPosts } = require('./utils/platform-validators');
const { sendReviewNotification } = require('./utils/mailer');

const DEFAULT_FEEDS = [
  'https://www.therunddown.ai/feed.xml',
  'https://www.bensbites.co/rss.xml',
  'https://www.deeplearning.ai/the-batch/feed.xml',
  'https://openai.com/feed.xml',
  'https://www.anthropic.com/feed.xml',
  'https://deepmind.google/rss/blog.xml',
  'https://www.technologyreview.com/topic/artificial-intelligence/feed/'
];

exports.handler = async (event, context) => {
  console.log('AI Content Engine started at', new Date().toISOString());

  try {
    // Step 1: Aggregate feeds
    console.log('Step 1: Aggregating AI news feeds...');
    const stories = await aggregateFeeds(DEFAULT_FEEDS);
    console.log(`Aggregated ${stories.length} stories from ${DEFAULT_FEEDS.length} feeds`);

    // Step 2: Generate content
    console.log('Step 2: Generating content with Claude...');
    const draft = await generateContent(stories);
    console.log('Content generated successfully');

    // Step 3: Validate
    console.log('Step 3: Validating social posts...');
    const validation = validateSocialPosts(draft);
    if (validation.length > 0) {
      console.warn('Validation warnings:', validation);
    }
    draft.validation = validation;

    // Step 4: Store draft
    console.log('Step 4: Storing draft...');
    const draftId = `draft-${Date.now()}`;
    await saveDraft(draftId, draft);
    console.log(`Draft stored with ID: ${draftId}`);

    // Step 5: Send review notification
    console.log('Step 5: Sending review notification...');
    const reviewUrl = process.env.REVIEW_DASHBOARD_URL || `https://${event.headers.host}/review-dashboard.html`;
    const token = getDraftApprovalToken(draftId);
    await sendReviewNotification(draftId, reviewUrl, token);
    console.log(`Review notification sent to ${process.env.OWNER_EMAIL}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Content engine completed successfully',
        draftId,
        storiesProcessed: stories.length,
        reviewUrl: `${reviewUrl}?draftId=${draftId}&token=${token}`
      })
    };
  } catch (err) {
    console.error('Content engine error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
};
```

- [ ] **Step 2: Test the orchestration locally (optional simulation)**

Create `tests/integration/content-engine.test.js`:

```javascript
// This is a manual integration test; full E2E requires live APIs
describe('Content Engine Orchestration', () => {
  it('should run the full pipeline without errors', async () => {
    // Simulated test: calls each module in order
    // In production, use mock data for Claude/MailerLite responses

    const { aggregateFeeds } = require('../../netlify/functions/utils/feed-monitor');
    const { generateContent } = require('../../netlify/functions/utils/claude-drafting');
    const { validateSocialPosts } = require('../../netlify/functions/utils/platform-validators');

    // Mock stories
    const stories = [
      {
        title: 'Test Story',
        link: 'https://example.com',
        summary: 'Test',
        source: 'Test Source',
        publishedDate: new Date().toISOString()
      }
    ];

    const draft = await generateContent(stories);
    const validation = validateSocialPosts(draft);

    expect(draft.blog).toBeDefined();
    expect(draft.newsletter).toBeDefined();
    expect(draft.social).toBeDefined();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/content-engine.js tests/integration/content-engine.test.js
git commit -m "feat: implement main content engine orchestration and integration"
```

---

## Final Checklist

- [ ] All 7 tasks committed
- [ ] `.env.example` updated with all required variables
- [ ] Netlify function scheduled (Monday 9 AM)
- [ ] All tests passing: `npm test`
- [ ] Blog folder structure in place
- [ ] Blog listing page live at `/blog.html`
- [ ] Review dashboard accessible
- [ ] Email notifications configured
- [ ] GitHub token and MailerLite/Buffer API keys set in Netlify environment

---

## Execution Path

This plan is ready for **subagent-driven development** (task-by-task with fresh reviewer per task) or **native implementation** (all tasks in this session, one final review). See below for which to choose.
