import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';


export class BuildTrackStack extends cdk.Stack {
  // Expose table for cross-reference in Lambda env vars
  public readonly table: dynamodb.Table;


  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ────────────────────────────────────────────────
    // DynamoDB — single table design
    // PK = entity type + id  e.g. PROJECT#PRJ001
    // SK = record type + id  e.g. PROFILE, COST#SUMMARY
    // ────────────────────────────────────────────────
    this.table = new dynamodb.Table(this, 'BuildTrackTable', {
      tableName: 'buildtrack',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,   // never delete data on stack destroy
      pointInTimeRecovery: true,                        // 35-day backup window
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI1 — query by project (e.g. all attendance for PROJECT#PRJ001)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2 — query by date (e.g. all progress logs on 2024-01-15)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output the table name for reference
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name',
    });



    // ────────────────────────────────────────────────
    // S3 Bucket — all file uploads
    // Folders: project-documents/ progress-photos/ material-bills/ worker-documents/
    // ────────────────────────────────────────────────
    const bucket = new s3.Bucket(this, 'BuildTrackBucket', {
      bucketName: `buildtrack-files-${this.account}`, // account ID suffix = globally unique
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,             // protect against accidental overwrites

      cors: [{
        allowedMethods: [
          s3.HttpMethods.GET,
          s3.HttpMethods.PUT,
          s3.HttpMethods.POST,
        ],
        allowedOrigins: ['*'],         // restrict to your domain in production
        allowedHeaders: ['*'],
        maxAge: 3000,
      }],

      lifecycleRules: [
        {
          // Move old progress photos to cheaper storage after 90 days
          id: 'archive-old-photos',
          prefix: 'progress-photos/',
          enabled: true,
          transitions: [{
            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
            transitionAfter: cdk.Duration.days(90),
          }],
        },
        {
          // Clean up any abandoned temp uploads after 1 day
          id: 'expire-temp-uploads',
          prefix: 'temp/',
          enabled: true,
          expiration: cdk.Duration.days(1),
        },
      ],
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket name',
    });

    //────────────────────────────────────────────────
    // Cognito User Pool — authentication
    // Admin creates users (no self sign-up)
    // Two groups: admin, user
    // ────────────────────────────────────────────────

    // CREATE USER POOL
    const userPool = new cognito.UserPool(this, 'BuildTrackUserPool', {
      // Display name shown in AWS Console
      userPoolName: 'buildtrack-users',

      // SIGNUP SETTINGS
      // false = Users CANNOT self-register (only admin creates accounts)
      // true = Users CAN create their own accounts
      selfSignUpEnabled: false,

      // SIGNIN METHOD
      // { email: true } = Users sign in using email (not username)
      // Could also use: { username: true } or { phoneNumber: true }
      signInAliases: { email: true },

      // USER PROFILE ATTRIBUTES
      standardAttributes: {
        // email: Required field that users can modify
        // - required: true = Must be provided when creating account
        // - mutable: true = User can update their email later
        email: { required: true, mutable: true },

        // fullname: Optional field that users can modify
        // - required: false = Not mandatory during signup
        // - mutable: true = User can update their name
        fullname: { required: false, mutable: true },
      },

      // PASSWORD COMPLEXITY REQUIREMENTS
      passwordPolicy: {
        // Minimum 8 characters (password must be at least 8 chars long)
        minLength: 8,

        // true = Must contain lowercase letters (a-z)
        requireLowercase: true,

        // true = Must contain uppercase letters (A-Z)
        requireUppercase: true,

        // true = Must contain numbers (0-9)
        requireDigits: true,

        // false = Special characters NOT required (e.g., !@#$%^&*)
        // true = Would require at least one special character
        requireSymbols: false,
      },

      // ACCOUNT RECOVERY METHOD
      // EMAIL_ONLY = User can reset password via email link
      // Other options: SMS_ONLY, EMAIL_AND_SMS, PRIORITY_EMAIL_ONLY, PRIORITY_SMS_ONLY
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // DELETION POLICY
      // RETAIN = When cdk destroy runs, User Pool is NOT deleted (protects user data)
      // DESTROY = Pool would be deleted (not recommended for production)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ────────────────────────────────────────────────
    // CREATE APP CLIENT
    // This allows your frontend app to authenticate with the User Pool
    // ────────────────────────────────────────────────

    const userPoolClient = new cognito.UserPoolClient(this, 'BuildTrackClient', {
      // Link this client to the User Pool created above
      userPool,

      // Display name for this client in AWS Console
      userPoolClientName: 'buildtrack-app-client',

      // AUTHENTICATION METHODS ENABLED
      authFlows: {
        // USER_PASSWORD_AUTH
        // - User sends email + password directly to sign in
        // - Simpler but less secure (credentials sent to backend)
        // - Good for: Web apps, simple login flows
        userPassword: true,

        // USER_SRP_AUTH (Secure Remote Password)
        // - More secure protocol, password never sent in plaintext
        // - Better for: Mobile apps, web apps
        // - Recommended for production
        userSrp: true,

        // ADMIN_USER_PASSWORD_AUTH
        // - Backend can sign in user with their password
        // - Used for: Server-to-server authentication
        // - Must be called from backend only (not frontend)
        adminUserPassword: true,
      },

      // ACCESS TOKEN EXPIRY
      // Duration.hours(1) = Access token valid for 1 hour
      // After 1 hour, token expires and user must refresh
      // Lower value = More secure but more refresh calls
      // Higher value = Less frequent refresh but less secure
      accessTokenValidity: cdk.Duration.hours(1),

      // ID TOKEN EXPIRY
      // Duration.hours(1) = ID token (contains user info) valid for 1 hour
      // Usually same as accessTokenValidity
      idTokenValidity: cdk.Duration.hours(1),

      // REFRESH TOKEN EXPIRY
      // Duration.days(30) = Refresh token valid for 30 days
      // After 30 days, user must log in again
      // Refresh tokens don't expire on use (unlike access tokens)
      refreshTokenValidity: cdk.Duration.days(30),

      // CLIENT SECRET
      // false = No client secret generated (for browser/mobile apps)
      //   - Public clients can't securely store secrets
      //   - Browser apps (React, Vue) should use false
      // true = Client secret generated (for backend apps)
      //   - Backend can securely store secrets
      //   - Use for Node.js, Python backends
      generateSecret: false,
    });

    // ────────────────────────────────────────────────
    // CREATE USER GROUPS
    // Groups control what users can do (authorization)
    // ────────────────────────────────────────────────

    // ADMIN GROUP - Full access
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      // Which User Pool this group belongs to
      userPoolId: userPool.userPoolId,

      // Group name (used in code to check permissions)
      // if (user.groups.includes('admin')) { ... }
      groupName: 'admin',

      // Readable description of what this group can do
      description: 'Full access — manage all resources',

      // Priority level: 1 = HIGHEST priority
      // If user in multiple groups, LOWEST number wins
      // Ensures admins always get admin permissions
      precedence: 1,
    });

    // USER GROUP - Limited access
    new cognito.CfnUserPoolGroup(this, 'UserGroup', {
      // Which User Pool this group belongs to
      userPoolId: userPool.userPoolId,

      // Group name (used in code to check permissions)
      // if (user.groups.includes('user')) { ... }
      groupName: 'user',

      // Readable description (field-level access only)
      description: 'Field access — update progress and attendance only',

      // Priority level: 2 = LOWER priority than admin
      // Regular users have standard permissions
      precedence: 2,
    });

    // ────────────────────────────────────────────────
    // OUTPUTS
    // Display important IDs needed for frontend configuration
    // ────────────────────────────────────────────────

    // User Pool ID Output
    new cdk.CfnOutput(this, 'UserPoolId', {
      // The actual User Pool ID value (AWS generated)
      value: userPool.userPoolId,

      // Description shown in CloudFormation outputs
      description: 'Cognito User Pool ID',
      // Visible in: AWS Console, cdk deploy output, CloudFormation stack
      // Use this to: Configure AWS Amplify, create custom integrations
    });

    // App Client ID Output
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      // The actual App Client ID (needed by frontend)
      value: userPoolClient.userPoolClientId,

      // Description shown in CloudFormation outputs
      description: 'Cognito App Client ID',
      // Visible in: AWS Console, cdk deploy output
      // Use this: In React/Vue frontend environment variables
      // Example: REACT_APP_COGNITO_CLIENT_ID=<this-value>
    });



    // ────────────────────────────────────────────────
    // Shared environment — passed to every Lambda
    // ────────────────────────────────────────────────
    const sharedEnv = {
      // DynamoDB table name — all Lambda functions read/write to this table
      TABLE_NAME: this.table.tableName,
      // S3 bucket name — used for storing files (blueprints, bills, photos)
      BUCKET_NAME: bucket.bucketName,
      // Cognito user pool ID — used by auth service to authenticate users
      USER_POOL_ID: userPool.userPoolId,
      // Cognito user pool client ID — used by auth service to validate tokens
      USER_POOL_CLIENT: userPoolClient.userPoolClientId,
      // Environment indicator — tells Lambda code whether it's running in prod/dev
      NODE_ENV: 'production',
    };

    // ────────────────────────────────────────────────
    // Lambda helper — reusable factory function to create Lambda functions with consistent config
    // ────────────────────────────────────────────────
    const makeLambda = (
      // Function name (e.g., 'AuthFn', 'ProjectsFn') — used in CloudFormation logical ID
      name: string,
      // File path to the Lambda handler entry point (relative to repo root)
      entry: string,
      // Optional extra environment variables specific to this function
      extraEnv?: Record<string, string>,
    ): NodejsFunction =>
      new NodejsFunction(this, name, {
        // CloudFormation-friendly name; concatenates with 'BuildTrack-' prefix for AWS naming
        functionName: `BuildTrack-${name}`,
        // Node.js runtime version — 20.x is the latest stable for Lambda
        runtime: lambda.Runtime.NODEJS_20_X,
        // CPU architecture — X86_64 allows esbuild to bundle locally without Docker
        architecture: lambda.Architecture.X86_64,
        // Full file path to the handler — resolves relative to lib/ directory
        entry: path.join(__dirname, '..', entry),
        // Name of the exported function in the handler file that Lambda invokes
        handler: 'handler',
        // Max execution time — prevents infinite loops; 30s is enough for API requests
        timeout: cdk.Duration.seconds(30),
        // Memory allocated to the Lambda — more memory = faster CPU; 256 MB is sufficient for APIs
        memorySize: 256,
        // Environment variables injected into the Lambda execution environment
        // Combines shared vars with any function-specific extras
        environment: { ...sharedEnv, ...extraEnv },
        bundling: {
          // Remove unused code and whitespace — reduces bundle size and cold start time
          minify: true,
          // Don't generate .map files — saves space; not needed for Lambda debugging in CloudWatch
          sourceMap: false,
          // Target ECMAScript version — es2020 is compatible with Node.js 20
          target: 'es2020',
          // Exclude AWS SDK from bundle — it's pre-installed in Lambda runtime, saving ~20 MB
          externalModules: ['@aws-sdk/*'],
        },
        // Create a dedicated CloudWatch log group for this Lambda's output
        logGroup: new logs.LogGroup(this, `${name}LogGroup`, {
          // CloudWatch log group path — AWS convention for Lambda logs
          logGroupName: `/aws/lambda/BuildTrack-${name}`,
          // How long to keep logs — 30 days balances cost vs. retention for debugging
          retention: logs.RetentionDays.ONE_MONTH,
          // Delete log group when the stack is destroyed — keeps AWS account clean in dev
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      });


    // Authentication service — handles user login, signup, token validation
    const authFn = makeLambda('AuthFn', 'services/auth-service/src/index.ts');
    // Projects service — CRUD operations for construction projects
    const projectsFn = makeLambda('ProjectsFn', 'services/projects-service/src/index.ts');
    // Workers service — manages project team members and roles
    const workersFn = makeLambda('WorkersFn', 'services/workers-service/src/index.ts');
    // Materials service — tracks material inventory and purchase orders
    const materialsFn = makeLambda('MaterialsFn', 'services/materials-service/src/index.ts');
    // Progress service — captures and stores site photos, updates on project milestones
    const progressFn = makeLambda('ProgressFn', 'services/progress-service/src/index.ts');
    // Dashboard service — aggregates data for real-time project status view (read-only)
    const dashboardFn = makeLambda('DashboardFn', 'services/dashboard-service/src/index.ts');


    // ── DynamoDB grants ──
    // Grants read+write access to the DynamoDB table
    // Each service needs to query/insert/update its domain data
    this.table.grantReadWriteData(projectsFn);   // Projects service queries and updates project records
    this.table.grantReadWriteData(workersFn);    // Workers service manages team member assignments
    this.table.grantReadWriteData(materialsFn);  // Materials service tracks inventory changes
    this.table.grantReadWriteData(progressFn);   // Progress service appends site photos and status updates
    // Dashboard only reads aggregated project data — no write permission needed
    this.table.grantReadData(dashboardFn);

    // ── S3 grants ──
    // grantPut = allows uploading new files; grantRead = allows downloading files
    bucket.grantPut(materialsFn);             // Upload purchase order receipts/images
    bucket.grantPut(projectsFn);              // Upload blueprint PDFs to S3
    bucket.grantPut(progressFn);              // Upload site photos to S3
    // Read access allows Lambda to generate presigned URLs and return file metadata
    bucket.grantRead(projectsFn);             // Read blueprint URLs for project details
    bucket.grantRead(materialsFn);            // Read receipt URLs for material records
    bucket.grantRead(progressFn);             // Read photo URLs for progress updates
    bucket.grantRead(dashboardFn);            // Read all URLs for dashboard display
    bucket.grantDelete(projectsFn);           // Delete project documents (blueprints, permits) the admin removes

    // ── Cognito grant — auth service needs permission to call Cognito API ──
    // CDK doesn't have a grantInitiateAuth() shortcut, so we add a custom IAM statement
    authFn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      // Actions — the specific AWS API calls the auth Lambda is allowed to make
      actions: [
        'cognito-idp:InitiateAuth',   // Called during login to authenticate user credentials
        'cognito-idp:GlobalSignOut'   // Called during logout to invalidate all user sessions
      ],
      // Resources — which Cognito user pool can be targeted (restrict to only this pool)
      resources: [userPool.userPoolArn],
    }));


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
        stageName: 'v1',
        // throttlingBurstLimit: 50 — allows up to 50 simultaneous requests before rate limiting kicks in (handles traffic spikes)
        throttlingBurstLimit: 50,
        // throttlingRateLimit: 100 — allows 100 requests per second sustained (prevents abuse)
        throttlingRateLimit: 100,
        // metricsEnabled: true — enables CloudWatch metrics so you can monitor API Gateway performance (invocation count, latency, errors)
        metricsEnabled: true,
        // loggingLevel requires a CloudWatch IAM role set at account level in API Gateway
        // settings — will be enabled in Step 27 (CloudWatch & Monitoring)
      },
    });

    // Cognito Authorizer — validates JWT on every protected route
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      // cognitoUserPools — array of Cognito User Pools to validate tokens against (must match the User Pool that signed the JWT)
      cognitoUserPools: [userPool],
      // authorizerName — display name for this authorizer in the AWS Console and CloudFormation
      authorizerName: 'buildtrack-cognito-auth',
      // identitySource — tells API Gateway where to find the JWT token in the request (the Authorization header)
      identitySource: 'method.request.header.Authorization',
      // resultsCacheTtl: 5 minutes — caches the auth decision so the same token doesn't re-validate on every request (improves performance, reduces Cognito calls)
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

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
    addProtectedRoute('projects', projectsFn);   // route for project CRUD operations
    addProtectedRoute('workers', workersFn);    // route for worker management
    addProtectedRoute('materials', materialsFn);  // route for material tracking
    addProtectedRoute('progress', progressFn);   // route for progress updates
    addProtectedRoute('dashboard', dashboardFn);  // route for dashboard data/analytics


    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      // value: api.url — exports the full base URL of the API (e.g., https://xxx.execute-api.region.amazonaws.com/v1) so clients can use it
      value: api.url,
      // description — visible in the CloudFormation Outputs tab; helps you understand what this value is for
      description: 'API Gateway base URL',
    });


  }






}