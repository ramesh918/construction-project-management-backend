# Step 12 — Document Upload Flow (Blueprints & Government Permits)

---

## What You Are Doing

This is the step that satisfies `promts/ProjectService.md`'s core ask: *"upload the building plan architecture documents as well, all government permission documents as well."* Because file bytes never pass through the Lambda (Step 6), uploading is a **two-call flow**:

1. `POST /projects/:id/documents/upload-url` — client says "I want to upload `blueprint.pdf` as a `blueprint`", server returns a presigned S3 `PUT` URL + the object key it generated.
2. Client `PUT`s the actual file bytes straight to that URL (not through this API at all).
3. `POST /projects/:id/documents/confirm` — client tells the server the upload succeeded, server appends a `ProjectDocument` record to the project.

Step 3 exists because there's no reliable server-side S3 event hook wired up in this stack (no S3 → Lambda trigger is configured in `lib/buildtrack-stack.ts`) — without it, DynamoDB would never learn a file was uploaded.

---

## 12.1 Create `services/projects-service/src/routes/documents.ts`

```typescript
import { Hono } from 'hono';
import { GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoClient, dynamoConfig, projectKey } from '../lib/dynamo';
import { createUploadUrl } from '../lib/s3';
import { requestUploadUrlSchema, confirmUploadSchema } from '../schemas/document.schema';
import { ok, fail } from '../lib/response';
import { AppError } from '../lib/errors';
import type { Project, ProjectDocument } from '../../../../shared/types';

export const documentsRoute = new Hono();

function documentKeyPrefix(projectId: string) {
  return `project-documents/${projectId}/`;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function requireProject(id: string): Promise<Project> {
  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
    }),
  );
  if (!result.Item) {
    throw new AppError(404, 'Project not found');
  }
  return unmarshall(result.Item) as Project;
}

documentsRoute.post('/:id/documents/upload-url', async c => {
  const id = c.req.param('id');
  const parsed = requestUploadUrlSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? 'Invalid upload request', 400);
  }

  await requireProject(id); // 404s if the project doesn't exist

  const { fileName, contentType, category } = parsed.data;
  const key = `${documentKeyPrefix(id)}${uuid()}-${sanitizeFileName(fileName)}`;
  const uploadUrl = await createUploadUrl(key, contentType);

  return ok(c, { uploadUrl, key, category, contentType, fileName });
});

documentsRoute.post('/:id/documents/confirm', async c => {
  const id = c.req.param('id');
  const parsed = confirmUploadSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.message ?? 'Invalid confirm payload', 400);
  }

  const { key, fileName, contentType, category } = parsed.data;

  if (!key.startsWith(documentKeyPrefix(id))) {
    return fail(c, 'Document key does not belong to this project', 400);
  }

  const project = await requireProject(id);
  const document: ProjectDocument = {
    key,
    fileName,
    category,
    contentType,
    uploadedAt: new Date().toISOString(),
  };
  const documents = [...(project.documents ?? []), document];

  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: dynamoConfig.tableName(),
      Key: marshall(projectKey(id)),
      UpdateExpression: 'SET documents = :documents, updatedAt = :now',
      ExpressionAttributeValues: marshall({
        ':documents': documents,
        ':now': document.uploadedAt,
      }),
    }),
  );

  return ok(c, document, 'Document recorded', 201);
});
```

---

## 12.2 Verify It Compiles

```bash
npm run build
```

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `documentKeyPrefix(id)` check in `/confirm` | A client could otherwise pass an arbitrary S3 key from a *different* project's upload URL and have it recorded against this one — checking the key starts with `project-documents/<id>/` is a cheap, meaningful guard against that, not speculative validation |
| Why the S3 key includes a `uuid()` prefix | Two uploads named `blueprint.pdf` for the same project must not collide/overwrite each other in S3 |
| `sanitizeFileName` | Strips characters that are awkward or unsafe in S3 keys / URLs (spaces, `#`, non-ASCII) while keeping the *original* name (unsanitized) stored in `ProjectDocument.fileName` for display purposes |
| Why `/confirm` re-fetches the project instead of just appending blindly | Needed anyway to read the current `documents` array before appending (`SET documents = :documents` replaces the whole list — there's no `list_append` used here because the read-then-write is already required to enforce the key-prefix check) |
| `requireProject()` throwing `AppError` | Both routes need "does this project exist" — factored into one helper reused by Step 13/14 too, rather than repeating the same `GetItemCommand` + 404 check three times |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| Client `PUT`s to the presigned URL and gets `403 SignatureDoesNotMatch` | The `Content-Type` header sent on the actual `PUT` doesn't exactly match the `contentType` used to request the URL | Client must send the identical `Content-Type` header it declared in `POST /upload-url` |
| `PUT` succeeds but `/confirm` returns 400 "Document key does not belong to this project" | Client hardcoded or reused a key from a different project | Always use the exact `key` returned by `/upload-url` for the matching `/confirm` call |
| Presigned URL expired (`403` on `PUT`) | More than 5 minutes passed between requesting the URL and uploading (Step 6's `UPLOAD_URL_TTL_SECONDS`) | Request a fresh upload URL — don't cache/reuse one across sessions |

---

## Checkpoints Before Moving to Step 13

- [ ] `services/projects-service/src/routes/documents.ts` created with `requireProject()`, `POST /:id/documents/upload-url`, `POST /:id/documents/confirm`
- [ ] Confirm route rejects keys outside the project's own `project-documents/<id>/` prefix
- [ ] `npm run build` (from repo root) passes with no errors
