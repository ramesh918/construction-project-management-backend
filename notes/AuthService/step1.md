# Step 1 — Hono App Skeleton & Lambda Handler

---

## What You Are Doing

Replace the auth-service stub handler with a real [Hono](https://hono.dev) app. Hono will own routing for all four auth endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`) that later steps in this folder add one at a time. The `hono/aws-lambda` adapter converts between Hono's `Request`/`Response` objects and the API Gateway proxy event/response your Lambda actually receives.

> ⚠️ Run all commands from inside the `buildtrack` project folder unless a step says to `cd` into `services/auth-service`.

This is the foundation step — every later step in this folder adds a route onto the app created here. Do not skip it.

---

## 1.1 Confirm Existing Dependencies

`services/auth-service/package.json` already has everything needed for this step:

```json
"dependencies": {
  "hono": "^4.0.0",
  "@aws-sdk/client-cognito-identity-provider": "^3.0.0",
  "zod": "^3.0.0"
}
```

- `hono` — the router/framework, including the `hono/aws-lambda` subpath adapter (no extra install needed).
- `@aws-sdk/client-cognito-identity-provider` — used starting in Step 5 to talk to Cognito.
- `zod` — used starting in Step 4 to validate request bodies.

No new packages are required for this step.

---

## 1.2 Replace the Stub Handler

Current stub in `services/auth-service/src/index.ts`:

```typescript
export const handler = async () => ({ statusCode: 200, body: "ok" });
```

Replace the entire file with:

```typescript
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';

const app = new Hono().basePath('/auth');

// Temporary sanity-check route — removed once real routes exist (Step 6+)
app.get('/health', c => c.json({ status: 'ok' }));

export const handler = handle(app);
```

---

## 1.3 Verify It Compiles

From the repo root:

```bash
npm run build
```

> ℹ️ `services/auth-service` has no local `tsconfig.json`, so running `npm run build` *inside* the service folder does not actually type-check anything right now (it silently compiles zero files). Until that's fixed, always verify service code from the **repo root** — the root `tsconfig.json` picks up every `services/*/src/**/*.ts` file automatically.

Expected: no TypeScript errors.

---

## 1.4 Verify CDK Still Wires It Correctly

```bash
cdk synth
```

No stack changes are needed for this step — `lib/buildtrack-stack.ts` already points the `AuthFn` Lambda at `entry: 'services/auth-service/src/index.ts'` with `handler: 'handler'`, and both are unchanged. `cdk synth` should succeed exactly as it did after Step 13 of the main deployment notes.

---

## Key Concepts (For Reference)

| Concept                          | What It Means                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Hono`                         | A small, fast router/framework that works in any JS runtime, including Lambda                                                                                                                                                    |
| `.basePath('/auth')`           | Every route registered on`app` is automatically prefixed with `/auth`                                                                                                                                                        |
| Why`/auth` prefix matters      | API Gateway's`addProxy` resource forwards the **full** request path (e.g. `/auth/login`) to the Lambda — `basePath` lets your route definitions match that without repeating `/auth` everywhere                   |
| `hono/aws-lambda` `handle()` | Wraps the Hono app so it can be used directly as a Lambda handler — converts the incoming`APIGatewayProxyEvent` into a `Request` Hono understands, and converts Hono's `Response` back into the shape API Gateway expects |
| `/auth/health`                 | A throwaway route just to prove the wiring works end-to-end before adding real logic                                                                                                                                             |

---

## Common Errors & Fixes

| Error                                               | Cause                                                                               | Fix                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Cannot find module 'hono/aws-lambda'`            | `hono` version is too old (adapter added in v3+)                                  | Confirm`package.json` has `"hono": "^4.0.0"` and `node_modules` is installed |
| `handler is not a function` at deploy/invoke time | Forgot to wrap the app with`handle()`, or exported `app` instead of `handler` | Confirm the file ends with`export const handler = handle(app);`                  |
| `cdk synth` fails after this change               | Typo in`src/index.ts` breaking the TypeScript build that esbuild needs            | Run`npm run build` from the repo root first and fix any reported errors          |

---

## Checkpoints Before Moving to Step 2

- [ ] `services/auth-service/src/index.ts` rewritten as a Hono app with `basePath('/auth')`
- [ ] Temporary `GET /auth/health` route added
- [ ] `export const handler = handle(app)` present
- [ ] `npm run build` (from repo root) passes with no errors
- [ ] `cdk synth` (from repo root) still succeeds
