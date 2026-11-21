import type { Context, Next } from 'hono';
import type { AppBindings } from './lambda-context';
import { fail } from './response';

export async function requireAdmin(c: Context<AppBindings>, next: Next): Promise<Response | void> {
  const authorizerContext = c.env?.event?.requestContext?.authorizer;
  const raw = authorizerContext?.groups ?? '';

  // authorizer.ts (the Lambda authorizer) sets `groups` as a plain comma-separated
  // string in its returned context — API Gateway authorizer context values must be
  // flat strings, so this is set deliberately rather than inherited from any native
  // Cognito authorizer serialization quirk.
  const groups = raw
    .split(',')
    .map(g => g.trim())
    .filter(Boolean);

  if (!groups.includes('admin')) {
    return fail(c, 'Admin access required', 403);
  }

  await next();
}
