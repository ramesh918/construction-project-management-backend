# Step 11 — CDK Stack: Lambda Functions

---

## What You Are Doing

Add all 6 Lambda functions to `lib/buildtrack-stack.ts`.
This creates the compute layer for every API service: auth, projects, workers, materials, progress, and dashboard.

> ⚠️ Do NOT replace the whole file — add the Lambda code inside the constructor, after the Cognito section.

---

## 11.0 Install esbuild (Required)

CDK uses esbuild to bundle your TypeScript Lambda code locally — **without Docker**.
Run this once inside your project folder:

```bash
npm install --save-dev esbuild
```

> Without this, CDK will try to use Docker for bundling and fail with `spawnSync docker ENOENT` if Docker is not running.

---

## 11.1 Add Lambda Imports

At the top of `lib/buildtrack-stack.ts`, add alongside existing imports:

```typescript
// Import Lambda service — provides Runtime, Architecture, and other function config options
import * as lambda          from 'aws-cdk-lib/aws-lambda';
// Import CloudWatch Logs service — for creating and configuring log groups
import * as logs            from 'aws-cdk-lib/aws-logs';
// Import NodejsFunction construct — automatically bundles TypeScript/JS code using esbuild
import { NodejsFunction }   from 'aws-cdk-lib/aws-lambda-nodejs';
// Import Node.js path module — used to resolve file paths in the bundling config
import * as path            from 'path';
```

Your full imports section should now look like:

```typescript
// Core CDK library — provides Duration, RemovalPolicy, aws_iam, and other utilities
import * as cdk           from 'aws-cdk-lib';
// DynamoDB service — table.grantReadWriteData() and similar methods
import * as dynamodb      from 'aws-cdk-lib/aws-dynamodb';
// S3 service — bucket.grantPut(), bucket.grantRead() methods
import * as s3            from 'aws-cdk-lib/aws-s3';
// Cognito service — userPool and userPoolClient from previous steps
import * as cognito       from 'aws-cdk-lib/aws-cognito';
// Lambda service — Runtime, Architecture for function config
import * as lambda        from 'aws-cdk-lib/aws-lambda';
// CloudWatch Logs service — LogGroup and RetentionDays for log configuration
import * as logs          from 'aws-cdk-lib/aws-logs';
// NodejsFunction construct — bundles TypeScript Lambda code without Docker
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
// Node.js path utility — resolve file paths for entry points
import * as path          from 'path';
// Construct base class — CDK requires all resources to extend Construct
import { Construct }      from 'constructs';
```

---

## 11.2 Add Shared Environment & Lambda Helper

Inside the constructor, **after** the Cognito `CfnOutput` block, add the shared environment variables and a reusable helper function:

