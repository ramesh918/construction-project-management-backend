import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { loginRoute } from './routes/login';
import { refreshRoute } from './routes/refresh';
import { logoutRoute } from './routes/logout';
import { meRoute } from './routes/me';
import { AppError } from './lib/errors';
import { fail } from './lib/response';

const app = new Hono().basePath('/auth');

// CORS is handled per-response in lib/response.ts's ok()/fail() helpers
// (every route goes through one of those). /health is the one route that
// doesn't, since it responds directly with c.json() — set it here too.
app.get('/health', c => {
  c.header('Access-Control-Allow-Origin', '*');
  return c.json({ status: 'ok' });
});
app.route('/login', loginRoute);
app.route('/refresh', refreshRoute);
app.route('/logout', logoutRoute);
app.route('/me', meRoute);

app.notFound(c => fail(c, 'Not found', 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return fail(c, err.message, err.status);
  }
  console.error('Unhandled auth-service error:', err);
  return fail(c, 'Internal server error', 500);
});

export const handler = handle(app);
export default app;
