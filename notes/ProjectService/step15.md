# Step 15 — Final Route Wiring & Centralized Error Handling

---

## What You Are Doing

Assemble everything built in Steps 1–14 into the real `src/index.ts`, replacing the Step 1 skeleton. Mirrors `auth-service/src/index.ts`'s structure exactly: mount every route, add a `notFound` handler, add a global `onError` handler that maps `AppError` to its status code and everything else to a generic 500.

---

## 15.1 Replace `services/projects-service/src/index.ts`

```typescript
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings } from './lib/lambda-context';
import { requireAdmin } from './lib/admin';
import { projectsRoute } from './routes/projects';
import { costSummaryRoute } from './routes/cost-summary';
import { documentsRoute } from './routes/documents';
import { AppError } from './lib/errors';
import { fail } from './lib/response';

const app = new Hono<AppBindings>().basePath('/projects');

app.get('/health', c => c.json({ status: 'ok' }));

app.use('*', requireAdmin);

app.route('/', projectsRoute);
app.route('/', costSummaryRoute);
app.route('/', documentsRoute);

app.notFound(c => fail(c, 'Not found', 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return fail(c, err.message, err.status);
  }
  console.error('Unhandled projects-service error:', err);
  return fail(c, 'Internal server error', 500);
});

export const handler = handle(app);
export default app;
```

Registration order matters, as explained in Step 7.3: `/health` is registered before `app.use('*', requireAdmin)` so it stays outside the admin-group check; every route mounted after that line is protected by it.

---

## 15.2 Full Endpoint Reference (After This Step)

| Method | Path | Purpose | Step |
|---|---|---|---|
| GET | `/projects/health` | Liveness probe, no admin check | 1 |
| POST | `/projects` | Create a project | 8 |
| GET | `/projects` | List projects (`?status=`, `?limit=`, `?cursor=`) | 9 |
| GET | `/projects/:id` | Get one project | 9 |
| PATCH | `/projects/:id` | Update a project | 10 |
| GET | `/projects/:id/cost-summary` | Recomputed budget vs. actual | 11 |
| POST | `/projects/:id/documents/upload-url` | Request a presigned S3 upload URL | 12 |
| POST | `/projects/:id/documents/confirm` | Record a completed upload | 12 |
| GET | `/projects/:id/documents` | List documents with view URLs (`?category=`) | 13 |
| DELETE | `/projects/:id/documents/:key` | Delete a document | 14 |

All routes except `/health` require a valid Cognito access token (API Gateway authorizer) **and** membership in the `admin` group (`requireAdmin`).

---

## 15.3 Verify It Compiles

```bash
npm run build
```

## 15.4 Verify CDK Synth

```bash
npm run synth
```

No further stack changes are expected here beyond Step 14's `grantDelete` — this step is pure application wiring.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Three route files mounted at the same `'/'` | `projectsRoute`, `costSummaryRoute`, `documentsRoute` each define distinct, non-overlapping path patterns (`/`, `/:id`, `/:id/cost-summary`, `/:id/documents...`) — Hono composes them as if they were all declared on one router, the split across files is purely organizational |
| `app.onError` catching `AppError` | Every route that threw `new AppError(status, message)` (e.g. `requireProject()` in Step 12) gets its intended status code and message surfaced here, instead of falling through to a generic 500 |
| Unhandled errors logged with `console.error` | Goes to the Lambda's CloudWatch log group (`/aws/lambda/BuildTrack-ProjectsFn`, per `lib/buildtrack-stack.ts`'s `makeLambda` factory) — the client only ever sees the generic "Internal server error" message, never a stack trace |

---

## Checkpoints Before Moving to Step 16

- [ ] `services/projects-service/src/index.ts` fully wired: health → `requireAdmin` → all three route modules → `notFound` → `onError`
- [ ] Endpoint reference table above matches what's actually mounted
- [ ] `npm run build` and `npm run synth` both succeed
