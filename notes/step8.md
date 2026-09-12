# Step 8 — CDK Stack: DynamoDB

---

## What You Are Doing

You will replace the empty `lib/buildtrack-stack.ts` with the DynamoDB table definition.
This creates a **single-table design** — one DynamoDB table for all entities in the app.

---

## 8.1 Update lib/buildtrack-stack.ts

Open `lib/buildtrack-stack.ts` and **replace all content** with:

```typescript
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
```

---

## 8.2 Verify It Compiles

Run in terminal (from the `buildtrack/` root):

```bash
cdk synth
```

Expected: CloudFormation template prints with no errors and includes the DynamoDB table definition.

---

## Key Concepts (For Reference)

| Concept | What It Means |
|---------|--------------|
| Single-table design | All entities (projects, workers, materials) in ONE table |
| PK / SK | Partition key / Sort key — how DynamoDB organises data |
| PAY_PER_REQUEST | No provisioned capacity — you only pay per read/write |
| GSI1 | Global Secondary Index — query all records for a project |
| GSI2 | Global Secondary Index — query all records for a date |
| RETAIN | Table is NOT deleted if you run `cdk destroy` — data is safe |
| pointInTimeRecovery | AWS keeps 35 days of backups automatically |

---

## Checkpoints Before Moving to Step 9

- [ ] `lib/buildtrack-stack.ts` updated with DynamoDB code
- [ ] `cdk synth` runs with no errors
- [ ] Output includes `TableName` in the CloudFormation template
