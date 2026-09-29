/**
 * Publisher: Orchestrates publishing to blog, newsletter, and social channels
 */

/**
 * Publishes a blog post to the repository via GitHub API
 * Creates a markdown file with frontmatter at lxrydesigns/posts/{date}-{slug}.md
 *
 * @param {Object} draft - Approved draft content
 * @returns {Promise<{success: boolean, filename?: string, error?: string}>}
 */
export async function publishBlog(draft) {
  try {
    if (!draft.title || !draft.blog) {
      return {
        success: false,
        error: 'Missing required blog fields: title, blog'
      };
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || 'barkerlovett/lxry-designs';

    if (!githubToken) {
      return {
        success: false,
        error: 'GITHUB_TOKEN environment variable not configured'
      };
    }

    // Generate filename from date and slug
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const slug = (draft.slug || draft.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const filename = `${dateStr}-${slug}.md`;
    const filePath = `lxrydesigns/posts/${filename}`;

    // Build frontmatter
    const frontmatter = [
      '---',
      `title: "${draft.title.replace(/"/g, '\\"')}"`,
      `date: ${now.toISOString()}`,
      `slug: ${slug}`,
      draft.description ? `description: "${draft.description.replace(/"/g, '\\"')}"` : null,
      draft.author ? `author: ${draft.author}` : null,
      draft.tags && draft.tags.length ? `tags: [${draft.tags.map(t => `"${t}"`).join(', ')}]` : null,
      '---'
    ]
      .filter(Boolean)
      .join('\n');

    // Combine frontmatter and blog content
    const content = `${frontmatter}\n\n${draft.blog}`;

    // Get current file SHA if it exists (for update)
    let sha = null;
    try {
      const getResponse = await fetch(
        `https://api.github.com/repos/${githubRepo}/contents/${filePath}`,
        {
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );
      if (getResponse.ok) {
        const data = await getResponse.json();
        sha = data.sha;
      }
    } catch (e) {
      // File doesn't exist yet, that's fine
    }

    // Prepare commit message
    const message = `docs: publish blog post "${draft.title}"`;
    const encodedContent = Buffer.from(content).toString('base64');

    // Call GitHub API to create/update file
    const payload = {
      message,
      content: encodedContent,
      branch: 'main'
    };

    if (sha) {
      payload.sha = sha;
    }

    const response = await fetch(
      `https://api.github.com/repos/${githubRepo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('GitHub API error:', errorData);
      return {
        success: false,
        error: `Failed to commit blog post: ${errorData.message || 'Unknown error'}`
      };
    }

    return {
      success: true,
      filename
    };
  } catch (error) {
    console.error('Error publishing blog:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sends newsletter to MailerLite subscribers
 * Uses MailerLite API to send a campaign to a segment
 *
 * @param {Object} draft - Approved draft content with newsletter data
 * @returns {Promise<{success: boolean, subject?: string, error?: string}>}
 */
export async function sendNewsletter(draft) {
  try {
    if (!draft.newsletter) {
      return {
        success: false,
        error: 'Missing newsletter content in draft'
      };
    }

    const mailerliteKey = process.env.MAILERLITE_API_KEY;
    if (!mailerliteKey) {
      return {
        success: false,
        error: 'MAILERLITE_API_KEY environment variable not configured'
      };
    }

    const subject = draft.newsletter.subject || draft.title;
    const content = draft.newsletter.content || draft.newsletter.html;
    const fromName = draft.newsletter.fromName || 'LXRY Designs';
    const fromEmail = draft.newsletter.fromEmail || 'noreply@lxrydesigns.com';

    // MailerLite API: Create and send campaign
    const campaign = {
      name: `${subject} - ${new Date().toISOString()}`,
      subject,
      from: {
        name: fromName,
        email: fromEmail
      },
      content: {
        html: content || `<p>${draft.blog || 'New blog post published'}</p>`
      },
      settings: {
        track_opens: true,
        track_clicks: true
      }
    };

    const response = await fetch('https://api.mailerlite.com/api/v2/campaigns', {
      method: 'POST',
      headers: {
        'X-MailerLite-ApiDocs-Version': '1.0.0',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mailerliteKey}`
      },
      body: JSON.stringify(campaign)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('MailerLite API error:', errorData);
      return {
        success: false,
        error: `Failed to send newsletter: ${errorData.error || 'Unknown error'}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      subject
    };
  } catch (error) {
    console.error('Error sending newsletter:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Queues social posts to Buffer API
 * Creates posts for each platform (Twitter, LinkedIn, Facebook, Instagram, Pinterest, TikTok)
 *
 * @param {Object} draft - Approved draft with social platform posts
 * @returns {Promise<{results: Object, hasErrors: boolean}>}
 */
export async function queueSocial(draft) {
  try {
    const bufferToken = process.env.BUFFER_API_KEY;
    if (!bufferToken) {
      return {
        results: {
          error: 'BUFFER_API_KEY environment variable not configured'
        },
        hasErrors: true
      };
    }

    if (!draft.social || Object.keys(draft.social).length === 0) {
      return {
        results: {
          message: 'No social posts in draft'
        },
        hasErrors: false
      };
    }

    const results = {};

    // Process each platform
    for (const [platform, postData] of Object.entries(draft.social)) {
      try {
        if (!postData.text) {
          results[platform] = {
            success: false,
            error: 'Missing text for platform'
          };
          continue;
        }

        const postPayload = {
          text: postData.text,
          shorten: true,
          scheduled_at: postData.scheduledAt ? new Date(postData.scheduledAt).getTime() / 1000 : Math.floor(Date.now() / 1000) + 3600
        };

        if (postData.media && postData.media.length) {
          postPayload.media = {
            link: postData.media[0]
          };
        }

        // Buffer API v1 - queue to specific profile
        const response = await fetch('https://api.bufferapp.com/1/updates/create.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...postPayload,
            access_token: bufferToken,
            profile_ids: postData.profileIds || []
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          results[platform] = {
            success: false,
            error: errorData.error || 'Unknown error'
          };
        } else {
          const data = await response.json();
          results[platform] = {
            success: true,
            bufferId: data.buffer_id
          };
        }
      } catch (platformError) {
        console.error(`Error queueing ${platform}:`, platformError);
        results[platform] = {
          success: false,
          error: platformError.message
        };
      }
    }

    const hasErrors = Object.values(results).some(r => !r.success);
    return {
      results,
      hasErrors
    };
  } catch (error) {
    console.error('Error queuing social posts:', error);
    return {
      results: {
        error: error.message
      },
      hasErrors: true
    };
  }
}

/**
 * Main orchestrator: Publishes to all channels in sequence
 * If blog fails, skips newsletter and social
 * Notifies owner of success/failure
 *
 * @param {Object} draft - Approved draft ready for publishing
 * @returns {Promise<{success: boolean, published: Object, failures: Object}>}
 */
export async function publishAll(draft) {
  const published = {};
  const failures = {};

  try {
    if (!draft) {
      return {
        success: false,
        published: {},
        failures: {
          general: 'No draft provided'
        }
      };
    }

    console.log(`[Publisher] Starting publication for draft: ${draft.title}`);

    // 1. Blog - CRITICAL, abort if fails
    console.log('[Publisher] Publishing blog...');
    const blogResult = await publishBlog(draft);

    if (!blogResult.success) {
      failures.blog = blogResult.error;
      console.error('[Publisher] Blog publication failed, aborting other channels:', blogResult.error);

      // Notify owner of blog failure
      await notifyOwner({
        status: 'FAILED',
        subject: `Blog Publication Failed: ${draft.title}`,
        error: blogResult.error,
        draft
      });

      return {
        success: false,
        published,
        failures
      };
    }

    published.blog = {
      success: true,
      filename: blogResult.filename
    };
    console.log('[Publisher] Blog published successfully:', blogResult.filename);

    // 2. Newsletter - Non-critical
    if (draft.newsletter) {
      console.log('[Publisher] Sending newsletter...');
      const newsletterResult = await sendNewsletter(draft);
      if (newsletterResult.success) {
        published.newsletter = {
          success: true,
          subject: newsletterResult.subject
        };
        console.log('[Publisher] Newsletter sent successfully');
      } else {
        failures.newsletter = newsletterResult.error;
        console.error('[Publisher] Newsletter failed:', newsletterResult.error);
      }
    }

    // 3. Social - Non-critical
    if (draft.social) {
      console.log('[Publisher] Queuing social posts...');
      const socialResult = await queueSocial(draft);
      published.social = {
        success: !socialResult.hasErrors,
        platforms: socialResult.results
      };
      if (socialResult.hasErrors) {
        console.error('[Publisher] Some social posts failed:', socialResult.results);
      } else {
        console.log('[Publisher] All social posts queued successfully');
      }
    }

    // Notify owner of success
    await notifyOwner({
      status: 'SUCCESS',
      subject: `Published: ${draft.title}`,
      published,
      failures: Object.keys(failures).length > 0 ? failures : undefined,
      draft
    });

    return {
      success: Object.keys(failures).length === 0,
      published,
      failures: Object.keys(failures).length > 0 ? failures : {}
    };
  } catch (error) {
    console.error('[Publisher] Unexpected error during publication:', error);
    failures.general = error.message;

    await notifyOwner({
      status: 'ERROR',
      subject: `Publication Error: ${draft.title}`,
      error: error.message,
      draft
    });

    return {
      success: false,
      published,
      failures
    };
  }
}

/**
 * Notifies owner of publication success/failure
 * Uses mailer to send notification email
 *
 * @param {Object} params - Notification parameters
 * @returns {Promise<void>}
 */
async function notifyOwner(params) {
  try {
    const { status, subject, error, published, failures, draft } = params;

    // Import mailer dynamically to avoid circular dependency
    const { sendPublishConfirmation } = await import('./mailer.js');

    await sendPublishConfirmation({
      status,
      subject,
      error,
      published,
      failures,
      draft
    });
  } catch (error) {
    console.error('[Publisher] Failed to send notification email:', error);
    // Don't throw - notification failure shouldn't block publication
  }
}
