# Step 4 — Request Validation Schemas (Zod)

---

## What You Are Doing

Following `auth-service/src/schemas/auth.schema.ts`'s pattern (one exported `z.object(...)` schema + one exported `z.infer<>` type per input shape), define every request-body shape `projects-service` needs: creating/updating a project, and the two document-upload endpoints from Step 12. Field constraints mirror `CreateProjectInput`/`UpdateProjectInput` (Step 2) and `ProjectDocumentCategory`.

---

## 4.1 Create `services/projects-service/src/schemas/project.schema.ts`

```typescript
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date format YYYY-MM-DD');

export const createProjectSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  budget: z.number().positive(),
  description: z.string().optional(),
});
export type CreateProjectBody = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.enum(['Planning', 'Active', 'On Hold', 'Completed']).optional(),
    endDate: isoDate.optional(),
    budget: z.number().positive().optional(),
    description: z.string().optional(),
  })
  .refine(body => Object.keys(body).length > 0, { message: 'At least one field is required' });
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;
```

## 4.2 Create `services/projects-service/src/schemas/document.schema.ts`

```typescript
import { z } from 'zod';

const documentCategory = z.enum(['blueprint', 'permit', 'contract', 'other']);

export const requestUploadUrlSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  category: documentCategory,
});
export type RequestUploadUrlBody = z.infer<typeof requestUploadUrlSchema>;

export const confirmUploadSchema = z.object({
  key: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  category: documentCategory,
});
export type ConfirmUploadBody = z.infer<typeof confirmUploadSchema>;
```

Two separate schema files (`project.schema.ts` / `document.schema.ts`) rather than one, since Step 12–14's document routes are a distinct concern from Steps 8–10's project CRUD — matches keeping `auth.schema.ts` scoped to exactly what `auth-service`'s routes need.

---

## 4.3 Verify It Compiles

```bash
npm run build
```

Nothing imports these schemas yet — expect a clean compile.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| `isoDate` regex vs. `z.string().date()` | Zod's built-in `.date()` validator (Zod 3.20+) would also work, but a plain regex avoids depending on the exact minor version pinned by `"zod": "^3.0.0"` |
| `.refine()` on `updateProjectSchema` | Rejects an empty PATCH body (`{}`) at the validation layer before it ever reaches DynamoDB — an empty `UpdateExpression` is also a DynamoDB error, but failing fast with a clear 400 is more useful to the caller |
| Why upload and confirm are separate schemas | They're genuinely different payloads: `requestUploadUrlSchema` doesn't include a `key` (the server generates it), `confirmUploadSchema` requires the `key` the client got back from the first call |

---

## Checkpoints Before Moving to Step 5

- [ ] `services/projects-service/src/schemas/project.schema.ts` created (`createProjectSchema`, `updateProjectSchema`)
- [ ] `services/projects-service/src/schemas/document.schema.ts` created (`requestUploadUrlSchema`, `confirmUploadSchema`)
- [ ] `npm run build` (from repo root) passes with no errors
