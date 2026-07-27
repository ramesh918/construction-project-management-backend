import * as cdk        from 'aws-cdk-lib';
import * as dynamodb   from 'aws-cdk-lib/aws-dynamodb';
import { Construct }   from 'constructs';

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
      tableName:           'buildtrack',
      partitionKey:        { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey:             { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode:         dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:       cdk.RemovalPolicy.RETAIN,   // never delete data on stack destroy
      pointInTimeRecovery: true,                        // 35-day backup window
      encryption:          dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI1 — query by project (e.g. all attendance for PROJECT#PRJ001)
    this.table.addGlobalSecondaryIndex({
      indexName:      'GSI1',
      partitionKey:   { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey:        { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2 — query by date (e.g. all progress logs on 2024-01-15)
    this.table.addGlobalSecondaryIndex({
      indexName:      'GSI2',
      partitionKey:   { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey:        { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output the table name for reference
    new cdk.CfnOutput(this, 'TableName', {
      value:       this.table.tableName,
      description: 'DynamoDB table name',
    });
  }
}