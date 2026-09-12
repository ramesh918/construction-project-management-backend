import type { Context, Next } from 'hono';
import type { AppBindings } from './lambda-context';
import { fail } from './response';

export async function requireAdmin(c: Context<AppBindings>, next: Next): Promise<Response | void> {
  const claims = c.env?.event?.requestContext?.authorizer?.claims;
  const groups = claims?.['cognito:groups']?.split(',') ?? [];

  if (!groups.includes('admin')) {
    return fail(c, 'Admin access required', 403);
  }

  await next();
}
