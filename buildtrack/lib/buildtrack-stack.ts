import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
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
  }
}