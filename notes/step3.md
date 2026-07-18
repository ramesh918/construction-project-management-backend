# Step 3 — AWS Account Configuration

---

## 3.1 Set Up Billing Alert (Do this FIRST)

1. Sign in to AWS Console
2. Top-right → your account name → **Billing and Cost Management**
3. Left sidebar → **Budgets** → **Create budget**
4. Choose **Cost budget**
5. Name: `buildtrack-monthly-limit`
6. Period: Monthly | Amount: `$10`
7. Alert threshold: `80%` → enter your email
8. Click **Create budget**

> ⚠️ This protects you from unexpected charges. Never skip this step.

---

## 3.2 Create IAM User

1. AWS Console → **IAM** → **Users** → **Create user**
2. Username: `buildtrack-developer`
3. Click **Next**
4. Select **Attach policies directly**
5. Search and attach: `AdministratorAccess`
6. Click **Next** → **Create user**

---

## 3.3 Generate Access Keys

1. Click on user `buildtrack-developer`
2. Go to **Security credentials** tab
3. Click **Create access key**
4. Use case: **Command Line Interface (CLI)**
5. Check the confirmation checkbox
6. Click **Next** → **Create access key**
7. **Download the .csv file immediately** — you cannot view the secret key again
8. Keep this file SECURE — never share it, never commit it to GitHub

---

## 3.4 Download and Install AWS CLI

### macOS

```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
```

Or via Homebrew:
```bash
brew install awscli
```

### Windows

