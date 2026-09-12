import { Hono } from 'hono';
import { getVerifier } from '../lib/jwt';
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

    console.log('meRoute: payload', payload);

    const authContext: AuthContext = {
      userId: payload.sub,
      email: (payload.username as string) ?? (payload.email as string) ?? '',
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
    };

    return ok(c, authContext);
  } catch {
    return fail(c, 'Invalid or expired token', 401);
  }
});
