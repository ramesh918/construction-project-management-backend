# Step 11 — GET /projects/:id/cost-summary (Recompute-on-Read)

---

## What You Are Doing

Per `promts/tableDetails.md` §3.2, `totalCost`, `remaining`, and `isOverBudget` are **never** stored as independently-updated fields — `workers-service` and `materials-service` only ever `ADD` onto `labourCost`/`materialCost` (and `otherCost` is set manually, out of scope for this service). This route is where those three derived fields actually get computed, at read time, from whatever `labourCost + materialCost + otherCost` currently add up to.

---

## 11.1 Create `services/projects-service/src/routes/cost-summary.ts`

```typescript
import { Hono } from 'hono';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { dynamoClient, dynamoConfig, costSummaryKey } from '../lib/dynamo';
import { ok, fail } from '../lib/response';
import type { ProjectCostSummary } from '../../../../shared/types';

export const costSummaryRoute = new Hono();

costSummaryRoute.get('/:id/cost-summary', async c => {
  const id = c.req.param('id');

  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(costSummaryKey(id)),
    }),
  );

  if (!result.Item) {
    return fail(c, 'Cost summary not found for this project', 404);
  }

  const stored = unmarshall(result.Item) as ProjectCostSummary;
  const totalCost = stored.labourCost + stored.materialCost + stored.otherCost;

  const summary: ProjectCostSummary = {
    ...stored,
    totalCost,
    remaining: stored.budget - totalCost,
    isOverBudget: totalCost > stored.budget,
  };

  return ok(c, summary);
});
```

Mounted as its own tiny route file (rather than folded into `projects.ts`) since it's a read-only, single-purpose endpoint with a distinct concern (cost aggregation) from project CRUD — kept separate the way `auth-service` keeps `login.ts`/`refresh.ts`/`logout.ts`/`me.ts` as one file each rather than one giant router.

---

## 11.2 Verify It Compiles

```bash
npm run build
```

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Recompute-on-read | `totalCost`/`remaining`/`isOverBudget` in the *stored* item can be stale the moment another service does an `ADD` on `labourCost`/`materialCost` — this route always returns freshly-derived values, never trusting the stored copies of those three fields (it overwrites them from `stored` before responding, never persists the recompute) |
| Why this doesn't write back to DynamoDB | Recomputing on every read is cheap (simple arithmetic on already-fetched numbers) and avoids a write on a `GET` request, which would otherwise need its own conditional-write/race-condition handling for no benefit |
| `404` when the cost-summary item is missing | Covers the edge case flagged in Step 8 — if the second `PutItem` (cost summary) failed during project creation, this responds with a clear, expected 404 instead of crashing on `stored.labourCost` being `undefined` |

---

## Checkpoints Before Moving to Step 12

- [ ] `services/projects-service/src/routes/cost-summary.ts` created with `GET /:id/cost-summary`
- [ ] `totalCost`/`remaining`/`isOverBudget` computed fresh on every call, never read from stored values
- [ ] `npm run build` (from repo root) passes with no errors
