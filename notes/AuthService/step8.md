# Step 8 — POST /auth/logout

---

## What You Are Doing

Add `POST /auth/logout`, which calls Cognito's `GlobalSignOut` to revoke **all** of a user's refresh tokens (every device/session), using the access token sent in the `Authorization` header.

---

## 8.1 Create `services/auth-service/src/routes/logout.ts`

```typescript
import { Hono } from 'hono';
import { GlobalSignOutCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../lib/cognito';
import { ok, fail } from '../lib/response';

export const logoutRoute = new Hono();

logoutRoute.post('/', async c => {
  const header = c.req.header('Authorization');
  const accessToken = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!accessToken) {
    return fail(c, 'Authorization: Bearer <accessToken> header is required', 401);
  }

  try {
    await cognitoClient.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    return ok(c, null, 'Logged out');
  } catch (err: any) {
    if (err.name === 'NotAuthorizedException') {
      // Access token already expired/invalid — treat as already logged out
      return ok(c, null, 'Logged out');
    }
    throw err; // handled by the global error handler added in Step 10
  }
});
```

> `GlobalSignOut` requires only an access token (not the refresh token) — this matches the `cognito-idp:GlobalSignOut` permission already granted to `authFn` in the stack, confirmed back in Step 6.

---

## 8.2 Wire the Route Into the App

Edit `services/auth-service/src/index.ts`:

```typescript
import { logoutRoute } from './routes/logout';
// ...
app.route('/logout', logoutRoute);
```

---

## 8.3 Verify It Compiles

```bash
npm run build
```

Run from the repo root.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `GlobalSignOut` | Revokes every refresh token issued to the user — signs them out of all devices/sessions, not just the current one |
| Why treat `NotAuthorizedException` as success here | If the access token is already expired or invalid, the end state the caller wants (being logged out) is already true — returning an error would be misleading |
| Revocation vs. expiry | `GlobalSignOut` revokes **refresh tokens** immediately; it does **not** invalidate already-issued access/ID tokens before their natural expiry — see the caveat in Step 9 |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `401 Authorization: Bearer <accessToken> header is required` | Client sent the token without the `Bearer ` prefix, or sent the `idToken`/`refreshToken` instead of the `accessToken` | `GlobalSignOut` specifically needs the **access** token from the `AuthTokens`/`RefreshResult` response |

---

## Checkpoints Before Moving to Step 9

- [ ] `services/auth-service/src/routes/logout.ts` created
- [ ] Route mounted in `src/index.ts` via `app.route('/logout', logoutRoute)`
- [ ] Missing/malformed `Authorization` header returns `401`, not a crash
- [ ] `npm run build` (from repo root) passes with no errors
