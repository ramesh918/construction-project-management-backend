import { serve } from '@hono/node-server';
import app from './index';
import type { LambdaProxyEvent } from './lib/lambda-context';

const port = Number(process.env.PORT ?? 4001);

// DEV ONLY — there's no API Gateway locally to decode the Cognito access token and
// forward its claims via event.requestContext.authorizer.claims (what requireAdmin
// reads in Lambda). This decodes the JWT payload straight from the Authorization
// header — no signature verification, since this code path never runs in Lambda —
// purely so `requireAdmin` sees the same shape locally that it would in production.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payloadSegment = token.split('.')[1];
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function buildFakeEvent(req: Request): LambdaProxyEvent {
  const header = req.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const payload = token ? decodeJwtPayload(token) : null;

  if (!payload) {
    return { requestContext: {} };
  }

  const groups = payload['cognito:groups'];
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: (payload.sub as string) ?? '',
          email: payload.email as string | undefined,
          'cognito:groups': Array.isArray(groups) ? groups.join(',') : (groups as string | undefined),
        },
      },
    },
  };
}

serve(
  {
    fetch: (req: Request) => app.fetch(req, { event: buildFakeEvent(req) }),
    port,
  },
  info => {
    console.log(`projects-service listening on http://localhost:${info.port}`);
  },
);
