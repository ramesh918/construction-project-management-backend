# Step 1 — Hono App Skeleton, Lambda Handler & Local Dev Server

---

## What You Are Doing

Replace the `projects-service` stub handler with a real [Hono](https://hono.dev) app, exactly the same shape `auth-service` uses (see `notes/AuthService/step1.md`). Hono will own routing for every `/projects/*` endpoint added in later steps. Unlike `auth-service`, this service sits **behind** API Gateway's Cognito authorizer (see `lib/buildtrack-stack.ts` → `addProtectedRoute('projects', projectsFn)`), and per the brief in `promts/ProjectService.md` it must additionally be **admin-group only** — that extra authorization layer is built in Step 7, on top of the skeleton created here.

> ⚠️ Run all commands from inside the `buildtrack` project folder unless a step says to `cd` into `services/projects-service`.

This is the foundation step — every later step adds a route or lib module onto the app created here.

---

## 1.1 Confirm Existing Dependencies

`services/projects-service/package.json` already exists (created ahead of this build-out) with everything needed for the whole service:

```json
"dependencies": {
  "hono": "^4.0.0",
  "@hono/node-server": "^1.0.0",
  "@aws-sdk/client-dynamodb": "^3.0.0",
  "@aws-sdk/util-dynamodb": "^3.0.0",
  "@aws-sdk/client-s3": "^3.0.0",
  "@aws-sdk/s3-request-presigner": "^3.0.0",
  "uuid": "^9.0.0",
  "zod": "^3.0.0"
},
"devDependencies": {
  "typescript": "^5.0.0",
  "@types/node": "^20.0.0",
  "@types/uuid": "^9.0.0",
  "ts-node": "^10.0.0"
}
```

No new packages are required for this step. `@aws-sdk/client-dynamodb` + `@aws-sdk/util-dynamodb` (raw client + `marshall`/`unmarshall`) is the intended DynamoDB access style — not `DynamoDBDocumentClient` — matching how `auth-service` uses the raw `CognitoIdentityProviderClient` rather than a wrapper.

---

## 1.2 Add the `dev` Script

`package.json` is missing the local-dev script `auth-service` has. Add it:

```json
"scripts": {
  "build": "tsc --noEmit",
  "start": "ts-node src/index.ts",
  "dev": "ts-node src/local.ts"
}
```

---

## 1.3 Replace the Stub Handler

Current stub in `services/projects-service/src/index.ts`:

```typescript
export const handler = async () => ({ statusCode: 200, body: "ok" });
```

Replace the entire file with:

```typescript
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';

const app: Hono = new Hono().basePath('/projects');

// Temporary sanity-check route — replaced with the full route wiring in Step 15
app.get('/health', c => c.json({ status: 'ok' }));

export const handler = handle(app);
export default app;
```

`export default app` is added up front (auth-service only added this implicitly via its final file) because `local.ts` (next) needs to import the Hono app instance directly, separate from the Lambda `handler` export.

> ⚠️ **Deviation found during implementation:** `const app` needs the explicit `: Hono` type annotation. With two services (`auth-service`, `projects-service`) each having their own separately-installed `node_modules/hono`, and `declaration: true` set in the root `tsconfig.json`, `tsc` cannot portably name the type it infers for `export default app` across two physically different `hono` installs — it fails with `TS2742: The inferred type of 'app' cannot be named without a reference to '.../auth-service/node_modules/hono/...'`. The explicit annotation sidesteps this. This same pattern (annotate the return/variable type explicitly wherever something exported is inferred from a Hono type) recurs in Steps 3, 6, 7, 8, and 15 — noted again there.

---

## 1.4 Create `src/local.ts`

For running the service outside Lambda during development (`npm run dev`). Unlike `auth-service`'s `local.ts`, this one needs one extra piece: Step 7's `requireAdmin` middleware reads `event.requestContext.authorizer.claims`, which only exists because API Gateway's Cognito authorizer decodes the JWT and forwards its claims — something that doesn't happen at all under `@hono/node-server`. Without help, every request would 500 (see 1.4's "Common Errors" note below) or, if `requireAdmin` guarded every field with `?.`, silently 403 no matter what token you send.

The fix: decode the incoming `Authorization: Bearer <token>` JWT **locally, without verifying its signature** (safe here — this code path never runs in Lambda, only in local dev), and reconstruct the same claims shape API Gateway would have produced. This lets you test locally with a real Cognito access token (or even a hand-built fake one — see Step 16) and have `requireAdmin` behave identically to production.

```typescript
import { serve } from '@hono/node-server';
import app from './index';
import type { LambdaProxyEvent } from './lib/lambda-context';

const port = Number(process.env.PORT ?? 4001);

// DEV ONLY — there's no API Gateway locally to decode the Cognito access token and
// forward its claims via event.requestContext.authorizer.claims (what requireAdmin
// reads in Lambda). This decodes the JWT payload straight from the Authorization
// header — no signature verification, since this code path never runs in Lambda —
// purely so `requireAdmin` sees the same shape locally that it would in production.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payloadSegment = token.split('.')[1];
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function buildFakeEvent(req: Request): LambdaProxyEvent {
  const header = req.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const payload = token ? decodeJwtPayload(token) : null;

  if (!payload) {
    return { requestContext: {} };
  }

  const groups = payload['cognito:groups'];
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: (payload.sub as string) ?? '',
          email: payload.email as string | undefined,
          'cognito:groups': Array.isArray(groups) ? groups.join(',') : (groups as string | undefined),
        },
      },
    },
  };
}

serve(
  {
    fetch: (req: Request) => app.fetch(req, { event: buildFakeEvent(req) }),
    port,
  },
  info => {
    console.log(`projects-service listening on http://localhost:${info.port}`);
  },
);
```

Port `4001` (not `4000`) so it can run side-by-side with `auth-service`'s local server.

Note this is genuinely different from `auth-service`'s `local.ts` (`serve({ fetch: app.fetch, port }, ...)`) — that service has no group-based authorization to simulate, so it never needed a per-request `env`. Passing `env` as `app.fetch`'s second argument is exactly what `hono/aws-lambda`'s `handle()` does under the hood in Lambda (it calls `app.fetch(request, { event, lambdaContext })`); this reproduces the same contract for local testing.

> ℹ️ **Still needed:** `requireAdmin` reading `dynamoConfig.tableName()`/`s3Config.bucketName()` further down the request path expects `TABLE_NAME`/`BUCKET_NAME` env vars, which Lambda gets from `sharedEnv` in `lib/buildtrack-stack.ts` but a plain `npm run dev` does not. Step 16 covers setting these to point local dev at the real deployed table/bucket.

---

## 1.5 Verify It Compiles

From the repo root:

```bash
npm run build
```

> ℹ️ Same caveat as `auth-service`: `services/projects-service` has no local `tsconfig.json`, so always verify from the **repo root** — the root `tsconfig.json` picks up every `services/*/src/**/*.ts` file automatically.

Expected: no TypeScript errors.

---

## 1.6 Verify CDK Still Wires It Correctly

```bash
npm run synth
```

No stack changes are needed for this step — `lib/buildtrack-stack.ts` already points the `ProjectsFn` Lambda at `entry: 'services/projects-service/src/index.ts'` with `handler: 'handler'`, and both already have `grantReadWriteData` (table) and `grantPut`/`grantRead` (bucket). `cdk synth` should succeed unchanged.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `.basePath('/projects')` | Every route registered on `app` is automatically prefixed with `/projects`, matching the full path API Gateway's `addProxy` resource forwards |
| `export default app` | Needed so `local.ts` can drive the same Hono app with `@hono/node-server`, independent of the Lambda `handler` export |
| Raw DynamoDB client + `marshall`/`unmarshall` | Chosen (via `package.json`) over `DynamoDBDocumentClient` — items are built/read as plain JS objects, converted to/from DynamoDB's `AttributeValue` wire format explicitly at the SDK call site |
| Cognito authorizer vs. admin-group check | API Gateway's `CognitoUserPoolsAuthorizer` (stack-level) only proves the caller has a *valid* token — it does not restrict by group. The admin-only restriction from `promts/ProjectService.md` is enforced in **application code** (Step 7), not infrastructure |
| `app.fetch(req, { event })` in `local.ts` | Exactly what `hono/aws-lambda`'s `handle()` does internally in Lambda — passing a fake `event` as the second argument reproduces the same `c.env` contract locally, so `requireAdmin` (Step 7) doesn't need any Lambda-vs-local branching in its own code |
| No JWT signature verification in `local.ts` | Deliberate and safe — this file never runs in Lambda/production (it's not part of the bundle `NodejsFunction` builds from `src/index.ts`), so it's pure local developer tooling, not a security boundary |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `Cannot find module 'hono/aws-lambda'` | `hono` version too old | Confirm `package.json` has `"hono": "^4.0.0"` and `node_modules` is installed (`cd services/projects-service && npm install`) |
| `cdk synth` fails after this change | Typo breaking the TypeScript build esbuild needs | Run `npm run build` from the repo root first and fix any reported errors |
| `npm run dev` — `Cannot find module '@hono/node-server'` | Not installed | `cd services/projects-service && npm install` |
| `TS2742: The inferred type of 'app' cannot be named ...` | Two services' separately-installed `hono` copies compiled together, plus `declaration: true` at the root — see the ⚠️ note under 1.3 | Add the explicit `: Hono` type annotation shown in 1.3 |
| Every route locally responds `{"error":"Admin access required"}` even with a real admin token | `local.ts` wasn't updated with the `buildFakeEvent()` shim in 1.4, so `c.env.event` is still `undefined` | Confirm `local.ts` matches 1.4 exactly, including passing `{ event: buildFakeEvent(req) }` as `app.fetch`'s second argument |
| Every route locally responds `{"error":"Internal server error"}` even with the shim in place and an admin token | `TABLE_NAME`/`BUCKET_NAME` env vars aren't set for `npm run dev` (Lambda gets them from CDK; local dev doesn't) | Covered in Step 16 — run `TABLE_NAME=buildtrack BUCKET_NAME=buildtrack-files-<account-id> npm run dev` |

---

## Checkpoints Before Moving to Step 2

- [ ] `services/projects-service/package.json` has a `"dev": "ts-node src/local.ts"` script
- [ ] `services/projects-service/src/index.ts` rewritten as a Hono app with `basePath('/projects')`, temporary `GET /health`, `export const handler = handle(app)`, `export default app` (`const app: Hono = ...` — explicit annotation, per the ⚠️ note in 1.3)
- [ ] `services/projects-service/src/local.ts` created with the `buildFakeEvent()`/`decodeJwtPayload()` shim, passing `{ event }` into `app.fetch`
- [ ] `npm run build` (from repo root) passes with no errors
- [ ] `cdk synth` (from repo root) still succeeds
