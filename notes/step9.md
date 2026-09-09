# Step 9 — CDK Stack: S3

---

## What You Are Doing

Add an S3 bucket to `lib/buildtrack-stack.ts`.
This bucket stores all file uploads: project documents, progress photos, material bills.

> ⚠️ Do NOT replace the whole file — just add the S3 code inside the constructor, after the DynamoDB section.

---

## 9.1 Add S3 Import

At the top of `lib/buildtrack-stack.ts`, add the S3 import alongside the existing ones:

```typescript
import * as s3 from 'aws-cdk-lib/aws-s3';
```

Your imports section should now look like:

```typescript
import * as cdk      from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3       from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
```

---

## 9.2 Add S3 Bucket Code

Inside the constructor, **after** the DynamoDB `CfnOutput` block, add:

```typescript
// ────────────────────────────────────────────────
// S3 Bucket — all file uploads
// Folders: project-documents/ progress-photos/ material-bills/ worker-documents/
// ────────────────────────────────────────────────
const bucket = new s3.Bucket(this, 'BuildTrackBucket', {
  bucketName:    `buildtrack-files-${this.account}`, // account ID suffix = globally unique
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  versioned:     true,             // protect against accidental overwrites

  cors: [{
    allowedMethods: [
      s3.HttpMethods.GET,
      s3.HttpMethods.PUT,
      s3.HttpMethods.POST,
    ],
    allowedOrigins: ['*'],         // restrict to your domain in production
    allowedHeaders: ['*'],
    maxAge:         3000,
  }],

  lifecycleRules: [
    {
      // Move old progress photos to cheaper storage after 90 days
      id:      'archive-old-photos',
      prefix:  'progress-photos/',
      enabled: true,
      transitions: [{
        storageClass:    s3.StorageClass.INFREQUENT_ACCESS,
        transitionAfter: cdk.Duration.days(90),
      }],
    },
    {
      // Clean up any abandoned temp uploads after 1 day
      id:         'expire-temp-uploads',
      prefix:     'temp/',
      enabled:    true,
      expiration: cdk.Duration.days(1),
    },
  ],
});

new cdk.CfnOutput(this, 'BucketName', {
  value:       bucket.bucketName,
  description: 'S3 bucket name',
});
```

---

## 9.3 Verify It Compiles

```bash
cdk synth
```

Expected: CloudFormation template includes both the DynamoDB table and the S3 bucket with no errors.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---------|--------------|
| `${this.account}` | Appends your AWS account ID — makes bucket name globally unique |
| `versioned: true` | Keeps previous versions of files — protects against accidental overwrites |
| CORS | Allows browser uploads directly to S3 via presigned URLs |
| `lifecycleRules` | Automatically moves/deletes old files to save storage costs |
| INFREQUENT_ACCESS | Cheaper S3 storage tier for files rarely accessed |
| RETAIN | Bucket is NOT deleted if you run `cdk destroy` |

---

## Checkpoints Before Moving to Step 10

- [ ] S3 import added at the top of `lib/buildtrack-stack.ts`
- [ ] S3 bucket code added inside the constructor (after DynamoDB section)
- [ ] `cdk synth` runs with no errors
- [ ] Output includes both `TableName` and `BucketName`

---

## Deep Dive: S3 Bucket Options Explained

This section provides a detailed explanation of every option used in the S3 bucket configuration.

### **Main Bucket Configuration**

#### `bucketName: 'buildtrack-files-${this.account}'`
- **What it does:** Sets the S3 bucket name with your AWS account ID appended
- **Why:** S3 bucket names must be globally unique across ALL AWS accounts worldwide. By appending `${this.account}` (your 12-digit account ID), the bucket name is guaranteed to be unique
- **Example:** If your account ID is 123456789012, bucket becomes `buildtrack-files-123456789012`

#### `removalPolicy: cdk.RemovalPolicy.RETAIN`
- **What it does:** Tells CDK to KEEP the S3 bucket when you run `cdk destroy`
- **Why:** S3 buckets often contain important data. `RETAIN` prevents accidental data loss when tearing down your infrastructure. Other options are `DESTROY` (delete everything) or `SNAPSHOT` (backup first)
- **Impact:** When you delete the CDK stack, the bucket persists in AWS

