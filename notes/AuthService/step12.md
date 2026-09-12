# Step 12 — Local Testing With Postman

---

## What You Are Doing

Run the auth-service Hono app on your own machine (outside Lambda) with a tiny Node HTTP server, then hit it from Postman instead of curl or the `app.request()` script from Step 11. This gives you a real `localhost` server you can point a saved Postman collection at, with request history and chained variables — useful while iterating on routes without a full `cdk deploy` each time.

> ⚠️ This step uses **your own local AWS credentials** to call Cognito, not the Lambda's execution role — see 12.5 before you start.

---

## 12.1 Install a Local Dev Server

`@hono/node-server` turns any Hono app into a plain Node HTTP server — the same package `services/projects-service` already uses for this purpose.

```bash
cd services/auth-service
npm install --save-dev @hono/node-server
cd ../..
```

---

## 12.2 Export the App Instance

`src/index.ts` currently only exports `handler` (the Lambda entry point). Add a default export of the Hono app itself so a local server file can reuse the exact same routes without duplicating registration:

```typescript
// ...existing imports and route registration in src/index.ts...

export const handler = handle(app);
export default app;
```

---

## 12.3 Create a Local Server Entry Point

Create `services/auth-service/src/local.ts`:

```typescript
import { serve } from '@hono/node-server';
import app from './index';

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, info => {
  console.log(`auth-service listening on http://localhost:${info.port}`);
});
```

`app.fetch` is Hono's underlying request handler. `@hono/node-server` wraps it with a native Node `http.Server` — a completely separate runtime adapter from the `hono/aws-lambda` `handle()` used for the deployed Lambda. Both wrap the same `app`, so route behavior is identical either way.

---

## 12.4 Add a `dev` Script

Edit `services/auth-service/package.json`:

```json
"scripts": {
  "build": "tsc --noEmit",
  "start": "ts-node src/index.ts",
  "dev": "ts-node src/local.ts"
}
```

---

## 12.5 Set Local Environment Variables and AWS Credentials

The routes read `USER_POOL_ID` and `USER_POOL_CLIENT` from `process.env` (Step 5) — inside the deployed Lambda these come from `sharedEnv` automatically; locally you must export them yourself, using the values saved to `.env.local` back in Step 13 of the main deployment notes:

```bash
cd services/auth-service
export USER_POOL_ID=<your-user-pool-id>
export USER_POOL_CLIENT=<your-app-client-id>
```

Also make sure this terminal has valid AWS credentials — the same ones you use for `cdk deploy` (e.g. `aws sso login`, or `export AWS_PROFILE=<profile>`). `lib/buildtrack-stack.ts` grants the Lambda's execution role `cognito-idp:InitiateAuth` and `cognito-idp:GlobalSignOut` explicitly; when running locally, `CognitoIdentityProviderClient` signs requests with **your** credentials instead, so your IAM identity needs equivalent permission on the same user pool. If you're using the profile you deploy with, you almost certainly already have it.

---

## 12.6 Start the Local Server

```bash
npm run dev
```

Expected output: `auth-service listening on http://localhost:4000`. Leave this running in its own terminal — `ts-node` doesn't watch files, so every route edit needs `Ctrl+C` + `npm run dev` again.

---

## 12.7 Configure Postman

Base URL for every request: `http://localhost:4000`.

1. Create a new Postman Collection — e.g. **BuildTrack Auth — Local**.
2. Add a Collection Variable `baseUrl` = `http://localhost:4000`.
3. Add the five requests below, using `{{baseUrl}}` in each URL.

### `GET {{baseUrl}}/auth/health`

No headers, no body. Expect `200` with `{ "status": "ok" }` — confirms the server and route wiring are up before testing the real endpoints.

### `POST {{baseUrl}}/auth/login`

- Headers: `Content-Type: application/json`
- Body → **raw** → **JSON**:
  ```json
  {
    "email": "test@buildtrack.dev",
    "password": "RealPass123!"
  }
  ```

  (Use the test user created in Step 11.2.)
- **Tests** tab — capture the tokens into collection variables so later requests can reuse them:
  ```javascript
  const body = pm.response.json();
  if (body.success) {
    pm.collectionVariables.set('accessToken', body.data.accessToken);
    pm.collectionVariables.set('refreshToken', body.data.refreshToken);
  }
  ```

