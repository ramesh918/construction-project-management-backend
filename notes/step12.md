# Step 12 — CDK Stack: API Gateway

---

## What You Are Doing

Add API Gateway to `lib/buildtrack-stack.ts`.
This creates the single HTTP entry point for all 6 Lambda services, attaches Cognito JWT validation to every protected route, and enables CORS.

> ⚠️ Do NOT replace the whole file — add the API Gateway code inside the constructor, **after** the IAM grants section from Step 11.

---

## 12.1 Add API Gateway Import

At the top of `lib/buildtrack-stack.ts`, add alongside existing imports:

```typescript
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
```

Your full imports section should now look like:

```typescript
import * as cdk          from 'aws-cdk-lib';
import * as dynamodb     from 'aws-cdk-lib/aws-dynamodb';
import * as s3           from 'aws-cdk-lib/aws-s3';
import * as cognito      from 'aws-cdk-lib/aws-cognito';
import * as lambda       from 'aws-cdk-lib/aws-lambda';
import * as logs         from 'aws-cdk-lib/aws-logs';
import * as apigateway   from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path          from 'path';
import { Construct }     from 'constructs';
```

---

## 12.2 Add the REST API

Inside the constructor, **after** the Cognito `addToRolePolicy` block, add:

```typescript
// ────────────────────────────────────────────────
// API Gateway REST API
// ────────────────────────────────────────────────
const api = new apigateway.RestApi(this, 'BuildTrackApi', {
  // restApiName — display name shown in the AWS Console for this API
  restApiName: 'buildtrack-api',
  // description — metadata describing what this API does (visible in Console and CloudFormation)
  description: 'BuildTrack Construction Management API',

  // defaultCorsPreflightOptions — auto-adds OPTIONS method to all resources so browsers can make cross-origin requests
  defaultCorsPreflightOptions: {
    // allowOrigins: ALL_ORIGINS — permits requests from any domain (use specific origins in production)
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    // allowMethods: ALL_METHODS — permits GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS on all routes
    allowMethods: apigateway.Cors.ALL_METHODS,
    // allowHeaders — specifies which HTTP headers the client is allowed to send in cross-origin requests
    allowHeaders: [
      'Content-Type',        // for JSON payloads
      'Authorization',       // for JWT tokens
      'X-Amz-Date',          // for AWS request signing (if needed)
      'X-Api-Key',           // for custom API key auth (if needed)
    ],
  },

  // deployOptions — configuration for the deployed API stage (how it behaves when live)
  deployOptions: {
    // stageName: 'v1' — all API URLs will be prefixed with /v1 (e.g., https://xxx.execute-api.amazonaws.com/v1/projects)
    stageName:            'v1',
    // throttlingBurstLimit: 50 — allows up to 50 simultaneous requests before rate limiting kicks in (handles traffic spikes)
    throttlingBurstLimit: 50,
    // throttlingRateLimit: 100 — allows 100 requests per second sustained (prevents abuse)
    throttlingRateLimit:  100,
    // metricsEnabled: true — enables CloudWatch metrics so you can monitor API Gateway performance (invocation count, latency, errors)
    metricsEnabled:       true,
    // loggingLevel requires a CloudWatch IAM role set at account level in API Gateway
    // settings — will be enabled in Step 27 (CloudWatch & Monitoring)
  },
});
```

---

## 12.3 Add the Cognito Authorizer

Directly after the `RestApi` block, add:

```typescript
// Cognito Authorizer — validates JWT on every protected route
const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
  // cognitoUserPools — array of Cognito User Pools to validate tokens against (must match the User Pool that signed the JWT)
  cognitoUserPools: [userPool],
  // authorizerName — display name for this authorizer in the AWS Console and CloudFormation
  authorizerName:   'buildtrack-cognito-auth',
  // identitySource — tells API Gateway where to find the JWT token in the request (the Authorization header)
  identitySource:   'method.request.header.Authorization',
  // resultsCacheTtl: 5 minutes — caches the auth decision so the same token doesn't re-validate on every request (improves performance, reduces Cognito calls)
  resultsCacheTtl:  cdk.Duration.minutes(5),
});
```

---

## 12.4 Add Routes

Directly after the authorizer, add the helper and wire up all routes:

