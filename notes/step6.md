# Step 6 — TypeScript & Package Configuration

---

## 6.1 Update Root tsconfig.json

Replace the entire content of `tsconfig.json` (in the `buildtrack/` root) with:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "exclude": ["node_modules", "cdk.out", "dist", "**/*.test.ts"]
}
```

---

## 6.2 Update Root package.json

Replace the entire content of `package.json` (in the `buildtrack/` root) with:

```json
{
  "name": "buildtrack",
  "version": "1.0.0",
  "scripts": {
    "build":        "tsc --noEmit",
    "build:watch":  "tsc --noEmit --watch",
    "synth":        "cdk synth",
    "deploy":       "cdk deploy",
    "deploy:dev":   "CDK_ENV=dev cdk deploy",
    "deploy:prod":  "CDK_ENV=prod cdk deploy",
    "diff":         "cdk diff",
    "destroy":      "cdk destroy"
  },
  "devDependencies": {
    "aws-cdk":                            "^2.0.0",
    "aws-cdk-lib":                        "^2.0.0",
    "constructs":                         "^10.0.0",
    "typescript":                         "^5.0.0",
    "@types/node":                        "^20.0.0",
    "ts-node":                            "^10.0.0",
    "jest":                               "^29.0.0",
    "@types/jest":                        "^29.0.0",
    "ts-jest":                            "^29.0.0",
    "eslint":                             "^8.0.0",
    "@typescript-eslint/eslint-plugin":   "^6.0.0",
    "@typescript-eslint/parser":          "^6.0.0",
    "prettier":                           "^3.0.0"
  }
}
```

Then install root dependencies:
```bash
npm install
```

---

## 6.3 Create Per-Service package.json Files

Create a `package.json` inside each service folder as follows:

### services/auth-service/package.json
```json
{
  "name": "auth-service",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "start": "ts-node src/index.ts"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@aws-sdk/client-cognito-identity-provider": "^3.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "typescript":  "^5.0.0",
    "@types/node": "^20.0.0",
    "ts-node":     "^10.0.0"
  }
}
```

### services/projects-service/package.json
```json
{
  "name": "projects-service",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "start": "ts-node src/index.ts"
  },
  "dependencies": {
    "hono":                           "^4.0.0",
    "@hono/node-server":              "^1.0.0",
    "@aws-sdk/client-dynamodb":       "^3.0.0",
    "@aws-sdk/util-dynamodb":         "^3.0.0",
    "@aws-sdk/client-s3":             "^3.0.0",
    "@aws-sdk/s3-request-presigner":  "^3.0.0",
    "uuid":                           "^9.0.0",
    "zod":                            "^3.0.0"
  },
  "devDependencies": {
    "typescript":  "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "ts-node":     "^10.0.0"
  }
}
```

### services/workers-service/package.json
```json
{
  "name": "workers-service",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "start": "ts-node src/index.ts"
  },
  "dependencies": {
    "hono":                     "^4.0.0",
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/util-dynamodb":   "^3.0.0",
    "uuid":                     "^9.0.0",
    "zod":                      "^3.0.0"
  },
  "devDependencies": {
    "typescript":  "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "ts-node":     "^10.0.0"
  }
}
```

### services/materials-service/package.json
```json
{
  "name": "materials-service",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "start": "ts-node src/index.ts"
  },
  "dependencies": {
    "hono":                           "^4.0.0",
    "@aws-sdk/client-dynamodb":       "^3.0.0",
    "@aws-sdk/util-dynamodb":         "^3.0.0",
    "@aws-sdk/client-s3":             "^3.0.0",
    "@aws-sdk/s3-request-presigner":  "^3.0.0",
    "uuid":                           "^9.0.0",
    "zod":                            "^3.0.0"
  },
  "devDependencies": {
    "typescript":  "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "ts-node":     "^10.0.0"
  }
}
```

### services/progress-service/package.json
Same as materials-service — copy the file and change `"name"` to `"progress-service"`.

### services/dashboard-service/package.json
Same as workers-service — copy the file and change `"name"` to `"dashboard-service"`.

---

## 6.4 Install All Service Dependencies

Run these one by one in the terminal:

```bash
cd services/auth-service && npm install && cd ../..
cd services/projects-service && npm install && cd ../..
cd services/workers-service && npm install && cd ../..
cd services/materials-service && npm install && cd ../..
cd services/progress-service && npm install && cd ../..
cd services/dashboard-service && npm install && cd ../..
```

---

## 6.5 Create .prettierrc

Create a new file `.prettierrc` in the `buildtrack/` root:

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "avoid"
}
```

