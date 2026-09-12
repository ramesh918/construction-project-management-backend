# ProjectService — Execution Tracker

This file tracks progress through `step1.md`–`step16.md` in this folder. Update the **Status** column as work happens — don't batch updates at the end, since the point of this file is to reflect real, current state (per `promts/ProjectService.md`'s request for a file that "tracks the execution of each step").

**Status values:** `Not Started` · `In Progress` · `Done` · `Blocked`

Source documents this plan is built from: `promts/ProjectService.md` (the ask), `promts/tableDetails.md` (DynamoDB schema for `Project`/`ProjectCostSummary`), `shared/types/project.types.ts`, and `notes/AuthService/` (the sibling service this plan's structure and code conventions are deliberately copied from).

**See [plan.md](plan.md)** for the full API contract — every endpoint's request shape and every success/failure response, matching the implemented code.

---

## Progress

| # | Step | What It Delivers | Status | Notes |
|---|---|---|---|---|
| 1 | [step1.md](step1.md) | Hono app skeleton, Lambda handler, local dev server | Done | 2026-09-11. Needed one deviation: `const app: Hono = ...` requires an explicit type annotation — with two services each having their own `node_modules/hono`, `declaration: true` in the root tsconfig can't otherwise name a portable type for `export default app`. `npm run build` + `npm run synth` both pass. **Updated 2026-09-12:** `local.ts` upgraded from a plain `serve({ fetch: app.fetch, port })` to a shim that decodes the incoming `Authorization` JWT and passes `{ event }` into `app.fetch`, reconstructing `event.requestContext.authorizer.claims` locally — see the Step 16 note below for why. |
| 2 | [step2.md](step2.md) | `shared/types/project.types.ts` extended: `ProjectDocument`, `ProjectCostSummary.updatedAt` | Done | 2026-09-11. `npm run build` passes. |
| 3 | [step3.md](step3.md) | `lib/response.ts`, `lib/errors.ts` (403 added to the status union) | Done | 2026-09-11. Same cross-package-hono deviation as Step 1: `ok()`/`fail()` need explicit `: Response` return-type annotations, or `tsc` can't portably name the type `c.json()` infers (two separate `node_modules/hono` installs in one compile). `npm run build` passes. |
| 4 | [step4.md](step4.md) | Zod schemas: project create/update, document upload/confirm | Done | 2026-09-11. Implemented exactly as planned, no deviations. `npm run build` passes. |
| 5 | [step5.md](step5.md) | `lib/dynamo.ts` — client, config, key builders | Done | 2026-09-11. Implemented exactly as planned, no deviations. `npm run build` passes. |
| 6 | [step6.md](step6.md) | `lib/s3.ts` — client, config, presigned upload/view URL + delete helpers | Done | 2026-09-11. Added explicit `Promise<string>` return types on `createUploadUrl`/`createViewUrl` up front (learned from Steps 1/3's cross-package-hono annotation issue — `getSignedUrl`'s inferred type didn't actually trigger it here, but kept the annotations for clarity anyway). `npm run build` passes. |
| 7 | [step7.md](step7.md) | `lib/lambda-context.ts` + `lib/admin.ts` — admin-group-only middleware | Done | 2026-09-11. `requireAdmin` return type annotated `Promise<Response \| void>` proactively (same cross-package-hono naming issue as earlier steps). `npm run build` passes. |
| 8 | [step8.md](step8.md) | `POST /projects` — create project + init cost summary | Done | 2026-09-11. `export const projectsRoute: Hono` annotated proactively. `npm run build` passes. Route not yet mounted (Step 15). |
| 9 | [step9.md](step9.md) | `GET /projects`, `GET /projects/:id` — list & get | Done | 2026-09-11. Implemented exactly as planned, no deviations. `npm run build` passes. |
| 10 | [step10.md](step10.md) | `PATCH /projects/:id` — update, budget-sync to cost summary | Done | 2026-09-11. Used `let result;` + `try/catch` (not the `var` placeholder shown in step10.md's draft snippet) to convert `ConditionalCheckFailedException` into a 404 `AppError`. "Pending cost entries" rule intentionally left unenforced per the plan. `npm run build` passes. |
| 11 | [step11.md](step11.md) | `GET /projects/:id/cost-summary` — recompute-on-read | Done | 2026-09-11. Implemented exactly as planned, no deviations. `npm run build` passes. |
| 12 | [step12.md](step12.md) | Document upload flow — presigned `PUT` URL + confirm | Done | 2026-09-11. Implemented exactly as planned (`requireProject()` helper, key-prefix ownership check on confirm), no deviations. `npm run build` passes. |
| 13 | [step13.md](step13.md) | `GET /projects/:id/documents` — list with view URLs | Done | 2026-09-11. Implemented exactly as planned, no deviations. `npm run build` passes. |
| 14 | [step14.md](step14.md) | `DELETE /projects/:id/documents/:key` + CDK `grantDelete` stack change | Done | 2026-09-11. `bucket.grantDelete(projectsFn)` added to `lib/buildtrack-stack.ts`; confirmed via `cdk synth` that `ProjectsFnServiceRoleDefaultPolicy` now includes `s3:DeleteObject*`. Deploying it is covered under Step 16 (this account, `333888905517`/us-east-1, is already bootstrapped and has a live `BuildTrackStack`). |
| 15 | [step15.md](step15.md) | Final route wiring, centralized error handling | Done | 2026-09-11. Deviation from step15.md's draft: `const app` must be annotated as the full `Hono<AppBindings>` (not bare `Hono`), otherwise `app.use('*', requireAdmin)` fails to type-check since `requireAdmin` expects `Context<AppBindings>`. `npm run build` and `npm run synth` both pass with all routes mounted. |
| 16 | [step16.md](step16.md) | Local + deployed end-to-end verification, admin-vs-user test | Blocked | 2026-09-12. **Local part (16.1) fully done, including the real admin/non-admin distinction:** `npm run dev` (with `TABLE_NAME`/`BUCKET_NAME` pointed at the deployed resources) confirmed `GET /projects/health` returns `200` with no auth context; every other route returns a clean `403` with no token (this surfaced and fixed the `requireAdmin` crash bug — see Bugs Found & Fixed); a hand-built non-admin JWT gets `403`; a hand-built admin JWT gets `201` and actually wrote a `LOCAL-TEST-DELETE-ME` project to the live `buildtrack` table, which was then deleted via `aws dynamodb delete-item`. Reaching this required adding the `local.ts` auth-decoding shim (see Step 1's updated note) — the user hit exactly this gap testing manually with a real access token before the shim existed. `npm run diff` against the live `BuildTrackStack` shows exactly the expected change set (new `ProjectsFn` code bundle + the Step 14 `s3:DeleteObject*` grant, plus an unrelated pending `AuthFn` code diff from already-uncommitted auth-service work predating this build-out). **Still blocked on `cdk deploy` itself (16.2)** — the harness's auto-mode action classifier refuses to run it even after explicit user approval, since it's a real, billed, hard-to-reverse change to a live AWS account. Run `npm run deploy` from `buildtrack/` manually, then complete 16.3–16.7 (test users, admin-vs-user 403 check against the real API, full CRUD + document upload/view/delete walkthrough) by hand. |

---

## Bugs Found & Fixed During Implementation

- **`requireAdmin` crashed with `500` instead of failing closed with `403`** when `c.env.event` is `undefined` — which is exactly what happens under `npm run dev` (`@hono/node-server`, no Lambda/API-Gateway adapter). The original code (`c.env.event.requestContext.authorizer?.claims`) only guarded the last hop with `?.`; a `TypeError: Cannot read properties of undefined (reading 'requestContext')` was thrown and caught by the generic `onError` handler instead. Fixed in `services/projects-service/src/lib/admin.ts` by optional-chaining every hop: `c.env?.event?.requestContext?.authorizer?.claims`. Confirmed via local `curl` testing (Step 16) that every protected route now returns a clean `403 {"success":false,"error":"Admin access required"}` with no authorizer context, while `GET /projects/health` still returns `200`.
- **Passing a real `Authorization: Bearer <accessToken>` header to `npm run dev` did nothing** — the user hit this directly while testing manually. Root cause: `local.ts` (`@hono/node-server`) never had any code path that reads the `Authorization` header or populates `c.env.event`, since that only happens via `hono/aws-lambda`'s `handle()` in real Lambda. Fixed by rewriting `local.ts` to decode the JWT payload from the header (no signature verification — this file never runs in Lambda) and pass a reconstructed `{ event }` as `app.fetch`'s second argument, matching what `handle()` does in production. This makes `requireAdmin` behave identically locally and in Lambda, using either a real Cognito token or a hand-built one for pure local testing (Step 16.1).

---

## Known Gaps / Open Decisions (Carried Forward Into the Steps Above)

- **"A project cannot be marked Completed if there are pending cost entries"** (README business rule) is **not enforced** — see step10.md. No `CostEntry` entity exists anywhere in the current schema (`promts/tableDetails.md` doesn't model it either). Revisit if/when such an entity is introduced.
- **Document metadata (`ProjectDocument`) deviates from `promts/tableDetails.md`'s example**, which shows a flat `documentKeys: string[]`. The richer shape (category/fileName/contentType) is required to support two distinct document types (blueprints vs. government permits) and to serve correct download metadata — see step2.md for the rationale. If `promts/tableDetails.md` is treated as the single source of truth elsewhere, it should be updated to match once this is implemented.
- **No S3 event notifications are wired up** in `lib/buildtrack-stack.ts` — this is why document upload is a two-call flow (get URL, then explicitly confirm) instead of the server learning about the upload automatically. If that changes, step12.md's `/confirm` endpoint could be replaced by an S3 → Lambda trigger.

---

## How to Use This File

1. Before starting a step, flip its Status to `In Progress`.
2. When a step's Checkpoints (bottom of each `stepN.md`) are all checked off, flip Status to `Done` and add the date to Notes.
3. If a step can't be completed as written (missing prerequisite, a design decision needs revisiting), flip to `Blocked` and note why — don't skip silently.
4. Once all 16 rows are `Done`, `projects-service`'s stub handler (`export const handler = async () => ({ statusCode: 200, body: "ok" })`, per the root `CLAUDE.md`) has been fully replaced with real business logic, matching how `notes/AuthService/` walked `auth-service` through the same process.
