# Auth Service — Questions & Answers

---

This file answers specific questions about how auth-service actually behaves, referencing the real code in `services/auth-service/src/` (Steps 1–10) rather than restating the build steps themselves.

---

## 1. What happens when you logout using the token?

`POST /auth/logout` (`services/auth-service/src/routes/logout.ts`) does exactly one thing: it takes the **access token** from the `Authorization: Bearer <token>` header and calls Cognito's `GlobalSignOutCommand` with it.

```typescript
await cognitoClient.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
```

What that single call triggers on Cognito's side:

- **All refresh tokens** ever issued to that user are revoked immediately — not just the one tied to the current session, but every refresh token from every device/login that user has. There's no "log out this one device" option in this implementation; `GlobalSignOut` is all-or-nothing by design.
- Any subsequent `POST /auth/refresh` using one of those refresh tokens fails immediately with `NotAuthorizedException` → this route maps that to a clear `401`.

What it does **not** do immediately:

- The **access token and ID token already in the client's hands remain structurally valid** until their natural expiry (`accessTokenValidity: 1 hour`, set in `lib/buildtrack-stack.ts`). This app's `GET /auth/me` (`src/routes/me.ts`) verifies tokens **locally** via `aws-jwt-verify` — checking signature, issuer, and expiry against Cognito's public keys — and never asks Cognito "has this been revoked?". So calling `/auth/me` again right after logout, with the same still-unexpired access token, will still succeed. This is the same caveat documented in Step 9 and Step 11.
- Practical consequence: **logout revokes the ability to get new tokens, not the tokens that already exist.** The blast radius of a leaked access token is bounded by its 1-hour lifetime regardless of logout — that short lifetime is the actual mitigation, not `/auth/logout` itself.

One more detail worth noting: if the access token passed to `/auth/logout` is already expired or otherwise invalid, Cognito throws `NotAuthorizedException` — the route treats that as a success (`return ok(c, null, 'Logged out')`) rather than an error, since the caller's goal ("be logged out") is already true either way.

---

## 2. What does the refresh token do, and how does it work in real time?

**Why it exists at all:** access/ID tokens are deliberately short-lived (`accessTokenValidity`/`idTokenValidity`: 1 hour, in the stack) so a leaked one doesn't stay dangerous for long. But forcing a user to re-enter their password every hour would be unusable. The refresh token (`refreshTokenValidity`: 30 days) is the long-lived credential that lets a client silently obtain new access/ID tokens without the password, as long as it's within that 30-day window and hasn't been revoked.

**What this codebase does with it** (`services/auth-service/src/routes/refresh.ts`):

```typescript
const result = await cognitoClient.send(new InitiateAuthCommand({
  AuthFlow: 'REFRESH_TOKEN_AUTH',
  ClientId: cognitoConfig.clientId(),
  AuthParameters: { REFRESH_TOKEN: parsed.data.refreshToken },
}));
```

Cognito validates the refresh token and, if it's still valid, returns a **new** `AccessToken` and `IdToken` with a fresh `expiresIn`. It does **not** return a new refresh token — Cognito doesn't rotate refresh tokens by default in this flow, so the client keeps using the same one from the original `/auth/login` call until it's 30 days old or revoked via `/auth/logout`.

**How this plays out in real time on the client side** (this is frontend behavior this API enables, not something implemented in this repo yet):