#### `versioned: true`
- **What it does:** Enables versioning on the bucket — keeps multiple versions of every file
- **Why:** Protects against accidental overwrites and deletions. If a file is overwritten or deleted, you can restore the previous version
- **Use case:** Project documents in a construction project shouldn't be lost if someone uploads a wrong file

---

### **CORS Configuration**

```typescript
cors: [{
  allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
  allowedOrigins: ['*'],
  allowedHeaders: ['*'],
  maxAge: 3000,
}]
```

#### `allowedMethods`
- **What it does:** Specifies which HTTP methods browsers are allowed to use when accessing this bucket
  - **GET:** Read/download files
  - **PUT:** Upload files directly
  - **POST:** Form submissions
- **Why:** Without these, a web app couldn't upload files directly from the browser to S3 (browsers block cross-origin requests for security)

#### `allowedOrigins: ['*']`
- **What it does:** Allows requests from ANY domain/origin
- **Why:** During development, you might test from localhost, deployed domains, etc. The `*` wildcard means no origin restriction
- **⚠️ Security Warning:** In production, replace `'*'` with your actual domain(s): `['https://yourdomain.com']`

#### `allowedHeaders: ['*']`
- **What it does:** Allows any HTTP headers to be sent with requests
- **Why:** Requests to S3 may include custom headers (authentication, content-type, etc.). `*` wildcard allows all
- **Production:** Could restrict to specific headers if needed

#### `maxAge: 3000`
- **What it does:** Browsers cache CORS preflight responses for 3000 seconds (50 minutes)
- **Why:** Reduces repeated preflight checks. Every cross-origin request first sends an `OPTIONS` preflight. If valid, the result is cached for 50 minutes, saving network calls
- **Trade-off:** Higher values = fewer preflight requests but slower policy updates

---

### **Lifecycle Rules**

Lifecycle rules automatically manage files based on age and prefix (folder path).

#### **Rule 1: Archive Old Progress Photos**

```typescript
{
  id: 'archive-old-photos',
  prefix: 'progress-photos/',
  enabled: true,
  transitions: [{
    storageClass: s3.StorageClass.INFREQUENT_ACCESS,
    transitionAfter: cdk.Duration.days(90),
  }],
}
```

| Option | Meaning | Why |
|--------|---------|-----|
| `id: 'archive-old-photos'` | Unique identifier for this rule | For tracking and management |
| `prefix: 'progress-photos/'` | Only applies to files in the `progress-photos/` folder | Target specific data types, not everything |
| `enabled: true` | This rule is active | Can disable without deleting the rule |
| `storageClass: INFREQUENT_ACCESS` | Move files to cheaper storage tier (~50% cheaper) | Progress photos are rarely viewed after 90 days, waste money staying in Standard |
| `transitionAfter: cdk.Duration.days(90)` | After 90 days, apply the storage class change | Balance: keep recent photos in fast Standard storage, archive older ones |

**Real cost impact:** Moving 1 GB of photos saves ~$0.23/month forever.

#### **Rule 2: Expire Temporary Uploads**

```typescript
{
  id: 'expire-temp-uploads',
  prefix: 'temp/',
  enabled: true,
  expiration: cdk.Duration.days(1),
}
```

| Option | Meaning | Why |
|--------|---------|-----|
| `id: 'expire-temp-uploads'` | Rule identifier | For tracking |
| `prefix: 'temp/'` | Only files in `temp/` folder | Prevents accidental cleanup of actual project data |
| `enabled: true` | Rule is active | Can toggle without deleting |
| `expiration: cdk.Duration.days(1)` | Permanently delete files after 1 day | Cleans up abandoned/failed uploads, saves storage costs |

**Use case:** If a user uploads a large file but cancels, it sits in `temp/` for 1 day then auto-deletes instead of accumulating old junk.

---

### **Output**

```typescript
new cdk.CfnOutput(this, 'BucketName', {
  value: bucket.bucketName,
  description: 'S3 bucket name',
});
```

