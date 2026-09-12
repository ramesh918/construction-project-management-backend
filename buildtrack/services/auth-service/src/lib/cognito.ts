import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const cognitoConfig = {
  userPoolId: () => requireEnv('USER_POOL_ID'),
  clientId: () => requireEnv('USER_POOL_CLIENT'),
};

// Region is inferred automatically from the Lambda execution environment (AWS_REGION)
export const cognitoClient = new CognitoIdentityProviderClient({});