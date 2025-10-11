import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import api from './api';
import { createDrizzle } from './lib/drizzle';
import { createAuth } from './lib/auth';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger((str, ...rest) => {
  console.log(`[${new Date().toISOString()}] ${str}`);
}));
app.use('*', cors({
  origin: (origin) => origin, // Allow all origins in development, configure for production
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Health check
app.get('/health', async (c) => {
  try {
    // Test database connection
    const result = await c.env.DB.prepare('SELECT 1 as test').first();
    return c.json({
      status: 'ok',
      database: 'connected',
      test: result
    });
  } catch (error) {
    return c.json({
      status: 'error',
      database: error instanceof Error ? error.message : 'Unknown'
    }, 503);
  }
});

// Mount BetterAuth routes (handles /api/auth/*)
app.on(['POST', 'GET'], '/api/auth/**', async (c) => {
  const db = createDrizzle(c.env.DB);
  const auth = createAuth(db, {
    GITHUB_CLIENT_ID: c.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: c.env.GITHUB_CLIENT_SECRET,
    BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
    WEB_URL: c.env.WEB_URL,
  });

  // Forward request to BetterAuth handler
  return auth.handler(c.req.raw);
});

// Mount API routes
app.route('/api', api);

// Export for Cloudflare Workers
export default app;
