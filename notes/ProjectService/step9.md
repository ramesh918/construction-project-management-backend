# Step 9 — GET /projects & GET /projects/:id (List & Get)

---

## What You Are Doing

Add the two read routes to the same `projects.ts` file started in Step 8: fetching a single project by id, and listing all projects with optional status filtering and pagination. Per `promts/tableDetails.md` §3.1, there is no single-partition query that returns "all projects" — a `Scan` filtered to `SK=PROFILE` is the documented approach at construction-company scale (tens–hundreds of projects).

---

## 9.1 Add `GET /:id` to `services/projects-service/src/routes/projects.ts`

Add these imports alongside the existing ones:

```typescript
import { GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { PaginatedResponse } from '../../../../shared/types';
```

(Replace the single `PutItemCommand` import with `PutItemCommand, GetItemCommand, ScanCommand` from `@aws-sdk/client-dynamodb`, and add `unmarshall` next to the existing `marshall` import from `@aws-sdk/util-dynamodb`.)

Then append:

```typescript
projectsRoute.get('/:id', async c => {
  const id = c.req.param('id');

  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
    }),
  );

  if (!result.Item) {
    return fail(c, 'Project not found', 404);
  }

  return ok(c, unmarshall(result.Item) as Project);
});
```

## 9.2 Add `GET /` (List) to the Same File

```typescript
projectsRoute.get('/', async c => {
  const statusFilter = c.req.query('status');
  const limit = Number(c.req.query('limit') ?? 20);
  const cursor = c.req.query('cursor');
  const exclusiveStartKey = cursor
    ? (JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as Record<string, unknown>)
    : undefined;

  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: dynamoConfig.tableName(),
      FilterExpression: statusFilter ? 'SK = :sk AND #status = :status' : 'SK = :sk',
      ExpressionAttributeNames: statusFilter ? { '#status': 'status' } : undefined,
      ExpressionAttributeValues: marshall(
        statusFilter ? { ':sk': 'PROFILE', ':status': statusFilter } : { ':sk': 'PROFILE' },
      ),
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey as never,
    }),
  );

  const projects = (result.Items ?? []).map(item => unmarshall(item) as Project);
  const lastEvaluatedKey = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  const body: PaginatedResponse<Project> = {
    success: true,
    data: projects,
    count: projects.length,
    lastEvaluatedKey,
  };
  return c.json(body);
});
```

> ⚠️ Route registration order matters here: `GET /:id` must be registered **before** `GET /` only if `/` were a prefix match — it isn't (Hono matches `/` and `/:id` as distinct exact patterns), so either order works. They're shown in this order (`:id` then list) only because Step 8 already put `POST /` first in the file.

---

## 9.3 Verify It Compiles

```bash
npm run build
```

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `Scan` + `FilterExpression: 'SK = :sk'` | Filters happen **after** DynamoDB reads every item in the table (not free, but acceptable at this scale per `promts/tableDetails.md` §3.1) — this is why a sparse `GSI1PK = "PROJECT_LIST"` marker is called out there as a future optimization if the table grows large |
| Base64-encoded `cursor` / `lastEvaluatedKey` | `PaginatedResponse.lastEvaluatedKey` (shared type) is declared as a plain `string`, not DynamoDB's native `Record<string, AttributeValue>` — base64-encoding the JSON-stringified key lets the client pass it back as an opaque, URL-safe query string value without knowing anything about DynamoDB's key format |
| Why list doesn't use `ok()` | `ok()` (Step 3) only builds `ApiResponse<T>` (no `count`/`lastEvaluatedKey` fields) — list responses build a `PaginatedResponse<T>` object directly and return it with `c.json(body)` |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `TS2345: Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'Record<string, AttributeValue> \| undefined'` | `ExclusiveStartKey` from a decoded cursor is untyped JSON, not a real `AttributeValue` map | The `as never` cast in `9.2` sidesteps this — it's a deliberate escape hatch because the cursor's shape genuinely does come from a prior `LastEvaluatedKey` and is safe to round-trip, but TypeScript can't verify that across a JSON round-trip |
| `ValidationException: The provided starting key is invalid` | A cursor was tampered with or is from a different query shape (e.g. a filtered vs. unfiltered list) | Treat this as a client error — validate the cursor's presence but don't try to deeply validate its contents; a malformed cursor is expected to just fail the `Scan` call, caught by the centralized error handler (Step 15) |

---

## Checkpoints Before Moving to Step 10

- [ ] `GET /projects/:id` added — 404 via `AppError`/`fail()` when not found
- [ ] `GET /projects` added — supports `?status=`, `?limit=`, `?cursor=` query params, returns a `PaginatedResponse<Project>`
- [ ] `npm run build` (from repo root) passes with no errors