```typescript
// Helper — attach a Lambda to an API path with Cognito auth
const addProtectedRoute = (routePath: string, fn: lambda.IFunction) => {
  // Create an API Gateway resource (e.g., /projects, /workers) that becomes an HTTP endpoint
  const resource = api.root.addResource(routePath);
  // Connect the Lambda function to this resource so API Gateway can invoke it
  const integration = new apigateway.LambdaIntegration(fn, {
    // allowTestInvoke: false — disables the "Test" button in the AWS Console (not needed in production, reduces unnecessary invocations)
    allowTestInvoke: false,
  });
  // addProxy — catch ALL sub-paths under this resource (e.g., /projects, /projects/123, /projects/123/costs all go to the same Lambda)
  resource.addProxy({
    // defaultIntegration — specifies that requests should be forwarded to our Lambda function
    defaultIntegration: integration,
    // defaultMethodOptions — applies these settings to all HTTP methods (GET, POST, PUT, DELETE, etc.)
    defaultMethodOptions: {
      // authorizer — use the Cognito authorizer to validate JWT tokens before invoking the Lambda
      authorizer,
      // authorizationType: COGNITO — specifies that authorization is via Cognito User Pool (not AWS_IAM or API_KEY)
      authorizationType: apigateway.AuthorizationType.COGNITO,
    },
    // anyMethod: true — allows ANY HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS) on this route
    anyMethod: true,
  });
};

// /auth — NO authorizer (this is the login endpoint)
const authResource = api.root.addResource('auth');
// Create the /auth route WITHOUT attaching the Cognito authorizer (users don't have a token yet when logging in)
authResource.addProxy({
  // defaultIntegration — forward requests to the authFn Lambda
  defaultIntegration: new apigateway.LambdaIntegration(authFn),
  // anyMethod: true — allow any HTTP method on /auth so clients can use POST, GET, etc. for their login flow
  anyMethod: true,
});

// Protected routes — all require a valid JWT in the Authorization header
// Each route will auto-validate the JWT before the Lambda is invoked (thanks to the Cognito authorizer in addProtectedRoute)
addProtectedRoute('projects',  projectsFn);   // route for project CRUD operations
addProtectedRoute('workers',   workersFn);    // route for worker management
addProtectedRoute('materials', materialsFn);  // route for material tracking
addProtectedRoute('progress',  progressFn);   // route for progress updates
addProtectedRoute('dashboard', dashboardFn);  // route for dashboard data/analytics
```

---

## 12.5 Add the API URL Output

```typescript
// Output the API URL
new cdk.CfnOutput(this, 'ApiUrl', {
  // value: api.url — exports the full base URL of the API (e.g., https://xxx.execute-api.region.amazonaws.com/v1) so clients can use it
  value:       api.url,
  // description — visible in the CloudFormation Outputs tab; helps you understand what this value is for
  description: 'API Gateway base URL',
});
```

---

## 12.6 Verify It Compiles

```bash
cdk synth
```

Expected: CloudFormation template includes all previous resources **plus** API Gateway with 6 routes and a Cognito authorizer.  
The outputs section should now show: `TableName`, `BucketName`, `UserPoolId`, `UserPoolClientId`, `ApiUrl`.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---------|--------------|
| `RestApi` | Creates an API Gateway REST API with a single deployment stage |
| `stageName: 'v1'` | All URLs are prefixed with `/v1` — e.g. `https://xxx.execute-api.region.amazonaws.com/v1/projects` |
| `defaultCorsPreflightOptions` | Auto-adds `OPTIONS` method to every resource so browsers can make cross-origin requests |
| `CognitoUserPoolsAuthorizer` | Validates the `Authorization: Bearer <token>` header against your Cognito User Pool |
| `resultsCacheTtl: 5min` | Auth result is cached — same token doesn't hit Cognito on every request |
| `addProxy` | Catches ALL sub-paths — e.g. `/projects`, `/projects/123`, `/projects/123/costs` all go to the same Lambda |
| `/auth` — no authorizer | Login endpoint must be public — users don't have a token yet when they call it |
| `LambdaIntegration` | Connects an API Gateway route to a Lambda function |
| `allowTestInvoke: false` | Disables the "Test" button in the AWS Console — not needed in production |
| `throttlingBurstLimit: 50` | Allows up to 50 simultaneous requests before rate limiting kicks in |
| `throttlingRateLimit: 100` | Allows 100 requests per second sustained |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `CloudWatch Logs role ARN must be set` | `loggingLevel` in `deployOptions` requires an IAM role linked to API Gateway at the account level | Remove `loggingLevel` from `deployOptions` — it is not included in the code above. Re-enable in Step 27 |
| `ROLLBACK_COMPLETE` after failed deploy | Stack creation failed and AWS rolled it back | Delete the stack via Console or `aws cloudformation delete-stack --stack-name BuildTrackStack`, then re-run `cdk deploy` |

