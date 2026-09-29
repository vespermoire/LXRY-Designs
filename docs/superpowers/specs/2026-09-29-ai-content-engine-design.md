# AI Content Engine Design
**Date:** 2026-09-29  
**Owner:** LXRY Designs  
**Status:** Approved for Implementation  

---

## Overview

A **weekly AI news-to-content pipeline** that automatically monitors AI news feeds, drafts evergreen blog posts (SEO-targeted), newsletters, and social media captions from that news, and surfaces drafts for human review before publishing.

**Success Criteria:**
- One blog post + newsletter + social content per week, 100% sourced from monitored feeds
- Blog posts rank for AI-related search terms and drive organic traffic to the site
- Newsletter goes to existing subscriber base (MailerLite)
- Social posts atomize blog/newsletter content across platforms (LinkedIn, X, Instagram, TikTok)
- Review + approval workflow fits into ~30 min/week for the business owner
- System runs hands-off on a schedule (no manual trigger needed)

---

## Architecture

### System Components

1. **Feed Monitor** (Netlify Function)
   - Polls 6–8 AI news RSS feeds on a weekly schedule (Monday 9 AM)
   - Aggregates summaries + links for the week's top AI stories
   - Calls Claude API with the week's stories

2. **Content Drafting** (Claude API)
   - Receives aggregated news + detailed prompt
   - Generates:
     - One **evergreen blog post** (800–1,200 words, SEO-optimized, original commentary)
     - One **newsletter email** (200–300 words, curated highlights, link to blog)
     - **6 social media posts** (one per platform: LinkedIn, X, Instagram, TikTok, Facebook, YouTube)
     - Each social post includes: caption, hashtags, platform-specific dimensions/format specs
   - All content emphasizes original angle, not rewrites

3. **Review Dashboard** (Static HTML + approval logic)
   - Displays blog preview, newsletter preview, social captions
   - Allows inline editing (you can tweak wording, brand voice, fix errors before approval)
   - "Approve & Publish" button triggers atomic publishing

4. **Publishing Pipeline**
   - **Blog:** Commits markdown to `/posts/` in repo → Netlify rebuild
   - **Newsletter:** Sends via MailerLite API
   - **Social:** Queues to Buffer API for scheduling

---

## Content Flow (Weekly Cycle)

**Monday 9 AM:**
1. Netlify Function runs (scheduled)
2. Polls RSS feeds → aggregates week's top 10–15 AI stories
3. Calls Claude API → generates blog + newsletter + social drafts
4. Stores drafts (JSON file in repo or Supabase)
5. Sends notification email to owner with review link

**Monday 9 AM – Tuesday 9 AM (review window - 24 hours):**
1. Owner receives notification email with review link
2. Reads blog, newsletter, social previews (6 platforms with captions, hashtags, dimensions)
3. Can edit inline or approve as-is
4. Clicks "Approve & Publish" (target: within 24 hours of notification)

**Immediately after approval:**
1. Blog post markdown commits to repo with timestamp
2. Netlify rebuilds site + publishes blog
3. Newsletter sends to MailerLite subscribers
4. Social posts queue in Buffer (ready to schedule)

---

## Feed Sources

**Automatic RSS Feeds (monitored by the app):**
- The Rundown AI
- Ben's Bites
- The Batch (DeepLearning.AI)
- OpenAI News RSS
- Anthropic News RSS
- Google DeepMind Blog RSS
- MIT Technology Review AI RSS

**Manual Curation (optional, mid-week):**
- Owner can add 2–3 stories via the review dashboard if important news is missed
- Curator's notes add context to the prompt for that week's drafting

**Feed Deduplication:** The app deduplicates across feeds to avoid redundant stories.

---

## Content Strategy

