# Step 5 — Cognito Client & Config

---

## What You Are Doing

Create a single, reusable Cognito client and a small config object that reads the pool/client IDs the Lambda already receives as environment variables. Every route from Step 6 onward imports from this file instead of instantiating its own `CognitoIdentityProviderClient`.

---

## 5.1 Confirm the Environment Variables Already Exist

`lib/buildtrack-stack.ts` injects these into **every** Lambda via `sharedEnv`, including `AuthFn`:

```typescript
const sharedEnv = {
  TABLE_NAME: this.table.tableName,
  BUCKET_NAME: bucket.bucketName,
  USER_POOL_ID: userPool.userPoolId,
  USER_POOL_CLIENT: userPoolClient.userPoolClientId,
  NODE_ENV: 'production',
};
```

No CDK changes are needed for this step — `USER_POOL_ID` and `USER_POOL_CLIENT` are already available at `process.env.USER_POOL_ID` / `process.env.USER_POOL_CLIENT` inside the auth Lambda.

---

## 5.2 Create `services/auth-service/src/lib/cognito.ts`

```typescript
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const cognitoConfig = {
  userPoolId: () => requireEnv('USER_POOL_ID'),
  clientId: () => requireEnv('USER_POOL_CLIENT'),
};

// Region is inferred automatically from the Lambda execution environment (AWS_REGION)
export const cognitoClient = new CognitoIdentityProviderClient({});
```

- `cognitoClient` is created once, at module load time, and reused across warm Lambda invocations (avoids reconnecting on every request).
- `requireEnv` fails loudly at request time if a variable is somehow missing, instead of silently sending `ClientId: undefined` to Cognito.
- `userPoolId`/`clientId` are functions (not plain values) so the error only surfaces when actually used — this keeps the module importable in local scripts (Step 11) where env vars may not be set yet.

---

## 5.3 Verify It Compiles

```bash
npm run build
```

Run from the repo root.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Module-level client instantiation | Lambda reuses the execution environment across invocations when "warm" — creating the SDK client once at module load (not inside the handler) avoids the overhead of recreating it on every request |
| `new CognitoIdentityProviderClient({})` | Empty config — the SDK automatically picks up region and credentials from the Lambda execution role and `AWS_REGION` env var, no manual wiring needed |
| Why `USER_POOL_CLIENT`, not `USER_POOL_CLIENT_ID` | Matches the exact env var name the stack already sets — a naming mismatch here would fail silently (`undefined`) rather than erroring at compile time |
| `externalModules: ['@aws-sdk/*']` (from the stack's Lambda bundling config) | Confirms `@aws-sdk/client-cognito-identity-provider` doesn't need to be bundled — it's excluded from the esbuild output and expected to be present in the Lambda Node.js 20 runtime |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `Missing required environment variable: USER_POOL_ID` at runtime | Testing locally without the env var set, or a typo in the variable name | For local testing (Step 11), export the value manually before running; for deployed Lambda, confirm `sharedEnv` in the stack wasn't edited |
| `Cannot find module '@aws-sdk/client-cognito-identity-provider'` when running with plain `node`/`ts-node` locally | Package is marked `external` for the Lambda bundle but must still exist in `node_modules` for local execution | Confirm it's listed in `services/auth-service/package.json` dependencies (it already is) and `npm install` has been run inside `services/auth-service` |

---

## Checkpoints Before Moving to Step 6

- [ ] `services/auth-service/src/lib/cognito.ts` created with `cognitoConfig` and `cognitoClient`
- [ ] No hardcoded pool/client IDs anywhere in the file — both come from `process.env`
- [ ] `npm run build` (from repo root) passes with no errors
