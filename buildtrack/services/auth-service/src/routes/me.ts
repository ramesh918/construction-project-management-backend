import { Hono } from 'hono';
import { GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { getVerifier } from '../lib/jwt';
import { cognitoClient } from '../lib/cognito';
import { ok, fail } from '../lib/response';
import type { AuthContext } from '../../../../shared/types';

export const meRoute = new Hono();

meRoute.get('/', async c => {
  const header = c.req.header('Authorization');
  const accessToken = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!accessToken) {
    return fail(c, 'Authorization: Bearer <accessToken> header is required', 401);
  }

  try {
    const payload = await getVerifier().verify(accessToken);
    const groups = (payload['cognito:groups'] as string[] | undefined) ?? [];
    const isAdmin = groups.includes('admin');

    // Access tokens don't carry the `email` claim (only ID tokens do), and
    // `payload.username` is the auto-generated Cognito sub — not the email —
    // since the user pool signs users in by email alias. Look the email up
    // from Cognito directly instead.
    const user = await cognitoClient.send(new GetUserCommand({ AccessToken: accessToken }));
    const email = user.UserAttributes?.find(attr => attr.Name === 'email')?.Value ?? '';

    const authContext: AuthContext = {
      userId: payload.sub,
      email,
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
    };

    return ok(c, authContext);
  } catch {
    return fail(c, 'Invalid or expired token', 401);
  }
});
