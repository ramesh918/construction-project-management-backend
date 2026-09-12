# Step 7 — POST /auth/refresh

---

## What You Are Doing

Add `POST /auth/refresh` so a client whose access token has expired (they live for 1 hour — see `accessTokenValidity` in the stack) can get a new one without asking the user to log in again, as long as their refresh token (valid 30 days) is still good.

---

## 7.1 Create `services/auth-service/src/routes/refresh.ts`

```typescript
import { Hono } from 'hono';
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient, cognitoConfig } from '../lib/cognito';
import { refreshSchema } from '../schemas/auth.schema';
import { ok, fail } from '../lib/response';
import type { RefreshResult } from '../../../../shared/types';

export const refreshRoute = new Hono();

refreshRoute.post('/', async c => {
  const parsed = refreshSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'refreshToken is required', 400);
  }

  try {
    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: cognitoConfig.clientId(),
      AuthParameters: {
        REFRESH_TOKEN: parsed.data.refreshToken,
      },
    }));

    const auth = result.AuthenticationResult;
    if (!auth?.AccessToken || !auth.IdToken) {
      return fail(c, 'Cognito did not return tokens', 500);
    }

    const tokens: RefreshResult = {
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      expiresIn: auth.ExpiresIn ?? 3600,
    };

    return ok(c, tokens, 'Token refreshed');
  } catch (err: any) {
    if (err.name === 'NotAuthorizedException') {
      return fail(c, 'Refresh token is invalid or expired — please log in again', 401);
    }
    throw err; // handled by the global error handler added in Step 10
  }
});
```

> Note: `REFRESH_TOKEN_AUTH` uses the same `InitiateAuth` API action as login — no additional IAM permission is needed beyond what Step 6 already confirmed.

---

## 7.2 Wire the Route Into the App

Edit `services/auth-service/src/index.ts`:

```typescript
import { refreshRoute } from './routes/refresh';
// ...
app.route('/refresh', refreshRoute);
```

---

## 7.3 Verify It Compiles

```bash
npm run build
```

Run from the repo root.

---

## Key Concepts (For Reference)

| Concept                                          | What It Means                                                                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REFRESH_TOKEN_AUTH`                           | Auth flow that trades a still-valid refresh token for a new access + ID token, without re-sending a password                                                   |
| Why no new`refreshToken` comes back            | By default Cognito does not rotate refresh tokens on refresh — the client keeps using the one it got at login until it expires (30 days) or the user logs out |
| `accessTokenValidity: 1 hour` (from the stack) | The reason this endpoint exists at all — short-lived access tokens are safer, but need a cheap way to renew them                                              |

---

## Common Errors & Fixes

| Error                                                      | Cause                                                                    | Fix                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `NotAuthorizedException: Refresh Token has expired`      | More than 30 days since login (`refreshTokenValidity` in the stack)    | Client must call`/auth/login` again         |
| `NotAuthorizedException: Refresh Token has been revoked` | User called`/auth/logout` (Step 8) since this refresh token was issued | Expected behavior — client must log in again |

---

## Checkpoints Before Moving to Step 8

- [ ] `services/auth-service/src/routes/refresh.ts` created
- [ ] Route mounted in `src/index.ts` via `app.route('/refresh', refreshRoute)`
- [ ] Expired/revoked refresh tokens return a clear `401`, not a `500`
- [ ] `npm run build` (from repo root) passes with no errors
