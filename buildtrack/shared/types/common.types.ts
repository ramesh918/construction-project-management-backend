export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  count: number;
  lastEvaluatedKey?: string;
}

export type UserRole = 'admin' | 'user';

export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  isAdmin: boolean;
}