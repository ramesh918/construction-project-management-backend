import { Hono } from 'hono';
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient, cognitoConfig } from '../lib/cognito';
import { refreshSchema } from '../schemas/auth.schema';
import { ok, fail } from '../lib/response';
import type { RefreshResult } from '../../../../shared/types';

export const refreshRoute = new Hono();

refreshRoute.post('/', async c => {
  const parsed = refreshSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'refreshToken is required', 400);
  }

  try {
    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: cognitoConfig.clientId(),
      AuthParameters: {
        REFRESH_TOKEN: parsed.data.refreshToken,
      },
    }));

    const auth = result.AuthenticationResult;
    if (!auth?.AccessToken || !auth.IdToken) {
      return fail(c, 'Cognito did not return tokens', 500);
    }

    const tokens: RefreshResult = {
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      expiresIn: auth.ExpiresIn ?? 3600,
    };

    return ok(c, tokens, 'Token refreshed');
  } catch (err: any) {
    if (err.name === 'NotAuthorizedException') {
      return fail(c, 'Refresh token is invalid or expired — please log in again', 401);
    }
    throw err; // handled by the global error handler added in Step 10
  }
});