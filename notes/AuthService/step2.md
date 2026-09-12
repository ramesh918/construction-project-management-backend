# Step 2 — Shared Auth Types

---

## What You Are Doing

Add the request/response shapes for the auth endpoints to `shared/types/`, next to the existing `common.types.ts`, `project.types.ts`, etc. Putting them in `shared/` (not inside `services/auth-service/`) means any future frontend or other service can import the exact same types instead of guessing the shape of the auth API.

---

## 2.1 Create `shared/types/auth.types.ts`

```typescript
// Request body for POST /auth/login
export interface LoginInput {
  email: string;
  password: string;
}

// Tokens returned by a successful login
export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;       // seconds until accessToken/idToken expire
}

// Request body for POST /auth/refresh
export interface RefreshInput {
  refreshToken: string;
}

// Response for POST /auth/refresh — no new refreshToken is issued
export interface RefreshResult {
  accessToken: string;
  idToken: string;
  expiresIn: number;
}
```

> `AuthContext` (`userId`, `email`, `role`, `isAdmin`) and `UserRole` (`'admin' | 'user'`) already exist in `shared/types/common.types.ts` — reuse `AuthContext` as the response type for `GET /auth/me` in Step 9 instead of duplicating it here.

---

## 2.2 Add It to the Barrel Export

Edit `shared/types/index.ts`:

```typescript
export * from './common.types';
export * from './project.types';
export * from './worker.types';
export * from './materials.types';
export * from './progress.types';
export * from './auth.types';
```

---

## 2.3 Verify It Compiles

```bash
npm run build
```

Run from the repo root. Expected: no TypeScript errors, and no unused-export warnings (this repo's `tsconfig.json` has `noUnusedLocals`/`noUnusedParameters` on, but unused **exports** are fine — those only flag unused local variables/parameters).

---

## Key Concepts (For Reference)

| Concept                             | What It Means                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why types live in`shared/`        | `auth-service` isn't the only consumer — a frontend client or another Lambda calling `/auth/me` internally can import the same `LoginInput`/`AuthTokens` types instead of re-declaring them |
| `AuthTokens` vs `RefreshResult` | Login returns all three Cognito tokens; refresh only returns new access/id tokens — Cognito does not rotate the refresh token by default                                                            |
| Reusing`AuthContext`              | Avoids two slightly-different "current user" shapes existing in the codebase                                                                                                                         |

---

## Checkpoints Before Moving to Step 3

- [ ] `shared/types/auth.types.ts` created with `LoginInput`, `AuthTokens`, `RefreshInput`, `RefreshResult`
- [ ] `shared/types/index.ts` re-exports `auth.types`
- [ ] `npm run build` (from repo root) passes with no errors