---

## Route Map (For Reference)

| Method | Path | Lambda | Auth |
|--------|------|--------|------|
| ANY | `/auth/{proxy+}` | `authFn` | None (public) |
| ANY | `/projects/{proxy+}` | `projectsFn` | Cognito JWT |
| ANY | `/workers/{proxy+}` | `workersFn` | Cognito JWT |
| ANY | `/materials/{proxy+}` | `materialsFn` | Cognito JWT |
| ANY | `/progress/{proxy+}` | `progressFn` | Cognito JWT |
| ANY | `/dashboard/{proxy+}` | `dashboardFn` | Cognito JWT |

---

## Example API Calls (After Deploy)

After you deploy the stack, you'll have an API URL like:
```
https://abc123xyz.execute-api.us-east-1.amazonaws.com/v1
```

### 1. Login (Public — No Auth Required)

Get a JWT token by calling the `/auth` endpoint:

```bash
# Call the login endpoint (replace URL with your actual API URL and credentials with a real user)
curl -X POST https://abc123xyz.execute-api.us-east-1.amazonaws.com/v1/auth \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@example.com",
    "password": "TempPassword123!"
  }'

# Response example:
# {
#   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "idToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "expiresIn": 3600
# }
```

### 2. Get Projects (Protected — Requires JWT)

Use the `accessToken` from login to call a protected route:

```bash
# Call the /projects endpoint with the JWT token in the Authorization header
curl -X GET https://abc123xyz.execute-api.us-east-1.amazonaws.com/v1/projects \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"

# Response example (from projectsFn Lambda):
# {
#   "projects": [
#     { "id": "proj-001", "name": "Downtown Office Building", "status": "in_progress" },
#     { "id": "proj-002", "name": "Shopping Center Renovation", "status": "planning" }
#   ]
# }
```

### 3. Create a Project (Protected — Requires JWT)

```bash
# POST to /projects with data
curl -X POST https://abc123xyz.execute-api.us-east-1.amazonaws.com/v1/projects \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Construction Site",
    "location": "123 Main St",
    "budget": 500000,
    "startDate": "2026-09-01"
  }'

# Response example:
# {
#   "id": "proj-003",
#   "name": "New Construction Site",
#   "status": "planning",
#   "createdAt": "2026-08-05T10:30:00Z"
# }
```

### 4. Get Workers (Protected — Requires JWT)

```bash
# GET from /workers endpoint
curl -X GET https://abc123xyz.execute-api.us-east-1.amazonaws.com/v1/workers \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"

# Response example:
# {
#   "workers": [
#     { "id": "w-001", "name": "John Doe", "role": "foreman", "status": "active" },
#     { "id": "w-002", "name": "Jane Smith", "role": "carpenter", "status": "active" }
#   ]
# }
```

### ⚠️ Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `Missing Authentication Token` | No JWT in Authorization header, or wrong format | Use `Authorization: Bearer <token>`, not just the token |
| `Unauthorized` | JWT is invalid or expired | Get a fresh token by calling `/auth` again |
| `CORS error in browser` | Browser blocked the request | API Gateway's CORS config should auto-allow it, but check if browser shows preflight error |
| `404 Not Found` | Wrong path or typo | Double-check the route name and use `/v1/` prefix (e.g., `/v1/projects`, not `/projects`) |

---

## Checkpoints Before Moving to Step 13

- [ ] `apigateway` import added at the top of `lib/buildtrack-stack.ts`
- [ ] `RestApi` created with CORS and deploy options
- [ ] `CognitoUserPoolsAuthorizer` created and linked to the User Pool
- [ ] `addProtectedRoute` helper defined
- [ ] `/auth` route added **without** an authorizer
- [ ] All 5 protected routes added: projects, workers, materials, progress, dashboard
- [ ] `ApiUrl` CfnOutput added
- [ ] `cdk synth` runs with no errors and no warnings
