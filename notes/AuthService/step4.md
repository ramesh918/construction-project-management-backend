# Step 4 — Request Validation Schemas (Zod)

---

## What You Are Doing

Define `zod` schemas for the two request bodies the auth API accepts (`login`, `refresh`). Routes in Step 6 and Step 7 will parse incoming JSON through these schemas before calling Cognito, so malformed requests are rejected with a clear `400` instead of failing deep inside the Cognito SDK call.

---

## 4.1 Create `services/auth-service/src/schemas/auth.schema.ts`

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginBody = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshBody = z.infer<typeof refreshSchema>;
```

> `min(8)` mirrors the password policy already set on the Cognito user pool in `lib/buildtrack-stack.ts` (`minLength: 8`) — it doesn't replace Cognito's own validation, it just fails fast before making a network call for an obviously-too-short password.

---

## 4.2 Verify It Compiles

```bash
npm run build
```

Run from the repo root.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `z.object({...})` | Defines the exact shape a request body must match |
| `z.infer<typeof schema>` | Derives a TypeScript type from the schema so you don't write the shape twice |
| Why validate in the route, not just trust the type | TypeScript types disappear at runtime — the actual JSON body from a client is unchecked `unknown` until something (zod) verifies it at request time |
| `.safeParse()` (used in Step 6/7) | Returns `{ success, data }` or `{ success: false, error }` instead of throwing — lets the route return a clean `400` via `fail()` from Step 3 |

---

## Checkpoints Before Moving to Step 5

- [ ] `services/auth-service/src/schemas/auth.schema.ts` created with `loginSchema` and `refreshSchema`
- [ ] `LoginBody` and `RefreshBody` types exported via `z.infer`
- [ ] `npm run build` (from repo root) passes with no errors
