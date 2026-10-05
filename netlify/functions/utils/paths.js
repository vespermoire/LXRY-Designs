// Shared path utilities for Netlify Functions.
// Uses process.cwd() to avoid __dirname which causes bundler issues in Netlify.

import { join } from 'path';

// In Netlify Lambda, process.cwd() is /var/task, and .drafts is in the root.
// Local testing: process.cwd() is the repo root, same layout.
export const DRAFTS_DIR = join(process.cwd(), '.drafts');