### Blog Posts
- **Angle:** Evergreen advice/how-to, inspired by the week's news
- **Target:** Business owners, marketing teams, operations managers (LXRY's buyer personas)
- **Format:** Markdown with frontmatter (title, date, description, SEO keywords)
- **Length:** 800–1,200 words
- **Tone:** Professional, practical, with original commentary (not news rewrites)
- **Examples:**
  - "How GPT-5 Changes Customer Service Automation: A Practical Guide"
  - "AI for Small Business Operations: What's Worth Your Money This Week"

### Newsletter
- **Angle:** Curated news roundup + link to blog post
- **Format:** Short HTML email (MailerLite template)
- **Length:** 200–300 words
- **Tone:** Conversational, informative
- **CTA:** Link to the week's blog post

### Social Media (6 Platforms)
All posts include captions, hashtags, and platform-specific formatting:

| Platform | Format | Dimensions | Captions | Hashtags |
|---|---|---|---|---|
| **LinkedIn** | Text + link | 1200×627 (if image) | Professional, link to blog | 5–10 industry/AI tags |
| **X** | Text + link | 1200×675 (if image) | Punchy, news-focused | 3–5 hashtags |
| **Instagram** | Carousel/Reel + caption | 1080×1350 (feed) or 1080×1920 (Reel) | Engaging hook, CTA | 15–25 hashtags |
| **TikTok** | Short-form video + caption | 1080×1920, 15–60 sec | Trendy, informal | 5–10 hashtags |
| **Facebook** | Link post + caption | 1200×627 | Community-friendly | 3–5 hashtags |
| **YouTube** | Short (vertical) + caption | 1080×1920, 15–60 sec | Story-driven | 5–10 hashtags |

- All captions are platform-optimized (tone, length, CTA)
- Hashtags are researched + relevant to AI/business topics
- Links point to the week's blog post
- Posting schedule (timing across platforms) to be confirmed by owner

---

## Tech Stack

### Backend
- **Netlify Functions** (Node.js)
- **Claude API** (for drafting)
- **MailerLite API** (for newsletter sending)
- **Buffer API** (for social scheduling)
- **GitHub API** (for blog post commits)

### Storage
- **JSON file in repo** OR **Supabase** (for draft storage and review state)
- **Git commits** (for published blog posts)

### Frontend
- **Static HTML page** (review dashboard, generated by the Function)
- **Email notification** (link to review dashboard)

### Hosting
- All serverless (Netlify Functions) — no server to maintain

---

## Detailed Flows

### Feed Monitoring & Drafting

```
Monday 9 AM (Scheduled trigger)
  ↓
Poll RSS feeds (6–8 sources)
  ↓
Aggregate top 10–15 stories
  ↓
Format as context for Claude prompt
  ↓
Call Claude API (single call)
  ├─ Generate blog post (markdown)
  ├─ Generate newsletter (HTML snippet)
  └─ Generate social captions (JSON: LinkedIn, X, Instagram, TikTok)
  ↓
Save drafts to storage (JSON or Supabase)
  ↓
Generate review dashboard URL
  ↓
Send email notification (with review link + approval token)
```

### Review & Publishing

```
Owner clicks review link
  ↓
Dashboard displays:
  ├─ Blog post preview (rendered markdown)
  ├─ Newsletter preview (as inbox email)
  └─ Social captions (one card per platform)
  ↓
Owner reads + optionally edits
  ↓
Clicks "Approve & Publish"
  ↓
Atomic publish:
  ├─ Blog: Commit markdown to `/posts/` → Git push
  ├─ Newsletter: Send via MailerLite API
  └─ Social: Queue posts to Buffer
  ↓
Confirmation email to owner
```

---

## Data Models

### Blog Post (Markdown with Frontmatter)
```
---
title: "How GPT-5 Changes Customer Service Automation"
date: 2026-09-29
slug: gpt5-customer-service-automation
description: "Practical guide to using GPT-5 for customer service automation in 2026"
tags: ["AI", "Customer Service", "Automation"]
seo_keywords: ["customer service automation", "GPT-5", "AI tools"]
---

## Blog post content...
```

### Newsletter (HTML)
```html
<h2>AI News Roundup: Week of Sept 29</h2>
<p>Highlights from this week's AI developments...</p>
<ul>
  <li>Story 1 + take</li>
  <li>Story 2 + take</li>
  <li>Story 3 + take</li>
</ul>
<p><a href="[blog-url]">Read the full analysis →</a></p>
```

### Social Captions (JSON)
```json
{
  "linkedin": {
    "caption": "Professional take, link to blog",
    "hashtags": ["#AI", "#Automation", "#BusinessTech"],
    "format": "text + link",
    "dimensions": "1200x627"
  },
  "x": {
    "caption": "Punchy, news-focused",
    "hashtags": ["#AI", "#News"],
    "format": "text + link",
    "length": "280 chars"
  },
  "instagram": {
    "caption": "Engaging hook + CTA",
    "hashtags": ["#AI", "#ArtificialIntelligence", ...],
    "format": "carousel/reel",
    "dimensions": "1080x1350 (feed) or 1080x1920 (reel)"
  },
  "tiktok": {
    "caption": "Trendy, informal",
    "hashtags": ["#AI", "#TechNews"],
    "format": "short video",
    "dimensions": "1080x1920",
    "duration": "15-60 sec"
  },
  "facebook": {
    "caption": "Community-friendly",
    "hashtags": ["#AI", "#Business"],
    "format": "link post",
    "dimensions": "1200x627"
  },
  "youtube": {
    "caption": "Story-driven",
    "hashtags": ["#AI", "#Shorts"],
    "format": "short (vertical)",
    "dimensions": "1080x1920",
    "duration": "15-60 sec"
  }
}
```

---

## Error Handling & Fallbacks

| Failure | Handling |
|---|---|
| RSS feed down | App logs error, continues with other feeds, notifies owner if >2 feeds fail |
| Claude API error | Retry up to 3× with backoff; if still fails, notify owner (manual draft option) |
| MailerLite send fails | Queue in Buffer for manual retry; notify owner |
| Buffer API error | Queue for manual posting; notify owner |
| Git commit fails | Notify owner; draft saved, ready for manual commit |

All errors go to owner via email with recovery instructions.

---

## Blog Integration

### Site Structure
```
lxrydesigns/
  ├── index.html (main site)
  ├── posts/ (NEW)
  │   ├── 2026-09-29-gpt5-customer-service-automation.md
  │   ├── 2026-09-22-ai-tools-small-business.md
  │   └── ...
  ├── assets/
  └── ...
```

### Rendering
- **Option A (SSG):** Use a static site generator (11ty, Hugo, or custom Node script) to compile markdown posts into HTML on build
- **Option B (Hand HTML):** Generate full HTML from markdown during publish (simpler, included in Netlify Function)

Recommendation: **Option B** for speed (the Function generates the HTML during approval flow).

### Blog Page
- New page `/blog/` or `/insights/` listing all posts (chronological, newest first)
- Each post has metadata (date, description, tags)
- Posts are indexed by search engines (SEO benefit)

---

## Success Metrics (First Month)

- [ ] System runs weekly without manual intervention
- [ ] 4 blog posts published (1 per week)
- [ ] 4 newsletters sent to subscriber base
- [ ] 24 social posts queued/published (6 per week × 4 platforms, properly formatted)
- [ ] All social posts include captions, hashtags, and platform-specific dimensions
- [ ] Review time stays ≤30 min/week (Monday review, approval within 24 hours)
- [ ] Blog page live on site with working internal links
- [ ] No critical errors in first 4 weeks (retry logic handles gracefully)
- [ ] Social posting schedule established and coordinated across platforms

---

## Future Enhancements (Out of Scope)

- Video captions for short-form content (TikTok, YouTube Shorts)
- Automatic image generation for social posts (via DALL-E or Midjourney)
- Analytics dashboard (track blog traffic, newsletter open rates)
- Multi-language support (blog + newsletter in FR)
- Scheduled posting (currently all-or-nothing; could add per-platform delays)

---

## Assumptions & Constraints

- Owner has MailerLite API key + Buffer API access
- Owner's GitHub repo is connected to Netlify (for auto-rebuild on commit)
- Claude API quota is sufficient (~1 call/week = negligible cost)
- Review + approval happens within 1 hour of notification (default window)
- Blog can co-exist on the static site (no major structural changes needed)

---

## Open Questions Resolved

✅ Cadence: 1 blog + 1 newsletter per week, 6 social posts per week (1 per platform)  
✅ Effort: ~30 min/week (review + approve within 24 hours of Monday notification)  
✅ Content strategy: Evergreen blog (SEO), news-driven newsletter, social atomized from both  
✅ Automation level: Fully automated monitoring + drafting, human review gate before publish  
✅ Tech stack: Netlify Functions + Claude API + MailerLite + Buffer  
✅ Blog location: New `/posts/` folder, auto-rendered to `/blog/` page  
✅ Social platforms: 6 platforms (LinkedIn, X, Instagram, TikTok, Facebook, YouTube)  
✅ Social formats: Each post includes captions, hashtags, platform-specific dimensions/specs  
⏳ Social posting schedule: To be confirmed (timing/staggering across platforms)

---

## Implementation Phases

1. **Phase 1:** Core pipeline (RSS monitor → Claude draft → review dashboard)
2. **Phase 2:** Blog rendering + publishing to site
3. **Phase 3:** Newsletter + Buffer integration
4. **Phase 4:** Analytics + monitoring dashboard (future)
