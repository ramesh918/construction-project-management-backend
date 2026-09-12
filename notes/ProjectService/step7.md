# Step 7 — Admin-Only Authorization Middleware

---

## What You Are Doing

`promts/ProjectService.md` states plainly: *"this project-service is only accessible to the admin group"*. API Gateway's `CognitoUserPoolsAuthorizer` (attached to `/projects` via `addProtectedRoute` in `lib/buildtrack-stack.ts`) already guarantees every request has a **valid** Cognito access token — it does not check group membership. This step adds the missing piece: a Hono middleware that reads the `cognito:groups` claim and rejects anything that isn't in the `admin` group with `403`.

Crucially, this does **not** need `aws-jwt-verify` the way `auth-service/src/lib/jwt.ts` does. `auth-service` verifies tokens manually only because `/auth/*` sits *outside* the Cognito authorizer (`authResource.addProxy(...)` has no `authorizer` set). `/projects` is *inside* it — API Gateway has already validated the JWT's signature/expiry before invoking the Lambda, and for a REST API with a `COGNITO_USER_POOLS` authorizer and Lambda proxy integration, it forwards the fully decoded claims on `event.requestContext.authorizer.claims`. Re-verifying the same token a second time in this Lambda would be redundant work on every request.

---

## 7.1 Create `services/projects-service/src/lib/lambda-context.ts`

A minimal typed view of the parts of the raw API Gateway proxy event this service needs — deliberately not pulling in `@types/aws-lambda` as a new dependency for one field:

```typescript
export interface AuthorizerClaims {
  sub: string;
  email?: string;
  'cognito:groups'?: string; // comma-separated when a user is in more than one group
}

export interface LambdaProxyEvent {
  requestContext: {
    authorizer?: {
      claims?: AuthorizerClaims;
    };
  };
}

export type AppBindings = { Bindings: { event: LambdaProxyEvent } };
```

`AppBindings` is the generic Hono is instantiated with in `index.ts` (Step 15) so `c.env.event` is typed instead of `any`.

---

## 7.2 Create `services/projects-service/src/lib/admin.ts`

```typescript
import type { Context, Next } from 'hono';
import type { AppBindings } from './lambda-context';
import { fail } from './response';

export async function requireAdmin(c: Context<AppBindings>, next: Next) {
  const claims = c.env.event.requestContext.authorizer?.claims;
  const groups = claims?.['cognito:groups']?.split(',') ?? [];

  if (!groups.includes('admin')) {
    return fail(c, 'Admin access required', 403);
  }

  return next();
}
```

---

## 7.3 How It Gets Wired Up (Preview of Step 15)

In `index.ts`, this middleware is registered with `app.use('*', requireAdmin)` **after** the `/health` route and **before** every real route is mounted:

```typescript
const app = new Hono<AppBindings>().basePath('/projects');

app.get('/health', c => c.json({ status: 'ok' })); // registered first — never reaches requireAdmin
app.use('*', requireAdmin); // everything registered after this line goes through it first
app.route('/', projectsRoute);
// ...
```

Registration order matters in Hono: for a given request, matching handlers run in the order they were **registered**, not in path-specificity order. `/health`'s handler is a terminal handler (it returns a response and never calls `next()`), and since it's registered before `app.use('*', requireAdmin)`, a request to `/projects/health` never reaches the middleware at all — health checks stay a plain liveness probe (still gated by the Cognito authorizer at the API Gateway layer, just not by group). Every route registered *after* the middleware line does pass through it, since `requireAdmin` calls `next()` on success.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `event.requestContext.authorizer.claims` | For a REST API (`apigateway.RestApi`, what this stack uses) with a `CognitoUserPoolsAuthorizer` and Lambda proxy integration, API Gateway decodes the validated JWT and forwards every claim as a flat string map here — no second verification needed in the Lambda |
| `'cognito:groups'` as a comma-separated **string**, not an array | Unlike the raw JWT payload (`payload['cognito:groups']` is a `string[]`, as seen in `auth-service/src/routes/me.ts`), API Gateway's `authorizer.claims` map flattens all claims to strings — a user in multiple groups shows up as `"admin,user"` |
| `c.env` in `hono/aws-lambda` | The adapter's `handle()` function passes `{ event, lambdaContext }` as Hono's `Bindings`, accessible via `c.env` in any handler/middleware — this is how the raw Lambda event reaches application code without touching `process.env` |
| Why `403`, not `401` | The caller *is* authenticated (they have a valid token, otherwise API Gateway would have rejected the request before invoking the Lambda) — they're simply not authorized for this resource. `401` is reserved for "not authenticated at all" |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| Every request gets `403`, even from an admin user | Testing via `npm run dev` (Step 1's `local.ts`) — there is no API Gateway locally, so `event.requestContext.authorizer.claims` is `undefined` | Expected — Step 16 covers a local workaround (a dev-only fake-claims middleware) for testing outside Lambda |
| `Property 'env' does not exist on type 'Context'` (TypeScript) | `requireAdmin`'s `Context` isn't parameterized with `AppBindings` | Make sure the import is `Context<AppBindings>`, and that `index.ts`'s `new Hono<AppBindings>()` uses the same type |
| Admin user still gets `403` in the deployed API | Token was issued **before** the user was added to the `admin` group | Per `notes/AuthService/step13.md` §13.6 — group membership only takes effect on the next login/token refresh |

---

## Checkpoints Before Moving to Step 8

- [ ] `services/projects-service/src/lib/lambda-context.ts` created (`AuthorizerClaims`, `LambdaProxyEvent`, `AppBindings`)
- [ ] `services/projects-service/src/lib/admin.ts` created (`requireAdmin` middleware)
- [ ] `npm run build` (from repo root) passes with no errors
