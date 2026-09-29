#!/usr/bin/env node

/**
 * Build Blog Index
 *
 * Generates public/api/posts.json index from markdown files in lxrydesigns/posts/
 * Each post must have frontmatter with: title, date, slug, description (optional), tags (optional)
 *
 * Usage: node scripts/build-blog.js
 */

import { readdir, readFile, mkdir, writeFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const postsDir = join(projectRoot, 'lxrydesigns', 'posts');
const outputDir = join(projectRoot, 'public', 'api');
const outputFile = join(outputDir, 'posts.json');

/**
 * Parses YAML frontmatter from markdown content
 * @param {string} content - Full markdown content
 * @returns {{meta: Object, body: string}}
 */
function parseFrontmatter(content) {
  const lines = content.split('\n');

  if (!lines[0]?.trim() === '---') {
    return { meta: {}, body: content };
  }

  const meta = {};
  let i = 1;
  let frontmatterEnd = -1;

  // Find closing ---
  for (; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      frontmatterEnd = i;
      break;
    }
  }

  if (frontmatterEnd === -1) {
    return { meta: {}, body: content };
  }

  // Parse YAML-like frontmatter
  const frontmatterLines = lines.slice(1, frontmatterEnd);
  for (const line of frontmatterLines) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/i);
    if (!match) continue;

    const [, key, value] = match;
    let parsed = value.trim();

    // Remove quotes
    if ((parsed.startsWith('"') && parsed.endsWith('"')) ||
        (parsed.startsWith("'") && parsed.endsWith("'"))) {
      parsed = parsed.slice(1, -1);
    }

    // Parse arrays
    if (parsed.startsWith('[') && parsed.endsWith(']')) {
      parsed = parsed
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''));
    }

    meta[key] = parsed;
  }

  const body = lines.slice(frontmatterEnd + 1).join('\n').trim();
  return { meta, body };
}

/**
 * Builds the blog index from markdown files
 * @returns {Promise<Array>}
 */
async function buildIndex() {
  const posts = [];

  try {
    // Read all files in posts directory
    const files = await readdir(postsDir);
    const markdownFiles = files.filter(f => f.endsWith('.md'));

    console.log(`[Blog Builder] Found ${markdownFiles.length} markdown files`);

    // Process each markdown file
    for (const filename of markdownFiles) {
      try {
        const filePath = join(postsDir, filename);
        const content = await readFile(filePath, 'utf-8');
        const { meta, body } = parseFrontmatter(content);

        // Validate required fields
        if (!meta.title) {
          console.warn(`[Blog Builder] Skipping ${filename}: missing title`);
          continue;
        }

        if (!meta.date) {
          console.warn(`[Blog Builder] Skipping ${filename}: missing date`);
          continue;
        }

        // Extract first paragraph as description if not provided
        const description = meta.description ||
          body.split('\n\n')[0]?.substring(0, 160)?.replace(/[#*`]/g, '') ||
          '';

        const post = {
          filename,
          title: meta.title,
          slug: meta.slug || filename.replace('.md', ''),
          date: meta.date,
          description,
          tags: meta.tags || [],
          author: meta.author || 'LXRY Designs'
        };

        posts.push(post);
        console.log(`[Blog Builder] Indexed: ${post.title} (${filename})`);
      } catch (error) {
        console.error(`[Blog Builder] Error processing ${filename}:`, error.message);
      }
    }

    return posts;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`[Blog Builder] Posts directory not found, creating empty index`);
      return [];
    }
    throw error;
  }
}

/**
 * Writes the posts index to JSON file
 * @param {Array} posts - Array of post objects
 */
async function writeIndex(posts) {
  try {
    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Sort posts by date (newest first)
    const sorted = posts.sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    // Write JSON file
    const data = {
      lastUpdated: new Date().toISOString(),
      count: sorted.length,
      posts: sorted
    };

    await writeFile(
      outputFile,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    console.log(`[Blog Builder] ✓ Generated ${outputFile} (${sorted.length} posts)`);
  } catch (error) {
    console.error('[Blog Builder] Error writing index:', error);
    throw error;
  }
}

/**
 * Main build process
 */
async function main() {
  try {
    console.log('[Blog Builder] Starting...');
    const posts = await buildIndex();
    await writeIndex(posts);
    console.log('[Blog Builder] Complete!');
    process.exit(0);
  } catch (error) {
    console.error('[Blog Builder] Fatal error:', error);
    process.exit(1);
  }
}

main();
