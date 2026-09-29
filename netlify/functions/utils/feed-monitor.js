import Parser from 'rss-parser';

const parser = new Parser();

// Default AI news feeds to monitor
export const DEFAULT_FEEDS = [
  'https://feeds.bloomberg.com/markets/news.rss',
  'https://feeds.techcrunch.com/TechCrunch',
  'https://www.theverge.com/rss/index.xml',
  'https://feeds.arstechnica.com/arstechnica/index',
  'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  'https://feeds.reuters.com/reuters/businessNews',
  'https://feeds.wired.com/feed/rss'
];

/**
 * Aggregates stories from multiple RSS feeds
 * @param {string[]} feedUrls - Array of RSS feed URLs to fetch
 * @returns {Promise<Array>} Array of deduplicated, sorted stories
 *   Story = { title, link, summary, source, publishedDate }
 */
export async function aggregateFeeds(feedUrls) {
  // Fetch all feeds in parallel using Promise.allSettled()
  const results = await Promise.allSettled(
    feedUrls.map(url => parser.parseURL(url))
  );

  // Collect all stories from successful feeds
  const allStories = [];
  const seenLinks = new Set();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feedUrl = feedUrls[i];

    if (result.status === 'fulfilled') {
      const feed = result.value;
      const source = feed.title || feedUrl;

      // Extract stories from this feed
      if (feed.items && Array.isArray(feed.items)) {
        for (const item of feed.items) {
          // Skip if we've already seen this link
          if (item.link && seenLinks.has(item.link)) {
            continue;
          }

          // Create story object with required fields
          const story = {
            title: item.title || '',
            link: item.link || '',
            summary: item.contentSnippet || item.summary || '',
            source: source,
            publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(0)
          };

          // Only add if link is present (required for deduplication)
          if (story.link) {
            allStories.push(story);
            seenLinks.add(story.link);
          }
        }
      }
    } else {
      // Log error but continue processing other feeds
      console.error(`Failed to fetch feed ${feedUrl}:`, result.reason);
    }
  }

  // Sort by publishedDate descending (newest first)
  allStories.sort((a, b) => b.publishedDate - a.publishedDate);

  // Return top 15 stories
  return allStories.slice(0, 15);
}