```typescript
// ────────────────────────────────────────────────
// Shared environment — passed to every Lambda
// ────────────────────────────────────────────────
const sharedEnv = {
  // DynamoDB table name — all Lambda functions read/write to this table
  TABLE_NAME:       table.tableName,
  // S3 bucket name — used for storing files (blueprints, bills, photos)
  BUCKET_NAME:      bucket.bucketName,
  // Cognito user pool ID — used by auth service to authenticate users
  USER_POOL_ID:     userPool.userPoolId,
  // Cognito user pool client ID — used by auth service to validate tokens
  USER_POOL_CLIENT: userPoolClient.userPoolClientId,
  // Environment indicator — tells Lambda code whether it's running in prod/dev
  NODE_ENV:         'production',
};

// ────────────────────────────────────────────────
// Lambda helper — reusable factory function to create Lambda functions with consistent config
// ────────────────────────────────────────────────
const makeLambda = (
  // Function name (e.g., 'AuthFn', 'ProjectsFn') — used in CloudFormation logical ID
  name:      string,
  // File path to the Lambda handler entry point (relative to repo root)
  entry:     string,
  // Optional extra environment variables specific to this function
  extraEnv?: Record<string, string>,
): NodejsFunction =>
  new NodejsFunction(this, name, {
    // CloudFormation-friendly name; concatenates with 'BuildTrack-' prefix for AWS naming
    functionName:  `BuildTrack-${name}`,
    // Node.js runtime version — 20.x is the latest stable for Lambda
    runtime:       lambda.Runtime.NODEJS_20_X,
    // CPU architecture — X86_64 allows esbuild to bundle locally without Docker
    architecture:  lambda.Architecture.X86_64,
    // Full file path to the handler — resolves relative to lib/ directory
    entry:         path.join(__dirname, '..', entry),
    // Name of the exported function in the handler file that Lambda invokes
    handler:       'handler',
    // Max execution time — prevents infinite loops; 30s is enough for API requests
    timeout:       cdk.Duration.seconds(30),
    // Memory allocated to the Lambda — more memory = faster CPU; 256 MB is sufficient for APIs
    memorySize:    256,
    // Environment variables injected into the Lambda execution environment
    // Combines shared vars with any function-specific extras
    environment:   { ...sharedEnv, ...extraEnv },
    bundling: {
      // Remove unused code and whitespace — reduces bundle size and cold start time
      minify:          true,
      // Don't generate .map files — saves space; not needed for Lambda debugging in CloudWatch
      sourceMap:       false,
      // Target ECMAScript version — es2020 is compatible with Node.js 20
      target:          'es2020',
      // Exclude AWS SDK from bundle — it's pre-installed in Lambda runtime, saving ~20 MB
      externalModules: ['@aws-sdk/*'],
    },
    // Create a dedicated CloudWatch log group for this Lambda's output
    logGroup: new logs.LogGroup(this, `${name}LogGroup`, {
      // CloudWatch log group path — AWS convention for Lambda logs
      logGroupName:  `/aws/lambda/BuildTrack-${name}`,
      // How long to keep logs — 30 days balances cost vs. retention for debugging
      retention:     logs.RetentionDays.ONE_MONTH,
      // Delete log group when the stack is destroyed — keeps AWS account clean in dev
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    }),
  });
```

---

## 11.3 Create the 6 Lambda Functions

Directly after the helper, add:

```typescript
// ── Instantiate all 6 Lambda functions using the shared configuration ──
// Each line creates a Lambda function by calling makeLambda with:
//   1) A unique function name (logical ID for CDK)
//   2) The path to its handler entry file (TypeScript source code)

// Authentication service — handles user login, signup, token validation
const authFn      = makeLambda('AuthFn',      'services/auth-service/src/index.ts');
// Projects service — CRUD operations for construction projects
const projectsFn  = makeLambda('ProjectsFn',  'services/projects-service/src/index.ts');
// Workers service — manages project team members and roles
const workersFn   = makeLambda('WorkersFn',   'services/workers-service/src/index.ts');
// Materials service — tracks material inventory and purchase orders
const materialsFn = makeLambda('MaterialsFn', 'services/materials-service/src/index.ts');
// Progress service — captures and stores site photos, updates on project milestones
const progressFn  = makeLambda('ProgressFn',  'services/progress-service/src/index.ts');
// Dashboard service — aggregates data for real-time project status view (read-only)
const dashboardFn = makeLambda('DashboardFn', 'services/dashboard-service/src/index.ts');
```

---

## 11.4 Add IAM Grants (Least Privilege)

After creating the functions, wire up only the permissions each function actually needs:

