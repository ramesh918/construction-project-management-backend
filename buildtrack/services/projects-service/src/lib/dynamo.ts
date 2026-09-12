import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const dynamoConfig = {
  tableName: () => requireEnv('TABLE_NAME'),
};

// Region is inferred automatically from the Lambda execution environment (AWS_REGION)
export const dynamoClient = new DynamoDBClient({});

export const projectKey = (id: string) => ({ PK: `PROJECT#${id}`, SK: 'PROFILE' });
export const costSummaryKey = (id: string) => ({ PK: `PROJECT#${id}`, SK: 'COST#SUMMARY' });
