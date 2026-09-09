# Step 13 — First Deployment

---

## What You Are Doing

Deploy the entire infrastructure to AWS for the first time.
This creates all resources — DynamoDB, S3, Cognito, 6 Lambda functions, and API Gateway — in your AWS account.

> ⚠️ Run all commands from inside the `buildtrack` project folder.

---

## 13.1 Verify TypeScript Compiles

```bash
npm run build
```

Fix any TypeScript errors before proceeding. Do NOT move on if this fails.

---

## 13.2 Synthesize CloudFormation

```bash
cdk synth
```

This converts your CDK code into a CloudFormation template.  
Expected output includes resources for: DynamoDB, S3, Cognito, Lambda (×6), and API Gateway — with **no errors and no warnings**.

---

## 13.3 Review What Will Be Created

```bash
cdk diff
```

This shows every resource CDK will create. Review it before deploying.  
On first deploy you will see a large list — that is normal.

---

## 13.4 Deploy

```bash
cdk deploy
```

- When prompted `Do you wish to deploy these changes (y/n)?` — type **y** and press Enter
- Deployment takes **3–5 minutes**
- Watch the progress printed in the terminal

---

## 13.5 Save the Output Values

After deployment finishes, CDK prints the stack outputs. **Save these — you need them in later steps.**

Example output:
```
BuildTrackStack.ApiUrl           = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/v1/
BuildTrackStack.TableName        = buildtrack
BuildTrackStack.BucketName       = buildtrack-files-123456789012
BuildTrackStack.UserPoolId       = us-east-1_xxxxxxxxx
BuildTrackStack.UserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx
```

Create a file `.env.local` in the project root to store them (this file is already in `.gitignore`):

```
API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/v1
TABLE_NAME=buildtrack
BUCKET_NAME=buildtrack-files-123456789012
USER_POOL_ID=us-east-1_xxxxxxxxx
USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Replace the example values with the actual values from your terminal output.

---

## 13.6 Verify in AWS Console

Open the [AWS Console](https://console.aws.amazon.com) and confirm each resource was created:

| Service | What to Check |
|---------|--------------|
| **DynamoDB** | Tables → `buildtrack` exists, has `GSI1` and `GSI2` indexes |
| **S3** | Buckets → `buildtrack-files-<your-account-id>` exists |
| **Cognito** | User Pools → `buildtrack-users` exists, has `admin` and `user` groups |
| **Lambda** | Functions → 6 functions named `BuildTrack-AuthFn`, `BuildTrack-ProjectsFn`, etc. |
| **API Gateway** | APIs → `buildtrack-api` exists with routes: `/auth`, `/projects`, `/workers`, `/materials`, `/progress`, `/dashboard` |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `ExpiredTokenException` | AWS credentials have expired | Run `aws configure` or refresh your SSO session |
| `Bootstrap stack not found` | CDK bootstrapping was not done | Run `cdk bootstrap` once, then `cdk deploy` again |
| `Policy contains a statement with one or more invalid principals` | IAM role wasn't fully created yet | Wait 30 seconds and re-run `cdk deploy` |
| `npm run build` TypeScript errors | Type errors in `buildtrack-stack.ts` | Read the error, fix the line it points to, then re-run |
| `cdk synth` fails after adding API Gateway | Missing import or variable out of scope | Confirm `import * as apigateway` is at the top of the file |

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---------|--------------|
| `cdk synth` | Converts CDK TypeScript → CloudFormation JSON/YAML template (local only, nothing deployed) |
| `cdk diff` | Compares current deployed stack against local template — shows what will change |
| `cdk deploy` | Uploads the template to CloudFormation and creates/updates all AWS resources |
| `CfnOutput` | Values printed at the end of deployment — your live resource IDs and URLs |
| `.env.local` | Local file to store output values — never commit this to git |

---

## Checkpoints Before Moving to Step 14

- [ ] `npm run build` runs with no TypeScript errors
- [ ] `cdk synth` runs with no errors and no warnings
- [ ] `cdk diff` reviewed — large resource list on first deploy is expected
- [ ] `cdk deploy` completed successfully
- [ ] All 5 output values saved to `.env.local`
- [ ] AWS Console verified: DynamoDB, S3, Cognito, 6 Lambda functions, API Gateway all exist



### something went wrong in creating resource
#### Delete the rolled-back stack first
aws cloudformation delete-stack --stack-name BuildTrackStack