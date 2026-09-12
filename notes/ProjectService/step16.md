# Step 16 — Local Testing, CDK Deploy & End-to-End Verification

---

## What You Are Doing

Confirms the whole service works end-to-end, in two layers: fully local (using Step 1's `local.ts` auth shim against the real deployed DynamoDB table/S3 bucket, since there's no separate local table), and fully deployed (through the real API Gateway + Cognito, the only way to prove the actual authorizer/authorizer-claims wiring works, not just the application code that assumes it).

---

## 16.1 Local Testing (Real Table/Bucket, Simulated Authorizer)

```bash
cd services/projects-service
npm install   # first time only
TABLE_NAME=buildtrack BUCKET_NAME=buildtrack-files-<your-account-id> npm run dev
```

Get `TABLE_NAME`/`BUCKET_NAME` from the stack outputs if you don't have them memorized:
```bash
aws cloudformation describe-stacks --stack-name BuildTrackStack --query 'Stacks[0].Outputs' --output table
```

In another terminal, first confirm `/health` is public and everything else fails closed with **no** token at all:

```bash
curl -s -w "\n%{http_code}\n" http://localhost:4001/projects/health
# → {"status":"ok"} / 200

curl -s -w "\n%{http_code}\n" http://localhost:4001/projects
# → {"success":false,"error":"Admin access required"} / 403 — not a 500. If you see 500 here,
#   local.ts's buildFakeEvent() shim (Step 1.4) isn't wired up correctly.
```

Then build two quick JWTs by hand — no real Cognito login needed for **local** testing, since `local.ts`'s shim only decodes the payload, it never verifies the signature:

```bash
ADMIN_TOKEN=$(node -e '
const b64url = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const header = b64url({alg:"none",typ:"JWT"});
const payload = b64url({sub:"test-admin",email:"admin@buildtrack.dev","cognito:groups":["admin"]});
console.log(`${header}.${payload}.fakesig`);
')

USER_TOKEN=$(node -e '
const b64url = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const header = b64url({alg:"none",typ:"JWT"});
const payload = b64url({sub:"test-user",email:"user@buildtrack.dev","cognito:groups":["user"]});
console.log(`${header}.${payload}.fakesig`);
')
```

```bash
# Non-admin — expect 403
curl -s -w "\n%{http_code}\n" http://localhost:4001/projects -H "Authorization: Bearer $USER_TOKEN"

# Admin — expect 201, and this really does write to the deployed 'buildtrack' table
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4001/projects \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"LOCAL-TEST-DELETE-ME","location":"Bengaluru","startDate":"2026-01-10","endDate":"2026-11-30","budget":8500000}'
```

