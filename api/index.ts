import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle, streamHandle } from 'hono/aws-lambda';
import { Resource } from 'sst';
import { generationProvider, lazyProvider, offerProvider } from './ai/provider';
import { CognitoIdentityAdmin } from './auth/identity-admin';
import { CognitoTokenVerifier } from './auth/verifier';
import { DynamoStore } from './db/dynamo-store';
import { ValidatingStore } from './db/validating-store';
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

app.use('*', cors());

/**
 * Built once per container, not per request: the token verifier caches the pool's
 * JWKS, and re-fetching it on every call would add a network round trip to every
 * authenticated request.
 */
/**
 * The offer provider is separate from the generation provider: the scan needs live
 * web search, which not every adapter has (PLAN §3a). Lazy for the same reason as
 * the other one — a misconfiguration should fail the scan, not the container.
 */
const offerProviderLazy = lazyProvider(() =>
  offerProvider({
    AI_PROVIDER: process.env['AI_PROVIDER'],
    AI_PROVIDER_OFFERS: process.env['AI_PROVIDER_OFFERS'],
    AI_MODEL: process.env['AI_MODEL'],
    ANTHROPIC_API_KEY: Resource.AnthropicApiKey.value,
    OPENAI_API_KEY: Resource.OpenaiApiKey.value,
  }),
);

function buildDeps() {
  const store = new ValidatingStore(new DynamoStore(Resource.Data.name));
  const verifier = new CognitoTokenVerifier(Resource.Users.id, Resource.Web.id);
  // The keys are read inside the factory, not here, so they are only touched by
  // the routes that need them (see lazyProvider).
  const provider = lazyProvider(() =>
    generationProvider({
      AI_PROVIDER: process.env['AI_PROVIDER'],
      AI_MODEL: process.env['AI_MODEL'],
      ANTHROPIC_API_KEY: Resource.AnthropicApiKey.value,
      OPENAI_API_KEY: Resource.OpenaiApiKey.value,
    }),
  );
  return { store, verifier, provider };
}

const deps = buildDeps();

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

app.route('/', profileRoutes(deps));
app.route('/', planRoutes(deps));
app.route('/', logRoutes(deps));
app.route('/', weightRoutes(deps));
app.route('/', grocRoutes(deps));
app.route('/', offerRoutes({ ...deps, provider: offerProviderLazy }));
app.route('/', accountRoutes({ ...deps, identity: new CognitoIdentityAdmin(Resource.Users.id) }));

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
