# Step 5 — DynamoDB Client, Config & Key Builders

---

## What You Are Doing

Mirror `auth-service/src/lib/cognito.ts`'s pattern — a module-level SDK client instance (no explicit region/credentials; both come from the Lambda execution environment) plus a `requireEnv`-guarded config accessor. For DynamoDB, also add two tiny key-builder functions. Per `promts/tableDetails.md` §3.1–3.2, `Project` and `ProjectCostSummary` are the only two item shapes this service owns, both keyed off `PROJECT#<id>` — centralizing those two key shapes in one place avoids the `PK`/`SK` string literals drifting out of sync across 6+ route files.

This is deliberately **not** a full repository/DAO layer — routes still call `PutItemCommand`/`GetItemCommand`/etc. directly (Step 8 onward), exactly like `auth-service`'s routes call `InitiateAuthCommand` directly against `cognitoClient`. Only the client instance, env accessor, and the two key shapes are factored out.

---

## 5.1 Create `services/projects-service/src/lib/dynamo.ts`

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const dynamoConfig = {
  tableName: () => requireEnv('TABLE_NAME'),
};

// Region is inferred automatically from the Lambda execution environment (AWS_REGION)
export const dynamoClient = new DynamoDBClient({});

export const projectKey = (id: string) => ({ PK: `PROJECT#${id}`, SK: 'PROFILE' });
export const costSummaryKey = (id: string) => ({ PK: `PROJECT#${id}`, SK: 'COST#SUMMARY' });
```

`TABLE_NAME` is already injected into every Lambda via `sharedEnv` in `lib/buildtrack-stack.ts` — no stack change needed.

---

## 5.2 Verify It Compiles

```bash
npm run build
```

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Lazy `tableName()` function vs. a plain constant | Matches `cognitoConfig.userPoolId()` in `auth-service` — the missing-env-var check only fires the first time a route actually needs it, not at module load / cold start, which keeps import-time errors from masking the real failing request |
| No explicit `region` on `new DynamoDBClient({})` | Lambda's execution environment sets `AWS_REGION` automatically; the SDK v3 client picks it up with zero config, same as `cognitoClient` in `auth-service` |
| `projectKey(id)` / `costSummaryKey(id)` | The only two key shapes this service ever writes or reads — every route from Step 8 onward imports these instead of writing `PK`/`SK` string templates inline |

---

## Checkpoints Before Moving to Step 6

- [ ] `services/projects-service/src/lib/dynamo.ts` created with `dynamoClient`, `dynamoConfig.tableName()`, `projectKey()`, `costSummaryKey()`
- [ ] `npm run build` (from repo root) passes with no errors
