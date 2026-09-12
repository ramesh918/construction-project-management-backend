# Step 9 — GET /auth/me (JWT Verification)

---

## What You Are Doing

Add `GET /auth/me`, which returns the calling user's identity (`AuthContext`: `userId`, `email`, `role`, `isAdmin`) by verifying the JWT sent in the `Authorization` header — no database lookup needed, the claims live in the token itself.

> ⚠️ This is different from every other protected route in the system. `/projects`, `/workers`, `/materials`, `/progress`, and `/dashboard` all sit behind API Gateway's `CognitoUserPoolsAuthorizer`, which validates the JWT **before** the request ever reaches the Lambda. The `/auth` resource deliberately has **no** authorizer (`/auth/login` has to be reachable without a token) — so `/auth/me` must verify the token itself, inside the Lambda.

---

## 9.1 Install the JWT Verification Library

```bash
cd services/auth-service
npm install aws-jwt-verify
cd ../..
```

`aws-jwt-verify` is an AWS-maintained library purpose-built for verifying Cognito-issued JWTs (signature, expiry, issuer, `token_use`) against your user pool's public keys, with local caching of the keys.

---

## 9.2 Create `services/auth-service/src/lib/jwt.ts`

```typescript
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { cognitoConfig } from './cognito';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

// Lazily created so cognitoConfig's env var check only runs when /auth/me is actually called
export function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: cognitoConfig.userPoolId(),
      tokenUse: 'access',
      clientId: cognitoConfig.clientId(),
    });
  }
  return verifier;
}
```

---

## 9.3 Create `services/auth-service/src/routes/me.ts`

```typescript
import { Hono } from 'hono';
import { getVerifier } from '../lib/jwt';
import { ok, fail } from '../lib/response';
import type { AuthContext } from '../../../../shared/types';

export const meRoute = new Hono();

meRoute.get('/', async c => {
  const header = c.req.header('Authorization');
  const accessToken = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!accessToken) {
    return fail(c, 'Authorization: Bearer <accessToken> header is required', 401);
  }

  try {
    const payload = await getVerifier().verify(accessToken);
    const groups = (payload['cognito:groups'] as string[] | undefined) ?? [];
    const isAdmin = groups.includes('admin');

    const authContext: AuthContext = {
      userId: payload.sub,
      email: (payload.username as string) ?? (payload.email as string) ?? '',
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
    };

    return ok(c, authContext);
  } catch {
    return fail(c, 'Invalid or expired token', 401);
  }
});
```

---

## 9.4 Wire the Route Into the App

Edit `services/auth-service/src/index.ts`:

```typescript
import { meRoute } from './routes/me';
// ...
app.route('/me', meRoute);
```

---

## 9.5 Verify It Compiles

```bash
npm run build
```

Run from the repo root.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `tokenUse: 'access'` | Tells the verifier to only accept Cognito **access** tokens here (not ID tokens) — access tokens carry `cognito:groups`, which this route needs to derive `role`/`isAdmin` |
| `CognitoJwtVerifier.create(...)` | Fetches and caches the user pool's public signing keys (JWKS) on first use, then verifies signature + expiry + issuer + audience locally, with no network call per request after the first |
| `payload['cognito:groups']` | The Cognito group membership (`admin`/`user`, set up in the stack via `AdminGroup`/`UserGroup`) embedded directly in the token |
| **Important limitation** | JWT verification only checks the token's signature and expiry — it does **not** check whether the token was revoked via `/auth/logout` (Step 8). A still-unexpired access token will keep passing `/auth/me` until it naturally expires (up to 1 hour), even after logout. Closing this gap would require calling Cognito's `GetUser` API per request (defeats the purpose of stateless verification) or maintaining a revocation list — both out of scope here |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `Token use is not accepted` | Client sent the `idToken` instead of the `accessToken` | `/auth/me` specifically requires the access token — same one used for `/auth/logout` |
| `Cannot find module 'aws-jwt-verify'` | Skipped Step 9.1 | `cd services/auth-service && npm install aws-jwt-verify` |
| `JwtExpiredError` | Access token older than 1 hour | Call `/auth/refresh` (Step 7) to get a new one |

---

## Checkpoints Before Moving to Step 10

- [ ] `aws-jwt-verify` installed in `services/auth-service`
- [ ] `services/auth-service/src/lib/jwt.ts` created
- [ ] `services/auth-service/src/routes/me.ts` created
- [ ] Route mounted in `src/index.ts` via `app.route('/me', meRoute)`
- [ ] `npm run build` (from repo root) passes with no errors
