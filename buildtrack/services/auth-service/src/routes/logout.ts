import { Hono } from 'hono';
import { GlobalSignOutCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../lib/cognito';
import { ok, fail } from '../lib/response';

export const logoutRoute = new Hono();

logoutRoute.post('/', async c => {
  const header = c.req.header('Authorization');
  const accessToken = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!accessToken) {
    return fail(c, 'Authorization: Bearer <accessToken> header is required', 401);
  }

  try {
    await cognitoClient.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    return ok(c, null, 'Logged out');
  } catch (err: any) {
    if (err.name === 'NotAuthorizedException') {
      // Access token already expired/invalid — treat as already logged out
      return ok(c, null, 'Logged out');
    }
    throw err; // handled by the global error handler added in Step 10
  }
});
