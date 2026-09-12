import type { Context } from 'hono';
import type { ApiResponse } from '../../../../shared/types';

// 200-range success response wrapped in the shared ApiResponse envelope
export function ok<T>(c: Context, data: T, message?: string, status: 200 | 201 = 200) {
  const body: ApiResponse<T> = { success: true, data, message };
  return c.json(body, status);
}

// Error response wrapped in the shared ApiResponse envelope
export function fail(c: Context, error: string, status: 400 | 401 | 404 | 500 = 400) {
  const body: ApiResponse<never> = { success: false, error };
  return c.json(body, status);
}