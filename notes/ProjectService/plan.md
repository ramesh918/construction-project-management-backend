# ProjectService — API Plan (Request / Response Reference)

This documents the actual, implemented contract of every `projects-service` endpoint (built per `step1.md`–`step15.md`; tracked in `result.md`). It's the reference to hand a frontend/API consumer, or to write a Postman collection or automated tests against.

**Base path:** `/projects` (mounted behind API Gateway's `v1` stage, e.g. `https://<api-id>.execute-api.<region>.amazonaws.com/v1/projects/...`)

**Auth:** Every route except `GET /projects/health` requires:

1. `Authorization: Bearer <Cognito access token>` — enforced by API Gateway's Cognito authorizer (a missing/invalid/expired token never reaches this Lambda at all; API Gateway itself returns its own `401`/`403` before invocation).
2. Membership in the `admin` Cognito group — enforced by `requireAdmin` middleware in this service (`src/lib/admin.ts`). A valid, non-admin token gets a `403` from **this service**, distinct from API Gateway's own auth rejection.

**Envelope:** Every response (success or failure) is `shared/types/common.types.ts`'s `ApiResponse<T>`:

```ts
{ success: boolean; data?: T; error?: string; message?: string }
```

List endpoints use `PaginatedResponse<T>` instead, which adds `count` and `lastEvaluatedKey`.

---

## Cross-Cutting Failure Cases (Apply to Every Route Below Unless Noted)

These are shown once here rather than repeated on each endpoint.

| Case                                                    | Where It's Caught                                                    | Status  | Body                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| No`Authorization` header, or an invalid/expired token | API Gateway (Cognito authorizer) — request never reaches the Lambda | `401` | API Gateway's own default`{"message":"Unauthorized"}` — not this service's `ApiResponse` shape   |
| Valid token, but user is not in the`admin` group      | `requireAdmin` middleware                                          | `403` | `{"success":false,"error":"Admin access required"}`                                                 |
| Route/method doesn't exist under`/projects`           | `app.notFound`                                                     | `404` | `{"success":false,"error":"Not found"}`                                                             |
| Any unexpected/unhandled exception                      | `app.onError`                                                      | `500` | `{"success":false,"error":"Internal server error"}` (details go to CloudWatch, never to the client) |

---

## 1. `GET /projects/health`

Liveness probe. **No admin check** (registered before `requireAdmin` — see `step7.md`/`step15.md`). Still requires a valid Cognito token, since API Gateway's authorizer gates the whole `/projects` proxy resource.

**Request:** no body, no params.

**Success — `200`**

```json
{ "status": "ok" }
```

(Not wrapped in `ApiResponse` — this one endpoint is a raw liveness check, matching `auth-service`'s `/auth/health`.)

**Failure cases:** none beyond the cross-cutting `401` (missing/bad token).

---

## 2. `POST /projects` — Create Project

**Request body** (`application/json`, validated by `createProjectSchema`):

```json
{
  "name": "Riverside Apartments",
  "location": "Bengaluru",
  "startDate": "2026-01-10",
  "endDate": "2026-11-30",
  "budget": 8500000,
  "description": "12-unit residential block"
}
```

`description` is optional. `name`, `location` must be non-empty. `startDate`/`endDate` must match `YYYY-MM-DD`. `budget` must be a positive number.

**Success — `201`**

```json
{
  "success": true,
  "message": "Project created",
  "data": {
    "id": "3f2a1c9e-...",
    "name": "Riverside Apartments",
    "location": "Bengaluru",
    "startDate": "2026-01-10",
    "endDate": "2026-11-30",
    "budget": 8500000,
    "description": "12-unit residential block",
    "status": "Planning",
    "documents": [],
    "createdAt": "2026-09-12T10:00:00.000Z",
    "updatedAt": "2026-09-12T10:00:00.000Z"
  }
}
```

`status` is always server-set to `"Planning"` — it's not accepted in the request body. A matching all-zero `ProjectCostSummary` item is created in the same call (see §4).

**Failure — `400` (validation)**
Body missing, not JSON, or failing any `createProjectSchema` rule:

```json
{ "success": false, "error": "budget: Number must be greater than 0" }
```

(`error` is the first Zod issue's message — exact text varies by which field failed, e.g. `"name: Required"`, `"startDate: Expected date format YYYY-MM-DD"`.)

**Other failures:** cross-cutting `401`/`403`/`500` only — there's no "duplicate project" concept (id is server-generated, always unique).

---

## 3. `GET /projects` — List Projects

**Query params (all optional):**

| Param      | Type                                        | Effect                                                                |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `status` | `Planning \| Active \| On Hold \| Completed` | Filter to one status                                                  |
| `limit`  | number, default`20`                       | Max items per page                                                    |
| `cursor` | base64 string                               | Pass the previous response's`lastEvaluatedKey` to get the next page |

**Request:** `GET /projects?status=Active&limit=10`

**Success — `200`**

```json
{
  "success": true,
  "count": 2,
  "data": [
    { "id": "3f2a1c9e-...", "name": "Riverside Apartments", "status": "Active", "...": "..." },
    { "id": "9b7e21aa-...", "name": "Tower B", "status": "Active", "...": "..." }
  ],
  "lastEvaluatedKey": "eyJQSyI6eyJTIjoiUFJPSkVDVCM5YjdlMjFhYSJ9fQ=="
}
```

`lastEvaluatedKey` is omitted (`undefined`, dropped from the JSON) when there are no more pages.

**Empty result — `200`** (not a failure — an empty list is a valid, successful response):

```json
{ "success": true, "count": 0, "data": [] }
```

**Failure — `400`-class:** none — an unrecognized `status` value simply matches nothing (Dynamo filter returns zero items, not an error); a non-numeric `limit` becomes `NaN` and DynamoDB's `Limit` param would then error — see the note below.

**Failure — `500`** (malformed `limit` or a tampered/invalid `cursor`):

```json
{ "success": false, "error": "Internal server error" }
```

A `cursor` that doesn't decode to valid JSON, or whose shape doesn't match `ExclusiveStartKey`, throws inside the AWS SDK call (`ValidationException`) and falls through to the generic handler — not validated as a distinct 400 case in the current implementation (see `result.md`'s Known Gaps if this needs a friendlier 400 later).

---

## 4. `GET /projects/:id` — Get One Project

**Request:** `GET /projects/3f2a1c9e-...`, no body.

**Success — `200`**

```json
{
  "success": true,
  "data": {
    "id": "3f2a1c9e-...",
    "name": "Riverside Apartments",
    "location": "Bengaluru",
    "startDate": "2026-01-10",
    "endDate": "2026-11-30",
    "budget": 8500000,
    "status": "Planning",
    "description": "12-unit residential block",
    "documents": [],
    "createdAt": "2026-09-12T10:00:00.000Z",
    "updatedAt": "2026-09-12T10:00:00.000Z"
  }
}
```

**Failure — `404`**

```json
{ "success": false, "error": "Project not found" }
```

Returned for any `:id` with no matching `PROJECT#<id>/PROFILE` item — a genuinely missing id and a malformed/non-UUID id are indistinguishable (both just miss in DynamoDB) and both get this same `404`.

---

## 5. `PATCH /projects/:id` — Update Project

**Request body** (validated by `updateProjectSchema` — all fields optional, but at least one required):

```json
{ "status": "Active" }
```

or

```json
{ "budget": 9000000, "endDate": "2026-12-15" }
```

Allowed fields: `name`, `status` (`Planning|Active|On Hold|Completed`), `endDate`, `budget`, `description`. Anything else in the body is silently ignored by Zod (not an error) unless it's the *only* content and the object is otherwise empty.

**Success — `200`**

```json
{
  "success": true,
  "message": "Project updated",
  "data": {
    "id": "3f2a1c9e-...",
    "name": "Riverside Apartments",
    "status": "Active",
    "budget": 8500000,
    "updatedAt": "2026-09-12T11:30:00.000Z",
    "...": "...rest of the Project fields, unchanged fields included..."
  }
}
```

If `budget` was part of the request, `ProjectCostSummary.budget` is updated in the same call (a second, invisible-to-the-caller `UpdateItem`) — see §6.

**Failure — `400` (empty body)**

```json
{ "success": false, "error": "At least one field is required" }
```

**Failure — `400` (bad field value)**, e.g. `{"status":"Cancelled"}` (not a valid enum value):

```json
{ "success": false, "error": "status: Invalid enum value. Expected 'Planning' | 'Active' | 'On Hold' | 'Completed', received 'Cancelled'" }
```

**Failure — `404`**

```json
{ "success": false, "error": "Project not found" }
```

Returned when `:id` doesn't exist — enforced via a DynamoDB `ConditionExpression` (`attribute_exists(PK)`) so a typo'd id can never silently create a new, near-empty item.

> **Not enforced (documented gap):** the business rule *"a project cannot be marked Completed if there are pending cost entries"* has no matching check here — no `CostEntry` entity exists in the schema. See `result.md`'s Known Gaps.

---

## 6. `GET /projects/:id/cost-summary` — Cost Summary

**Request:** `GET /projects/3f2a1c9e-.../cost-summary`, no body.

**Success — `200`**

```json
{
  "success": true,
  "data": {
    "projectId": "3f2a1c9e-...",
    "labourCost": 142000,
    "materialCost": 318500,
    "otherCost": 25000,
    "totalCost": 485500,
    "budget": 8500000,
    "remaining": 8014500,
    "isOverBudget": false,
    "updatedAt": "2026-09-12T09:00:00.000Z"
  }
}
```

`totalCost`, `remaining`, `isOverBudget` are recomputed on every call from the stored `labourCost`/`materialCost`/`otherCost`/`budget` — never trusted from a stale stored value (see `step11.md`).

**Failure — `404`**

```json
{ "success": false, "error": "Cost summary not found for this project" }
```

Should only occur if the project's own `PutItem` (in `POST /projects`) succeeded but the paired cost-summary `PutItem` failed — an edge case the route degrades into a clean 404 for, rather than crashing on `undefined.labourCost`.

---

## 7. `POST /projects/:id/documents/upload-url` — Request a Presigned Upload URL

First half of the upload flow (§7 → client `PUT`s to S3 directly → §8 confirms).

**Request body** (validated by `requestUploadUrlSchema`):

```json
{
  "fileName": "tower-a-blueprint.pdf",
  "contentType": "application/pdf",
  "category": "blueprint"
}
```

`category` must be one of `blueprint | permit | contract | other`.

**Success — `200`**

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://buildtrack-files-333888905517.s3.us-east-1.amazonaws.com/project-documents/3f2a1c9e-.../8b1e...-tower-a-blueprint.pdf?X-Amz-Algorithm=...",
    "key": "project-documents/3f2a1c9e-.../8b1e2f00-tower-a-blueprint.pdf",
    "category": "blueprint",
    "contentType": "application/pdf",
    "fileName": "tower-a-blueprint.pdf"
  }
}
```

`uploadUrl` expires in 5 minutes (`UPLOAD_URL_TTL_SECONDS` in `lib/s3.ts`). The client must `PUT` the file to `uploadUrl` with an identical `Content-Type` header, then call §8.

**Failure — `400` (validation)**

```json
{ "success": false, "error": "category: Invalid enum value. Expected 'blueprint' | 'permit' | 'contract' | 'other', received 'drawing'" }
```

**Failure — `404`**

```json
{ "success": false, "error": "Project not found" }
```

Checked via `requireProject()` before generating a URL — you can't get an upload URL for a project that doesn't exist.

---

## 8. `POST /projects/:id/documents/confirm` — Confirm a Completed Upload

**Request body** (validated by `confirmUploadSchema` — `key` must be the exact value returned by §7):

```json
{
  "key": "project-documents/3f2a1c9e-.../8b1e2f00-tower-a-blueprint.pdf",
  "fileName": "tower-a-blueprint.pdf",
  "contentType": "application/pdf",
  "category": "blueprint"
}
```

**Success — `201`**

```json
{
  "success": true,
  "message": "Document recorded",
  "data": {
    "key": "project-documents/3f2a1c9e-.../8b1e2f00-tower-a-blueprint.pdf",
    "fileName": "tower-a-blueprint.pdf",
    "category": "blueprint",
    "contentType": "application/pdf",
    "uploadedAt": "2026-09-12T12:00:00.000Z"
  }
}
```

The project's `documents[]` array now includes this entry; `Project.updatedAt` is also bumped.

**Failure — `400` (validation)** — missing/wrong-typed field, same shape as other Zod failures above.

**Failure — `400` (key doesn't belong to this project)**

```json
{ "success": false, "error": "Document key does not belong to this project" }
```

Returned if `key` doesn't start with `project-documents/<id>/` — blocks a client from confirming a key copied from a different project's upload response.

**Failure — `404`**

```json
{ "success": false, "error": "Project not found" }
```

---

## 9. `GET /projects/:id/documents` — List Documents (View/Download)

**Query params (optional):** `?category=blueprint` (or `permit`/`contract`/`other`) filters the list.

**Request:** `GET /projects/3f2a1c9e-.../documents?category=permit`

**Success — `200`**

```json
{
  "success": true,
  "data": [
    {
      "key": "project-documents/3f2a1c9e-.../c9a0...-noc-fire-dept.pdf",
      "fileName": "noc-fire-dept.pdf",
      "category": "permit",
      "contentType": "application/pdf",
      "uploadedAt": "2026-09-12T12:05:00.000Z",
      "viewUrl": "https://buildtrack-files-333888905517.s3.us-east-1.amazonaws.com/project-documents/3f2a1c9e-.../c9a0...-noc-fire-dept.pdf?X-Amz-Algorithm=..."
    }
  ]
}
```

Every item gets a freshly-generated `viewUrl`, expiring in 15 minutes (`VIEW_URL_TTL_SECONDS`) — never a stored/stale URL.

**Empty result — `200`** (no documents yet, or none matching `?category=`):

```json
{ "success": true, "data": [] }
```

**Failure — `404`**

```json
{ "success": false, "error": "Project not found" }
```

---

## 10. `DELETE /projects/:id/documents/:key` — Delete a Document

`:key` is the full S3 key (contains `/`), e.g.:
`DELETE /projects/3f2a1c9e-.../documents/project-documents%2F3f2a1c9e-...%2Fc9a0...-noc-fire-dept.pdf`
(URL-encode the key's `/` characters when building the request path — Hono's `:key{.+}` pattern decodes it back to the literal key.)

**Request:** no body.

**Success — `200`**

```json
{ "success": true, "message": "Document deleted", "data": null }
```

The file is removed from S3 (`s3:DeleteObject`, granted in Step 14's stack change) and the entry is removed from the project's `documents[]` array in the same call.

**Failure — `400` (key doesn't belong to this project)**

```json
{ "success": false, "error": "Document key does not belong to this project" }
```

**Failure — `404` (project doesn't exist)**

```json
{ "success": false, "error": "Project not found" }
```

**Failure — `404` (project exists, but this key isn't one of its documents)**

```json
{ "success": false, "error": "Document not found on this project" }
```

(Distinct from the previous 404 — same status code, different message, so a client can tell "wrong project" apart from "wrong document" only by reading `error`, not by status code alone.)

---

## Full Endpoint Summary

| #  | Method | Path                                   | Admin only | Success | Failure statuses   |
| -- | ------ | -------------------------------------- | ---------- | ------- | ------------------ |
| 1  | GET    | `/projects/health`                   | No         | 200     | 401                |
| 2  | POST   | `/projects`                          | Yes        | 201     | 400, 401, 403, 500 |
| 3  | GET    | `/projects`                          | Yes        | 200     | 401, 403, 500      |
| 4  | GET    | `/projects/:id`                      | Yes        | 200     | 401, 403, 404      |
| 5  | PATCH  | `/projects/:id`                      | Yes        | 200     | 400, 401, 403, 404 |
| 6  | GET    | `/projects/:id/cost-summary`         | Yes        | 200     | 401, 403, 404      |
| 7  | POST   | `/projects/:id/documents/upload-url` | Yes        | 200     | 400, 401, 403, 404 |
| 8  | POST   | `/projects/:id/documents/confirm`    | Yes        | 201     | 400, 401, 403, 404 |
| 9  | GET    | `/projects/:id/documents`            | Yes        | 200     | 401, 403, 404      |
| 10 | DELETE | `/projects/:id/documents/:key`       | Yes        | 200     | 400, 401, 403, 404 |

(`401`/`403`/`500` are the cross-cutting cases from the top of this document and are omitted from each endpoint's own section above except where an endpoint has a distinctive path to `500`, as in §3.)

---

## Source of Truth

This file describes the code as implemented in `services/projects-service/src/routes/{projects,cost-summary,documents}.ts` and `src/lib/{admin,response,errors,dynamo,s3}.ts`, `src/schemas/{project,document}.schema.ts`, and `shared/types/project.types.ts` — cross-reference `result.md` for build status and `step1.md`–`step15.md` for the reasoning behind each design choice referenced above.
