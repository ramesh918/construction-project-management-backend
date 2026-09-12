# BuildTrack — DynamoDB Table Details

This document specifies how the single `buildtrack` DynamoDB table (defined in `buildtrack/lib/buildtrack-stack.ts`) should be used by all six services in `buildtrack/services/`, based on:
- The business domain in the root `README.md` (Projects, Workers, Materials, Daily Progress, Cost Tracking, Dashboard)
- The entity shapes already defined in `buildtrack/shared/types/`
- The table/index design already declared in the stack (single `PK`/`SK` table, plus `GSI1` and `GSI2`)

It is a **data design reference**, not new application code — nothing here has been implemented yet; all six service Lambdas are still stub handlers.

---

## 1. Table Overview

From `lib/buildtrack-stack.ts`:

| Setting | Value |
|---|---|
| Table name | `buildtrack` |
| Partition key | `PK` (String) |
| Sort key | `SK` (String) |
| Billing | Pay-per-request (on-demand) |
| GSI1 | `GSI1PK` / `GSI1SK` — comment in the stack: *"query by project (e.g. all attendance for PROJECT#PRJ001)"* |
| GSI2 | `GSI2PK` / `GSI2SK` — comment in the stack: *"query by date (e.g. all progress logs on 2024-01-15)"* |

**One table holds every entity from every service.** This is a deliberate single-table design (not one table per microservice) — each item's `PK`/`SK` encodes its entity type, so all six services read/write the same physical table but never collide on key space.

The stack's own GSI comments are the key design signal: since the example for GSI1 is *"all attendance for PROJECT#..."* and the example for GSI2 is *"all progress logs on ...date"*, that tells us `AttendanceRecord`'s natural home (`PK`/`SK`) is **not** project-based, and `ProgressLog`'s natural home is **not** date-based — otherwise those GSIs would be redundant with the base table. The design below follows that signal directly.

**`auth-service` does not use this table at all.** Identity/credentials live entirely in Cognito (see `notes/AuthService/`); `authFn` isn't even granted `grantReadWriteData`/`grantReadData` on the table in the stack. Everything in this document applies to `projects-service`, `workers-service`, `materials-service`, `progress-service`, and `dashboard-service` (read-only) only.

---

## 2. Key Design Conventions

| Convention | Meaning |
|---|---|
| `PK` prefix | The entity's own type + id, e.g. `PROJECT#<id>`, `WORKER#<id>`, `MATERIAL#<id>` |
| `SK` prefix | The record type within that entity, e.g. `PROFILE`, `COST#SUMMARY`, `ATTENDANCE#<date>#<projectId>` |
| `GSI1PK` / `GSI1SK` | Only set on items that need to be queried **by project** from a different natural partition — value is `PROJECT#<projectId>` |
| `GSI2PK` / `GSI2SK` | Only set on items that need to be queried **by date** across projects — value is `DATE#<YYYY-MM-DD>` |
| IDs | UUIDs (`uuid` package — already a dependency in every service except `auth-service`), no custom ID scheme needed |
| Sort key prefixing | Every multi-item collection's `SK`/`GSI*SK` starts with a type tag (`ATTENDANCE#`, `PURCHASE#`, `USAGE#`, `PROGRESS#`) so a `begins_with()` query can isolate one item type even when a partition holds more than one |

---

## 3. Entity-by-Entity Reference

### 3.1 Project — owned by `projects-service`

| | |
|---|---|
| `PK` | `PROJECT#<projectId>` |
| `SK` | `PROFILE` |
| GSI | none — a project is always fetched by its own id |
| Source type | `Project` (`shared/types/project.types.ts`) |

