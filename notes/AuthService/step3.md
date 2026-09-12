# Step 3 — Response Envelope Helpers

---

## What You Are Doing

Every route should return the same JSON shape so a frontend can handle responses generically, success or failure. That shape already exists as `ApiResponse<T>` in `shared/types/common.types.ts`:

```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

This step adds two small helpers in `services/auth-service/src/lib/response.ts` so every route in Steps 6–9 can return a consistent envelope with one line instead of hand-building the object each time.

---

## 3.1 Create `services/auth-service/src/lib/response.ts`

```typescript
import type { Context } from 'hono';
import type { ApiResponse } from '../../../../shared/types';

// 200-range success response wrapped in the shared ApiResponse envelope
export function ok<T>(c: Context, data: T, message?: string, status: 200 | 201 = 200) {
  const body: ApiResponse<T> = { success: true, data, message };
  return c.json(body, status);
}

// Error response wrapped in the shared ApiResponse envelope
export function fail(c: Context, error: string, status: 400 | 401 | 404 | 500 = 400) {
  const body: ApiResponse<never> = { success: false, error };
  return c.json(body, status);
}
```

> The relative import `../../../../shared/types` walks up from `src/lib/` → `src/` → `auth-service/` → `services/` → the `buildtrack` project root, then back down into `shared/types`. If you move this file, recount the `../` segments.

---

## 3.2 Verify It Compiles

```bash
npm run build
```

Run from the repo root — this is also the first real check that the cross-package import path into `shared/types` resolves correctly.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `ok()` / `fail()` | Thin wrappers so every route returns the same `{ success, data/error, message }` shape |
| `import type` | Compile-time only import — no runtime code pulled in for types, keeps the Lambda bundle small |
| Generic `ok<T>` | Lets each call site pass its own payload type (`AuthTokens`, `AuthContext`, etc.) while still returning a properly-typed `ApiResponse<T>` |
| Status code params | Restricting `status` to a literal union (`200 \| 201`, `400 \| 401 \| 404 \| 500`) catches typos like `sttaus: 20` at compile time |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `Cannot find module '../../../../shared/types'` | Wrong number of `../` segments, or file created in the wrong folder | Confirm the file is at `services/auth-service/src/lib/response.ts` exactly |
| `Property 'data' does not exist on type 'ApiResponse<never>'` | Called `ok()` where `fail()` was meant, or vice versa | Use `fail()` for errors — it deliberately omits `data` |

---

## Checkpoints Before Moving to Step 4

- [ ] `services/auth-service/src/lib/response.ts` created with `ok()` and `fail()`
- [ ] Both helpers import `ApiResponse` from `shared/types`
- [ ] `npm run build` (from repo root) passes with no errors
