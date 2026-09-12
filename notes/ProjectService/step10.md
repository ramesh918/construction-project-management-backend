# Step 10 — PATCH /projects/:id (Update Project & Status Transitions)

---

## What You Are Doing

Admins update a project's `name`, `status`, `endDate`, `budget`, or `description` (per `UpdateProjectInput`, `shared/types/project.types.ts`). Two things make this route more than a plain `UpdateItem` call:

1. **A dynamic update expression** — only the fields present in the request body should be touched.
2. **Keeping `ProjectCostSummary.budget` in sync** — if `budget` is part of the payload, the cost-summary item's copy of `budget` (Step 2's design decision) must be updated in the same request, or `GET /projects/:id/cost-summary` (Step 11) would silently compute `remaining`/`isOverBudget` against a stale figure.

> ⚠️ **Open design decision, carried over from `promts/tableDetails.md` §3.1:** the README's business rule *"A project cannot be marked Completed if there are pending cost entries"* is **not enforced** in this route. "Pending cost entries" isn't a modeled entity anywhere in the current schema (`ProjectCostSummary` only tracks running totals, not individual pending/approved entries) — `tableDetails.md` itself flags this as unimplemented. Enforcing it would mean inventing a `CostEntry` concept the rest of the system doesn't have. This is called out explicitly in `result.md` as a known gap for a future entity, not silently skipped.

---

## 10.1 Add `PATCH /:id` to `services/projects-service/src/routes/projects.ts`

Add this import:

```typescript
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';
```

(Merge into the existing `@aws-sdk/client-dynamodb` import line from Steps 8–9.)

Add this import too:

```typescript
import { updateProjectSchema } from '../schemas/project.schema';
```

Then append:

```typescript
projectsRoute.patch('/:id', async c => {
  const id = c.req.param('id');
  const parsed = updateProjectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? 'Invalid update payload', 400);
  }

  const updates = { ...parsed.data, updatedAt: new Date().toISOString() };
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setClauses = Object.entries(updates).map(([field, value], i) => {
    names[`#f${i}`] = field;
    values[`:v${i}`] = value;
    return `#f${i} = :v${i}`;
  });

  const result = await dynamoClient.send(
    new UpdateItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: marshall(values),
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    }),
  );

  if (parsed.data.budget !== undefined) {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: dynamoConfig.tableName(),
        Key: marshall(costSummaryKey(id)),
        UpdateExpression: 'SET budget = :budget, updatedAt = :now',
        ExpressionAttributeValues: marshall({
          ':budget': parsed.data.budget,
          ':now': updates.updatedAt,
        }),
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  }

  return ok(c, unmarshall(result.Attributes!) as Project, 'Project updated');
});
```

`#f0`/`:v0`-style placeholder names avoid colliding with any DynamoDB reserved words (`status`, `name`, and even `budget` are not reserved, but `status`/`name` sometimes trip people up in other tables — generating placeholders generically sidesteps needing to remember which fields are safe to use bare).

`ConditionExpression: 'attribute_exists(PK)'` turns "update a project that doesn't exist" into a caught `ConditionalCheckFailedException` instead of DynamoDB silently creating a new, mostly-empty item (`UpdateItem` on a missing key otherwise upserts).

## 10.2 Catch the Not-Found Case

Wrap the first `UpdateItemCommand` call to convert `ConditionalCheckFailedException` into a proper 404:

```typescript
import { AppError } from '../lib/errors';

// inside the route, wrapping the first send() call:
try {
  var result = await dynamoClient.send(/* ...as above... */);
} catch (err: any) {
  if (err.name === 'ConditionalCheckFailedException') {
    throw new AppError(404, 'Project not found');
  }
  throw err;
}
```

(Shown as a diff note rather than a full re-paste — fold this `try/catch` around the existing first `UpdateItemCommand` call from 10.1; avoid `var` in the final file, use `let result` declared before the `try` block instead.)

---

## 10.3 Verify It Compiles

```bash
npm run build
```

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Dynamic `SET` clause built from `Object.entries` | Only fields actually present in the validated body are written — a `PATCH` with just `{ "status": "Active" }` doesn't touch `name`/`budget`/etc. |
| `ConditionExpression: 'attribute_exists(PK)'` | Without this, `UpdateItem` on a non-existent key **creates** a new item with only the updated fields set — silently masking a typo'd project id as a successful update. The condition makes that case fail loudly instead |
| Two sequential `UpdateItem` calls (project, then cost summary) | Same "no transactions" convention as Step 8 — if the second call fails, the project's `budget` and the cost summary's `budget` are briefly inconsistent until the next successful budget update or a manual fix; acceptable per `promts/tableDetails.md` §5 |
| The "pending cost entries" rule is intentionally unenforced | Documented above and in `result.md` — implementing it would require inventing an entity this schema doesn't have; flagging over guessing |

---

## Checkpoints Before Moving to Step 11

- [ ] `PATCH /projects/:id` added — dynamic update expression, `updatedAt` bumped, 404 on missing project via `ConditionExpression`
- [ ] When `budget` is part of the payload, `ProjectCostSummary.budget` is updated in the same request
- [ ] `npm run build` (from repo root) passes with no errors