```json
{
  "PK": "PROJECT#3f2a1c",
  "SK": "PROFILE",
  "id": "3f2a1c",
  "name": "Riverside Apartments – Phase 1",
  "location": "Bengaluru",
  "startDate": "2026-01-10",
  "endDate": "2026-11-30",
  "budget": 8500000,
  "status": "Active",
  "description": "12-unit residential block",
  "documentKeys": ["project-documents/3f2a1c/blueprint.pdf"],
  "createdAt": "2026-01-05T09:00:00Z",
  "updatedAt": "2026-03-02T14:12:00Z"
}
```

**Major operations:**
- Create: `PutItem` at `PK=PROJECT#<new-id>, SK=PROFILE`
- Get one: `GetItem` at `PK=PROJECT#<id>, SK=PROFILE`
- Update (name/status/endDate/budget/description — per `UpdateProjectInput`): `UpdateItem`, bump `updatedAt`
- List all projects: no single-partition query covers "all projects" — either `Scan` with a filter on `SK=PROFILE` (acceptable at construction-company scale, likely tens–hundreds of projects) or add a sparse `GSI1PK = "PROJECT_LIST"` marker if this becomes a hot path later
- Delete: business rule says *"A project cannot be marked Completed if there are pending cost entries"* — deletion isn't in the type definitions at all; treat projects as non-deletable in v1, `status` transitions only

---

### 3.2 ProjectCostSummary — owned by `projects-service`, written by multiple services

| | |
|---|---|
| `PK` | `PROJECT#<projectId>` |
| `SK` | `COST#SUMMARY` |
| GSI | none |
| Source type | `ProjectCostSummary` (`shared/types/project.types.ts`) |

```json
{
  "PK": "PROJECT#3f2a1c",
  "SK": "COST#SUMMARY",
  "projectId": "3f2a1c",
  "labourCost": 142000,
  "materialCost": 318500,
  "otherCost": 25000,
  "totalCost": 485500,
  "budget": 8500000,
  "remaining": 8014500,
  "isOverBudget": false,
  "updatedAt": "2026-03-02T18:40:00Z"
}
```

**Why this needs its own note:** `labourCost` is driven by `workers-service` (attendance), `materialCost` by `materials-service` (purchases/usage), and `otherCost` is manual — three different Lambdas need to touch one shared item. IAM grants in the stack already allow this (`grantReadWriteData` is table-wide, not item-scoped per service), so the recommended pattern is:

1. Whenever `workers-service` marks attendance as present, it does an atomic increment on this item:
   ```
   UpdateItem PK=PROJECT#<id> SK=COST#SUMMARY
     ADD labourCost :dailyWage
   ```
2. Whenever `materials-service` records a purchase or logs usage tied to a `projectId`, it does the equivalent `ADD materialCost :amount`.
3. `totalCost`, `remaining`, and `isOverBudget` are **not** stored as independently-updated fields — they're recomputed on read (in `projects-service`'s "get project cost summary" handler) as `labourCost + materialCost + otherCost`, `budget - totalCost`, `totalCost > budget`. This avoids needing a transaction across three numeric fields on every write.

---

### 3.3 Worker — owned by `workers-service`

| | |
|---|---|
| `PK` | `WORKER#<workerId>` |
| `SK` | `PROFILE` |
| GSI | none — a worker is a standalone registry entry, not project-scoped |
| Source type | `Worker` (`shared/types/worker.types.ts`) |

```json
{
  "PK": "WORKER#8b91af",
  "SK": "PROFILE",
  "id": "8b91af",
  "name": "Ramesh Kumar",
  "role": "Mason",
  "phone": "+91-9876543210",
  "dailyWage": 900,
  "isActive": true,
  "createdAt": "2026-01-08T07:30:00Z"
}
```

