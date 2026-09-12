# Step 8 — POST /projects (Create Project)

---

## What You Are Doing

The first real route: an admin creates a project (`promts/ProjectService.md`: *"admin will enter the project details"*). Per `promts/tableDetails.md` §3.1–3.2, creating a project means writing **two** items — the `Project` profile (`PK=PROJECT#<id>, SK=PROFILE`) and an initial, all-zero `ProjectCostSummary` (`PK=PROJECT#<id>, SK=COST#SUMMARY`) — since `workers-service`/`materials-service` will later `ADD` onto that cost-summary item and it must exist first.

---

## 8.1 Create `services/projects-service/src/routes/projects.ts`

Start the file with the create-project handler (Steps 9 and 10 add more routes to this same file):

```typescript
import { Hono } from 'hono';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoClient, dynamoConfig, projectKey, costSummaryKey } from '../lib/dynamo';
import { createProjectSchema } from '../schemas/project.schema';
import { ok, fail } from '../lib/response';
import type { Project, ProjectCostSummary } from '../../../../shared/types';

export const projectsRoute = new Hono();

projectsRoute.post('/', async c => {
  const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? 'Invalid project payload', 400);
  }

  const now = new Date().toISOString();
  const id = uuid();

  const project: Project = {
    id,
    ...parsed.data,
    status: 'Planning',
    documents: [],
    createdAt: now,
    updatedAt: now,
  };

  const costSummary: ProjectCostSummary = {
    projectId: id,
    labourCost: 0,
    materialCost: 0,
    otherCost: 0,
    totalCost: 0,
    budget: project.budget,
    remaining: project.budget,
    isOverBudget: false,
    updatedAt: now,
  };

  await dynamoClient.send(
    new PutItemCommand({
      TableName: dynamoConfig.tableName(),
      Item: marshall({ ...projectKey(id), ...project }),
    }),
  );

  await dynamoClient.send(
    new PutItemCommand({
      TableName: dynamoConfig.tableName(),
      Item: marshall({ ...costSummaryKey(id), ...costSummary }),
    }),
  );

  return ok(c, project, 'Project created', 201);
});
```

Two sequential `PutItem` calls rather than a `TransactWriteItems` — matches the "sequential writes over transactions" convention documented in `promts/tableDetails.md` §5. If the second `PutItem` (cost summary) fails after the first succeeds, the project exists without a cost summary until Step 11's `GET /projects/:id/cost-summary` route is called for it — Step 11 handles a missing cost-summary item defensively (`GetItem` returns nothing → treat as all-zero) rather than assuming it always exists, so this edge case degrades gracefully instead of 500ing.

---

## 8.2 Verify It Compiles

```bash
npm run build
```

Nothing mounts `projectsRoute` into the app yet (that's Step 15) — this step should compile in isolation.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `status: 'Planning'` hardcoded, not from the request body | Matches `CreateProjectInput` (Step 2) — status always starts at `'Planning'`; a client can't create a project that's already `'Active'` or `'Completed'`. Transitioning status is `PATCH /projects/:id` (Step 10) |
| `documents: []` initialized at create time | So later document routes (Steps 12–14) can always assume the array exists rather than checking for `undefined` on every access |
| `marshall({ ...projectKey(id), ...project })` | Spreads the DynamoDB key attributes (`PK`/`SK`) and the full domain object into one flat item, then converts the whole thing to DynamoDB's `AttributeValue` format in one call |
| Why the cost summary duplicates `budget` | Explained in Step 2 — avoids a second `GetItem` on every cost-summary read (Step 11) |

---

## Checkpoints Before Moving to Step 9

- [ ] `services/projects-service/src/routes/projects.ts` created with `projectsRoute` and `POST /`
- [ ] `npm run build` (from repo root) passes with no errors