Create `.prettierignore` in the `buildtrack/` root:
```
node_modules
cdk.out
dist
*.js
```

---

## 6.6 Create .eslintrc.json

Create a new file `.eslintrc.json` in the `buildtrack/` root:

```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  },
  "ignorePatterns": ["node_modules", "cdk.out", "dist"]
}
```

---

## 6.7 Update .gitignore

Replace the auto-generated `.gitignore` with:

```
# Dependencies
node_modules
**/node_modules

# CDK build output
cdk.out
dist

# Environment files — NEVER commit these
.env
.env.*
*.env

# AWS credentials — NEVER commit these
.aws
credentials
awscredentials

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/settings.json
.idea

# Compiled JS (we use ts-node/esbuild, never commit compiled output)
**/*.js
!jest.config.js
!.eslintrc.js

# Test coverage
coverage
```

---

## Checkpoints Before Moving to Step 7

- [ ] Root `tsconfig.json` updated (includes `"types": ["node"]`)
- [ ] Root `package.json` updated and `npm install` run
- [ ] All 6 service `package.json` files created
- [ ] All 6 services have `npm install` completed
- [ ] `.prettierrc` and `.prettierignore` created
- [ ] `.eslintrc.json` created
- [ ] `.gitignore` updated (includes `awscredentials` folder)

---

## Why Replace tsconfig.json? (Deep Dive)

The new `tsconfig.json` is specifically tailored for the **BuildTrack microservices architecture**. Here's the rationale:

