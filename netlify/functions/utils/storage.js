import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { DRAFTS_DIR } from './paths.js';

/**
 * Ensures the drafts directory exists
 * @returns {Promise<void>}
 */
async function ensureDraftsDir() {
  try {
    await mkdir(DRAFTS_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists or other error
    if (error.code !== 'EEXIST') {
      console.error('Failed to create drafts directory:', error);
      throw error;
    }
  }
}

/**
 * Saves a draft to JSON file
 * @param {string} draftId - Unique identifier for the draft
 * @param {Object} draft - Draft content object
 * @returns {Promise<void>}
 */
export async function saveDraft(draftId, draft) {
  await ensureDraftsDir();

  const draftPath = join(DRAFTS_DIR, `${draftId}.json`);
  const draftContent = JSON.stringify(draft, null, 2);

  await writeFile(draftPath, draftContent, 'utf8');
}

/**
 * Retrieves a draft by ID
 * @param {string} draftId - Unique identifier for the draft
 * @returns {Promise<Object|null>} Draft object or null if not found
 */
export async function getDraft(draftId) {
  const draftPath = join(DRAFTS_DIR, `${draftId}.json`);

  try {
    const draftContent = await readFile(draftPath, 'utf8');
    return JSON.parse(draftContent);
  } catch (error) {
    // File not found or parse error - return null instead of throwing
    if (error.code === 'ENOENT') {
      return null;
    }
    // For other errors (e.g., JSON parse errors), log and return null
    console.error(`Error reading draft ${draftId}:`, error);
    return null;
  }
}

/**
 * Deletes a draft by ID
 * @param {string} draftId - Unique identifier for the draft
 * @returns {Promise<void>}
 */
export async function deleteDraft(draftId) {
  const draftPath = join(DRAFTS_DIR, `${draftId}.json`);

  try {
    await unlink(draftPath);
  } catch (error) {
    // File doesn't exist - that's okay for delete
    if (error.code !== 'ENOENT') {
      console.error(`Error deleting draft ${draftId}:`, error);
      throw error;
    }
  }
}

/**
 * Generates a secure approval token for a draft
 * Token is based on draft ID and a timestamp hash
 * @param {string} draftId - Unique identifier for the draft
 * @returns {string} Secure token for draft approval
 */
export function getDraftApprovalToken(draftId) {
  // Create a hash combining draftId with current timestamp (for uniqueness)
  const tokenSource = `${draftId}-${Date.now()}`;
  const hash = createHash('sha256')
    .update(tokenSource)
    .digest('hex');

  // Return first 24 characters of the hash
  return hash.substring(0, 24);
}
