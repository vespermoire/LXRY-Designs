import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Generates blog, newsletter, and social media content from aggregated news stories
 * using the Claude API.
 *
 * @param {Array} stories - Array of story objects with title, link, summary, source, publishedDate
 * @returns {Promise<Object>} Draft object containing blog, newsletter, and social sections
 */
export async function generateContent(stories) {
  if (!stories || stories.length === 0) {
    throw new Error('No stories provided for content generation');
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  // Format stories for the prompt
  const formattedStories = stories
    .slice(0, 10) // Use up to 10 most recent stories
    .map((story, index) => {
      return `Story ${index + 1}:
Title: ${story.title}
Source: ${story.source}
Summary: ${story.summary}
Link: ${story.link}`;
    })
    .join('\n\n');

  const systemPrompt = `You are an expert AI content strategist specializing in evergreen technology and business insights.
Your task is to create original, thought-provoking content that synthesizes news stories into actionable insights.
Focus on original analysis and commentary, not news rewrites.
Always cite sources and provide unique perspectives.`;

  const userPrompt = `Based on the following aggregated news stories, generate comprehensive content for three channels:

STORIES TO SYNTHESIZE:
${formattedStories}

REQUIRED OUTPUT FORMAT (must be valid JSON):
{
  "blog": {
    "title": "A compelling, SEO-friendly blog title",
    "content": "800-1200 word markdown article with original commentary, insights, and analysis",
    "frontmatter": {
      "slug": "url-friendly-slug-derived-from-title",
      "seo_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
      "date": "YYYY-MM-DD"
    }
  },
  "newsletter": {
    "subject": "Compelling email subject line (50-70 chars)",
    "body": "<div style='font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333;'><h2>Headline</h2><p>Original insights and analysis (200-300 words) formatted as clean HTML with paragraphs.</p><p>Include 2-3 key takeaways.</p></div>"
  },
  "social": {
    "linkedin": {
      "caption": "Professional insights (200-300 chars) with call-to-action",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
      "dimensions": "1200x627"
    },
    "x": {
      "caption": "Punchy insight limited to 280 characters exactly",
      "hashtags": ["tag1", "tag2", "tag3"],
      "length": 280
    },
    "instagram": {
      "caption": "Engaging visual description with story hook (300-400 chars)",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8", "hashtag9", "hashtag10"],
      "dimensions": "1080x1350"
    },
    "tiktok": {
      "caption": "Viral hook + insight (100-150 chars)",
      "hashtags": ["trend", "insight", "tech", "news"],
      "dimensions": "1080x1920",
      "duration": "30-45 seconds"
    },
    "facebook": {
      "caption": "Shareable insight with discussion prompt (150-200 chars)",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
      "dimensions": "1200x627"
    },
    "youtube": {
      "caption": "Video description with context and CTAs (150-250 chars)",
      "hashtags": ["topic1", "topic2", "analysis"],
      "dimensions": "1080x1920",
      "duration": "60-90 seconds"
    }
  }
}

PLATFORM SPECIFICATIONS:
- LinkedIn: 5-10 hashtags, 1200x627 dimensions, professional tone
- X: 280 character limit, 3-5 hashtags, concise messaging
- Instagram: 15-25 hashtags, 1080x1350 or 1080x1920 dimensions, visual storytelling
- TikTok: 5-10 hashtags, 1080x1920 dimensions, 15-60 second video duration
- Facebook: 3-5 hashtags, 1200x627 dimensions, community engagement
- YouTube Shorts: 5-10 hashtags, 1080x1920 dimensions, 15-60 second video duration

CRITICAL REQUIREMENTS:
1. All content must be original analysis and commentary, NOT news rewrites
2. Each platform caption must be unique and optimized for that platform's audience
3. Blog content must be substantive, well-structured markdown with headers, bullet points, and citations
4. Newsletter HTML must be clean, readable, and mobile-friendly
5. All hashtags must be relevant and platform-appropriate
6. Dates must be in YYYY-MM-DD format (use today's date)
7. Return ONLY valid JSON, no markdown code blocks or extra text
`;

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: systemPrompt
    });

    // Extract the text response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse the JSON response
    let draft;
    try {
      // Try to parse the response directly
      draft = JSON.parse(responseText);
    } catch (parseError) {
      // If direct parsing fails, try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        draft = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse Claude API response as JSON');
      }
    }

    // Validate the draft structure
    validateDraftStructure(draft);

    return draft;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

/**
 * Validates that the draft object has the required structure
 * @param {Object} draft - The draft object to validate
 * @throws {Error} If draft structure is invalid
 */
function validateDraftStructure(draft) {
  // Check top-level sections
  if (!draft.blog) {
    throw new Error('Draft missing "blog" section');
  }
  if (!draft.newsletter) {
    throw new Error('Draft missing "newsletter" section');
  }
  if (!draft.social) {
    throw new Error('Draft missing "social" section');
  }

  // Validate blog section
  if (!draft.blog.title || typeof draft.blog.title !== 'string') {
    throw new Error('Blog must have a valid title');
  }
  if (!draft.blog.content || typeof draft.blog.content !== 'string') {
    throw new Error('Blog must have content');
  }
  if (!draft.blog.frontmatter) {
    throw new Error('Blog must have frontmatter');
  }
  if (!draft.blog.frontmatter.slug || typeof draft.blog.frontmatter.slug !== 'string') {
    throw new Error('Blog frontmatter must have a slug');
  }
  if (!Array.isArray(draft.blog.frontmatter.seo_keywords)) {
    throw new Error('Blog frontmatter must have seo_keywords array');
  }

  // Validate newsletter section
  if (!draft.newsletter.subject || typeof draft.newsletter.subject !== 'string') {
    throw new Error('Newsletter must have a subject');
  }
  if (!draft.newsletter.body || typeof draft.newsletter.body !== 'string') {
    throw new Error('Newsletter must have HTML body');
  }

  // Validate social section has all 6 platforms
  const requiredPlatforms = ['linkedin', 'x', 'instagram', 'tiktok', 'facebook', 'youtube'];
  for (const platform of requiredPlatforms) {
    if (!draft.social[platform]) {
      throw new Error(`Social section missing "${platform}" platform`);
    }

    const post = draft.social[platform];
    if (!post.caption || typeof post.caption !== 'string') {
      throw new Error(`${platform} must have a caption`);
    }
    if (!Array.isArray(post.hashtags)) {
      throw new Error(`${platform} must have a hashtags array`);
    }
    if (!post.dimensions || typeof post.dimensions !== 'string') {
      throw new Error(`${platform} must have dimensions`);
    }
  }

  // Validate platform-specific requirements
  if (draft.social.x.length !== 280) {
    throw new Error('X post length must be exactly 280');
  }

  return true;
}
