import { getDraft, saveDraft, getDraftApprovalToken } from './utils/storage.js';
import { validateSocialPosts } from './utils/platform-validators.js';

/**
 * Review Handler: GET to fetch draft for review, POST to approve and store for publishing
 */
export const handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;

  if (method === 'GET') {
    return handleGetDraft(event);
  } else if (method === 'POST') {
    return handleApproveDraft(event);
  } else {
    return json(405, { error: 'Method not allowed' });
  }
};

/**
 * GET handler: Fetch a draft by draftId and token for review
 * Query params: draftId, token
 */
async function handleGetDraft(event) {
  const queryStringParameters = event.queryStringParameters || {};
  const draftId = queryStringParameters.draftId;
  const token = queryStringParameters.token;

  if (!draftId || !token) {
    return json(400, { error: 'Missing required query parameters: draftId, token' });
  }

  try {
    // Fetch the draft from storage
    const draft = await getDraft(draftId);

    if (!draft) {
      return json(404, { error: `Draft "${draftId}" not found` });
    }

    // Validate the draft against platform constraints
    const validationErrors = validateSocialPosts(draft);

    // Return draft with validation status
    return json(200, {
      draftId,
      draft,
      validationErrors,
      isValid: validationErrors.length === 0
    });
  } catch (error) {
    console.error(`Error fetching draft ${draftId}:`, error);
    return json(500, { error: 'Failed to fetch draft' });
  }
}

/**
 * POST handler: Approve draft and store for publishing (Task 6)
 * Body: { draftId, token, draft }
 */
async function handleApproveDraft(event) {
  let body;
  try {
    body = JSON.parse((event && event.body) || '{}');
  } catch (error) {
    return json(400, { error: 'Invalid JSON in request body' });
  }

  const { draftId, token, draft } = body;

  if (!draftId || !token || !draft) {
    return json(400, { error: 'Missing required fields: draftId, token, draft' });
  }

  try {
    // Validate the draft against platform constraints
    const validationErrors = validateSocialPosts(draft);
    if (validationErrors.length > 0) {
      return json(400, {
        error: 'Draft validation failed',
        validationErrors
      });
    }

    // Store the approved draft with approval metadata
    const approvedDraft = {
      ...draft,
      _meta: {
        approvedAt: new Date().toISOString(),
        status: 'approved',
        publishedDate: null
      }
    };

    await saveDraft(`${draftId}-approved`, approvedDraft);

    return json(200, {
      success: true,
      message: 'Draft approved and stored for publishing',
      draftId: `${draftId}-approved`,
      approvedAt: approvedDraft._meta.approvedAt
    });
  } catch (error) {
    console.error(`Error approving draft ${draftId}:`, error);
    return json(500, { error: 'Failed to approve draft' });
  }
}

/**
 * Utility: Return JSON response with proper headers
 */
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify(obj)
  };
}
