# Step 6 — S3 Client, Config & Presigned URL Helpers

---

## What You Are Doing

Per the README's business rule *"All file uploads go directly to S3 — never stored on the server"* and `promts/ProjectService.md`'s requirement to upload/view blueprints and government permission documents, this service never proxies file bytes through the Lambda. Instead it hands out **presigned URLs**: a presigned `PUT` URL the client uploads directly to, and a presigned `GET` URL the client (or a browser `<a>`/`<img>`) reads directly from. This step builds the one shared helper module three later route steps (12, 13, 14) call into.

---

## 6.1 Create `services/projects-service/src/lib/s3.ts`

```typescript
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const s3Config = {
  bucketName: () => requireEnv('BUCKET_NAME'),
};

export const s3Client = new S3Client({});

const UPLOAD_URL_TTL_SECONDS = 300; // 5 minutes — client must PUT the file within this window
const VIEW_URL_TTL_SECONDS = 900; // 15 minutes — enough to view/download in a browser tab

export function createUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: s3Config.bucketName(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export function createViewUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: s3Config.bucketName(),
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: VIEW_URL_TTL_SECONDS });
}

export function deleteObject(key: string) {
  return s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Config.bucketName(),
      Key: key,
    }),
  );
}
```

`BUCKET_NAME` is already injected via `sharedEnv` in `lib/buildtrack-stack.ts` — no stack change needed for this step (Step 14 does need one, for delete permissions).

---

## 6.2 Verify It Compiles

```bash
npm run build
```

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Presigned `PUT` URL | A time-limited, signed URL that lets the client upload a specific object key directly to S3 with the Lambda's IAM permissions, without the file body ever passing through API Gateway/Lambda (which also avoids the 10 MB Lambda payload / 10 MB API Gateway REST payload limits for large blueprint PDFs) |
| Presigned `GET` URL | Same idea for reading — the "view/download document" requirement is satisfied by handing the client a signed link, not by streaming bytes back through the Lambda |
| Why `ContentType` is baked into the presigned `PUT` | S3 enforces that the client's actual `PUT` request sends the exact same `Content-Type` header used to sign the URL — this stops a client from uploading, say, an executable while claiming to sign a PDF, and ensures the object is served back with the right `Content-Type` on download |
| `deleteObject` needs a permission this Lambda doesn't have yet | `lib/buildtrack-stack.ts` currently only grants `bucket.grantPut(projectsFn)` / `bucket.grantRead(projectsFn)` — no delete. Calling `deleteObject()` before Step 14's stack change will fail at runtime with `AccessDenied`, even though it compiles fine |

---

## Checkpoints Before Moving to Step 7

- [ ] `services/projects-service/src/lib/s3.ts` created with `s3Client`, `s3Config.bucketName()`, `createUploadUrl()`, `createViewUrl()`, `deleteObject()`
- [ ] `npm run build` (from repo root) passes with no errors