**Major operations:**
- Create / Get / Update (`isActive`, `dailyWage`, etc.): same single-item pattern as `Project`
- List all workers: `Scan` filtered to `SK=PROFILE` (a company's worker registry is small enough that a scan is fine; revisit with a sparse `WORKER_LIST` GSI marker only if this becomes slow)
- No delete — per the business rules, workers are deactivated (`isActive: false`), never removed, since historical attendance records reference `workerId`

---

### 3.4 AttendanceRecord — owned by `workers-service`

| | |
|---|---|
| `PK` | `WORKER#<workerId>` |
| `SK` | `ATTENDANCE#<date>#<projectId>` |
| `GSI1PK` | `PROJECT#<projectId>` |
| `GSI1SK` | `ATTENDANCE#<date>#<workerId>` |
| `GSI2PK` | `DATE#<date>` |
| `GSI2SK` | `ATTENDANCE#<projectId>#<workerId>` |
| Source type | `AttendanceRecord` (`shared/types/worker.types.ts`) |

```json
{
  "PK": "WORKER#8b91af",
  "SK": "ATTENDANCE#2026-03-02#3f2a1c",
  "GSI1PK": "PROJECT#3f2a1c",
  "GSI1SK": "ATTENDANCE#2026-03-02#8b91af",
  "GSI2PK": "DATE#2026-03-02",
  "GSI2SK": "ATTENDANCE#3f2a1c#8b91af",
  "workerId": "8b91af",
  "workerName": "Ramesh Kumar",
  "projectId": "3f2a1c",
  "date": "2026-03-02",
  "present": true,
  "cost": 900,
  "markedBy": "user-supervisor-01",
  "markedAt": "2026-03-02T18:05:00Z"
}
```

This is the item type the stack's own GSI1 comment refers to directly — it's why `AttendanceRecord`'s base `PK` is `WORKER#...` (so "this worker's attendance history" is a cheap base-table query) rather than `PROJECT#...` (which would make the base table redundant with GSI1).

**Major operations:**
- Mark attendance: `PutItem` with all three key sets populated in one write. `cost` is auto-calculated server-side as `present ? worker.dailyWage : 0` (per the business rule *"Labour cost is automatically calculated"*) — never accepted from the client.
- Same write should `ADD labourCost :cost` onto `PROJECT#<projectId> / COST#SUMMARY` (see 3.2).
- One worker's attendance history: `Query PK=WORKER#<id>, SK begins_with "ATTENDANCE#"`
- All attendance for one project (labour cost breakdown, project timeline): `Query GSI1, GSI1PK=PROJECT#<id>, GSI1SK begins_with "ATTENDANCE#"`
- Worker headcount for today, across all projects (Dashboard's *"Worker headcount for today"*): `Query GSI2, GSI2PK=DATE#<today>, GSI2SK begins_with "ATTENDANCE#"`, filter `present=true`

---

### 3.5 Material — owned by `materials-service`

| | |
|---|---|
| `PK` | `MATERIAL#<materialId>` |
| `SK` | `PROFILE` |
| GSI | none for the base record — see the low-stock note below |
| Source type | `Material` (`shared/types/materials.types.ts`) |

```json
{
  "PK": "MATERIAL#c14e02",
  "SK": "PROFILE",
  "id": "c14e02",
  "name": "Cement (OPC 53 Grade)",
  "unit": "bag",
  "currentStock": 340,
  "lowStockThreshold": 100,
  "isLowStock": false,
  "createdAt": "2026-01-05T09:00:00Z"
}
```

**Major operations:**
- Create / Get / Update: single-item pattern
- List all materials (catalogue view): `Scan` filtered to `SK=PROFILE` — material catalogues are small (tens of types), scan is fine
- `currentStock` changes on two events: `+quantity` on a purchase (3.6), `-quantityUsed` on usage (3.7) — both should recompute `isLowStock = currentStock <= lowStockThreshold` in the same update
- **Low-stock alerts for the Dashboard** (*"Low stock material alerts"*): rather than scanning every material on every dashboard load, use a **sparse GSI1** trick — only set `GSI1PK = "LOWSTOCK"`, `GSI1SK = MATERIAL#<id>` on a `Material` item **when `isLowStock` is true**; remove those two attributes entirely (not just clear them) once stock is replenished above threshold. A `Query GSI1PK="LOWSTOCK"` then returns exactly the materials needing a reorder, with no scan and no dead reads for materials that are fine. This reuses GSI1 for a second, unrelated purpose (it's a general-purpose index, not literally restricted to project queries) — a common single-table technique for sparse conditional indexes.

---

### 3.6 MaterialPurchase — owned by `materials-service`

| | |
|---|---|
| `PK` | `MATERIAL#<materialId>` |
| `SK` | `PURCHASE#<date>#<purchaseId>` |
| `GSI1PK` | `PROJECT#<projectId>` *(only set when `projectId` is present — purchases aren't always tied to one project)* |
| `GSI1SK` | `PURCHASE#<date>#<materialId>` |
| `GSI2PK` | `DATE#<date>` |
| `GSI2SK` | `PURCHASE#<materialId>` |
| Source type | `MaterialPurchase` (`shared/types/materials.types.ts`) |

```json
{
  "PK": "MATERIAL#c14e02",
  "SK": "PURCHASE#2026-02-20#a91cd3",
  "GSI1PK": "PROJECT#3f2a1c",
  "GSI1SK": "PURCHASE#2026-02-20#c14e02",
  "GSI2PK": "DATE#2026-02-20",
  "GSI2SK": "PURCHASE#c14e02",
  "id": "a91cd3",
  "materialId": "c14e02",
  "materialName": "Cement (OPC 53 Grade)",
  "quantity": 200,
  "unitPrice": 385,
  "totalCost": 77000,
  "vendor": "Sri Balaji Traders",
  "date": "2026-02-20",
  "billKey": "material-bills/a91cd3.pdf",
  "projectId": "3f2a1c",
  "createdAt": "2026-02-20T11:15:00Z"
}
```

**Major operations:**
- Record purchase: `PutItem` (omit `GSI1PK`/`GSI1SK` entirely if no `projectId` was given — DynamoDB simply won't index an item on `GSI1` if the key attribute is absent); `totalCost` is server-computed as `quantity * unitPrice`, never trusted from the client.
- Same write: `ADD currentStock :quantity` on the `Material` item (3.5), recompute `isLowStock`.
- If `projectId` present: also `ADD materialCost :totalCost` on `PROJECT#<projectId> / COST#SUMMARY` (3.2).
- Purchase history for one material: `Query PK=MATERIAL#<id>, SK begins_with "PURCHASE#"`
- Purchases for one project: `Query GSI1, GSI1PK=PROJECT#<id>, GSI1SK begins_with "PURCHASE#"`
- All purchases on a given date (e.g. monthly expense reporting): `Query GSI2, GSI2PK=DATE#<date>, GSI2SK begins_with "PURCHASE#"`

---

### 3.7 MaterialUsage — owned by `materials-service` (written from `progress-service`'s daily log flow too)

| | |
|---|---|
| `PK` | `MATERIAL#<materialId>` |
| `SK` | `USAGE#<date>#<usageId>` |
| `GSI1PK` | `PROJECT#<projectId>` |
| `GSI1SK` | `USAGE#<date>#<materialId>` |
| `GSI2PK` | `DATE#<date>` |
| `GSI2SK` | `USAGE#<materialId>#<projectId>` |
| Source type | `MaterialUsage` (`shared/types/materials.types.ts`) |

```json
{
  "PK": "MATERIAL#c14e02",
  "SK": "USAGE#2026-03-02#f0219b",
  "GSI1PK": "PROJECT#3f2a1c",
  "GSI1SK": "USAGE#2026-03-02#c14e02",
  "GSI2PK": "DATE#2026-03-02",
  "GSI2SK": "USAGE#c14e02#3f2a1c",
  "id": "f0219b",
  "materialId": "c14e02",
  "materialName": "Cement (OPC 53 Grade)",
  "projectId": "3f2a1c",
  "quantityUsed": 40,
  "date": "2026-03-02",
  "loggedBy": "user-supervisor-01",
  "createdAt": "2026-03-02T18:05:00Z"
}
```

**Major operations:**
- Log usage: `PutItem`, always project-scoped (`projectId` is required here, unlike purchases) → `ADD currentStock :(-quantityUsed)` on the `Material` item, recompute `isLowStock`.
- Usage-per-material history: `Query PK=MATERIAL#<id>, SK begins_with "USAGE#"`
- Usage for one project (material cost breakdown): `Query GSI1, GSI1PK=PROJECT#<id>, GSI1SK begins_with "USAGE#"`
- Usage across all projects on a date: `Query GSI2, GSI2PK=DATE#<date>, GSI2SK begins_with "USAGE#"`
- **Note:** per the README's business flow (*"Site Supervisor logs daily progress → materials used deducted from stock"*), `MaterialUsage` items are typically created as a side effect of submitting a `ProgressLog` (3.8), not as a separate standalone action — `progress-service`'s create-log handler is the one writing these items (and needs `grantReadWriteData`, which it already has), even though the entity conceptually "belongs" to materials.

---

### 3.8 ProgressLog — owned by `progress-service`

| | |
|---|---|
| `PK` | `PROJECT#<projectId>` |
| `SK` | `PROGRESS#<date>` |
| GSI1 | none needed — the base table already answers "this project's timeline" directly |
| `GSI2PK` | `DATE#<date>` |
| `GSI2SK` | `PROGRESS#<projectId>` |
| Source type | `ProgressLog` (`shared/types/progress.types.ts`) |

```json
{
  "PK": "PROJECT#3f2a1c",
  "SK": "PROGRESS#2026-03-02",
  "GSI2PK": "DATE#2026-03-02",
  "GSI2SK": "PROGRESS#3f2a1c",
  "id": "d772e4",
  "projectId": "3f2a1c",
  "date": "2026-03-02",
  "workDone": "Poured foundation for block B, columns 1–6",
  "workersPresent": ["8b91af", "1c5f77"],
  "materialsUsed": [
    { "materialId": "c14e02", "materialName": "Cement (OPC 53 Grade)", "quantity": 40, "unit": "bag" }
  ],
  "photoKeys": ["progress-photos/3f2a1c/2026-03-02-1.jpg"],
  "remarks": "Minor delay due to rain in the afternoon",
  "loggedBy": "user-supervisor-01",
  "createdAt": "2026-03-02T18:10:00Z"
}
```

This is the item type the stack's own GSI2 comment refers to directly — its base `PK`/`SK` is project+date (so *"this project's full timeline"* — `Admin can view full timeline of any project` — is a cheap base-table query), and GSI2 exists specifically so a date can be queried **across every project** at once.

**Major operations:**
- Create log: `PutItem`. For each entry in `materialsUsed`, also write a corresponding `MaterialUsage` item (3.7) and decrement `Material.currentStock` — this is the fan-out described in 3.7's note.
- One project's full timeline: `Query PK=PROJECT#<id>, SK begins_with "PROGRESS#"`
- One specific day for a project: `GetItem PK=PROJECT#<id>, SK=PROGRESS#<date>`
- All progress logs on a given date, across every project (Dashboard-style summary): `Query GSI2, GSI2PK=DATE#<date>, GSI2SK begins_with "PROGRESS#"`

---

### 3.9 Dashboard — `dashboard-service` (read-only, no items of its own)

`dashboard-service` only has `grantReadData` in the stack (no write grant) and owns no entity type. Every metric in the README's Dashboard section is answered by querying the entities above:

| Dashboard metric | How it's answered |
|---|---|
| Total active projects | `Scan` (or sparse GSI, per 3.1) over `Project` items, filter `status="Active"` |
| Overall budget vs. spent, all projects | `GetItem` on each project's `COST#SUMMARY` (3.2) and sum, or maintain a running total item if this gets expensive |
| Worker headcount for today | `Query GSI2, GSI2PK=DATE#<today>, GSI2SK begins_with "ATTENDANCE#"`, count `present=true` (3.4) |
| Low stock material alerts | `Query GSI1, GSI1PK="LOWSTOCK"` (3.5's sparse-index trick) |
| Monthly expense summary | `Query GSI2` across each day in the month, `GSI2SK begins_with "PURCHASE#"`, sum `totalCost` (3.6) — or, if this is too many round trips, a monthly rollup item (`PK=REPORT#<yyyy-mm>`, `SK=EXPENSE#SUMMARY`) maintained incrementally the same way `COST#SUMMARY` is (3.2) is the better long-term answer |

---

## 4. Full Key Pattern Summary

| Entity | Owning Service | `PK` | `SK` | `GSI1PK` | `GSI1SK` | `GSI2PK` | `GSI2SK` |
|---|---|---|---|---|---|---|---|
| Project | projects-service | `PROJECT#<id>` | `PROFILE` | — | — | — | — |
| ProjectCostSummary | projects-service (multi-writer) | `PROJECT#<id>` | `COST#SUMMARY` | — | — | — | — |
| Worker | workers-service | `WORKER#<id>` | `PROFILE` | — | — | — | — |
| AttendanceRecord | workers-service | `WORKER#<id>` | `ATTENDANCE#<date>#<projectId>` | `PROJECT#<projectId>` | `ATTENDANCE#<date>#<workerId>` | `DATE#<date>` | `ATTENDANCE#<projectId>#<workerId>` |
| Material | materials-service | `MATERIAL#<id>` | `PROFILE` | `"LOWSTOCK"` *(sparse — only when low)* | `MATERIAL#<id>` | — | — |
| MaterialPurchase | materials-service | `MATERIAL#<id>` | `PURCHASE#<date>#<purchaseId>` | `PROJECT#<projectId>` *(sparse — only if set)* | `PURCHASE#<date>#<materialId>` | `DATE#<date>` | `PURCHASE#<materialId>` |
| MaterialUsage | materials-service / progress-service | `MATERIAL#<id>` | `USAGE#<date>#<usageId>` | `PROJECT#<projectId>` | `USAGE#<date>#<materialId>` | `DATE#<date>` | `USAGE#<materialId>#<projectId>` |
| ProgressLog | progress-service | `PROJECT#<id>` | `PROGRESS#<date>` | — | — | `DATE#<date>` | `PROGRESS#<projectId>` |

---

## 5. Notes and Open Design Decisions

- **Derived fields are always server-computed, never trusted from request bodies** — `cost` on attendance, `totalCost` on purchases, `isLowStock` on materials, `totalCost`/`remaining`/`isOverBudget` on cost summaries. This matches the README's business rules (*"Labour cost is automatically calculated — no manual entry needed"*, *"Material stock is automatically reduced when usage is logged"*).
- **Cross-entity writes need to happen together** (attendance → cost summary; purchase/usage → material stock + cost summary; progress log → material usage + stock). None of these are modeled as DynamoDB Transactions here — for a single-region, single-table app at this scale, sequential `PutItem`/`UpdateItem` calls are simpler to reason about than `TransactWriteItems`, at the cost of a small window of inconsistency if a Lambda fails mid-sequence. If exact consistency between, say, `Material.currentStock` and a `MaterialUsage` record becomes a real requirement, switch that specific write path to `TransactWriteItems` (max 100 items per transaction, well within what's needed here).
- **Nothing here is implemented yet.** This is a data model to build against — none of the six service Lambdas currently read or write any of these key patterns (they're all stub handlers returning `{ statusCode: 200, body: "ok" }`, per the root `CLAUDE.md`). Implementing `projects-service`, `workers-service`, `materials-service`, and `progress-service` against this design would be the natural next step, the same way `notes/AuthService/` walked through building out `auth-service`.
