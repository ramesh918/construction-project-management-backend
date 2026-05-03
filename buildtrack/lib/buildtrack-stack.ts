import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

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
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },  // 35-day backup window
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
    // ────────────────────────────────────────────────
    // Cognito User Pool — authentication
    // Admin creates users (no self sign-up)
    // Two groups: admin, user
    // ────────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'BuildTrackUserPool', {
      userPoolName: 'buildtrack-users',
      selfSignUpEnabled: false,          // only admin creates accounts
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'BuildTrackClient', {
      userPool,
      userPoolClientName: 'buildtrack-app-client',
      authFlows: {
        userPassword: true,   // USER_PASSWORD_AUTH — login with email + password
        userSrp: true,   // USER_SRP_AUTH — more secure, use in mobile apps
        adminUserPassword: true,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      generateSecret: false,   // false for browser/mobile clients
    });

    // User Groups
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: 'Full access — manage all resources',
      precedence: 1,          // lower number = higher priority
    });

    new cognito.CfnUserPoolGroup(this, 'UserGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'user',
      description: 'Field access — update progress and attendance only',
      precedence: 2,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
    });

    // ────────────────────────────────────────────────
    // Shared environment — passed to every Lambda

    const sharedEnv = {
      TABLE_NAME: this.table.tableName,
      BUCKET_NAME: bucket.bucketName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT: userPoolClient.userPoolClientId,
      NODE_ENV: 'production',
    };


    const makeLambda = (
      name: string,
      entry: string,
      extraEnv?: Record<string, string>,
    ): NodejsFunction =>
      new NodejsFunction(this, name, {
        functionName: `BuildTrack-${name}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.X86_64,    // no Docker needed for local bundling
        entry: path.join(__dirname, '..', entry),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: { ...sharedEnv, ...extraEnv },
        bundling: {
          minify: true,
          sourceMap: false,
          target: 'es2020',
          // Do not bundle AWS SDK — provided by the Lambda runtime
          externalModules: ['@aws-sdk/*'],
        },
        logGroup: new logs.LogGroup(this, `${name}LogGroup`, {
          logGroupName: `/aws/lambda/BuildTrack-${name}`,
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      });

    const authFn = makeLambda('AuthFn', 'services/auth-service/src/index.ts');
    const projectsFn = makeLambda('ProjectsFn', 'services/projects-service/src/index.ts');
    const workersFn = makeLambda('WorkersFn', 'services/workers-service/src/index.ts');
    const materialsFn = makeLambda('MaterialsFn', 'services/materials-service/src/index.ts');
    const progressFn = makeLambda('ProgressFn', 'services/progress-service/src/index.ts');
    const dashboardFn = makeLambda('DashboardFn', 'services/dashboard-service/src/index.ts');

    // ── DynamoDB grants ──
    this.table.grantReadWriteData(projectsFn);
    this.table.grantReadWriteData(workersFn);
    this.table.grantReadWriteData(materialsFn);
    this.table.grantReadWriteData(progressFn);
    this.table.grantReadData(dashboardFn);          // dashboard = read only

    // ── S3 grants ──
    bucket.grantPut(projectsFn);              // upload blueprints
    bucket.grantPut(materialsFn);             // upload purchase bills
    bucket.grantPut(progressFn);              // upload site photos
    bucket.grantRead(projectsFn);             // read presigned GET URLs
    bucket.grantRead(materialsFn);
    bucket.grantRead(progressFn);
    bucket.grantRead(dashboardFn);

    // ── Cognito grant — auth service needs to call InitiateAuth ──
    authFn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cognito-idp:InitiateAuth', 'cognito-idp:GlobalSignOut'],
      resources: [userPool.userPoolArn],
    }));



    // ────────────────────────────────────────────────
    // API Gateway REST API
    // ────────────────────────────────────────────────
    const api = new apigateway.RestApi(this, 'BuildTrackApi', {
      restApiName: 'buildtrack-api',
      description: 'BuildTrack Construction Management API',

      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
        ],
      },

      deployOptions: {
        stageName:            'v1',
        throttlingBurstLimit: 50,   // max concurrent requests
        throttlingRateLimit:  100,  // requests per second
        metricsEnabled:       true,
        // loggingLevel requires a CloudWatch IAM role set at the account level in
        // API Gateway settings — skip for now, enable in Step 27 (CloudWatch & Monitoring)
      },
    });

    // Cognito Authorizer — validates JWT on every protected route
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'buildtrack-cognito-auth',
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: cdk.Duration.minutes(5), // cache auth results for 5 min
    });


    // Helper — attach a Lambda to an API path with Cognito auth
    const addProtectedRoute = (routePath: string, fn: lambda.IFunction) => {
      const resource = api.root.addResource(routePath);
      const integration = new apigateway.LambdaIntegration(fn, {
        allowTestInvoke: false,
      });
      resource.addProxy({
        defaultIntegration: integration,
        defaultMethodOptions: {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        },
        anyMethod: true,
      });
    };

    // /auth — NO authorizer (this is the login endpoint)
    const authResource = api.root.addResource('auth');
    authResource.addProxy({
      defaultIntegration: new apigateway.LambdaIntegration(authFn),
      anyMethod: true,
    });

    // Protected routes — all require a valid JWT in the Authorization header
    addProtectedRoute('projects', projectsFn);
    addProtectedRoute('workers', workersFn);
    addProtectedRoute('materials', materialsFn);
    addProtectedRoute('progress', progressFn);
    addProtectedRoute('dashboard', dashboardFn);



    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway base URL',
    });


  }
}