- **What it does:** Prints the bucket name to the CDK deploy output
- **Why:** So you know the exact bucket name for your application code and AWS Console

---

### **Quick Summary Table**

| Configuration | Purpose | Benefit |
|---|---|---|
| `bucketName` with account ID | Global uniqueness | No naming conflicts across AWS |
| `RETAIN` removal policy | Data safety | Prevents accidental bucket deletion |
| `versioned: true` | File protection | Recover from overwrites/deletes |
| **CORS** | Browser uploads | Direct S3 upload from web app |
| **Lifecycle Rule 1** | Cost optimization | Cheaper storage for old photos |
| **Lifecycle Rule 2** | Storage cleanup | Prevent temp file clutter |

---

## S3 Storage Classifications: Complete Reference

| Storage Class | Monthly Cost per GB | Retrieval Time | Min. Storage Duration | Retrieval Fee | Use Case | Best For |
|---|---|---|---|---|---|---|
| **S3 Standard** | $0.023 | Immediate | None | None | Frequently accessed data, real-time applications | Hot data: active projects, current documents |
| **S3 Standard-IA** | $0.0125 | Immediate | 30 days | $0.01/GB | Infrequently accessed but needs quick retrieval | Backups, archived projects (90+ days old) |
| **S3 One Zone-IA** | $0.01 | Immediate | 30 days | $0.01/GB | Non-critical infrequent access, single region | Non-critical archives, temporary storage |
| **S3 Intelligent-Tiering** | $0.0125 | Immediate (Frequent) | 0 days | Varies by tier | Unknown or changing access patterns | Unpredictable workloads, auto cost optimization |
| **S3 Glacier Instant** | $0.004 | Immediate | 90 days | $0.03/GB | Quarterly/annual reviews, compliance archives | Archived project documents (3-12 months old) |
| **S3 Glacier Flexible** | $0.0036 | 1-5 minutes (Standard) | 90 days | $0.03/GB | Long-term archives, disaster recovery | Project archives (1+ year), legal holds |
| **S3 Glacier Deep Archive** | $0.00099 | 12 hours (Standard) | 180 days | $0.03/GB | 7-10 year legal retention, disaster recovery | Long-term compliance archives (5+ years) |

### **Storage Class Selection Guide for BuildTrack**

#### **Active Projects (Frequent Access)**
- **Use:** `S3 Standard`
- **Duration:** Keep here for 0-90 days
- **Cost impact:** Highest per-GB, but no retrieval fees
- **Example:** Current progress photos, recent project documents

#### **Recent Archives (Occasional Access)**
- **Use:** `S3 Standard-IA` or `S3 Intelligent-Tiering`
- **Duration:** Keep here for 90 days - 1 year
- **Cost impact:** 46% cheaper than Standard, small retrieval fee
- **Example:** Completed projects' documents (used occasionally for reference)

#### **Old Archives (Rare Access)**
- **Use:** `S3 Glacier Instant` or `S3 Glacier Flexible`
- **Duration:** Keep for 1-7 years
- **Cost impact:** 82-84% cheaper than Standard
- **Retrieval time:** Instant to 5 minutes
- **Example:** Multi-year project archives, compliance records

#### **Long-Term Compliance (Legal Hold)**
- **Use:** `S3 Glacier Deep Archive`
- **Duration:** 7-10+ years
- **Cost impact:** 96% cheaper than Standard
- **Retrieval time:** 12 hours
- **Example:** Final audits, legal documentation for completed projects

### **Lifecycle Strategy for BuildTrack**

```
Day 0 → Day 90:        S3 Standard         ($0.023/GB/month)
Day 90 → Day 365:      S3 Standard-IA      ($0.0125/GB/month) ← Currently in step 9
Day 365 → Day 2555:    S3 Glacier Instant  ($0.004/GB/month)
Day 2555+:             S3 Glacier Deep Arch ($0.00099/GB/month)
```

**Cost Savings Example (1 TB project archive):**
- Staying in Standard for 1 year: 1000 GB × $0.023 × 12 = **$276/year**
- Using lifecycle strategy: (90d×$0.023 + 275d×$0.0125 + 365d×$0.004 + rest) = **~$41/year** (85% savings)

---
