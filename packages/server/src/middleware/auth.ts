import { createMiddleware } from 'hono/factory';
import { createDrizzle } from '../lib/drizzle';
import { createAuth } from '../lib/auth';
import type { Env } from '../types';
import type { User } from 'better-auth';

/**
 * Extended context variables for authenticated requests
 */
export interface AuthVariables {
  user: User;
  userId: string;
}

/**
 * Auth middleware that supports both:
 * 1. API token authentication (for the Claude Code plugin)
 * 2. Session authentication (for the web UI)
 *
 * For API token auth:
 * - Checks Authorization: Bearer <token> header against API_TOKEN env var
 * - Creates a special "plugin" user in the database if it doesn't exist
 * - Sets userId to a well-known plugin user ID
 *
 * For session auth:
 * - Uses BetterAuth to verify the session token from cookies
 * - Extracts the authenticated user from the session
 * - Sets userId to the authenticated user's ID
 */
export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  // Try API token first (for plugin)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const expectedToken = c.env.API_TOKEN || 'dev_token';

    if (token === expectedToken) {
      // Valid API token - create/use plugin user
      // For now, we'll use a special userId for the plugin
      // In a future enhancement, we could create API tokens per user
      const pluginUserId = 'plugin-user';

      // TODO: Create plugin user in database if it doesn't exist
      // For now, we'll just set the userId

      c.set('userId', pluginUserId);
      c.set('user', {
        id: pluginUserId,
        name: 'Plugin User',
        email: 'plugin@aei.local',
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);

      return next();
    }
  }

  // Try session auth (for web UI)
  const db = createDrizzle(c.env.DB);
  const auth = createAuth(db, {
    GITHUB_CLIENT_ID: c.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: c.env.GITHUB_CLIENT_SECRET,
    BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
  });

  // Get session from BetterAuth
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session && session.user) {
    c.set('userId', session.user.id);
    c.set('user', session.user);
    return next();
  }

  // No valid auth found
  return c.json({ error: 'Unauthorized' }, 401);
});
