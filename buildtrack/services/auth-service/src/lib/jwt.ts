import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { cognitoConfig } from './cognito';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

// Lazily created so cognitoConfig's env var check only runs when /auth/me is actually called
export function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: cognitoConfig.userPoolId(),
      tokenUse: 'access',
      clientId: cognitoConfig.clientId(),
    });
  }
  return verifier;
}
