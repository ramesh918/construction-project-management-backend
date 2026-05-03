# BuildTrack — Construction Project Management Backend

A fully serverless AWS backend for managing construction projects, workers, materials, site progress, and costs. Built with AWS CDK (TypeScript) and deployed on AWS.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [High Level Design (HLD)](#high-level-design-hld)
3. [Low Level Design (LLD)](#low-level-design-lld)
4. [DynamoDB Data Model](#dynamodb-data-model)
5. [API Reference](#api-reference)
6. [File Storage Design](#file-storage-design)
7. [Authentication & Authorization](#authentication--authorization)
8. [Infrastructure & Deployment](#infrastructure--deployment)
9. [Project Structure](#project-structure)
10. [Useful Commands](#useful-commands)
11. [Destroying All AWS Resources](#destroying-all-aws-resources)

---

## Project Overview

BuildTrack is a backend system for construction companies to:

- Manage multiple construction **projects** with budgets and timelines
- Track **workers**, their roles, daily wages, and attendance
- Manage **materials** — purchases, usage, and stock levels
- Log daily **progress** with photos, work done, and materials used
- View a **dashboard** with cost summaries, attendance stats, and project health

**Architecture Style:** Serverless microservices on AWS  
**Infrastructure:** AWS CDK (TypeScript) — Infrastructure as Code  
**Region:** `us-east-1` (configurable)

---

## High Level Design (HLD)

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Web / Mobile)                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS API Gateway  (REST API v1)                    │
│              Throttle: 100 req/s burst, 50 concurrent               │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────────────────────────────┐   │
│  │  /auth/*     │   │  All other routes (/projects, /workers…) │   │
│  │  (Public)    │   │  Protected via Cognito JWT Authorizer     │   │
│  └──────┬───────┘   └────────────────────┬─────────────────────┘   │
└─────────┼───────────────────────────────┼─────────────────────────┘
          │                               │
          │                    ┌──────────▼──────────┐
          │                    │  Cognito User Pool   │
          │                    │  (JWT Validation)    │
          │                    └─────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        AWS Lambda Functions                          │
│                                                                     │
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │  AuthFn    │  │ ProjectsFn  │  │  WorkersFn  │                  │
│  │ (Cognito)  │  │(DynamoDB+S3)│  │ (DynamoDB)  │                  │
│  └────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                     │
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │MaterialsFn │  │ ProgressFn  │  │ DashboardFn │                  │
│  │(DynamoDB+S3│  │(DynamoDB+S3)│  │(DynamoDB+S3)│                  │
│  └────────────┘  └─────────────┘  └─────────────┘                  │
└──────────────────────┬──────────────────┬───────────────────────────┘
                       │                  │
          ┌────────────▼───┐    ┌─────────▼──────────┐
          │  DynamoDB      │    │   S3 Bucket         │
          │  (Single Table)│    │  buildtrack-files   │
          │  buildtrack    │    │  (Docs, Photos,     │
          │                │    │   Bills, Worker IDs)│
          └────────────────┘    └────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Compute | AWS Lambda | Auto-scaling, pay-per-use, no server management |
| API Layer | API Gateway REST | Managed routing, auth integration, throttling |
| Database | DynamoDB Single Table | Low latency, flexible access patterns, serverless |
| File Storage | S3 | Durable, cheap, presigned URL support |
| Authentication | Cognito User Pool | Managed JWT auth, admin-controlled user creation |
| IaC | AWS CDK (TypeScript) | Reproducible, version-controlled infrastructure |
| Language | TypeScript (Node.js 20) | Type safety across infra and Lambda code |
| Validation | Zod | Runtime type safety for all API inputs/outputs |
| HTTP Framework | Hono | Lightweight, fast, Lambda-optimized routing |

### Component Responsibilities

| Component | Responsibility |
|---|---|
| API Gateway | Route incoming HTTP requests, enforce rate limiting, delegate auth to Cognito |
| Cognito Authorizer | Validate JWT Bearer token on every protected route (5-min cache) |
| AuthFn | Handle login (InitiateAuth) and logout (GlobalSignOut) via Cognito IDP |
| ProjectsFn | CRUD for projects, cost tracking, document upload to S3 |
| WorkersFn | CRUD for workers, mark daily attendance per project |
| MaterialsFn | CRUD for materials, record purchases/usage, upload bills to S3 |
| ProgressFn | Log daily site progress, upload site photos to S3 |
| DashboardFn | Read-only aggregated views — costs, attendance summary, stock alerts |
| DynamoDB | Single-table store for all structured business data |
| S3 | Object store for unstructured files (photos, PDFs, invoices) |

---

## Low Level Design (LLD)

### Lambda Function Configuration

All Lambda functions share these base settings:

| Parameter | Value |
|---|---|
| Runtime | Node.js 20.x |
| Architecture | x86_64 |
| Memory | 256 MB |
| Timeout | 30 seconds |
| Handler | `handler` (exported from `index.ts`) |
| Bundler | esbuild (minified, ES2020 target) |
| Log Retention | 1 month |
| External Modules | `@aws-sdk/*` (provided by Lambda runtime) |

### Environment Variables (All Lambdas)

| Variable | Value |
|---|---|
| `TABLE_NAME` | `buildtrack` |
| `BUCKET_NAME` | `buildtrack-files-{AccountId}` |
| `USER_POOL_ID` | Cognito User Pool ID |
| `USER_POOL_CLIENT` | Cognito App Client ID |
| `NODE_ENV` | `production` |

### IAM Permissions Matrix

| Lambda | DynamoDB | S3 | Cognito |
|---|---|---|---|
| AuthFn | None | None | InitiateAuth, GlobalSignOut |
| ProjectsFn | Read + Write | Put + Read | None |
| WorkersFn | Read + Write | None | None |
| MaterialsFn | Read + Write | Put + Read | None |
| ProgressFn | Read + Write | Put + Read | None |
| DashboardFn | Read only | Read only | None |

### Service Dependencies

| Service | Key Libraries |
|---|---|
| auth-service | hono, @aws-sdk/client-cognito-identity-provider, zod |
| projects-service | hono, @aws-sdk/client-dynamodb, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, uuid, zod |
| workers-service | hono, @aws-sdk/client-dynamodb, uuid, zod |
| materials-service | hono, @aws-sdk/client-dynamodb, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, uuid, zod |
| progress-service | hono, @aws-sdk/client-dynamodb, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, uuid, zod |
| dashboard-service | hono, @aws-sdk/client-dynamodb, zod |

### API Gateway Configuration

| Setting | Value |
|---|---|
| API Name | `buildtrack-api` |
| Stage | `v1` |
| Burst Limit | 50 concurrent requests |
| Rate Limit | 100 requests/second |
| CORS Origins | All (restrict to domain in production) |
| CORS Methods | ALL |
| Auth Header | `Authorization` (Bearer JWT) |
| Auth Cache TTL | 5 minutes |

### Route Map

| Route | Lambda | Auth Required | Operations |
|---|---|---|---|
| `ANY /auth/*` | AuthFn | No | Login, logout, token refresh |
| `ANY /projects/*` | ProjectsFn | Yes | CRUD projects, cost summaries, document uploads |
| `ANY /workers/*` | WorkersFn | Yes | CRUD workers, mark attendance |
| `ANY /materials/*` | MaterialsFn | Yes | CRUD materials, record purchases/usage, upload bills |
| `ANY /progress/*` | ProgressFn | Yes | Log daily progress, upload site photos |
| `ANY /dashboard/*` | DashboardFn | Yes | Aggregated stats, cost reports, stock alerts |

### Cognito User Pool Configuration

| Setting | Value |
|---|---|
| Pool Name | `buildtrack-users` |
| Self Sign-Up | Disabled (admin only) |
| Sign-In | Email |
| Min Password Length | 8 characters |
| Password Requirements | Uppercase, lowercase, digits |
| Account Recovery | Email |
| Access Token Expiry | 1 hour |
| ID Token Expiry | 1 hour |
| Refresh Token Expiry | 30 days |
| Auth Flows | USER_PASSWORD_AUTH, USER_SRP_AUTH, ADMIN_USER_PASSWORD_AUTH |

**User Groups:**

| Group | Precedence | Access Level |
|---|---|---|
| `admin` | 1 | Full access — manage all resources |
| `user` | 2 | Field access — update progress and attendance only |

---

## DynamoDB Data Model

### Table: `buildtrack`

Single-table design using composite keys with two Global Secondary Indexes.

| Attribute | Type | Description |
|---|---|---|
| `PK` | String | Partition key — entity type + ID |
| `SK` | String | Sort key — record type + ID |
| `GSI1PK` | String | GSI1 partition key — for project-based queries |
| `GSI1SK` | String | GSI1 sort key |
| `GSI2PK` | String | GSI2 partition key — for date-based queries |
| `GSI2SK` | String | GSI2 sort key |

**Global Secondary Indexes:**

| Index | PK | SK | Purpose |
|---|---|---|---|
| GSI1 | `GSI1PK` | `GSI1SK` | Query all records for a project (e.g., all attendance for `PROJECT#PRJ001`) |
| GSI2 | `GSI2PK` | `GSI2SK` | Query all records by date (e.g., all progress logs on `2024-01-15`) |

### Access Patterns

| Entity | PK | SK | Example |
|---|---|---|---|
| Project | `PROJECT#{id}` | `PROFILE` | `PROJECT#PRJ001 / PROFILE` |
| Project Cost Summary | `PROJECT#{id}` | `COST#SUMMARY` | `PROJECT#PRJ001 / COST#SUMMARY` |
| Worker | `WORKER#{id}` | `PROFILE` | `WORKER#WRK001 / PROFILE` |
| Attendance | `WORKER#{id}` | `ATTENDANCE#{date}#{projectId}` | `WORKER#WRK001 / ATTENDANCE#2024-01-15#PRJ001` |
| Material | `MATERIAL#{id}` | `PROFILE` | `MATERIAL#MAT001 / PROFILE` |
| Material Purchase | `MATERIAL#{id}` | `PURCHASE#{id}` | `MATERIAL#MAT001 / PURCHASE#PUR001` |
| Material Usage | `MATERIAL#{id}` | `USAGE#{id}` | `MATERIAL#MAT001 / USAGE#USG001` |
| Progress Log | `PROJECT#{id}` | `PROGRESS#{date}#{id}` | `PROJECT#PRJ001 / PROGRESS#2024-01-15#LOG001` |

### Data Models

#### Project
```typescript
interface Project {
  id: string;
  name: string;
  location: string;
  startDate: string;       // YYYY-MM-DD
  endDate: string;
  budget: number;          // in rupees
  status: 'Planning' | 'Active' | 'On Hold' | 'Completed';
  description?: string;
  documentKeys?: string[]; // S3 keys for blueprints/contracts
  createdAt: string;
  updatedAt: string;
}

interface ProjectCostSummary {
  projectId: string;
  labourCost: number;
  materialCost: number;
  otherCost: number;
  totalCost: number;
  budget: number;
  remaining: number;
  isOverBudget: boolean;
}
```

#### Worker
```typescript
type WorkerRole = 'Mason' | 'Carpenter' | 'Plumber' | 'Electrician' | 'Labourer' | 'Supervisor' | 'Other';

interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  phone: string;
  dailyWage: number;
  isActive: boolean;
  createdAt: string;
}

interface AttendanceRecord {
  workerId: string;
  workerName: string;
  projectId: string;
  date: string;          // YYYY-MM-DD
  present: boolean;
  cost: number;          // dailyWage if present, 0 if absent
  markedBy: string;      // userId
  markedAt: string;      // ISO timestamp
}
```

#### Material
```typescript
type MaterialUnit = 'kg' | 'ton' | 'bag' | 'piece' | 'litre' | 'cubic_meter' | 'square_meter';

interface Material {
  id: string;
  name: string;
  unit: MaterialUnit;
  currentStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;   // currentStock <= lowStockThreshold
  createdAt: string;
}

interface MaterialPurchase {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;     // quantity * unitPrice
  vendor: string;
  date: string;
  billKey?: string;      // S3 key for purchase bill image/PDF
  projectId?: string;
  createdAt: string;
}

interface MaterialUsage {
  id: string;
  materialId: string;
  materialName: string;
  projectId: string;
  quantityUsed: number;
  date: string;
  loggedBy: string;
  createdAt: string;
}
```

#### Progress Log
```typescript
interface ProgressLog {
  id: string;
  projectId: string;
  date: string;                         // YYYY-MM-DD
  workDone: string;
  workersPresent: string[];             // array of workerIds
  materialsUsed: ProgressMaterialUsed[];
  photoKeys: string[];                  // S3 keys for site photos
  remarks?: string;
  loggedBy: string;
  createdAt: string;
}

interface ProgressMaterialUsed {
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
}
```

#### API Response Envelope
```typescript
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  count: number;
  lastEvaluatedKey?: string;
}
```

---

## API Reference

### Authentication

#### POST /auth/login
```json
// Request
{ "email": "admin@company.com", "password": "Password123" }

// Response
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "idToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 3600
  }
}
```

#### POST /auth/logout
```
Authorization: Bearer {accessToken}
```

### Projects

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List all projects |
| POST | `/projects` | Create a new project |
| GET | `/projects/{id}` | Get project details |
| PUT | `/projects/{id}` | Update project |
| DELETE | `/projects/{id}` | Delete project |
| GET | `/projects/{id}/cost` | Get cost summary |
| POST | `/projects/{id}/documents` | Get presigned URL for document upload |

### Workers

| Method | Path | Description |
|---|---|---|
| GET | `/workers` | List all workers |
| POST | `/workers` | Create a new worker |
| GET | `/workers/{id}` | Get worker details |
| PUT | `/workers/{id}` | Update worker |
| POST | `/workers/{id}/attendance` | Mark attendance for a project/date |
| GET | `/workers/{id}/attendance` | Get attendance history |

### Materials

| Method | Path | Description |
|---|---|---|
| GET | `/materials` | List all materials (with low-stock alerts) |
| POST | `/materials` | Create a new material |
| GET | `/materials/{id}` | Get material details |
| PUT | `/materials/{id}` | Update material |
| POST | `/materials/{id}/purchase` | Record a purchase |
| POST | `/materials/{id}/usage` | Record usage on a project |
| GET | `/materials/{id}/purchases` | Get purchase history |

### Progress

| Method | Path | Description |
|---|---|---|
| POST | `/progress/{projectId}` | Log daily progress |
| GET | `/progress/{projectId}` | Get all progress logs for a project |
| GET | `/progress/{projectId}/{date}` | Get progress log for specific date |
| POST | `/progress/{projectId}/photos` | Get presigned URL for photo upload |

### Dashboard

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/summary` | Overall stats across all projects |
| GET | `/dashboard/projects/{id}` | Detailed stats for a single project |
| GET | `/dashboard/materials/alerts` | Low stock material alerts |
| GET | `/dashboard/attendance/{date}` | Attendance summary for a date |

---

## File Storage Design

### S3 Bucket: `buildtrack-files-{AccountId}`

**Folder Structure:**

```
buildtrack-files-{AccountId}/
├── project-documents/    ← Blueprints, contracts (PDF)
├── progress-photos/      ← Daily site photos (JPG, PNG)
├── material-bills/       ← Purchase invoices (PDF, JPG)
├── worker-documents/     ← Worker ID proofs
└── temp/                 ← Temporary uploads (auto-deleted in 1 day)
```

**Lifecycle Rules:**

| Rule | Target | Action | After |
|---|---|---|---|
| archive-old-photos | `progress-photos/*` | Move to S3 INFREQUENT_ACCESS | 90 days |
| expire-temp-uploads | `temp/*` | Delete permanently | 1 day |

**Configuration:**

| Setting | Value |
|---|---|
| Versioning | Enabled |
| Removal Policy | RETAIN (never deleted on `cdk destroy`) |
| CORS Methods | GET, PUT, POST |
| CORS Max Age | 3000 seconds |

**Upload Flow (Presigned URLs):**

```
Client → POST /projects/{id}/documents
       ← { presignedUrl, s3Key }
Client → PUT {presignedUrl} (upload file directly to S3)
Client → PUT /projects/{id} { documentKeys: [s3Key] }
```

---

## Authentication & Authorization

### Login Flow

```
Client
  │
  ├─ POST /auth/login { email, password }
  │
  ▼
AuthFn → Cognito InitiateAuth (USER_PASSWORD_AUTH)
       ← { AccessToken, IdToken, RefreshToken }
  │
  ▼
Client stores tokens, sends AccessToken as Bearer on all requests
```

### Request Authorization Flow

```
Client
  │
  ├─ GET /projects  Authorization: Bearer {accessToken}
  │
  ▼
API Gateway → Cognito Authorizer validates JWT
            ← 200 OK (valid) or 401 Unauthorized (invalid/expired)
  │
  ▼
Lambda receives request with decoded user context (userId, email, role)
```

### Role Permissions

| Operation | Admin | User (Field Worker) |
|---|---|---|
| Create/Delete projects | Yes | No |
| View projects | Yes | Yes |
| Create/Update workers | Yes | No |
| Mark attendance | Yes | Yes |
| Create materials | Yes | No |
| Record material usage | Yes | Yes |
| Log daily progress | Yes | Yes |
| View dashboard | Yes | Yes |

---

## Infrastructure & Deployment

### AWS Resources Created

| Resource | Name | Details |
|---|---|---|
| CDK Stack | `BuildTrackStack` | All resources in one stack |
| DynamoDB Table | `buildtrack` | On-demand billing, PITR enabled, RETAIN on destroy |
| S3 Bucket | `buildtrack-files-{AccountId}` | Versioned, RETAIN on destroy |
| Cognito User Pool | `buildtrack-users` | Email sign-in, admin-only signup |
| Cognito App Client | `buildtrack-app-client` | No client secret (browser/mobile safe) |
| API Gateway | `buildtrack-api` | REST API, v1 stage |
| Lambda | `BuildTrack-AuthFn` | 256MB, 30s timeout |
| Lambda | `BuildTrack-ProjectsFn` | 256MB, 30s timeout |
| Lambda | `BuildTrack-WorkersFn` | 256MB, 30s timeout |
| Lambda | `BuildTrack-MaterialsFn` | 256MB, 30s timeout |
| Lambda | `BuildTrack-ProgressFn` | 256MB, 30s timeout |
| Lambda | `BuildTrack-DashboardFn` | 256MB, 30s timeout |
| CloudWatch Log Groups | Per Lambda | 1-month retention |

### Deployment Commands

```bash
# First time setup
npm install
npm run build

# Preview changes before deploying
cdk diff

# Deploy to AWS
cdk deploy

# Deploy with specific environment
CDK_ENV=dev cdk deploy      # development
CDK_ENV=prod cdk deploy     # production

# Generate CloudFormation template (no deploy)
cdk synth
```

### Prerequisites

1. AWS CLI configured (`aws configure`)
2. CDK bootstrapped in target account/region (`cdk bootstrap`)
3. Node.js 20+ installed
4. TypeScript 5+ installed globally (`npm install -g typescript`)

---

## Project Structure

```
buildtrack/
├── bin/
│   └── buildtrack.ts              # CDK app entry point — creates BuildTrackStack
├── lib/
│   └── buildtrack-stack.ts        # All AWS resources defined here (DynamoDB, S3, Cognito, API GW, Lambdas)
├── services/
│   ├── auth-service/
│   │   ├── src/index.ts           # Login / logout handler
│   │   └── package.json
│   ├── projects-service/
│   │   ├── src/index.ts           # Projects CRUD + cost tracking
│   │   └── package.json
│   ├── workers-service/
│   │   ├── src/index.ts           # Workers CRUD + attendance
│   │   └── package.json
│   ├── materials-service/
│   │   ├── src/index.ts           # Materials CRUD + purchases/usage
│   │   └── package.json
│   ├── progress-service/
│   │   ├── src/index.ts           # Daily progress logs + photo uploads
│   │   └── package.json
│   └── dashboard-service/
│       ├── src/index.ts           # Aggregated stats and reports
│       └── package.json
├── shared/
│   └── types/
│       ├── index.ts               # Re-exports all types
│       ├── common.types.ts        # ApiResponse, AuthContext, UserRole
│       ├── project.types.ts       # Project, ProjectCostSummary
│       ├── worker.types.ts        # Worker, AttendanceRecord
│       ├── material.types.ts      # Material, MaterialPurchase, MaterialUsage
│       └── progress.types.ts      # ProgressLog
├── test/
│   └── buildtrack.test.ts         # CDK stack tests
├── cdk.json                       # CDK toolkit configuration
├── package.json                   # Root dependencies and scripts
├── tsconfig.json                  # TypeScript strict mode config
├── .eslintrc.json                 # ESLint rules
├── .prettierrc                    # Code formatting config
└── jest.config.js                 # Jest test configuration
```

---

## Useful Commands

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript to JS |
| `npm run watch` | Watch mode — auto-compile on changes |
| `npm run test` | Run Jest unit tests |
| `npx cdk synth` | Generate CloudFormation template |
| `npx cdk diff` | Compare deployed stack with current code |
| `npx cdk deploy` | Deploy stack to AWS |

---

## Destroying All AWS Resources

To shut down all AWS resources in a single command without going to the AWS Console:

```bash
cdk destroy --all
```

You will be prompted to confirm — type `y` to proceed.

**To skip the confirmation prompt:**

```bash
cdk destroy --all --force
```

> **Note:** The DynamoDB table and S3 bucket use `RemovalPolicy.RETAIN` — they will **not** be deleted by `cdk destroy` to prevent data loss. To also delete them, change `removalPolicy: RemovalPolicy.DESTROY` in `lib/buildtrack-stack.ts` before running destroy.

---

## FAQ

### Why does this microservices backend use only one DynamoDB table instead of one table per service?

This is a deliberate **DynamoDB Single-Table Design** — a well-established pattern for serverless architectures on AWS.

**How it works:**
All entities (Projects, Workers, Materials, Attendance, Progress) share one table but are logically separated by their composite key patterns:

| Entity | PK | SK |
|---|---|---|
| Project | `PROJECT#PRJ001` | `PROFILE` |
| Worker | `WORKER#WRK001` | `PROFILE` |
| Attendance | `WORKER#WRK001` | `ATTENDANCE#2024-01-15#PRJ001` |
| Material | `MATERIAL#MAT001` | `PURCHASE#PUR001` |

**Why it is acceptable here:**

- **Serverless-first cost model** — DynamoDB on-demand pricing means one table has fewer management and cost overheads than many tables.
- **Low latency** — single-table design allows fetching related data in one query instead of multiple round-trips across tables.
- **Logical isolation is preserved** — each Lambda service only queries its own key prefix (`WorkersFn` queries `WORKER#*`, `ProjectsFn` queries `PROJECT#*`). The services are independent in code, deployment, and routing — they just share physical storage.
- **Operational simplicity** — one table to monitor, back up (PITR enabled), and manage.

**Where it trades off microservices purity:**

- True microservices orthodoxy says each service should own its own isolated datastore so teams can change or scale it independently.
- There is no hard data boundary — a misbehaving Lambda could technically read another service's keys (mitigated by keeping strict key conventions and adding fine-grained IAM conditions in production).

**Verdict:** This is a pragmatic and industry-accepted pattern for serverless microservices on AWS used in many production systems. The services are logically separated (separate Lambda functions, separate codebases, separate API routes) while sharing a single physical DynamoDB table. For a single team or a project of this scale, the operational and cost benefits outweigh theoretical isolation purity. For large organisations with independent teams owning each service, separate tables — or even separate AWS accounts — would be the right call.

---

### Do these microservices communicate with each other? If yes, how?

**No — these services do not call each other directly.** There are no Lambda-to-Lambda invocations, no HTTP calls between services, and no message queues (SQS/SNS/EventBridge) wiring them together.

Instead, they communicate **indirectly through shared data stores** — DynamoDB and S3:

```
Client Request
      │
      ▼
API Gateway → WorkersFn  ──writes──▶  DynamoDB (WORKER#*, ATTENDANCE#*)
                                           ▲
API Gateway → DashboardFn ──reads──────────┘
```

**How each service uses shared state:**

| Service | Writes to DynamoDB | Reads from DynamoDB |
|---|---|---|
| ProjectsFn | `PROJECT#*` records | `PROJECT#*` records |
| WorkersFn | `WORKER#*`, `ATTENDANCE#*` records | `WORKER#*`, `ATTENDANCE#*` records |
| MaterialsFn | `MATERIAL#*` records | `MATERIAL#*` records |
| ProgressFn | `PROJECT#*/PROGRESS#*` records | `PROJECT#*`, `MATERIAL#*`, `WORKER#*` records |
| DashboardFn | Nothing (read-only) | All entity types |

For example, `DashboardFn` builds cost summaries by reading attendance records written by `WorkersFn` and material usage records written by `MaterialsFn` — but it never calls those Lambdas directly.

**Why this design was chosen:**

- **Simplicity** — no network hops between services, no retry logic, no circular dependency risk.
- **Serverless fit** — Lambda functions are stateless and short-lived; shared DynamoDB is the natural coordination layer.
- **Lower latency** — a direct DynamoDB read is faster and cheaper than an HTTP call to another Lambda (which itself would do a DynamoDB read).

**What is missing compared to full microservices communication:**

In a more advanced architecture you would add:

| Pattern | AWS Service | Use Case |
|---|---|---|
| Event-driven async | EventBridge / SNS | Notify other services when a project is created or a worker is added |
| Task queue | SQS | Decouple heavy operations like cost recalculation |
| Service mesh | App Mesh / API Gateway internal | Direct synchronous service-to-service calls with auth |

For the current scope of BuildTrack, shared-database coordination is sufficient and keeps the system simple. As the system grows — for example if cost calculation becomes a standalone service — introducing EventBridge events would be the natural next step.