```typescript
// ── DynamoDB grants ──
// Grants read+write access to the DynamoDB table
// Each service needs to query/insert/update its domain data
table.grantReadWriteData(projectsFn);   // Projects service queries and updates project records
table.grantReadWriteData(workersFn);    // Workers service manages team member assignments
table.grantReadWriteData(materialsFn);  // Materials service tracks inventory changes
table.grantReadWriteData(progressFn);   // Progress service appends site photos and status updates
// Dashboard only reads aggregated project data — no write permission needed
table.grantReadData(dashboardFn);

// ── S3 grants ──
// grantPut = allows uploading new files; grantRead = allows downloading files
bucket.grantPut(projectsFn);              // Upload blueprint PDFs to S3
bucket.grantPut(materialsFn);             // Upload purchase order receipts/images
bucket.grantPut(progressFn);              // Upload site photos to S3
// Read access allows Lambda to generate presigned URLs and return file metadata
bucket.grantRead(projectsFn);             // Read blueprint URLs for project details
bucket.grantRead(materialsFn);            // Read receipt URLs for material records
bucket.grantRead(progressFn);             // Read photo URLs for progress updates
bucket.grantRead(dashboardFn);            // Read all URLs for dashboard display

// ── Cognito grant — auth service needs permission to call Cognito API ──
// CDK doesn't have a grantInitiateAuth() shortcut, so we add a custom IAM statement
authFn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
  // Actions — the specific AWS API calls the auth Lambda is allowed to make
  actions:   [
    'cognito-idp:InitiateAuth',   // Called during login to authenticate user credentials
    'cognito-idp:GlobalSignOut'   // Called during logout to invalidate all user sessions
  ],
  // Resources — which Cognito user pool can be targeted (restrict to only this pool)
  resources: [userPool.userPoolArn],
}));
```

---

## 11.5 Verify It Compiles

```bash
cdk synth
```

Expected: CloudFormation template includes DynamoDB, S3, Cognito, and 6 Lambda functions with **no errors and no warnings**.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---------|--------------|
| `NodejsFunction` | CDK construct that bundles TypeScript via esbuild — no manual compile step needed |
| `esbuild` (local) | Installed as a dev dependency so CDK bundles code locally without Docker |
| `X86_64` | Standard x86 architecture — works on all machines without Docker cross-compilation |
| `memorySize: 256` | 256 MB RAM per Lambda — enough for these lightweight API handlers |
| `timeout: 30s` | Lambda will stop after 30 seconds — prevents runaway functions |
| `externalModules: ['@aws-sdk/*']` | AWS SDK is pre-installed in the Lambda runtime — no need to bundle it |
| `logGroup` (explicit) | Creates a dedicated CloudWatch log group per Lambda with a 30-day retention policy |
| `sharedEnv` | Single source of truth for environment variables shared across all functions |
| `grantReadData` vs `grantReadWriteData` | CDK generates the minimum required IAM policy — least-privilege pattern |
| `addToRolePolicy` | Adds a custom IAM statement — used for Cognito because there is no CDK `grant*` shortcut |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `spawnSync docker ENOENT` | CDK tried to use Docker instead of local esbuild | Run `npm install --save-dev esbuild` |
| `ARM_64` + no Docker | ARM cross-compilation requires Docker on non-ARM machines | Use `X86_64` instead (already done above) |
| `logRetention is deprecated` | Old API removed in next major CDK version | Use `logGroup` with `logs.LogGroup` (already done above) |
| `pointInTimeRecovery is deprecated` | Old API removed in next major CDK version | Use `pointInTimeRecoverySpecification` in Step 8 |

---

## Checkpoints Before Moving to Step 12

- [ ] `esbuild` installed as a dev dependency (`npm install --save-dev esbuild`)
- [ ] Lambda, logs, NodejsFunction, and path imports added at the top of `lib/buildtrack-stack.ts`
- [ ] `sharedEnv` object defined with all 5 environment variables
- [ ] `makeLambda` helper function added inside the constructor
- [ ] `architecture` set to `X86_64` (not `ARM_64`)
- [ ] `logGroup` used instead of `logRetention`
- [ ] All 6 Lambda functions created: `authFn`, `projectsFn`, `workersFn`, `materialsFn`, `progressFn`, `dashboardFn`
- [ ] DynamoDB grants added for all 5 service functions
- [ ] S3 grants added for projects, materials, progress, and dashboard functions
- [ ] Cognito IAM policy added to `authFn`
- [ ] `cdk synth` runs with no errors and no warnings
