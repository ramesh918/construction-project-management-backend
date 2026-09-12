# Step 14 — DELETE /projects/:id/documents/:key (Delete a Document) + CDK Stack Change

---

## What You Are Doing

Rounds out "all kinds of file operations" from `promts/ProjectService.md` with delete. This is the one step in the whole build-out that **also requires a change outside `services/projects-service`** — `lib/buildtrack-stack.ts` currently grants `ProjectsFn` only `bucket.grantPut(projectsFn)` and `bucket.grantRead(projectsFn)` (see the "S3 grants" section of the stack). Neither includes `s3:DeleteObject`. Without the stack change below, this route compiles fine but fails at runtime with `AccessDenied`.

S3 keys contain `/` (e.g. `project-documents/<id>/<uuid>-<file>.pdf`), so the route path needs a way to capture a multi-segment path parameter — Hono's regex param syntax (`:key{.+}`) handles that.

---

## 14.1 Update `lib/buildtrack-stack.ts`

In the "S3 grants" section, alongside the existing `grantPut`/`grantRead` lines for `projectsFn`:

```typescript
bucket.grantDelete(projectsFn); // Delete project documents (blueprints, permits) the admin removes
```

Run `cdk diff` after this change (Step 16) before deploying — it should show exactly one new IAM statement added to `ProjectsFn`'s role, nothing else.

---

## 14.2 Add `DELETE /:id/documents/:key{.+}` to `services/projects-service/src/routes/documents.ts`

Add this import:

```typescript
import { deleteObject } from '../lib/s3';
```

(Merge into the existing `import { createUploadUrl, createViewUrl } from '../lib/s3';` line.)

Then append:

```typescript
documentsRoute.delete('/:id/documents/:key{.+}', async c => {
  const id = c.req.param('id');
  const key = c.req.param('key');

  if (!key.startsWith(documentKeyPrefix(id))) {
    return fail(c, 'Document key does not belong to this project', 400);
  }

  const project = await requireProject(id);
  const documents = project.documents ?? [];
  const remaining = documents.filter(doc => doc.key !== key);

  if (remaining.length === documents.length) {
    return fail(c, 'Document not found on this project', 404);
  }

  await deleteObject(key);

  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
      UpdateExpression: 'SET documents = :documents, updatedAt = :now',
      ExpressionAttributeValues: marshall({
        ':documents': remaining,
        ':now': new Date().toISOString(),
      }),
    }),
  );

  return ok(c, null, 'Document deleted');
});
```

S3 delete happens **before** the DynamoDB update: if the DynamoDB write failed after a successful S3 delete, the record would be an orphaned reference to a now-missing file — annoying but self-evident (a broken `viewUrl` on next list). Doing it in the other order (DynamoDB first) risks the opposite: a "deleted" document whose file is still sitting in S3 forever, silently costing storage with no record pointing at it. The chosen order fails toward the safer, more visible failure mode.

---

## 14.3 Verify It Compiles

```bash
npm run build
```

## 14.4 Verify the Stack Change

```bash
npm run synth
npm run diff
```

`diff` should show a new `s3:DeleteObject*` (and related, e.g. `s3:DeleteObjectTagging`) statement added to the `ProjectsFn` role's policy — nothing else in the stack should change.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `:key{.+}` | Hono's regex-constrained path parameter syntax — `.+` matches one or more of *any* character including `/`, letting a single param capture a full S3 key like `project-documents/abc/uuid-file.pdf` instead of stopping at the first `/` |
| `bucket.grantDelete(projectsFn)` | CDK shorthand that adds an IAM policy statement for `s3:DeleteObject` (and a couple of related delete-marker actions) scoped to this bucket, mirroring how `grantPut`/`grantRead` already work for the same Lambda |
| Delete-from-S3-then-update-DynamoDB ordering | A deliberate choice about which failure mode is safer — see the paragraph above the code |
| Same key-prefix check as Steps 12/13 | Prevents a caller from passing a key belonging to a different project's documents and having it deleted from S3 under this project's authorization check |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `AccessDenied` calling `deleteObject()` | Step 14.1's `bucket.grantDelete(projectsFn)` wasn't added, or wasn't deployed yet | Add the grant, then `cdk deploy` (not just `synth`) — IAM changes only take effect once deployed |
| `404 Document not found on this project` even though the key looks right | Trailing/leading whitespace or URL-encoding mismatch between the key returned by `GET /:id/documents` and the one sent back in the delete path | Always delete using the exact `key` string as returned by the list endpoint, URL-encoded correctly by the HTTP client for the path segment |

---

## Checkpoints Before Moving to Step 15

- [ ] `lib/buildtrack-stack.ts` — `bucket.grantDelete(projectsFn)` added
- [ ] `services/projects-service/src/routes/documents.ts` — `DELETE /:id/documents/:key{.+}` added
- [ ] `npm run build` passes; `npm run synth` succeeds; `npm run diff` shows only the new S3 delete permission