1. Client logs in once, stores `accessToken`, `idToken`, `refreshToken`.
2. Client uses `accessToken` on every protected API call (`/projects`, `/workers`, etc. — validated by API Gateway's Cognito authorizer).
3. After ~1 hour, that access token expires. Either:
   - The client tracks the token's `expiresIn` and proactively calls `/auth/refresh` shortly before expiry, or
   - The client waits for an API call to fail (`401`) and then calls `/auth/refresh` reactively, then retries the original request.
4. `/auth/refresh` returns a new `accessToken`/`idToken` pair; the client swaps them in and keeps going — the user never sees a login screen.
5. This repeats silently for up to 30 days. After that (or after an explicit logout), step 3 fails permanently and the client must send the user back to `/auth/login`.

**Where the "real-time" behavior actually lives:** entirely on whichever frontend consumes this API — this backend only exposes the primitive (`POST /auth/refresh`). Nothing in this repo currently auto-refreshes on a schedule or intercepts `401`s; that logic doesn't exist server-side and wouldn't make sense there anyway (the server can't proactively push new tokens to a client).

---

## 3. What do we have to do when a token is compromised?

Given what's actually implemented today, here's the real, honest answer — including what this codebase does **not** yet cover:

**Immediate action available right now — revoke the refresh token:**

```bash
curl -X POST <API_URL>/auth/logout -H "Authorization: Bearer <the-compromised-access-token>"
```

If you (or the user) still have a valid access token to present, calling `/auth/logout` triggers `GlobalSignOut`, which revokes **every** refresh token for that user account immediately (see Q1). This is the only "kill switch" this API currently exposes.

**If you don't have a valid access token** (e.g., a security report comes in about a user, but nobody currently holds a live session token to call `/auth/logout` with), the app itself has no endpoint for this — it would have to be done directly against Cognito, outside this API:

```bash
# Admin-side equivalent of GlobalSignOut — doesn't require the user's own token
aws cognito-idp admin-user-global-sign-out \
  --user-pool-id $USER_POOL_ID \
  --username <compromised-user-email>
```

**Force a password reset** (the compromised credential itself needs to be invalidated, not just the tokens):

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username <compromised-user-email> \
  --password <new-temporary-password>
# omit --permanent so the user is forced through NEW_PASSWORD_REQUIRED on next login
```

**For a serious/active compromise, disable the account while investigating:**

```bash
aws cognito-idp admin-disable-user \
  --user-pool-id $USER_POOL_ID \
  --username <compromised-user-email>
```

This blocks all future `/auth/login` and `/auth/refresh` calls for that user immediately. Re-enable with `admin-enable-user` once resolved.

**The gap to be aware of:** none of the above retroactively invalidates an access/ID token that's already been issued and hasn't expired yet — because `GET /auth/me` verifies tokens locally (signature + expiry only, via `aws-jwt-verify` in `src/lib/jwt.ts`), not against Cognito's live revocation state. So worst case, a compromised access token remains usable against `/auth/me` for up to its remaining lifetime (≤ 1 hour) even after you've done everything above. This is the direct tradeoff of stateless JWT verification, and it's why `accessTokenValidity` is kept short in the stack rather than long. Closing this gap completely would mean either checking every request against Cognito directly (defeats the point of local verification) or maintaining an app-side token blocklist — neither exists in this codebase today.

**Nothing above is exposed as an API route in this service** — it's all direct Cognito CLI/Console operations. If this needs to be a supported product feature (e.g., a "sign out everywhere" button, or an admin "disable this user" action), that would be new work: an authenticated, admin-only route wrapping `AdminUserGlobalSignOutCommand` / `AdminDisableUserCommand`, which doesn't exist yet.

---

## 4. Where is the secret of the JWT in this code?

**There isn't one — and that's intentional.** This app never signs a JWT itself, so there's no signing secret anywhere in this repository to find.

Cognito issues and signs the access/ID tokens using **RS256** (asymmetric RSA), not a symmetric algorithm like HS256. That means:

- **Signing** happens entirely inside Cognito, using a **private key that AWS holds and never exposes** — not to this Lambda, not to this repo, not to anyone. It isn't an environment variable, a CDK parameter, or a Secrets Manager entry — it simply isn't accessible outside Cognito.
- **Verifying** a signature only ever needs the corresponding **public** key — and public keys aren't secrets by definition.

The verification code, in `services/auth-service/src/lib/jwt.ts`:

```typescript
verifier = CognitoJwtVerifier.create({
  userPoolId: cognitoConfig.userPoolId(),
  tokenUse: 'access',
  clientId: cognitoConfig.clientId(),
});
```

only takes `userPoolId` and `clientId` — both plain identifiers (not secrets; the pool ID is even visible inside every issued token's `iss` claim, and the app client was created with `generateSecret: false` in `lib/buildtrack-stack.ts` since public clients like this one can't safely store a secret anyway). At verify time, `aws-jwt-verify` fetches Cognito's **public** signing keys from a public, unauthenticated JWKS endpoint — `https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/jwks.json` — caches them, and checks the token's signature against them. No secret changes hands at any point in that process.

**Where `userPoolId`/`clientId` themselves live:** `sharedEnv` in `lib/buildtrack-stack.ts` → injected as `USER_POOL_ID`/`USER_POOL_CLIENT` Lambda environment variables → read via `cognitoConfig` in `services/auth-service/src/lib/cognito.ts`. Again, these are identifiers, not credentials — knowing them doesn't let anyone forge a token, since forging one would still require Cognito's private key.

**If this project ever used a hand-rolled JWT approach instead** (e.g., the `jsonwebtoken` npm package with `jwt.sign(payload, SECRET_KEY)`), *that* is where a real secret would exist, and it would need to live in an env var or Secrets Manager, never in source code. This project deliberately avoids that entire category of risk by delegating all signing to Cognito's managed keys.

---

## 5. What is the use of the ID token?

Cognito always issues **two** JWTs from a successful login (plus the refresh token): an **access token** and an **ID token**. They look similar but serve different purposes:

|                        | ID Token                                                           | Access Token                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose                | Proves**who the user is** (identity)                         | Proves**what the request is allowed to do** (authorization)                                                                             |
| Typical claims         | `sub`, `email`, `email_verified`, `cognito:username`       | `sub`, `cognito:groups`, `scope`, `client_id`                                                                                         |
| `token_use` claim    | `"id"`                                                           | `"access"`                                                                                                                                  |
| Meant to be read by    | The**client app itself** (to show "logged in as ...")        | **APIs** (sent as the `Authorization: Bearer` header on protected requests)                                                           |
| Used in this codebase? | Returned to the client, but never verified or read by this backend | Verified by`/auth/me`, required by `/auth/logout`, and validated by API Gateway's Cognito authorizer on `/projects`, `/workers`, etc. |

**In this specific codebase**, that last row is the important part:

- `services/auth-service/src/lib/jwt.ts` creates its verifier with `tokenUse: 'access'` explicitly — if a client sends the **ID token** to `GET /auth/me` instead of the access token, verification fails and the route returns `401 Invalid or expired token`.
- `logout.ts` and `me.ts` both only ever read the access token from the `Authorization` header — the ID token is never inspected anywhere in `services/auth-service`.
- The ID token **is** still correctly returned by `/auth/login` and `/auth/refresh` (`AuthTokens`/`RefreshResult` in `shared/types/auth.types.ts`) — Cognito issues it alongside the access token as part of the same `AuthenticationResult`, so there's no reason to drop it from the response.

**What it's actually for, then:** a frontend that isn't calling `/auth/me` at all can just **decode** (not verify — a plain base64 decode of the payload, no signature check needed client-side since the frontend already trusts it as coming from its own login call) the ID token locally to get `email`/`sub` immediately after login, without an extra round trip to `/auth/me`. It's also the standard token type expected by some AWS services if this project ever integrates with Amplify/AppSync/API Gateway's identity-based authorizers that specifically want an ID token rather than an access token.

**Bottom line:** right now, in this repo, the ID token is issued correctly but functionally unused server-side — it exists for a future/external consumer (a frontend, or another AWS service) rather than for anything `auth-service` itself currently does with it.

---

## 6. How do we disable a user in production if we don't have CLI access?

The CLI commands in Q3 (`aws cognito-idp admin-disable-user`, etc.) assume someone has AWS CLI credentials configured locally. In production that's often deliberately not the case. There are two different answers depending on what "no CLI access" actually means:

**If someone still has AWS Console/IAM access (just not local CLI credentials):**

- **AWS Console, no CLI at all:** Cognito → User pools → `buildtrack-users` → **Users** tab → search/select the user → **Actions** → **Disable user**. Takes effect immediately — blocks all future `InitiateAuth`/`RefreshToken` calls for that user right away. This is a pure browser action, nothing installed.
- **AWS CloudShell:** a browser-based terminal built into the AWS Console itself. It lets you run the exact same `aws cognito-idp admin-disable-user --user-pool-id ... --username ...` command from Q3 with zero local CLI setup — useful if you want to script disabling several users at once rather than clicking through the UI one at a time.

Either option still requires **some** AWS IAM identity with Cognito permissions — just not a locally configured `aws` CLI.

**If nobody on the ops/support side has any AWS access at all in production** (locked-down security policy, support staff only ever touch this app's own admin panel) — the Console and CloudShell aren't usable by them either, for the same reason the CLI isn't. The only real fix is exposing this as an endpoint in this app's own API, gated by the `admin` group membership already established in Q5/Step 13. **This does not exist yet** — today `GET /auth/me` reports whether a caller `isAdmin`, but nothing in the codebase actually gates a route on that, and no route calls any `Admin*` Cognito action (`AdminDisableUser`, `AdminEnableUser`, `AdminUserGlobalSignOut`). Building it would require:

1. Granting the auth Lambda's execution role the extra IAM actions it needs, in `lib/buildtrack-stack.ts`, next to the existing `InitiateAuth`/`GlobalSignOut` grant:
   ```typescript
   authFn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
     actions: [
       'cognito-idp:AdminDisableUser',
       'cognito-idp:AdminEnableUser',
       'cognito-idp:AdminUserGlobalSignOut', // force sign-out without needing the user's own token
     ],
     resources: [userPool.userPoolArn],
   }));
   ```
2. A new admin-only route (e.g. `POST /auth/admin/users/:username/disable`) that verifies the **caller's own** access token has `isAdmin: true` (reusing the same verification `GET /auth/me` already does) before calling `AdminDisableUserCommand` on the **target** user.
3. Deciding how that route authenticates the caller in the first place — since `/auth` has no API Gateway Cognito authorizer (Step 9), the route itself would need to do what `/auth/me` does: verify the `Authorization` header locally, then check the `isAdmin` claim before proceeding.

Until that's built, disabling a user in production is an AWS-side operation (Console or CloudShell), not something achievable purely through this app's own API.

---

## 7. If we disable the user, does their still-unexpired access token keep working?

**Yes.** Disabling a user does not revoke tokens they already hold — an access token issued before the disable keeps working until it naturally expires (≤ 1 hour, per `accessTokenValidity` in `lib/buildtrack-stack.ts`).

Why, concretely in this codebase:

- `GET /auth/me` verifies the token **locally** via `aws-jwt-verify` (`services/auth-service/src/lib/jwt.ts`) — checking only signature, issuer, `token_use`, and expiry. It never asks Cognito "is this user currently enabled?" on a per-request basis.
- The same applies to API Gateway's `CognitoUserPoolsAuthorizer`, which protects `/projects`, `/workers`, `/materials`, `/progress`, `/dashboard` — same style of stateless cryptographic validation. It's arguably even slower to reflect a status change, since it **caches the auth decision for 5 minutes** (`resultsCacheTtl: cdk.Duration.minutes(5)` in the stack).

What `AdminDisableUser` **does** stop immediately: any **new** `InitiateAuth` call — both a fresh `/auth/login` and a `/auth/refresh` (`REFRESH_TOKEN_AUTH`) — gets rejected with `NotAuthorizedException: User is disabled.`. So a disabled user can't obtain a new access token and can't refresh their way to one either; they're stuck with whatever token they already hold until it expires.

Two practical follow-ons from this:

1. **Disabling alone doesn't revoke the refresh token.** For an urgent case (e.g. a compromised account, tying back to Q3), pair `admin-disable-user` with `admin-user-global-sign-out` to also kill the outstanding refresh token immediately — otherwise it just sits there unusable-but-not-revoked until it would have expired on its own (30 days).
2. Even doing both, the currently-held **access token** is still valid until its own natural expiry — there is no combination of Cognito admin actions in this setup that instantly invalidates an already-issued access token being checked via local/stateless verification. This is the same fundamental limitation already noted in Q1 and Q3, and it's exactly why `accessTokenValidity` is kept short (1 hour) — that value is the deliberate upper bound on this gap, not an oversight.

---

## 8. That ≤1-hour window is a dangerous zone — is there any way to stop it?

Not with the current architecture — that's the inherent trade-off of stateless JWT verification, not a bug to patch. But there are real ways to shrink or close it, in increasing order of effort:

**1. Shrink the window (quick, doesn't eliminate it)**

Lower `accessTokenValidity` in `lib/buildtrack-stack.ts` — e.g. 15 minutes instead of 1 hour. Reduces the dangerous zone proportionally, at the cost of more frequent `/auth/refresh` calls from clients. This is the cheap lever, and is the mitigation this stack already leans on (see Q7).

> One thing that **won't** help: lowering API Gateway's `resultsCacheTtl` (currently 5 minutes, from `lib/buildtrack-stack.ts`). That only controls how often the *same* stateless signature check is re-run by API Gateway — it never checked "is this user disabled" in the first place, so shortening it changes nothing about this specific gap.

**2. Do a live check instead of local verification**

Swap `GET /auth/me`'s local `aws-jwt-verify` check (`services/auth-service/src/lib/jwt.ts`) for a call to Cognito's `GetUser` API using the access token. `GetUser` validates against Cognito's live state, so a disabled user's token would be rejected immediately instead of only at natural expiry. Trade-off: every request now costs a network round trip to Cognito instead of a local signature check — you lose the actual performance benefit of using JWTs in the first place. This would also only fix `/auth/me` — it wouldn't touch `/projects`, `/workers`, etc., since those are gated by API Gateway's `CognitoUserPoolsAuthorizer`, not this route.

**3. Build a real revocation list (the only way to close it for every route, not just `/auth/me`)**

This app already has a DynamoDB table (`this.table` in `lib/buildtrack-stack.ts`) that could hold exactly this kind of lookup. The pattern:

- On disable / global-sign-out, write an item like `PK: USER#<userId>`, `SK: REVOKED`, `revokedAt: <timestamp>` to the table.
- On every request, after verifying the JWT's signature, also check: is the token's `iat` (issued-at) claim older than this user's `revokedAt`? If so, reject even though the signature itself is still valid.
- To cover `/projects`, `/workers`, `/materials`, `/progress`, `/dashboard` too (not just this service), API Gateway's built-in `CognitoUserPoolsAuthorizer` would need to be replaced with a **custom Lambda authorizer** that does both the JWT check and this DynamoDB lookup. That's a nontrivial infrastructure change — bigger than anything built in this service so far — since none of those other five services have any real logic yet (see the main `CLAUDE.md`: they're all still stub handlers).

**In practice**, most production systems accept option 1 (short-lived access tokens + revoke the refresh token on disable/logout, per Q7) as "good enough," and only build option 3 if there's a specific compliance or security requirement for instant, guaranteed revocation.
