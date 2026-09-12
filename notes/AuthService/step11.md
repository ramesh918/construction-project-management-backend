# Step 11 — Local Testing & Deploy Verification

---

## What You Are Doing

Exercise all four endpoints twice: first locally (no AWS deploy needed, fast feedback loop), then against the real deployed API Gateway + Lambda + Cognito.

---

## 11.1 Local Testing With `app.request()`

Hono apps can be called directly in-process — no HTTP server needed — via `app.request(path, init)`. This is enough to test route logic, validation, and the response envelope without touching AWS.

Create a scratch file (do not commit it) at `services/auth-service/scratch-test.ts`:

```typescript
import app from './src/index'; // see note below about exporting `app`

async function main() {
  const res = await app.request('/auth/health');
  console.log(res.status, await res.json());

  const badLogin = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
  });
  console.log(badLogin.status, await badLogin.json()); // expect 400
}

main();
```

> `app.request()` needs a reference to the Hono `app` instance, but `src/index.ts` currently only exports `handler`. Add `export default app;` alongside the existing `export const handler = handle(app);` line in `src/index.ts` so scratch scripts like this one can import it. This does not change the Lambda's exported `handler`.

Run it:

```bash
cd services/auth-service
USER_POOL_ID=<your-user-pool-id> USER_POOL_CLIENT=<your-app-client-id> \
  npx ts-node scratch-test.ts
cd ../..
```

Use the `UserPoolId`/`UserPoolClientId` values saved to `.env.local` back in Step 13 of the main deployment notes.

Delete `scratch-test.ts` once you've confirmed the routes behave as expected — it's a throwaway debugging tool, not part of the service.

---

## 11.2 Create a Test User in Cognito

Since `selfSignUpEnabled: false`, you must create a user manually before `/auth/login` can succeed against real Cognito:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <your-user-pool-id> \
  --username test@buildtrack.dev \
  --user-attributes Name=email,Value=test@buildtrack.dev Name=email_verified,Value=true \
  --temporary-password TempPass123!

aws cognito-idp admin-set-user-password \
  --user-pool-id <your-user-pool-id> \
  --username test@buildtrack.dev \
  --password RealPass123! \
  --permanent
```

The second command sets a **permanent** password so the user skips the `NEW_PASSWORD_REQUIRED` challenge Step 6 surfaces as a `401` — that challenge flow isn't implemented yet, so a permanent password is required for testing.

Optionally add the user to the `admin` group to test the `isAdmin`/`role` fields from `/auth/me`:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <your-user-pool-id> \
  --username test@buildtrack.dev \
  --group-name admin
```

---

## 11.3 Deploy

From the repo root:

```bash
npm run build
cdk diff
cdk deploy
```

`cdk diff` should show only a change to the `AuthFn` Lambda's code (new asset hash) — no other resources should be affected, since no CDK infrastructure changed across Steps 1–10.

---

## 11.4 Verify End-to-End With curl

Replace `<API_URL>` with the `ApiUrl` output value (e.g. `https://xxx.execute-api.us-east-1.amazonaws.com/v1`).

**Login:**

```bash
curl -s -X POST <API_URL>/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@buildtrack.dev","password":"RealPass123!"}' | jq
```

Save the `accessToken` and `refreshToken` from the response for the next calls.

**Who am I:**

```bash
curl -s <API_URL>/auth/me \
  -H "Authorization: Bearer <accessToken>" | jq
```

Expect `role: "admin"` if you added the user to the `admin` group in 11.2.

**Refresh:**

```bash
curl -s -X POST <API_URL>/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}' | jq
```

Expect a new `accessToken`/`idToken` pair.

**Logout:**

```bash
curl -s -X POST <API_URL>/auth/logout \
  -H "Authorization: Bearer <accessToken>" | jq
```

**Confirm the refresh token was revoked:**

```bash
curl -s -X POST <API_URL>/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}' | jq
```

Expect `401` — this refresh token was revoked by the logout call above.

> Reminder from Step 9: calling `/auth/me` again right after logout, with the **same still-unexpired access token**, will still succeed. That's expected — revocation isn't checked by local JWT verification. Only `/auth/refresh` (which calls Cognito directly) reflects the logout immediately.

---

## Key Concepts (For Reference)

| Concept                                             | What It Means                                                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.request()`                                   | Hono's built-in way to invoke routes in-process for testing, without starting an HTTP server or deploying anywhere                                                       |
| `admin-create-user` / `admin-set-user-password` | The only way to get a usable test account, since the user pool has self-signup disabled by design                                                                        |
| `cdk diff` before `cdk deploy`                  | Confirms this round of changes only touches Lambda code, not infrastructure — a quick sanity check that nothing in`lib/buildtrack-stack.ts` was accidentally modified |

---

## Common Errors & Fixes

| Error                                                      | Cause                                                                                                    | Fix                                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotAuthorizedException: Temporary password has expired` | Test user created with a temporary password more than 7 days ago and never set permanent                 | Re-run`admin-set-user-password ... --permanent`                                                                                                             |
| `curl` responses are unreadable                          | `jq` not installed                                                                                     | Drop `                                                                                                                                                        |
| `/auth/refresh` still succeeds after logout              | Normal for**access** tokens (see the reminder above) — but refresh tokens should fail immediately | If refresh still succeeds after logout, confirm`GlobalSignOutCommand` in `logout.ts` is being reached (check CloudWatch Logs for the `AuthFn` function) |

---

## Checkpoints — Auth Service Complete

- [ ] Local `app.request()` testing confirms validation errors return `400`
- [ ] Test Cognito user created with a permanent password
- [ ] `cdk deploy` completed with only `AuthFn` code changing
- [ ] `POST /auth/login` returns real tokens for the test user
- [ ] `GET /auth/me` returns the correct `role`/`isAdmin` based on group membership
- [ ] `POST /auth/refresh` returns a new access/ID token pair
- [ ] `POST /auth/logout` revokes the refresh token (confirmed by a follow-up `401` on refresh)
- [ ] `scratch-test.ts` deleted before committing
