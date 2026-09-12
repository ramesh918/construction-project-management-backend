# Step 10 — Centralized Error Handling

---

## What You Are Doing

So far, every route repeats the same `try/catch` pattern and re-`throw`s unexpected errors. This step adds one `app.onError` handler so any error thrown by any route (a bug, an unexpected Cognito exception, a JSON parse failure) is caught in exactly one place and turned into a consistent `ApiResponse` envelope instead of leaking a raw stack trace or a Lambda 502.

---

## 10.1 Add a Small Typed Error

Create `services/auth-service/src/lib/errors.ts`:

```typescript
export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 404 | 500,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

Routes can now `throw new AppError(401, '...')` instead of `return fail(c, '...', 401)` if they'd rather bail out from a nested helper function — either style still ends up handled consistently.

---

## 10.2 Add the Global Handler

Edit `services/auth-service/src/index.ts`:

```typescript
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { loginRoute } from './routes/login';
import { refreshRoute } from './routes/refresh';
import { logoutRoute } from './routes/logout';
import { meRoute } from './routes/me';
import { AppError } from './lib/errors';
import { fail } from './lib/response';

const app = new Hono().basePath('/auth');

app.get('/health', c => c.json({ status: 'ok' }));
app.route('/login', loginRoute);
app.route('/refresh', refreshRoute);
app.route('/logout', logoutRoute);
app.route('/me', meRoute);

app.notFound(c => fail(c, 'Not found', 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return fail(c, err.message, err.status);
  }
  console.error('Unhandled auth-service error:', err);
  return fail(c, 'Internal server error', 500);
});

export const handler = handle(app);
```

`app.onError` catches anything a route handler `throw`s — including the `throw err;` fallthroughs left in `login.ts`, `refresh.ts`, and `logout.ts` in Steps 6–8 for Cognito exceptions that weren't explicitly handled (e.g. `TooManyRequestsException`, `InternalErrorException`).

---

## 10.3 Verify It Compiles

```bash
npm run build
```

Run from the repo root.

---

## 10.4 Sanity-Check the Behavior

Temporarily make `login.ts` throw an unrelated error (e.g. `throw new Error('test')` at the top of the handler) and confirm, using the local testing approach from Step 11, that the response is a clean `500` with `{ success: false, error: 'Internal server error' }` — not a raw stack trace. Then remove the test line.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `app.onError` | A single Hono hook that intercepts any thrown error from any route on this app, so error-formatting logic isn't duplicated in every route file |
| `app.notFound` | Handles requests to paths that don't match any route (e.g. `GET /auth/typo`) with the same envelope shape as everything else |
| `AppError` | An optional typed error for routes/helpers that want to bail out with a specific status code from deep inside a call stack, without threading a Hono `Context` through every function |
| `console.error` for unhandled errors | CloudWatch Logs captures this — essential for debugging a `500` in production since the client only ever sees "Internal server error" |

---

## Checkpoints Before Moving to Step 11

- [ ] `services/auth-service/src/lib/errors.ts` created with `AppError`
- [ ] `app.notFound` and `app.onError` added to `src/index.ts`
- [ ] Unexpected errors return `500` with a generic message, never a raw stack trace
- [ ] `npm run build` (from repo root) passes with no errors
