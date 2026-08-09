import { Hono } from 'hono';
import { handle, streamHandle } from 'hono/aws-lambda';
import { Resource } from 'sst';
import { storedKeyProvider } from './ai/for-user';
import { CognitoIdentityAdmin } from './auth/identity-admin';
import { CognitoTokenVerifier } from './auth/verifier';
import { DynamoStore } from './db/dynamo-store';
import { ValidatingStore } from './db/validating-store';
import { aiKeyRoutes } from './routes/ai-key';
import { accountRoutes } from './routes/account';
import { grocRoutes } from './routes/groc';
import { logRoutes } from './routes/log';
import { offerRoutes } from './routes/offers';
import { planRoutes } from './routes/plan';
import { profileRoutes } from './routes/profile';
import { weightRoutes } from './routes/weight';

/**
 * The API: one Hono app on one Lambda behind a Function URL.
 *
 * Push subscriptions are the one route still to come (E5.2).
 */
const app = new Hono();

/**
 * No CORS middleware here on purpose.
 *
 * The Lambda Function URL applies its own CORS (`url: { cors: true }` in
 * sst.config.ts), and adding Hono's middleware on top made every response carry
 * `Access-Control-Allow-Origin` twice. Browsers reject a duplicated value
 * outright — and because every Vire request sends an `authorization` header,
 * every request is preflighted, so *all* of them failed. curl does not mind
 * duplicate headers, which is why /health looked healthy throughout.
 *
 * The Function URL's own configuration is the one to keep: it answers the
 * preflight before the Lambda is invoked, so an OPTIONS request costs nothing.
 */

/**
 * Built once per container, not per request: the token verifier caches the pool's
 * JWKS, and re-fetching it on every call would add a network round trip to every
 * authenticated request.
 */
function buildDeps() {
  const store = new ValidatingStore(new DynamoStore(Resource.Data.name));
  const verifier = new CognitoTokenVerifier(Resource.Users.id, Resource.Web.id);
  // One resolver, reading each caller's own key (E7.6). There is no
  // deployment-wide key any more, which is why the provider secrets are gone.
  const providerFor = storedKeyProvider(store, { AI_MODEL: process.env['AI_MODEL'] });
  return { store, verifier, providerFor };
}

const deps = buildDeps();

/** Liveness only — deliberately says nothing about the database or provider. */
app.get('/health', (c) =>
  c.json({
    ok: true,
    stage: process.env['VIRE_STAGE'] ?? 'unknown',
    // The model this stage would use; the provider now comes from each user's own
    // key, so there is no deployment-wide provider to report (E7.6).
    aiModel: process.env['AI_MODEL'] ?? 'provider default',
  }),
);

app.route('/', profileRoutes(deps));
app.route('/', planRoutes(deps));
app.route('/', logRoutes(deps));
app.route('/', weightRoutes(deps));
app.route('/', grocRoutes(deps));
app.route('/', offerRoutes(deps));
app.route('/', accountRoutes({ ...deps, identity: new CognitoIdentityAdmin(Resource.Users.id) }));
app.route('/', aiKeyRoutes(deps));

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