### `GET {{baseUrl}}/auth/me`

- Headers: `Authorization: Bearer {{accessToken}}`
- Expect `200` with `{ userId, email, role, isAdmin }`.

### `POST {{baseUrl}}/auth/refresh`

- Headers: `Content-Type: application/json`
- Body → raw → JSON:
  ```json
  { "refreshToken": "{{refreshToken}}" }
  ```
- **Tests** tab — keep `accessToken` current for any request run after this one:
  ```javascript
  const body = pm.response.json();
  if (body.success) {
    pm.collectionVariables.set('accessToken', body.data.accessToken);
  }
  ```

### `POST {{baseUrl}}/auth/logout`

- Headers: `Authorization: Bearer {{accessToken}}`
- Expect `200` with `{ "success": true, "message": "Logged out" }`.

---

## 12.8 Suggested Test Order

Run the requests top-to-bottom in Postman (or use **Run Collection** for a one-click pass):

1. `GET /auth/health` — server is up.
2. `POST /auth/login` — captures `accessToken`/`refreshToken`.
3. `GET /auth/me` — uses the captured `accessToken`; check `role`/`isAdmin` match the test user's group membership.
4. `POST /auth/refresh` — uses the captured `refreshToken`; refreshes `accessToken`.
5. `POST /auth/logout` — revokes the refresh token.
6. Re-run `POST /auth/refresh` — same `refreshToken` variable, now stale. Expect `401`, confirming logout actually revoked it.

> Reminder from Step 11: re-running `GET /auth/me` with the old `accessToken` after logout will still succeed until that token naturally expires — local JWT verification doesn't check revocation, only `/auth/refresh` reflects logout immediately.

---

## Key Concepts (For Reference)

| Concept                                                    | What It Means                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hono/node-server`                                      | Adapts a Hono app to a real Node`http.Server` — same route code, different runtime adapter than `hono/aws-lambda`                                        |
| Why a separate`local.ts` instead of editing `index.ts` | Keeps the Lambda entry point (`handler`) untouched — `local.ts` is a dev-only wrapper around the same `app` instance                                   |
| Postman Collection Variables + Tests scripts               | Postman's way of chaining requests — capture a value from one response and reuse it as`{{variable}}` in the next request, without manual copy/paste        |
| Local AWS credentials vs. Lambda execution role            | Locally,`CognitoIdentityProviderClient` signs requests with whatever credentials are active in your terminal — not the IAM role CDK created for the Lambda |

---

## Common Errors & Fixes

| Error                                                                       | Cause                                                                                                     | Fix                                                                                        |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Error: Missing required environment variable: USER_POOL_ID`              | Skipped 12.5, or opened a new terminal without re-exporting                                               | Re-export`USER_POOL_ID`/`USER_POOL_CLIENT` in the same terminal before `npm run dev` |
| Postman shows`Error: connect ECONNREFUSED 127.0.0.1:4000`                 | `npm run dev` isn't running, or it crashed after a code edit                                            | Check the terminal running`npm run dev` for a stack trace, fix it, and restart           |
| `AccessDeniedException` on `/auth/login` locally, but not when deployed | Local AWS credentials belong to an identity without`cognito-idp:InitiateAuth` on this user pool         | Use the same AWS profile/credentials you use for`cdk deploy`                             |
| Server receives an empty body                                               | `Content-Type: application/json` header missing, or Postman body type isn't set to **raw / JSON** | Set both explicitly on the request                                                         |
| Route edits don't show up when retesting                                    | `ts-node` doesn't hot-reload                                                                            | Stop (`Ctrl+C`) and re-run `npm run dev` after every source change                     |

---

## Checkpoints

- [ ] `@hono/node-server` installed as a dev dependency in `services/auth-service`
- [ ] `src/index.ts` exports `app` as default, in addition to `handler`
- [ ] `src/local.ts` created and `npm run dev` starts a local server on port 4000
- [ ] `USER_POOL_ID` / `USER_POOL_CLIENT` exported (and valid AWS credentials active) in the terminal running the server
- [ ] Postman collection created with a `baseUrl` variable and all 5 requests (`health`, `login`, `me`, `refresh`, `logout`)
- [ ] Full flow (login → me → refresh → logout → refresh again) tested in Postman and produces the expected statuses
