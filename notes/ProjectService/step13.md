# Step 13 — GET /projects/:id/documents (List & View/Download)

---

## What You Are Doing

The "view document" half of the requirement. Returns every document attached to a project, each with a freshly-generated presigned `GET` URL the client can open directly (in a new tab for viewing, or via a download attribute/link) — never a bare S3 key, which the client couldn't do anything with directly since the bucket has no public access.

---

## 13.1 Add `GET /:id/documents` to `services/projects-service/src/routes/documents.ts`

Add this import:

```typescript
import { createViewUrl } from '../lib/s3';
```

(Merge into the existing `import { createUploadUrl } from '../lib/s3';` line — becomes `import { createUploadUrl, createViewUrl } from '../lib/s3';`.)

Then append:

```typescript
documentsRoute.get('/:id/documents', async c => {
  const id = c.req.param('id');
  const categoryFilter = c.req.query('category');

  const project = await requireProject(id);
  let documents = project.documents ?? [];

  if (categoryFilter) {
    documents = documents.filter(doc => doc.category === categoryFilter);
  }

  const withUrls = await Promise.all(
    documents.map(async doc => ({
      ...doc,
      viewUrl: await createViewUrl(doc.key),
    })),
  );

  return ok(c, withUrls);
});
```

`?category=blueprint` or `?category=permit` lets a client ask specifically for "the building plans" or "the government permission documents" without fetching everything and filtering client-side — directly matching the two document types called out in `promts/ProjectService.md`.

---

## 13.2 Verify It Compiles

```bash
npm run build
```

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| URLs generated fresh on every list call | Presigned URLs are never stored — storing one would just create a URL that silently stops working after `VIEW_URL_TTL_SECONDS` (15 minutes, Step 6) while looking valid in the database. Generating on read guarantees every URL returned is usable for the next 15 minutes from *now* |
| `Promise.all(documents.map(...))` | Generates all the presigned URLs concurrently rather than one at a time — `getSignedUrl` is a local cryptographic signing operation (no network call), so this is mostly about code clarity, not a real performance concern, but avoids an unnecessary sequential `await` in a loop |
| Route path overlaps with Step 12's `/:id/documents/upload-url` and `/:id/documents/confirm` | No conflict — Hono matches `/:id/documents` (exact, 2 segments after `/projects`) separately from `/:id/documents/upload-url` (3 segments); order of registration among these three routes in the file doesn't matter since none is a prefix-ambiguous pattern of another |

---

## Checkpoints Before Moving to Step 14

- [ ] `GET /projects/:id/documents` added, supports `?category=` filter
- [ ] Each returned document includes a fresh `viewUrl`
- [ ] `npm run build` (from repo root) passes with no errors
