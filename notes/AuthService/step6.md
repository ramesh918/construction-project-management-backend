# Step 6 — POST /auth/login

---

## What You Are Doing

Implement the first real endpoint: `POST /auth/login`. It validates the request body, calls Cognito's `InitiateAuth` with the `USER_PASSWORD_AUTH` flow, and returns the resulting tokens using the `AuthTokens` shape from Step 2.

> ⚠️ Recall from `lib/buildtrack-stack.ts`: Cognito users are **admin-created only** (`selfSignUpEnabled: false`). Before testing this endpoint you need at least one user created via the AWS Console or `aws cognito-idp admin-create-user` — that's covered in Step 11.

---

## 6.1 Confirm the IAM Permission Already Exists

`lib/buildtrack-stack.ts` already grants the auth Lambda the exact Cognito action this route needs:

```typescript
authFn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
  actions: [
    'cognito-idp:InitiateAuth',
    'cognito-idp:GlobalSignOut'
  ],
  resources: [userPool.userPoolArn],
}));
```

No CDK changes are needed for this step.

---

## 6.2 Create `services/auth-service/src/routes/login.ts`

```typescript
import { Hono } from 'hono';
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient, cognitoConfig } from '../lib/cognito';
import { loginSchema } from '../schemas/auth.schema';
import { ok, fail } from '../lib/response';
import type { AuthTokens } from '../../../../shared/types';

export const loginRoute = new Hono();

loginRoute.post('/', async c => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'email and password (min 8 chars) are required', 400);
  }

  const { email, password } = parsed.data;

  try {
    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: cognitoConfig.clientId(),
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }));

    if (result.ChallengeName) {
      // e.g. NEW_PASSWORD_REQUIRED for an admin-created user's first login.
      // Handling the challenge flow is out of scope for this step — surfaced as a 401 for now.
      return fail(c, `Login requires additional step: ${result.ChallengeName}`, 401);
    }

    const auth = result.AuthenticationResult;
    if (!auth?.AccessToken || !auth.IdToken || !auth.RefreshToken) {
      return fail(c, 'Cognito did not return tokens', 500);
    }

    const tokens: AuthTokens = {
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      refreshToken: auth.RefreshToken,
      expiresIn: auth.ExpiresIn ?? 3600,
    };

    return ok(c, tokens, 'Login successful');
  } catch (err: any) {
    if (err.name === 'NotAuthorizedException') {
      return fail(c, 'Incorrect email or password', 401);
    }
    if (err.name === 'UserNotFoundException') {
      return fail(c, 'Incorrect email or password', 401); // same message — don't leak which part is wrong
    }
    throw err; // handled by the global error handler added in Step 10
  }
});
```

---

## 6.3 Wire the Route Into the App

Edit `services/auth-service/src/index.ts`:

```typescript
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { loginRoute } from './routes/login';

const app = new Hono().basePath('/auth');

app.get('/health', c => c.json({ status: 'ok' }));
app.route('/login', loginRoute);

export const handler = handle(app);
```

---

## 6.4 Verify It Compiles

```bash
npm run build
```

Run from the repo root.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `USER_PASSWORD_AUTH` | A Cognito auth flow where the client sends the raw email/password to your backend, which forwards it to Cognito — matches `authFlows.userPassword: true` already enabled on the app client in the stack |
| `ChallengeName` | Cognito's way of saying "authentication isn't finished yet" (e.g. a forced password reset for a brand-new admin-created user) — not handled fully here, just surfaced clearly |
| Same error message for wrong password vs. unknown user | Prevents an attacker from using the login endpoint to enumerate valid email addresses |
| `app.route('/login', loginRoute)` | Mounts a sub-router at `/auth/login` (remember `basePath('/auth')` from Step 1) — `loginRoute.post('/')` therefore matches `POST /auth/login` |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `AccessDeniedException: User is not authorized to perform: cognito-idp:InitiateAuth` | IAM policy wasn't deployed, or you're testing against a different stack/pool than the one the Lambda was deployed with | Re-run `cdk deploy` and confirm you're using the current `UserPoolId`/`UserPoolClientId` from that deployment's outputs |
| `NotAuthorizedException: Password attempts exceeded` | Too many failed login attempts against the same user | Wait for Cognito's lockout window to pass, or reset the test user's password via the Console |
| `ResourceNotFoundException: User pool client ... does not exist` | `USER_POOL_CLIENT` env var doesn't match the deployed pool's app client | Redeploy, or double check `.env.local` values from Step 13 of the main deployment notes |

---

## Checkpoints Before Moving to Step 7

- [ ] `services/auth-service/src/routes/login.ts` created
- [ ] Route mounted in `src/index.ts` via `app.route('/login', loginRoute)`
- [ ] Wrong email/password both return the same generic `401` message
- [ ] `npm run build` (from repo root) passes with no errors
