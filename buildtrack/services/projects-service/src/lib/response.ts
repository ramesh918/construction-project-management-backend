import type { Context } from 'hono';
import type { ApiResponse } from '../../../../shared/types';

// API Gateway's CORS preflight config only covers the auto-generated OPTIONS
// mock integration — it never touches the actual Lambda proxy response. Every
// real response has to set this header itself, or the browser blocks the
// frontend from reading it (even on a 200). Set explicitly here, on every
// response, rather than relying on cors() middleware matching an origin.
export function withCors(c: Context): void {
  c.header('Access-Control-Allow-Origin', '*');
}

// 200-range success response wrapped in the shared ApiResponse envelope
export function ok<T>(c: Context, data: T, message?: string, status: 200 | 201 = 200): Response {
  withCors(c);
  const body: ApiResponse<T> = { success: true, data, message };
  return c.json(body, status);
}

// Error response wrapped in the shared ApiResponse envelope
export function fail(
  c: Context,
  error: string,
  status: 400 | 401 | 403 | 404 | 500 = 400,
): Response {
  withCors(c);
  const body: ApiResponse<never> = { success: false, error };
  return c.json(body, status);
}
