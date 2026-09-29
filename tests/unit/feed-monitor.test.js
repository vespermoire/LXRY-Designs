import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateFeeds } from '../../netlify/functions/utils/feed-monitor.js';

// Mock RSS parser to avoid network calls in tests
import Parser from 'rss-parser';

// Test 1: Aggregate stories from multiple RSS feeds
test('aggregateFeeds: aggregate stories from multiple RSS feeds', async () => {
  // Create mock feeds
  const mockFeeds = [
    {
      title: 'Feed A',
      items: [
        {
          title: 'Story 1',
          link: 'http://example.com/1',
          contentSnippet: 'Summary 1',
          pubDate: '2024-01-02T10:00:00Z'
        },
        {
          title: 'Story 2',
          link: 'http://example.com/2',
          contentSnippet: 'Summary 2',
          pubDate: '2024-01-03T10:00:00Z'
        }
      ]
    },
    {
      title: 'Feed B',
      items: [
        {
          title: 'Story 3',
          link: 'http://example.com/3',
          contentSnippet: 'Summary 3',
          pubDate: '2024-01-04T10:00:00Z'
        }
      ]
    }
  ];

  // Mock the parser's parseURL method
  let parseCallCount = 0;
  Parser.prototype.parseURL = async function() {
    return mockFeeds[parseCallCount++];
  };

  const stories = await aggregateFeeds(['http://feed1.com', 'http://feed2.com']);

  assert.equal(stories.length, 3, 'Should return 3 stories');
  assert.ok(stories[0].title, 'Each story should have title');
  assert.ok(stories[0].link, 'Each story should have link');
  assert.ok(stories[0].summary, 'Each story should have summary');
  assert.ok(stories[0].source, 'Each story should have source');
  assert.ok(stories[0].publishedDate, 'Each story should have publishedDate');
});

// Test 2: Deduplicate stories by link
test('aggregateFeeds: deduplicate stories by link', async () => {
  const mockFeeds = [
    {
      title: 'Feed A',
      items: [
        {
          title: 'Story 1',
          link: 'http://example.com/duplicate',
          contentSnippet: 'Summary 1',
          pubDate: '2024-01-01T10:00:00Z'
        }
      ]
    },
    {
      title: 'Feed B',
      items: [
        {
          title: 'Story 1 (Duplicate)',
          link: 'http://example.com/duplicate',
          contentSnippet: 'Summary 1 (from Feed B)',
          pubDate: '2024-01-02T10:00:00Z'
        },
        {
          title: 'Story 2',
          link: 'http://example.com/2',
          contentSnippet: 'Summary 2',
          pubDate: '2024-01-03T10:00:00Z'
        }
      ]
    }
  ];

  let parseCallCount = 0;
  Parser.prototype.parseURL = async function() {
    return mockFeeds[parseCallCount++];
  };

  const stories = await aggregateFeeds(['http://feed1.com', 'http://feed2.com']);

  // Should only have 2 unique links
  assert.equal(stories.length, 2, 'Should deduplicate stories by link');

  // Verify no duplicate links
  const links = stories.map(s => s.link);
  const uniqueLinks = new Set(links);
  assert.equal(uniqueLinks.size, links.length, 'All links should be unique');
});

// Test 3: Sort by date (newest first)
test('aggregateFeeds: sort by date (newest first)', async () => {
  const mockFeeds = [
    {
      title: 'Feed A',
      items: [
        {
          title: 'Story 1 (Old)',
          link: 'http://example.com/1',
          contentSnippet: 'Summary 1',
          pubDate: '2024-01-01T10:00:00Z'
        },
        {
          title: 'Story 2 (Medium)',
          link: 'http://example.com/2',
          contentSnippet: 'Summary 2',
          pubDate: '2024-01-03T10:00:00Z'
        },
        {
          title: 'Story 3 (Newest)',
          link: 'http://example.com/3',
          contentSnippet: 'Summary 3',
          pubDate: '2024-01-05T10:00:00Z'
        }
      ]
    }
  ];

  Parser.prototype.parseURL = async function() {
    return mockFeeds[0];
  };

  const stories = await aggregateFeeds(['http://feed1.com']);

  // Verify sorted by date descending (newest first)
  for (let i = 1; i < stories.length; i++) {
    assert.ok(
      stories[i - 1].publishedDate >= stories[i].publishedDate,
      `Story ${i - 1} date should be >= Story ${i} date`
    );
  }

  // Verify the order is correct
  assert.equal(stories[0].title, 'Story 3 (Newest)', 'Newest story should be first');
  assert.equal(stories[1].title, 'Story 2 (Medium)', 'Medium story should be second');
  assert.equal(stories[2].title, 'Story 1 (Old)', 'Oldest story should be last');
});

// Test 4: Gracefully handle a failed feed
test('aggregateFeeds: gracefully handle a failed feed', async () => {
  const mockFeeds = [
    {
      title: 'Feed A',
      items: [
        {
          title: 'Story 1',
          link: 'http://example.com/1',
          contentSnippet: 'Summary 1',
          pubDate: '2024-01-01T10:00:00Z'
        }
      ]
    },
    null // Will trigger failed feed
  ];

  let parseCallCount = 0;
  Parser.prototype.parseURL = async function(url) {
    const feed = mockFeeds[parseCallCount++];
    if (feed === null) {
      throw new Error('Failed to fetch feed');
    }
    return feed;
  };

  // Should not throw, should return stories from successful feed
  const stories = await aggregateFeeds(['http://feed1.com', 'http://feed2.com']);

  assert.ok(Array.isArray(stories), 'Should return an array even when a feed fails');
  assert.equal(stories.length, 1, 'Should return stories from the successful feed');
  assert.equal(stories[0].title, 'Story 1', 'Should have the story from the successful feed');
});
