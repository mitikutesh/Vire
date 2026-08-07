import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle, streamHandle } from 'hono/aws-lambda';

/**
 * The API: one Hono app on one Lambda behind a Function URL.
 *
 * Routes arrive with their stories — the profile target route in E1.2, plan
 * generation in E2.1, the offer scan in E4.3, export and deletion in E5.3. This
 * file exists now so the infrastructure in sst.config.ts has something real to
 * point at and the deploy path can be exercised end to end.
 */
const app = new Hono();

app.use('*', cors());

/** Liveness only — deliberately says nothing about the database or provider. */
app.get('/health', (c) =>
  c.json({
    ok: true,
    stage: process.env['VIRE_STAGE'] ?? 'unknown',
    // Useful when checking which provider a deployed stage is actually using
    // (PLAN §3a: provider and model are configuration, not code).
    aiProvider: process.env['AI_PROVIDER'] ?? 'unset',
  }),
);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  // Log server-side, return nothing internal: error text can carry table names,
  // key shapes, or provider responses.
  console.error('Unhandled API error', err);
  return c.json({ error: 'internal_error' }, 500);
});

export { app };

/**
 * Streaming handler, because plan generation pushes per-day progress as it goes
 * (PLAN §3). `streamHandle` covers non-streaming responses too, so there is no
 * need for a second entry point.
 */
export const handler = process.env['VIRE_STREAMING'] === 'off' ? handle(app) : streamHandle(app);
