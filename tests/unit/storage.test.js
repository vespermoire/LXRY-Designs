import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveDraft, getDraft, deleteDraft, getDraftApprovalToken } from '../../netlify/functions/utils/storage.js';
import { rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DRAFTS_DIR = join(__dirname, '../../.drafts');

// Clean up test drafts after all tests
async function cleanup() {
  try {
    await rm(DRAFTS_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Test 1: Save and retrieve a draft
test('storage: save and retrieve a draft', async () => {
  const draftId = 'test-draft-1';
  const draftData = {
    blog: {
      title: 'Test Blog Post',
      content: 'This is a test blog post.',
      frontmatter: {
        author: 'Test Author',
        date: '2024-01-01'
      }
    },
    newsletter: {
      subject: 'Test Newsletter',
      body: 'This is a test newsletter.'
    },
    social: {
      linkedin: {
        text: 'Check out this test post!'
      },
      x: {
        text: 'Test tweet here'
      }
    }
  };

  // Save the draft
  await saveDraft(draftId, draftData);

  // Retrieve the draft
  const retrievedDraft = await getDraft(draftId);

  // Verify the draft was saved and retrieved correctly
  assert.deepEqual(retrievedDraft, draftData, 'Retrieved draft should match saved draft');
  assert.equal(retrievedDraft.blog.title, 'Test Blog Post', 'Blog title should match');
  assert.equal(retrievedDraft.newsletter.subject, 'Test Newsletter', 'Newsletter subject should match');

  await cleanup();
});

// Test 2: Delete a draft
test('storage: delete a draft', async () => {
  const draftId = 'test-draft-2';
  const draftData = {
    blog: {
      title: 'Draft to be deleted',
      content: 'This will be deleted.'
    }
  };

  // Save the draft
  await saveDraft(draftId, draftData);

  // Verify it was saved
  let draft = await getDraft(draftId);
  assert.ok(draft, 'Draft should exist before deletion');

  // Delete the draft
  await deleteDraft(draftId);

  // Verify it was deleted
  draft = await getDraft(draftId);
  assert.equal(draft, null, 'Draft should be null after deletion');

  await cleanup();
});

// Test 3: Return null for missing draft
test('storage: return null for missing draft', async () => {
  const draftId = 'non-existent-draft';

  // Try to retrieve a non-existent draft
  const draft = await getDraft(draftId);

  // Should return null, not throw an error
  assert.equal(draft, null, 'Should return null for missing draft');
  assert.strictEqual(draft, null, 'Should strictly equal null');

  await cleanup();
});

// Bonus test: Generate approval token
test('storage: generate approval token', async () => {
  const draftId = 'test-draft-token';

  // Generate a token
  const token = getDraftApprovalToken(draftId);

  // Verify token is a string
  assert.equal(typeof token, 'string', 'Token should be a string');

  // Verify token has expected length (SHA256 substring of 24 chars)
  assert.equal(token.length, 24, 'Token should be 24 characters');

  // Verify token is hexadecimal (valid hash characters)
  assert.match(token, /^[a-f0-9]{24}$/, 'Token should be valid hexadecimal');

  // Verify different draftIds produce different tokens
  const token2 = getDraftApprovalToken('different-draft-id');
  assert.notEqual(token, token2, 'Different draft IDs should produce different tokens');

  await cleanup();
});
