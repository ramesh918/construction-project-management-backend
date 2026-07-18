# Step 4 — Project Initialization

---

## 4.1 Create Project Directory

Open your terminal and run:
```bash
mkdir buildtrack
cd buildtrack
```

---

## 4.2 Initialize CDK Project

```bash
cdk init app --language typescript
```

This auto-generates the following structure:
```
buildtrack/
├── bin/
│   └── buildtrack.ts       ← CDK app entry point
├── lib/
│   └── buildtrack-stack.ts ← main stack (we'll rewrite this)
├── test/
│   └── buildtrack.test.ts  ← CDK tests (leave for now)
├── .gitignore
├── cdk.json
├── jest.config.js
├── package.json
├── tsconfig.json
└── node_modules/
```

---

## 4.3 Verify CDK Works

```bash
cdk synth
```

Should print a CloudFormation template with **no errors**.
If it errors → check your Node.js version and CDK installation.

---

## 4.4 Update bin/buildtrack.ts

Open `bin/buildtrack.ts` and **replace all content** with:

```typescript
import * as cdk from 'aws-cdk-lib';
import { BuildTrackStack } from '../lib/buildtrack-stack';

const app = new cdk.App();

new BuildTrackStack(app, 'BuildTrackStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'BuildTrack Construction Management App',
});
```

---

## 4.5 Update lib/buildtrack-stack.ts

Open `lib/buildtrack-stack.ts` and **replace all content** with:

```typescript
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class BuildTrackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // Resources will be added step by step
  }
}
```

---

## 4.6 Fix `process` Red Error in bin/buildtrack.ts

After updating `bin/buildtrack.ts`, you may see a red squiggle under `process`.
This happens because `@types/node` is not installed. Fix it by running:

```bash
npm install --save-dev @types/node
```

After installing, also add `"types": ["node"]` to `tsconfig.json` inside `compilerOptions`:

```json
"typeRoots": [
  "./node_modules/@types"
],
"types": [
  "node"
]
```

The red error on `process.env.CDK_DEFAULT_ACCOUNT` and `process.env.CDK_DEFAULT_REGION` will disappear once both steps are done.

---

## Checkpoints Before Moving to Step 5

- [ ] `buildtrack/` folder created and you are inside it
- [ ] `cdk init` completed with no errors
- [ ] `cdk synth` prints CloudFormation template with no errors
- [ ] `bin/buildtrack.ts` updated with env config
- [ ] `lib/buildtrack-stack.ts` replaced with empty stack
- [ ] `npm install --save-dev @types/node` run — red error on `process` is gone