1. Download the installer: [AWS CLI MSI installer for Windows (64-bit)](https://awscli.amazonaws.com/AWSCLIV2.msi)
2. Run the downloaded `.msi` file and follow the prompts
3. Open a new Command Prompt or PowerShell window after installation

### Linux (x86_64)

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### Verify Installation

```bash
aws --version
```

Expected output:
```
aws-cli/2.x.x Python/3.x.x ...
```

---

## 3.5 Configure AWS CLI

Run in terminal:
```bash
aws configure
```

Enter when prompted:
```
AWS Access Key ID:     AKIA...your key...
AWS Secret Access Key: your-secret-key
Default region name:   us-east-1
Default output format: json
```

Verify it works:
```bash
aws sts get-caller-identity
```

Expected output:
```json
{
  "UserId": "AIDA...",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/buildtrack-developer"
}
```

> Save your **Account ID** — you'll need it for CDK bootstrap in the next step.

---

## 3.6 Install AWS CDK CLI

Node.js and npm are required. Verify first:
```bash
node --version
npm --version
```

Install the CDK CLI globally:
```bash
npm install -g aws-cdk
```

Verify installation:
```bash
cdk --version
```

Expected output:
```
2.x.x (build xxxxxxx)
```

> If you get `command not found: cdk`, close and reopen your terminal, then retry.

---

## 3.7 Bootstrap CDK

```bash
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

Replace `YOUR_ACCOUNT_ID` with the number from step 3.5 (`aws sts get-caller-identity`).

Example:
```bash
cdk bootstrap aws://333888905517/us-east-1
```

Expected output:
```
✅  Environment aws://123456789012/us-east-1 bootstrapped.
```

> This only needs to be run once per AWS account per region.

---

## 3.8 Understanding CDK Bootstrapping

### What is CDK Bootstrapping?

CDK bootstrapping is the process of preparing an AWS environment (account + region) so it can deploy AWS CDK applications. When you run `cdk bootstrap`, it prepares your AWS account with the necessary infrastructure to support CDK deployments.

### What Does It Do?

When you run `cdk bootstrap`, it:
- Creates an **S3 bucket** to store CloudFormation templates and application assets
- Sets up **IAM roles** with necessary permissions for CloudFormation to deploy resources
- Creates other infrastructure needed to support CDK deployments in that region

### Why Is It Needed?

The CDK generates CloudFormation templates under the hood. To deploy these templates, CloudFormation needs:
- A place to store templates and application assets (the S3 bucket)
- Permissions to create AWS resources (IAM roles)

Without bootstrapping, your first `cdk deploy` would fail because this infrastructure doesn't exist yet.

### Bootstrap Commands

```bash
# Bootstrap the default account/region
cdk bootstrap

# Bootstrap a specific AWS account and region
cdk bootstrap aws://ACCOUNT-ID/REGION

# Example
cdk bootstrap aws://123456789012/us-east-1
```

### Key Points to Remember

- **One-time per account/region**: You only need to bootstrap once per AWS account and region combination. If you deploy to multiple regions, you'll need to bootstrap each region separately.
- **CloudFormation stack**: The bootstrap process creates a CloudFormation stack named `CDKToolkit` that you can see in the CloudFormation console.
- **Versioning**: Different CDK versions might create slightly different bootstrap stacks; you can update by re-bootstrapping.
- **S3 bucket naming**: The S3 bucket created follows the pattern: `cdk-hnb659fds-${account-id}-${region}`
- **Think of it as "preparing the landing zone"** before deploying your CDK infrastructure.

---

## 3.9 AWS CDK Bootstrap Assets Explained

### What Are Bootstrap Assets?

During CDK bootstrap and deployments, you may notice files appearing in your S3 bucket. These are **CDK bootstrap assets** — they are:

1. **ZIP files** — Packaged Lambda functions or other asset code that CloudFormation needs to deploy
2. **JSON files** — CloudFormation templates or asset manifests that describe what resources to create

The S3 bucket created follows the naming pattern: `cdk-hnb659fds-<account-id>-<region>` (e.g., `cdk-hnb659fds-333888905517-us-east-1`)

### Why Are They Required?

**During CDK bootstrap**, the `cdk bootstrap` command:
- Creates the S3 bucket to store compiled assets
- Sets up IAM roles for CloudFormation to access these assets
- Prepares the AWS account/region to deploy CDK stacks

**During stack deployment**, CDK:
- Compiles your TypeScript/JavaScript code into CloudFormation templates
- Packages any Lambda code, Docker images, or other assets
- **Uploads them to this S3 bucket** (the files you see)
- References these S3 URIs in the CloudFormation stack
- CloudFormation pulls from S3 when deploying resources

### How It Works

```
Your CDK Code
    ↓
CDK Synthesis (cdk synth)
    ↓
Assets uploaded to S3 bucket (these files)
    ↓
CloudFormation stack created with S3 references
    ↓
CloudFormation deploys using S3 artifacts
```

### Understanding the File Names

The hash-based names (e.g., `46dc1095...zip` or `a5e4c14ec...json`) are **content-addressed**:
- Same code = Same hash = CDK can reuse or skip re-uploading
- Different code = Different hash
- This prevents unnecessary uploads and enables caching

### Key Points to Remember

- **One bucket per region** — The bucket is region-specific (notice the region suffix like `-us-east-1`)
- **Temporary or persistent** — These files stay in S3 as long as your CloudFormation stacks reference them
- **Safe to clean up later** — Only delete files if you've deleted the associated CloudFormation stacks
- **Normal and expected** — This is entirely expected behavior during CDK deployments

### Example Scenario

When you deploy a CDK stack with a Lambda function:
1. CDK packages your Lambda code
2. Creates a ZIP file (e.g., `46dc1095...zip`)
3. Uploads it to S3
4. Creates a JSON CloudFormation template that references the S3 URI
5. CloudFormation reads the template and deploys the Lambda using the S3 ZIP

---

## Checkpoints Before Moving to Step 4

- [ ] Billing alert is active ($10 monthly budget)
- [ ] IAM user `buildtrack-developer` created with `AdministratorAccess`
- [ ] Access key .csv downloaded and stored securely
- [ ] AWS CLI installed (`aws --version` works)
- [ ] `aws sts get-caller-identity` returns your account info
- [ ] AWS CDK CLI installed (`cdk --version` works)
- [ ] CDK bootstrap shows the green checkmark
