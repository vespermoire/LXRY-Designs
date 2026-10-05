// Shared path utilities for Netlify Functions.
// Centralized to avoid duplicate __dirname declarations that break the bundler.

import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
export const DRAFTS_DIR = join(__dirname, '../../.drafts');
