import { Hono } from 'hono';
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient, cognitoConfig } from '../lib/cognito';
import { loginSchema } from '../schemas/auth.schema';
import { ok, fail } from '../lib/response';
import type { AuthTokens } from '../../../../shared/types';

export const loginRoute = new Hono();

loginRoute.post('/', async c => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'email and password (min 8 chars) are required', 400);
  }

  const { email, password } = parsed.data;

  try {
    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: cognitoConfig.clientId(),
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }));

    if (result.ChallengeName) {
      // e.g. NEW_PASSWORD_REQUIRED for an admin-created user's first login.
      // Handling the challenge flow is out of scope for this step — surfaced as a 401 for now.
      return fail(c, `Login requires additional step: ${result.ChallengeName}`, 401);
    }

    const auth = result.AuthenticationResult;
    if (!auth?.AccessToken || !auth.IdToken || !auth.RefreshToken) {
      return fail(c, 'Cognito did not return tokens', 500);
    }

    const tokens: AuthTokens = {
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      refreshToken: auth.RefreshToken,
      expiresIn: auth.ExpiresIn ?? 3600,
    };

    return ok(c, tokens, 'Login successful');
  } catch (err: any) {
    if (err.name === 'NotAuthorizedException') {
      return fail(c, 'Incorrect email or password', 401);
    }
    if (err.name === 'UserNotFoundException') {
      return fail(c, 'Incorrect email or password', 401); // same message — don't leak which part is wrong
    }
    throw err; // handled by the global error handler added in Step 10
  }
});