### 1. **TypeScript Compilation Settings**
- `"target": "ES2020"` — Modern JavaScript target compatible with AWS Lambda and Node.js runtimes
- `"module": "commonjs"` — CommonJS modules are required by AWS CDK and Node.js (Lambda doesn't natively support ES modules without workarounds)
- `"lib": ["ES2020"]` — Provides modern JavaScript APIs (Promise, async/await, optional chaining, nullish coalescing, etc.)

### 2. **Strict Type Safety** (Critical for microservices reliability)
- `"strict": true` — Enables all strict type-checking options
- `"noImplicitAny": true` — Prevents implicit `any` types that hide bugs
- `"strictNullChecks": true` — Forces explicit handling of `null` and `undefined`
- `"noUnusedLocals": true` — Catches dead code in services
- `"noUnusedParameters": true` — Ensures all function parameters are used (or prefixed with `_`)

### 3. **Build & Module Configuration**
- `"outDir": "./dist"` — Compiled JavaScript outputs to `dist/` folder (clean separation)
- `"declaration": true` — Generates `.d.ts` type definition files (useful if services import from each other)
- `"esModuleInterop": true` — Allows natural importing of CommonJS modules (e.g., `import express from 'express'`)
- `"resolveJsonModule": true` — Services can read JSON files directly (e.g., `package.json`, config files)
- `"skipLibCheck": true` — Skips type-checking of `node_modules` (faster compilation)

### 4. **Code Quality & Consistency**
- `"forceConsistentCasingInFileNames": true` — Prevents case-sensitivity issues across different OS environments
- `"rootDir": "./"` — Root of source files (allows importing from any service)

### 5. **Exclude Non-Production Code**
- `"exclude": ["node_modules", "cdk.out", "dist", "**/*.test.ts"]` — Prevents TypeScript from compiling:
  - `node_modules` — Already compiled packages
  - `cdk.out` — CDK synthesis output directory
  - `dist` — Previously compiled output
  - `**/*.test.ts` — Test files (handled by Jest separately)

### 6. **Node.js Type Support**
- `"types": ["node"]` — Provides TypeScript type definitions for Node.js APIs (fs, path, process, http, etc.)
  - Essential for Lambda handlers that interact with the file system, environment variables, or native Node APIs

### Why NOT Use Default tsconfig.json?

The default `tsconfig.json` generated by `tsc --init` is **generic and permissive**:
- ❌ Allows implicit `any` types (hides type errors)
- ❌ Doesn't enforce strict null checking (causes runtime errors)
- ❌ Doesn't exclude test files (bloats output)
- ❌ Missing `"types": ["node"]` (no type hints for Node.js APIs)

### What BuildTrack Gains

By using this configuration:
- ✅ **Type Safety** — Catches errors at compile time, not at runtime in Lambda
- ✅ **AWS Lambda Ready** — Compiles to CommonJS, targets modern Node.js runtime
- ✅ **Microservices Consistency** — All 6 services use identical TypeScript settings
- ✅ **Clean Builds** — Output goes to `dist/`, tests are excluded
- ✅ **Developer Experience** — IDE provides full type hints for Node.js APIs

---

## 📦 Package Reference Guide

Below is a comprehensive table of all packages used in the BuildTrack project and their purposes:

| Package | Version | Type | Service(s) Used | Purpose |
|---------|---------|------|-----------------|---------|
| **aws-cdk** | ^2.0.0 | Dev | Root | AWS CDK CLI tool for synthesizing and deploying cloud infrastructure |
| **aws-cdk-lib** | ^2.0.0 | Dev | Root | Core AWS CDK library with constructs for AWS resources |
| **constructs** | ^10.0.0 | Dev | Root | Base library for composable CDK constructs |
| **typescript** | ^5.0.0 | Dev | Root, All Services | TypeScript compiler for converting TS to JavaScript |
| **@types/node** | ^20.0.0 | Dev | Root, All Services | TypeScript type definitions for Node.js built-in APIs |
| **@types/jest** | ^29.0.0 | Dev | Root | TypeScript type definitions for Jest testing framework |
| **@types/uuid** | ^9.0.0 | Dev | Projects, Workers, Materials, Progress, Dashboard | TypeScript type definitions for UUID library |
| **ts-node** | ^10.0.0 | Dev | Root, All Services | Runtime for executing TypeScript directly without compilation |
| **jest** | ^29.0.0 | Dev | Root | Testing framework for unit and integration tests |
| **ts-jest** | ^29.0.0 | Dev | Root | TypeScript preprocessor for Jest |
| **eslint** | ^8.0.0 | Dev | Root | Static code analysis tool for finding bugs and style issues |
| **@typescript-eslint/parser** | ^6.0.0 | Dev | Root | ESLint parser that understands TypeScript syntax |
| **@typescript-eslint/eslint-plugin** | ^6.0.0 | Dev | Root | ESLint rules specific to TypeScript |
| **prettier** | ^3.0.0 | Dev | Root | Code formatter for consistent code style |
| **hono** | ^4.0.0 | Production | Auth, Projects, Workers, Materials, Progress, Dashboard | Lightweight HTTP framework for building REST APIs |
| **@hono/node-server** | ^1.0.0 | Production | Projects, Materials, Progress | Hono server adapter for Node.js environments |
| **@aws-sdk/client-cognito-identity-provider** | ^3.0.0 | Production | Auth | AWS SDK client for Amazon Cognito (user authentication & management) |
| **@aws-sdk/client-dynamodb** | ^3.0.0 | Production | Projects, Workers, Materials, Progress, Dashboard | AWS SDK client for DynamoDB (NoSQL database operations) |
| **@aws-sdk/util-dynamodb** | ^3.0.0 | Production | Projects, Workers, Materials, Progress, Dashboard | Utility functions to convert between DynamoDB and JavaScript types |
| **@aws-sdk/client-s3** | ^3.0.0 | Production | Projects, Materials, Progress | AWS SDK client for Amazon S3 (object storage) |
| **@aws-sdk/s3-request-presigner** | ^3.0.0 | Production | Projects, Materials, Progress | Utility to generate pre-signed URLs for S3 access |
| **uuid** | ^9.0.0 | Production | Projects, Workers, Materials, Progress, Dashboard | Library for generating unique identifiers (UUIDs/GUIDs) |
| **zod** | ^3.0.0 | Production | Auth, Projects, Workers, Materials, Progress, Dashboard | Runtime type validation and schema definition library |

### Package Category Breakdown

**Infrastructure & Deployment (Root Only):**
- `aws-cdk`, `aws-cdk-lib`, `constructs` — Define and deploy AWS resources

**Development Tools:**
- `typescript`, `ts-node`, `@types/node` — TypeScript compilation and execution
- `jest`, `ts-jest`, `@types/jest` — Testing framework
- `eslint`, `@typescript-eslint/*`, `prettier` — Code quality and formatting

**Core Application Libraries (All Services):**
- `hono` — Lightweight HTTP server framework
- `zod` — Request/response validation
- `uuid` — Unique identifier generation

**AWS Integration (Service-Specific):**
- Auth Service: Cognito for authentication
- Projects/Materials/Progress: DynamoDB + S3 for data and file storage
- Workers/Dashboard: DynamoDB for data querying
- All storage services: S3 pre-signing for secure file access
