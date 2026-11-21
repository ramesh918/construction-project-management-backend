import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings } from './lib/lambda-context';
import { requireAdmin } from './lib/admin';
import { projectsRoute } from './routes/projects';
import { costSummaryRoute } from './routes/cost-summary';
import { documentsRoute } from './routes/documents';
import { AppError } from './lib/errors';
import { fail } from './lib/response';

const app: Hono<AppBindings> = new Hono<AppBindings>().basePath('/projects');

// CORS is handled per-response in lib/response.ts's ok()/fail() helpers
// (every route goes through one of those, including requireAdmin's 401/403
// via fail()). /health is the one route that doesn't, since it responds
// directly with c.json() — set it here too.
app.get('/health', c => {
  c.header('Access-Control-Allow-Origin', '*');
  return c.json({ status: 'ok' });
});

app.use('*', requireAdmin);

app.route('/', projectsRoute);
app.route('/', costSummaryRoute);
app.route('/', documentsRoute);

app.notFound(c => fail(c, 'Not found', 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return fail(c, err.message, err.status);
  }
  console.error('Unhandled projects-service error:', err);
  return fail(c, 'Internal server error', 500);
});

export const handler = handle(app);
export default app;
