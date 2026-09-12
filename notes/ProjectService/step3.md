# Step 3 — Response Envelope & Error Helpers

---

## What You Are Doing

Copy `auth-service`'s `lib/response.ts` and `lib/errors.ts` verbatim into `projects-service`. Every route across every service wraps its output in the shared `ApiResponse<T>` envelope (`shared/types/common.types.ts`) — there's no reason to design a new response shape for this service. `AppError` gives routes a way to throw a typed, status-coded error that the centralized handler (Step 15) turns into a proper `fail()` response, instead of every route hand-rolling try/catch for expected failure cases.

---

## 3.1 Create `services/projects-service/src/lib/response.ts`

```typescript
import type { Context } from 'hono';
import type { ApiResponse } from '../../../../shared/types';

// 200-range success response wrapped in the shared ApiResponse envelope
export function ok<T>(c: Context, data: T, message?: string, status: 200 | 201 = 200) {
  const body: ApiResponse<T> = { success: true, data, message };
  return c.json(body, status);
}

// Error response wrapped in the shared ApiResponse envelope
export function fail(c: Context, error: string, status: 400 | 401 | 403 | 404 | 500 = 400) {
  const body: ApiResponse<never> = { success: false, error };
  return c.json(body, status);
}
```

This is identical to `auth-service/src/lib/response.ts` except `fail()`'s status union adds `403` (used by the admin-only check in Step 7 — `auth-service` never needed a 403 since it has no group-based authorization of its own).

---

## 3.2 Create `services/projects-service/src/lib/errors.ts`

```typescript
export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 500,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

Same `403` addition as above.

---

## 3.3 Verify It Compiles

```bash
npm run build
```

Nothing imports these two files yet — this step should compile cleanly with zero behavior change.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Shared `ApiResponse<T>` envelope | Every service (auth, projects, workers, materials, progress, dashboard) returns `{ success, data?, error?, message? }` — a client only ever needs one response-parsing code path across the whole API |
| Why `403` is added here vs. auth-service | `auth-service` has no authenticated group check (its own JWT verification in `/auth/me` reports role, but never rejects a request based on it) — `projects-service` is the first service enforcing admin-only access, and `403 Forbidden` (authenticated but not permitted) is the correct status, distinct from `401 Unauthorized` (not authenticated at all) |
| `AppError` vs. throwing `Error` | Routes that want a specific status code (e.g. "project not found" → 404) throw `new AppError(404, 'Project not found')`; anything else (unexpected exceptions) falls through to a generic 500 in the centralized `onError` handler (Step 15) |

---

## Checkpoints Before Moving to Step 4

- [ ] `services/projects-service/src/lib/response.ts` created with `ok()`/`fail()` (403 included in the status union)
- [ ] `services/projects-service/src/lib/errors.ts` created with `AppError` (403 included)
- [ ] `npm run build` (from repo root) passes with no errors