> ⚠️ Because `TABLE_NAME`/`BUCKET_NAME` point at the real deployed resources (there's no separate local/dev table in this stack), anything you create here is a real item. Give test projects an obvious name (`LOCAL-TEST-...`) and delete them when done:
> ```bash
> aws dynamodb delete-item --table-name buildtrack --key '{"PK":{"S":"PROJECT#<id>"},"SK":{"S":"PROFILE"}}'
> aws dynamodb delete-item --table-name buildtrack --key '{"PK":{"S":"PROJECT#<id>"},"SK":{"S":"COST#SUMMARY"}}'
> ```

This local layer is enough to verify all application-level logic (validation, DynamoDB reads/writes, S3 presigned URLs, the admin-group check's own logic). What it does **not** verify: that a real Cognito access token actually carries `cognito:groups` the way `requireAdmin` expects, or that API Gateway's authorizer is correctly attached to `/projects` in the deployed stack — that's what 16.2–16.7 below confirm.

---

## 16.2 Deploy and Get the API URL

```bash
npm run build   # from repo root
npm run synth
npm run diff    # review: only Step 14's grantDelete + the 6 services' worth of Lambda code changes
npm run deploy
```

Note the `ApiUrl` output (e.g. `https://xxxxxxxxxx.execute-api.<region>.amazonaws.com/v1/`).

## 16.3 Create/Confirm Test Users

Per `notes/AuthService/step13.md` — create one `admin` user and one plain `user` (or reuse existing test accounts from that guide).

## 16.4 Log In as Each User

```bash
export API_URL=https://xxxxxxxxxx.execute-api.<region>.amazonaws.com/v1

ADMIN_TOKEN=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@buildtrack.dev","password":"RealPass123!"}' | jq -r '.data.accessToken')

USER_TOKEN=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@buildtrack.dev","password":"RealPass123!"}' | jq -r '.data.accessToken')
```

## 16.5 Verify the Admin-Only Rejection

```bash
# Non-admin — expect 403
curl -s -o /dev/null -w "%{http_code}\n" $API_URL/projects \
  -H "Authorization: Bearer $USER_TOKEN"

# Admin — expect 200
curl -s -o /dev/null -w "%{http_code}\n" $API_URL/projects \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 16.6 Full CRUD + Document Flow (as Admin)

```bash
# Create
PROJECT_ID=$(curl -s -X POST $API_URL/projects \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Riverside Apartments","location":"Bengaluru","startDate":"2026-01-10","endDate":"2026-11-30","budget":8500000}' \
  | jq -r '.data.id')

# Get
curl -s $API_URL/projects/$PROJECT_ID -H "Authorization: Bearer $ADMIN_TOKEN" | jq

# Update
curl -s -X PATCH $API_URL/projects/$PROJECT_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Active"}' | jq

# Cost summary
curl -s $API_URL/projects/$PROJECT_ID/cost-summary -H "Authorization: Bearer $ADMIN_TOKEN" | jq

# Request an upload URL for a blueprint
UPLOAD=$(curl -s -X POST $API_URL/projects/$PROJECT_ID/documents/upload-url \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"fileName":"tower-a-blueprint.pdf","contentType":"application/pdf","category":"blueprint"}')
UPLOAD_URL=$(echo $UPLOAD | jq -r '.data.uploadUrl')
DOC_KEY=$(echo $UPLOAD | jq -r '.data.key')

# Upload the actual file straight to S3 (client -> S3, not through the API)
curl -s -X PUT "$UPLOAD_URL" -H "Content-Type: application/pdf" --data-binary @./tower-a-blueprint.pdf

# Confirm
curl -s -X POST $API_URL/projects/$PROJECT_ID/documents/confirm \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"key\":\"$DOC_KEY\",\"fileName\":\"tower-a-blueprint.pdf\",\"contentType\":\"application/pdf\",\"category\":\"blueprint\"}" | jq

# List documents (view URLs included) — try the category filter too
curl -s "$API_URL/projects/$PROJECT_ID/documents?category=blueprint" -H "Authorization: Bearer $ADMIN_TOKEN" | jq

# Open one of the returned viewUrl values in a browser — confirm the PDF renders/downloads correctly

# Delete it
curl -s -X DELETE "$API_URL/projects/$PROJECT_ID/documents/$DOC_KEY" -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

Repeat the upload flow once more with `"category":"permit"` to exercise the second document type explicitly called out in `promts/ProjectService.md`.

---

## 16.7 Postman Collection (Optional, Mirrors `notes/AuthService/step12.md`)

Same approach as AuthService: one collection with an environment variable for `{{apiUrl}}` and `{{adminToken}}`/`{{userToken}}`, a pre-request script or manual step to populate the tokens from `/auth/login`, and one request per row of Step 15's endpoint table. Add a Postman test script on the `POST /projects` request asserting `pm.response.code === 201` when using `{{adminToken}}` and `403` when using `{{userToken}}`.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---|---|
| Why `requireAdmin` "fails closed" locally with no token | `buildFakeEvent()` (Step 1.4) returns `{ requestContext: {} }` when there's no `Authorization` header → `claims` is `undefined` → `groups` defaults to `[]` → `includes('admin')` is `false` → `403`. There's no code path where a missing/malformed claims object accidentally grants access |
| Hand-built fake JWTs work for local testing, but not against the deployed API | `local.ts`'s shim only *decodes* the JWT payload, it never verifies the signature — fine for local dev, since that code never runs in Lambda. API Gateway's real Cognito authorizer *does* verify the signature, so a hand-built token is rejected with API Gateway's own `401` before this Lambda ever runs (16.4's real `/auth/login` tokens are required for deployed testing) |
| Client `PUT`s straight to S3, never to `$API_URL` | Confirms the "all file uploads go directly to S3" business rule from the README — the presigned URL's host is `*.s3.amazonaws.com` (or `*.s3.<region>.amazonaws.com`), not the API Gateway domain |
| Testing both `category` values | `blueprint` and `permit` are the two document types explicitly named in `promts/ProjectService.md` — both should be exercised, not just one, before calling this service done |

---

## Checkpoints — Service Complete

- [ ] `npm run dev` (with `TABLE_NAME`/`BUCKET_NAME` set) confirms `/health` is public, no-token requests get a clean `403`, a hand-built non-admin JWT gets `403`, and a hand-built admin JWT succeeds and writes a real (then cleaned-up) item to the deployed table
- [ ] `cdk deploy` succeeds with the Step 14 `grantDelete` change included
- [ ] Non-admin user gets `403` on `/projects`; admin user gets `200`
- [ ] Full create → get → update → cost-summary flow verified against the deployed API
- [ ] Upload → confirm → list (with `viewUrl`) → delete verified for **both** `blueprint` and `permit` categories
- [ ] A `viewUrl` returned by `GET /projects/:id/documents` was opened in a browser and rendered/downloaded the correct file
