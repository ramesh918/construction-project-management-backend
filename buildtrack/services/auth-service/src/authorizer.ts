import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { cognitoConfig } from './lib/cognito';

interface TokenAuthorizerEvent {
  authorizationToken?: string;
  methodArn: string;
}

interface AuthorizerResult {
  principalId: string;
  policyDocument: {
    Version: '2012-10-17';
    Statement: Array<{ Action: 'execute-api:Invoke'; Effect: 'Allow'; Resource: string }>;
  };
  context: {
    sub: string;
    email: string;
    groups: string; // comma-separated — API Gateway authorizer context values must be flat strings
  };
}

let accessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
let idVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getAccessVerifier() {
  if (!accessVerifier) {
    accessVerifier = CognitoJwtVerifier.create({
      userPoolId: cognitoConfig.userPoolId(),
      tokenUse: 'access',
      clientId: cognitoConfig.clientId(),
    });
  }
  return accessVerifier;
}

function getIdVerifier() {
  if (!idVerifier) {
    idVerifier = CognitoJwtVerifier.create({
      userPoolId: cognitoConfig.userPoolId(),
      tokenUse: 'id',
      clientId: cognitoConfig.clientId(),
    });
  }
  return idVerifier;
}

// Clients conventionally send "Authorization: Bearer <token>" — strip the scheme
// if present so both "Bearer <token>" and a bare token are accepted.
function extractToken(header: string): string {
  return header.replace(/^Bearer\s+/i, '').trim();
}

// Cache the auth decision across every method/resource under this API + stage
// (not just the one that was actually called) so API Gateway's authorizer
// cache (keyed on the token) doesn't deny a different route with the same token.
function wildcardResource(methodArn: string): string {
  const parts = methodArn.split(':');
  const [apiId, stage] = parts[5].split('/');
  return `${parts.slice(0, 5).join(':')}:${apiId}/${stage}/*/*`;
}

export async function handler(event: TokenAuthorizerEvent): Promise<AuthorizerResult> {
  const header = event.authorizationToken;
  if (!header) {
    throw new Error('Unauthorized');
  }

  const token = extractToken(header);

  // Accept either an access token or an ID token — whichever the client sends.
  const payload = await getAccessVerifier()
    .verify(token)
    .catch(() => getIdVerifier().verify(token))
    .catch(() => {
      throw new Error('Unauthorized');
    });

  const groupsClaim = payload['cognito:groups'];
  const groups = Array.isArray(groupsClaim) ? groupsClaim.join(',') : '';

  return {
    principalId: payload.sub,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        { Action: 'execute-api:Invoke', Effect: 'Allow', Resource: wildcardResource(event.methodArn) },
      ],
    },
    context: {
      sub: payload.sub,
      email: (payload.email as string | undefined) ?? '',
      groups,
    },
  };
}
