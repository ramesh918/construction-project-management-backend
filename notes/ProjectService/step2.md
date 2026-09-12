# Step 2 — Shared Project Types: Review & Extend for Documents

---

## What You Are Doing

`shared/types/project.types.ts` already exists with `Project`, `ProjectCostSummary`, `CreateProjectInput`, `UpdateProjectInput` (see `promts/tableDetails.md` §3.1–3.2 for the DynamoDB shape these map to). Two gaps need closing before routes can be written:

1. **Documents need metadata, not just a key.** The brief (`promts/ProjectService.md`) requires uploading *two distinct kinds* of files — building-plan/architecture documents and government permission documents — and viewing them later. The current `documentKeys?: string[]` is a flat list of S3 keys with no category, no original filename (needed to show a sensible name in a UI or `Content-Disposition` on download), and no content type (needed to set the correct header on presigned GET/PUT). This step replaces it with a typed `ProjectDocument[]`.
2. **`ProjectCostSummary` has no `updatedAt`.** `promts/tableDetails.md`'s own example JSON for `COST#SUMMARY` includes `updatedAt`, but the interface doesn't declare it. Step 11 (cost summary route) needs it to report when the underlying labour/material/other costs last changed.

This is a types-only step — no service code yet.

---

## 2.1 Edit `shared/types/project.types.ts`

Replace the file with:

```typescript
export type ProjectStatus = 'Planning' | 'Active' | 'On Hold' | 'Completed';

export type ProjectDocumentCategory = 'blueprint' | 'permit' | 'contract' | 'other';

export interface ProjectDocument {
  key: string; // S3 object key, e.g. project-documents/<projectId>/<uuid>-<fileName>
  fileName: string; // original file name supplied by the uploader
  category: ProjectDocumentCategory;
  contentType: string;
  uploadedAt: string;
}

export interface Project {
  id: string;
  name: string;
  location: string;
  startDate: string; // ISO date string YYYY-MM-DD
  endDate: string;
  budget: number; // in rupees/dollars
  status: ProjectStatus;
  description?: string;
  documents?: ProjectDocument[]; // blueprints, contracts, government permits
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCostSummary {
  projectId: string;
  labourCost: number;
  materialCost: number;
  otherCost: number;
  totalCost: number;
  budget: number;
  remaining: number;
  isOverBudget: boolean;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  budget: number;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  status?: ProjectStatus;
  endDate?: string;
  budget?: number;
  description?: string;
}
```

**What changed vs. the original file:**
- Added `ProjectDocumentCategory` and `ProjectDocument`.
- `Project.documentKeys?: string[]` → `Project.documents?: ProjectDocument[]`.
- Added `updatedAt: string` to `ProjectCostSummary`.
- `CreateProjectInput`/`UpdateProjectInput` are unchanged — documents are managed through their own endpoints (Steps 12–14), never through the create/update-project payload.

> ⚠️ `workers-service` and `materials-service` (when built) read `ProjectCostSummary` for their `ADD labourCost`/`ADD materialCost` writes per `promts/tableDetails.md` §3.2. Adding `updatedAt` is additive and doesn't break those call sites, but if either of those services is already partially built, double check they don't destructure this type in a way that assumes an exact field set (e.g. `Object.keys(costSummary).length`).

---

## 2.2 Confirm the Barrel Export Still Works

`shared/types/index.ts` already does `export * from './project.types';` (alongside `common.types`, `worker.types`, `materials.types`, `progress.types`, `auth.types`) — no change needed there.

---

## 2.3 Verify It Compiles

```bash
npm run build
```

Since `auth-service` doesn't import anything from `project.types.ts`, this change is isolated to `projects-service` (built in later steps) and whichever other services eventually reference `Project`/`ProjectCostSummary`.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Why a typed `ProjectDocument[]` instead of `string[]` | A bare S3 key can't tell the frontend whether a file is a blueprint or a government permit, what to name it in a download, or what MIME type to request it as — all needed for the "view document" requirement in `promts/ProjectService.md` |
| Why category is a closed union (`'blueprint' \| 'permit' \| 'contract' \| 'other'`) | Matches Zod's `z.enum(...)` validation in Step 4 one-to-one — an open `string` would let the client write arbitrary categories into stored data |
| Why `ProjectCostSummary.budget` is duplicated from `Project.budget` | Per `promts/tableDetails.md` §3.2, `totalCost`/`remaining`/`isOverBudget` are recomputed on read from stored `labourCost + materialCost + otherCost` against `budget` — keeping a copy on the cost-summary item avoids a second `GetItem` on every recompute. Step 10 (update route) is responsible for keeping it in sync when a project's budget changes |

---

## Checkpoints Before Moving to Step 3

- [ ] `shared/types/project.types.ts` updated with `ProjectDocumentCategory`, `ProjectDocument`, `Project.documents`, `ProjectCostSummary.updatedAt`
- [ ] `npm run build` (from repo root) passes with no errors
