# Operations Dashboard for AI Content Engine — Design Spec

> **Scope:** Task 8 of AI Content Engine project. Password-protected admin dashboard for monitoring, reviewing, and publishing weekly content (blog + newsletter + 6 social platforms).

## Goal

Provide a real-time, brand-consistent operations dashboard where the LXRY Designs owner can:
- View current draft status (8 items: blog, newsletter, 6 social platforms)
- Approve/reject individual items or publish all at once
- See complete history of past publishes (success/failure)
- Copy error messages for debugging support

## Architecture

**Route:** `/admin` on www.lxrydesigns.com  
**Auth:** Password form → session token (localStorage)  
**Data sources:**
- Current draft: `netlify/.drafts/<draft-id>.json` (existing)
- Publish history: `netlify/.drafts/publish-log.json` (new)
- Next scheduled run: Monday 9 AM UTC (hardcoded)

**Data flow:**
1. Page loads → checks session token
2. If logged in: fetch current draft + history log
3. Auto-refresh every 5 seconds
4. Approve/reject → POST to `/admin-action` endpoint → triggers publishing
5. Update history log with result

**No database needed.** All state lives in JSON files and Netlify Functions.

## Dashboard Design

**Brand:** Dark HUD theme (LXRY brand pack)
- Background: `--dark-bg` (#0D0D0D)
- Panels: `--panel` (#0F1514)
- Accents: `--turq` (#27F4D2)
- Typography: Inter (body), Jura (headings), JetBrains Mono (code/data)

### Header
- LXRY logo + "Operations Dashboard" title
- Next scheduled run badge: "Next run: Monday 9 AM UTC"
- Logout button (top-right)

### Section A: Current Draft
**Status card:** Shows state
- "Draft pending review" → orange
- "Published ✓" → green
- "Failed ✗" → red

**8 Content Items (each with 3 parts to review):**

#### Blog Post
- **Image:** (none — markdown content only)
- **Title + Content:** Preview of generated blog post
- **Metadata:** Date, slug, SEO keywords
- **Actions:** Approve | Reject | Edit

#### Newsletter
- **Image:** (none — HTML email only)
- **Subject:** Email subject line (editable)
- **Body:** HTML preview (editable)
- **Actions:** Approve | Reject | Edit

#### Social Posts (6 channels: Instagram, TikTok, LinkedIn, X, Facebook, YouTube)
**For EACH social platform, display all 3 components:**

```
┌──────────────────────────────────────┐
│ INSTAGRAM                       [✓]  │
├──────────────────────────────────────┤
│ IMAGE TILE PREVIEW                   │
│ [Branded template with visual]       │
│ (Added in Task 9)                    │
├──────────────────────────────────────┤
│ Caption (editable):                  │
│ [Text field - caption text]          │
├──────────────────────────────────────┤
│ Hashtags (editable):                 │
│ #tag1 #tag2 #tag3 #tag4 ...         │
│ Count: 18/25 ✓ (within range)       │
│ Validation: ✓ Pass                   │
├──────────────────────────────────────┤
│ [Approve] [Reject] [Edit]            │
└──────────────────────────────────────┘
```

**Per-platform specifications:**

| Platform | Image Size | Caption Length | Hashtag Range | Validation |
|----------|-----------|-----------------|---------------|------------|
| **Instagram** | 1080×1920 | — | 15-25 | ✓ if 15-25 tags |
| **TikTok** | 1080×1920 | — | 5-10 | ✓ if 5-10 tags |
| **LinkedIn** | 1200×627 | — | 5-10 | ✓ if 5-10 tags |
| **X** | Text-only | ≤280 chars | 3-5 | ✓ if ≤280 chars & 3-5 tags |
| **Facebook** | 1200×627 | — | 3-5 | ✓ if 3-5 tags |
| **YouTube** | 1080×1920 | — | 5-10 | ✓ if 5-10 tags |

**Editable inline:** User can modify caption + hashtags for each channel before approving.

**Per-item status:** ✓ Approved | ⊘ Pending | ✗ Rejected (shown next to each social channel)

**Validation display:** If any component fails (e.g., Instagram has 30 hashtags instead of 15-25), show red error badge on that item with specific issue. User must fix before approving.

**Action buttons (below all 8 items):**
- "Approve & Publish All" (publishes all approved items)
- "Reset" (clear all approvals)

**Total approval flow:**
- 1 Blog item (title + content)
- 1 Newsletter item (subject + body)
- 6 Social items (image + caption + hashtags each)
- **= 8 items to review and approve individually**

### Section B: History (Publish Log)
**Table of past publishes (newest first):**

| Date | Status | Items | Details |
|------|--------|-------|---------|
| 2026-09-22 | ✓ Success | Blog, Newsletter, 6 social | Posted to all channels |
| 2026-09-15 | ✗ Failed | Blog, Newsletter | Claude API error: [copy-paste message] |
| 2026-09-08 | ✓ Success | Blog, Newsletter, 4 social | X & TikTok failed (network timeout) |

**Expandable rows:** Click row to see:
- Exact error message (if failed) — copy-paste friendly
- Which items succeeded vs. failed
- Timestamps (publish start, end)

## Authentication & Security

**Password form (shown on first visit):**
- Single password input (no username)
- "Stay logged in" checkbox
- Submit button

**Session management:**
- On success: store token in `localStorage` with 7-day TTL
- On logout: clear token
- Auto-logout if token expired (redirect to login)

**Password:** Stored in `.env` (ADMIN_PASSWORD)

**Important:** This is internal-only dashboard. Password protects against casual discovery, not production-grade security. If later needs enterprise auth, upgrade to Netlify Identity or similar.

## Publishing Flow

When user clicks "Approve & Publish All":

1. Dashboard sends approved items to `/admin-action` endpoint
2. Endpoint calls `publishAll()` from Task 6:
   - Publish blog (git commit)
   - Send newsletter (MailerLite)
   - Queue all approved social items (Buffer) for Tue 7pm, Thu 7pm, Sat 7pm
3. Log result to `publish-log.json` with timestamp + status
4. Dashboard receives response: "Published ✓ 8 items" or error
5. History section updates automatically

**Scheduling (hardcoded):**
- Item 1 → Tuesday 7 PM UTC
- Item 2 → Thursday 7 PM UTC
- Item 3+ → Saturday 7 PM UTC
- Cycle repeats if more than 3 items

## Error Handling

**Draft generation fails (Monday 9 AM):**
- Content Engine Netlify Function sends error email to owner
- Dashboard shows "Draft failed" + error message in history
- Owner copies error → pastes to developer for support

**Publishing fails:**
- Log partial success (e.g., "Blog ✓, Newsletter ✓, Social ✗")
- Show which items failed with specific error
- Owner can re-approve and retry

**No silent failures.** Every step logs success/failure.

## Global Constraints

- **Node 20+** (Netlify default)
- **Browser support:** Modern browsers (Chrome, Firefox, Safari, Edge)
- **Brand consistency:** Use LXRY brand pack colors, fonts, logo
- **Performance:** Page must load and refresh in <2 seconds
- **Accessibility:** WCAG AA compliant (semantic HTML, color contrast, keyboard nav)
- **No external dependencies beyond existing stack** (no new npm packages)

## Success Criteria

✅ Dashboard loads at `/admin` with password protection  
✅ Current draft displays all 8 items with validation status  
✅ User can approve/reject individual items or all at once  
✅ Approve & Publish sends data to `/admin-action` endpoint  
✅ History shows past publishes with status + error messages (copy-paste friendly)  
✅ Page auto-refreshes every 5 seconds  
✅ Uses LXRY brand pack (dark theme, turquoise accents)  
✅ Session token persists across page reloads (7-day TTL)  
✅ Logout clears session  

## Future Tasks (Out of Scope)

**Task 9: Template + Image Overlay System**
- Create 6 branded templates (Instagram, TikTok, LinkedIn, Facebook, YouTube, X)
- Overlay generated captions + hashtags onto templates
- Generate final image for each social post
- Integrate into publishing pipeline

**Task 10: Stories + Next-Day Repost**
- Post to Instagram Stories + TikTok Stories the day after feed post
- Reuse same image template
- Schedule automatically (requires Buffer Stories API support or manual posts)

---

**Review Gate:** Please review this spec and let me know if anything needs to change before we move to the implementation plan.
